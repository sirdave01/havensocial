
export function initGlobalSearch() {
    
    const searchInput = document.getElementById('globalSearch');
    const searchBtn = document.getElementById('globalSearchBtn');

    if (!searchInput) return;

    const handleSearch = () => {
        const query = searchInput.value.trim();
        if (!query) return;

        const currentPath = window.location.pathname;

        // Context-aware search
        if (currentPath === '/users' || currentPath.startsWith('/users')) {
            // On Users Dashboard → use client-side filtering
            filterUsersTable(query);
        } else {
            // Default: Redirect to global search page (you can create later)
            window.location.href = `/search?q=${encodeURIComponent(query)}`;
        }
    };

    // Search on button click
    searchBtn.addEventListener('click', handleSearch);

    // Search on Enter key
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
}

// Client-side filtering for Users page
function filterUsersTable(query) {
    const term = query.toLowerCase().trim();
    const rows = document.querySelectorAll('#usersTable tbody tr');

    rows.forEach(row => {
        const username = row.getAttribute('data-username') || '';
        const email = row.getAttribute('data-email') || '';
        const name = row.getAttribute('data-name') || '';

        const matches = username.includes(term) || 
                       email.includes(term) || 
                       name.includes(term);

        row.style.display = matches ? '' : 'none';
    });
}