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
const { users, expenses } = await import('../src/lib/server/schema');
const { createExpense } = await import('../src/lib/server/expense');
const { getBalances } = await import('../src/lib/server/balances');
const { resolveTargetedExpense, rejectSplit, flagExpense, confirmPenalty } = await import('../src/lib/server/spam');
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
console.log('Full local flow passed: approvals, flags, lock, unlock, payment, and dispute.');
