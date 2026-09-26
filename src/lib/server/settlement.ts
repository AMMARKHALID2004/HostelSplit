import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { botNotifications, settlements, users } from './schema';
import { getBalances } from './balances';
import { simplifyDebts } from './simplify';

export async function createSettlement(payerId: string, payeeId: string, amountPaisa: number, proofImageBase64: string | null) {
  if (payerId === payeeId || !Number.isSafeInteger(amountPaisa) || amountPaisa <= 0) throw new Error('Choose a valid payment');
  if (!proofImageBase64) throw new Error('Upload your transfer screenshot');
  const balances = await getBalances();
  const suggestion = simplifyDebts(new Map(balances.map((b) => [b.userId, b.amountPaisa]))).find((s) => s.from === payerId && s.to === payeeId);
  if (!suggestion || amountPaisa > suggestion.amountPaisa) throw new Error('Payment exceeds the current suggested amount');
  const pending = await db.select().from(settlements).where(and(eq(settlements.payerId, payerId), eq(settlements.payeeId, payeeId), eq(settlements.status, 'pending_confirmation')));
  if (amountPaisa + pending.reduce((sum, row) => sum + row.amountPaisa, 0) > suggestion.amountPaisa) throw new Error('You already have a payment awaiting confirmation for this debt');
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(settlements).values({ id, payerId, payeeId, amountPaisa, proofImageBase64, createdAt: Date.now() });
    const payer = balances.find((b) => b.userId === payerId);
    const payee = (await tx.select().from(users).where(eq(users.id, payeeId)).limit(1))[0];
    if (payee?.whatsappJid) await tx.insert(botNotifications).values({ id: crypto.randomUUID(), kind: 'settlement', entityId: id, recipientJid: payee.whatsappJid,
      message: `💸 ${payer?.name ?? 'A roommate'} uploaded payment proof for Rs. ${(amountPaisa / 100).toFixed(2)}. Open the app to confirm.`, createdAt: Date.now() });
  });
  return id;
}

export async function resolveSettlement(id: string, payeeId: string, confirm: boolean) {
  return db.transaction(async (tx) => {
    const row = (await tx.select().from(settlements).where(eq(settlements.id, id)).limit(1))[0];
    if (!row || row.payeeId !== payeeId) throw new Error('Only the recipient can review this payment');
    if (row.status !== 'pending_confirmation') throw new Error('This payment has already been reviewed');
    await tx.update(settlements).set({ status: confirm ? 'confirmed' : 'rejected', confirmedAt: confirm ? Date.now() : null }).where(and(eq(settlements.id, id), eq(settlements.status, 'pending_confirmation')));
    return confirm ? 'confirmed' : 'rejected';
  });
}

export async function getSettlementContext(userId: string) {
  const [rows, people] = await Promise.all([db.select({ id: settlements.id, payerId: settlements.payerId, payeeId: settlements.payeeId, amountPaisa: settlements.amountPaisa, status: settlements.status, createdAt: settlements.createdAt }).from(settlements), db.select().from(users)]);
  return {
    incoming: rows.filter((r) => r.payeeId === userId && r.status === 'pending_confirmation'),
    outgoing: rows.filter((r) => r.payerId === userId).sort((a, b) => b.createdAt - a.createdAt),
    people: people.map((p) => ({ id: p.id, name: p.name }))
  };
}
