# Oon Jai Wellness · 1.0.2

Installable, phone-first event workspace connected to the Restaurant Supabase project (`dfrulsnparrouuzjbtih`). Existing Restaurant passwords are preserved. Wellness data and permissions are separate.

## Mission → day/location → guest ID

1. Volunteers create their own account, choose a strong password and verify their email. No event data is available until they enter a mission code.
2. An administrator creates a mission, chooses its shared code (for example `MT-03-2027`) and adds one session for each date and location. A two-day visit to the same location has two sessions. Duplicate date/location sessions within one mission are blocked.
3. Volunteers enter the shared code. It opens the mission calendar and every station; no individual station assignment is required. The shared code grants access to the mission’s guest data, so share it with the intended team only.
4. Each phone signs in online, chooses its session and uses **Prepare / refresh phone**. Unique volunteer initials and phone codes are reserved automatically. Offline access lasts seven days after the last access refresh. Test airplane mode before travel.
5. **New registration** reserves a guest ID before opening the form. Write the full ID on the guest’s slip. Every other station requires that ID before proceeding. The connected form includes registration; height/weight/BMI/waistline; blood pressure, sugar and uric acid; glasses; dental; consultation.
6. Each station saves locally even if registration has not arrived. Sync joins records by **session + guest ID + station**. The same ID on another date or in another location does not mix the daily records.
7. Search registration records by name, local name, phone, village or ID to recover a lost slip. Offline recovery requires the registration to already be saved on that phone. Devices cannot retrieve one another’s unsynced data without connectivity.
8. Viewing historical sessions is unrestricted within joined missions. Saving into a past/future session shows a date/location warning and requires acknowledgment.

## Daily review, conflicts and main totals

All joined volunteers can view their mission’s connected daily guest records, progress and reports. New records are create-only for volunteers. A different submission for an occupied station becomes a conflict rather than overwriting the earlier record. Administrators see a shared in-app alert, refreshed every 30 seconds while open, and can compare submissions, correct the retained record, then mark the conflict reviewed. Administrators can also opt into browser/phone push notifications in Settings. Notifications contain no guest details. The server retries queued notification jobs when new conflicts arrive or administrators refresh; in-app conflict records remain authoritative. Email conflict alerts are not sent.

Daily reports count registrations, glasses recipients and pairs, dental cleanings, consultation, assessment, referrals and people receiving both glasses and dental services. A service bar chart and CSV export are available. Main totals include only **approved real days**, excluding samples and draft days. Mission analysis adds filtered service, daily and location charts, visit counts and CSV export. A clearly marked fictional preview demonstrates these graphs without adding samples to official totals.

Approval requires no unresolved conflicts, no orphan station records awaiting registration, no known pending phone uploads and no negative glasses stock. The administrator must explicitly confirm every team phone has synced: a never-connected/offline phone cannot report its pending work. Approval locks that day; reopening removes it from main totals until approved again. All corrections and approvals have server-side audit records.

## Reading glasses inventory

The catalog starts at +1.00 through +5.00 in +0.25 increments (17 grades); administrators can add grades. Each day/location has its own received/adjusted stock. Vision staff choose a grade from a dropdown showing the locally known balance. Issued stock is derived from accepted guest records, so retried and conflicting entries do not decrement it twice. Corrections recalculate stock. Negative offline balances are visible and block daily approval until reconciled.

## Authentication

Self-signup creates an unverified Wellness-only Supabase identity; it does not acquire a Restaurant profile. Supabase sends verification. Existing Restaurant identities use their current password. Admin-created volunteers can start with email as temporary password, must verify email, then must choose a strong password before any event data is returned.

Forgot password returns directly to Wellness, where the new password is set for the shared Supabase identity. Older recovery emails retain their original redirect; request a fresh link after updating. Verification emails may use the project’s existing default redirect; users are instructed to return to Wellness after confirming. SMTP delivery and Supabase email limits apply. Deployment tests did not send verification/recovery mail to real volunteers.

Password requirements match Accounting: 12–128 characters, uppercase/lowercase, number, symbol and no surrounding spaces. Changing a shared Restaurant password affects Restaurant too; Accounting uses a separate project. A password reset on another phone requires the old password to unlock this phone’s unsynced encrypted data before rekeying; failed unlocks never discard saved records.

## Offline and security implementation

