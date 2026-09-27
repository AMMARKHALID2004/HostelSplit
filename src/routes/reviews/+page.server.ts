import { redirect, fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { reviews, reviewVotes, users } from '$lib/server/schema';
import { voteReview, serveFries } from '$lib/server/reviews';
import { getRoomSettings } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  const [cases, votes, people, settings] = await Promise.all([
    db.select().from(reviews).orderBy(desc(reviews.createdAt)), db.select().from(reviewVotes),
    db.select({ id: users.id, name: users.name, username: users.username, avoidanceStrikes: users.avoidanceStrikes, friesOwed: users.friesOwed }).from(users).where(eq(users.membershipStatus, 'approved')), getRoomSettings()
  ]);
  return { cases: cases.map(c => ({ ...c, votes: votes.filter(v => v.reviewId === c.id) })), people, currentUserId: locals.user.id, isOwner: settings?.ownerId === locals.user.id };
};
export const actions = {
  vote: async ({ locals, request }) => {
    if (!locals.user) redirect(303, '/login');
    const data = await request.formData();
    try { await voteReview(String(data.get('id')), locals.user.id, String(data.get('verdict'))); return { success: 'Your verdict was recorded.' }; }
    catch (e) { return fail(400, { message: e instanceof Error ? e.message : 'Could not save vote.' }); }
  },
  fries: async ({ locals, request }) => {
    if (!locals.user) redirect(303, '/login');
    try { await serveFries(locals.user.id, String((await request.formData()).get('id'))); return { success: 'Fries marked as served.' }; }
    catch (e) { return fail(400, { message: e instanceof Error ? e.message : 'Could not confirm fries.' }); }
  }
} satisfies Actions;
