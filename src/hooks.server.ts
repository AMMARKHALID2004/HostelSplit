import { redirect, type Handle } from '@sveltejs/kit';
import { getSessionContext } from '$lib/server/auth';
import { flushNotifications } from '$lib/server/notifications';

export const handle: Handle = async ({ event, resolve }) => {
  const session = await getSessionContext(event.cookies);
  event.locals.user = session?.user ?? null;
  event.locals.roomId = session?.roomId ?? null;
  event.locals.membership = session?.membership ?? null;
  const path = event.url.pathname;
  const publicPaths = path === '/pending' || path === '/logout' || path === '/rooms' || path.startsWith('/rooms/') || path === '/signup' || path === '/login' || path === '/setup' || path.startsWith('/join/');
  if (event.locals.user && !publicPaths && event.locals.membership?.status !== 'approved') redirect(303, event.locals.membership ? '/pending' : '/rooms');
  const response = await resolve(event);
  if (event.locals.user || event.request.method === 'POST') {
    const delivery = flushNotifications().catch(() => { console.error('Notification delivery deferred'); });
    if (event.platform?.context) event.platform.context.waitUntil(delivery);
    else await delivery;
  }
  return response;
};
