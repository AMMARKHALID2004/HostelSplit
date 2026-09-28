import { error, redirect } from '@sveltejs/kit';
import { membershipOf } from '$lib/server/rooms';
import { setSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ locals, request, cookies }) => {
  if (!locals.user) redirect(303, '/login');
  const roomId = String((await request.formData()).get('roomId') ?? '');
  const membership = await membershipOf(locals.user.id, roomId);
  if (!membership) error(403, 'You are not a member of that room.');
  await setSession(cookies, locals.user.id, roomId);
  redirect(303, membership.status === 'approved' ? '/' : '/pending');
};
