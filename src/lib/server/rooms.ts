import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { roomMemberships, roomSettings, users } from './schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function membershipOf(userId: string, roomId: string) {
  return (await db.select().from(roomMemberships).where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, userId))).limit(1))[0] ?? null;
}
export async function approvedMembers(roomId: string) {
  const members = await db.select().from(roomMemberships).where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.status, 'approved')));
  if (!members.length) return [];
  const people = await db.select().from(users).where(inArray(users.id, members.map(m => m.userId)));
  return members.flatMap(member => {
    const user = people.find(p => p.id === member.userId);
    return user ? [{ ...user, ...member, id: user.id, membershipId: member.id }] : [];
  });
}
export async function requireApprovedMember(tx: Tx, userId: string, roomId: string) {
  const membership = (await tx.select().from(roomMemberships).where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, userId))))[0];
  if (!membership || membership.status !== 'approved') throw new Error('An approved member of this room is required.');
  const user = (await tx.select().from(users).where(eq(users.id, userId)))[0];
  if (!user) throw new Error('Account not found.');
  return { ...user, ...membership, id: user.id, membershipId: membership.id };
}
export async function roomForOwner(roomId: string, userId: string) {
  const room = (await db.select().from(roomSettings).where(eq(roomSettings.id, roomId)))[0];
  if (!room || room.ownerId !== userId) throw new Error('Only this room’s creator can manage it.');
  return room;
}
