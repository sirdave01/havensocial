let currentPage = 1;
const pageSize = 10;
let isLoading = false;
let hasMore = true;

export function initTweetActions() {
    console.log('🚀 Tweet actions initialized');

    const isLoggedIn = window.__USER__ !== null;

    console.log('Logged in:', isLoggedIn);

    // ===================== LIKE =====================
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!isLoggedIn) return redirectToLogin();

      const tweetId = btn.dataset.tweetId;
      const countSpan = btn.querySelector('.count');

      if (!tweetId || !countSpan) {
        console.error('Like button missing data');
        return;
      }

      const isLiked = btn.classList.contains('liked');

      const res = await fetch(
        isLiked ? '/likes/unlike' : '/likes',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tweetId })
        }
      );

      if (res.ok) {
        btn.classList.toggle('liked');
        const count = parseInt(countSpan.textContent) || 0;
          countSpan.textContent = isLiked ? count - 1 : count + 1;
          
        }
        
    });
      
  });

    // ===================== FOLLOW =====================
    document.querySelectorAll('.follow-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!isLoggedIn) return redirectToLogin();

        const followeeId = btn.dataset.userId;
            if (!followeeId) {
                console.error('Follow button missing userId');
                return;
            }

        const isFollowing = btn.classList.contains('following');

        const res = await fetch(
            isFollowing ? '/unfollow' : '/follow',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ followeeId })
            }
        );

        if (res.ok) {
            btn.classList.toggle('following');
            btn.textContent = isFollowing ? 'Follow' : 'Following';
            }
            
    });
  });

    // ===================== REPLY =====================
    document.querySelectorAll('.reply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
        if (!isLoggedIn) return redirectToLogin();
        openReplyModal(btn.dataset.tweetId, btn.dataset.username);
        });
    });

    // ===================== SHARE =====================
    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', () => {
        const tweetId = btn.dataset.tweetId;
        const url = `${location.origin}/tweets/${tweetId}`;
        navigator.clipboard.writeText(url);
        alert('Link copied!');
        });
    });
}

function redirectToLogin() {
  if (confirm('Please log in to interact')) {
    location.href = '/login';
  }
}

// ===================== REPLY MODAL =====================
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

                    <div class="reply-box">
                        <textarea id="replyContent" maxlength="280"
                            placeholder="Write your reply..."></textarea>
                        <div class="char-count">
                            <span id="replyCharCount">0</span>/280
                        </div>
                    </div>

                    <div class="modal-actions">
                        <button onclick="closeReplyModal()">Cancel</button>
                        <button onclick="submitReply(${tweetId})">Reply</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    modal.style.display = 'block';

    const textarea = document.getElementById('replyContent');
    const countSpan = document.getElementById('replyCharCount');

    textarea.value = '';
    countSpan.textContent = '0';

    textarea.oninput = () => {
        countSpan.textContent = textarea.value.length;
    };
}

window.closeReplyModal = () => {
    const modal = document.getElementById('replyModal');
    if (modal) modal.style.display = 'none';
};

window.submitReply = async (tweetId) => {
    const content = document.getElementById('replyContent').value.trim();
    if (!content) return alert("Reply cannot be empty");

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
            alert("Failed to post reply");
        }
    } catch (err) {
        console.error(err);
        alert("Error posting reply");
    }
};

// ===================== MEDIA UPLOAD =====================
export function initMediaUpload() {
    const mediaInput = document.getElementById('tweetMedia');
    const previewContainer = document.getElementById('mediaPreview');
    if (!mediaInput || !previewContainer) return;

    mediaInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = ev => {
            previewContainer.innerHTML = `
                <img src="${ev.target.result}" class="preview-image">
                <button class="remove-preview">×</button>
            `;
        };
        reader.readAsDataURL(file);
    });

    document.addEventListener('click', e => {
        if (e.target.classList.contains('remove-preview')) {
            previewContainer.innerHTML = '';
            mediaInput.value = '';
        }
    });
}

// ===================== INFINITE SCROLL (DISABLED SAFELY) =====================
export function initInfiniteScroll() {
    console.warn('Infinite scroll disabled until /api/feed is added');
}

// ===================== PAGE INIT =====================
export function initFeedPage() {
    initTweetActions();
    initMediaUpload();
    initInfiniteScroll();
}