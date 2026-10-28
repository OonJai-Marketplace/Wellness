# Oon Jai Wellness · 1.3.3

## Guest records, phone completion and team reminders · 1.3.3

Guest records provides a searchable visit directory by name, short paper ID, event, location, village and recorded details, with event/day/date/station filters and a detailed CSV export. Open a visit for every station field, BMI and author/time. It includes visits whose registration has not arrived. Offline searches include only cached records and this phone's queue; authorized online records load on entering this page. Existing volunteer history restrictions apply to the endpoint and cached records; administrators can search all events.

Sync center shows each participant and known phone for the selected day, submissions received, latest reported pending count, review items and last contact. Finish and confirm sync uploads the phone's queue, refuses remaining uploads/conflicts, verifies the last saved operation reached the server and persists an explicit completion marker. Receipt identity/status hashes invalidate confirmation after new server activity; reporting new pending work reopens it. Locally, saving another entry clears the marker immediately. A server cannot know about additional entries on a disconnected phone: last reported zero is not final confirmation, and never-reported phones require team follow-up. Confirm every day worked before uninstalling; uploaded records remain in the shared database.

Administrators can send an event-team sync reminder from Sync center. A review dialog identifies the day and message. Current eligible trip members and eligible users of the day receive an in-app request; active users may enable their own Web Push subscription from Sync center without Settings. Notification payloads contain no guest health data. The worker validates current access, uses allowed push-service endpoints, supports retry with a persisted compare-and-swap lease, stops retrying after five attempts, and distinguishes provider acceptance from human receipt. In-app requests can be marked read. Install app and Enable sync reminders are available to volunteers; iPhone users must enable Web Push from the installed Home Screen app. Nothing remotely enables notification permissions or forces a disconnected phone to upload.

This release uses the existing wellness_device_status and wellness_audit tables; no database migration is required. New audit station types hold phone confirmations, reopen events, reminder recipient/delivery state and read acknowledgements. These tables retain their existing service-only access. Deploy the gateway with sync.ts, push.ts, team.ts, core.js, access.js and deno.json before the 1.3.3 static shell. No real team reminder was sent during validation.

Validation includes actual gateway/access and offline form handlers, shared record search, phone confirmation and invalidation, event recipient isolation, idempotent reminders, read acknowledgements, concurrent delivery claims, real VAPID signing with mocked network delivery, and retry exhaustion. Browser UI checks use fictional records and fixture storage; physical push receipt on a user's device is not claimed by automated tests.

## Offline stations and automatic event preparation · 1.3.2

Joining a team code opens its event workspace. Choosing an event/day renders immediately and refreshes access, phone identity, paper-number reservations and records in the background. A separate Settings/Prepare action is no longer required. Initial online sign-in and event access are still required on each phone; registration reserves unique paper numbers online for later offline use. Existing offline authorization still expires after seven days.

Any service station accepts a syntactically valid paper ID (A0001–Z9999) without a local registration or downloaded alias range. Unknown paper IDs remain encrypted in the existing phone queue with their original event/day and operation UUID. When mappings arrive, they resolve within that saved event and upload through the unchanged gateway. Registration can arrive last. Unknown/unissued IDs remain visibly pending for slip/event review; the app never guesses a guest or drops an entry. Same-station duplicates still require review, and retrying a lost response keeps the operation UUID. Each station retains Next guest.

The ticket module now imports the current cached core version; release validation follows every local module import against the service-worker manifest to prevent an uncached dependency breaking offline startup. Validation includes the actual app handlers with isolated phone stores, all six service forms, registration-last linkage, cross-event queues, retry, restart, mapping arriving during an open form and nonblocking day navigation. Browser QA uses fictional fixtures; no production guest records are created.

## Update notification fix · 1.3.1

The update checker derives its running version from the loaded app script. Only newer releases show the notice; matching or older manifests clear it. Installing an update waits for the service worker to activate, keeps unsaved forms protected, and never clears local records. Regression checks cover installed/repeated checks, stale manifests, actual upgrades, offline operation and worker installation failure.

## Mission teams and account access · 1.3.0

