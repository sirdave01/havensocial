let currentPage = 1;
const pageSize = 10;
let isLoading = false;
let hasMore = true;

/* ===================== TWEET ACTIONS ===================== */
export function initTweetActions() {
    console.log('🚀 Tweet actions initialized');

    document.querySelectorAll('.menu-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const menu = document.querySelector(`[data-menu-for="${btn.dataset.tweetId}"]`);
            document.querySelectorAll('.tweet-menu.show').forEach(openMenu => {
                if (openMenu !== menu) openMenu.classList.remove('show');
            });
            menu?.classList.toggle('show');
        });
    });

    document.addEventListener('click', event => {
        if (!event.target.closest('.tweet-owner-actions')) {
            document.querySelectorAll('.tweet-menu.show').forEach(menu => menu.classList.remove('show'));
        }
    });

    // ================= LIKE =================
    document.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const tweetId = btn.dataset.tweetId;
            const count = btn.querySelector('.count');

            const res = await fetch('/likes', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ tweetId })
            });

            if (res.ok) {
                count.textContent = parseInt(count.textContent) + 1;
            }
        });
    });

    /* ===== FOLLOW ===== */
    document.querySelectorAll('.follow-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const followeeId = btn.dataset.userId;
            if (!followeeId) return;

            const isFollowing = btn.classList.contains('following');

            try {
                const res = await fetch(isFollowing ? '/unfollow' : '/follow', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ followeeId })
                });

                if (res.ok) {
                    btn.classList.toggle('following');
                    btn.textContent = isFollowing ? 'Follow' : 'Following';
                }
            } catch (err) {
                console.error(err);
            }
        });
    });

    // ================= REPLY =================
    document.querySelectorAll('.reply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            openReplyModal(btn.dataset.tweetId, btn.dataset.username);
        });
    });

    // ================= RETWEET =================
    document.querySelectorAll('.repost-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const tweetId = btn.dataset.tweetId;
            const count = btn.querySelector('.count');

            const res = await fetch('/retweets', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ tweetId })
            });

            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                count.textContent = parseInt(count.textContent || '0') + 1;
                btn.classList.add('active');
            } else {
                alert(data.message || 'Unable to retweet right now');
            }
        });
    });

    // ================= VIEWS =================
    document.querySelectorAll('.view-count').forEach(view => {
        const tweetId = view.closest('.tweet-card')?.dataset.tweetId;
        if (!tweetId) return;

        fetch(`/tweets/${tweetId}/view`, { method: 'POST' }).catch(() => {});
    });

    // ================= PIN =================
    document.querySelectorAll('.pin-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const tweetId = btn.dataset.tweetId;

            const res = await fetch('/tweets/pin', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ tweetId })
            });

            if (res.ok) {
                btn.classList.toggle('pinned');
            }
        });
    });

    // ================= SHARE (X STYLE) =================
    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const tweetId = btn.dataset.tweetId;
            const url = `${location.origin}/tweet/${tweetId}`;

            if (navigator.share) {
                navigator.share({ url, title: "Tweet" });
            } else {
                await navigator.clipboard.writeText(url);

                btn.textContent = "✓";
                setTimeout(() => btn.textContent = "🔗", 1000);
            }
        });
    });

    /* ===== DELETE ===== */
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this tweet? This cannot be undone.')) return;

            const tweetId = btn.dataset.tweetId;
            const tweetCard = btn.closest('.tweet-card');

            try {
                const res = await fetch(`/tweets/${tweetId}`, { method: 'DELETE' });
                if (res.ok) tweetCard?.remove();
                else alert('Failed to delete tweet');
            } catch (err) {
                console.error(err);
            }
        });
    });

    /* ===== EDIT ===== */
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            openEditModal(btn.dataset.tweetId);
        });
    });
}

