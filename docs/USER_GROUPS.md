# User groups

Accounts have one application group: `user` or `admin`. Existing and newly
registered accounts default to `user` without requiring a data migration.
Only an exact `app_metadata.group` value of `admin` identifies an admin;
missing, malformed, or unknown values resolve to `user`.

The profile displays the group as read-only account information. The existing
authenticated `/auth/me` endpoint returns it in the `group` field using verified
JWT claims. Editable `user_metadata`, top-level claims named `group`, and
Supabase's own `role` claim do not assign application groups.

## Assigning membership

Use a trusted server or administrative script with Supabase's Auth Admin API
to set `app_metadata.group` to `admin` or `user` for the intended account.
Preserve the account's other app metadata. Service-role credentials must remain
outside frontend code and browser environment variables. There is deliberately
no self-service group selector or group-change endpoint.

Refresh the user's session after a change so newly issued JWTs contain the
updated group. Existing JWTs can retain old membership until refreshed or
expired. The listing moderation RPC checks the current `auth.users` row rather
than relying on group membership in an old token. Revoked, banned, deleted,
unconfirmed, or non-RPI admins cannot moderate, even if the navigation still
shows the admin button until their session refreshes.

## Listing moderation

Every new listing starts as `pending`. Admin listings need approval too.
Only `approved` listings appear in the marketplace. Sellers can read their own
pending/rejected/removed rows through the database, but these are not public
marketplace listings. Posting displays a confirmation that approval is needed.

After signing in as an admin, choose **Moderate listings** in the header:

1. Select **Pending approval** and review the title, photo, price, category,
   condition, and seller ID.
2. Choose **Review listing**, enter a reason (1–500 characters), then
   **Approve**, **Reject**, or **Remove** and confirm the decision.
3. Use the **Approved** queue to remove an already-published listing.

Rejection and removal hide listings. Removal is a soft removal: the row and
photo remain for moderation review; a timestamped audit event records the
admin, listing, action, and reason. The existing public image bucket remains
public: hiding a listing does not revoke a previously shared photo URL.
Removed listings are read-only in the review UI. Restoring or resubmitting
rejected listings is not part of this workflow.

Regular users cannot approve, reject, remove, or directly update listings.
Database grants/RLS enforce this even for requests made outside the app.
All decisions go through an atomic database function which locks the listing,
rejects stale decisions, changes its status, and records an immutable audit
event. Admins can query history in `public.listing_moderation_events`.

## Enable this in your Supabase project

The hosted database has not been changed automatically.

1. Open **Supabase → SQL Editor** and run
   [`202611060001_listing_moderation.sql`](../supabase/migrations/202611060001_listing_moderation.sql)
   once, or apply it through your usual migration process. It expects the
   existing `public.listings` table and its current listing/image columns.
2. **Existing listings also become pending** and disappear from public results
   until approved. The migration replaces the existing listing policies and
   restricts direct listing writes; review it before applying to a shared project.
3. Rebuild the frontend: `docker compose up --build -d`.
4. Sign out and back in as your admin account. Submit a test listing with a
   regular account, approve it as admin, then verify it appears in the marketplace.
   Remove it through the Approved queue and verify it disappears after refresh.

Apply the migration before deploying the frontend, which now filters by the
new `moderation_status` column. No service-role secret is needed by the app.

## Validation

Backend tests first failed because `/auth/me` did not return a group. Profile
tests first failed because the account group label did not exist. Both were
implemented only after observing those failures. Tests cover default/admin
membership, invalid values, user-metadata spoofing, read-only profile saves,
loading, and missing/failed authentication.

Moderation database tests first failed because `moderation_status` did not
exist. Queue tests first failed for the missing component; decision tests then
failed for missing review controls. Marketplace tests reproduced immediate
publication and the absent admin navigation before the corresponding changes.
A regression test also reproduced stale queue contents after a failed refresh.

`backend/tests/test_listing_moderation.py` creates and destroys a disposable
PostgreSQL cluster with synthetic accounts and Supabase-style auth helpers.
It never uses `DATABASE_URL`. It runs the actual migration and checks RLS,
cross-account reads/writes, approval, rejection, removal, audit integrity,
invalid inputs, boundaries, stale decisions, and revoked/ineligible admins.
These tests do not prove hosted Supabase Auth behavior, PostgREST delivery,
email/token refresh, or the exact schema of your hosted listing table.

Local integration checks require `initdb` and `pg_ctl` on PATH and an unprivileged
OS user. Set `REQUIRE_DATABASE_TESTS=1` to fail rather than skip if binaries are
missing. The backend Docker test service installs PostgreSQL and runs all tests
as its unprivileged postgres OS user, with database checks required.

Frontend coverage still reports uncovered branches in App, Auth, Messages,
Moderation, and Profile; coverage gates are unchanged.

Host validation passed: dependency installation, 110 frontend tests with
coverage (95.56% lines, 87.45% branches), lint, build, and 60 backend/database
tests with 100% backend Python coverage. The database checks passed against
local PostgreSQL 18 and container PostgreSQL 17. Both required Docker services
passed through Ubuntu WSL: frontend coverage/lint/build and backend tests with
all 31 database checks enabled. Hosted deployment and browser layout have not
been verified.
