import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  payload: { type: Object, required: true }, // Chứa {header, ciphertext}
  createdAt: { type: Date, default: Date.now, expires: 604800 } // Tự xóa sau 7 ngày (TTL)
});

const Message = mongoose.model('Message', MessageSchema);
export default Message;