<script lang="ts">
  import { formatPaisa } from '$lib/format';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  let { data, form } = $props();
  let names = $derived(new Map(data.roommates.map((u) => [u.id, u.name])));
  let mine = $derived(data.splits.find((s) => s.userId === data.currentUserId));
  let canCancel = $derived(data.currentUserId === data.expense.paidBy || data.currentUserId === data.expense.createdBy);
  onMount(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void invalidateAll(); };
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  });
</script>
<a href="/expenses">← All expenses</a>
<div class="card detail"><p class="eyebrow">{data.expense.category}</p><h1>{formatPaisa(data.expense.amountPaisa)}</h1><p class="muted">Paid by {names.get(data.expense.paidBy)} · Logged by {names.get(data.expense.createdBy)}</p>{#if data.expense.description}<p>{data.expense.description}</p>{/if}<p class="status">{data.expense.status === 'voided' ? 'Cancelled' : data.expense.status.replaceAll('_', ' ')}</p>
{#if data.expense.status === 'voided'}<p class="notice">This expense no longer affects anyone's balance. {data.expense.voidedBy ? `Cancelled by ${names.get(data.expense.voidedBy)}.` : ''} {data.expense.voidReason ?? ''}</p>{/if}
<h2>{data.expense.splitMode === 'custom' ? 'Custom amounts' : 'Split amounts'}</h2>
{#each data.splits as split}<div class="row"><span>{names.get(split.userId)} {split.userId === data.currentUserId ? '(you)' : ''}<small>{split.status === 'rejected' ? 'Rejected — not owed' : split.status}</small></span><strong class:rejected={split.status === 'rejected'}>{formatPaisa(split.sharePaisa)}</strong></div>{/each}
{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
{#if form?.success}<p class="notice" role="status">{form.success}</p>{/if}
{#if data.expense.status === 'pending_approval' && mine?.status === 'pending'}<div class="actions"><form method="POST" action="?/accept" use:enhance><button class="button">Accept my charge</button></form><form method="POST" action="?/reject" use:enhance><button class="secondary">Reject my charge</button></form></div>{/if}
{#if data.expense.status === 'active' && mine?.status === 'confirmed' && mine.sharePaisa > 0 && data.currentUserId !== data.expense.paidBy}<form method="POST" action="?/dispute" class="action" use:enhance><p class="muted">Didn't take part? Remove your charge. The payer covers it; nobody else's share increases.</p><button class="secondary">Not mine — reject my charge</button></form>
{:else if data.expense.status !== 'voided' && (!mine || mine.sharePaisa === 0)}<p class="muted">You have no charge in this expense.</p>{/if}
{#if data.expense.status !== 'voided' && canCancel}<details class="cancel"><summary>Cancel this entire expense</summary><form method="POST" action="?/cancel" use:enhance><p>This removes the expense from everyone's balance and keeps it in history. Confirmed payments remain recorded.</p><label for="reason">Reason</label><textarea id="reason" name="reason" minlength="3" maxlength="500" required placeholder="Wrong amount, duplicate, or entered by mistake"></textarea><label class="confirm"><input type="checkbox" name="confirm" value="yes" required />Cancel for everyone</label><button class="secondary">Confirm cancellation</button></form></details>{/if}
{#if data.expense.status !== 'voided'}{#if data.hasFlagged}<p class="muted">You reported this expense ({data.expense.spamFlagCount}/2 reports).</p>{:else}<form method="POST" action="?/flag" class="action" use:enhance><button class="flag">Report spam ({data.expense.spamFlagCount}/2)</button><p class="muted">Two different roommates' reports cancel spam and issue a strike to its creator.</p></form>{/if}{/if}
</div>
<style>.detail{max-width:620px;margin-top:18px}.eyebrow{text-transform:uppercase;letter-spacing:.13em;color:#0b806b;font-weight:800;font-size:12px}.status{display:inline-block;background:#e6f1ea;border-radius:20px;padding:5px 11px;text-transform:capitalize}.row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid #e7eee8}.row small{display:block;color:#647b75}.row strong{white-space:nowrap}.rejected{text-decoration:line-through;color:#647b75}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}.action{margin-top:18px}.secondary{border:1px solid #8aafa2;background:#fff;border-radius:12px;padding:12px 18px;font-weight:700;color:#205447}.flag{background:none;border:0;color:#a03832;text-decoration:underline;padding:0}.cancel{margin-top:24px;border-top:1px solid #e7eee8;padding-top:16px}.cancel summary{cursor:pointer;font-weight:700}.confirm{display:flex;align-items:center;gap:8px;margin-bottom:16px}.notice{background:#edf5ef;border-radius:10px;padding:12px}</style>