Volunteers → Add volunteers starts with ten name/email rows, accepts a pasted tab/comma list, and supports up to 50 accounts per batch. Choose a mission trip once. New accounts are administrator-provisioned, email-confirmed and receive individual temporary passwords in the result/download; they must change them before loading any guest data. No verification email is sent for this administrator provisioning flow. Self-registration still verifies email. Existing Auth identities keep their passwords, Restaurant roles and existing Wellness authority. Temporary passwords are derived server-side for an idempotent retry of the same administrator/batch, never stored in the phone vault or database. Batch results report each success/failure and let the administrator retry failed rows. Share each login privately; the downloadable list is sensitive.

Authority & status now offers Volunteer or Administrator. Only an active administrator can change authority, assign/remove trip membership or save attendance. Changes are audited; self-demotion/disable and removal of the last usable admin are blocked. Creating accounts never grants admin authority. Team grouping and attendance are available inside each event, including a phone shortcut. Attendance is explicitly Not marked, Present, Absent or Excused for a date/location; roster membership is not automatically attendance. Removal revokes trip access but retains recorded attendance in the database.

Volunteers can open Home, Events, Guests/stations, Inventory, Reports, Appointments, Programs & recipes, Volunteers, Guide and Sync. Settings, edit history, authority controls, stock adjustments and approvals remain administrator-only. Personal password change and phone preparation are under More. They see only assigned trips, days on/after their joining date in Asia/Vientiane, and records first received after their joining timestamp (also bounded by account creation). Edits do not make older records visible. Directory, reports, snapshot, history and phone caches use the same filter; server writes reject earlier days/guest visits/profile links. Current available stock carries earlier dispensing into an opening balance without exposing older guest entries. Admins see all history. Names of current mission teammates are shared within the trip; their email/account authority is not sent to volunteers. Existing resource rows with unknown creation time remain admin-only.

Passwords now require 7–128 characters with a letter and a number. Existing passwords remain valid. The shared Restaurant Auth project and its settings are unchanged.

Deploy the additive `wellness_team_access` migration, then the gateway (including `access.js` and `team.ts`), then the 1.3.0 shell. The service worker caches `access.js` for offline use. Access refresh purges unauthorized cached snapshots/history; unsynced submissions remain encrypted for administrator recovery and are hidden from unauthorized views. As before, a disconnected phone cannot receive a role revocation until reconnection, and its existing offline authorization expires after seven days.

Validation: gateway, access, bulk provisioning, core, navigation, care, ticket and push suites; rollback-only database checks for role escalation/lockout, membership and timestamp gates, old visit/profile writes, attendance, retry and browser-role isolation. UI tests use fictional accounts and a fixture vault; they do not create real Auth users or verify live password sign-in/delivery.

## Focused event workspace · 1.2.0

Open event (or Open day) enters a named workspace. Registration, stations, guests/queue, day/location calendar, event stock, reports, appointments, corrections and sync remain inside that event until **All events** is selected. Reopening the app restores the event workspace. Reports, inventory and queued-entry views are scoped to that event; synchronization still safely uploads any pending work saved elsewhere on the phone.

Set country and province once in Event details. Registration inherits those values and asks for village/district and language. The redundant street address, permission prompt and save-next checkbox are removed. Existing stored information and record links are retained.

Short paper IDs are aliases backed by `wellness_ticket_ranges`; existing IDs remain accepted. The alias is resolved using the selected event, then the original day + internal guest ID + station key is used for saving, conflicts and stock. Events can reuse A0001 without merging people. The maximum is 259,974 reserved paper numbers per event. The gateway-only allocation RPC repeats current membership and phone ownership checks, serializes allocation and makes retries idempotent. Deploy the additive `wellness_event_workspace_tickets` migration and gateway before the 1.2.0 shell.

Verification: core, care, navigation, gateway, push and ticket Node suites; transactional database checks rolled back after testing allocation, retry, legacy conversion, event metadata, access denial, and out-of-order station saves. Browser QA uses fictional fixtures because the managed HTTP preview has no secure-context crypto; it verifies the actual UI with a fixture vault, not production encrypted offline storage. Physical multi-phone testing remains necessary before travel.

## Large events and regular visits

Outside an open event, five primary destinations are visible on phones and tablets: **Home, Events, Records, Inventory, Reports**. Home starts with **Open large event** and **New regular visit**. Tools and Settings are under the gear button. Existing mission-code access, shared Restaurant authentication, encrypted phone storage, and administrator review are preserved.

