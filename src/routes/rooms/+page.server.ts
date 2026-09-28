import { redirect } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { roomMemberships, roomSettings } from '$lib/server/schema';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  const memberships = await db.select().from(roomMemberships).where(eq(roomMemberships.userId, locals.user.id));
  const rooms = memberships.length ? await db.select().from(roomSettings).where(inArray(roomSettings.id, memberships.map(m => m.roomId))) : [];
  return { rooms: memberships.map(m => ({ id: m.roomId, name: rooms.find(r => r.id === m.roomId)?.name ?? 'Room', status: m.status, isCurrent: locals.roomId === m.roomId })) };
};
