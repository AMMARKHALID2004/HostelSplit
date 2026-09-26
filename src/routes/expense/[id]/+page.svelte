<script lang="ts">
  import { formatPaisa } from '$lib/format';
  let { data, form } = $props();
  let names = $derived(new Map(data.roommates.map((u) => [u.id, u.name])));
  let mine = $derived(data.splits.find((s) => s.userId === data.currentUserId));
</script>
<a href="/">← Dashboard</a><div class="card detail"><p class="eyebrow">{data.expense.category}</p><h1>{formatPaisa(data.expense.amountPaisa)}</h1><p class="muted">Paid by {names.get(data.expense.paidBy)} · Logged by {names.get(data.expense.createdBy)}</p>{#if data.expense.description}<p>{data.expense.description}</p>{/if}<p class="status">{data.expense.status.replaceAll('_', ' ')}</p><h2>Split</h2>{#each data.splits as split}<div class="row"><span>{names.get(split.userId)} <small>{split.status}</small></span><strong>{formatPaisa(split.sharePaisa)}</strong></div>{/each}
{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
{#if data.expense.status === 'pending_approval' && mine?.status === 'pending'}<div class="actions"><form method="POST" action="?/accept"><button class="button">Accept charge</button></form><form method="POST" action="?/reject"><button class="secondary">Reject charge</button></form></div>{/if}
{#if data.expense.status === 'active' && mine?.status === 'confirmed'}<form method="POST" action="?/dispute" class="action"><button class="secondary">Not mine / reject my share</button></form>{/if}
{#if data.expense.status !== 'voided'}<form method="POST" action="?/flag" class="action"><button class="flag">Flag as spam ({data.expense.spamFlagCount}/2)</button></form>{/if}
</div>
<style>.detail{max-width:620px;margin-top:18px}.eyebrow{text-transform:uppercase;letter-spacing:.13em;color:#0b806b;font-weight:800;font-size:12px}.status{display:inline-block;background:#e6f1ea;border-radius:20px;padding:5px 11px;text-transform:capitalize}.row{display:flex;justify-content:space-between;padding:12px 0;border-top:1px solid #e7eee8}.row small{color:#647b75;margin-left:8px}.actions{display:flex;gap:10px;margin-top:24px}.action{margin-top:18px}.secondary{border:1px solid #8aafa2;background:#fff;border-radius:12px;padding:12px 18px;font-weight:700;color:#205447}.flag{background:none;border:0;color:#a03832;text-decoration:underline;padding:0}</style>
