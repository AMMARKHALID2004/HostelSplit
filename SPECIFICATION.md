# HostelSplit — Full Technical Specification

**Version:** 1.1

**Updated personal-app behavior:** Expense entry supports equal or custom amounts totaling the bill. A charged non-payer may reject their own share; the payer absorbs that amount without increasing other roommates’ shares. The last rejected charge voids the expense. Only the payer or creator can cancel an entire expense, with an audit reason. These updates supersede the redistribution behavior in §5.2 below. Existing confirmed settlements remain recorded when expenses are cancelled.
**Target build environment:** OpenAI Codex (ChatGPT Plus) — this document is written to be handed directly to an AI coding agent as its source of truth. Every section that defines behavior includes exact schemas, formulas, and state machines so no design decision is left to inference.

---

## 0. Project Summary

HostelSplit is a $0/month expense-splitting system for hostel roommates, combining:

1. A **SvelteKit 5 PWA** (mobile-first, installable) for logging and viewing expenses.
2. A **WhatsApp bot** (via Baileys, a linked-device library — not the paid Meta Cloud API) that lets roommates log expenses by typing a command in the group chat.
3. A shared **Turso (LibSQL/SQLite)** database as the single source of truth for both.
4. Built-in **anti-troll defenses** (spam flagging, strikes, a "Cold Drink Penalty" lock) and **zero-merchant P2P settlement** for the Pakistani market (Raast, EasyPaisa, JazzCash, NayaPay, bank transfer).

Non-negotiable constraints:
- No paid APIs, no credit card, no service that sleeps/pauses on inactivity.
- Turso free tier (always-on) for the DB.
- Baileys (open-source, unofficial WhatsApp Web protocol) for the bot — must run as a persistent Node.js process (not a serverless function, since Baileys needs a long-lived socket).
- File/image proof (settlement slips, QR codes) stored as base64 strings in the DB — no S3/R2/Cloudinary.

---

## 1. Tech Stack

| Layer | Choice |
|---|---|
| Frontend framework | SvelteKit 5 (Runes: `$state`, `$derived`, `$effect`) |
| Styling | Tailwind CSS |
| App type | Installable PWA (manifest.json + service worker via `@vite-pwa/sveltekit`) |
| Hosting (web) | Cloudflare Pages or Vercel Hobby |
| Database | Turso (LibSQL / serverless SQLite) |
| DB access | Drizzle ORM + `@libsql/client` |
| WhatsApp bot runtime | Node.js worker using `@whiskeysockets/baileys` |
| Bot hosting | A persistent process — see §9.3 for free always-on options |
| Auth | Simple shared-room PIN/passcode + per-user session cookie (no OAuth needed for a small trusted group) |
| Image/proof storage | Base64 strings in DB (`TEXT` columns), not files on disk |

---

## 2. Database Schema (Turso / LibSQL via Drizzle)

All monetary values are stored as **integers in the smallest currency unit (paisa)** to avoid floating-point rounding errors. Display layer divides by 100 for PKR rupees.

