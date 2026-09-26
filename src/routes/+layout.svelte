<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  let { data, children } = $props();
  let installEvent = $state<Event | null>(null);
  onMount(() => {
    void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
    const offer = (event: Event) => { event.preventDefault(); installEvent = event; };
    window.addEventListener('beforeinstallprompt', offer);
    return () => window.removeEventListener('beforeinstallprompt', offer);
  });
  async function install() {
    if (!installEvent) return;
    await (installEvent as Event & { prompt: () => Promise<void> }).prompt();
    installEvent = null;
  }
</script>

<svelte:head><title>HostelSplit</title><meta name="theme-color" content="#123b38" /><link rel="manifest" href="/manifest.json" /></svelte:head>
<div class="shell">
  <header><a href="/" class="brand">Hostel<span>Split</span></a><span class="who">{data.user?.name ?? 'Roommates, settled.'}</span>{#if installEvent}<button class="install" onclick={install}>Install app</button>{/if}</header>
  <main>{@render children()}</main>
  {#if data.user}
    <nav aria-label="Main navigation"><a href="/">Home</a><a href="/expense/new">Add expense</a><a href="/settle">Settle up</a><a href="/profile">Profile</a><form method="POST" action="/logout"><button>Log out</button></form></nav>
  {/if}
</div>

<style>
  :global(*){box-sizing:border-box} :global(body){margin:0;background:#f4f6f2;color:#15302d;font:16px/1.45 system-ui,sans-serif} :global(a){color:inherit} :global(button),:global(input),:global(select),:global(textarea){font:inherit} :global(button){cursor:pointer} :global(.card){background:white;border:1px solid #dce7e0;border-radius:18px;padding:20px;box-shadow:0 5px 20px #123b3809} :global(.muted){color:#647b75} :global(.error){color:#a02e34} :global(.button){display:inline-block;border:0;border-radius:12px;background:#126b5d;color:white;padding:12px 18px;text-decoration:none;font-weight:700} :global(label){display:block;font-weight:650;margin:16px 0 6px} :global(input:not([type=checkbox])),:global(select),:global(textarea){width:100%;padding:12px;border:1px solid #b9cfc5;border-radius:10px;background:white} :global(h1){font-size:clamp(28px,5vw,40px);line-height:1.1;margin:0 0 12px} :global(h2){font-size:21px;margin:0 0 14px}
  .shell{max-width:900px;margin:auto;min-height:100vh;padding:0 18px 100px} header{height:76px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dce7e0}.brand{font-size:24px;font-weight:850;text-decoration:none;letter-spacing:-1px}.brand span{color:#0f8b71}.who{color:#54716b;font-size:14px}.install{border:0;border-radius:8px;background:#d4f6df;padding:7px 10px;color:#123b38;font-weight:700}main{padding-top:28px}nav{position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:center;gap:6px;background:white;border-top:1px solid #dce7e0;padding:10px max(12px,calc((100vw - 900px)/2));z-index:2;overflow-x:auto}nav a,nav button{display:block;padding:10px 12px;text-decoration:none;border:0;background:none;color:#28534b;font-size:14px;font-weight:700;white-space:nowrap}nav a:hover,nav button:hover{background:#e9f3ed;border-radius:8px}nav form{margin:0}@media(max-width:600px){nav{justify-content:flex-start}.who{display:none}}
</style>
