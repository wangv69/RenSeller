# Testing RenSeller

Follow the red/green/refactor workflow in [AGENTS.md](AGENTS.md). Existing behavior is covered with characterization tests; the blank/non-finite listing price regression was reproduced with failing tests before fixing validation.

## Run locally

```sh
npm --prefix frontend ci
npm --prefix frontend run test:coverage
npm --prefix frontend run lint
npm --prefix frontend run build
python -m venv .venv
# Activate .venv, then:
python -m pip install -r backend/requirements-dev.txt
python -m pytest
```

Windows: use `npm.cmd` if needed and `.venv\Scripts\python.exe -m pytest` without activation. For interactive frontend development use `npm --prefix frontend run test:watch`.

## Refactored feature locations and UI checks

`App.tsx` coordinates navigation and shared state. Marketplace components, listing submission,
row mapping, and loading live in `frontend/src/features/listings/`. Message history/subscription
handling, message merging, and the thread UI live in `frontend/src/features/messages/`.
The backend database diagnostic route lives in `backend/app/api/diagnostics.py`.

Use `npm --prefix frontend run format` after editing frontend source, and
`npm --prefix frontend run format:check` to check its formatting.

`App.integration.test.tsx` mounts the actual feature components together with a synthetic
Supabase boundary. It covers listing-to-message navigation and sending, saved listings in the
profile, submission followed by approval, and regular-user moderation visibility. This fixture
does not implement or verify Supabase authorization; the PostgreSQL tests cover listing permissions.

For a local browser check without credentials or production writes:

```sh
npm --prefix frontend run dev -- --config vite.smoke.config.ts
```

Open `http://127.0.0.1:5174/`. This separate configuration uses an in-memory demo account and
synthetic listings. Reloading resets them. Normal development and production builds use the real
Supabase client. Check search/category/reset, condition/price filters, favorites, details, selling,
profile navigation, messages, moderation, and sign-out. Stop the server before `npm ci` on Windows
to avoid locking native dependencies. A running fixture server alone is not a completed browser check.

Regression tests reproduced these failures before their production fixes: View all left filters
active; Filter had no handler; rejected listing requests produced no recoverable error;
pending listing fields and close controls stayed enabled; a late listing response fetched sellers
after unmount; sign-out left the selling form visible; database diagnostic failures leaked resources;
and malformed email/profile claims crashed or returned a malformed username. Existing draft/photo
cleanup, detail clicks, and repeated-message/subscription behavior gained characterization tests
before the corresponding component and hook extractions.

## Required Docker checks

Always run both suites inside Docker as well as the host checks:

```sh
docker compose -f compose.test.yaml run --rm frontend-tests
docker compose -f compose.test.yaml run --rm backend-tests
```

These isolated containers copy source into temporary working directories, install dependencies, and run without production secrets or database access. The frontend container also runs lint and build. Tests do not write to the host source mount. Report Docker failures or unavailable Docker explicitly; local success does not replace Docker validation.

## Covered behaviors

- App: listing rendering, search/category filters, favorites/details, pending submission, approved-only marketplace queries, admin-only moderation navigation/removal refresh, invalid prices, authentication requirement, insert failures, session/message navigation, missing configuration
- Moderation: review queues/details/photos, approval/rejection/removal confirmation, reasons, validation, loading, errors/retry, stale queue cleanup, duplicate submission guards, request abortion on unmount
- Listing database integration: disposable local PostgreSQL with actual moderation migration, RLS and cross-account access, default pending for existing/new listings, public visibility, direct-write denial, audit integrity, input boundaries, stale decisions, revoked/ineligible admins. See [user groups](docs/USER_GROUPS.md) for setup and deployment.
- Auth: sessions, sign-in, sign-up, RPI domain validation, metadata, duplicate accounts, password mismatches, reset email/redirects, expired recovery links, password updates, recovery events, network/service errors, sign-out, subscription cleanup
- Messages: existing-conversation inbox, name search for registered students, no-match results, selecting a recipient without sending, incoming conversations and latest-message ordering, member directory empty/error states, conversation isolation, suggestions, send/keyboard behavior, saved drafts, retry IDs, ambiguous insert confirmation, history errors, pagination, realtime callbacks, reconnect status, focus refresh, subscription cleanup
- Supabase client: configured and unconfigured initialization
- Backend: all current routes, database success/failure, readiness, connection setup, authentication configuration, JWT failures and validation parameters, RPI email enforcement, profile fallback, JWKS caching

GitHub Actions runs frontend coverage, lint, build, and backend coverage on pushes and pull requests. Coverage gates are frontend 85% lines, 80% statements/branches, 75% functions; backend 100% statements/branches. These are initial minimums, not a definition of sufficient testing. Do not lower them; raise them as missing cases gain tests.

## Remaining integration work

The admin Users screen is covered by UI tests and actual PostgreSQL integration checks in
`test_account_groups.py`: current-admin directory access, default groups, literal search,
pagination, promotion, forbidden self/other-admin demotion, metadata preservation, eligibility,
stale decisions, audit permissions, and rejection of concurrent demotions. New regressions reproduced allowed admin demotions
before the protective follow-up migration. A database test verifies project-owner recovery when
no admins remain, followed by promotion of a collaborator. Directory and mutation
tests failed for missing RPCs before the migration was implemented; UI and navigation tests
failed before the corresponding components and controls existed. Apply
`supabase/migrations/202611130001_account_groups.sql` and then
`supabase/migrations/202611130002_protect_admin_groups.sql` after the listing moderation migration.
See `docs/USER_GROUPS.md` for first-admin setup. Hosted migration deployment and browser checks
remain unverified. Remaining Users branches include cancellation races and unusual thrown values.

The unit suites use synthetic fixtures and mock service boundaries. Listing moderation also has real isolated PostgreSQL migration/RLS checks; messaging migrations/RLS remain unverified. The suites do not prove actual email delivery, hosted redirects, JWT signature verification against a deployed JWKS endpoint, hosted PostgREST integration, two-account realtime delivery, or browser layout. The React entrypoint is excluded from unit coverage because it only mounts the application; include it in future browser smoke tests.

Before changing SQL policies, run isolated Supabase integration checks for anonymous access, non-RPI users, participant-only reads, sender spoofing, self-messaging, nonmember recipients, immutable messages, and body limits (blank, 1, 2000, 2001 characters). Verify directory synchronization for confirmation, ban/deletion and metadata changes. Never run destructive fixtures against production.

Frontend coverage reports remaining callback/guard branches, including loading/duplicate submission races, delayed responses after unmount, some modal interactions, and periodic polling. These remain explicit gaps; passing tests do not mean every possible behavior is covered. Open `frontend/coverage/index.html` for exact uncovered lines after running coverage.
