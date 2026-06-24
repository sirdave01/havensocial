
let currentPage = 1;
const pageSize = 10;
let isLoading = false;
let hasMore = true;

export function initTweetActions() {
    console.log('🚀 Tweet actions initialized');

    const isLoggedIn = document.body.dataset.loggedIn === "true";

    if (!isLoggedIn) {
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (confirm("Please log in to interact with posts.")) {
                    window.location.href = '/login';
                }
            });
        });
        return;
    }

    // Like Button
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

    // Reply Button - Open Modal with Original Tweet
    document.querySelectorAll('.reply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tweetId = btn.dataset.tweetId;
            const username = btn.dataset.username || '@user';
            openReplyModal(tweetId, username);
        });
    });

    // Share Button
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

// Reply Modal with Original Tweet + Character Count
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
                        <button onclick="closeReplyModal()" class="close-modal">✕</button>
                    </div>
                    
                    <!-- Original Tweet Preview -->
                    <div id="originalTweetPreview" class="original-tweet-preview"></div>
                    
                    <div class="reply-box">
                        <textarea id="replyContent" placeholder="Write your reply..." maxlength="280"></textarea>
                        <div class="char-count">
                            <span id="replyCharCount">0</span>/280
                        </div>
                    </div>
                    
                    <div class="modal-actions">
                        <button class="btn-secondary" onclick="closeReplyModal()">Cancel</button>
                        <button class="btn-primary" onclick="submitReply(${tweetId})">Reply</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    modal.style.display = 'block';
    
    // Character count
    const textarea = document.getElementById('replyContent');
    const countSpan = document.getElementById('replyCharCount');
    
    textarea.addEventListener('input', () => {
        countSpan.textContent = textarea.value.length;
    });
}

window.closeReplyModal = () => {
    const modal = document.getElementById('replyModal');
    if (modal) modal.style.display = 'none';
};

window.submitReply = async (tweetId) => {
    const content = document.getElementById('replyContent').value.trim();
    if (!content) return alert("Reply cannot be empty");

    try {
        const res = await fetch('/tweets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, isReplyTo: tweetId })
        });

        if (res.ok) {
            alert("Reply posted successfully!");
            closeReplyModal();
            location.reload();
        } else {
            alert("Failed to post reply");
        }
    } catch (err) {
        console.error(err);
        alert("Error posting reply");
    }
};

// Media Upload Preview (unchanged)
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

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-preview')) {
            previewContainer.innerHTML = '';
            mediaInput.value = '';
        }
    });
}

// Infinite Scroll (unchanged)
export function initInfiniteScroll() {
    // ... your existing infinite scroll code
}

// Main initializer
export function initFeedPage() {
    initTweetActions();
    initMediaUpload();
    initInfiniteScroll();
}