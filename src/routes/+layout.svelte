<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  const links = [['/', 'Overview', '◫'], ['/expense/new', 'Add expense', '+'], ['/expenses', 'Expenses', '▤'], ['/settle', 'Settle up', '⇄'], ['/reviews', 'Reviews', '⚖'], ['/invite', 'Invite', '↗'], ['/profile', 'Profile', '◎']];
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
<div class="shell" class:authenticated={data.user?.membershipStatus === 'approved'}>
  <header><a href="/" class="brand"><span class="brand-icon">H<span>↗</span></span>Hostel<span>Split</span></a><div class="header-right">{#if installEvent}<button class="install" onclick={install}>Install app</button>{/if}<span class="who">{data.user?.name ?? 'Roommates, settled.'}</span>{#if data.user}<span class="avatar">{data.user.name.slice(0, 1)}</span>{/if}</div></header>
  {#if data.user?.membershipStatus === 'approved'}
    <aside><p class="nav-heading">YOUR ROOM</p><nav aria-label="Main navigation">{#each links as [href, label, icon]}<a {href} class:active={page.url.pathname === href} aria-current={page.url.pathname === href ? 'page' : undefined}><span aria-hidden="true">{icon}</span>{label}</a>{/each}{#if data.user.isOwner}<a href="/notifications" class:active={page.url.pathname === '/notifications'}><span aria-hidden="true">♧</span>Slack</a>{/if}</nav><div class="sidebar-footer"><p>Shared bills.<br /><strong>Good company.</strong></p><form method="POST" action="/logout"><button>Log out ↗</button></form></div></aside>
  {/if}
  <main>{@render children()}</main>
</div>
<style>
  .shell{max-width:1440px;margin:auto;min-height:100vh;padding:0 32px 60px}header{height:88px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dce7e0;gap:14px}.brand{display:flex;align-items:center;font-size:24px;font-weight:850;text-decoration:none;letter-spacing:-1px}.brand>span:last-child{color:#0f8b71}.brand-icon{display:flex;align-items:center;justify-content:center;background:#164c42;color:#fff;border-radius:12px;width:40px;height:40px;margin-right:10px;font-size:20px;letter-spacing:-2px}.brand-icon span{color:#c7ed96;font-size:18px}.header-right{display:flex;align-items:center;gap:12px}.who{color:#54716b;font-size:14px;max-width:200px;overflow:hidden;text-overflow:ellipsis}.avatar{display:grid;place-items:center;width:38px;height:38px;background:#dcebd5;border-radius:50%;font-weight:800}.install{border:0;border-radius:8px;background:#d4f6df;padding:7px 10px;color:#123b38;font-weight:700}main{padding-top:36px;min-width:0}.authenticated{display:grid;grid-template-columns:200px minmax(0,1fr);column-gap:36px}.authenticated header{grid-column:1/-1}aside{padding-top:36px;border-right:1px solid #dce7e0;padding-right:22px;display:flex;flex-direction:column}.nav-heading{font-size:10px;letter-spacing:.18em;color:#789088;margin:0 0 18px 14px;font-weight:800}nav{display:flex;flex-direction:column;gap:7px}nav a{display:flex;align-items:center;gap:13px;padding:12px 14px;text-decoration:none;color:#577067;font-size:14px;font-weight:650;border-radius:12px;transition:background .15s,color .15s,transform .15s}nav a span{font-size:21px;width:22px;text-align:center}nav a:hover{background:#e6eee7;color:#164c42;transform:translateX(2px)}nav a.active{background:#164c42;color:white;box-shadow:0 4px 12px #164c4218}.sidebar-footer{margin-top:auto;padding:50px 14px 0;font-size:13px;color:#789088}.sidebar-footer button{border:0;background:none;padding:10px 0;color:#385d50;font-weight:700}
  @media(max-width:850px){.shell{padding:0 18px 40px}.authenticated{display:block}header{height:76px}.who{display:none}aside{padding:16px 0;border:0}.nav-heading,.sidebar-footer{display:none}nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}nav a{justify-content:center;gap:5px;padding:9px 3px;font-size:11px;background:#eaf0e8}nav a span{font-size:17px;width:18px}nav a:hover{transform:none}main{padding-top:18px}}
</style>
