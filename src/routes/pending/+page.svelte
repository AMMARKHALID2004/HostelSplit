<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  let { data } = $props();
  onMount(() => { const timer = setInterval(() => { if (document.visibilityState === 'visible') void invalidateAll(); }, 15000); return () => clearInterval(timer); });
</script>
<section class="card"><p class="eyebrow">Membership</p><h1>{data.status === 'pending' ? 'Waiting for a welcome.' : 'Request declined'}</h1><p>{data.name} · @{data.username}</p><p class="muted">{data.status === 'pending' ? 'The room creator needs to approve your request. This page checks automatically; you can also refresh.' : 'Speak to the room creator about joining.'}</p><button class="button" onclick={() => invalidateAll()}>Check status</button><form method="POST" action="/logout"><button class="secondary">Log out</button></form><p><a href="/rooms">Switch or create a room →</a></p></section>
