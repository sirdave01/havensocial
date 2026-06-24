// this mjs script will import the export functions from the other mjs files and call them to initialize
// the functionalities when the page loads

import { initHamburger } from './hambutton.mjs';
import { initDarkMode } from './modetoggle.mjs';
import { initPasswordToggle } from './passwordToggle.mjs';
import { initProfilePage } from './profile.mjs';
import { initGlobalSearch } from './searchbtn.mjs';
import { initFeedPage } from './tweetActions.mjs';

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 HavenSocial scripts initialized');

    initHamburger();
    initDarkMode();
    initPasswordToggle();
    initGlobalSearch();

    document.body.dataset.loggedIn = isLoggedIn ? "true" : "false";

    // Profile specific
    if (document.querySelector('.profile-page')) {
        initProfilePage();
    }

    // Feed specific (includes tweet actions + media upload)
    if (document.querySelector('.feed-page')) {
        initFeedPage();
    }

    // Run basic tweet actions on other pages too (notifications, profile, etc.)
    else {
        initTweetActions();   // fallback
    }
});