```sql
-- ============================================================
-- users: one row per roommate
-- ============================================================
CREATE TABLE users (
  id              TEXT PRIMARY KEY,          -- uuid
  name            TEXT NOT NULL,
  whatsapp_jid    TEXT UNIQUE,                -- e.g. "923001234567@s.whatsapp.net"
  pin_hash        TEXT,                       -- for PWA login (bcrypt)
  is_locked       INTEGER NOT NULL DEFAULT 0, -- 0/1 — Cold Drink Penalty lock
  strikes         INTEGER NOT NULL DEFAULT 0, -- 0, 1, or 2 (resets on unlock)
  created_at      INTEGER NOT NULL           -- unix ms
);

-- ============================================================
-- payment_profiles: settlement details per user
-- ============================================================
CREATE TABLE payment_profiles (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  method          TEXT NOT NULL,     -- 'raast' | 'easypaisa' | 'jazzcash' | 'nayapay' | 'bank'
  account_title   TEXT,
  account_number  TEXT,
  bank_name       TEXT,              -- nullable, only for 'bank'
  qr_image_base64 TEXT,              -- static personal QR, nullable
  is_primary      INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- expenses: one row per logged expense (the "parent" record)
-- ============================================================
CREATE TABLE expenses (
  id              TEXT PRIMARY KEY,
  amount_paisa    INTEGER NOT NULL,          -- total amount, integer paisa
  category        TEXT NOT NULL,             -- 'chai' | 'mess' | 'delivery' | 'groceries' | 'bills' | 'other'
  description     TEXT,
  paid_by         TEXT NOT NULL REFERENCES users(id),
  created_by      TEXT NOT NULL REFERENCES users(id), -- who logged it (may differ from paid_by)
  source          TEXT NOT NULL,             -- 'pwa' | 'whatsapp'
  status          TEXT NOT NULL DEFAULT 'active',
                    -- 'active' | 'pending_approval' | 'voided' | 'disputed_partial'
  is_targeted     INTEGER NOT NULL DEFAULT 0, -- 1 if it charges a single non-payer 100%
  spam_flag_count INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  resolved_at     INTEGER                     -- when approved/voided, nullable
);

-- ============================================================
-- expense_splits: one row per (expense, participant) pair
-- ============================================================
CREATE TABLE expense_splits (
  id              TEXT PRIMARY KEY,
  expense_id      TEXT NOT NULL REFERENCES expenses(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  share_paisa     INTEGER NOT NULL,          -- this user's share of the expense
  status          TEXT NOT NULL DEFAULT 'confirmed',
                    -- 'confirmed' | 'pending' | 'rejected'
  responded_at    INTEGER
);

-- ============================================================
-- spam_flags: who flagged which expense
-- ============================================================
CREATE TABLE spam_flags (
  id              TEXT PRIMARY KEY,
  expense_id      TEXT NOT NULL REFERENCES expenses(id),
  flagged_by      TEXT NOT NULL REFERENCES users(id),
  created_at      INTEGER NOT NULL,
  UNIQUE(expense_id, flagged_by)             -- one flag per person per expense
);

-- ============================================================
-- penalty_confirmations: "did they bring the cold drink?" confirms
-- ============================================================
CREATE TABLE penalty_confirmations (
  id              TEXT PRIMARY KEY,
  culprit_id      TEXT NOT NULL REFERENCES users(id),
  confirmed_by    TEXT NOT NULL REFERENCES users(id),
  created_at      INTEGER NOT NULL,
  penalty_round   INTEGER NOT NULL,          -- increments each time user is locked again
  UNIQUE(culprit_id, confirmed_by, penalty_round)
);

-- ============================================================
-- settlements: peer-to-peer payment records
-- ============================================================
CREATE TABLE settlements (
  id                  TEXT PRIMARY KEY,
  payer_id            TEXT NOT NULL REFERENCES users(id),
  payee_id            TEXT NOT NULL REFERENCES users(id),
  amount_paisa        INTEGER NOT NULL,
  proof_image_base64  TEXT,                  -- payer's transfer slip screenshot
  status              TEXT NOT NULL DEFAULT 'pending_confirmation',
                        -- 'pending_confirmation' | 'confirmed' | 'rejected'
  created_at          INTEGER NOT NULL,
  confirmed_at        INTEGER
);
```

**Indexes to add:**
```sql
CREATE INDEX idx_expense_splits_user ON expense_splits(user_id);
CREATE INDEX idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_settlements_pair ON settlements(payer_id, payee_id);
```

---

## 3. Mathematical Balance Equations

Let the group have users `U = {u₁, u₂, ..., uₙ}`.

### 3.1 Net balance per user

For each user `uᵢ`, define:

```
paid(uᵢ)  = Σ amount_paisa of all expenses where paid_by = uᵢ AND status = 'active'
owed(uᵢ)  = Σ share_paisa of all expense_splits where user_id = uᵢ
            AND status = 'confirmed'
            AND the parent expense.status = 'active'

net_balance(uᵢ) = paid(uᵢ) - owed(uᵢ)
```

- `net_balance(uᵢ) > 0` → the group owes `uᵢ` money (they overpaid).
- `net_balance(uᵢ) < 0` → `uᵢ` owes the group money.
- Settlements adjust this: every **confirmed** settlement from A→B is equivalent to reducing A's debt and B's credit by that amount. In practice, recompute balances by also folding in settlements:

