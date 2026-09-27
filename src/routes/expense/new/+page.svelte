<script lang="ts">
  import { enhance } from '$app/forms';
  import { untrack } from 'svelte';
  import { buildSplits, parseRupees } from '$lib/money';
  import { formatPaisa } from '$lib/format';
  let { data, form } = $props();
  const initial = untrack(() => form?.values);
  let amount = $state(initial?.amount ?? '');
  let category = $state(initial?.category ?? 'chai');
  let paidBy = $state(initial?.paidBy ?? untrack(() => data.currentUserId));
  let description = $state(initial?.description ?? '');
  let splitMode = $state(initial?.splitMode ?? 'equal');
  let selected = $state<string[]>(initial?.participants ?? untrack(() => data.users.map(u => u.id)));
  let shares = $state<Record<string, string>>(initial?.shares ?? {});
  let submitting = $state(false);
  let total = $derived.by(() => { try { return parseRupees(amount); } catch { return 0; } });
  let assigned = $derived(selected.reduce((sum, id) => { try { return sum + parseRupees(shares[id] ?? ''); } catch { return sum; } }, 0));
  let equalShares = $derived.by(() => { try { return new Map(buildSplits(total, selected).map(s => [s.userId, s.sharePaisa])); } catch { return new Map<string, number>(); } });
</script>
<div class="heading"><p class="eyebrow">New expense</p><h1>Who paid for what?</h1><p class="muted">Choose who took part, then split equally or enter what each person consumed. Include the payer's own portion in the total.</p></div>
<form class="card" method="POST" use:enhance={() => { submitting = true; return async ({ update }) => { try { await update({ reset: false }); } finally { submitting = false; } }; }}>
  <div class="fields"><div><label for="amount">Total paid (Rs.)</label><input id="amount" name="amount" inputmode="decimal" placeholder="350.00" bind:value={amount} required /></div><div><label for="category">Category</label><select id="category" name="category" bind:value={category}><option value="chai">Chai</option><option value="mess">Mess</option><option value="delivery">Delivery</option><option value="groceries">Groceries</option><option value="bills">Bills</option><option value="other">Other</option></select></div></div>
  <label for="paidBy">Paid by</label><select id="paidBy" name="paidBy" bind:value={paidBy} required>{#each data.users as user}<option value={user.id}>{user.name}</option>{/each}</select>
  <label for="description">Note (optional)</label><input id="description" name="description" maxlength="500" placeholder="Late night snacks" bind:value={description} />
  <label for="split-mode">How to split</label><select id="split-mode" name="splitMode" bind:value={splitMode}><option value="equal">Split equally</option><option value="custom">Custom amount for each person</option></select>
  <div class="participants"><div class="participants-heading"><h2>Split between</h2><button type="button" class="text-button" onclick={() => selected = selected.length === data.users.length ? [] : data.users.map(u => u.id)}>{selected.length === data.users.length ? 'Clear all' : 'Select all'}</button></div>
    {#each data.users as user}<div class="person"><label><input type="checkbox" name="participants" value={user.id} bind:group={selected} />{user.name}{user.id === paidBy ? ' (payer)' : ''}</label>
      {#if selected.includes(user.id)}{#if splitMode === 'custom'}<input class="share-input" aria-label={`${user.name}'s amount in rupees`} name={`share_${user.id}`} inputmode="decimal" placeholder="Rs. 0.00" bind:value={shares[user.id]} required />{:else}<span>{formatPaisa(equalShares.get(user.id) ?? 0)}</span>{/if}{/if}
    </div>{/each}
  </div>
  {#if splitMode === 'custom'}<p class:error={assigned !== total} aria-live="polite">Assigned {formatPaisa(assigned)} of {formatPaisa(total)}. {assigned < total ? `${formatPaisa(total - assigned)} left to assign.` : assigned > total ? `${formatPaisa(assigned - total)} over the total.` : 'Amounts match.'}</p>{/if}
  <p class="muted">A charge entirely to one other roommate waits for their approval.</p>
  {#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
  <button class="button" disabled={submitting}>{submitting ? 'Saving…' : 'Save expense'}</button>
</form>
<style>.heading{margin-bottom:22px}.eyebrow{color:#0a7861;text-transform:uppercase;letter-spacing:.12em;font-weight:800;font-size:12px}.card{max-width:620px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}.participants{margin:28px 0 20px}.participants-heading{display:flex;align-items:center;justify-content:space-between}.participants h2{margin:0}.text-button{background:none;border:0;color:#0b806b;font-weight:700}.person{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #e8efea}.person label{display:flex;align-items:center;gap:10px;margin:0}.person input[type=checkbox]{width:18px;height:18px}.person .share-input{width:130px;flex-shrink:0}.person span{white-space:nowrap}.button{width:100%}.button:disabled{opacity:.6}@media(max-width:520px){.fields{grid-template-columns:1fr}.person .share-input{width:110px}}</style>
