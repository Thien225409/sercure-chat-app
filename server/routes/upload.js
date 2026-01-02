import { Router } from 'express';
const router = Router();
import { uploadCloud } from '../utils/cloudinary.js';

// API Endpoint: POST /api/upload
// Sử dụng uploadCloud.single('encryptedFile') thay vì local storage
router.post('/', uploadCloud.single('encryptedFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    // Cloudinary trả về path (url) trong req.file.path
    const fileUrl = req.file.path;

    res.json({
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname
    });
});

export default router;