```
settled_paid(uᵢ)    = Σ amount_paisa of settlements where payer_id = uᵢ AND status = 'confirmed'
settled_received(uᵢ)= Σ amount_paisa of settlements where payee_id = uᵢ AND status = 'confirmed'

adjusted_balance(uᵢ) = net_balance(uᵢ) - settled_received(uᵢ) + settled_paid(uᵢ)
```

Sanity invariant (must always hold, used as a unit-test assertion):
```
Σ adjusted_balance(uᵢ) for all uᵢ ∈ U  ==  0   (± rounding remainder, see §3.3)
```

### 3.2 Splitting an expense among participants

Given an expense of `amount_paisa` split across a set `P` of `k` participants (the payer may or may not be included in `P`):

```
base_share   = floor(amount_paisa / k)
remainder    = amount_paisa - (base_share * k)
```

The `remainder` (0 to k-1 paisa) is distributed one paisa at a time to the **first `remainder` participants**, ordered by `user_id` ascending (deterministic, so re-computation is idempotent). This guarantees:

```
Σ share_paisa across all splits of one expense == amount_paisa   (exact, no leftover)
```

If the payer is included in the split (e.g., "split all" including self), their own `share_paisa` still applies — it simply reduces their net gain from having paid.

### 3.3 Rounding remainder in debt simplification

Because §3.2 already guarantees exact integer distribution at the expense level, `Σ adjusted_balance(uᵢ)` is exactly 0 in paisa at all times (no rounding drift accumulates). Any nonzero sum found in testing indicates a bug (e.g., a split written with floats) and should fail a CI check.

### 3.4 Pairwise "who owes whom" (before simplification)

Before running debt simplification, the itemized ledger between any two users A and B (for the "Why do I owe this?" screen) is:

```
pairwise_debt(A, B) = Σ over all active expenses e where paid_by(e) = B:
                          split_share(A, e)   [amount A owes B for e]
                    - Σ over all active expenses e where paid_by(e) = A:
                          split_share(B, e)   [amount B owes A for e]
                    - confirmed_settlements(A → B) + confirmed_settlements(B → A)
```

A positive result means A owes B that amount; negative means B owes A.

---

## 4. Debt Simplification Algorithm (Greedy Min-Cash-Flow)

**Goal:** given each user's `adjusted_balance`, produce the minimum number of transactions that settle all debts, without necessarily preserving who-originally-owed-whom pairs (that historical detail remains visible in the itemized ledger from §3.4; this section is only for the "Settle Up" suggestions).

### 4.1 Algorithm (standard greedy / max-heap approach)

```
function simplifyDebts(balances: Map<userId, netPaisa>): Transaction[] {
  // 1. Split into creditors (net > 0) and debtors (net < 0)
  let creditors = [...balances].filter(([_, v]) => v > 0)
                                .map(([id, v]) => ({ id, amount: v }));
  let debtors   = [...balances].filter(([_, v]) => v < 0)
                                .map(([id, v]) => ({ id, amount: -v }));

  // 2. Sort descending by amount (largest first) — greedy heuristic
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions: Transaction[] = [];
  let i = 0, j = 0;

  // 3. Repeatedly match the largest debtor to the largest creditor
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);

    if (pay > 0) {
      transactions.push({
        from: debtors[i].id,
        to: creditors[j].id,
        amount_paisa: pay
      });
    }

    debtors[i].amount   -= pay;
    creditors[j].amount -= pay;

    if (debtors[i].amount === 0)   i++;
    if (creditors[j].amount === 0) j++;
  }

  return transactions;
}
```

### 4.2 Complexity & guarantees

- Time complexity: `O(n log n)` for sorting + `O(n)` for matching → effectively `O(n log n)`.
- Produces at most `n - 1` transactions for `n` users with nonzero balances (provably optimal count for this class of greedy algorithms in the general case, though true minimum-transaction-count is NP-hard in the fully general multi-currency case; for a single-currency hostel scenario this greedy result is accepted as "good enough" and is the same approach Splitwise-style apps use).
- Example from the spec doc: if A owes B Rs. 500 and B owes C Rs. 500, then B's net balance is 0, so the algorithm naturally proposes **A pays C Rs. 500 directly**, skipping B entirely.

