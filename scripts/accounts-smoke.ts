import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { createClient } from '@libsql/client';
import { compare, hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';

process.env.TURSO_DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'hs-accounts-')), 'test.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.SLACK_WEBHOOK_URL = '';
const migrationClient = createClient({ url: process.env.TURSO_DATABASE_URL });
for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) {
  for (const sql of readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').filter(s => s.trim())) await migrationClient.execute(sql);
}
const { db, client } = await import('../src/lib/server/db');
const { users, sessions, roomSettings, roomMemberships } = await import('../src/lib/server/schema');
const { registerAccount, changePassword } = await import('../src/lib/server/accounts');
const { authenticate, setSession, getSessionContext, clearSession } = await import('../src/lib/server/auth');
const { validPassword } = await import('../src/lib/password');
const password = 'Roommates!123';
for (const weak of ['1234', 'alllowercase123!', 'ALLUPPER123!', 'NoNumbers!!', 'NoSymbols123', 'Has space123!', 'A1!' + 'é'.repeat(40)]) assert.equal(validPassword(weak), false);
assert.equal(validPassword(password), true);
const create = (username: string, name = 'Ali', chosen = password) => registerAccount({ name, username, password: chosen, avatarBase64: null });
await assert.rejects(create('weak_user', 'Ali', '1234'));
const first = await create('FIRST_USER');
const second = await create('second_user');
await assert.rejects(create('first_USER'));
const stored = (await db.select().from(users).where(eq(users.id, first)))[0];
assert.equal(stored.username, 'first_user');
assert.ok(stored.passwordHash?.startsWith('$2'));
assert.notEqual(stored.passwordHash, password);
assert.equal(await compare(password, stored.passwordHash!), true);
assert.equal(stored.pinHash, null);
assert.equal((await authenticate('', password, 'FIRST_USER')).user?.id, first);
assert.equal((await authenticate('Ali', password)).user, null, 'Duplicate names must require a username');
assert.equal((await authenticate('', 'wrong', 'first_user')).user, null);

function cookieJar(initial?: string) {
  let value = initial;
  let options: Record<string, unknown> = {};
  return {
    cookies: { get: () => value, set: (_name: string, token: string, opts: Record<string, unknown>) => { value = token; options = opts; }, delete: () => { value = undefined; } } as unknown as Cookies,
    token: () => value!, options: () => options
  };
}
const device = cookieJar();
await setSession(device.cookies, first);
assert.equal((await getSessionContext(device.cookies))?.roomId, null, 'Profiles must work before any room exists');
assert.equal(device.options().httpOnly, true);
assert.ok(Number(device.options().maxAge) > 30 * 86400);
const originalToken = device.token();
const session = (await db.select().from(sessions))[0];
assert.equal(session.tokenHash, createHash('sha256').update(originalToken).digest('hex'));
assert.notEqual(session.tokenHash, originalToken);
assert.equal((await getSessionContext(cookieJar(originalToken).cookies))?.user.id, first, 'Returning browser lost login');
await clearSession(device.cookies);
assert.equal(await getSessionContext(cookieJar(originalToken).cookies), null, 'Signed-out token replayed');

await db.insert(roomSettings).values({ id: 'default', ownerId: first, name: 'First room', pinHash: await hash('1234', 4), sessionSecret: 'legacy-test-secret', createdAt: Date.now() });
await db.insert(roomMemberships).values({ id: 'first-membership', roomId: 'default', userId: first, status: 'approved', createdAt: Date.now() });
await setSession(device.cookies, first, 'default');
assert.equal((await getSessionContext(device.cookies))?.roomId, 'default');
await assert.rejects(setSession(cookieJar().cookies, second, 'default'), /not a member/);
await clearSession(device.cookies);
await setSession(device.cookies, first);
assert.equal((await getSessionContext(device.cookies))?.roomId, 'default', 'Sign-in forgot preferred room');
const otherDevice = cookieJar();
await setSession(otherDevice.cookies, first);
await assert.rejects(changePassword(first, 'wrong', 'NewPassword!234'));
await changePassword(first, password, 'NewPassword!234');
assert.equal(await getSessionContext(device.cookies), null);
assert.equal(await getSessionContext(otherDevice.cookies), null);
assert.equal((await authenticate('', password, 'first_user')).user, null);
assert.equal((await authenticate('', 'NewPassword!234', 'first_user')).user?.id, first);

await db.insert(users).values({ id: 'legacy', name: 'Sara', username: 'sara', pinHash: await hash('1234', 4), createdAt: Date.now() });
await db.insert(roomMemberships).values({ id: 'legacy-membership', roomId: 'default', userId: 'legacy', status: 'approved', createdAt: Date.now() });
const payload = Buffer.from(JSON.stringify({ userId: 'legacy', roomId: 'default', expires: Date.now() + 86400000 })).toString('base64url');
const oldCookie = `${payload}.${createHmac('sha256', 'legacy-test-secret').update(payload).digest('base64url')}`;
assert.equal(await getSessionContext(cookieJar(`${payload}.${'é'.repeat(43)}`).cookies), null, 'Malformed MAC must not crash');
assert.equal((await authenticate('', '1234', 'sara')).user?.id, 'legacy');
assert.equal((await getSessionContext(cookieJar(oldCookie).cookies))?.user.id, 'legacy', 'Existing cookie not migrated');
await changePassword('legacy', '', password);
assert.equal((await authenticate('', '1234', 'sara')).user, null, 'Old PIN still accepted');
assert.equal(await getSessionContext(cookieJar(oldCookie).cookies), null, 'Legacy cookie bypassed password change');
assert.equal((await db.select().from(users).where(eq(users.id, 'legacy')))[0].pinHash, null);
await setSession(device.cookies, 'legacy');
await db.update(sessions).set({ expiresAt: Date.now() - 1 }).where(eq(sessions.tokenHash, createHash('sha256').update(device.token()).digest('hex')));
assert.equal(await getSessionContext(device.cookies), null, 'Expired session accepted');
console.log('Account smoke passed: validation, hashing, unique identities, room-independent profiles, saved sessions, logout, password changes and legacy migration.');
client.close();
migrationClient.close();
