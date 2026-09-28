<script lang="ts">let { form } = $props();</script>
<section class="login card"><p class="eyebrow">Welcome home</p><h1>Split the bill.<br />Keep the peace.</h1><p class="muted">Use your username or name and your sign-in PIN. Names shared by multiple people require a username.</p>
  <form method="POST">
    <label for="name">Your name</label><input id="name" name="name" autocomplete="name" placeholder="The name you joined with" />
    <label for="username">Unique username (or sign in with your name)</label><input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false"  minlength="3" maxlength="24" pattern="[a-zA-Z0-9_]+" /><label for="pin">Sign-in PIN</label><input id="pin" name="pin" type="password" autocomplete="current-password" required />
    {#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
    <button class="button">Enter room</button>
  </form>
  <p><a href="/signup">New roommate? Join a room</a></p>
</section>
<style>.login{max-width:440px;margin:5vh auto;padding:30px}.eyebrow{color:#0f8b71;text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:800}.button{width:100%;margin-top:24px}</style>
