# RenSeller Feature Checklist

This checklist reflects the current repository implementation. Items marked
“implemented” are present in the codebase; items marked “to implement” are
planned work or currently represented only by mock data/UI.

## Semester goals

- [ ] Deliver a functional RenSeller web application
- [x] Allow students to create accounts with RPI email addresses
- [ ] Allow users to create, edit, browse, search, and filter item listings
- [ ] Add buyer/seller messaging for on-campus exchanges
- [ ] Add user reporting and listing moderation
- [ ] Test with RPI students and incorporate feedback
- [ ] Launch a working version for the RPI community by the end of the semester
- [ ] Optional stretch goal: add an AI-powered recommendation system

See [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) for the complete
product scope, user journeys, MVP requirements, and success criteria.

## How to track ownership

We will use GitHub Issues and a GitHub Project for active work. This file will be
focused on the product roadmap rather than trying to maintain changing assignees.

1. Create one issue for each independently deliverable feature or bug.
2. Assign exactly one primary owner to each issue. Add collaborators in the
   issue body when more than one person is needed.
3. Add labels such as `frontend`, `backend`, `database`, `design`, `testing`,
   and `blocked`.
4. Link the issue to the relevant GitHub Project and move it through
   `Todo` → `In Progress` → `Review` → `Done`.
5. Use a branch named after the issue, for example
   `feature/123-listing-crud`, and include `Closes #123` in the pull request.
6. The owner updates the issue when work starts, when blocked, and when the
   pull request is ready for review.
7. Only check off an item below after the implementation is merged and
   verified. Link the completed issue or pull request in the commit/PR.

## Platform and deployment

- [x] React + TypeScript frontend powered by Vite
- [x] FastAPI backend powered by Uvicorn
- [x] Dockerfiles for the frontend and backend
- [x] Docker Compose configuration for the frontend and backend containers
- [x] Optional PostgreSQL service in Docker Compose
- [x] Frontend production build served through Nginx
- [x] Nginx proxying for `/api/` requests
- [x] Backend health endpoint (`/health`)
- [x] Database readiness endpoint (`/health/ready`)
- [x] Local development and Docker setup documentation
- [ ] Add automated CI checks for frontend build/lint and backend validation
- [ ] Add production environment and deployment documentation
- [ ] Add database migrations and schema management

## Authentication and accounts

- [x] Supabase client configuration through frontend environment variables
- [x] Sign in with email and password
- [x] Sign up with an RPI email address
- [x] Client-side validation requiring an `@rpi.edu` address
- [x] Sign-up full-name and password confirmation validation
- [x] Email verification flow and confirmation message
- [x] Session restoration on page load
- [x] Auth state updates when the Supabase session changes
- [x] Sign out
- [x] Backend Supabase JWT validation for protected API routes
- [x] Backend restriction to authenticated RPI email addresses
- [x] Authenticated `/auth/me` endpoint
- [ ] Add password reset / forgot-password flow
- [ ] Add account deletion flow
- [ ] Add stronger password and account validation rules
- [ ] Add user/profile persistence in the application database

## Profiles

- [x] Profile page navigation
- [x] Display account name, username, and email
- [x] Edit full name
- [x] Edit email with confirmation messaging
- [x] Select current dorm
- [x] Change password
- [x] Upload a profile picture to the Supabase `avatars` bucket
- [x] Validate profile picture type and 5 MB size limit
- [x] Display the uploaded profile picture or an initial
- [x] Display purchase and listing history screens with sample data
- [ ] Persist dorm and profile information in a dedicated profile schema
- [ ] Load real purchase history from the backend
- [ ] Load real listing history from the backend
- [ ] Add profile picture removal/replacement cleanup

## Marketplace browsing