### 4.3 Where it's used

- The **"Settle Up"** screen calls `simplifyDebts()` server-side on demand (not stored — it's always recomputed live from current `adjusted_balance` values) and shows the user only the transactions where they are `from` or `to`.
- It is **not** used to alter historical `expense_splits` — those remain untouched for the itemized ledger.

---

## 5. Anti-Spam State Machine

### 5.1 Expense status states

```
                 ┌────────────────────┐
                 │   (new expense)     │
                 └──────────┬──────────┘
                            │
              is_targeted? │
        ┌───────────────────┴───────────────────┐
        │ yes (100% charged to a                 │ no (normal split)
        │ single non-payer)                      │
        ▼                                        ▼
 ┌─────────────────┐                     ┌───────────────┐
 │ pending_approval │                     │    active     │
 └────────┬─────────┘                     └───────┬───────┘
          │                                        │
  target accepts │  target rejects                 │ 2+ spam flags
          ▼        ▼                                ▼
     ┌────────┐ ┌─────────┐                   ┌──────────┐
     │ active │ │ voided  │◄──────────────────┤  voided  │
     └────────┘ └─────────┘                     (from active)
```

**Trigger for `pending_approval`:** an expense is flagged `is_targeted = 1` when, after building the split list, exactly one participant is charged 100% of the amount **and that participant is not the payer**. While `pending_approval`, the expense is **excluded from all balance calculations** (§3.1 filters on `status = 'active'`).

**Resolution of `pending_approval`:**
- Target user taps **Accept** → `status = 'active'`, `resolved_at = now`.
- Target user taps **Reject** → `status = 'voided'`, `resolved_at = now`. No strike is issued for a merely-rejected targeted charge (rejection is a normal, expected outcome, not spam) — strikes only come from the spam-flag path (§5.3).

### 5.2 Dispute / self-removal (any active expense)

Any participant tagged in an **active** expense can hit **"Not Mine / Reject"** on their own split row:

```
UPDATE expense_splits SET status = 'rejected', responded_at = now
WHERE expense_id = ? AND user_id = ?;
```

Then the expense's remaining `confirmed` splits are **recalculated** using the §3.2 algorithm over the smaller participant set, and `amount_paisa` on the parent expense is unchanged (the removed person's share is redistributed among the rest). Set `expenses.status = 'disputed_partial'` transiently is not required — recalculation happens in place and status remains `active` as long as at least 2 confirmed participants remain. If only 1 confirmed participant remains, the expense is auto-voided (a "split" of one person makes no sense) and reverts fully to the payer.

### 5.3 Peer spam flagging → strikes → lock (Cold Drink Penalty)

```
1. Any user calls POST /expenses/:id/flag  → insert into spam_flags (unique per user/expense)
2. expenses.spam_flag_count = COUNT(spam_flags WHERE expense_id = ?)
3. IF spam_flag_count >= 2 AND expenses.status != 'voided':
      expenses.status = 'voided'
      expenses.resolved_at = now
      // strike the person who CREATED the voided expense (created_by), not necessarily paid_by
      culprit = expenses.created_by
      users.strikes[culprit] += 1
4. IF users.strikes[culprit] >= 2:
      users.is_locked[culprit] = 1
      users.strikes[culprit] stays at 2 (frozen until unlock, see §5.4)
      → bot posts a public roast message in the WhatsApp group (see §7.4)
      → PWA shows the "cold drink" banner to all other users
```

Voiding an expense at any point (via spam flags) immediately excludes it from all `paid()`/`owed()` sums in §3.1, exactly like `pending_approval`.

### 5.4 Unlock flow

```
1. Culprit (or anyone) marks "I brought the cold drink" in the app,
   OR simply waits for roommates to confirm from the banner.
2. Any OTHER roommate (not the culprit) taps "Confirm" on the banner
   → POST /users/:culprit_id/penalty-confirm
   → INSERT INTO penalty_confirmations (culprit_id, confirmed_by, penalty_round)
3. IF COUNT(DISTINCT confirmed_by) for current penalty_round >= 2:
      users.is_locked[culprit] = 0
      users.strikes[culprit] = 0
      penalty_round += 1   // so a future lock starts a fresh confirmation set
```

