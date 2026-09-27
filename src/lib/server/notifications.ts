import { and, eq, isNull, lte, asc, sql } from 'drizzle-orm';
import { db } from './db';
import { notifications, notificationLock } from './schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function notify(tx: Tx, message: string) {
  await tx.insert(notifications).values({ id: crypto.randomUUID(), message, createdAt: Date.now() });
}
export function slackConfigured() { return Boolean(process.env.SLACK_WEBHOOK_URL); }

// Durable outbox; a database lease serializes delivery across Cloudflare isolates.
// Failed messages stay queued. Future requests and the owner's Retry button retry them.
export async function flushNotifications(fetcher: typeof fetch = fetch) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;
  const url = new URL(webhook);
  if (url.protocol !== 'https:' || url.hostname !== 'hooks.slack.com' || !url.pathname.startsWith('/services/')) return;
  const started = Date.now();
  let lease = 0;
  // A second request may arrive while another worker is sending. Wait briefly
  // for that lease so the new event does not depend on a later visitor.
  while (Date.now() - started < 20_000) {
    const pending = await db.select({ id: notifications.id }).from(notifications).where(and(isNull(notifications.sentAt), lte(notifications.retryAt, Date.now()))).limit(1);
    if (!pending.length) return;
    lease = Date.now() + 60_000;
    const claimed = await db.update(notificationLock).set({ until: lease }).where(and(eq(notificationLock.id, 'slack'), lte(notificationLock.until, Date.now()))).returning();
    if (claimed.length) break;
    const lock = (await db.select().from(notificationLock).where(eq(notificationLock.id, 'slack')))[0];
    if (lock && lock.until - Date.now() > 60_000) return; // Slack requested a longer backoff.
    lease = 0;
    await new Promise(resolve => setTimeout(resolve, 1100));
  }
  if (!lease) return;
  let releaseAt = Date.now();
  try {
    const rows = await db.select().from(notifications).where(and(isNull(notifications.sentAt), lte(notifications.retryAt, Date.now()))).orderBy(asc(notifications.createdAt)).limit(10);
    for (const row of rows) {
      try {
        const response = await fetcher(webhook, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: row.message.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'), blocks: [{ type: 'section', text: { type: 'plain_text', text: row.message, emoji: true } }], mrkdwn: false, unfurl_links: false, unfurl_media: false }), signal: AbortSignal.timeout(5_000) });
        if (!response.ok) {
          const seconds = Math.max(60, Math.min(86400, Number(response.headers.get('retry-after')) || 60 * 2 ** Math.min(row.attempts, 10)));
          if (response.status === 429) releaseAt = Date.now() + seconds * 1000;
          await db.update(notifications).set({ attempts: row.attempts + 1, lastError: `Slack HTTP ${response.status}`, retryAt: Date.now() + seconds * 1000 }).where(eq(notifications.id, row.id));
          break;
        }
        await db.update(notifications).set({ sentAt: Date.now(), attempts: row.attempts + 1, lastError: null }).where(eq(notifications.id, row.id));
        await new Promise(resolve => setTimeout(resolve, 1100));
      } catch {
        await db.update(notifications).set({ attempts: row.attempts + 1, lastError: 'Slack connection failed', retryAt: Date.now() + 60_000 }).where(eq(notifications.id, row.id));
        break;
      }
      if (Date.now() - started > 20_000) break;
    }
  } finally {
    await db.update(notificationLock).set({ until: Math.max(releaseAt, Date.now() + 1100) }).where(eq(notificationLock.until, lease));
  }
}
export async function notificationStatus() {
  return (await db.select({ pending: sql<number>`count(*)`, failed: sql<number>`sum(case when attempts > 0 then 1 else 0 end)` }).from(notifications).where(isNull(notifications.sentAt)))[0];
}
