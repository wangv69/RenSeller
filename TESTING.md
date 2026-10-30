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

## Required Docker checks

Always run both suites inside Docker as well as the host checks:

```sh
docker compose -f compose.test.yaml run --rm frontend-tests
docker compose -f compose.test.yaml run --rm backend-tests
```

These isolated containers copy source into temporary working directories, install dependencies, and run without production secrets or database access. The frontend container also runs lint and build. Tests do not write to the host source mount. Report Docker failures or unavailable Docker explicitly; local success does not replace Docker validation.

## Covered behaviors

- App: listing rendering, search/category filters, favorites/details, creation, invalid prices, authentication requirement, insert failures, session/message navigation, missing configuration
- Auth: sessions, sign-in, sign-up, RPI domain validation, metadata, duplicate accounts, password mismatches, reset email/redirects, expired recovery links, password updates, recovery events, network/service errors, sign-out, subscription cleanup
- Messages: member directory, empty/error states, conversation isolation, suggestions, send/keyboard behavior, saved drafts, retry IDs, ambiguous insert confirmation, history errors, pagination, realtime callbacks, reconnect status, focus refresh, subscription cleanup
- Supabase client: configured and unconfigured initialization
- Backend: all current routes, database success/failure, readiness, connection setup, authentication configuration, JWT failures and validation parameters, RPI email enforcement, profile fallback, JWKS caching

GitHub Actions runs frontend coverage, lint, build, and backend coverage on pushes and pull requests. Coverage gates are frontend 85% lines, 80% statements/branches, 75% functions; backend 100% statements/branches. These are initial minimums, not a definition of sufficient testing. Do not lower them; raise them as missing cases gain tests.

## Remaining integration work

The suites use synthetic fixtures and mock Supabase/PostgreSQL boundaries. They do not prove actual email delivery, hosted redirects, JWT signature verification against a deployed JWKS endpoint, database migrations/RLS, two-account realtime delivery, or browser layout. The React entrypoint is excluded from unit coverage because it only mounts the application; include it in future browser smoke tests.

Before changing SQL policies, run isolated Supabase integration checks for anonymous access, non-RPI users, participant-only reads, sender spoofing, self-messaging, nonmember recipients, immutable messages, and body limits (blank, 1, 2000, 2001 characters). Verify directory synchronization for confirmation, ban/deletion and metadata changes. Never run destructive fixtures against production.

Frontend coverage reports remaining callback/guard branches, including loading/duplicate submission races, delayed responses after unmount, some modal interactions, and periodic polling. These remain explicit gaps; passing tests do not mean every possible behavior is covered. Open `frontend/coverage/index.html` for exact uncovered lines after running coverage.
