import { redirect, error, fail } from '@sveltejs/kit';
import { getRoomSettings } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { notify, slackConfigured, notificationStatus } from '$lib/server/notifications';
import { notifications, roomSettings } from '$lib/server/schema';
import { desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
async function owner(id: string, roomId: string) { const room = await getRoomSettings(roomId); if (!room || room.ownerId !== id) error(403, 'Only the room creator can manage Slack notifications.'); return room; }
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  const room = await owner(locals.user.id, locals.roomId!);
  return { configured: await slackConfigured(room.id), status: await notificationStatus(room.id), recent: await db.select().from(notifications).where(eq(notifications.roomId, room.id)).orderBy(desc(notifications.createdAt)).limit(20), canSetWebhook: room.id !== 'default' };
};
export const actions = {
  configure: async ({ locals, request }) => {
    if (!locals.user) redirect(303, '/login');
    const room = await owner(locals.user.id, locals.roomId!);
    if (room.id === 'default') return fail(400, { message: 'The original room webhook is managed through Cloudflare.' });
    const webhook = String((await request.formData()).get('webhook') ?? '').trim();
    let valid = false;
    try { const url = new URL(webhook); valid = url.protocol === 'https:' && url.hostname === 'hooks.slack.com' && url.pathname.startsWith('/services/'); } catch { /* invalid URL */ }
    if (!valid) return fail(400, { message: 'Enter a valid Slack Incoming Webhook URL.' });
    await db.update(roomSettings).set({ slackWebhookUrl: webhook }).where(eq(roomSettings.id, room.id));
    return { success: 'Slack webhook saved for this room.' };
  },
  test: async ({ locals }) => {
    if (!locals.user) redirect(303, '/login');
    const room = await owner(locals.user.id, locals.roomId!);
    if (!(await slackConfigured(room.id))) return fail(400, { message: 'Set this room’s Slack webhook first.' });
    await db.transaction(tx => notify(tx, `HostelSplit is connected for ${room.name}.`, room.id));
    return { success: 'Test notification queued. Check Slack or refresh delivery status.' };
  },
  retry: async ({ locals }) => {
    if (!locals.user) redirect(303, '/login');
    await owner(locals.user.id, locals.roomId!);
    return { success: 'Delivery requested. Slack retry delays are respected. Refresh to see the result.' };
  }
} satisfies Actions;
