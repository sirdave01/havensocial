
import { NextRequest, NextResponse } from 'next/server';

const publicPaths = new Set([
  '/',
  '/login',
  '/auth/bhid',
  '/auth/bhid/callback',
]);

// These endpoints are authenticated independently and should not
// be forced through browser-session authentication.
const publicApiPrefixes = [
  '/api/auth',
];

// Machine-to-machine cron endpoints.
// The actual cron secret must be validated inside the API route.
const cronPaths = new Set([
  '/api/cron/publish-scheduled',
]);

const isStaticAsset = (pathname: string): boolean => {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/styles/') ||
    pathname.startsWith('/scripts/') ||
    pathname.startsWith('/uploads/') ||
    pathname === '/favicon.ico' ||
    /\.[a-z0-9]+$/i.test(pathname)
  );
};

const isPublicApi = (pathname: string): boolean => {
  return publicApiPrefixes.some(
    (prefix) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
};

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Allow public pages, authentication endpoints, static assets,
  // and the scheduled-post endpoint through without a browser session.
  if (
    publicPaths.has(pathname) ||
    isStaticAsset(pathname) ||
    isPublicApi(pathname) ||
    cronPaths.has(pathname)
  ) {
    return NextResponse.next();
  }

  // Protect state-changing browser requests against cross-origin requests.
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  if (!safeMethods.includes(request.method)) {
    const origin = request.headers.get('origin');

    if (!origin || origin !== request.nextUrl.origin) {
      return NextResponse.json(
        { message: 'Invalid request origin' },
        { status: 403 }
      );
    }
  }

  // API requests should receive JSON authentication errors,
  // not browser login redirects.
  const isApiRequest =
    pathname === '/api' || pathname.startsWith('/api/');

  // Check the HavenSocial browser session.
  if (!request.cookies.has('haven_session')) {
    if (isApiRequest) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Redirect unauthenticated browser requests to login.
    const loginUrl = new URL('/login', request.url);

    loginUrl.searchParams.set('next', `${pathname}${search}`);

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
