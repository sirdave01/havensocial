// Main app class coordinating all modules

import { getFromStorage, setToStorage } from './localstorage.mjs';
import { handleLike } from './likes.mjs';
import { handleFollow } from './follow.mjs';
import { loadFeed } from './feed.mjs';
import { createPost, loadPostDetails } from './post.mjs';
import { performSearch } from './search.mjs';
import { addNotification, renderNotifications } from './notification.mjs';
import { initNavigation } from './nav.mjs';
import { toggleTheme, loadTheme } from './theme.mjs';
import { loadNearby } from './locationdiscovery.mjs';
import { initHamburger } from './hambutton.mjs';

export class HavenSocialApp {
    constructor() {
        this.BASE_URL = 'https://jsonplaceholder.typicode.com';
        this.posts = [];
        this.users = [];
        this.comments = {};
        this.likes = {};
        this.myLikes = new Set();
        this.followedUsers = new Set(getFromStorage('followedUsers', []));
        this.reposts = new Set(getFromStorage('reposts', []));
        this.notifications = getFromStorage('notifications', []);
        this.chats = getFromStorage('chats', {});
        this.currentUserId = 1;
        this.userLocation = null;
        this.currentPage = 1;
        this.pageSize = 10;
        this.hasMorePosts = true;

        this.feedElement = document.getElementById('posts-feed');
        this.nearbyFeedElement = document.getElementById('nearby-feed');
        this.profileInfoElement = document.getElementById('user-info');
        this.profilePostsElement = document.getElementById('user-posts');
        this.notifCountElement = document.getElementById('notif-count');

        this.loadMoreButton = document.getElementById('load-more');
        this.submitPostButton = document.getElementById('submit-post');
        this.postText = document.getElementById('post-text');
        this.darkModeToggle = document.getElementById('dark-mode-toggle');
        this.notificationsBell = document.getElementById('notifications-bell');

        this.init();
    }

    async init() {
        try {
            this.users = await this.fetchData('/users');
            await this.loadInitialPosts();

            // Geolocation
            if (this.feedElement) {
                const oldLoc = this.feedElement.querySelector('.location');
                if (oldLoc) oldLoc.remove();
                const oldWeather = this.feedElement.querySelector('.weather');
                if (oldWeather) oldWeather.remove();

                this.locationDiv = document.createElement('div');
                this.locationDiv.classList.add('location');
                this.feedElement.prepend(this.locationDiv);

                this.weatherDiv = document.createElement('div');
                this.weatherDiv.classList.add('weather', 'hidden');
                this.feedElement.prepend(this.weatherDiv);

                const { getGeolocation } = await import('./geolocation.mjs');
                getGeolocation(this.locationDiv, this.weatherDiv);
            }

            loadTheme(this.darkModeToggle);
            initNavigation(this);
            this.initEventListeners();
            addNotification(this, 'Welcome to HavenSocial!');
            loadFeed(this);
            initHamburger();
        } catch (err) {
            console.error('Init error:', err);
            if (this.feedElement) this.feedElement.innerHTML = '<p>Error loading app.</p>';
        }
    }

    async fetchData(endpoint) {
        const res = await fetch(`${this.BASE_URL}${endpoint}`);
        if (!res.ok) throw new Error('Fetch failed');
        return res.json();
    }

    async loadInitialPosts() {
        const initialPosts = await this.fetchData(`/posts?_page=${this.currentPage}&_limit=${this.pageSize}`);
        this.posts = [...this.posts, ...initialPosts];
        this.posts.sort((a, b) => b.id - a.id);
        this.posts.forEach(p => {
            this.likes[p.id] = 0;
            this.comments[p.id] = [];
        });
        this.hasMorePosts = initialPosts.length === this.pageSize;
    }

    async loadMorePosts() {
        if (!this.hasMorePosts) return;
        this.currentPage++;
        const morePosts = await this.fetchData(`/posts?_page=${this.currentPage}&_limit=${this.pageSize}`);
        this.posts = [...this.posts, ...morePosts];
        this.posts.sort((a, b) => b.id - a.id);
        morePosts.forEach(p => {
            if (!(p.id in this.likes)) this.likes[p.id] = 0;
            if (!(p.id in this.comments)) this.comments[p.id] = [];
        });
        this.hasMorePosts = morePosts.length === this.pageSize;
        loadFeed(this, morePosts);
    }

