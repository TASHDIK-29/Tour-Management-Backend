# TourLink — Backend API

REST API for a tour booking platform: catalogue management, bookings, online
payments, invoicing, authentication and business analytics.

Built with **Express 5 + TypeScript + MongoDB (Mongoose)**, organised as
self-contained feature modules.

The Next.js client lives in a separate repository.

---

## Key technologies

| Concern | Technology | Why it's here |
|---|---|---|
| Runtime / framework | **Express 5**, TypeScript | REST layer |
| Database | **MongoDB + Mongoose 9** | Documents, aggregation pipelines for stats, transactions for payments |
| Validation | **Zod 4** | Request schemas, applied as middleware |
| Auth | **Passport** (local + Google OAuth 2.0), **JWT**, **bcryptjs** | Credentials and social login, stateless sessions |
| Caching | **Redis** | OTP storage with native TTL expiry |
| Payments | **SSLCommerz** | Hosted checkout + IPN validation |
| File storage | **Cloudinary** (+ multer) | Tour/division images and generated invoices |
| Email | **Nodemailer + EJS** | OTP, password reset and invoice delivery |
| PDF | **PDFKit** | Invoice generation |

---

## Architecture

### Request lifecycle

```
Request
  → CORS (single allowed origin) → cookie-parser → body parsers → passport
  → Router  /api/v1/<module>
      → checkAuth(...roles)        role gate, verifies the JWT
      → multerUpload               multipart only, streams to Cloudinary
      → validateRequest(zodSchema) parses & replaces req.body
      → Controller                 HTTP only — reads req, calls the service
          → Service                all business logic and DB access
      → sendResponse               one uniform envelope
  → globalErrorHandler             every thrown error funnels here
```

### Layering rule

**Controllers never contain business logic.** A controller pulls values off the
request, calls one service function and hands the result to `sendResponse`.
Services own the rules, the database and the transactions — which keeps them
testable and reusable, and means a route change never touches business logic.

Every controller is wrapped in **`catchAsync`**, so no `try/catch` blocks are
repeated and every async rejection reaches the error handler.

### Module layout

Each feature is a folder of up to seven files, always named the same way:

```
modules/<name>/
├─ <name>.route.ts        endpoint definitions + middleware chain
├─ <name>.controller.ts   HTTP layer
├─ <name>.service.ts      business logic + DB access
├─ <name>.model.ts        Mongoose schema
├─ <name>.interface.ts    TypeScript types + enums
├─ <name>.validation.ts   Zod schemas
└─ <name>.constant.ts     searchable fields, etc.
```

Adding a feature means adding a folder and one line in `routes/index.ts` —
nothing else in the codebase needs to change.

```
src/
├─ server.ts                  bootstrap: Redis → Mongo → listen → seed admin,
│                             plus process-level crash/signal handlers
├─ app.ts                     Express assembly and middleware order
└─ app/
   ├─ config/                 env, passport, cloudinary, multer, redis
   ├─ modules/                auth, user, tour, division, booking,
   │                          payment, sslCommerz, otp, stats
   ├─ middlewares/            checkAuth, validateRequest,
   │                          globalErrorHandler, notFound
   ├─ helpers/                per-error-type handlers (Zod, cast,
   │                          duplicate, validation)
   ├─ utils/                  QueryBuilder, catchAsync, sendResponse,
   │                          jwt, invoice, sendEmail, seedSuperAdmin
   ├─ error/AppError.ts       operational error with a status code
   └─ routes/index.ts         mounts every module under /api/v1
```

---

## Core design decisions

### Centralised error handling

Anything thrown anywhere lands in `globalErrorHandler`, which delegates to a
helper per error type — Zod, Mongoose `CastError`, duplicate-key, and
`ValidationError` — and normalises all of them into one response:

```jsonc
{ "success": false, "message": "…", "errorSources": [ { "path": "…", "message": "…" } ] }
```

`errorSources` carries the per-field detail, so clients can attach messages to
the right input. The raw error and stack are only included in development.

The handler also **cleans up orphaned uploads**: because multer streams files to
Cloudinary *before* validation runs, a request that fails afterwards would leave
images behind with no document referencing them. The error handler deletes
anything on `req.file` / `req.files` on its way out.

### Reusable query building

`utils/QueryBuilder.ts` is a chainable wrapper over a Mongoose query:

```ts
const data = new QueryBuilder(Tour.find(), req.query)
  .filter().search(tourSearchableFields).sort().fields().paginate();
```

