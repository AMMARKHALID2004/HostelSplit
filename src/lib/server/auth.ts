import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { membershipOf } from './rooms';
import { db } from './db';
import { roomSettings, roomMemberships, sessions, users } from './schema';
import type { Cookies } from '@sveltejs/kit';

const cookieName = 'hostelsplit_session';
const maxAge = 60 * 60 * 24 * 365;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const cookieOptions = () => ({ path: '/', httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production' && process.env.HOSTELSPLIT_LAN !== '1', maxAge });
export async function getRoomSettings(roomId = 'default') {
  return (await db.select().from(roomSettings).where(eq(roomSettings.id, roomId)).limit(1))[0] ?? null;
}
export const validUsername = (value: string) => /^[a-z0-9_]{3,24}$/.test(value);
export const validName = (value: string) => /^[\p{L}][\p{L} '\-]{1,39}$/u.test(value);
export async function authenticate(name: string, password: string, username = '') {
  const people = await db.select({ id: users.id, name: users.name, username: users.username, passwordHash: users.passwordHash, pinHash: users.pinHash }).from(users);
  const matches = username.trim() ? people.filter(p => p.username === username.trim().toLowerCase()) : people.filter(p => p.name.toLowerCase() === name.trim().toLowerCase());
  if (matches.length !== 1) return { user: null, reason: 'identity' as const };
  const user = matches[0];
  if (name.trim() && user.name.toLowerCase() !== name.trim().toLowerCase()) return { user: null, reason: 'identity' as const };
  const stored = user.passwordHash || user.pinHash;
  if (!stored || password.length > 200 || !(await compare(password, stored))) return { user: null, reason: 'password' as const };
  return { user, reason: null };
}
export async function preferredRoom(userId: string) {
  const user = (await db.select({ lastRoomId: users.lastRoomId }).from(users).where(eq(users.id, userId)))[0];
  const memberships = await db.select().from(roomMemberships).where(eq(roomMemberships.userId, userId));
  return memberships.find(m => m.roomId === user?.lastRoomId && m.status === 'approved')?.roomId
    ?? memberships.find(m => m.status === 'approved')?.roomId ?? memberships.find(m => m.status === 'pending')?.roomId ?? null;
}
export async function setSession(cookies: Cookies, userId: string, roomId?: string | null) {
  const selected = roomId === undefined ? await preferredRoom(userId) : roomId;
  if (selected && !(await membershipOf(userId, selected))) throw new Error('You are not a member of this room.');
  const token = randomBytes(32).toString('hex');
  const old = cookies.get(cookieName);
  await db.transaction(async tx => {
    if (old) await tx.update(sessions).set({ revokedAt: Date.now() }).where(eq(sessions.tokenHash, digest(old)));
    await tx.insert(sessions).values({ tokenHash: digest(token), userId, roomId: selected, expiresAt: Date.now() + maxAge * 1000, createdAt: Date.now() });
    if (selected) await tx.update(users).set({ lastRoomId: selected }).where(eq(users.id, userId));
  });
  cookies.set(cookieName, token, cookieOptions());
}
export async function clearSession(cookies: Cookies) {
  const token = cookies.get(cookieName);
  if (token) await db.update(sessions).set({ revokedAt: Date.now() }).where(eq(sessions.tokenHash, digest(token)));
  cookies.delete(cookieName, { path: '/' });
}
export async function revokeUserSessions(userId: string) {
  await db.update(sessions).set({ revokedAt: Date.now() }).where(eq(sessions.userId, userId));
}
// Convert already signed-in accounts from the previous signed-cookie format.
async function importLegacySession(token: string) {
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return;
  const settings = await getRoomSettings();
  if (!settings) return;
  const expected = createHmac('sha256', settings.sessionSecret).update(payload).digest('base64url');
  const actualBytes = Buffer.from(mac);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { userId: string; roomId?: string; expires: number };
    if (!parsed.userId || !Number.isFinite(parsed.expires) || parsed.expires < Date.now()) return;
    const user = (await db.select().from(users).where(eq(users.id, parsed.userId)))[0];
    if (!user || user.passwordHash) return;
    await db.insert(sessions).values({ tokenHash: digest(token), userId: user.id, roomId: parsed.roomId || 'default', expiresAt: Date.now() + maxAge * 1000, createdAt: Date.now() }).onConflictDoNothing();
  } catch { return; }
}
export async function getSessionContext(cookies: Cookies) {
  const token = cookies.get(cookieName);
  if (!token || token.length > 2048) return null;
  let session = (await db.select().from(sessions).where(eq(sessions.tokenHash, digest(token))))[0];
  if (!session && token.includes('.')) {
    await importLegacySession(token);
    session = (await db.select().from(sessions).where(eq(sessions.tokenHash, digest(token))))[0];
  }
  if (!session || session.revokedAt || session.expiresAt < Date.now()) return null;
  const user = (await db.select().from(users).where(eq(users.id, session.userId)))[0];
  if (!user) return null;
  const roomId = session.roomId;
  const membership = roomId ? await membershipOf(user.id, roomId) : null;
  if (session.expiresAt < Date.now() + (maxAge - 86400) * 1000 || token.includes('.')) {
    await db.update(sessions).set({ expiresAt: Date.now() + maxAge * 1000 }).where(eq(sessions.tokenHash, session.tokenHash));
    cookies.set(cookieName, token, cookieOptions());
  }
  return { user, roomId: membership ? roomId : null, membership };
}
