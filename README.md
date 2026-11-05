# HavenSocial

HavenSocial is a Next-Gen Social Media application designed to function on the Web3 as post-to-earn. BHID handles sign-in, passwords, passkeys, and MFA; HavenSocial keeps its own linked user row and session for social features.

## Local setup

1. Use Node.js 20.9 or newer, then run `npm ci`.
2. Create a new Neon PostgreSQL database and set `DATABASE_URL` to its pooled connection string.
3. Apply [`src/setup.sql`](./src/setup.sql) to the empty database. This creates the HavenSocial roles and social tables. It does not import data from the previous database.
4. Copy `.env.example` to `.env` and set `DATABASE_URL`, a random `SESSION_SECRET` of at least 32 characters, the BHID client settings, and `S3_BUCKET_NAME`. `AWS_REGION` defaults to `us-east-1`; `S3_PUBLIC_BASE_URL` defaults to the standard public AWS S3 URL for that bucket and region. Set `S3_ENDPOINT` and `S3_PUBLIC_BASE_URL` when using S3-compatible storage. S3/AWS access-key variables are optional when the AWS SDK default credential chain is configured (for example, with a deployment IAM role). `APP_SESSION_TTL_SECONDS` defaults to 604800 seconds (7 days) and accepts values from 60 seconds to 30 days.
5. Configure the S3-compatible bucket. Set bucket CORS to allow `PUT` from your local and deployed HavenSocial origins with the `Content-Type` header. The public base URL must serve uploaded social media publicly.
6. Register HavenSocial as a BHID OIDC client. Set the exact callback URL to `http://localhost:3000/auth/bhid/callback` for local development and to `https://<your-app-domain>/auth/bhid/callback` in production.
7. Run `npm run dev`.

For Neon connection strings, use `sslmode=verify-full`. If your existing `.env` connection string uses `sslmode=require`, replace that query parameter with `sslmode=verify-full`. This preserves current certificate verification behavior and avoids the PostgreSQL driver compatibility warning.

The issuer is `https://auth.bytehaven.world`. Use the BHID Authorization Code flow with S256 PKCE. The BHID client secret is server-only; never use a `NEXT_PUBLIC_` prefix or commit secret values. Configure the environment variables separately in Vercel for development, preview, and production.

## BHID claims and roles

HavenSocial links accounts by the `sub` claim from the ID token validated by `openid-client` using the issuer's discovered JWKS. The Authorization Code flow validates state, nonce, and S256 PKCE, uses the exact `BHID_REDIRECT_URI` for authorization and token exchange, and requests `openid profile name preferred_username picture bio verification`. Server-side UserInfo requests use the BHID access token and reject any subject that differs from the verified ID token subject. BHID's current discovery metadata lists `name`, `preferred_username`, `picture`, `verification_level`, and `verification_tier` as supported claims; it does not list `bio`, so HavenSocial displays a biography only if the UserInfo response actually contains one.

On first sign-in HavenSocial provisions a `users` row keyed by the BHID subject and creates a default `user_preferences` row. HavenSocial session credentials are random opaque tokens stored only as SHA-256 hashes in `app_sessions`; the raw session token is held in the encrypted, HTTP-only `haven_session` cookie. The BHID access token needed for subsequent UserInfo requests is encrypted with AES-256-GCM using a key derived from `SESSION_SECRET` and stored only in the server-side `app_sessions` row. BHID profile claims are fetched for server-rendered pages and are not cached or persisted. Every server-side linked-user lookup checks revocation, expiration, and `app_status`. Logout revokes the database session and clears its encrypted BHID token before clearing the cookie.

For an existing database, apply [`src/migrations/20261105_bhid_profile_tokens.sql`](./src/migrations/20261105_bhid_profile_tokens.sql). Fresh databases receive the same columns from `src/setup.sql`.

The SQL setup seeds `founder`, `admin`, `moderator`, and `user` roles. HavenSocial stores BHID subject, application role, and application status; it does not duplicate BHID profile information. Server-side permission checks map HavenSocial roles to application permissions; no role or permission is trusted from the browser. Accounts default to `user`; administrators can assign other roles through the database.

The previous local signup and password login flow is not part of the Next.js application. Existing database records are not automatically linked or migrated; the selected rollout starts with a fresh Neon database.