Every list endpoint gets filtering, regex search across a module-declared field
list, sorting, projection and pagination without repeating itself.

### Authentication

- **Access token** returned in the response body; **refresh token** set as an
  httpOnly cookie.
- `checkAuth(...roles)` verifies the token, loads the user fresh from the
  database, rejects unverified / blocked / inactive / deleted accounts and
  enforces the role list. Because the user is re-read on every request, a
  blocked account loses access immediately rather than when its token expires.
- Roles: `SUPER_ADMIN`, `ADMIN`, `GUIDE`, `USER`.
- A **super admin is seeded on boot** from environment variables if absent.
- Google OAuth runs through Passport with the post-login destination carried in
  the OAuth `state` parameter.

> **Cookie note:** `sameSite` tracks `secure` — `none` in production, `lax` in
> development. `SameSite=None` without `Secure` is rejected outright by modern
> browsers, which silently breaks login over plain HTTP.

### Payments

Booking and payment are created together, then the flow is:

1. `POST /booking` creates a `PENDING` booking and an `UNPAID` payment, and
   returns an SSLCommerz gateway URL.
2. The user pays; SSLCommerz redirects to the success/fail/cancel callback.
3. The success callback runs inside a **MongoDB transaction** — mark the payment
   `PAID`, the booking `COMPLETE`, generate the PDF invoice, upload it to
   Cloudinary and email it. Any failure rolls the whole thing back.
4. `POST /payment/init-payment/:bookingId` reopens the gateway for an unpaid
   booking, **reusing the original transaction id** so callbacks still resolve
   to the same payment document. This is what "pay later" is built on.

### OTP verification

Codes are stored in **Redis with a 2-minute TTL**, so expiry is handled by the
datastore rather than by application cleanup code, and a verified code is
deleted immediately so it cannot be replayed.

---

## API overview

All routes are mounted under **`/api/v1`**.

| Module | Highlights | Access |
|---|---|---|
| `/auth` | login, logout, refresh-token, change/set/forgot/reset password, Google OAuth | mixed |
| `/user` | register, me, list, update | mixed |
| `/tour` | tour CRUD (multipart) + tour-type CRUD | read public · write admin |
| `/division` | division CRUD (multipart) | read public · write admin |
| `/booking` | create, my-bookings, by id, status update, list all | authenticated |
| `/payment` | init-payment, success/fail/cancel callbacks, invoice, IPN validate | mixed |
| `/otp` | send, verify | public |
| `/stats` | booking, payment, user and tour analytics | admin |

**Conventions**

- Success responses share one envelope:
  `{ statusCode, success, message, meta?, data }`.
- Write endpoints for tours and divisions are **multipart**: the JSON payload
  arrives as a stringified field named `data`, with files under `files` (tours)
  or `file` (divisions).
- The `Authorization` header carries the **raw** JWT — no `Bearer ` prefix.

---

## Getting started

**Prerequisites:** Node.js 20+, MongoDB, Redis, and accounts for Cloudinary,
SSLCommerz and an SMTP provider.

```bash
git clone https://github.com/TASHDIK-29/Tour-Management-Backend.git
cd Tour-Management-Backend
npm install
cp .env.example .env    # then fill in every value
npm run dev
```

The API starts on `PORT` (default `5000`); `GET /` is a health check.

`config/env.ts` validates the environment **at boot** and throws on the first
missing variable, so a misconfigured deployment fails immediately and loudly
instead of at the first request that needs the value.

### Environment variables

| Group | Variables |
|---|---|
| Core | `PORT`, `DB_URL`, `NODE_ENV`, `FRONTEND_URL` |
| Auth | `BCRYPT_SALT_ROUND`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES`, `EXPRESS_SESSION_SECRET` |
| Super admin | `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` |
| SSLCommerz | `SSL_STORE_ID`, `SSL_STORE_PASS`, `SSL_PAYMENT_API`, `SSL_VALIDATION_API`, `SSL_IPN_URL`, and the `SSL_{SUCCESS,FAIL,CANCEL}_{FRONTEND,BACKEND}_URL` pairs |
| Cloudinary | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD` |

> `FRONTEND_URL` is the **only** origin allowed by CORS. It must match exactly,
> port included, or every browser request fails.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Watch mode via ts-node-dev |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm run lint` | ESLint over `src/` |

---

## Operational behaviour

`server.ts` handles `unhandledRejection`, `uncaughtException`, `SIGTERM` and
`SIGINT` by closing the HTTP server before exiting, so a crash or a container
stop drains in-flight requests instead of dropping them.