### 5.5 Lock enforcement

While `is_locked = 1`:
- `POST /expenses` (PWA) and the WhatsApp `expense ...` command both check `users.is_locked` for the **requesting/paying** user server-side and reject with a friendly error (`"You're locked until the room confirms your cold drink 🥤"`) before any DB write.
- The user can still view balances, flag other expenses, confirm others' penalties, and settle up — only *creating new expenses* is blocked.

---

## 6. Settlement Flow (Zero-Merchant P2P)

```
State machine for `settlements.status`:

  pending_confirmation ──► confirmed   (payee taps "Confirm Received")
                       └──► rejected    (payee taps "This didn't happen" / no proof)
```

1. Payer opens **Settle Up** on a suggested transaction from §4.
2. Modal shows payee's `payment_profiles` row: masked account number + "Copy" button, deep links:
   - EasyPaisa: `easypaisa://send?...` (best-effort deep link; exact query params depend on EasyPaisa's current URI scheme — verify against their published scheme at build time, and always provide the manual account-number fallback since deep-link schemes change without notice)
   - JazzCash: `jazzcash://` similarly, with manual fallback.
   - Static QR image rendered from `qr_image_base64`.
3. Payer completes transfer externally, then uploads a screenshot → stored as `proof_image_base64`, row inserted with `status = 'pending_confirmation'`.
4. Payee gets a notification (in-app + optional WhatsApp bot DM) and reviews the screenshot.
5. Payee taps **Confirm Received** → `status = 'confirmed'`, `confirmed_at = now`. This is the *only* thing that updates `adjusted_balance` (§3.1) — an uploaded-but-unconfirmed screenshot never changes anyone's balance, closing the obvious "I'll just claim I paid" loophole.
6. Payee taps **Reject** → `status = 'rejected'`; payer is notified to re-upload or contact payee directly.

---

## 7. WhatsApp Bot (Baileys)

### 7.1 Connection setup

```js
// bot/index.js
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_state');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true, // scan once to link as a secondary device
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error instanceof Boom &&
         lastDisconnect.error.output?.statusCode) !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      await handleIncomingMessage(sock, msg);
    }
  });
}

startBot();
```

### 7.2 Command grammar & parser

Supported format (case-insensitive, whitespace-tolerant):

```
expense <category> <amount> paid by <payer> for <all | name, name, ...>
```

Examples:
```
expense chai 350 paid by Ali for all
expense mess 1200 paid by Sara for Ali, Sara, Bilal
expense delivery 800 paid by Bilal for Hamza      ← single-target, triggers pending_approval
```

**Regex-based parser:**

```js
const EXPENSE_REGEX =
  /^expense\s+(\w+)\s+(\d+(?:\.\d{1,2})?)\s+paid\s+by\s+([a-zA-Z]+)\s+for\s+(all|[a-zA-Z, ]+)$/i;

function parseExpenseCommand(text) {
  const match = text.trim().match(EXPENSE_REGEX);
  if (!match) return null;

  const [, category, amountStr, payerName, participantsRaw] = match;
  const amount_paisa = Math.round(parseFloat(amountStr) * 100);
  const participants = participantsRaw.trim().toLowerCase() === 'all'
    ? 'ALL'
    : participantsRaw.split(',').map(s => s.trim()).filter(Boolean);

  return { category: category.toLowerCase(), amount_paisa, payerName, participants };
}
```

### 7.3 Message handler flow

```js
async function handleIncomingMessage(sock, msg) {
  const chatId = msg.key.remoteJid;
  const text = extractText(msg); // handles conversation / extendedTextMessage bodies
  if (!text) return;

  const parsed = parseExpenseCommand(text);
  if (!parsed) return; // not an expense command — ignore silently

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const createdBy = await lookupUserByJid(senderJid);
  if (!createdBy) {
    return sock.sendMessage(chatId, { text: '⚠️ You are not registered. Open the app to link your WhatsApp number first.' });
  }

  if (createdBy.is_locked) {
    return sock.sendMessage(chatId, { text: `🥤 You're locked until the room confirms your cold drink, ${createdBy.name}.` });
  }

  const payer = await lookupUserByName(parsed.payerName);
  const participants = parsed.participants === 'ALL'
    ? await getAllRoomUsers()
    : await lookupUsersByNames(parsed.participants);

  if (!payer || participants.length === 0) {
    return sock.sendMessage(chatId, { text: '⚠️ Could not match one or more names. Use exact registered names.' });
  }

  const expense = await createExpense({
    amount_paisa: parsed.amount_paisa,
    category: parsed.category,
    paid_by: payer.id,
    created_by: createdBy.id,
    source: 'whatsapp',
    participants: participants.map(p => p.id),
  }); // internally applies §3.2 split logic + §5.1 targeted-charge detection

  await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

  const summary = formatExpenseSummary(expense, payer, participants);
  await sock.sendMessage(chatId, { text: summary });
}
```

### 7.4 Bot-initiated messages

- **Targeted charge pending:** DM (or group-tag) the target: `"@Hamza — Bilal wants to charge you Rs. 800 for delivery. Reply /accept 1234 or /reject 1234 (open the app for a 1-tap button)."`
- **Cold Drink Penalty roast (public, group chat):** on lock trigger (§5.3 step 4):
  ```
  🚨 STRIKE 2/2 🚨
  @<culprit> just got their troll expense voided by popular vote.
  New expenses are LOCKED until they bring a 1.5L Jumbo cold drink to the room. 🥤
  React ✅ in the app once you've received it.
  ```
- **Settlement notification (DM to payee):** `"💸 <payer> uploaded a payment proof for Rs. <amount>. Open the app to confirm."`

### 7.5 Bot hosting constraint

Baileys requires a **persistent TCP/WebSocket connection** — it cannot run inside a stateless serverless function (Vercel/Cloudflare Functions will kill it after each request). It must run as a long-lived Node process. See §9.3 for free hosting options that satisfy this.

---

## 8. PWA Structure (SvelteKit 5)

```
src/
  routes/
    +layout.svelte              — shell, bottom nav, PWA install prompt
    +page.svelte                — dashboard: net balances, quick "+" button
    login/+page.svelte          — PIN-based room login
    expense/
      new/+page.svelte          — category pills, payer selector, split-all toggle
      [id]/+page.svelte         — expense detail: splits, flag/dispute buttons
    ledger/[userId]/+page.svelte — "Why do I owe this?" itemized timeline
    settle/+page.svelte         — simplified debts (§4) + settle modal
    profile/+page.svelte        — payment_profiles editor, QR upload
    admin/locked/+page.svelte   — cold-drink confirmation banner + confirm button
  lib/
    server/
      db.ts                     — Drizzle + @libsql/client setup
      balances.ts               — implements §3 formulas
      simplify.ts               — implements §4 algorithm
      spam.ts                   — implements §5 state transitions
    components/
      ExpenseCard.svelte
      SplitToggleList.svelte
      SettleModal.svelte
      ColdDrinkBanner.svelte
    stores/
      session.svelte.ts         — $state-based current-user session
