# HostelSplit

HostelSplit is an installable SvelteKit app and persistent WhatsApp bot for a trusted group of roommates. Both use the same LibSQL database. Amounts are stored as integer paisa.

## Run locally

1. `npm install`
2. `npm run dev` (this runs database migrations automatically). Without an `.env` file it uses `hostelsplit.db` in this directory.
3. Open the shown local URL. The first visitor sees **Create your room** and chooses their name and a 4–8 digit room PIN.
4. After signing in, use **Share join link** on the dashboard. Friends open that link, choose their names, and enter the shared PIN.

No secret or PIN environment variable is needed. The app stores a hashed room PIN and its generated session key in the shared database. `npm run db:seed -- Ali Sara Bilal` is an optional development shortcut that still requires a matching `ROOM_PIN` environment variable.

`localhost` is only accessible on the device running the server. Friends should use the deployed Cloudflare Pages URL below.

The app includes expense entry, targeted charge approval, self-removal, spam flags, cold-drink lock and unlock, pairwise history, payment profiles, settlement proof and recipient review. Only confirmed payments affect balances. Image proofs and QR codes are saved as base64 in LibSQL and served through authenticated image routes.

## WhatsApp bot

Run `npm run bot` as a **persistent Node process**. On its first run, scan the QR using WhatsApp Linked Devices. Credentials are saved in `auth_state/` and excluded from version control. If `BOT_GROUP_JID` is unset, the connected bot lists the groups it can see. Copy the hostel group JID to `.env` and restart.

Each roommate opens **Profile**, generates a one-time code, and sends `/link 123456` in that WhatsApp group. The bot then accepts commands such as:

```text
expense chai 350 paid by Ali for all
expense mess 1200 paid by Sara for Ali, Sara, Bilal
expense delivery 800 paid by Bilal for Hamza
```

For a targeted charge, the target can use the app or reply `/accept <expense-id>` or `/reject <expense-id>` in the group. Bot notifications are queued in the database so PWA actions can reach the bot when it reconnects. Keep the process running with a supervisor such as PM2 on a device or VM that stays online. The bot cannot run in a serverless function.

## Deploy to Cloudflare Pages

The live app is **https://hostelsplit.pages.dev**. Cloudflare Pages hosts the web app and its server routes; Turso stores the shared data. The first visitor creates the room and chooses the PIN, then shares the join link with roommates.

The existing `hostelsplit` Pages project uses direct uploads. GitHub pushes do not automatically deploy it. To publish an update from this repository:

1. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the local `.env` file.
2. Run `npx wrangler login` if this computer is not already authorized.
3. Run `npm run deploy`. This applies Turso migrations, builds the app, and uploads it to the production Pages URL.

In the Cloudflare project, **Settings → Variables and Secrets** must contain `TURSO_DATABASE_URL` and the encrypted `TURSO_AUTH_TOKEN`. `wrangler.jsonc` sets the Pages output directory, compatibility date, and Node compatibility flag. The production environment is already configured.

For a separate project using Cloudflare's Git integration, import the GitHub repository in the Pages dashboard, use build command `npm run build` and output `.svelte-kit/cloudflare`, and set both Turso values before building. Cloudflare builds apply migrations automatically. Set the Wrangler project name to match that project.

The app needs a real Turso URL and token at runtime. A local `hostelsplit.db` file cannot be used by Cloudflare Pages. `.env` is ignored by Git.

The PWA can be installed on supported browsers from the HTTPS Pages URL. Expense actions require an internet connection. The WhatsApp bot runs separately as described above.

## Verify

```bash
npm run check
npm test
npm run smoke
npm run build
```

`smoke` makes a temporary LibSQL database, applies the migrations, and exercises targeted approval, flags, lock and unlock, settlement confirmation, and split disputes.