    initEventListeners() {
        if (this.loadMoreButton) this.loadMoreButton.addEventListener('click', () => this.loadMorePosts());
        if (this.submitPostButton) this.submitPostButton.addEventListener('click', () => createPost(this));
        if (this.darkModeToggle) this.darkModeToggle.addEventListener('click', () => toggleTheme(this.darkModeToggle));
        if (this.notificationsBell) this.notificationsBell.addEventListener('click', () => renderNotifications(this));

        window.addEventListener('scroll', () => this.handleInfiniteScroll());

        if (this.feedElement) {
            this.feedElement.addEventListener('click', (e) => {
                if (e.target.classList.contains('like-btn')) handleLike(this, e);
                else if (e.target.classList.contains('comment-btn') || e.target.closest('.post-card')) {
                    const postId = parseInt(e.target.closest('.post-card').dataset.postId);
                    loadPostDetails(this, postId);
                }
                else if (e.target.classList.contains('repost-btn')) this.handleRepost(e);
                else if (e.target.classList.contains('share-btn')) this.handleShare(e);
                else if (e.target.classList.contains('pin-btn')) this.handlePin(e);
                else if (e.target.classList.contains('follow-button')) handleFollow(this, e);
            });
        }

    // Add search button listener if exists
        const searchButton = document.querySelector('.search-button');
        if (searchButton) {
            searchButton.addEventListener('click', () => {
                const query = document.getElementById('search-input').value.trim();
                if (query) performSearch(this, query);
            });
        }
        // Add nearby button if exists
        const nearbyButton = document.querySelector('.nearby-button');
        if (nearbyButton) nearbyButton.addEventListener('click', () => loadNearby(this));


    }

    updateBadges() {
        // Notification badge (already exists)
        const unreadNotifs = this.notifications.filter(n => !n.read).length;
        if (this.notifCountElement) {
        this.notifCountElement.textContent = unreadNotifs;
        }

        // Messages unread green dot
        const messagesTab = document.querySelector('#tab-bar a[data-view="messages"]');
        if (!messagesTab) return;

        let hasUnread = false;

        Object.keys(this.chats).forEach(key => {
            const msgs = this.chats[key];
            if (msgs && msgs.length > 0) {
                // For simplicity: if the last message is not from current user → unread
                const lastMsg = msgs[msgs.length - 1];
                if (lastMsg.from !== this.currentUserId) {
                    hasUnread = true;
                }
            }
        });

        if (hasUnread) {
            messagesTab.classList.add('has-unread');
        } else {
            messagesTab.classList.remove('has-unread');
        }
    }

    handleRepost(e) {
        const postId = parseInt(e.target.dataset.postId);
        if (this.reposts.has(postId)) this.reposts.delete(postId);
        else {
            this.reposts.add(postId);
            addNotification(this, 'Reposted!');
        }
        setToStorage('reposts', Array.from(this.reposts));
        loadFeed(this);
    }

    handleShare(event) {
        const postId = parseInt(event.target.dataset.postId);
        const post = this.posts.find(p => p.id === postId);
        if (!post) return;

        const shareData = {
            title: post.title,
            text: post.body?.substring(0, 100),
            url: `${window.location.origin}?post=${postId}`
        };

        if (navigator.share) {
            navigator.share(shareData);
        } else {
            navigator.clipboard.writeText(shareData.url).then(() => {
                alert('✅ Link copied to clipboard!');
            });
        }
    }

    handlePin(event) {
        const postId = parseInt(event.target.dataset.postId);
        alert(`📌 Post #${postId} pinned to your profile! (feature ready for backend)`);
        // You can expand this later with a pinnedPosts Set
    }

    handleInfiniteScroll() {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100 && this.hasMorePosts) {
            this.loadMorePosts();
        }
    }

    showView(viewId) {
        const map = {
            'home': 'feed-container',
            'search': 'search-container',
            'new-post': 'new-post-container',
            'profile': 'profile-container',
            'nearby': 'nearby-container',
            'post-detail': 'post-detail-container',
            'settings': 'settings-container',
            'messages': 'messages-container'
        };

        document.querySelectorAll('main > div').forEach(div => div.classList.add('hidden'));
        const container = document.getElementById(map[viewId] || viewId + '-container');
        if (container) container.classList.remove('hidden');
    }

    initHamburger() {
        initHamburger();
    }
}