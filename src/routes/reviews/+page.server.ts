import { redirect, fail } from '@sveltejs/kit';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { reviews, reviewVotes } from '$lib/server/schema';
import { approvedMembers } from '$lib/server/rooms';
import { voteReview, serveFries } from '$lib/server/reviews';
import { getRoomSettings } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  const [cases, people, settings] = await Promise.all([
    db.select().from(reviews).where(eq(reviews.roomId, locals.roomId!)).orderBy(desc(reviews.createdAt)),
    approvedMembers(locals.roomId!), getRoomSettings(locals.roomId!)
  ]);
  const votes = cases.length ? await db.select().from(reviewVotes).where(inArray(reviewVotes.reviewId, cases.map(c => c.id))) : [];
  return { cases: cases.map(c => ({ ...c, votes: votes.filter(v => v.reviewId === c.id) })), people: people.map(u => ({ id: u.id, name: u.name, username: u.username, avoidanceStrikes: u.avoidanceStrikes, friesOwed: u.friesOwed })), currentUserId: locals.user.id, isOwner: settings?.ownerId === locals.user.id };
};
export const actions = {
  vote: async ({ locals, request }) => {
    if (!locals.user) redirect(303, '/login');
    const data = await request.formData();
    try { await voteReview(String(data.get('id')), locals.user.id, String(data.get('verdict')), locals.roomId!); return { success: 'Your verdict was recorded.' }; }
    catch (e) { return fail(400, { message: e instanceof Error ? e.message : 'Could not save vote.' }); }
  },
  fries: async ({ locals, request }) => {
    if (!locals.user) redirect(303, '/login');
    try { await serveFries(locals.user.id, String((await request.formData()).get('id')), locals.roomId!); return { success: 'Fries marked as served.' }; }
    catch (e) { return fail(400, { message: e instanceof Error ? e.message : 'Could not confirm fries.' }); }
  }
} satisfies Actions;
