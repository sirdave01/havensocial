
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
        const isLiked = btn.classList.contains('liked');

        try {
            const res = await fetch(isLiked ? '/likes/unlike' : '/likes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tweetId })
            });

            if (res.ok) {
                btn.classList.toggle('liked');
                let count = parseInt(countSpan.textContent) || 0;
                countSpan.textContent = isLiked ? Math.max(0, count - 1) : count + 1;
            }
        } catch (err) {
            console.error('Like failed:', err);
        }
    });
        
        // Follow Button Handler
    document.querySelectorAll('.follow-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const followeeId = btn.dataset.userId;
            const isFollowing = btn.classList.contains('following');

            try {
                const res = await fetch(isFollowing ? '/follows/unfollow' : '/follows', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ followeeId })
                });

                if (res.ok) {
                    btn.classList.toggle('following');
                    btn.textContent = isFollowing ? 'Follow' : 'Following';
                }
            } catch (err) {
                console.error('Follow failed:', err);
            }
        });
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

// Infinite Scroll
export function initInfiniteScroll() {
    window.addEventListener('scroll', async () => {
        if (isLoading || !hasMore) return;

        const scrollPosition = window.innerHeight + window.scrollY;
        const pageHeight = document.documentElement.scrollHeight;

        if (scrollPosition >= pageHeight - 800) {
            isLoading = true;
            currentPage++;

            try {
                const res = await fetch(`/feed?limit=${pageSize}&offset=${currentPage * pageSize}`);
                if (!res.ok) return;

                const newTweets = await res.json();

                if (newTweets.length > 0) {
                    const feedContainer = document.getElementById('feedContainer');
                    newTweets.forEach(tweet => {
                        const tweetHTML = `
                            <div class="tweet-card" data-tweet-id="${tweet.tweet_id}">
                                <!-- You can enhance this by creating a renderTweetCard() function later -->
                                <div class="tweet-header">
                                    <img src="${tweet.profile_picture_url || '/images/default-avatar.png'}" class="tweet-avatar" alt="">
                                    <div class="tweet-user-info">
                                        <strong>${tweet.display_name || tweet.username}</strong>
                                        <span class="username">@${tweet.username}</span>
                                    </div>
                                </div>
                                <div class="tweet-content"><p>${tweet.content}</p></div>
                            </div>
                        `;
                        feedContainer.insertAdjacentHTML('beforeend', tweetHTML);
                    });
                } else {
                    hasMore = false;
                }
            } catch (err) {
                console.error('Infinite scroll failed:', err);
            } finally {
                isLoading = false;
            }
        }
    });
}

// Main initializer
export function initFeedPage() {
    initTweetActions();
    initMediaUpload();
    initInfiniteScroll();
}