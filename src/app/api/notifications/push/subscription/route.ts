import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { db } from '@/models/db.js';

export const runtime = 'nodejs';

function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function validEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validKey(value: unknown, minLength: number, maxLength: number) {
  return typeof value === 'string'
    && value.length >= minLength
    && value.length <= maxLength
    && /^[A-Za-z0-9_-]+$/.test(value);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ message: 'Invalid request origin.' }, { status: 403 });
  }

  const user = await getLinkedUser();
  if (!user) {
    return NextResponse.json({ message: 'Please sign in first.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid subscription data.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ message: 'Invalid subscription data.' }, { status: 400 });
  }

  const subscription = body as {
    endpoint?: unknown;
    expirationTime?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };

  if (
    !validEndpoint(subscription.endpoint) ||
    !subscription.keys ||
    !validKey(subscription.keys.p256dh, 20, 200) ||
    !validKey(subscription.keys.auth, 10, 200)
  ) {
    return NextResponse.json({ message: 'The browser subscription is incomplete.' }, { status: 400 });
  }

  let expirationTime: Date | null = null;
  if (typeof subscription.expirationTime === 'number' && Number.isFinite(subscription.expirationTime)) {
    const candidate = new Date(subscription.expirationTime);
    if (!Number.isNaN(candidate.valueOf())) expirationTime = candidate;
  }

  try {
    await db.query(
      `INSERT INTO push_subscriptions (
         user_id,
         endpoint,
         p256dh,
         auth,
         expiration_time,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (endpoint)
       DO UPDATE SET
         user_id = EXCLUDED.user_id,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         expiration_time = EXCLUDED.expiration_time,
         updated_at = CURRENT_TIMESTAMP`,
      [
        user.users_id,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        expirationTime,
      ],
    );

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Could not save Web Push subscription:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });
    return NextResponse.json({ message: 'Could not enable push notifications. Please try again.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ message: 'Invalid request origin.' }, { status: 403 });
  }

  const user = await getLinkedUser();
  if (!user) {
    return NextResponse.json({ message: 'Please sign in first.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid subscription data.' }, { status: 400 });
  }

  const endpoint =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as { endpoint?: unknown }).endpoint
      : undefined;

  if (!validEndpoint(endpoint)) {
    return NextResponse.json({ message: 'Invalid browser subscription.' }, { status: 400 });
  }

  try {
    await db.query(
      `DELETE FROM push_subscriptions
       WHERE user_id = $1 AND endpoint = $2`,
      [user.users_id, endpoint],
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Could not remove Web Push subscription:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });
    return NextResponse.json({ message: 'Could not disable push notifications. Please try again.' }, { status: 500 });
  }
}
