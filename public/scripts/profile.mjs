/**
 * Toggle Edit Profile Form visibility
 */
export function toggleEditForm() {
    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.style.display = 
            (editForm.style.display === 'none' || editForm.style.display === '') 
            ? 'block' 
            : 'none';
    }
}

/**
 * Preview uploaded profile picture before submitting
 */
export function previewProfileImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Please upload a valid image file (JPEG, PNG, etc.)');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const previewImg = document.getElementById('profile-preview');
        if (previewImg) {
            previewImg.src = e.target.result;
            previewImg.style.display = 'block';
        }
    };
    reader.readAsDataURL(file);
}

/**
 * Main initializer for Profile Page
 */
export function initProfilePage() {
    if (!document.querySelector('.profile-page')) {
        return;
    }

    console.log('✅ Profile page initialized');

    // Attach event listener (this is the reliable way)
    const fileInput = document.getElementById('profilePictureInput');
    if (fileInput) {
        fileInput.addEventListener('change', previewProfileImage);
    }

    // Hide edit form by default
    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.style.display = 'none';
    }

    // Make both functions globally available for inline handlers (as backup)
    window.toggleEditForm = toggleEditForm;
    window.previewProfileImage = previewProfileImage;
}