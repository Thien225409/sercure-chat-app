const Message = require('../models/Messages');
const User = require('../models/User');

exports.sendMessage = async (io, socket, data) => {
    try {
        const {to , header, ciphertext} = data;
        const from = Array.from(socket.rooms)[1];// Lấy username

        if(!from) return; // Chưa login
        
        // Lưu tin nhắn vào DB (để user nhận đọc lại nếu đang offline)
        const newMessage = new Message({
            from,
            to,
            payload: {header, ciphertext}
        });

        await newMessage.save();

        // Gửi realtime nếu user kia đang onl (đã join room tên họ)
        io.to(to).emit('receive_message', {
            from,
            payload: { header, ciphertext },
            timestamp: newMessage.createdAt
        });

        // Phản hồi lại người gửi (UI sẽ cập nhật trạng thái đã gửi)
        socket.emit('message_sent', {success: true, to});
    } catch (error) {
        console.error('Send Message Error:', error);
        socket.emit('message_error', { message: 'Gửi tin nhắn thất bại' });
    }
};

// Sau mỗi lần gửi/nhận tin nhắn, trạng thái Ratchet thay đổi.
// Client phải mã hóa state mới và gửi lên đây để lưu lại.
exports.syncKeychain = async (socket, data) => {
    try {
        const { username, encryptedKeychain} = data;

        // Cập nhật keychainDump mới vào DB
        await User.findOneAndUpdate(
            { username },
            { keychainDump: encryptedKeychain }
        );
    } catch(error) {
        console.log('Sync Keychain Error:', err);
    }
};

// Lấy tin nhắn cũ khi user login lại
exports.fetchOfflineMessages = async (socket, username) => {
    try {
        const messages = await Message.find({ to: username }).sort({ createdAt: 1 });
        
        // Gửi toàn bộ tin nhắn chưa đọc về client
        socket.emit('offline_messages', messages);
        
        // Tùy chọn: Xóa tin nhắn sau khi đã tải về (để đảm bảo tính forward secrecy tốt hơn)
        // Hoặc giữ lại tùy chính sách
    } catch (err) {
        console.error('Fetch Offline Error:', err);
    }
};