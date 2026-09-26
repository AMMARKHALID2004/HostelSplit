<script lang="ts">
  let { data, form } = $props();
  let selectAll = $state(true);
</script>
<div class="heading"><div><p class="eyebrow">New expense</p><h1>Who paid for what?</h1><p class="muted">Amounts are split in exact paisa. A charge to one other roommate waits for their approval.</p></div></div>
<form class="card" method="POST">
  <div class="fields"><div><label for="amount">Amount (Rs.)</label><input id="amount" name="amount" inputmode="decimal" placeholder="350.00" required /></div><div><label for="category">Category</label><select id="category" name="category"><option value="chai">Chai</option><option value="mess">Mess</option><option value="delivery">Delivery</option><option value="groceries">Groceries</option><option value="bills">Bills</option><option value="other">Other</option></select></div></div>
  <label for="paidBy">Paid by</label><select id="paidBy" name="paidBy" required>{#each data.users as user}<option value={user.id} selected={user.id === data.currentUserId}>{user.name}</option>{/each}</select>
  <label for="description">Note (optional)</label><input id="description" name="description" maxlength="500" placeholder="Late night snacks" />
  <div class="participants"><div><h2>Split between</h2><button type="button" class="text-button" onclick={() => selectAll = !selectAll}>{selectAll ? 'Clear all' : 'Select all'}</button></div>{#each data.users as user}<label class="person"><input type="checkbox" name="participants" value={user.id} checked={selectAll} />{user.name}</label>{/each}</div>
  {#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
  <button class="button">Save expense</button>
</form>
<style>.heading{margin-bottom:22px}.eyebrow{color:#0a7861;text-transform:uppercase;letter-spacing:.12em;font-weight:800;font-size:12px}.card{max-width:620px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}.participants{margin:28px 0 20px}.participants>div{display:flex;align-items:center;justify-content:space-between}.participants h2{margin:0}.text-button{background:none;border:0;color:#0b806b;font-weight:700}.person{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #e8efea;margin:0}.person input{width:18px;height:18px}.button{width:100%}@media(max-width:520px){.fields{grid-template-columns:1fr}}</style>
