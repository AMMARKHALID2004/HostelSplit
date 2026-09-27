import { redirect } from '@sveltejs/kit';
export const load = ({ locals }: import('./$types').PageServerLoadEvent) => {
  if (!locals.user) redirect(303, '/login');
  if (locals.user.membershipStatus === 'approved') redirect(303, '/');
  return { status: locals.user.membershipStatus, name: locals.user.name, username: locals.user.username };
};
