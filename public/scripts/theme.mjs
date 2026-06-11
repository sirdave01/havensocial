// Handles theme toggle

export function loadTheme(toggleButton) {
    const theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    toggleButton.textContent = theme === 'dark' ? '☀️' : '🌙';
}

export function toggleTheme(toggleButton) {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    toggleButton.textContent = newTheme === 'dark' ? '☀️' : '🌙';
}