import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { validName, validUsername } from '$lib/server/auth';
import { imageToDataUrl } from '$lib/server/images';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  return { identity: { name: locals.user.name, username: locals.user.username, hasAvatar: Boolean(locals.user.avatarBase64), avatarUpdatedAt: locals.user.avatarUpdatedAt }, hasRoom: locals.membership?.status === 'approved' };
};
export const actions = { default: async ({ locals, request }) => {
  if (!locals.user) redirect(303, '/login');
  const data = await request.formData();
  const name = String(data.get('name') ?? '').trim();
  const username = String(data.get('username') ?? '').trim().toLowerCase();
  if (!validName(name) || !validUsername(username)) return fail(400, { message: 'Use a name of 2–40 letters and a username of 3–24 letters, numbers or underscores.' });
  try {
    const avatar = await imageToDataUrl(data.get('avatar'));
    const replaceAvatar = avatar !== null || data.get('removeAvatar') === 'yes';
    await db.update(users).set({ name, username, ...(replaceAvatar ? { avatarBase64: avatar, avatarUpdatedAt: Date.now() } : {}) }).where(eq(users.id, locals.user.id));
  } catch (e) {
    if (e instanceof Error && (e.message.startsWith('Upload') || e.message.startsWith('Image'))) return fail(400, { message: e.message });
    return fail(409, { message: 'That username is already taken, or the profile could not be saved.' });
  }
  return { success: 'Profile saved.' };
} } satisfies Actions;
