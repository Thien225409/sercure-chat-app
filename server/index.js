import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import CA Utility 
import { loadCaKey } from './utils/ca.js';

// Import Controllers
import * as authController from './controllers/authController.js';
import * as chatController from './controllers/chatController.js';
import * as aiController from './controllers/aiController.js';

// Import Routes
import uploadRoutes from './routes/upload.js';

// Import Model
import User from './models/User.js';

// --- KHỞI TẠO CA KEY ---
// Dùng await top-level (Node 14.8+ hỗ trợ) hoặc .catch
try {
    await loadCaKey();
} catch (err) {
    console.error("LỖI NGHIÊM TRỌNG: Không thể load CA Private Key.");
    console.error("Hãy chạy 'node server/scripts/generateCA.js' trước!");
    process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

// Public thư mục uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes cho REST API
app.use('/api/upload', uploadRoutes);

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Kết nối DB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Đã kết nối MongoDB'))
  .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // --- AUTH EVENTS ---
  socket.on('register', (data) => authController.register(socket, data));
  
  socket.on('login', async (data) => {
    await authController.login(socket, data);
    if (data.username) {
        await chatController.fetchOfflineMessages(socket, data.username);
    }
  });

  // --- SECURITY EVENT: LẤY CERTIFICATE ---
  socket.on('get_certificate', async (targetUsername, callback) => {
      try {
          const user = await User.findOne({ username: targetUsername });
          if (user) {
            callback({ 
                username: user.username, 
                pk: user.publicKey.pk, 
                signature: user.signature 
            });
          } else {
            callback(null);
          }
      } catch (e) {
        console.error("Get Certificate Error:", e);
        callback(null);
      }
  });

  // --- CHAT EVENTS ---
  socket.on('private_message', (data) => chatController.sendMessage(io, socket, data));
  socket.on('update_keychain', (data) => chatController.syncKeychain(socket, data));

  // --- AI EVENTS ---
  socket.on('ask_ai', (data) => aiController.chatWithGemini(socket, data));

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});