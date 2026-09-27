<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  let { data, form } = $props();
  let copied = $state(false);
  let field = $state<HTMLInputElement>();
  onMount(() => { const t = setInterval(() => { if (document.visibilityState === 'visible') void invalidateAll(); }, 15000); return () => clearInterval(t); });
  async function share() {
    if (navigator.share) { try { await navigator.share({ title: 'Join our HostelSplit room', url: data.inviteUrl }); return; } catch { /* copy fallback */ } }
    try { await navigator.clipboard.writeText(data.inviteUrl); copied = true; } catch { field?.select(); copied = document.execCommand('copy'); }
  }
</script>
<p class="eyebrow">People & invitations</p><h1>Make room for your friends.</h1>
<div class="section-grid"><section class="card"><span class="section-icon">↗</span><h2>Invite a roommate</h2><p class="muted">Share this link and give your friend the room PIN privately. The room creator approves every new member.</p><label for="invite">Invitation link</label><input id="invite" readonly value={data.inviteUrl} bind:this={field} onclick={() => field?.select()} /><button class="button" onclick={share}>{copied ? 'Link copied' : 'Share invitation'}</button></section>
<section class="card"><span class="section-icon">◎</span><h2>Join requests</h2>{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}{#if form?.success}<p class="success" role="status">{form.success}</p>{/if}
{#if data.isOwner}{#each data.pending as person}<article class="member-request"><strong>{person.name}</strong><p class="muted">@{person.username}</p><form method="POST" action="?/review" use:enhance><input type="hidden" name="id" value={person.id} /><div class="button-row"><button class="button" name="decision" value="approve">Approve</button><button class="secondary" name="decision" value="decline">Decline</button></div></form></article>{:else}<p class="muted">No requests waiting. New requests appear here.</p>{/each}{:else}<p class="muted">Only the room creator can review membership requests.</p>{/if}</section></div>
<style>.member-request{padding:18px 0;border-top:1px solid #dce7e0}.card>.button{margin-top:20px}</style>
