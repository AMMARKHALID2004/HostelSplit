import { redirect, error, fail } from '@sveltejs/kit';
import { getRoomSettings } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { notify, slackConfigured, notificationStatus } from '$lib/server/notifications';
import { notifications } from '$lib/server/schema';
import { desc } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
async function owner(id: string) { if ((await getRoomSettings())?.ownerId !== id) error(403, 'Only the room creator can manage Slack notifications.'); }
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  await owner(locals.user.id);
  return { configured: slackConfigured(), status: await notificationStatus(), recent: await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(20) };
};
export const actions = {
  test: async ({ locals }) => {
    if (!locals.user) redirect(303, '/login');
    await owner(locals.user.id);
    if (!slackConfigured()) return fail(400, { message: 'SLACK_WEBHOOK_URL has not been configured.' });
    await db.transaction(tx => notify(tx, 'HostelSplit is connected. Room notifications will appear in this Slack channel.'));
    return { success: 'Test notification queued. Check Slack or refresh delivery status.' };
  },
  retry: async ({ locals }) => {
    if (!locals.user) redirect(303, '/login');
    await owner(locals.user.id);
    return { success: 'Delivery requested. Slack retry delays are respected. Refresh to see the result.' };
  }
} satisfies Actions;
