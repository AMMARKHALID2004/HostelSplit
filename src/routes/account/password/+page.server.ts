import { fail, redirect } from '@sveltejs/kit';
import { changePassword } from '$lib/server/accounts';
import { setSession } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  return { needsPassword: !locals.user.passwordHash };
};
export const actions = { default: async ({ locals, request, cookies, platform }) => {
  if (!locals.user) redirect(303, '/login');
  const data = await request.formData();
  const password = String(data.get('password') ?? '');
  if (password !== data.get('confirm')) return fail(400, { message: 'Passwords do not match.' });
  try { await changePassword(locals.user.id, String(data.get('current') ?? ''), password, platform?.env?.PASSWORD_HASHER); }
  catch (e) { return fail(400, { message: e instanceof Error ? e.message : 'Could not save password.' }); }
  await setSession(cookies, locals.user.id, locals.roomId);
  redirect(303, '/');
} } satisfies Actions;
