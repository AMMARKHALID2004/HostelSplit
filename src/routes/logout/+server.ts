import { redirect } from '@sveltejs/kit';
import { clearSession } from '$lib/server/auth';
export async function POST({ cookies }: import('./$types').RequestEvent) {
  await clearSession(cookies);
  redirect(303, '/');
}
