import { redirect, fail } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { roomMemberships, users } from '$lib/server/schema';
import { getRoomSettings } from '$lib/server/auth';
import { reviewMembership } from '$lib/server/membership';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, '/login');
  const roomId = locals.roomId!;
  const isOwner = (await getRoomSettings(roomId))?.ownerId === locals.user.id;
  const requests = isOwner ? await db.select().from(roomMemberships).where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.status, 'pending'))) : [];
  const people = requests.length ? await db.select().from(users).where(inArray(users.id, requests.map(r => r.userId))) : [];
  const pending = requests.flatMap(r => { const u = people.find(p => p.id === r.userId); return u ? [{ id: u.id, name: u.name, username: u.username, createdAt: r.createdAt }] : []; });
  return { inviteUrl: new URL(`/join/${roomId}`, url.origin).href, pending, isOwner };
};
export const actions = { review: async ({ locals, request }) => {
  if (!locals.user) redirect(303, '/login');
  const data = await request.formData();
  try { await reviewMembership(locals.user.id, String(data.get('id')), data.get('decision') === 'approve', locals.roomId!); return { success: 'Membership request reviewed.' }; }
  catch (e) { return fail(400, { message: e instanceof Error ? e.message : 'Could not review request.' }); }
} } satisfies Actions;
