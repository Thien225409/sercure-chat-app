import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true 
  },
  // Hash pass đăng nhập (Server quản lý)
  // Không liên quan đến Key mã hóa E2E (Client quản lý)
  passwordHash: { type: String, required: true },
  // Chứa { username, pk: JWK_Object }
  publicKey: { type: Object, required: true },
  signature: { type: String, required: true},
  // Chứa JSON String: { iv, data, salt }
  // Server chỉ lưu, không bao giờ đọc hiểu được
  keychainDump: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
export default User;