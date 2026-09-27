import { compare, hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from '../src/lib/server/db';
import { roomSettings, users } from '../src/lib/server/schema';

const names = process.argv.slice(2).map((name) => name.trim()).filter(Boolean);
const pin = process.env.ROOM_PIN;
if (!pin || pin.length < 4 || names.length < 2 || new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
  throw new Error('Set ROOM_PIN (at least 4 characters) and provide at least two unique roommate names.');
}
const pinHash = await hash(pin, 12);
const current = (await db.select().from(roomSettings))[0];
if (current && !(await compare(pin, current.pinHash))) throw new Error('ROOM_PIN does not match the existing room PIN.');
if (!current) await db.insert(roomSettings).values({ id: 'default', pinHash, sessionSecret: randomBytes(32).toString('hex'), createdAt: Date.now() });
for (const name of names) {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, name, username: `member_${id.slice(0, 8)}`, pinHash, createdAt: Date.now() });
  if (!current && name === names[0]) await db.update(roomSettings).set({ ownerId: id }).where(eq(roomSettings.id, 'default'));
}
console.log(`Added ${names.length} roommates.`);
