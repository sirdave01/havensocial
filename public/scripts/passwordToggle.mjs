/**
 * Password Toggle Module
 * Provides functionality to show/hide password fields via checkbox
 */

export const initPasswordToggle = () => {

    const password = document.getElementById('password');

    const confirmPassword = document.getElementById('confirm_password');

    const toggle = document.getElementById('show-password');

    // Only initialize if the toggle checkbox exists on the page
    if (!toggle || !password) {
        return;
    }

    toggle.addEventListener('change', () => {
        const type = toggle.checked ? 'text' : 'password';
        password.type = type;

        if (confirmPassword) {
            confirmPassword.type = type;
        }
    });
};
