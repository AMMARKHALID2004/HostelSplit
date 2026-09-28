import { error } from '@sveltejs/kit';
import { imageResponse } from '$lib/server/image-response';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = ({ locals }) => {
  if (!locals.user) error(401, 'Sign in first');
  return imageResponse(locals.user.avatarBase64);
};
