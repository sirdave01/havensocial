import { NextResponse } from 'next/server';
import { getHavenSocialOrigin } from '@/lib/bhid';
import { getHavenSession, revokeAppSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST() {
  const session = await getHavenSession();
  await revokeAppSession(session.appSessionToken);
  session.destroy();
  return NextResponse.redirect(new URL('/', getHavenSocialOrigin()), { status: 303 });
}
