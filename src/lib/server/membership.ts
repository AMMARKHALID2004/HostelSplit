import { eq } from 'drizzle-orm';
import { db } from './db';
import { roomSettings, users } from './schema';
import { notify } from './notifications';
export async function reviewMembership(actorId: string, userId: string, approve: boolean) {
  await db.transaction(async tx => {
    const settings = (await tx.select().from(roomSettings).where(eq(roomSettings.id, 'default')))[0];
    if (settings?.ownerId !== actorId) throw new Error('Only the room creator can approve members.');
    const person = (await tx.select().from(users).where(eq(users.id, userId)))[0];
    if (!person || person.membershipStatus !== 'pending') throw new Error('This request has already been reviewed.');
    await tx.update(users).set({ membershipStatus: approve ? 'approved' : 'rejected' }).where(eq(users.id, userId));
    await notify(tx, `${person.name} (@${person.username}) was ${approve ? 'approved to join' : 'declined by'} the room creator.`);
  });
}
