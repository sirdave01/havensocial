import { NextResponse } from 'next/server';
import { getBhidRedirectUri } from '@/lib/bhid';
import { getHavenSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getHavenSession();
  session.destroy();
  return NextResponse.redirect(new URL('/', getBhidRedirectUri()), { status: 303 });
}
