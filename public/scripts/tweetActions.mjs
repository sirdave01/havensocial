export function initTweetActions() {
    console.log('🚀 Tweet actions initialized');

    // Like
    document.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const tweetId = btn.dataset.tweetId;
            const countSpan = btn.querySelector('.count');

            try {
                const res = await fetch('/likes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tweetId })
                });

                if (res.ok) {
                    btn.classList.toggle('liked');
                    let count = parseInt(countSpan.textContent);
                    countSpan.textContent = btn.classList.contains('liked') ? count + 1 : count - 1;
                }
            } catch (err) {
                console.error('Like failed:', err);
            }
        });
    });

    // Reply (opens a simple modal or redirects)
    document.querySelectorAll('.reply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tweetId = btn.dataset.tweetId;
            // You can open a modal or redirect to a reply page
            window.location.href = `/tweets/${tweetId}/reply`; // or open modal
        });
    });

    // Mark notification as read
    document.querySelectorAll('.mark-read-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const notifId = btn.dataset.notificationId;
            const item = btn.closest('.notification-item');

            try {
                await fetch(`/notifications/${notifId}/read`, { method: 'POST' });
                item.classList.add('read');
                btn.remove();
            } catch (err) {
                console.error(err);
            }
        });
    });

    // Share button (copy link)
    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tweetId = btn.dataset.tweetId;
            const url = `${window.location.origin}/tweets/${tweetId}`;
            navigator.clipboard.writeText(url).then(() => {
                btn.textContent = '✅';
                setTimeout(() => btn.textContent = '↗', 1500);
            });
        });
    });
}