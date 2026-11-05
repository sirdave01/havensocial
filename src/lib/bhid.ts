import * as oidc from 'openid-client';

let clientConfiguration: Promise<oidc.Configuration> | undefined;

export function getBhidConfiguration() {
  if (!clientConfiguration) {
    const issuer = process.env.BHID_ISSUER;
    const clientId = process.env.BHID_CLIENT_ID;
    if (!issuer || !clientId) {
      throw new Error('BHID_ISSUER and BHID_CLIENT_ID must be configured');
    }

    const clientSecret = process.env.BHID_CLIENT_SECRET || undefined;
    const discovery = oidc.discovery(
      new URL(issuer),
      clientId,
      clientSecret,
      clientSecret ? oidc.ClientSecretBasic(clientSecret) : oidc.None(),
    );
    clientConfiguration = discovery.then((configuration) => {
      if (!configuration.serverMetadata().jwks_uri) {
        throw new Error('BHID OpenID configuration must provide a JWKS URI');
      }
      return configuration;
    }).catch((error: unknown) => {
      clientConfiguration = undefined;
      throw error;
    });
  }

  return clientConfiguration;
}

export function getBhidRedirectUri() {
  const redirectUri = process.env.BHID_REDIRECT_URI;
  if (!redirectUri) {
    throw new Error('BHID_REDIRECT_URI must be configured');
  }
  const parsed = new URL(redirectUri);
  if (parsed.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('BHID_REDIRECT_URI must use HTTPS in production');
  }
  return parsed.href;
}

export function getHavenSocialOrigin() {
  return new URL(getBhidRedirectUri()).origin;
}
