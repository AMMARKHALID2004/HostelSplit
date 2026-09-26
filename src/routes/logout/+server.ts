import { redirect } from '@sveltejs/kit';
import { clearSession } from '$lib/server/auth';

export function POST({ cookies }: import('./$types').RequestEvent) {
  clearSession(cookies);
  redirect(303, '/login');
}