- **Large events:** create an event/workspace, share its team code, add separate days and locations, prepare phones online, then register guests and record at each station.
- **Regular visits:** the first administrator click creates the regular-visit workspace. Its default location is editable under Events → Details / team code. Share that code with the regular-care team. Later visits automatically open today's date and location, including offline on a prepared phone. A deterministic daily identifier and an idempotent server operation combine devices into the same day after sync. The 1–10 guest use case is supported without imposing a guest limit.
- **Returning guests:** Guests shows a searchable directory and dated visit history. Select a profile to start a regular visit or add a visit to the selected event day. A new visit receives its own short paper ID and explicitly links to the selected profile. Names never trigger automatic merges. Legacy records retain their IDs; records already entered as separate people stay separate until explicitly corrected. Volunteers can see only joined workspaces and cached history while offline.
- **Stations:** registration; height/weight/BMI/waistline; blood pressure, blood sugar and uric acid; glasses; dental cleaning; consultation; wellness activities. Symptoms, reported conditions, confirmed diagnoses, allergies, medication and follow-up dates remain distinct. Activity participation is recorded against visits separately from the recipe library. Status labels distinguish Waiting, Completed, Referred and Not required. Existing create-only volunteer permissions and administrator correction/conflict review remain in force.
- **Saving:** one Save button. The saved confirmation shows the short paper ID and a Next guest button, without a save-next checkbox.

## Glasses inventory

Inventory opens independently of the selected day. Choose **Main stock**, an **event day/location**, a **regular-visit pool**, or combined locations. Real stock and fictional samples stay separate. Grades start at +1.00 through +5.00 in quarter steps; administrators can add grades and set low-stock thresholds.

Receipts, transfers, unused returns, damage/loss and stock-count corrections form an auditable movement history. A transfer changes custody; it is not a service delivered. Accepted Provided records determine dispensing automatically, including corrected quantities or grades. Retried operations and conflicting entries never deduct twice. Earlier receiving logs and opening balances are retained. On phones, grade, available pairs and stock status remain visible without horizontal scrolling.

Stock movements require an online connection and administrator access. Guest dispensing remains offline-capable. Offline balances include the last synchronized stock and that phone's pending dispensing; other phones' unsynced work is not yet known. Reconcile all phones before transfers or approval. Negative dispensing balances are flagged and block approval; approved event-day stock requires reopening before adjustment.

## Reports

Reports combines **Large events / Regular visits / Combined**, workspace, date, location, service and approval filters. Today's and this month's shortcuts are available. Preliminary results are visible while work is underway; approved-only results exclude draft days and samples. Metric cards open matching visit records. Trends by day and location and a per-day comparison table support event summaries.

Distinct registered guests, guests served, visits, completed services, glasses recipients and glasses pairs are counted separately. Blood pressure, sugar and uric acid counts require actual values; notes-only assessments do not count as tests. Completed activity participation and follow-up dates have their own totals. Registered-profile links deduplicate returning guests across selected days. CSV includes per-day figures and a distinct filtered total. **Print / Save PDF** opens a clean report for the browser's print/PDF flow.

## Release validation (2026-10-26)

Automated core, navigation, gateway and notification tests cover identity checks, report calculations, original offline/conflict behavior and permissions. Browser tests use fictional fixtures at 320, 390, 768 and 1440 pixels and exercise registration, assessments, programs, returning guests, encrypted offline reload, new offline regular days, multiple-tab counters, reconnect, stock movements, report drilldowns, CSV and printable PDF, password-reset vault recovery and volunteer controls. Database tests run inside rollback transactions and check stock idempotency, corrections, transfers/returns/damage, approval boundaries and guest-profile authorization.

The additive migration is in `supabase/migrations/20261026145901_wellness_care_inventory_reports.sql`. Deploy it before the updated `backend/index.ts`, `backend/core.js`, `backend/push.ts` and `backend/deno.json`, then publish the app shell. Do not rerun the original schema. Existing Restaurant data is outside this migration's scope.


Installable, phone-first event workspace connected to the Restaurant Supabase project (`dfrulsnparrouuzjbtih`). Existing Restaurant passwords are preserved. Wellness data and permissions are separate.

## Daily review, conflicts and main totals

