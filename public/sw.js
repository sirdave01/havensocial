/* HavenSocial Web Push service worker. */

async function broadcastBadgeCount(count) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));

  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });

  for (const client of clients) {
    client.postMessage({
      type: 'HAVENSOCIAL_BADGE_COUNT',
      count: safeCount,
    });
  }
}

self.addEventListener('message', (event) => {
  const message = event.data;

  if (!message || typeof message !== 'object') return;

  if (
    message.type === 'HAVENSOCIAL_SET_APP_BADGE' &&
    Number.isInteger(message.count) &&
    message.count >= 0
  ) {
    event.waitUntil(broadcastBadgeCount(message.count));
  }

  if (message.type === 'HAVENSOCIAL_CLEAR_APP_BADGE') {
    event.waitUntil(broadcastBadgeCount(0));
  }
});

self.addEventListener('push', (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title =
    typeof payload.title === 'string' && payload.title.trim()
      ? payload.title
      : 'HavenSocial';

  const options = {
    body:
      typeof payload.body === 'string' && payload.body.trim()
        ? payload.body
        : 'You have a new notification.',
    icon: '/images/havensocial_logo.webp',
    badge: '/images/havensocial_logo.webp',
    tag:
      typeof payload.tag === 'string'
        ? payload.tag
        : 'havensocial-notification',
    data: {
      url:
        payload.data && typeof payload.data.url === 'string'
          ? payload.data.url
          : '/notifications',
    },
  };

  const tasks = [
    self.registration.showNotification(title, options),
  ];

  if (
    Number.isInteger(payload.badgeCount) &&
    payload.badgeCount >= 0
  ) {
    tasks.push(broadcastBadgeCount(payload.badgeCount));
  }

  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const requestedPath = event.notification.data?.url;
      let targetUrl = new URL('/notifications', self.location.origin);

      if (
        typeof requestedPath === 'string' &&
        requestedPath.startsWith('/') &&
        !requestedPath.startsWith('//')
      ) {
        const candidate = new URL(requestedPath, self.location.origin);

        if (candidate.origin === self.location.origin) {
          targetUrl = candidate;
        }
      }

      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if (new URL(client.url).origin === self.location.origin) {
          if (typeof client.navigate === 'function') {
            await client.navigate(targetUrl.href);
          }

          await client.focus();
          return;
        }
      }

      await self.clients.openWindow(targetUrl.href);
    })(),
  );
});