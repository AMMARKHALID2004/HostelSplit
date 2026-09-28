import { error, redirect, fail } from '@sveltejs/kit';
import { compare } from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { roomMemberships, roomSettings } from '$lib/server/schema';
import { setSession } from '$lib/server/auth';
import { notify } from '$lib/server/notifications';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ params, locals }) => {
  const room = (await db.select().from(roomSettings).where(eq(roomSettings.id, params.id)))[0];
  if (!room) error(404, 'Invitation not found');
  if (!locals.user) return { roomName: room.name, signedIn: false, alreadyMember: false, roomId: room.id };
  const existing = (await db.select().from(roomMemberships).where(and(eq(roomMemberships.roomId, room.id), eq(roomMemberships.userId, locals.user.id))))[0];
  return { roomName: room.name, signedIn: true, alreadyMember: Boolean(existing), roomId: room.id };
};
export const actions = {
  default: async ({ params, locals, request, cookies }) => {
    if (!locals.user) redirect(303, `/login?room=${encodeURIComponent(params.id)}`);
    const room = (await db.select().from(roomSettings).where(eq(roomSettings.id, params.id)))[0];
    if (!room) error(404, 'Invitation not found');
    const pin = String((await request.formData()).get('pin') ?? '');
    if (!(await compare(pin, room.pinHash))) return fail(400, { message: 'That room PIN is incorrect.' });
    const existing = (await db.select().from(roomMemberships).where(and(eq(roomMemberships.roomId, room.id), eq(roomMemberships.userId, locals.user.id))))[0];
    if (!existing) await db.transaction(async tx => {
      await tx.insert(roomMemberships).values({ id: crypto.randomUUID(), roomId: room.id, userId: locals.user!.id, status: 'pending', createdAt: Date.now() });
      await notify(tx, `${locals.user!.name} (@${locals.user!.username}) requested to join ${room.name}.`, room.id);
    });
    await setSession(cookies, locals.user.id, room.id);
    redirect(303, existing?.status === 'approved' ? '/' : '/pending');
  }
} satisfies Actions;
