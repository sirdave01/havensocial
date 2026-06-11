// creating a responsive hamburger button for the small screens
// using DOM to manipulate the HTML contents and 
// adding eventlistener for click reaction for the hamburger menu

function initHamburger() {
    const navButton = document.querySelector(`#nav-btn`);
    const navlinks = document.querySelector(`#nav-list`);

    if (!navButton || !navlinks) return;

    navButton.addEventListener(`click`, () => {
        navButton.classList.toggle(`show`);
        navlinks.classList.toggle(`show`);
    })
}

export { initHamburger };