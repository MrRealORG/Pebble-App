# PebbleX Web Workspace Setup

The website is still at `/`. The workspace is at `/app`, sign-in is at `/login`, registration is at `/signup`, and administration is at `/admin`.

## What works before cloud setup

With no cloud configuration, `/app` opens a clearly labeled, local-only preview. Tasks, notes, reminders, prompts, profile changes, and preview conversations persist in this browser. The desktop usage and admin users are sample data. The preview does not create a real account, contact an AI model, or connect to a desktop.

Real authentication never silently falls back to a fake account. If configured credentials or backend services fail, the interface shows the error.

Preview changes can be reset in My profile. Notes have an explicit Save changes button and support Ctrl/Cmd+S. Tasks support both drag-and-drop and an accessible status selector. The global search shortcut is Ctrl/Cmd+K.

## Architecture

- Firebase Authentication owns email/password and Google accounts.
- Supabase Postgres owns profiles, tasks, notes, conversations, reminders, prompts, device metadata, daily app usage, and an append-only activity log.
- Supabase Realtime notifies signed-in clients about their changes. A periodic refresh recovers missed messages.
- Firebase callable functions provision workspace accounts and optionally call an AI provider.
- Games and the Timeless timer are deliberately not included. Desktop app usage is a read-only summary on the web.
- Private notes and AI message bodies remain owner-only, including when an administrator is signed in. Admins see the user directory, aggregate record counts, device metadata, and event metadata.

## 1. Configure Firebase Authentication

Create a Firebase project, or use the exact project already used by your desktop app. Register a Web app. Enable Email/Password and Google under Authentication > Sign-in method. Add every production domain and your development hostname to Authentication > Settings > Authorized domains.

Copy `.env.example` to `.env.local` and populate:

```dotenv
VITE_FIREBASE_API_KEY=your-public-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_APP_ID=your-web-app-id
VITE_FIREBASE_FUNCTIONS_REGION=us-central1
VITE_FIREBASE_APPCHECK_SITE_KEY=your-public-recaptcha-v3-site-key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

Firebase public web configuration is not a server credential. Never put an Admin SDK credential, Supabase service-role key, or AI provider key in a `VITE_` variable.

Register the web app with Firebase App Check using reCAPTCHA v3. The provided server functions enforce App Check. For local development, use a registered App Check debug token through the documented Firebase development workflow; do not disable production enforcement. Electron requires a supported App Check integration or a trusted custom provider. Do not ship a privileged debug token with the desktop app.

## 2. Connect Supabase to Firebase

In Supabase Authentication > Third-Party Auth, add a Firebase integration with that same Firebase project ID.

Open `backend/supabase/001_workspace.sql`. Replace `REPLACE_WITH_FIREBASE_PROJECT_ID` with the real project ID. Run the entire file in the Supabase SQL editor. It installs tables, indexes, row-level policies, audit triggers, daily AI limits, and Realtime publications.

The SQL validates both the JWT issuer and audience. Firebase UIDs are text, so policies use `auth.jwt()->>'sub'`, not the UUID-based `auth.uid()` helper.

The authenticated Firebase JWT must have the server-issued custom claim `role: 'authenticated'`. The provisioning function in the next step assigns it without granting administrator access.

## 3. Deploy the Firebase functions

Use the included server source in `backend/firebase/index.cjs`. It is intentionally separate from the web bundle. A Firebase billing-enabled plan is typically needed for callable functions and external API requests.

Initialize the separate function package through npm, not by putting server credentials into the web project:

```sh
cd backend/firebase
npm init -y
npm pkg set main=index.cjs engines.node=22
npm install firebase-admin firebase-functions @supabase/supabase-js
cd ../..
```

Select your Firebase project with the Firebase CLI, then set server secrets:

```sh
firebase use YOUR_PROJECT_ID
firebase functions:secrets:set SUPABASE_URL
firebase functions:secrets:set SUPABASE_SERVICE_ROLE_KEY
firebase functions:secrets:set OPENAI_API_KEY
firebase deploy --only functions:pebblex
```

The service-role key must remain in the Firebase secret manager. It is only used for controlled account provisioning, checking AI access, and applying a daily request quota.

`ensureWorkspaceAccount` accepts no client-supplied user ID or role. It verifies the signed-in user, preserves existing server-issued claims, creates a profile without overwriting preferences, and refreshes the account metadata.

`askPel` requires a verified email, an enabled workspace account, App Check, and an available daily allowance. It uses the OpenAI Responses API. Set `PEL_MODEL` in the Firebase functions environment if you want to change the default `gpt-4.1-mini` model. The provider request sets `store: false`; consult your provider's policy for retention details. Only task/note context explicitly enabled by the user is sent. Without that opt-in, only the current prompt is sent. The UI saves conversation history but does not automatically send older messages as context.

If you do not want AI yet, deploy only `ensureWorkspaceAccount` and do not expose an AI API key to the browser. The rest of the workspace does not depend on an AI model.

## 4. Grant your own administrator access

Create or sign into your account first. Find its UID in Firebase Authentication. On a trusted terminal with Application Default Credentials for the Firebase project:

```sh
cd backend/firebase
node set-admin.cjs YOUR_FIREBASE_USER_UID
```

Sign out and sign in again. The Admin panel link will appear, and `/admin` will authorize your account. There is no client-side "make me admin" switch. Do not put an Admin SDK service-account file in the repository or public hosting directory.

To revoke administrator access:

```sh
node set-admin.cjs YOUR_FIREBASE_USER_UID --revoke
```

Already issued ID tokens can remain valid until expiration. For immediate database blocking, a trusted server can also set `profiles.account_enabled = false`; the database policies check it. Re-enable it only from a trusted server after reviewing the account. The profile directory contains accounts that have provisioned a workspace, not unrelated Firebase users.

## 5. Install the browser extension

The extension in `extension/` connects to this same workspace and shares the same Firebase and Supabase projects. It adds quick capture and opt-in per-domain browsing totals alongside desktop app usage. See `extension/README.md` for the Chrome Web Store / OAuth client setup.

It needs migration `003_extension_and_admin.sql`, which also adds the administrator tooling: a connected-devices directory, aggregate usage summaries, and a guarded one-way access suspension action. Suspension cannot delete data, cannot target protected accounts, cannot target the administrator doing it, and is written to the audit log.

The extension collects hostnames and daily totals only. Full URLs, page titles, form input and browsing sequences are never read or stored.

## 6. Wire up the desktop app

The existing desktop source was not included in this website project. The adapter is provided in `integrations/desktop-sync.ts`; you must connect it to your renderer's actual local data store.

Install `firebase` and `@supabase/supabase-js` in the desktop project, use the same Firebase project, and sign in before starting the bridge. Pass your Firebase Auth and Functions instances, the Supabase public configuration, persistent storage, and local apply callbacks to `startDesktopSync`.

The adapter handles initial snapshots, server updates, device heartbeats, a persistent account-scoped outbound queue, reconnect refresh, and optimistic-version conflict detection. Give every item a stable UUID and use the same `kind` and field names as the website. Map existing local IDs once and persist the mapping; do not generate new IDs on each sync. Import an existing desktop workspace only after asking the user.

For a new item, call `saveItem(item, null)`. For an existing item, pass the last server `updated_at` string as the expected version. To delete, set `deleted_at` and save the row. Tombstones let offline clients see deletions. If another device already saved a newer version, the adapter keeps the local edit and calls `onConflict` instead of overwriting. Let the user compare versions, then use `acceptRemote` or `keepLocalAfterReview`.

`applyRemote` must update the local store without re-enqueuing the same item, otherwise it creates an echo loop. Apply incoming `deleted_at` values as local deletions. Apply profile theme/preference changes through `applyProfile`. Call `stop()` on sign-out and account changes. Recreate the adapter for each signed-in UID.

The adapter is a transport, not an OS activity collector. Use your existing desktop collector to call `recordAppUsage` with a cumulative total for each app/device/day. The method honors `usage_consent`, and RLS independently enforces consent on writes. Never send window titles, browsing history, keystrokes, or screen content. Disable sharing immediately when the preference becomes false. The web browser cannot inspect installed apps or collect desktop usage on its own.

## 7. Hosting

Restart Vite after changing public environment variables. Build with the existing build script. Firebase Hosting configuration, Vercel rewrites, and Netlify-style `_redirects` are included for direct `/app`, `/login`, and `/admin` URLs. On any other host, configure an SPA fallback to `index.html` without intercepting existing assets.

## Validation checklist

Before publishing, run a dependency audit in both projects and address current advisories. The SQL smoke checks in `backend/supabase/002_policy_checks.sql` can be run after the migration in a test Supabase project; they use disposable fixtures and roll back the transaction. They do not replace a live two-account integration test.

1. Sign up, verify the email, sign out, sign in, and request a password reset.
2. Sign into a second browser with the same account. Create/edit/complete a task and confirm that it updates in the other window.
3. Open the same note on two devices. Save different edits. The second stale save must show a conflict rather than overwrite the first.
4. Sign into a separate account. Confirm it cannot read or write the first account's rows, even with direct API requests.
5. Visit `/admin` as a normal user. Both the page and the admin RPCs must deny access.
6. Confirm that an admin can see counts and metadata but cannot query another user's note or message bodies.
7. Enable and disable usage sharing. Confirm that new app-usage writes are denied when consent is off.
8. Disconnect a desktop, edit locally, reconnect, and confirm its queued edits and deletions arrive.
9. Turn off Realtime temporarily and check that the polling fallback still refreshes the workspace.
10. Request AI output and confirm provider secrets are never present in browser source or browser storage.

## Data behavior

Preview state is browser-local, visibly marked, and never imported into a real account. Preview AI replies are deterministic summaries, not live model responses. Real workspace data is loaded from Supabase. Unsaved note drafts are stored only for the current tab and account, with an explicit Save changes action and a keyboard shortcut. Other cloud writes require a connection; errors are shown rather than falsely reporting sync. Changes are conditional on the last server version. The activity log is server-written metadata, not an analytics tracker.

Desktop transport, cloud functions, RLS, email delivery, Google OAuth, App Check, and AI provider calls must be validated against your own deployed projects before release.

## References

- https://supabase.com/docs/guides/auth/third-party/firebase-auth
- https://supabase.com/docs/guides/realtime/postgres-changes
- https://firebase.google.com/docs/auth/web/start
- https://firebase.google.com/docs/app-check/cloud-functions
- https://platform.openai.com/docs/api-reference/responses/create