static/
  manifest.json
  icons/
```

Key Svelte 5 rune usage example (balance dashboard):

```svelte
<script>
  let { balances } = $props(); // [{ userId, name, amountPaisa }]
  let sorted = $derived([...balances].sort((a, b) => b.amountPaisa - a.amountPaisa));
  let totalOwedToMe = $derived(
    sorted.filter(b => b.amountPaisa > 0).reduce((s, b) => s + b.amountPaisa, 0)
  );
</script>
```

---

## 9. Deployment Guide

### 9.1 Database (Turso)

```bash
# Install Turso CLI, sign up free (no card required)
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup

turso db create hostelsplit
turso db show hostelsplit --url          # copy TURSO_DATABASE_URL
turso db tokens create hostelsplit       # copy TURSO_AUTH_TOKEN

# Run schema (§2) via drizzle-kit
npx drizzle-kit push
```

`.env`:
```
TURSO_DATABASE_URL=libsql://hostelsplit-xxxx.turso.io
TURSO_AUTH_TOKEN=eyJ...
```

Turso's free tier is always-on (no pause-on-inactivity), which is why it was chosen over Supabase for this project.

### 9.2 Frontend (SvelteKit PWA)

```bash
npm create svelte@latest hostelsplit-web
cd hostelsplit-web
npm i -D @vite-pwa/sveltekit tailwindcss
npm i drizzle-orm @libsql/client
```

Deploy to **Cloudflare Pages** (recommended — generous free tier, no cold-start pause issues for the frontend itself, since only the *bot* needs a persistent process, not the web app):

```bash
npm run build
npx wrangler pages deploy .svelte-kit/cloudflare
```

Or **Vercel Hobby**:
```bash
vercel --prod
```
Set the same `TURSO_*` env vars in the platform's dashboard.

### 9.3 WhatsApp Bot (Baileys) — free always-on hosting options

Since Vercel/Cloudflare Functions cannot host a persistent socket, pick one:

| Option | Notes |
|---|---|
| **Local machine (always-on PC/laptop/Raspberry Pi)** | Simplest, $0, but depends on your device staying powered and connected. Use `pm2` to keep the process alive and auto-restart on crash/reboot. |
| **Free-tier always-on VM (e.g., Oracle Cloud "Always Free" ARM instance)** | True 24/7 free VM with no sleep — best long-term option if you want it hosted off your own device. |
| **A spare Android phone running Termux + Node.js** | Cheap and effectively dedicated hardware; keep it plugged in and on Wi-Fi. |

Whichever host is used, run the bot with process supervision:

```bash
npm i -g pm2
pm2 start bot/index.js --name hostelsplit-bot
pm2 save
pm2 startup   # generates the OS-level auto-start command
```

The bot connects to the same Turso database via `@libsql/client`, using the same `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` env vars as the web app — **both processes read/write the same tables**, so a balance updated via WhatsApp appears instantly in the PWA and vice versa.

### 9.4 First-time WhatsApp linking

1. Run the bot locally once: `node bot/index.js`.
2. Scan the printed QR code from WhatsApp on the phone that will represent "HostelSplit Bot" → **Linked Devices → Link a Device**.
3. Auth state is saved to `./auth_state` — copy this folder to the always-on host so it doesn't need re-scanning there.
4. Add the bot's linked number to the hostel WhatsApp group.

### 9.5 Registering roommates (linking WhatsApp JIDs to app users)

Since there's no paid business API, phone-number verification is manual/trusted (a small hostel room, not the public internet):
1. Roommate signs up in the PWA with name + room PIN.
2. Roommate sends **any** message in the WhatsApp group once; the bot's message handler captures `msg.key.participant` (their JID) on first sight.
3. Admin (or the roommate themselves via `/link <code>` in-app-generated one-time code) confirms the JID↔user mapping, stored in `users.whatsapp_jid`.

---

## 10. Suggested Build Order (for Codex)

1. **Schema + Drizzle setup** (§2) — get Turso connected, run migrations, seed 3–4 test users.
2. **Balance math + tests** (§3) — write `balances.ts` and unit tests asserting the zero-sum invariant.
3. **Expense creation + splitting** (§3.2, §5.1) — PWA "new expense" form only, no bot yet.
4. **Debt simplification** (§4) — `simplify.ts` + unit tests against the "A owes B owes C" example.
5. **Anti-spam state machine** (§5) — flags, strikes, lock/unlock, targeted-charge pending approval.
6. **Settlement flow** (§6).
7. **Baileys bot** (§7) — connect, parse, write to the same DB functions built in steps 2–5 (do not duplicate business logic in the bot — import the same `createExpense()`, `flagExpense()` etc. from `lib/server/`).
8. **PWA polish + manifest/service worker** (§8).
9. **Deploy** (§9).

---

## 11. Open Implementation Notes / Decisions Left Flexible

- **Currency formatting:** display as `Rs. X,XXX` (PKR), computed from `amountPaisa / 100`.
- **Session/auth:** a shared room PIN is sufficient for a trusted small group; do not over-engineer with full OAuth unless requested.
- **EasyPaisa/JazzCash deep-link URI schemes** change without notice from those providers — always ship the manual copy-account-number fallback as the primary reliable path, deep links as a "nice to have."
- **Timezone:** store all `created_at`/`resolved_at` as UTC unix ms; display in `Asia/Karachi` on the frontend.
