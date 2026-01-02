import User from '../models/User.js';

// Lưu bản backup lịch sử chat lên server
export const uploadHistory = async (socket, data) => {
    try {
        const { username, encryptedHistory } = data;

        await User.findOneAndUpdate(
            { username },
            { encryptedChatHistory: encryptedHistory }
        );

        // console.log(`☁️ Synced history for ${username}`);
        socket.emit('sync_ack', { success: true });
    } catch (err) {
        console.error("Sync Upload Error:", err);
    }
};

// Tải bản backup từ server về máy
export const downloadHistory = async (socket, username) => {
    try {
        const user = await User.findOne({ username });
        if (user && user.encryptedChatHistory) {
            socket.emit('download_history_response', {
                encryptedHistory: user.encryptedChatHistory
            });
            console.log(`☁️ Sent cloud history to ${username}`);
        } else {
            socket.emit('download_history_response', { encryptedHistory: null });
        }
    } catch (err) {
        console.error("Sync Download Error:", err);
    }
};
