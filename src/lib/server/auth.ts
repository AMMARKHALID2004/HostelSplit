import { createHmac, timingSafeEqual } from 'node:crypto';
import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { roomSettings, users } from './schema';

const cookieName = 'hostelsplit_session';
const maxAge = 60 * 60 * 24 * 30;

export async function getRoomSettings() {
  return (await db.select().from(roomSettings).where(eq(roomSettings.id, 'default')).limit(1))[0] ?? null;
}

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export async function authenticate(name: string, pin: string) {
  const people = await db.select().from(users);
  const user = people.find((person) => person.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  if (!user) return { user: null, reason: 'name' as const };
  if (!user.pinHash || !(await compare(pin, user.pinHash))) return { user: null, reason: 'pin' as const };
  return { user, reason: null };
}

export async function setSession(cookies: import('@sveltejs/kit').Cookies, userId: string) {
  const settings = await getRoomSettings();
  if (!settings) throw new Error('Room setup is required');
  const payload = Buffer.from(JSON.stringify({ userId, expires: Date.now() + maxAge * 1000 })).toString('base64url');
  cookies.set(cookieName, `${payload}.${signature(payload, settings.sessionSecret)}`, {
    path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && process.env.HOSTELSPLIT_LAN !== '1', maxAge
  });
}

export function clearSession(cookies: import('@sveltejs/kit').Cookies) {
  cookies.delete(cookieName, { path: '/' });
}

export async function getSessionUser(cookies: import('@sveltejs/kit').Cookies) {
  const value = cookies.get(cookieName);
  if (!value) return null;
  const settings = await getRoomSettings();
  if (!settings) return null;
  const [payload, mac] = value.split('.');
  if (!payload || !mac) return null;
  const expected = signature(payload, settings.sessionSecret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { userId: string; expires: number };
    if (!parsed.userId || parsed.expires < Date.now()) return null;
    const found = await db.select().from(users).where(eq(users.id, parsed.userId)).limit(1);
    return found[0] ?? null;
  } catch {
    return null;
  }
}
