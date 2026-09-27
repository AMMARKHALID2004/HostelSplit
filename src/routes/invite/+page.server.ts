import { redirect, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { getRoomSettings } from '$lib/server/auth';
import { reviewMembership } from '$lib/server/membership';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, '/login');
  const isOwner = (await getRoomSettings())?.ownerId === locals.user.id;
  const pending = isOwner ? await db.select({ id: users.id, name: users.name, username: users.username, createdAt: users.createdAt }).from(users).where(eq(users.membershipStatus, 'pending')) : [];
  return { inviteUrl: new URL('/signup', url.origin).href, pending, isOwner };
};
export const actions = {
  review: async ({ locals, request }) => {
    if (!locals.user) redirect(303, '/login');
    const data = await request.formData();
    try { await reviewMembership(locals.user.id, String(data.get('id')), data.get('decision') === 'approve'); return { success: 'Membership request reviewed.' }; }
    catch (e) { return fail(400, { message: e instanceof Error ? e.message : 'Could not review request.' }); }
  }
} satisfies Actions;
