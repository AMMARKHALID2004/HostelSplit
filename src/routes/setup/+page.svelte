<script lang="ts">let { form } = $props();</script>
<section class="card setup"><p class="eyebrow">First-time setup</p><h1>Create your room.</h1><p class="muted">Choose a shared PIN. Give the app link and PIN to your friends so they can join on their own phones.</p>
  <form method="POST">
    <label for="name">Your name</label><input id="name" name="name" autocomplete="name" required minlength="2" maxlength="40" />
    <label for="username">Unique username</label><input id="username" name="username" autocomplete="username" required minlength="3" maxlength="24" /><label for="pin">Room PIN (4–8 digits)</label><input id="pin" name="pin" type="password" inputmode="numeric" pattern={'[0-9]{4,8}'} autocomplete="new-password" required />
    <label for="confirm">Confirm PIN</label><input id="confirm" name="confirm" type="password" inputmode="numeric" pattern={'[0-9]{4,8}'} autocomplete="new-password" required />
    {#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
    <button class="button">Create room</button>
  </form>
</section>
<style>.setup{max-width:480px;margin:5vh auto;padding:30px}.eyebrow{color:#0f8b71;text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:800}.button{width:100%;margin-top:24px}</style>
