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

Use Docker with the Compose plugin in WSL (Ubuntu). Make sure `docker info` and
`docker compose version` succeed inside WSL first. From a WSL terminal, open
this checkout:

```sh
cd /mnt/j/Code/Projects/RenSeller
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
