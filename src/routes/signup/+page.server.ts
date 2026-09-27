import { fail, redirect } from '@sveltejs/kit';
import { hash } from 'bcryptjs';
import { validUsername, validName } from '$lib/server/auth';
import { notify } from '$lib/server/notifications';
import { compare } from 'bcryptjs';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { getRoomSettings, setSession } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) redirect(303, '/');
  if (!(await getRoomSettings())) redirect(303, '/setup');
};

export const actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    const pin = String(data.get('pin') ?? '');
    const settings = await getRoomSettings();
    if (!settings) redirect(303, '/setup');
    if (!(await compare(pin, settings.pinHash))) return fail(400, { message: 'Room PIN is incorrect' });
    const username = String(data.get('username') ?? '').trim().toLowerCase();
    if (!validName(name)) return fail(400, { message: 'Enter a name between 2 and 40 letters' });
    if (!validUsername(username)) return fail(400, { message: 'Username: 3–24 lowercase letters, numbers or underscores.' });
    const id = crypto.randomUUID();
    const pinHash = await hash(pin, 12);
    try {
      await db.transaction(async tx => {
        await tx.insert(users).values({ id, name, username, pinHash, membershipStatus: 'pending', createdAt: Date.now() });
        await notify(tx, `${name} (@${username}) requested to join the room. The room creator can review this in Invite.`);
      });
    } catch { return fail(409, { message: 'That username is taken. Choose another.' }); }
    await setSession(cookies, id);
    redirect(303, '/pending');
  }
} satisfies Actions;
