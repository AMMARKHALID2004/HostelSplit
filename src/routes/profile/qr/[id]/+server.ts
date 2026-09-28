import { error } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { imageResponse } from '$lib/server/image-response';
import { approvedMembers } from '$lib/server/rooms';
import { paymentProfiles } from '$lib/server/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) error(401, 'Sign in first');
  const memberIds = (await approvedMembers(locals.roomId!)).map(u => u.id);
  const profile = (await db.select({ image: paymentProfiles.qrImageBase64 }).from(paymentProfiles).where(and(eq(paymentProfiles.id, params.id), eq(paymentProfiles.roomId, locals.roomId!), inArray(paymentProfiles.userId, memberIds))).limit(1))[0];
  return imageResponse(profile?.image ?? null);
};
