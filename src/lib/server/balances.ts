import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { expenses, expenseSplits, settlements } from './schema';
import { approvedMembers } from './rooms';

type Expense = Pick<typeof expenses.$inferSelect, 'id' | 'paidBy' | 'amountPaisa' | 'status'>;
type Split = Pick<typeof expenseSplits.$inferSelect, 'expenseId' | 'userId' | 'sharePaisa' | 'status'>;
type Settlement = Pick<typeof settlements.$inferSelect, 'payerId' | 'payeeId' | 'amountPaisa' | 'status'>;

export function calculateBalances(userIds: string[], expenseRows: Expense[], splitRows: Split[], settlementRows: Settlement[]) {
  const balances = new Map(userIds.map((id) => [id, 0]));
  const active = new Map(expenseRows.filter((e) => e.status === 'active').map((e) => [e.id, e]));
  for (const expense of active.values()) {
    balances.set(expense.paidBy, (balances.get(expense.paidBy) ?? 0) + expense.amountPaisa);
  }
  for (const split of splitRows) {
    if (split.status === 'confirmed' && active.has(split.expenseId)) {
      balances.set(split.userId, (balances.get(split.userId) ?? 0) - split.sharePaisa);
    }
  }
  for (const settlement of settlementRows) {
    if (settlement.status !== 'confirmed') continue;
    balances.set(settlement.payerId, (balances.get(settlement.payerId) ?? 0) + settlement.amountPaisa);
    balances.set(settlement.payeeId, (balances.get(settlement.payeeId) ?? 0) - settlement.amountPaisa);
  }
  if ([...balances.values()].reduce((sum, value) => sum + value, 0) !== 0) {
    throw new Error('Balance invariant failed: confirmed shares do not equal active expenses');
  }
  return balances;
}

export async function getBalances(roomId = 'default') {
  const [userRows, expenseRows, splitRows, settlementRows] = await Promise.all([
    approvedMembers(roomId), db.select().from(expenses).where(eq(expenses.roomId, roomId)), db.select().from(expenseSplits), db.select().from(settlements).where(eq(settlements.roomId, roomId))
  ]);
  const totals = calculateBalances(userRows.map((u) => u.id), expenseRows, splitRows, settlementRows);
  return userRows.map((u) => ({ userId: u.id, name: `${u.name} (@${u.username})`, amountPaisa: totals.get(u.id) ?? 0 }));
}

export async function getPairwiseDebt(fromUserId: string, toUserId: string, roomId = 'default') {
  const [expenseRows, splitRows, settlementRows] = await Promise.all([
    db.select().from(expenses).where(and(eq(expenses.roomId, roomId), eq(expenses.status, 'active'))),
    db.select().from(expenseSplits).where(eq(expenseSplits.status, 'confirmed')),
    db.select().from(settlements).where(and(eq(settlements.roomId, roomId), eq(settlements.status, 'confirmed')))
  ]);
  const byExpense = new Map(expenseRows.map((e) => [e.id, e]));
  let debt = 0;
  for (const split of splitRows) {
    const expense = byExpense.get(split.expenseId);
    if (expense?.paidBy === toUserId && split.userId === fromUserId) debt += split.sharePaisa;
    if (expense?.paidBy === fromUserId && split.userId === toUserId) debt -= split.sharePaisa;
  }
  for (const settlement of settlementRows) {
    if (settlement.payerId === fromUserId && settlement.payeeId === toUserId) debt -= settlement.amountPaisa;
    if (settlement.payerId === toUserId && settlement.payeeId === fromUserId) debt += settlement.amountPaisa;
  }
  return debt;
}
