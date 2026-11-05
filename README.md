# HavenSocial

HavenSocial is a Next-Gen Social Media application designed to function on the Web3 as post-to-earn. BHID handles sign-in, passwords, passkeys, and MFA; HavenSocial keeps its own linked user row and session for social features.

## Local setup

1. Use Node.js 20.9 or newer, then run `npm ci`.
2. Create a new Neon PostgreSQL database and set `DATABASE_URL` to its pooled connection string.
3. Apply [`src/setup.sql`](./src/setup.sql) to the empty database. This creates the HavenSocial roles and social tables. It does not import data from the previous database.
4. Copy `.env.example` to `.env` and set `DATABASE_URL`, a random `SESSION_SECRET` of at least 32 characters, the BHID client settings, and the S3-compatible storage settings. `APP_SESSION_TTL_SECONDS` defaults to 604800 seconds (7 days) and accepts values from 60 seconds to 30 days.
5. Configure the S3-compatible bucket. Set bucket CORS to allow `PUT` from your local and deployed HavenSocial origins with the `Content-Type` header. The configured public base URL must serve uploaded social media publicly.
6. Register HavenSocial as a BHID OIDC client. Set the exact callback URL to `http://localhost:3000/auth/bhid/callback` for local development and to `https://<your-app-domain>/auth/bhid/callback` in production.
7. Run `npm run dev`.

The issuer is `https://auth.bytehaven.world`. Use the BHID Authorization Code flow with S256 PKCE. The BHID client secret is server-only; never use a `NEXT_PUBLIC_` prefix or commit secret values. Configure the environment variables separately in Vercel for development, preview, and production.

## BHID claims and roles

HavenSocial links accounts by the `sub` claim from the ID token validated by `openid-client` using the issuer's discovered JWKS. The Authorization Code flow validates state, nonce, and S256 PKCE, uses the exact `BHID_REDIRECT_URI` for authorization and token exchange, and requests only the `openid` scope. HavenSocial does not request, fetch, or store BHID profile claims. Since BHID has no public profile lookup endpoint, account pages identify users by their BHID subject.

On first sign-in HavenSocial provisions a `users` row keyed by the BHID subject and creates a default `user_preferences` row. Session credentials are random opaque tokens stored only as SHA-256 hashes in `app_sessions`; the raw token is held in the encrypted, HTTP-only `haven_session` cookie. Every server-side linked-user lookup checks revocation, expiration, and `app_status`. Logout revokes the database session before clearing the cookie.

The SQL setup seeds `founder`, `admin`, `moderator`, and `user` roles. HavenSocial stores BHID subject, application role, and application status; it does not duplicate BHID profile information. Server-side permission checks map HavenSocial roles to application permissions; no role or permission is trusted from the browser. Accounts default to `user`; administrators can assign other roles through the database.

The previous local signup and password login flow is not part of the Next.js application. Existing database records are not automatically linked or migrated; the selected rollout starts with a fresh Neon database.
