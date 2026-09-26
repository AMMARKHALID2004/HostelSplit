import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { paymentProfiles } from '$lib/server/schema';
import { imageToDataUrl } from '$lib/server/images';
import { issueLinkCode } from '$lib/server/whatsapp-link';
import type { Actions, PageServerLoad } from './$types';

const methods = ['raast', 'easypaisa', 'jazzcash', 'nayapay', 'bank'];

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  return { profiles: await db.select({ id: paymentProfiles.id, method: paymentProfiles.method, accountTitle: paymentProfiles.accountTitle, accountNumber: paymentProfiles.accountNumber, bankName: paymentProfiles.bankName, isPrimary: paymentProfiles.isPrimary }).from(paymentProfiles).where(eq(paymentProfiles.userId, locals.user.id)), whatsappJid: locals.user.whatsappJid };
};

export const actions = {
  save: async ({ locals, request }) => {
    if (!locals.user) redirect(303, '/login');
    const data = await request.formData();
    const method = String(data.get('method') ?? '');
    const accountTitle = String(data.get('accountTitle') ?? '').trim();
    const accountNumber = String(data.get('accountNumber') ?? '').trim();
    const bankName = String(data.get('bankName') ?? '').trim();
    if (!methods.includes(method) || !accountTitle || !accountNumber || accountTitle.length > 100 || accountNumber.length > 80) return fail(400, { message: 'Enter a valid payment profile' });
    try {
      const qrImageBase64 = await imageToDataUrl(data.get('qr'));
      const existing = await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, locals.user.id));
      await db.insert(paymentProfiles).values({ id: crypto.randomUUID(), userId: locals.user.id, method, accountTitle, accountNumber, bankName: method === 'bank' ? bankName : null, qrImageBase64, isPrimary: existing.length ? 0 : 1 });
      return { success: 'Payment method saved' };
    } catch (cause) { return fail(400, { message: cause instanceof Error ? cause.message : 'Could not save payment method' }); }
  },
  primary: async ({ locals, request }) => {
    if (!locals.user) redirect(303, '/login');
    const id = String((await request.formData()).get('id') ?? '');
    const mine = (await db.select().from(paymentProfiles).where(and(eq(paymentProfiles.id, id), eq(paymentProfiles.userId, locals.user.id))).limit(1))[0];
    if (!mine) return fail(404, { message: 'Payment method not found' });
    await db.transaction(async (tx) => {
      await tx.update(paymentProfiles).set({ isPrimary: 0 }).where(eq(paymentProfiles.userId, locals.user!.id));
      await tx.update(paymentProfiles).set({ isPrimary: 1 }).where(eq(paymentProfiles.id, id));
    });
    return { success: 'Primary method updated' };
  },
  remove: async ({ locals, request }) => {
    if (!locals.user) redirect(303, '/login');
    const id = String((await request.formData()).get('id') ?? '');
    await db.delete(paymentProfiles).where(and(eq(paymentProfiles.id, id), eq(paymentProfiles.userId, locals.user.id)));
    return { success: 'Payment method removed' };
  },
  link: async ({ locals }) => {
    if (!locals.user) redirect(303, '/login');
    return { code: await issueLinkCode(locals.user.id) };
  }
} satisfies Actions;
