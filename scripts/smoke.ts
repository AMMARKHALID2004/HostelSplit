import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';

const directory = mkdtempSync(join(tmpdir(), 'hostelsplit-smoke-'));
process.env.TURSO_DATABASE_URL = `file:${join(directory, 'test.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.SLACK_WEBHOOK_URL = '';
const client = createClient({ url: process.env.TURSO_DATABASE_URL });
for (const file of readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort().map((name) => `drizzle/${name}`)) {
  const sql = readFileSync(file, 'utf8');
  for (const statement of sql.split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean)) await client.execute(statement);
}

const { db } = await import('../src/lib/server/db');
const { users, expenses, expenseSplits, reviews, reviewVotes, roomSettings, notifications, notificationLock } = await import('../src/lib/server/schema');
const { createExpense } = await import('../src/lib/server/expense');
const { getBalances } = await import('../src/lib/server/balances');
const { cancelExpense, resolveTargetedExpense, rejectSplit, flagExpense, confirmPenalty } = await import('../src/lib/server/spam');
const { createSettlement, resolveSettlement } = await import('../src/lib/server/settlement');
const { voteReview, serveFries } = await import('../src/lib/server/reviews');
const { reviewMembership } = await import('../src/lib/server/membership');
const { authenticate } = await import('../src/lib/server/auth');
const { notify, flushNotifications } = await import('../src/lib/server/notifications');
const { hash } = await import('bcryptjs');
const { eq } = await import('drizzle-orm');

const ids = ['a', 'b', 'c'];
for (const [index, id] of ['a','b','c','d','e'].entries()) await db.insert(users).values({ id, name: ['Ali', 'Bilal', 'Sara', 'Ali', 'Hamza'][index], username: `user_${id}`, pinHash: await hash('1234', 4), createdAt: Date.now() });
await db.insert(roomSettings).values({ id: 'default', ownerId: 'a', pinHash: await hash('1234',4), sessionSecret: 'test', createdAt: Date.now() });
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

const normal = await createExpense({ amountPaisa: 100, category: 'chai', paidBy: 'a', createdBy: 'a', source: 'pwa', participants: ids });
assert([...normal.splits.map((s) => s.sharePaisa)].join(',') === '34,33,33', 'Deterministic split failed');
const targeted = await createExpense({ amountPaisa: 500, category: 'delivery', paidBy: 'b', createdBy: 'b', source: 'pwa', participants: ['c'] });
assert(targeted.status === 'pending_approval', 'Targeted charge should wait for approval');
assert((await getBalances()).find((b) => b.userId === 'c')?.amountPaisa === -33, 'Pending charge changed balance');
await resolveTargetedExpense(targeted.id, 'c', true);
assert((await getBalances()).find((b) => b.userId === 'c')?.amountPaisa === -533, 'Approved charge missing from balance');
await flagExpense(normal.id, 'b');
const normalReview = (await db.select().from(reviews).where(eq(reviews.expenseId, normal.id)))[0];
for (const id of ['b', 'c', 'd']) await voteReview(normalReview.id, id, 'uphold');
assert((await db.select().from(users).where(eq(users.id,'a')))[0].strikes === 0, 'Three votes must not apply a strike');
await voteReview(normalReview.id, 'e', 'uphold');
assert((await db.select().from(users).where(eq(users.id, 'a')))[0].strikes === 1, 'First strike missing');
const second = await createExpense({ amountPaisa: 100, category: 'chai', paidBy: 'a', createdBy: 'a', source: 'pwa', participants: ids });
await flagExpense(second.id, 'b');
const secondReview = (await db.select().from(reviews).where(eq(reviews.expenseId, second.id)))[0];
for (const id of ['b', 'c', 'd', 'e']) await voteReview(secondReview.id, id, 'uphold');
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
assert(cancelled.voidedBy === 'b' && cancelled.voidReason === 'Cancelled by payer or creator: Logged by mistake', 'Cancellation audit missing');

// Zero entries cannot bypass approval for a targeted charge.
const zero = await createExpense({ amountPaisa: 100, category: 'chai', paidBy: 'a', createdBy: 'b', source: 'pwa', participants: ['a', 'c'],
  customShares: [{ userId: 'a', sharePaisa: 0 }, { userId: 'c', sharePaisa: 100 }] });
assert(zero.status === 'pending_approval', 'Zero share bypassed targeted approval');
await cancelExpense(zero.id, 'a', 'Payer cancels pending expense');
assert((await getBalances()).reduce((sum, balance) => sum + balance.amountPaisa, 0) === 0, 'Custom disputes/cancellations broke accounting');

const rejects = async (fn: () => Promise<unknown>, label: string) => {
  let failed = false; try { await fn(); } catch { failed = true; } assert(failed, label);
};
assert(!(await authenticate('Ali','1234')).user, 'Duplicate name should require username');
assert((await authenticate('Ali','1234','user_a')).user?.id === 'a', 'Username and name login failed');
assert((await authenticate('','1234','USER_D')).user?.id === 'd', 'Case-insensitive username login failed');
assert(!(await authenticate('Sara','1234','user_d')).user, 'Mismatched name/username accepted');
assert(!(await authenticate('Ali','wrong','user_a')).user, 'Wrong PIN accepted');
await rejects(() => db.insert(users).values({ id:'duplicate', name:'Ali', username:'user_a', createdAt:Date.now() }), 'Duplicate username accepted');
await db.insert(users).values({ id:'pending', name:'Pending', username:'pending_user', membershipStatus:'pending', createdAt:Date.now() });
await rejects(() => reviewMembership('b','pending',true), 'Non-owner approved member');
await rejects(() => createExpense({ amountPaisa:100, category:'chai', paidBy:'a', createdBy:'a', source:'pwa', participants:['a','pending'] }), 'Pending participant charged');
const pendingReview = (await db.select().from(reviews).where(eq(reviews.expenseId, custom.id)))[0];
await rejects(() => voteReview(pendingReview.id,'pending','uphold'), 'Pending user voted');
await rejects(() => voteReview(pendingReview.id,pendingReview.accusedId,'uphold'), 'Accused voted on own review');
await reviewMembership('a','pending',true);
await rejects(() => reviewMembership('a','pending',false), 'Already-approved membership changed');

// Four votes restore both active and automatically voided expenses. Three incidents = fries.
for (let incident = 0; incident < 3; incident++) {
  const entry = await createExpense({ amountPaisa:600, category:'mess', paidBy:'a', createdBy:'a', source:'pwa', participants:['a','b','c'], customShares:[{userId:'a',sharePaisa:100},{userId:'b',sharePaisa:200},{userId:'c',sharePaisa:300}] });
  await rejectSplit(entry.id,'b');
  const review = (await db.select().from(reviews).where(eq(reviews.expenseId,entry.id)))[0];
  for (const id of ['a','c','d']) await voteReview(review.id,id,'uphold');
  assert((await db.select().from(expenseSplits).where(eq(expenseSplits.expenseId,entry.id))).find(s=>s.userId==='b')?.status === 'rejected', 'Three votes restored charge');
  await rejects(() => voteReview(review.id,'a','uphold'), 'Duplicate vote accepted');
  await voteReview(review.id,'e','uphold');
  const splits = await db.select().from(expenseSplits).where(eq(expenseSplits.expenseId,entry.id));
  assert(splits.find(s=>s.userId==='a')?.sharePaisa === 100 && splits.find(s=>s.userId==='b')?.status === 'confirmed', 'Charge restoration wrong');
  assert(splits.find(s=>s.userId==='c')?.sharePaisa === 300, 'Review changed uninvolved share');
  await rejects(() => voteReview(review.id,'pending','uphold'), 'Closed review accepted vote');
  await rejects(() => rejectSplit(entry.id,'b'), 'Restored charge rejected again');
}
assert((await db.select().from(users).where(eq(users.id,'b')))[0].friesOwed === 1, 'Three avoidance incidents did not award fries');
await rejects(() => serveFries('c','b'), 'Non-owner cleared fries');
await serveFries('a','b');
assert((await db.select().from(users).where(eq(users.id,'b')))[0].friesOwed === 0, 'Fries not cleared');

// Targeted rejection before AND after approval must restore balanced shares.
for (const initiallyAccept of [false,true]) {
  const entry = await createExpense({ amountPaisa:700,category:'other',paidBy:'a',createdBy:'a',source:'pwa',participants:['c'] });
  await resolveTargetedExpense(entry.id,'c',initiallyAccept);
  if (initiallyAccept) await rejectSplit(entry.id,'c');
  const review = (await db.select().from(reviews).where(eq(reviews.expenseId,entry.id)))[0];
  for (const id of ['a','b','d','e']) await voteReview(review.id,id,'uphold');
  assert((await db.select().from(expenses).where(eq(expenses.id,entry.id)))[0].status === 'active','Targeted restoration failed');
  await getBalances(); // exact zero-sum invariant
}
// A justified rejection never restores debt or issues a strike.
const justified = await createExpense({ amountPaisa:100,category:'other',paidBy:'a',createdBy:'a',source:'pwa',participants:['d'] });
await resolveTargetedExpense(justified.id,'d',false);
const justifiedReview = (await db.select().from(reviews).where(eq(reviews.expenseId,justified.id)))[0];
for (const id of ['a','b','c','e']) await voteReview(justifiedReview.id,id,'dismiss');
assert((await db.select().from(users).where(eq(users.id,'d')))[0].avoidanceStrikes === 0,'Justified rejection penalized');
const cancelledReviews = await db.select().from(reviews).where(eq(reviews.expenseId,outside.id));
assert(cancelledReviews.every(r=>r.status === 'cancelled'),'Manual cancellation left reviews open');
await rejects(() => voteReview(cancelledReviews[0].id,'d','uphold'),'Cancelled expense restored');

// Slack is mocked, never delivered to the real webhook during tests.
assert((await db.select().from(notifications)).length > 20, 'Business events did not queue notifications');
await db.update(notifications).set({ sentAt:Date.now() });
await db.transaction(tx=>notify(tx,'Smoke test <@channel>'));
process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/test/only/mock';
let calls = 0;
await flushNotifications(async (_url, init) => { calls++; const payload = JSON.parse(String(init?.body)); assert(payload.blocks[0].text.type === 'plain_text','Slack user content not plain text'); return new Response('ok'); });
assert(calls === 1,'Slack event not delivered exactly once');
await db.update(notificationLock).set({ until:0 });
await flushNotifications(async()=>{ throw new Error('Sent message retried'); });
await db.transaction(tx=>notify(tx,'Rate limited message'));
await db.update(notificationLock).set({ until:0 });
await flushNotifications(async()=>new Response('rate limited',{status:429,headers:{'retry-after':'120'}}));
const limited = (await db.select().from(notifications)).find(n=>n.message==='Rate limited message')!;
assert(limited.sentAt === null && limited.retryAt > Date.now()+110000,'Retry-After not respected');
await db.update(notificationLock).set({ until:0 });
await flushNotifications(async()=>{ throw new Error('Backoff bypassed'); });
process.env.SLACK_WEBHOOK_URL = '';
console.log('Passed: accounting, custom shares, owner approval, unique usernames, four-person reviews, fries, cancellation permissions and Slack outbox/retries.');