/* ===================== EDIT MODAL ===================== */
function openEditModal(tweetId) {
    let modal = document.getElementById('editModal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'editModal';
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Edit Tweet</h3>
                        <button class="close-modal">✕</button>
                    </div>

                    <textarea id="editContent" maxlength="280"
                        style="width:100%; height:120px;"></textarea>

                    <div class="modal-actions">
                        <button class="cancel-edit">Cancel</button>
                        <button class="save-edit btn-primary">Save Changes</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.close-modal').onclick = closeEditModal;
        modal.querySelector('.cancel-edit').onclick = closeEditModal;

        modal.querySelector('.save-edit').onclick = async () => {
            const id = modal.dataset.tweetId;
            await saveEdit(id);
        };
    }

    modal.dataset.tweetId = tweetId;
    modal.style.display = 'block';

    fetch(`/tweets/${tweetId}`)
        .then(r => r.json())
        .then(tweet => {
            document.getElementById('editContent').value = tweet.content;
        })
        .catch(() => alert('Could not load tweet content'));
}

async function saveEdit(tweetId) {
    const content = document.getElementById('editContent').value.trim();
    if (!content) return alert('Content cannot be empty');

    try {
        const res = await fetch(`/tweets/${tweetId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        if (res.ok) {
            closeEditModal();
            location.reload();
        } else {
            alert('Failed to update tweet');
        }
    } catch (err) {
        console.error(err);
    }
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    if (modal) modal.style.display = 'none';
}

/* ===================== TWEET CREATION ===================== */
export function initTweetCreation() {
    const form = document.getElementById('tweetForm');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();

        const submitBtn = form.querySelector('.post-btn');
        const originalText = submitBtn.textContent;
        const formData = new FormData(form);

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Posting...';

            const res = await fetch('/tweets', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (res.ok) {
                form.reset();
                document.getElementById('mediaPreview')?.replaceChildren();
                location.reload();
            } else {
                alert(data.message || 'Failed to post tweet');
            }
        } catch (err) {
            console.error(err);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

/* ===================== REPLY MODAL ===================== */
function openReplyModal(tweetId, username) {
    let modal = document.getElementById('replyModal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'replyModal';
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Reply to ${username}</h3>
                        <button class="close-modal">✕</button>
                    </div>

                    <textarea id="replyContent" maxlength="280"
                        placeholder="Write your reply..."></textarea>

                    <div class="char-count">
                        <span id="replyCharCount">0</span>/280
                    </div>

                    <div class="modal-actions">
                        <button class="cancel-reply">Cancel</button>
                        <button class="submit-reply btn-primary">Reply</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.close-modal').onclick = closeReplyModal;
        modal.querySelector('.cancel-reply').onclick = closeReplyModal;
        modal.querySelector('.submit-reply').onclick = async () => {
            await submitReply(modal.dataset.tweetId);
        };
    }

    modal.dataset.tweetId = tweetId;
    modal.style.display = 'block';

    const textarea = modal.querySelector('#replyContent');
    const counter = modal.querySelector('#replyCharCount');

    textarea.value = '';
    counter.textContent = '0';

    textarea.oninput = () => {
        counter.textContent = textarea.value.length;
    };
}

function closeReplyModal() {
    const modal = document.getElementById('replyModal');
    if (modal) modal.style.display = 'none';
}

async function submitReply(tweetId) {
    const content = document.getElementById('replyContent').value.trim();
    if (!content) return alert('Reply cannot be empty');

    try {
        const res = await fetch('/tweets/reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, isReplyTo: tweetId })
        });

        if (res.ok) {
            closeReplyModal();
            location.reload();
        } else {
            alert('Failed to post reply');
        }
    } catch (err) {
        console.error(err);
    }
}

/* ===================== MEDIA UPLOAD ===================== */
export function initMediaUpload() {
    const mediaInput = document.getElementById('tweetMedia');
    const preview = document.getElementById('mediaPreview');
    if (!mediaInput || !preview) return;

    mediaInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = ev => {
            preview.innerHTML = `
                <img src="${ev.target.result}" class="preview-image">
                <button class="remove-preview">×</button>
            `;
        };
        reader.readAsDataURL(file);
    });

    document.addEventListener('click', e => {
        if (e.target.classList.contains('remove-preview')) {
            preview.innerHTML = '';
            mediaInput.value = '';
        }
    });
}

/* ===================== INFINITE SCROLL ===================== */
export function initInfiniteScroll() {
    console.warn('Infinite scroll disabled until API is ready');
}

/* ===================== PAGE INIT ===================== */
export function initFeedPage() {
    initTweetActions();
    initTweetCreation();
    initMediaUpload();
    initInfiniteScroll();
}