require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Public thư mục uploads để client có thể tải file về
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes cho REST API (Upload)
const uploadRoutes = require('./routes/upload');
app.use('/api/upload', uploadRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Kết nối DB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Đã kết nối MongoDB'))
  .catch(err => console.error('Lỗi kết nối MongoDB:', err));

// Import Controllers
const authController = require('./controllers/authController');
const chatController = require('./controllers/chatController');
const aiController = require('./controllers/aiController');

io.on('connection', (socket) => {
  console.log(` Client connected: ${socket.id}`);

  // --- AUTH EVENTS ---
  socket.on('register', (data) => authController.register(socket, data));
  
  socket.on('login', async (data) => {
      await authController.login(socket, data);
      // Sau khi login thành công, tải tin nhắn offline
      if (data.username) {
          await chatController.fetchOfflineMessages(socket, data.username);
      }
  });

  // --- CHAT EVENTS ---
  // Gửi tin nhắn E2E
  socket.on('private_message', (data) => chatController.sendMessage(io, socket, data));
  
  // Đồng bộ Keychain (Gọi hàm này sau khi gửi/nhận tin nhắn xong ở client)
  socket.on('update_keychain', (data) => chatController.syncKeychain(socket, data));

  // --- AI EVENTS ---
  socket.on('ask_ai', (data) => aiController.chatWithGemini(socket, data));

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
});