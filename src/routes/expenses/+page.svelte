<script lang="ts">
  import { formatPaisa } from '$lib/format';
  let { data } = $props();
  let names = $derived(new Map(data.people.map(p => [p.id, p.name])));
  let shares = $derived(new Map(data.mine.map(s => [s.expenseId, s])));
</script>
<a href="/">← Dashboard</a><h1>Expense history</h1><p class="muted">Open any expense to review your charge, reject it, or cancel an entry you paid for or created.</p>
<section class="card">{#each data.expenses as expense}{@const mine = shares.get(expense.id)}<a class="entry" href="/expense/{expense.id}"><div><strong>{expense.description || expense.category}</strong><small>{names.get(expense.paidBy)} paid · {new Date(expense.createdAt).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' })} · {expense.status === 'voided' ? 'Cancelled' : expense.status.replaceAll('_', ' ')}</small><small>{expense.status === 'voided' ? 'No charge — cancelled' : mine?.status === 'rejected' ? 'Your charge was rejected' : mine ? `Your share: ${formatPaisa(mine.sharePaisa)}${mine.status === 'pending' ? ' (awaiting approval)' : ''}` : 'You were not included'}</small></div><strong>{formatPaisa(expense.amountPaisa)}</strong></a>{:else}<p>No expenses on this page.</p>{/each}</section>
<div class="pagination">{#if data.page > 1}<a class="button" href="/expenses?page={data.page - 1}">Newer</a>{/if}<span>Page {data.page}</span>{#if data.hasMore}<a class="button" href="/expenses?page={data.page + 1}">Older</a>{/if}</div>
<style>h1{margin-top:20px}.entry{display:flex;justify-content:space-between;gap:12px;text-decoration:none;padding:16px 0;border-bottom:1px solid #e7eee8}.entry:last-child{border:0}.entry small{display:block;color:#647b75;margin-top:5px}.entry>strong{white-space:nowrap}.pagination{display:flex;align-items:center;justify-content:center;gap:20px;margin:24px 0}</style>
