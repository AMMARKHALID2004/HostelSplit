<script lang="ts">
  import { formatPaisa } from '$lib/format';
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  let { data } = $props();
  let mine = $derived(data.balances.find((b) => b.userId === data.currentUserId)?.amountPaisa ?? 0);
  let names = $derived(new Map(data.roommates.map((u) => [u.id, u.name])));
  let copied = $state(false);
  let localPreview = $state(false);
  let inviteUrl = $state('');
  let inviteInput = $state<HTMLInputElement>();
  onMount(() => {
    localPreview = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    inviteUrl = new URL('/signup', window.location.origin).href;
    const refresh = () => { if (document.visibilityState === 'visible') void invalidateAll(); };
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  });
  async function shareRoom() {
    if (navigator.share) {
      try { await navigator.share({ title: 'Join our HostelSplit room', text: 'Open this link and enter our room PIN to join.', url: inviteUrl }); return; }
      catch { /* user dismissed the share sheet */ }
    }
    try {
      if (navigator.clipboard) { await navigator.clipboard.writeText(inviteUrl); copied = true; return; }
    } catch { /* HTTP or browser policy may block clipboard access */ }
    inviteInput?.select();
    copied = document.execCommand('copy');
  }
</script>

<section class="hero card"><div><p class="eyebrow">Your room, at a glance</p><h1>{mine < 0 ? 'You owe the room' : mine > 0 ? 'The room owes you' : 'All square.'}</h1><p class="amount">{formatPaisa(Math.abs(mine))}</p><p class="muted">Balances include confirmed expenses and payments.</p></div><a class="button" href="/expense/new">+ Add expense</a></section>
{#if data.roommates.some((u) => u.isLocked)}<a class="notice" href="/admin/locked">🥤 Cold drink confirmation needed. Review the locked roommates →</a>{/if}
{#each data.pendingApprovals as id}<a class="notice" href="/expense/{id}">A roommate wants to charge you. Review this expense →</a>{/each}
<div class="grid"><section class="card"><h2>Room balances</h2>{#each data.balances as balance}<div class="row"><span>{#if balance.userId !== data.currentUserId}<a href="/ledger/{balance.userId}">{balance.name}</a>{:else}{balance.name}{/if}</span><strong class:negative={balance.amountPaisa < 0}>{formatPaisa(balance.amountPaisa)}</strong></div>{/each}</section>
<section class="card"><h2>Recent expenses</h2><p><a href="/expenses">View all expenses and review your charges →</a></p>{#if data.recent.length}{#each data.recent as expense}<a class="row expense" href="/expense/{expense.id}"><span><strong>{expense.category}</strong><small>{names.get(expense.paidBy)} paid · {expense.status.replaceAll('_', ' ')}</small></span><strong>{formatPaisa(expense.amountPaisa)}</strong></a>{/each}{:else}<p class="muted">No expenses yet. Add the first one.</p>{/if}</section></div>
<section class="card invite"><h2>Invite your roommates</h2>{#if localPreview}<p class="muted">This is a local preview. Invite friends from your deployed pages.dev address.</p>{:else}<p class="muted">Share the room link and tell them the PIN you chose during setup. Everyone who joins sees the same balances.</p><label for="invite-url">Join link</label><input id="invite-url" readonly value={inviteUrl} bind:this={inviteInput} onclick={() => inviteInput?.select()} /><button class="button" onclick={shareRoom}>{copied ? 'Link copied' : 'Share join link'}</button>{/if}</section>
<style>.hero{display:flex;justify-content:space-between;align-items:end;gap:20px;background:#e3f3e9;border-color:#c5e2d3;margin-bottom:18px}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:12px;font-weight:800;color:#0a7861}.amount{font-size:36px;font-weight:850;margin:8px 0}.hero .muted{margin-bottom:0}.notice{display:block;background:#fff6d9;border:1px solid #eecb69;border-radius:12px;padding:13px;margin-bottom:18px;text-decoration:none;font-weight:700}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.row{display:flex;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid #e8efea}.row:last-child{border:0}.negative{color:#a03832}.expense{text-decoration:none}.expense small{display:block;color:#647b75;margin-top:2px}.expense:hover{color:#0a7861}.invite{margin-top:18px}.invite p{max-width:55ch}@media(max-width:650px){.hero{display:block}.hero .button{margin-top:18px}.grid{grid-template-columns:1fr}}</style>
