import { eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { botNotifications, expenses, expenseSplits, users } from './schema';

export const categories = ['chai', 'mess', 'delivery', 'groceries', 'bills', 'other'] as const;
export type Category = typeof categories[number];

export function splitAmount(amountPaisa: number, participantIds: string[]) {
  if (!Number.isSafeInteger(amountPaisa) || amountPaisa <= 0) throw new Error('Amount must be a positive number of paisa');
  const ids = [...new Set(participantIds)].sort();
  if (ids.length === 0 || ids.length !== participantIds.length) throw new Error('Choose unique participants');
  const base = Math.floor(amountPaisa / ids.length);
  const remainder = amountPaisa % ids.length;
  return ids.map((userId, index) => ({ userId, sharePaisa: base + (index < remainder ? 1 : 0) }));
}

export async function createExpense(input: {
  amountPaisa: number; category: Category; description?: string; paidBy: string;
  createdBy: string; source: 'pwa' | 'whatsapp'; participants: string[];
}) {
  if (!categories.includes(input.category)) throw new Error('Invalid category');
  if (input.description && input.description.length > 500) throw new Error('Description is too long');
  const splits = splitAmount(input.amountPaisa, input.participants);
  const needed = [...new Set([input.paidBy, input.createdBy, ...input.participants])];
  const existing = await db.select().from(users).where(inArray(users.id, needed));
  if (existing.length !== needed.length) throw new Error('Unknown roommate');
  const actor = existing.find((u) => u.id === input.createdBy)!;
  const payer = existing.find((u) => u.id === input.paidBy)!;
  if (actor.isLocked || payer.isLocked) throw new Error("You're locked until the room confirms your cold drink 🥤");
  const targeted = splits.length === 1 && splits[0].userId !== input.paidBy;
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  await db.transaction(async (tx) => {
    await tx.insert(expenses).values({
      id, amountPaisa: input.amountPaisa, category: input.category, description: input.description || null,
      paidBy: input.paidBy, createdBy: input.createdBy, source: input.source,
      status: targeted ? 'pending_approval' : 'active', isTargeted: targeted ? 1 : 0, createdAt
    });
    await tx.insert(expenseSplits).values(splits.map((split) => ({
      id: crypto.randomUUID(), expenseId: id, userId: split.userId,
      sharePaisa: split.sharePaisa, status: targeted ? 'pending' : 'confirmed'
    })));
    if (targeted) {
      const target = existing.find((u) => u.id === splits[0].userId)!;
      await tx.insert(botNotifications).values({ id: crypto.randomUUID(), kind: 'targeted', entityId: id, recipientJid: target.whatsappJid,
        message: `${payer.name} wants to charge ${target.name} Rs. ${(input.amountPaisa / 100).toFixed(2)} for ${input.category}. Reply /accept ${id} or /reject ${id}, or open the app.`, createdAt });
    }
  });
  return { id, status: targeted ? 'pending_approval' : 'active', splits };
}

export async function listRecentExpenses() {
  return db.select().from(expenses).orderBy(expenses.createdAt).limit(50);
}
