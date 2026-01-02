import Message from '../models/Messages.js';
import User from '../models/User.js';

export const sendMessage = async (io, socket, data) => {
    try {
        const { to, header, ciphertext } = data;
        const from = Array.from(socket.rooms)[1];// Lấy username

        if (!from) return; // Chưa login

        // Từ chối nếu header không phải String. Ép Client phải tuân thủ.
        if (typeof header !== 'string') {
            console.error(`❌ Lỗi định dạng: Header từ ${from} gửi lên là Object, yêu cầu String JSON.`);
            socket.emit('message_error', { message: 'Lỗi giao thức: Header phải là chuỗi JSON.' });
            return;
        }

        // Lưu tin nhắn vào DB (để user nhận đọc lại nếu đang offline)
        const newMessage = new Message({
            from,
            to,
            payload: { header, ciphertext }
        });

        await newMessage.save();

        // Gửi realtime nếu user kia đang onl (đã join room tên họ)
        io.to(to).emit('receive_message', {
            from,
            payload: { header, ciphertext },
            timestamp: newMessage.createdAt
        });

        // Phản hồi lại người gửi (UI sẽ cập nhật trạng thái đã gửi)
        socket.emit('message_sent', { success: true, to });
    } catch (error) {
        console.error('Send Message Error:', error);
        socket.emit('message_error', { message: 'Gửi tin nhắn thất bại' });
    }
};

// Sau mỗi lần gửi/nhận tin nhắn, trạng thái Ratchet thay đổi.
// Client phải mã hóa state mới và gửi lên đây để lưu lại.
export const syncKeychain = async (socket, data) => {
    try {
        const { username, encryptedKeychain } = data;

        // Cập nhật keychainDump mới vào DB
        await User.findOneAndUpdate(
            { username },
            { keychainDump: encryptedKeychain }
        );
    } catch (error) {
        console.log('Sync Keychain Error:', error);
    }
};

// Lấy tin nhắn offline khi user login lại (chỉ lấy tin MỚI từ lần logout cuối cùng - Logic này cần Client gửi lastMessageId, nhưng tạm thời cứ gửi hết nếu chưa sync)
export const fetchOfflineMessages = async (socket, username) => {
    try {
        // Lấy tin nhắn
        const messages = await Message.find({ to: username }).sort({ createdAt: 1 });

        if (messages.length === 0) return;

        // Gửi toàn bộ tin nhắn chưa đọc về client
        socket.emit('offline_messages', messages);

        // Xóa tin nhắn khỏi DB sau khi đã gửi cho client
        const messageIds = messages.map(m => m._id);
        await Message.deleteMany({ _id: { $in: messageIds } });

        console.log(`✅ Đã chuyển ${messages.length} tin nhắn offline cho ${username} và xóa khỏi Server.`);
    } catch (err) {
        console.error('Fetch Offline Error:', err);
    }
};