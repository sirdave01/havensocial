
const modal = document.getElementById('imageModal');

const modalImg = document.getElementById('modalImage');

export function initProfileImageModal() {

    document.addEventListener('click', (e) => {
        
        const avatar = e.target.closest('.js-profile-avatar');

        // OPEN
        if (avatar) {
            modalImg.src = avatar.dataset.full;
            modal.style.display = 'flex';
        }

        // CLOSE (click outside image)
        if (e.target === modal) {
            modal.style.display = 'none';
            modalImg.src = '';
        }
    });

    // ESC close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            modal.style.display = 'none';
            modalImg.src = '';
        }
    });
}