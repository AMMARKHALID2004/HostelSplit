import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { roomSettings, users, roomMemberships } from './schema';
import { notify } from './notifications';
export async function reviewMembership(actorId: string, userId: string, approve: boolean, roomId = 'default') {
  await db.transaction(async tx => {
    const settings = (await tx.select().from(roomSettings).where(eq(roomSettings.id, roomId)))[0];
    if (settings?.ownerId !== actorId) throw new Error('Only the room creator can approve members.');
    const person = (await tx.select().from(users).where(eq(users.id, userId)))[0];
    const member = (await tx.select().from(roomMemberships).where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, userId))))[0];
    if (!person || !member || member.status !== 'pending') throw new Error('This request has already been reviewed.');
    await tx.update(roomMemberships).set({ status: approve ? 'approved' : 'rejected' }).where(eq(roomMemberships.id, member.id));
    await notify(tx, `${person.name} (@${person.username}) was ${approve ? 'approved to join' : 'declined by'} the room creator.`, roomId);
  });
}
