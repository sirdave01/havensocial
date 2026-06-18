// this mjs script will import the export functions from the other mjs files and call them to initialize
// the functionalities when the page loads

import { initHamburger } from './hambutton.mjs';

import { initDarkMode } from './modetoggle.mjs';

import { initPasswordToggle } from './passwordToggle.mjs';

import { initProfilePage } from './profile.mjs'

import { initGlobalSearch } from './searchbtn.mjs';

document.addEventListener('DOMContentLoaded', () => {
    
    console.log('🚀 HavenSocial scripts initialized');

    initHamburger();

    initDarkMode();

    initPasswordToggle();

    // Only run profile-specific code on the profile page

    if (document.querySelector('.profile-page')) {

        initProfilePage();
        
    }

    // Global Search (only runs if the search bar exists)
    initGlobalSearch();

});