- Encrypted IndexedDB vault, AES-GCM with a PBKDF2-derived key. Password/key are not stored. Each reload requires unlocking the vault.
- Web Locks serialize counters/outbox writes across tabs. A save is acknowledged only after durable storage completes. Clearing browser data destroys unsynced entries; do not clear it before sync.
- Guest IDs contain reserved initials, database-allocated phone number, local sequence and check character. A new browser installation receives a new phone number. Unused reserved numbers are not recycled.
- UUID operation receipts make retries idempotent. Independent station records prevent one station overwriting another. Conflicts preserve the incoming payload. Server-side compare-and-set protects admin corrections.
- Reconnection, foreground return, Sync now and a 30-second visible-app timer sync the outbox. The app must be open; closed-app background sync is not promised.
- Offline permission changes take effect after reconnection or the seven-day lease expires. Server access checks use current database membership, not user-editable metadata.
- All Wellness tables have RLS enabled and browser privileges revoked. No health data is directly exposed through the Data API. The authenticated gateway checks current account and mission membership. Mutation RPCs are service-role-only. RLS-with-no-policy advisories are intentional deny-all defense for these gateway-only tables.
- Only the publishable key is shipped. The service key stays in the function’s hosted environment. Existing Restaurant profiles, roles and passwords are not reset.
- Original design-preview localStorage remains untouched and is not uploaded automatically.

## Samples and verification

Sample mission code: **DEMO-2026**. Three daily sessions contain 24 fictional guests, 111 station records, 9 appointments and 4 recipes. Three guest IDs intentionally await registration. Example stock starts at 20 pairs per grade per day. Samples are visibly marked and excluded from main totals.

- `node tests/core.mjs`: 10,000 distinct IDs and check characters, BMI, merging/conflicts, validation and password rules.
- `node tests/gateway.mjs`: executes the actual Edge handler with mocked dependencies; tests signup role isolation, anonymous/unjoined/disabled/temporary-password rejection and mission-only access.
- `node tests/browser.cjs`: mocked Auth/gateway browser test; phone/desktop, airplane-mode shell reload, encrypted records, ID recovery, multiple-tab counters, sync, grade dropdown, consultation and save-only date warning. The local Chromium executable is configured in the test.
- `tests/database.sql`: live Supabase transaction tests, rolled back afterward. Covers mission joining without assignments, location separation, out-of-order records, retries/conflicts, stock changes, approval/reopening and access boundaries.

The static root is served by GitHub Pages. `backend/index.ts` is the deployed `wellness-api` function. SQL files in `backend/` document the applied schema changes; do not rerun base creation files against the live database. `sample-data.sql` is an idempotent sample insert for the final schema. `core.js` and `backend/core.js` must match. Vendored Supabase JS 2.117.2 and its license allow startup without a CDN.

Wellness moved from the initially configured Accounting project to Restaurant in 1.0.1. The Accounting Wellness endpoint was retired and its sample-only Wellness tables removed. Authentication sessions and encrypted vault namespaces are scoped to Restaurant. The Restaurant isolation trigger handles trusted app metadata on insert and update because GoTrue can populate it after initial user creation.

## Reliability update 1.0.2

- Combined mission analysis, date/location filters, CSV export and a separate fictional-data preview.
- Volunteer guide with ID/BMI practice and an encrypted local readiness checklist before joining a mission.
- Phone pending counts refresh for all worked sessions; snapshots stay attached to the session requested even if the selected day changes during a request. Connection errors no longer report Connected.
- Zero-pair assessed-only glasses records are valid; empty health assessments are rejected.
- External password resets have a previous-password unlock flow that preserves unsynced entries and re-encrypts the vault.
- Atomic mission, session and appointment edits reject stale revisions. Recorded sessions cannot be moved between missions/dates/locations, approved days freeze appointments, and conflict resolution has an idempotent audit entry.
- Optional Web Push for administrators, with server-only VAPID keys and subscriptions. Opt in and send a test from Settings. Actual delivery depends on the phone/browser and notification permissions.
- Live rollback tests in `tests/reliability.sql` verify concurrency boundaries and notification-storage isolation. Browser tests cover combined charts, practice and password-reset recovery.

Password resets for real accounts are performed through Supabase Auth administration and are never stored in repository files. No software can be guaranteed bug-free; physical-phone notification delivery and verification/recovery email delivery still require operational testing.

Recovery verification: a disposable confirmed account completed a real Supabase recovery-token exchange, Wellness password update and fresh sign-in. Supabase accepted the Wellness redirect. No real-user password was changed during that test, and the disposable account was deleted. Browser tests also cover the recovery-link callback and new-password form.
