import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { penaltyConfirmations } from '$lib/server/schema';
import { approvedMembers } from '$lib/server/rooms';
import { confirmPenalty } from '$lib/server/spam';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  const locked = (await approvedMembers(locals.roomId!)).filter(u => u.isLocked);
  const confirmations = await db.select().from(penaltyConfirmations).where(eq(penaltyConfirmations.roomId, locals.roomId!));
  return { locked: locked.map(u => ({ id: u.id, name: `${u.name} (@${u.username})`, confirmations: confirmations.filter(c => c.culpritId === u.id && c.penaltyRound === u.penaltyRound).length, mine: confirmations.some(c => c.culpritId === u.id && c.penaltyRound === u.penaltyRound && c.confirmedBy === locals.user!.id) })), currentUserId: locals.user.id };
};
export const actions = { confirm: async ({ locals, request }) => {
  if (!locals.user) redirect(303, '/login');
  const culpritId = String((await request.formData()).get('culpritId') ?? '');
  try { await confirmPenalty(culpritId, locals.user.id, locals.roomId!); return { success: true }; }
  catch (cause) { return fail(400, { message: cause instanceof Error ? cause.message : 'Could not confirm' }); }
} } satisfies Actions;
