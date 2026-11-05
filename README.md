# HavenSocial

HavenSocial is a social application for sharing posts and connecting with a community. Sign-in
and identity are provided by BHID; HavenSocial stores social content and application-specific
settings.

## Development

Use Node.js 20.9 or newer. Install dependencies with `npm ci`, configure the required environment
variables in a local `.env` file using `.env.example` as a reference, then start the development
server with `npm run dev`.

Post media is stored in a dedicated HavenSocial S3 bucket. Keep bucket credentials server-side
and configure browser uploads only for the app's own trusted origins.
For local development, use a configured AWS profile or server-side access keys; in deployment,
provide credentials through the runtime's AWS role or another AWS SDK credential provider. An
`AWS_ROLE_ARN` by itself is not credentials and cannot sign uploads.

Never commit local environment files, credentials, personal uploads, or private operational
documentation. Contact the project maintainers for access to development services and deployment
configuration.

## Project checks

- `npm run typecheck`
- `npm run build`
