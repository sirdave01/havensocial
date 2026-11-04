import { NextRequest, NextResponse } from 'next/server';

const publicPaths = new Set([
  '/',
  '/login',
  '/auth/bhid',
  '/auth/bhid/callback',
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    publicPaths.has(pathname) ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/styles/') ||
    pathname.startsWith('/scripts/') ||
    pathname.startsWith('/uploads/') ||
    pathname === '/favicon.ico' ||
    /\.[a-z0-9]+$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (!origin || origin !== request.nextUrl.origin) {
      return NextResponse.json({ message: 'Invalid request origin' }, { status: 403 });
    }
  }

  if (!request.cookies.has('haven_session')) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/auth).*)', '/api/:path*'],
};
