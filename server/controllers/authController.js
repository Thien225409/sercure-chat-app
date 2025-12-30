import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import * as CA from '../utils/ca.js';
import jwt from 'jsonwebtoken';

export async function register(socket, data) {
    try {
        /*
        data: {
            username,
            passwordHash(raw),
            certificate,
            encryptedKeychain
        }
        */
        const { username, passwordHash, certificate, encryptedKeychain } = data;

        if (!username || !passwordHash || !certificate || !encryptedKeychain) {
            return socket.emit('register_error', { message: 'Thiếu thông tin đăng ký!' });
        }

        // SỬA: Dùng User.findOne thay vì findOne độc lập
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return socket.emit('register_error', { message: 'Username đã tồn tại' });
        }

        // --- KÝ CERTIFICATE ---
        console.log(`🔏 Đang ký xác thực cho user: ${username}...`);
        
        // Gọi hàm signCertificate từ module CA
        const signature = await CA.signCertificate(certificate);

        // Hash mật khẩu (Server Side)
        const saltRounds = 10;
        const serverSidePasswordHash = await bcrypt.hash(passwordHash, saltRounds);

        const newUser = new User({
            username,
            passwordHash: serverSidePasswordHash,
            publicKey: certificate,
            signature: signature, // Lưu chữ ký
            keychainDump: encryptedKeychain
        });

        await newUser.save();

        // Auto login (join room)
        socket.join(username);
        socket.emit('register_success', { username });

    } catch (err) {
        console.error('Register error:', err);
        socket.emit('register_error', { message: 'Đăng ký thất bại: ' + err.message });
    }
}

export async function login(socket, data) {
    try {
        // data : {username, passwordHash (raw)} 
        const { username, passwordHash } = data;

        const user = await User.findOne({ username });

        if (!user) {
            return socket.emit('login_error', { message: 'Tài khoản không tồn tại' });
        }

        const isMatch = await bcrypt.compare(passwordHash, user.passwordHash);

        if (!isMatch) {
            return socket.emit('login_error', { message: 'Sai mật khẩu' });
        }

        const JWT_SECRET = process.env.JWT_SECRET;
        const token = jwt.sign(
            { username: user.username }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        // Join user room
        socket.join(username);

        console.log(`User logged in: ${username}`);

        // Trả về 'Két sắt' để client tự mở bằng password của họ
        socket.emit('login_success', {
            username: user.username,
            publicKey: user.publicKey,
            keychainDump: user.keychainDump, // Salt và Private Key
            token: token
        });

    } catch (err) {
        console.error('Login error:', err);
        socket.emit('login_error', { message: 'Đăng nhập thất bại' });
    }
}

export async function loginWithToken(socket, data) {
    try {
        const { token } = data; // Client chỉ cần gửi Token

        if (!token) return socket.emit('login_error', { message: 'Thiếu token' });

        const JWT_SECRET = process.env.JWT_SECRET;
        // 1. VERIFY TOKEN (Kiểm tra chữ ký server - Không cần DB)
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;

        // 2. Lấy dữ liệu user để trả về (chỉ lấy data, không check session DB)
        const user = await User.findOne({ username });
        if (!user) return socket.emit('login_error', { message: 'User không tồn tại' });

        socket.join(username);

        socket.emit('login_success', {
            username: user.username,
            publicKey: user.publicKey,
            keychainDump: user.keychainDump,
            token: token 
        });
        console.log(`✅ User ${username} re-connected via JWT`);

    } catch (e) {
        console.error("JWT Error:", e.message);
        socket.emit('login_error', { message: 'Token hết hạn hoặc không hợp lệ' });
    }
}