import { getRoomSettings } from '$lib/server/auth';
export async function load({ locals }: import('./$types').LayoutServerLoadEvent) {
  return { user: locals.user ? { id: locals.user.id, name: locals.user.name, username: locals.user.username, membershipStatus: locals.membership?.status ?? "none", roomId: locals.roomId, roomName: (await getRoomSettings(locals.roomId ?? "default"))?.name ?? "Room", isOwner: (await getRoomSettings(locals.roomId ?? "default"))?.ownerId === locals.user.id } : null };
}
