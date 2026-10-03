# PebbleX Capture — browser extension

A Manifest V3 extension that connects to the **same** PebbleX workspace as the web app and the desktop app. It adds two things:

1. **Quick capture** — save a task or note to `workspace_items`, and see it appear in `/app` and on desktop.
2. **Browsing time** — one aggregate row per domain per day in `app_usage`, shown alongside desktop app usage.

It uses the same Supabase tables and the same Firebase project. Nothing here is a second, separate database.

## What it will never collect

Full URLs, page titles, search queries, form input, cookies, page content, screenshots, or browsing sequences. The service worker reads only `new URL(tab.url).hostname`, strips `www.`, and counts seconds. Internal browser pages (`chrome:`, `edge:`, `about:`, `moz-extension:`) are ignored entirely.

Usage sharing is **off by default** and can be switched off at any time from the popup or Options. Turning it off clears the locally accumulated totals.

## Install it

1. Run the Supabase migrations `001_workspace.sql`, then `003_extension_and_admin.sql`.
2. In the Firebase Console create a **Web API key** and register an **OAuth client ID for a Chrome Extension**, using your extension ID as the authorized origin. Put that client ID into `manifest.json` → `oauth2.client_id`.
3. Add the Google provider to Firebase Authentication, and add the same OAuth client there.
4. Load `extension/` as an unpacked extension (`chrome://extensions` → Developer mode).
5. Open **Settings** in the extension popup and paste the Supabase URL, the Supabase **publishable** key, and the Firebase **public web API key**.

Only public client values belong in the extension. Never place a Supabase service-role key, a Firebase Admin SDK credential, or an AI provider key here.

## How sign-in works

`chrome.identity.getAuthToken` obtains a Google access token. The extension exchanges it for Firebase credentials through `accounts:signInWithIdp`, then stores a Firebase ID token plus refresh token in `chrome.storage.local`. The token is refreshed automatically two minutes before expiry.

The Supabase client sends that Firebase ID token as the bearer, which Supabase accepts because the Firebase Third-Party Auth integration is installed. Every write is still checked by the same row-level policies: the extension can only touch rows whose `owner_id` is the signed-in Firebase UID.

## How it connects to both things

| Surface | Writes | Reads |
| --- | --- | --- |
| Web (`/app`) | `workspace_items`, `devices`, `app_usage` | everything it owns |
| Desktop | `workspace_items`, `devices`, `app_usage` | everything it owns |
| Extension | `workspace_items`, `devices`, `app_usage` | its own heartbeat and status |

All three use `devices.kind` (`web` / `desktop` / `extension`) and `workspace_items.origin`. The desktop adapter in `integrations/desktop-sync.ts` and this extension both use optimistic concurrency via `workspace_items.updated_at`, so a stale write from one device cannot silently overwrite a newer one.

Quick captures are queued in `chrome.storage.local` when offline and flushed on the next alarm or message. The queue is account-scoped and never contains credentials beyond the Firebase session needed to authenticate.

## Files

- `manifest.json` — MV3, permissions `identity`, `storage`, `alarms`, `tabs`
- `lib/pebblex.js` — sign-in, token refresh, REST sync, usage reporting, offline queue
- `background.js` — focus tracking, per-domain tally, sync alarms, message routing
- `popup.html` / `popup.css` / `popup.js` — capture and status, in the PebbleX design language
- `options.html` / `options.js` — connection settings and privacy controls

## Before you publish

Extension code is not type-checked or bundled by the website build. Review it and test it against your deployed projects:

1. Sign in with Google, then confirm the account appears in `/app` → Desktop activity as a **Browser extension** device.
2. Capture a task from the popup and confirm it shows up on the web and the desktop.
3. Enable usage sharing, browse two or three sites, and confirm only hostnames appear in `/app` → Desktop activity.
4. Disable usage sharing and confirm the totals stop immediately.
5. Go offline, capture three items, go online, and confirm all three sync once and only once.
6. Sign in as a second account and confirm it cannot read the first account's rows.
7. Confirm the admin panel shows extension devices and aggregate usage without any per-user browsing history.
