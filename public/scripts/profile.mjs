/**
 * Toggle Edit Profile Form visibility
 */
export function toggleEditForm() {
    const editForm = document.getElementById('editForm');
    if (editForm) {
        const isHidden = editForm.style.display === 'none' || editForm.style.display === '';
        editForm.style.display = isHidden ? 'block' : 'none';
    }
}

/**
 * Handle image preview (used by both click and drag)
 */
function handleImagePreview(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please upload a valid image file (JPEG, PNG, GIF, WebP)');
        return false;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert('File is too large. Maximum size is 5MB.');
        return false;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const previewImg = document.getElementById('profile-preview');
        const previewContainer = document.getElementById('image-preview-container');
        
        if (previewImg && previewContainer) {
            previewImg.src = e.target.result;
            previewContainer.style.display = 'block';
        }
    };
    reader.readAsDataURL(file);
    return true;
}

/**
 * Initialize drag & drop + preview for profile picture
 */
function initProfileImageUpload() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('profilePictureInput');
    const previewContainer = document.getElementById('image-preview-container');
    const previewImg = document.getElementById('profile-preview');
    const removeBtn = document.getElementById('remove-photo-btn');
    const removeInput = document.getElementById('removeProfilePicture');

    if (!dropzone || !fileInput) return;

    // Click to upload
    dropzone.addEventListener('click', () => fileInput.click());

    // File selected
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && handleImagePreview(file)) {
            // New file selected → reset remove flag
            if (removeInput) removeInput.value = 'false';
        }
    });

    // Drag & Drop (same as before)
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && handleImagePreview(file)) {
            if (removeInput) removeInput.value = 'false';
        }
    });

    // Remove Photo Button
    if (removeBtn && removeInput) {
        removeBtn.addEventListener('click', () => {
            // Clear new upload
            fileInput.value = '';
            
            // Hide preview image
            if (previewImg) {
                previewImg.style.display = 'none';
                previewImg.src = '';
            }

            // Tell backend to delete current photo
            removeInput.value = 'true';
        });
    }
}

/**
 * Main initializer for Profile Page
 */
export function initProfilePage() {
    if (!document.querySelector('.profile-page')) return;

    console.log('✅ Profile page initialized');

    // Hide edit form by default
    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.style.display = 'none';
    }

    // Initialize image upload features
    initProfileImageUpload();

    // Make toggle globally available for inline onclick
    window.toggleEditForm = toggleEditForm;
}