import { Router } from 'express';
const router = Router();
import multer, { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Cấu hình lưu trữ
const storage = diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/';
        if (!existsSync(dir)){
            mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // Đặt tên file unique để tránh trùng lặp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// API Endpoint: POST /api/upload
router.post('/', upload.single('encryptedFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    
    // Trả về đường dẫn file để client gửi qua tin nhắn chat
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    
    res.json({ 
        url: fileUrl, 
        filename: req.file.filename,
        originalName: req.file.originalname 
    });
});

export default router;