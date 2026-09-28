import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { imageResponse } from '$lib/server/image-response';
import { settlements } from '$lib/server/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) error(401, 'Sign in first');
  const row = (await db.select({ roomId: settlements.roomId, payerId: settlements.payerId, payeeId: settlements.payeeId, image: settlements.proofImageBase64 }).from(settlements).where(eq(settlements.id, params.id)).limit(1))[0];
  if (!row || row.roomId !== locals.roomId || (row.payerId !== locals.user.id && row.payeeId !== locals.user.id)) error(404, 'Payment proof not found');
  return imageResponse(row.image);
};
