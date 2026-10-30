# RenSeller
A web application that lets RPI students buy and sell affordable,
campus-appropriate items from verified members of the RPI community.

RenSeller focuses on local, on-campus exchanges for textbooks, clothing,
electronics, dorm supplies, furniture, and similar items. The semester MVP
includes RPI email accounts, listing creation and discovery, buyer/seller
messaging, and basic reporting and moderation. An AI-powered recommendation
system is an optional stretch goal after the core marketplace is reliable.

See the [product requirements](docs/PRODUCT_REQUIREMENTS.md) for the product
scope and semester goals, and the [architecture overview](docs/ARCHITECTURE.md)
for the current and planned system design. Track implementation status in the
[feature checklist](docs/feature_checklist.md).

## Run with Docker

Install Docker with the Compose plugin and make sure `docker info` and
`docker compose version` succeed in your terminal. On Windows, you can use
Docker Desktop with WSL integration. Open a terminal in your cloned repository's
root directory (the folder containing `compose.yaml`). Run the commands below
from that directory.

Before building, copy `frontend/.env.example` to `frontend/.env.local` and set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Compose mounts that file
only during the frontend build. Vite includes these public settings in the browser
bundle; use the publishable key here.

After changing this file, rebuild without cache and restart the frontend:

```sh
docker compose build --no-cache frontend
docker compose up -d frontend
```

From the repository root, run:

```sh
docker compose up --build -d --wait
```

Open **http://localhost:8080**. By default, the stack runs the frontend and backend
in separate containers. PostgreSQL is prepared as an optional service for later:

| Service | Purpose | Address inside Docker |
| --- | --- | --- |
| frontend | Builds React with Vite, serves it with Nginx, and proxies `/api/` | `frontend:80` |
| backend | FastAPI served by Uvicorn | `backend:8000` |
| database (optional) | PostgreSQL 17 with persistent storage | `database:5432` |

Only the frontend port is published, bound to the local machine. Browser API
requests should use relative paths such as `fetch('/api/health')`.
The frontend currently displays sample listings; this setup does not add a
listing schema or connect those samples to PostgreSQL.

- API docs: http://localhost:8080/api/docs
- API health: http://localhost:8080/api/health
- API and database readiness: http://localhost:8080/api/health/ready (returns 503 until the database is available)

Compose waits for the backend's `/health` endpoint before starting the frontend.
Neither service requires a database to start. Database-backed features still
need a running database and an application schema.

### Enable the database later

When ready to run PostgreSQL locally:

```sh
docker compose --profile database up --build -d --wait
```

This enables the database container alongside the frontend and backend. The
backend already has matching connection settings. This creates an empty database;
it does not add application tables or migrations. Database data lives in the
`postgres_data` named volume and survives rebuilds and normal shutdowns.

### Configuration

The defaults are for local development. Optionally copy `.env.example` to `.env`
in the repository root and edit the port or database credentials before the first
startup. Compose passes matching database settings to PostgreSQL and the backend;
the backend connects using the database service name, not `localhost`.
PostgreSQL initialization settings only apply to an empty data volume: changing
credentials in `.env` does not change users in an existing database.

For a backend running outside Docker, `backend/.env` can still supply a
`DATABASE_URL`. It is excluded from the image; Compose uses `PGHOST`, `PGPORT`,
`PGDATABASE`, `PGUSER`, and `PGPASSWORD` instead.

### Common commands

```sh
docker compose ps
docker compose logs -f
docker compose up --build -d --wait
docker compose --profile database exec database psql -U renseller -d renseller
docker compose --profile database down
```

Rebuild after source changes; these images do not mount source files or run hot
reload. Adjust the `psql` user/database arguments if you changed their defaults.
The `psql` command requires the optional database to be running. Including the
profile in `down` stops all services, including the database if it was enabled.
To intentionally delete all local database data, run
`docker compose --profile database down -v`.
## Run the Website

The frontend and backend run as separate local servers. Open two PowerShell terminals.

### 1. Start the frontend

From the repository root:

```powershell
npm --prefix frontend install
npm --prefix frontend run dev
```

Open the URL printed by Vite, usually:

```text
http://localhost:5173/
```

You can also start it by changing into the frontend folder first:

```powershell
cd frontend
npm install
npm run dev
```

