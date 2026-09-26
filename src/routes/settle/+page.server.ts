import { fail, redirect } from '@sveltejs/kit';
import { getBalances } from '$lib/server/balances';
import { simplifyDebts } from '$lib/server/simplify';
import { getSettlementContext, createSettlement, resolveSettlement } from '$lib/server/settlement';
import { imageToDataUrl } from '$lib/server/images';
import { db } from '$lib/server/db';
import { paymentProfiles } from '$lib/server/schema';
import { isNotNull } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  const balances = await getBalances();
  const suggestions = simplifyDebts(new Map(balances.map((b) => [b.userId, b.amountPaisa]))).filter((s) => s.from === locals.user!.id || s.to === locals.user!.id);
  const [context, profiles] = await Promise.all([getSettlementContext(locals.user.id), db.select({ id: paymentProfiles.id, userId: paymentProfiles.userId, method: paymentProfiles.method, accountTitle: paymentProfiles.accountTitle, accountNumber: paymentProfiles.accountNumber, bankName: paymentProfiles.bankName, isPrimary: paymentProfiles.isPrimary, hasQr: isNotNull(paymentProfiles.qrImageBase64) }).from(paymentProfiles)]);
  return { balances, suggestions, currentUserId: locals.user.id, ...context, profiles };
};

export const actions = {
  submit: async ({ locals, request }) => {
    if (!locals.user) redirect(303, '/login');
    const data = await request.formData();
    const payeeId = String(data.get('payeeId') ?? '');
    const amount = String(data.get('amount') ?? '');
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(amount)) return fail(400, { message: 'Enter a valid amount' });
    const [rupees, cents = ''] = amount.split('.');
    try {
      const proof = await imageToDataUrl(data.get('proof'));
      await createSettlement(locals.user.id, payeeId, Number(rupees) * 100 + Number(cents.padEnd(2, '0')), proof);
      return { success: 'Payment submitted for confirmation' };
    } catch (cause) { return fail(400, { message: cause instanceof Error ? cause.message : 'Could not submit payment' }); }
  },
  confirm: async ({ locals, request }) => {
    if (!locals.user) redirect(303, '/login');
    try { await resolveSettlement(String((await request.formData()).get('id') ?? ''), locals.user.id, true); return { success: 'Payment confirmed' }; }
    catch (cause) { return fail(400, { message: cause instanceof Error ? cause.message : 'Could not confirm payment' }); }
  },
  reject: async ({ locals, request }) => {
    if (!locals.user) redirect(303, '/login');
    try { await resolveSettlement(String((await request.formData()).get('id') ?? ''), locals.user.id, false); return { success: 'Payment rejected' }; }
    catch (cause) { return fail(400, { message: cause instanceof Error ? cause.message : 'Could not reject payment' }); }
  }
} satisfies Actions;