All joined volunteers can view their mission’s connected daily guest records, progress and reports. New records are create-only for volunteers. A different submission for an occupied station becomes a conflict rather than overwriting the earlier record. Administrators see a shared in-app alert, refreshed every 30 seconds while open, and can compare submissions, correct the retained record, then mark the conflict reviewed. Administrators can also opt into browser/phone push notifications in Settings. Notifications contain no guest details. The server retries queued notification jobs when new conflicts arrive or administrators refresh; in-app conflict records remain authoritative. Email conflict alerts are not sent.

Daily reports count registrations, glasses recipients and pairs, dental cleanings, consultation, assessment, referrals and people receiving both glasses and dental services. A service bar chart and CSV export are available. Main totals include only **approved real days**, excluding samples and draft days. Mission analysis adds filtered service, daily and location charts, visit counts and CSV export. A clearly marked fictional preview demonstrates these graphs without adding samples to official totals.

Approval requires no unresolved conflicts, no orphan station records awaiting registration, no known pending phone uploads and no negative glasses stock. The administrator must explicitly confirm every team phone has synced: a never-connected/offline phone cannot report its pending work. Approval locks that day; reopening removes it from main totals until approved again. All corrections and approvals have server-side audit records.

## Authentication

Self-signup creates an unverified Wellness-only Supabase identity; it does not acquire a Restaurant profile. Supabase sends verification. Existing Restaurant identities use their current password. Admin-created volunteers can start with email as temporary password, must verify email, then must choose a strong password before any event data is returned.

Forgot password returns directly to Wellness, where the new password is set for the shared Supabase identity. Older recovery emails retain their original redirect; request a fresh link after updating. Verification emails may use the project’s existing default redirect; users are instructed to return to Wellness after confirming. SMTP delivery and Supabase email limits apply. Deployment tests did not send verification/recovery mail to real volunteers.

Wellness password requirements are 7–128 characters with a letter and a number and no surrounding spaces. Changing a shared Restaurant password affects Restaurant too; Accounting uses a separate project. A password reset on another phone requires the old password to unlock this phone’s unsynced encrypted data before rekeying; failed unlocks never discard saved records.

## Offline and security implementation

- Encrypted IndexedDB vault, AES-GCM with a PBKDF2-derived key. Password/key are not stored. Each reload requires unlocking the vault.
- Web Locks serialize counters/outbox writes across tabs. A save is acknowledged only after durable storage completes. Clearing browser data destroys unsynced entries; do not clear it before sync.
- Paper IDs use one letter and four digits (A0001 through Z9999), unique within an event. The server reserves non-overlapping blocks of up to 500 numbers per phone; encrypted local counters consume them even if a form is abandoned. Phones automatically refill when online and low on numbers. A new browser installation receives a new phone identity. Unused reserved numbers are not recycled. Durable internal IDs and existing profile links remain unchanged. Station phones can save an unknown short ID offline without a cached range; the original entry resolves and uploads when its event mapping becomes available after reconnecting.
- UUID operation receipts make retries idempotent. Independent station records prevent one station overwriting another. Conflicts preserve the incoming payload. Server-side compare-and-set protects admin corrections.
- Reconnection, foreground return, Sync now and a 30-second visible-app timer sync the outbox. The app must be open; closed-app background sync is not promised.
- Offline permission changes take effect after reconnection or the seven-day lease expires. Server access checks use current database membership, not user-editable metadata.
- All Wellness tables have RLS enabled and browser privileges revoked. No health data is directly exposed through the Data API. The authenticated gateway checks current account and mission membership. Mutation RPCs are service-role-only. RLS-with-no-policy advisories are intentional deny-all defense for these gateway-only tables.
- Only the publishable key is shipped. The service key stays in the function’s hosted environment. Existing Restaurant profiles, roles and passwords are not reset.
- Original design-preview localStorage remains untouched and is not uploaded automatically.

## Samples and verification

Sample mission code: **DEMO-2026**. Three daily sessions contain 24 fictional guests, 111 station records, 9 appointments and 4 recipes. Three guest IDs intentionally await registration. Example stock starts at 20 pairs per grade per day. Samples are visibly marked and excluded from main totals.

- `node tests/navigation.mjs`: mission/day isolation, remembered choices, date/location boundaries, empty missions and revoked access.
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
