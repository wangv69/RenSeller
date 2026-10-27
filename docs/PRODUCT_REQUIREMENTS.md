# RenSeller Product Requirements

## Product overview

RenSeller is an RPI-exclusive marketplace where verified students can buy and
sell textbooks, clothing, electronics, dorm supplies, furniture, and other
campus-appropriate items. The product is designed around local, on-campus
exchanges instead of shipping or interactions with unknown off-campus sellers.

RenSeller should help students:

- Save money by buying used items from fellow RPI students.
- Earn money from items they no longer need.
- Find relevant listings quickly.
- Communicate with buyers and sellers before an exchange.
- Complete exchanges in a safer, more convenient campus environment.

## Target users

### Buyers

RPI students looking for affordable items near campus. Buyers need to search
and filter listings, inspect item details, save interesting listings, and
contact sellers.

### Sellers

RPI students who want to create listings, manage their items, respond to
messages, and mark items as sold after an on-campus exchange.

### Moderators

Authorized team members who review reports, moderate listings, and help keep
the marketplace safe.

## Semester goals

The semester MVP should:

1. Deliver a functional RenSeller web application.
2. Allow students to create accounts using their RPI email addresses.
3. Allow users to create, edit, browse, search, and filter item listings.
4. Provide messaging so buyers and sellers can arrange on-campus exchanges.
5. Include basic user reporting and listing moderation.
6. Be tested with RPI students and improved using their feedback.
7. Launch a working version for the RPI community by the end of the semester.

An AI-powered recommendation system is an optional stretch goal to pursue only
after the MVP is reliable and the team has enough activity data to evaluate
recommendation quality.

## MVP requirements

### Accounts

- Users must sign up with an `@rpi.edu` email address.
- Users must be able to sign in and sign out.
- Users must be able to manage basic profile information.
- Protected actions must require an authenticated session.

### Listings

- Authenticated users must be able to create a listing.
- A listing must include a title, price, category, condition, description,
  seller, and at least one usable image or clearly support an image-less
  listing.
- Sellers must be able to edit and remove their own listings.
- Sellers must be able to mark their own listings as sold.
- Users must be able to browse active listings.
- Users must be able to search and filter listings.
- Users must be able to open a listing detail view.

Initial categories should include textbooks, clothing, electronics, dorm
supplies, and furniture. Additional categories may be added without changing
the core listing workflow.

### Messaging and exchanges

- A buyer must be able to contact a seller from a listing.
- Buyers and sellers must be able to exchange messages securely.
- Conversations must be associated with a listing and its participants.
- The product should communicate that exchanges happen on campus.
- The MVP should not process payments or provide shipping.

### Safety and moderation

- Users must be able to report a listing or user.
- Moderators must be able to review reports.
- Moderators must be able to hide or remove violating listings.
- The application must enforce ownership checks for listings, messages, and
  profile-owned data.
- Uploads must be validated for file type and size.
- The product must provide basic guidance for safe campus exchanges.

### Student feedback and launch

- Conduct usability testing with RPI students before launch.
- Record issues and feedback in GitHub Issues.
- Prioritize feedback that blocks account creation, listing creation,
  discovery, messaging, or safe exchanges.
- Verify the MVP flows in a production-like deployment before launch.

## Out of scope for the MVP

The following are not required for the first launch:

- Shipping or delivery
- Integrated payments, escrow, or refunds
- Off-campus public marketplace access
- Complex seller analytics
- AI recommendations before the core marketplace has usable data

## Optional AI recommendation feature

If MVP work is complete and time permits, RenSeller may recommend listings
based on a user's interests and activity. A first version should:

- Use explicit signals such as saved listings, searches, categories viewed,
  and prior listings.
- Explain recommendations in understandable terms.
- Avoid exposing one user's private activity to another user.
- Provide a fallback to popular or recent listings when there is not enough
  activity data.
- Be evaluated with measurable engagement and relevance criteria before launch.

The recommendation system must not delay or destabilize the core marketplace.

## Primary user journeys

### Buy an item

1. Student signs in with an RPI email.
2. Student searches or browses listings.
3. Student filters by category or other supported criteria.
4. Student opens a listing and reviews its details.
5. Student messages the seller.
6. Student arranges an on-campus exchange.
7. Student or seller marks the listing as sold after the exchange.

### Sell an item

1. Student signs in with an RPI email.
2. Student opens the sell flow.
3. Student enters item details and uploads images.
4. Student publishes the listing.
5. Student responds to buyer messages.
6. Student edits, pauses, or marks the listing as sold.

### Report unsafe content

1. Student reports a listing or user.
2. The report is stored with enough context for review.
3. A moderator reviews the report.
4. The moderator takes action or records a resolution.
5. The reporter receives an appropriate status update when supported.

## Success criteria

The semester release should be considered successful when:

- An RPI student can complete sign-up and sign-in.
- A seller can create, edit, browse, search, and mark a listing as sold.
- A buyer can find a listing and message its seller.
- Users can submit reports and moderators can act on them.
- Core flows work in the deployed environment.
- Student testing identifies no unresolved blocker in the primary user journeys.

## Related documentation

- [Architecture overview](./ARCHITECTURE.md)
- [Feature checklist and ownership workflow](./feature_checklist.md)
- [Project setup](../README.md)
