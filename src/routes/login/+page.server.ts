import { fail, redirect } from '@sveltejs/kit';
import { authenticate, getRoomSettings, setSession } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) redirect(303, '/');
  if (!(await getRoomSettings())) redirect(303, '/setup');
};

export const actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const name = String(data.get('name') ?? '');
    const pin = String(data.get('pin') ?? '');
    if (!(await getRoomSettings())) redirect(303, '/setup');
    const result = await authenticate(name, pin);
    if (!result.user) return fail(400, { message: result.reason === 'name' ? 'No account with that name. Join the room first.' : 'That PIN is incorrect.' });
    await setSession(cookies, result.user.id);
    redirect(303, '/');
  }
} satisfies Actions;
