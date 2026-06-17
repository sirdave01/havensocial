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
 * Handle image preview
 */
function handleImagePreview(file) {
    console.log('📸 Previewing file:', file.name); // DEBUG

    if (!file.type.startsWith('image/')) {
        alert('Please upload a valid image file.');
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
            console.log('✅ Preview image displayed'); // DEBUG
        } else {
            console.error('❌ Preview elements not found');
        }
    };
    reader.readAsDataURL(file);
    return true;
}

/**
 * Initialize drag & drop + preview
 */
function initProfileImageUpload() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('profilePictureInput');
    const previewContainer = document.getElementById('image-preview-container');
    const removeBtn = document.getElementById('remove-photo-btn');
    const removeInput = document.getElementById('removeProfilePicture');

    if (!dropzone || !fileInput) {
        console.error('❌ Dropzone or file input not found');
        return;
    }

    console.log('✅ Dropzone initialized');

    // Click to upload
    dropzone.addEventListener('click', () => {
        fileInput.click();
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImagePreview(file);
            if (removeInput) removeInput.value = 'false';
        }
    });

    // Drag & Drop
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) {
            handleImagePreview(file);
            if (removeInput) removeInput.value = 'false';
        }
    });

    // Remove button
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            const previewContainer = document.getElementById('image-preview-container');
            const fileInput = document.getElementById('profilePictureInput');
            
            if (previewContainer) previewContainer.style.display = 'none';
            if (fileInput) fileInput.value = '';
            if (removeInput) removeInput.value = 'true';
            
            console.log('🗑️ Photo removed');
        });
    }
}

/**
 * Main initializer
 */
export function initProfilePage() {
    if (!document.querySelector('.profile-page')) return;

    console.log('✅ Profile page initialized');

    const editForm = document.getElementById('editForm');
    if (editForm) editForm.style.display = 'none';

    initProfileImageUpload();

    window.toggleEditForm = toggleEditForm;
}