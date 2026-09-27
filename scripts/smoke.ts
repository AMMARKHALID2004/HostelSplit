import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';

const directory = mkdtempSync(join(tmpdir(), 'hostelsplit-smoke-'));
process.env.TURSO_DATABASE_URL = `file:${join(directory, 'test.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
const client = createClient({ url: process.env.TURSO_DATABASE_URL });
for (const file of readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort().map((name) => `drizzle/${name}`)) {
  const sql = readFileSync(file, 'utf8');
  for (const statement of sql.split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean)) await client.execute(statement);
}

const { db } = await import('../src/lib/server/db');
const { users, expenses, expenseSplits } = await import('../src/lib/server/schema');
const { createExpense } = await import('../src/lib/server/expense');
const { getBalances } = await import('../src/lib/server/balances');
const { cancelExpense, resolveTargetedExpense, rejectSplit, flagExpense, confirmPenalty } = await import('../src/lib/server/spam');
const { createSettlement, resolveSettlement } = await import('../src/lib/server/settlement');
const { eq } = await import('drizzle-orm');

const ids = ['a', 'b', 'c'];
for (const [index, id] of ids.entries()) await db.insert(users).values({ id, name: ['Ali', 'Bilal', 'Sara'][index], createdAt: Date.now() });
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

const normal = await createExpense({ amountPaisa: 100, category: 'chai', paidBy: 'a', createdBy: 'a', source: 'pwa', participants: ids });
assert([...normal.splits.map((s) => s.sharePaisa)].join(',') === '34,33,33', 'Deterministic split failed');
const targeted = await createExpense({ amountPaisa: 500, category: 'delivery', paidBy: 'b', createdBy: 'b', source: 'pwa', participants: ['c'] });
assert(targeted.status === 'pending_approval', 'Targeted charge should wait for approval');
assert((await getBalances()).find((b) => b.userId === 'c')?.amountPaisa === -33, 'Pending charge changed balance');
await resolveTargetedExpense(targeted.id, 'c', true);
assert((await getBalances()).find((b) => b.userId === 'c')?.amountPaisa === -533, 'Approved charge missing from balance');
await flagExpense(normal.id, 'b');
await flagExpense(normal.id, 'c');
assert((await db.select().from(users).where(eq(users.id, 'a')))[0].strikes === 1, 'First strike missing');
const second = await createExpense({ amountPaisa: 100, category: 'chai', paidBy: 'a', createdBy: 'a', source: 'pwa', participants: ids });
await flagExpense(second.id, 'b');
await flagExpense(second.id, 'c');
assert((await db.select().from(users).where(eq(users.id, 'a')))[0].isLocked === 1, 'Second strike did not lock creator');
let blocked = false;
try { await createExpense({ amountPaisa: 100, category: 'chai', paidBy: 'a', createdBy: 'a', source: 'pwa', participants: ids }); }
catch { blocked = true; }
assert(blocked, 'Locked user could create an expense');
await confirmPenalty('a', 'b');
assert((await db.select().from(users).where(eq(users.id, 'a')))[0].isLocked === 1, 'One confirmation unlocked user');
await confirmPenalty('a', 'c');
assert((await db.select().from(users).where(eq(users.id, 'a')))[0].isLocked === 0, 'Two confirmations did not unlock user');

const proof = 'data:image/png;base64,c21va2U=';
const paymentId = await createSettlement('c', 'b', 500, proof);
assert((await getBalances()).find((b) => b.userId === 'c')?.amountPaisa === -500, 'Pending settlement changed balance');
await resolveSettlement(paymentId, 'b', true);
assert((await getBalances()).every((b) => b.amountPaisa === 0), 'Confirmed settlement did not clear balances');

const disputed = await createExpense({ amountPaisa: 101, category: 'mess', paidBy: 'a', createdBy: 'a', source: 'pwa', participants: ids });
await rejectSplit(disputed.id, 'c');
assert((await db.select().from(expenses).where(eq(expenses.id, disputed.id)))[0].status === 'active', 'Expense should remain active with two participants');
assert((await getBalances()).reduce((sum, balance) => sum + balance.amountPaisa, 0) === 0, 'Dispute broke zero-sum invariant');
// Unequal shares stay fixed when someone disputes their charge.
const custom = await createExpense({ amountPaisa: 60000, category: 'mess', paidBy: 'a', createdBy: 'a', source: 'pwa', participants: ids,
  customShares: [{ userId: 'a', sharePaisa: 10000 }, { userId: 'b', sharePaisa: 20000 }, { userId: 'c', sharePaisa: 30000 }] });
const baseline = new Map((await getBalances()).map(b => [b.userId, b.amountPaisa]));
await rejectSplit(custom.id, 'b');
let shares = await db.select().from(expenseSplits).where(eq(expenseSplits.expenseId, custom.id));
assert(shares.find(s => s.userId === 'c')?.sharePaisa === 30000, 'Rejecting increased another participant’s custom share');
assert(shares.find(s => s.userId === 'a')?.sharePaisa === 30000, 'Payer did not absorb rejected share');
assert(shares.find(s => s.userId === 'b')?.status === 'rejected', 'Rejection was not recorded');
assert((await getBalances()).find(b => b.userId === 'b')!.amountPaisa === baseline.get('b')! + 20000, 'Rejected charge still owed');
let denied = false;
try { await rejectSplit(custom.id, 'b'); } catch { denied = true; }
assert(denied, 'Repeated rejection applied twice');
await rejectSplit(custom.id, 'c');
assert((await db.select().from(expenses).where(eq(expenses.id, custom.id)))[0].status === 'voided', 'Last charged roommate could not reject');

// A payer outside the split absorbs disputes; the remaining debtor keeps their amount.
const outside = await createExpense({ amountPaisa: 10000, category: 'other', paidBy: 'a', createdBy: 'b', source: 'pwa', participants: ['b', 'c'],
  customShares: [{ userId: 'b', sharePaisa: 4000 }, { userId: 'c', sharePaisa: 6000 }] });
await rejectSplit(outside.id, 'b');
shares = await db.select().from(expenseSplits).where(eq(expenseSplits.expenseId, outside.id));
assert(shares.find(s => s.userId === 'a')?.sharePaisa === 4000, 'Missing payer share was not created');
assert(shares.find(s => s.userId === 'c')?.sharePaisa === 6000, 'Remaining debtor changed');
denied = false;
try { await cancelExpense(outside.id, 'c', 'Not allowed'); } catch { denied = true; }
assert(denied, 'Unrelated participant could cancel whole expense');
await cancelExpense(outside.id, 'b', 'Logged by mistake');
const cancelled = (await db.select().from(expenses).where(eq(expenses.id, outside.id)))[0];
assert(cancelled.voidedBy === 'b' && cancelled.voidReason === 'Logged by mistake', 'Cancellation audit missing');

// Zero entries cannot bypass approval for a targeted charge.
const zero = await createExpense({ amountPaisa: 100, category: 'chai', paidBy: 'a', createdBy: 'b', source: 'pwa', participants: ['a', 'c'],
  customShares: [{ userId: 'a', sharePaisa: 0 }, { userId: 'c', sharePaisa: 100 }] });
assert(zero.status === 'pending_approval', 'Zero share bypassed targeted approval');
await cancelExpense(zero.id, 'a', 'Payer cancels pending expense');
assert((await getBalances()).reduce((sum, balance) => sum + balance.amountPaisa, 0) === 0, 'Custom disputes/cancellations broke accounting');
console.log('Full local flow passed: approvals, spam, settlements, custom splits, rejection and cancellation permissions.');
