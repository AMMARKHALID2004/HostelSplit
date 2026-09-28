import { fail, redirect } from '@sveltejs/kit';
import { hashCredential } from '$lib/server/password-hasher';
import { db } from '$lib/server/db';
import { roomMemberships, roomSettings } from '$lib/server/schema';
import { setSession } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals }) => { if (!locals.user) redirect(303, '/login'); };
export const actions = {
  default: async ({ locals, request, cookies, platform }) => {
    if (!locals.user) redirect(303, '/login');
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    const pin = String(data.get('pin') ?? '');
    if (name.length < 2 || name.length > 60) return fail(400, { message: 'Choose a room name of 2–60 characters.' });
    if (!/^\d{4,8}$/.test(pin) || pin !== data.get('confirm')) return fail(400, { message: 'Choose and confirm a 4–8 digit room PIN.' });
    const roomId = crypto.randomUUID();
    const pinHash = await hashCredential(pin, platform?.env?.PASSWORD_HASHER);
    await db.transaction(async tx => {
      await tx.insert(roomSettings).values({ id: roomId, name, ownerId: locals.user!.id, pinHash, sessionSecret: crypto.randomUUID(), createdAt: Date.now() });
      await tx.insert(roomMemberships).values({ id: crypto.randomUUID(), roomId, userId: locals.user!.id, status: 'approved', createdAt: Date.now() });
    });
    await setSession(cookies, locals.user.id, roomId);
    redirect(303, '/invite');
  }
} satisfies Actions;
