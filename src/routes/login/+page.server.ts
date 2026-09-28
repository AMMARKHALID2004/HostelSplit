import { fail, redirect } from '@sveltejs/kit';
import { authenticate, getRoomSettings, setSession } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) redirect(303, '/');
  if (!(await getRoomSettings())) redirect(303, '/setup');
};

export const actions = {
  default: async ({ request, cookies, url }) => {
    const data = await request.formData();
    const name = String(data.get('name') ?? '');
    const pin = String(data.get('pin') ?? '');
    if (!(await getRoomSettings())) redirect(303, '/setup');
    const result = await authenticate(name, pin, String(data.get('username') ?? ''));
    if (!result.user) return fail(400, { message: 'Check your username, name and PIN. If names are shared, use your unique username.' });
    const roomId = url.searchParams.get('room');
    await setSession(cookies, result.user.id);
    redirect(303, roomId ? `/join/${encodeURIComponent(roomId)}` : '/rooms');
  }
} satisfies Actions;
