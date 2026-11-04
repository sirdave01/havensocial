# HavenSocial

HavenSocial is a Next-Gen Social Media application designed to function on the Web3 as post-to-earn. BHID handles sign-in, passwords, passkeys, and MFA; HavenSocial keeps its own linked user row and session for social features.

## Local setup

1. Use Node.js 20.9 or newer, then run `npm ci`.
2. Create a new Neon PostgreSQL database and set `DATABASE_URL` to its pooled connection string.
3. Apply [`src/setup.sql`](./src/setup.sql) to the empty database. This creates the HavenSocial roles and social tables. It does not import data from the previous database.
4. Copy `.env.example` to `.env` and set `DATABASE_URL`, a random `SESSION_SECRET` of at least 32 characters, the BHID client settings, and the S3-compatible storage settings.
5. Configure the S3-compatible bucket. Set bucket CORS to allow `PUT` from your local and deployed HavenSocial origins with the `Content-Type` header. The configured public base URL must serve uploaded social media publicly.
6. Register HavenSocial as a BHID OIDC client. Set the exact callback URL to `http://localhost:3000/auth/bhid/callback` for local development and to `https://<your-app-domain>/auth/bhid/callback` in production.
7. Run `npm run dev`.

The issuer is `https://auth.bytehaven.world`. Use the BHID Authorization Code flow with S256 PKCE. The BHID client secret is server-only; never use a `NEXT_PUBLIC_` prefix or commit secret values. Configure the environment variables separately in Vercel for development, preview, and production.

## BHID claims and roles

HavenSocial links accounts by the validated OIDC `sub` claim. It reads standard `name`, `preferred_username`, `email`, and `picture` claims, and optional `bio` and `birthdate` claims. The verification level is read from the claim path in `BHID_VERIFICATION_CLAIM` (default `verification.level`). If BHID uses different claim names, configure the path and requested scopes to match BHID's client documentation.

The SQL setup seeds the `founder`, `admin`, `moderator`, and `user` roles. `BHID_ROLE_CLAIM` identifies the BHID claim containing role names (default `roles`); only those four HavenSocial role values are accepted. If BHID uses different values, `BHID_ROLE_MAP` can map claim values to these names as a JSON object. Missing or unrecognized role claims map to `user` and do not grant administrative privileges. Role/multiplier reward policy is intentionally not implemented yet; verification level is stored for that later work.

The previous local signup and password login flow is not part of the Next.js application. Existing database records are not automatically linked or migrated; the selected rollout starts with a fresh Neon database.
