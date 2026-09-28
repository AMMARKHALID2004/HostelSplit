import { fail, redirect } from '@sveltejs/kit';
import { setSession } from '$lib/server/auth';
import { registerAccount } from '$lib/server/accounts';
import { imageToDataUrl } from '$lib/server/images';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals, url }) => {
  if (locals.user) redirect(303, '/');
  return { roomId: url.searchParams.get('room') ?? '' };
};
export const actions = {
  default: async ({ request, cookies, url }) => {
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    const username = String(data.get('username') ?? '').trim();
    const password = String(data.get('password') ?? '');
    if (password !== data.get('confirm')) return fail(400, { message: 'Passwords do not match.', name, username });
    let id: string;
    try {
      id = await registerAccount({ name, username, password, avatarBase64: await imageToDataUrl(data.get('avatar')) });
    } catch (e) { return fail(400, { message: e instanceof Error ? e.message : 'Could not create your profile.', name, username }); }
    await setSession(cookies, id, null);
    const invitedRoom = url.searchParams.get('room');
    redirect(303, invitedRoom ? `/join/${encodeURIComponent(invitedRoom)}` : '/rooms');
  }
} satisfies Actions;
