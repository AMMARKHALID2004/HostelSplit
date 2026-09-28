import { fail, redirect } from '@sveltejs/kit';
import { getRoomSettings } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals }) => { if (!locals.user) redirect(303, '/login'); };
export const actions = { default: async ({ locals, request }) => {
  if (!locals.user) redirect(303, '/login');
  const entry = String((await request.formData()).get('invitation') ?? '').trim();
  let roomId = entry;
  try { roomId = new URL(entry).pathname.split('/join/')[1] ?? ''; } catch { /* accept a room code */ }
  if (!/^(?:default|[a-f0-9-]{36})$/.test(roomId) || !(await getRoomSettings(roomId))) return fail(400, { message: 'Enter a valid room invitation link or room code.' });
  redirect(303, `/join/${roomId}`);
} } satisfies Actions;
