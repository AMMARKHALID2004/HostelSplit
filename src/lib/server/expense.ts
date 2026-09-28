import { desc, eq } from 'drizzle-orm';
import { db } from './db';
import { expenses, expenseSplits, users } from './schema';
import { notify } from './notifications';
import { approvedMembers } from './rooms';
import { buildSplits } from '../money';

export const categories = ['chai', 'mess', 'delivery', 'groceries', 'bills', 'other'] as const;
export type Category = typeof categories[number];

export function splitAmount(amountPaisa: number, participantIds: string[]) {
  return buildSplits(amountPaisa, participantIds);
}

export async function createExpense(input: {
  amountPaisa: number; category: Category; description?: string; paidBy: string;
  createdBy: string; source: 'pwa'; participants: string[];
  roomId?: string; customShares?: { userId: string; sharePaisa: number }[];
}) {
  if (!categories.includes(input.category)) throw new Error('Invalid category');
  if (input.description && input.description.length > 500) throw new Error('Description is too long');
  const splits = buildSplits(input.amountPaisa, input.participants, input.customShares);
  const needed = [...new Set([input.paidBy, input.createdBy, ...input.participants])];
  const roomId = input.roomId ?? 'default';
  const existing = (await approvedMembers(roomId)).filter(u => needed.includes(u.id));
  if (existing.length !== needed.length || existing.some(u => u.status !== 'approved')) throw new Error('Unknown roommate');
  const actor = existing.find((u) => u.id === input.createdBy)!;
  const payer = existing.find((u) => u.id === input.paidBy)!;
  if (actor.isLocked) throw new Error(`${actor.name} (@${actor.username}) is locked until the room confirms their cold drink.`);
  if (payer.isLocked) throw new Error(`${payer.name} (@${payer.username}) is locked until the room confirms their cold drink.`);
  const charged = splits.filter(s => s.sharePaisa > 0);
  const targeted = charged.length === 1 && charged[0].userId !== input.paidBy;
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  await db.transaction(async (tx) => {
    await tx.insert(expenses).values({
      id, roomId, amountPaisa: input.amountPaisa, category: input.category, description: input.description || null,
      paidBy: input.paidBy, createdBy: input.createdBy, source: input.source,
      status: targeted ? 'pending_approval' : 'active', isTargeted: targeted ? 1 : 0, createdAt,
      splitMode: input.customShares ? 'custom' : 'equal'
    });
    await tx.insert(expenseSplits).values(splits.map((split) => ({
      id: crypto.randomUUID(), expenseId: id, userId: split.userId,
      sharePaisa: split.sharePaisa, status: targeted && split.sharePaisa > 0 ? 'pending' : 'confirmed'
    })));
    await notify(tx, `${actor.name} added an expense: Rs. ${(input.amountPaisa / 100).toFixed(2)} for ${input.category}, paid by ${payer.name}. ${targeted ? 'The charged roommate must accept or reject it.' : 'Open the app to review your share.'} Expense: ${id}`, roomId);
  });
  return { id, status: targeted ? 'pending_approval' : 'active', splits };
}

export async function listRecentExpenses(roomId = 'default') {
  return db.select().from(expenses).where(eq(expenses.roomId, roomId)).orderBy(desc(expenses.createdAt)).limit(50);
}
