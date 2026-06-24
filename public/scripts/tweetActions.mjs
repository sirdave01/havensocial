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
                    let count = parseInt(countSpan.textContent) || 0;
                    countSpan.textContent = btn.classList.contains('liked') ? count + 1 : Math.max(0, count - 1);
                }
            } catch (err) {
                console.error('Like failed:', err);
            }
        });
    });

    // Reply, Share, etc. (keep your existing code)
    document.querySelectorAll('.reply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tweetId = btn.dataset.tweetId;
            window.location.href = `/tweets/${tweetId}`; // or open reply modal
        });
    });

    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tweetId = btn.dataset.tweetId;
            const url = `${window.location.origin}/tweets/${tweetId}`;
            navigator.clipboard.writeText(url).then(() => {
                const original = btn.textContent;
                btn.textContent = '✅';
                setTimeout(() => btn.textContent = original, 1500);
            });
        });
    });
}

export function initMediaUpload() {
    const mediaInput = document.getElementById('tweetMedia');
    const previewContainer = document.getElementById('mediaPreview');

    if (!mediaInput || !previewContainer) return;

    mediaInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(ev) {
            previewContainer.innerHTML = `
                <img src="${ev.target.result}" class="preview-image" alt="Preview">
                <button type="button" class="remove-preview">×</button>
            `;
        };
        reader.readAsDataURL(file);
    });

    // Remove preview
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-preview')) {
            previewContainer.innerHTML = '';
            mediaInput.value = '';
        }
    });
}

// Main initializer for Feed page
export function initFeedPage() {
    initTweetActions();
    initMediaUpload();
}