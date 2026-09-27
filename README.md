# HostelSplit

A personal expense app for roommates, hosted at **https://hostelsplit.pages.dev** on Cloudflare Pages with Turso. Money is stored as integer paisa. Slack Incoming Webhooks send notifications directly from Pages Functions; no persistent bot or OAuth runtime is needed.

## Accounts and membership

- First setup asks for name, unique username and a shared room PIN (4–8 digits). That account becomes room creator.
- New roommates use **Invite** to get the signup link. Signup asks for name, username and the room PIN, then waits for the creator's approval in **Invite → Join requests**.
- Pending/declined accounts cannot access room data or make changes.
- Sign in with username or an unambiguous name and the PIN. If both name and username are supplied, both must match. Duplicate display names are allowed; usernames are unique, case-insensitive, 3–24 letters/numbers/underscores.
- Existing accounts stay approved and receive `member_0001` style handles. Name login still works. Change name/username in **Profile**. The earliest existing account becomes room creator.
- The shared PIN remains a trusted-room login model, not individual passwords.

## Expenses, reviews and penalties

Choose equal or custom amounts. Custom shares must total the bill. Only approved members can be included. Each charged non-payer can reject their own share; the payer covers it without increasing anyone else's amount. A rejection opens a review. Only the payer or creator can cancel the whole expense.

**Reviews** shows spam reports and rejected shares. Each approved member other than the accused gets one public, immutable vote. Four matching verdicts are required. Reports themselves do not count as votes; no automatic lowering of the threshold for small rooms.

- Four **irrelevant expense** votes cancel the expense and add a spam strike. Two verified spam strikes lock new expenses until two other members confirm the existing cold-drink penalty was served.
- Four **avoiding payment** votes restore the rejected charge and add an avoidance incident. Every third verified incident adds one round of fries for everyone. The room creator marks fries served.
- Four **valid expense / justified rejection** votes close the review without a penalty. A confirmed avoidance charge cannot be rejected again.
- Manual cancellation closes pending reviews. Confirmed settlement payments remain in history and balances even when an expense is cancelled.

## Slack

Create an Incoming Webhook using [Slack's setup guide](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/) and put `SLACK_WEBHOOK_URL` in `.env` and the encrypted Cloudflare Pages environment. Never commit or share the URL.

Notifications cover expense creation/cancellation, share acceptance/rejection, spam reports, review votes/verdicts, penalties, payment submission/confirmation/rejection, and membership requests/decisions. Messages contain no PIN, account number, QR or payment proof. Slack is send-only: use the app for all actions.

The room creator can open **Slack** to see delivery status, send a test and retry. Events are saved transactionally in an outbox. A database lease serializes sends and respects Slack rate limits. Failed deliveries retry on future app requests; no traffic means retries wait until someone uses the app or clicks Retry. A timeout after Slack accepts a message can cause duplicate delivery. Old WhatsApp tables remain solely to preserve existing data; the bot code and dependencies have been removed.

## Run locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env`. Without Turso configuration, local development uses `hostelsplit.db`. For isolated testing, use a separate SQLite URL and an empty Slack webhook. `npm run db:seed -- Ali Sara Bilal` is a development shortcut requiring `ROOM_PIN`.

## Deploy

The `hostelsplit` Pages project uses direct uploads. GitHub pushes alone do not deploy.

1. Put `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` and `SLACK_WEBHOOK_URL` in local `.env`.
2. Set the same values in Pages **Settings → Variables and Secrets** (tokens/webhook encrypted).
3. `npx wrangler login` if needed, then `npm run deploy`.

Deploy applies migrations, builds, and uploads `.svelte-kit/cloudflare`. For Git-connected Pages projects, use `npm run build` and output `.svelte-kit/cloudflare`; builds migrate automatically. The migration preserves existing users, expenses and payments. `.env` is ignored by Git. Friends can install the PWA from the HTTPS Pages URL; actions require internet access.

## Verify

```bash
npm run check
npm test
npm run smoke
npm run build
```

Smoke tests use a temporary SQLite database and a mocked Slack transport, never the production room or webhook.
