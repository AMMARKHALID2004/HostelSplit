import { redirect } from '@sveltejs/kit';
export const load = ({ locals }: import('./$types').PageServerLoadEvent) => {
  if (!locals.user) redirect(303, '/login');
  if (locals.membership?.status === 'approved') redirect(303, '/');
  return { status: locals.membership?.status ?? 'unknown', name: locals.user.name, username: locals.user.username };
};
