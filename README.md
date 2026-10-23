# Oon Jai Wellness

Phone-first, installable design preview for the Wellness branch. Independent of the Restaurant/Kitchen repository.

## Preview scope
- Matching Oon Jai green-and-cream login styling; any password or the Explore button opens the demo.
- Overview, searchable multilingual guest profiles, visit histories and measurements, appointments, recipes with batch scaling, filtered reports and CSV exports, edit-only audits.
- All examples are fictional. Browser localStorage holds demo edits; no Supabase, backend, real authentication, or remote health data.
- PWA manifest, standalone app icons, and offline app-shell caching. Install from an HTTPS deployment through the browser menu.

## Run
Serve this directory with any static HTTP server. No build or dependencies required. GitHub Pages can serve the main branch's root.

## Safety boundary
This is a UI prototype. Do not enter real health data or real passwords. Demo audit history is device-local and is not a tamper-proof production audit. Production use requires real authentication, server-enforced permissions, consent/retention decisions, secure storage, and server-side auditing.

## Future implementation
Date of birth/estimated age, outreach configuration, full translated interface, referrals, attachments, program enrollment and supply tracking are future extensions. Current localization accepts Lao/Thai text and provides local-script plus Latin-script name fields.
