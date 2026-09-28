# HostelSplit

A personal expense app for separate roommate rooms, hosted at **https://hostelsplit.pages.dev** on Cloudflare Pages with Turso. Money is stored as integer paisa. Slack Incoming Webhooks send notifications directly from Pages Functions; no persistent bot or OAuth runtime is needed.

## Accounts and membership

- Visitors first see **Create your profile** and **Sign in**. Profiles are independent of rooms: name, unique username, optional picture and a personal password.
- Passwords require 10–72 characters including uppercase, lowercase, number and symbol, without spaces (maximum 72 UTF-8 bytes). Both browser and server validate; the database stores bcrypt hashes at cost 12, never plaintext passwords.
- After signup, choose **Create a new room** or **Join an existing room** using an invitation link/code and its room PIN. The PIN is only for joining; it is not the account password. Join requests need the room creator’s approval.
- A room creator is its owner. Only the owner manages approvals, Slack settings and administrator actions. Every room has separate memberships, balances, expenses, payment methods, reviews and penalties. Switch rooms from **Rooms**.
- Sign in using a unique username, or an unambiguous display name, and your personal password. Duplicate names are allowed. Usernames are case-insensitive, 3–24 letters/numbers/underscores. **Profile** lets you change identity, picture and password.
- Signed-in devices reopen the selected room dashboard. Sessions use random opaque tokens, stored only as SHA-256 hashes in the database, with HttpOnly, Secure production cookies. The one-year cookie renews with continued use. Clearing browser data, expiry or changing the password requires signing in again; signing out revokes that device’s token.
- Existing profiles and room history are preserved. Already signed-in members get a one-time password setup screen. Otherwise sign in once with the old username (or unique name) and old PIN in the password field, then set a personal password. This removes the account’s old PIN hash and revokes other saved sessions.
- Pending/declined accounts cannot access room data or make changes there, but can manage their profile or create another room.

## Expenses, reviews and penalties

Choose equal or custom amounts. Custom shares must total the bill. Only approved members of the selected room can be included. If the creator or payer is locked in that room, the error names them. Each charged non-payer can reject their own share; the payer covers it without increasing anyone else's amount. A rejection opens a review. Only the payer or creator can cancel the whole expense.

**Reviews** shows spam reports and rejected shares. Each approved member other than the accused gets one public, immutable vote. Four matching verdicts are required. Reports themselves do not count as votes; no automatic lowering of the threshold for small rooms.

- Four **irrelevant expense** votes cancel the expense and add a spam strike. Two verified spam strikes lock new expenses until two other members confirm the existing cold-drink penalty was served.
- Four **avoiding payment** votes restore the rejected charge and add an avoidance incident. Every third verified incident adds one round of fries for everyone. The room creator marks fries served.
- Four **valid expense / justified rejection** votes close the review without a penalty. A confirmed avoidance charge cannot be rejected again.
- Manual cancellation closes pending reviews. Confirmed settlement payments remain in history and balances even when an expense is cancelled.

## Slack

Create an Incoming Webhook using [Slack's setup guide](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/). The original room uses `SLACK_WEBHOOK_URL` in `.env` and the encrypted Cloudflare Pages environment. Any room’s owner can open **Slack** and save a webhook for that room; a saved webhook overrides the original room’s environment fallback. Never commit or share the URL.

Notifications cover expense creation/cancellation, share acceptance/rejection, spam reports, review votes/verdicts, penalties, payment submission/confirmation/rejection, and membership requests/decisions. Messages contain no PIN, account number, QR or payment proof. Slack is send-only: use the app for all actions.

The room creator can open **Slack** to see that room’s delivery status, send a test and retry. Events are saved transactionally in an outbox. A database lease serializes sends and respects Slack rate limits. Failed deliveries retry on future app requests; no traffic means retries wait until someone uses the app or clicks Retry. A timeout after Slack accepts a message can cause duplicate delivery. Old WhatsApp tables remain solely to preserve existing data; the bot code and dependencies have been removed.

## Run locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env`. Without Turso configuration, local development uses `hostelsplit.db`. For isolated testing, use a separate SQLite URL and an empty Slack webhook. `npm run db:seed -- Ali Sara Bilal` is a development shortcut requiring `ROOM_PIN`.

## Deploy

The `hostelsplit` Pages project uses direct uploads. GitHub pushes alone do not deploy.

1. Put `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` and `SLACK_WEBHOOK_URL` in local `.env`.
2. Set the same values in Pages **Settings → Variables and Secrets** (all three as encrypted secrets; Wrangler clears dashboard plain-text variables absent from its config).
3. `npx wrangler login` if needed, then `npm run deploy`.

Deploy applies migrations, builds, and uploads `.svelte-kit/cloudflare`. For Git-connected Pages projects, use `npm run build` and output `.svelte-kit/cloudflare`; builds migrate automatically. The migration places existing accounts, expenses, approvals, penalties, reviews and payments into the original room. `.env` is ignored by Git. Friends can install the PWA from the HTTPS Pages URL; actions require internet access.

## Verify

```bash
npm run check
npm test
npm run smoke
npm run smoke:accounts
npm run build
```

Smoke tests use a temporary SQLite database and a mocked Slack transport, never the production room or webhook.
