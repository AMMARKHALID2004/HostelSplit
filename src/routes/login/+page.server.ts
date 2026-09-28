import { fail, redirect } from '@sveltejs/kit';
import { authenticate, setSession } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals, url }) => {
  const roomId = url.searchParams.get('room') ?? '';
  if (locals.user) redirect(303, roomId ? `/join/${encodeURIComponent(roomId)}` : '/');
  return { roomId };
};
export const actions = {
  default: async ({ request, cookies, url }) => {
    const data = await request.formData();
    const identity = String(data.get('username') ?? '');
    const byName = data.get('identityType') === 'name';
    const result = await authenticate(byName ? identity : '', String(data.get('password') ?? ''), byName ? '' : identity);
    if (!result.user) return fail(400, { message: 'Check your username or name and password. If names are shared, use your unique username.' });
    await setSession(cookies, result.user.id);
    if (!result.user.passwordHash) redirect(303, '/account/password');
    const roomId = url.searchParams.get('room');
    redirect(303, roomId ? `/join/${encodeURIComponent(roomId)}` : '/');
  }
} satisfies Actions;
