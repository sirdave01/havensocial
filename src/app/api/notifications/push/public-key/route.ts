import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getLinkedUser();

  if (!user) {
    return NextResponse.json(
      { message: 'Please sign in first.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();

  if (!publicKey) {
    return NextResponse.json(
      { message: 'Push notifications are not configured yet.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { publicKey },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
