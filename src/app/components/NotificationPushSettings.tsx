'use client';

import { useEffect, useState } from 'react';

 type PushState =
  | 'checking'
  | 'unsupported'
  | 'disabled'
  | 'enabled'
  | 'denied'
  | 'working'
  | 'error';

function decodeApplicationServerKey(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const decoded = window.atob(padded);
  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return bytes;
}

function supportsPush() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function saveSubscription(subscription: PushSubscription) {
  const response = await fetch('/api/notifications/push/subscription', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(result?.message || 'Could not save your notification settings.');
  }
}

export default function NotificationPushSettings() {
  const [state, setState] = useState<PushState>('checking');
  const [message, setMessage] = useState('Checking this browser…');

  useEffect(() => {
    let active = true;

    async function checkSubscription() {
      if (!supportsPush()) {
        if (active) {
          setState('unsupported');
          setMessage('This browser or device does not support background notifications.');
        }
        return;
      }

      if (Notification.permission === 'denied') {
        if (active) {
          setState('denied');
          setMessage('Notifications are blocked in your browser settings.');
        }
        return;
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();

        if (subscription) {
          // Re-sync an existing browser subscription with the signed-in account.
          await saveSubscription(subscription);
          if (active) {
            setState('enabled');
            setMessage('Background notifications are enabled on this device.');
          }
        } else if (active) {
          setState('disabled');
          setMessage('Get alerts for likes, replies and new followers even when HavenSocial is not open.');
        }
      } catch {
        if (active) {
          setState('error');
          setMessage('Could not check your notification settings. Please try again.');
        }
      }
    }

    void checkSubscription();

    return () => {
      active = false;
    };
  }, []);

  async function enableNotifications() {
    if (!supportsPush()) {
      setState('unsupported');
      setMessage('This browser or device does not support background notifications.');
      return;
    }

    setState('working');
    setMessage('Enabling notifications…');

    try {
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'disabled');
        setMessage(
          permission === 'denied'
            ? 'Notifications are blocked. Change this in your browser settings to enable them.'
            : 'Notification permission was not granted.',
        );
        return;
      }

      const keyResponse = await fetch('/api/notifications/push/public-key', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const keyResult = await keyResponse.json().catch(() => null) as { publicKey?: string; message?: string } | null;

      if (!keyResponse.ok || !keyResult?.publicKey) {
        throw new Error(keyResult?.message || 'Push notifications are not configured yet.');
      }

      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(keyResult.publicKey) as BufferSource,
        });
      }

      await saveSubscription(subscription);
      setState('enabled');
      setMessage('Background notifications are now enabled on this device.');
    } catch (error) {
      console.error('Could not enable HavenSocial push notifications:', {
        errorName: error instanceof Error ? error.name : 'NonError',
      });
      setState('error');
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not enable notifications. Please try again.',
      );
    }
  }

  async function disableNotifications() {
    if (!supportsPush()) return;

    setState('working');
    setMessage('Disabling notifications…');

    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        const response = await fetch('/api/notifications/push/subscription', {
          method: 'DELETE',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        if (!response.ok) {
          throw new Error('Could not update your notification settings.');
        }

        await subscription.unsubscribe();
      }

      setState('disabled');
      setMessage('Background notifications are disabled on this device.');
    } catch {
      setState('error');
      setMessage('Could not disable notifications. Please try again.');
    }
  }

  return (
    <section className="feed-item notification-push-settings" aria-labelledby="push-settings-title">
      <h2 id="push-settings-title">Background notifications</h2>
      <p>{message}</p>

      {state === 'enabled' ? (
        <button type="button" onClick={() => void disableNotifications()}>
          Turn off background notifications
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void enableNotifications()}
          disabled={state === 'checking' || state === 'working' || state === 'unsupported' || state === 'denied'}
        >
          {state === 'working'
            ? 'Please wait…'
            : state === 'checking'
              ? 'Checking…'
              : state === 'denied'
                ? 'Notifications blocked'
                : 'Enable background notifications'}
        </button>
      )}
    </section>
  );
}
