import { redirect, type Handle } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/auth';
import { flushNotifications } from '$lib/server/notifications';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = await getSessionUser(event.cookies);
  const path = event.url.pathname;
  if (event.locals.user && event.locals.user.membershipStatus !== 'approved' && !['/pending', '/logout'].includes(path)) redirect(303, '/pending');
  const response = await resolve(event);
  if (event.locals.user || event.request.method === 'POST') {
    const delivery = flushNotifications().catch(() => { console.error('Notification delivery deferred'); });
    if (event.platform?.context) event.platform.context.waitUntil(delivery);
    else await delivery;
  }
  return response;
};