Keep this terminal running while you work. Vite automatically updates the browser when frontend files change.

### 2. Start the backend

In a second PowerShell terminal, from the repository root:

```powershell
cd backend
python -m uvicorn app.main:app --reload
```

The backend runs at:

```text
http://127.0.0.1:8000/
```

Check that it is healthy by opening:

```text
http://127.0.0.1:8000/health
```

The expected response is:

```json
{"status":"healthy"}
```

### Create an .env file for the database

Create a .env.local file that contains the contents in .env.example
and replace with proper url and key.

For authentication, enable Email authentication in Supabase. Supabase will send a verification email after sign-up; set the local redirect URL to `http://localhost:5173/` under Authentication settings. Sign-up accepts only `@rpi.edu` addresses and automatically derives the username from the email prefix.

The profile page uploads pictures to a public Supabase Storage bucket named `avatars`. Create that bucket under Storage before testing profile picture changes. Email changes also require confirmation through the new email address.


### Useful frontend commands

Run these from `frontend`, or use the `npm --prefix frontend` form from the repository root:

```powershell
npm run build
npm run lint
```

`npm run build` checks TypeScript and creates the production files in `frontend/dist`. `npm run lint` checks the source code for common problems.

### Common mistake

This will fail from the repository root because the root does not have a `package.json`:

```powershell
npm run dev
```

Use this instead:

```powershell
npm --prefix frontend run dev
```

### Password recovery

The sign-in form includes **Forgot password?**. Supabase emails a reset link;
following it opens the new-password form. An authenticated recovery session is
required to update the password. Expired links offer **Request new link**.

In Supabase Authentication URL Configuration, allow these exact redirect URLs
for the environments you use:

- `http://localhost:8080/?recovery=1` (Docker)
- `http://localhost:5173/?recovery=1` (Vite)
- Your deployed app origin followed by `/?recovery=1`

Keep the Supabase Reset Password email template linked to `{{ .ConfirmationURL }}`
so the recovery token is verified before redirecting to the app. Configure SMTP
for delivery to your users' RPI inboxes. Test the email flow with a real account:
request a link, open it, set a new password, sign out, and sign in with the new
password. Supabase dashboard settings and email delivery are configured separately
from this repository.

### Messaging student directory

Apply `supabase/migrations/202610160001_messaging_members.sql` in the Supabase
SQL Editor (or through your Supabase migration workflow) before using Messages.
It creates a read-only student directory backed by Auth user IDs, backfills
confirmed RPI accounts, and syncs account changes and deletions. Only signed-in
RPI accounts can read names and IDs; emails are not exposed by the directory.
Display names come from signup metadata and are not identity verification.

Messages loads this directory each time it opens, excluding the current account.
Loading failures and an empty directory never fall back to sample sellers.
The inbox lists existing conversations, ordered by the latest message. To start
a new DM, search for a registered student by name under **New message**, then
select a result. Selecting a student opens the composer; it does not send a
message. Drafts stay separate for each student. Incoming conversations appear
automatically while Messages is open.
The marketplace listings are still samples and have no real seller IDs, so their
message buttons are disabled. The Messages navigation opens the actual directory.
For saved conversations, also apply
`supabase/migrations/202610160002_direct_messages.sql` once, after the directory
migration. It adds the messages table, participant-only read access, sender and
recipient validation, and enables Supabase Realtime for new messages. Browser
clients cannot update or delete messages or supply their own timestamps.

Messages are saved before the composer clears. Failed sends keep the draft and
can be retried. Incoming messages update automatically while a conversation is
open; a 15-second refresh and window-focus refresh also recover missed updates.
History is loaded in pages so conversations can exceed the API row limit.
Account deletion removes its messages. Message contents are plain text.

Rebuild the Docker frontend after applying frontend source changes:

```sh
docker compose up --build -d frontend
```

Verify with two confirmed RPI accounts in separate browser sessions: select each
other, send in both directions, and refresh to confirm history persists. Switch
conversations while sending to check drafts stay with their recipients. Test an
offline send and retry after reconnecting. A third account must not be able to
read the conversation through the API, and an insert with another user's sender
ID must be rejected by row-level security. SQL Editor runs as an administrator
and therefore does not test browser access restrictions.
