import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { imageResponse } from '$lib/server/image-response';
import { paymentProfiles } from '$lib/server/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) error(401, 'Sign in first');
  const profile = (await db.select({ image: paymentProfiles.qrImageBase64 }).from(paymentProfiles).where(eq(paymentProfiles.id, params.id)).limit(1))[0];
  return imageResponse(profile?.image ?? null);
};
