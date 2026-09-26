import { createHash, randomInt } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from './db';
import { users, whatsappLinkCodes } from './schema';

const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');

export async function issueLinkCode(userId: string) {
  const code = String(randomInt(100000, 1000000));
  await db.insert(whatsappLinkCodes).values({ id: crypto.randomUUID(), userId, codeHash: hashCode(code), expiresAt: Date.now() + 10 * 60_000 });
  return code;
}

export async function redeemLinkCode(code: string, jid: string) {
  if (!/^\d{6}$/.test(code)) throw new Error('Invalid link code');
  return db.transaction(async (tx) => {
    const found = (await tx.select().from(whatsappLinkCodes).where(and(eq(whatsappLinkCodes.codeHash, hashCode(code)), gt(whatsappLinkCodes.expiresAt, Date.now()), isNull(whatsappLinkCodes.usedAt))).limit(1))[0];
    if (!found) throw new Error('Link code expired or already used');
    const taken = (await tx.select().from(users).where(eq(users.whatsappJid, jid)).limit(1))[0];
    if (taken && taken.id !== found.userId) throw new Error('This WhatsApp number is already linked');
    await tx.update(users).set({ whatsappJid: jid }).where(eq(users.id, found.userId));
    await tx.update(whatsappLinkCodes).set({ usedAt: Date.now() }).where(eq(whatsappLinkCodes.id, found.id));
    return (await tx.select().from(users).where(eq(users.id, found.userId)).limit(1))[0];
  });
}
