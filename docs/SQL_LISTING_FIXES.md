# Listing deletion and visibility repairs

These changes address GitHub issues #35 (only seeing your own items) and #36
(`permission denied for table listings` when deleting your own item).

## Apply to Supabase

The repository changes do not apply SQL to the hosted project automatically.
Use the normal migration process, or run the following files once in the
Supabase SQL Editor, in order:

1. Existing prerequisite: `202611060001_listing_moderation.sql`.
   Do not rerun it if it is already applied. It creates the moderation column,
   admin helper, audit table, and review rules. Applying it for the first time
   puts existing listings into the pending queue.
2. [202611170001_owner_listing_delete.sql](../supabase/migrations/202611170001_owner_listing_delete.sql).
3. [202611170002_listing_visibility.sql](../supabase/migrations/202611170002_listing_visibility.sql).

Deploy the updated frontend after applying the SQL. The existing account-group
migrations still apply as described in [USER_GROUPS.md](USER_GROUPS.md).

The deletion migration grants the table permission missing from the profile
branch's policy-only migration. RLS limits deletion to the listing's owner;
admins cannot hard-delete another seller's row. Admin removal continues through
the moderation RPC. Moderation events keep their original listing IDs even after
the listing is deleted. Their listing foreign key is removed so history remains
immutable instead of blocking deletion or being erased by a cascade.

The visibility migration replaces SELECT/ALL policies, including restrictive
legacy owner-only policies, with the established review rules. It does not change
listing statuses: everyone can read approved listings; sellers can also read
their own unpublished listings; current admins can review all listings. Pending,
rejected, and removed listings remain hidden from other students. If an item is
pending, approve it through moderation before expecting it in the marketplace.

Seller names are optional in the frontend. If the member directory is unavailable
or denies access, readable listings still display with the existing `RPI student`
label. Listing-query failures still display an error with a retry action.

## Deleting in this frontend branch

Open your approved listing from the marketplace, select **Delete listing**, and
confirm **Yes, delete it**. Cancelling does not send a delete request. The form
locks repeated submissions, supports retry after a failure, and cancels the
request on unmount or loss of owner controls. Success removes the item from the
marketplace and saved listings. Photo cleanup uses the path returned by the
deleted row and only removes paths inside the current owner's folder. A cleanup
failure reports that the listing was deleted but the photo remains.

This branch's details flow lists approved marketplace items. The SQL also allows
owners to delete pending/rejected/removed rows through an owner listings screen,
such as the separate profile branch's existing delete flow. A new owner inventory
screen is not included here.

## Regression evidence and verification

Tests were added and run before the corresponding production changes:

- Owner deletion failed against disposable PostgreSQL with `permission denied for
  table listings`, for pending, approved, rejected, and removed listings.
- Visibility upgrade tests returned no rows for another student's approved item
  while a restrictive legacy SELECT/ALL owner-only policy was present.
- Frontend tests failed to find readable listings when seller-name lookup failed.
- Delete confirmation and app cleanup tests failed because this branch had no
  owner delete control.

The database tests exercise actual grants, RLS, cross-account access (including
admins), anonymous denial, missing rows, unchanged audit history, and visibility
after upgrades. The UI tests exercise confirmation/cancellation, service/network
errors and retry, missing rows, loading, duplicate submission, unmount cleanup,
photo cleanup failures, and marketplace/favorites cleanup.

These checks use synthetic data and disposable local databases. They do not
verify which policies are currently installed in the hosted project, hosted
PostgREST/storage behavior, or real browser layout. Apply the migrations and
check with two test accounts before closing the issues: one owner and one other
student must both see an approved item; only the owner can delete it; an
unapproved item must remain hidden from the other student.

Validation on November 17, 2026: locked frontend dependency installation,
150 frontend tests (97.18% lines, 90.32% branches), lint, and production build
passed on Windows. The local virtual environment installed
`backend/requirements-dev.txt`; all 133 backend/database tests passed against
PostgreSQL 18 with 100% backend Python coverage. Both required Docker services
also passed: frontend coverage/lint/build and all 133 backend/database tests
against PostgreSQL 17 with database tests required. Hosted deployment and
browser layout remain unverified.
