# RenSeller Architecture

## Purpose

RenSeller is a campus marketplace for RPI students. The application is
structured as a React frontend, a FastAPI backend, and optional PostgreSQL
infrastructure. Supabase currently provides authentication and profile image
storage.

This document describes both the current implementation and the intended
architecture for marketplace features that are not implemented yet.

The semester MVP is defined in
[PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md). It prioritizes verified
RPI accounts, listings, search and filtering, buyer/seller messaging, campus
exchanges, reporting, moderation, student testing, and launch readiness.
Recommendations powered by AI are an optional stretch goal and must not delay
the core marketplace.

## Current repository structure

```text
RenSeller/
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py              # FastAPI application and route registration
│       ├── db.py                # PostgreSQL connection helper
│       └── api/
│           ├── auth.py           # Supabase JWT validation and /auth routes
│           └── health.py         # Liveness and database readiness routes
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf               # Static hosting and /api proxy
│   ├── package.json
│   └── src/
│       ├── App.tsx              # Marketplace shell and listing UI
│       ├── Auth.tsx             # Sign-in, sign-up, and sign-out
│       ├── Profile.tsx           # Account and profile management
│       └── lib/supabase.ts       # Supabase browser client
├── docs/                         # Project documentation
├── compose.yaml                  # Local container orchestration
├── README.md                     # Setup and operating instructions
├── feature_checklist.md          # Product roadmap and ownership workflow
└── stack.txt                     # Original technology stack notes
```

Application source remains separated by deployable service. Documentation now
has its own `docs/` directory; root-level files remain for onboarding,
deployment, and project tracking.

## Current system

```text
                         ┌────────────────────┐
                         │       Browser      │
                         │ React + TypeScript │
                         └──────────┬─────────┘
                                    │
                         local dev: Vite
                         Docker: Nginx :80
                                    │
                   /api/*           │ static files / SPA fallback
                                    │
                                    v
                         ┌────────────────────┐
                         │       Nginx        │
                         │ frontend container │
                         └──────────┬─────────┘
                                    │ strips /api prefix
                                    v
                         ┌────────────────────┐
                         │      FastAPI       │
                         │ backend container  │
                         └───────┬───────┬────┘
                                 │       │
                         optional│       │ Supabase JWKS
                                 v       v
                         ┌──────────┐ ┌──────────────┐
                         │PostgreSQL│ │Supabase      │
                         │optional  │ │Auth/Storage  │
                         └──────────┘ └──────────────┘
```

### Frontend

The frontend is a Vite-built React application. In production it is compiled
into static files and served by Nginx. Nginx:

- Serves the compiled frontend and falls back to `index.html` for client-side
  routes.
- Proxies `/api/` requests to the backend container.
- Exposes `/healthz` for the frontend container health check.

The current marketplace UI keeps sample listings in `App.tsx`. Search,
category filtering, listing details, and favorites therefore operate on
client-side sample data. Favorites are not persisted.

### Backend

The backend is a FastAPI application served by Uvicorn. Current routes include:

- `GET /` — basic backend availability response
- `GET /health` — liveness check used by Docker Compose
- `GET /health/ready` — PostgreSQL readiness check
- `GET /database-test` — development database connectivity test
- `GET /auth/me` — returns the authenticated RPI user's basic account data

The backend container runs with a `/api` root path. Nginx removes `/api` before
forwarding a request, which allows external URLs such as
`/api/health` and `/api/docs` while FastAPI handles the corresponding
`/health` and `/docs` paths internally.

### Authentication and authorization

The browser uses Supabase Auth for sign-up, sign-in, session restoration, and
sign-out. Sign-up is limited in the UI to `@rpi.edu` email addresses.

For protected backend routes, the browser should send the Supabase access token
as a bearer token:

```text
Authorization: Bearer <supabase-access-token>
```

`backend/app/api/auth.py` validates the token against Supabase's JWKS endpoint,
checks the `authenticated` audience and Supabase issuer, and rejects users
whose email is not an RPI address. Future resource routes must use the
authenticated subject (`sub`) for ownership checks.

