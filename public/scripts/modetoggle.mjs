// dark mode toggle functionality

function initDarkMode() {

    const toggleSwitch = document.querySelector('#dark-mode-toggle');

    if (!toggleSwitch) return;

    // load saved preference
    const currentMode = localStorage.getItem('theme') || 'light';

    document.body.classList.toggle('dark-mode', currentMode === 'dark');

    toggleSwitch.textContent = currentMode === 'dark' ? '☀️' : '🌙';

    toggleSwitch.addEventListener(`click`, () => {

        document.body.classList.toggle(`dark-mode`);

        const newTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';

        localStorage.setItem(`theme`, newTheme);

        toggleSwitch.textContent = newTheme === 'dark' ? '☀️' : '🌙';

    });
    
}

export { initDarkMode };