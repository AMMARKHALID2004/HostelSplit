import { getRoomSettings } from '$lib/server/auth';
export async function load({ locals }: import('./$types').LayoutServerLoadEvent) {
  return { user: locals.user ? { id: locals.user.id, name: locals.user.name, username: locals.user.username, membershipStatus: locals.user.membershipStatus, isOwner: (await getRoomSettings())?.ownerId === locals.user.id } : null };
}