### Supabase

Supabase is currently used for:

- Email/password authentication
- Auth user metadata such as full name, username, dorm, and avatar URL
- Public profile image URLs from the `avatars` storage bucket

The frontend connects directly to Supabase using `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. The publishable key is intended for browser
use; service-role keys must never be placed in frontend files or committed to
the repository.

### PostgreSQL

PostgreSQL is an optional Compose service. It is not started by the default
Compose command and currently contains no RenSeller application schema or
migrations. The backend can connect through `DATABASE_URL` or the `PG*`
environment variables supplied by Compose.

Before implementing persistent listings, the team must decide whether
PostgreSQL or Supabase's database will be the system of record. That decision
should be documented before adding migrations.

## Planned marketplace architecture

When marketplace persistence is implemented, the intended request flow is:

1. The browser loads listings from the backend rather than hard-coded arrays.
2. Supabase provides the user's session and access token.
3. The frontend sends the access token with protected API requests.
4. FastAPI validates the token and derives the owner from the token subject.
5. FastAPI validates request data with Pydantic models.
6. The backend applies ownership and visibility rules.
7. The backend reads or writes the application database.
8. The API returns stable response models to the frontend.

The initial relational model is expected to include:

- `profiles`
- `listings`
- `listing_images`
- `favorites`
- `conversations`
- `messages`
- `transactions`
- `reports`

The model should support the MVP user journeys: listing discovery and
ownership, buyer/seller conversations tied to a listing, on-campus exchange
status, and moderation reports. Payment and shipping entities are intentionally
out of scope for the MVP.

Foreign keys and ownership rules should prevent users from editing another
user's listings, messages, favorites, or transaction records. Database
migrations should be committed with the application changes that depend on
them.

## Planned backend organization

As routes grow, organize the backend by responsibility rather than placing all
logic in `main.py`:

```text
backend/app/
├── main.py
├── config.py
├── db.py
├── models/          # Database models or SQL definitions
├── schemas/         # Pydantic request/response models
├── services/        # Business rules
├── repositories/    # Database access
└── api/
    ├── auth.py
    ├── health.py
    ├── listings.py
    ├── favorites.py
    ├── messages.py
    └── transactions.py
```

This is a target structure, not a request to create empty directories before
they are needed. Add each module with its first feature and cover it with
tests.

## Deployment topology

### Local Docker Compose

- `frontend`: builds React, serves Nginx, and publishes the local frontend port
- `backend`: runs FastAPI and is reachable by the frontend service as
  `backend:8000`
- `database`: optional PostgreSQL 17 service enabled with the `database`
  profile

The frontend depends on the backend health check. Database-backed readiness is
separate, so the application can start without PostgreSQL even though
database features will not work.

### Local non-Docker development

- Vite serves the frontend, usually at `http://localhost:5173`
- Uvicorn serves the backend at `http://127.0.0.1:8000`
- Frontend API requests should use relative `/api/` paths when routed through
  the Docker/Nginx setup
- Supabase configuration belongs in `frontend/.env.local`

## Cross-cutting requirements

Future features should preserve these requirements:

- Never trust a user ID supplied by the client when a verified token subject
  is available.
- Keep secrets and Supabase service-role credentials out of frontend code.
- Validate uploaded files by type and size on the server as well as in the UI.
- Return structured API errors instead of raw database exception text.
- Add authorization tests for every user-owned resource.
- Add migrations before relying on a new persistent table.
- Add loading, error, and retry states for network-backed UI.
- Keep exchanges on campus and communicate basic safety guidance to users.
- Provide reporting and moderation controls before launch.
- Test the primary user journeys with RPI students.
- Update [feature_checklist.md](./feature_checklist.md) when a feature changes
  from planned to implemented.

## Related documentation

- [Project setup and operations](../README.md)
- [Product requirements and semester goals](./PRODUCT_REQUIREMENTS.md)
- [Feature roadmap and ownership workflow](./feature_checklist.md)
- [Technology stack notes](../stack.txt)
