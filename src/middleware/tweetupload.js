import multer from 'multer';
import path from 'path';

const tweetStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(process.cwd(), 'public/uploads/tweets'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'tweet-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'];
    
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only images and MP4/WebM videos are allowed!'), false);
    }
};

const tweetUpload = multer({
    storage: tweetStorage,
    fileFilter,
    limits: { fileSize: 15 * 1024 * 1024 } // 15MB for videos
});

export { tweetUpload };