- [x] Homepage branding and RPI student marketplace messaging
- [x] Listing card layout with image, title, price, category, condition, and seller
- [x] Sample listings for textbooks, electronics, furniture, clothing, and tickets
- [x] Search listings by title and category
- [x] Filter listings by category
- [x] Empty state when no listings match the search/filter
- [x] Listing detail modal
- [x] Save and unsave listings locally during the current session
- [x] Responsive category and listing presentation
- [ ] Replace hard-coded sample listings with backend/API data
- [ ] Create listing, category, condition, and image database schemas
- [ ] Add server-side search, filtering, sorting, and pagination
- [ ] Add working filter controls beyond category selection
- [ ] Persist favorites for authenticated users
- [ ] Add listing image storage and image moderation/validation
- [ ] Add listing owner profiles and seller details
- [ ] Add listing status management (active, sold, removed, expired)
- [ ] Add reporting and moderation tools
- [ ] Add campus exchange guidance and safety notices
- [ ] Add AI-powered recommendation system

## Selling

- [x] “Sell an item” entry point
- [x] Initial sell-item modal with title and price fields
- [ ] Build the complete listing creation form
- [ ] Require authentication before creating a listing
- [ ] Add category, condition, description, location, and pickup details
- [ ] Add one or more listing image uploads
- [ ] Validate price, text fields, and upload limits
- [ ] Save listings to the backend/database
- [ ] Allow sellers to edit, pause, delete, and mark listings as sold
- [ ] Show newly created listings in marketplace results

## Communication and transactions

- [ ] Implement the Messages navigation destination
- [ ] Implement buyer-to-seller conversations
- [ ] Store and retrieve messages securely
- [ ] Add unread message indicators and notifications
- [ ] Add a contact/message action to listing details
- [ ] Add offer or negotiation support
- [ ] Define and implement a campus pickup workflow
- [ ] Add transaction status tracking
- [ ] Add buyer/seller ratings or reviews
- [ ] Add safeguards for spam, abuse, and blocked users
- [ ] Keep payments and shipping out of the MVP

## Backend and data

- [x] PostgreSQL connection helper using `DATABASE_URL` or Compose `PG*` variables
- [x] Database connectivity test endpoint
- [x] FastAPI API documentation endpoint
- [x] Basic error responses for missing/invalid authentication
- [ ] Define application tables for users/profiles, listings, images, favorites,
  messages, and transactions
- [ ] Add migrations and seed/development data
- [ ] Add Pydantic request and response models
- [ ] Add CRUD endpoints for listings
- [ ] Add CRUD endpoints for favorites
- [ ] Add messaging and transaction endpoints
- [ ] Add authorization checks for resource ownership
- [ ] Add backend tests and API integration tests
- [ ] Avoid exposing raw database exception text from diagnostic endpoints
- [ ] Add structured logging, rate limiting, and production error handling

## Student testing and launch

- [ ] Define a student usability-testing protocol
- [ ] Test sign-up, listing creation, listing discovery, messaging, and
  reporting with RPI students
- [ ] Track feedback and blockers in GitHub Issues
- [ ] Resolve launch-blocking feedback before release
- [ ] Verify the MVP in a production-like deployment

## Quality, accessibility, and operations

- [x] Frontend TypeScript build script
- [x] Frontend ESLint script
- [x] Basic semantic labels, buttons, dialog roles, and status messages
- [ ] Add automated frontend component and interaction tests
- [ ] Add automated backend tests
- [ ] Add keyboard focus management for modals and menus
- [ ] Add complete keyboard navigation and screen-reader review
- [ ] Add loading, retry, and offline/error states for API operations
- [ ] Add end-to-end testing for sign-up, listing creation, browsing, and messaging
- [ ] Add monitoring and health checks for production dependencies
- [ ] Review security policies for Supabase Storage and user-owned data

## Optional AI recommendations

- [ ] Define measurable recommendation relevance and engagement criteria
- [ ] Collect privacy-safe signals such as saved listings and viewed categories
- [ ] Implement recommendations only after MVP marketplace flows are stable
- [ ] Provide a recent/popular listings fallback for new users
- [ ] Evaluate recommendations with student feedback before launch

## Suggested implementation order

1. Add the database schema and migrations for profiles and listings.
2. Add authenticated listing CRUD endpoints and replace sample listings.
3. Finish the sell-item form, image uploads, and listing management.
4. Persist favorites and profile history.
5. Implement messaging and campus exchange status.
6. Add reporting, moderation, and safety guidance.
7. Test the MVP with RPI students and resolve launch blockers.
8. Add tests, authorization checks, and production hardening.
9. Consider AI recommendations only if the MVP is stable and time permits.
