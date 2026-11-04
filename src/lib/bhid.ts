import * as oidc from 'openid-client';

let clientConfiguration: Promise<oidc.Configuration> | undefined;

export function getBhidConfiguration() {
  if (!clientConfiguration) {
    const issuer = process.env.BHID_ISSUER;
    const clientId = process.env.BHID_CLIENT_ID;
    if (!issuer || !clientId) {
      throw new Error('BHID_ISSUER and BHID_CLIENT_ID must be configured');
    }

    const discovery = oidc.discovery(
      new URL(issuer),
      clientId,
      process.env.BHID_CLIENT_SECRET || undefined,
    );
    clientConfiguration = discovery.catch((error: unknown) => {
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
  return redirectUri;
}
