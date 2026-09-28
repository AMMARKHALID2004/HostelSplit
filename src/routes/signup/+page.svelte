<script lang="ts">
 import { passwordPattern, passwordHelp } from '$lib/password';
 let { data, form } = $props();
</script>
<section class="card signup"><p class="eyebrow">Your own profile</p><h1>Welcome to HostelSplit.</h1><p class="muted">Create your profile, then create a room or join your friends.</p><form method="POST" enctype="multipart/form-data">
<label for="name">Name</label><input id="name" name="name" autocomplete="name" required minlength="2" maxlength="40" value={form?.name ?? ''} />
<label for="username">Unique username</label><input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required minlength="3" maxlength="24" pattern="[a-zA-Z0-9_]+" value={form?.username ?? ''} />
<label for="avatar">Profile picture (optional)</label><input id="avatar" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" /><p class="muted">PNG, JPEG or WebP, up to 1.5 MB.</p>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="72" pattern={passwordPattern} aria-describedby="password-help" /><p id="password-help" class="muted">{passwordHelp}</p>
<label for="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" autocomplete="new-password" required minlength="10" maxlength="72" />
{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}<button class="button">Create profile</button></form><p><a href="/login{data.roomId ? `?room=${encodeURIComponent(data.roomId)}` : ''}">Already have a profile? Sign in</a></p></section>
<style>.signup{max-width:520px;margin:3vh auto}.button{width:100%;margin:24px 0}</style>
