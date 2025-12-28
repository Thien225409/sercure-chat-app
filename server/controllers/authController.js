const User = require('../models/User');
const bcrypt = require('bcryptjs');

exports.register = async (socket, data) => {
    try {
        /*
        data: {
            userName,
            passwordHash(raw),
            certificate,
            encryptedKeychain
        }
        */
        const { username, passwordHash, certificate, encryptedKeychain } = data;

        if (!username || !passwordHash || !certificate || !encryptedKeychain) {
            return socket.emit('register_error', { message: 'Thiếu thông tin đăng ký!' });
        }

        // Check if user exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return socket.emit('register_error', { message: 'Username đã tồn tại' });
        }

        // Hash mật khẩu để bảo vệ đăng nhập (Salt của Server)
        const saltRounds = 10;
        const serverSidePasswordHash = await bcrypt.hash(passwordHash, saltRounds);

        const newUser = new User({
            username,
            passwordHash: serverSidePasswordHash,
            publicKey: certificate,
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
};

exports.login = async (socket, data) => {
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

        // Join user room
        socket.join(username);

        console.log(`User logged in: ${username}`);

        // Trả về 'Két sắt' để client tự mở bằng password của họ
        socket.emit('login_success', {
            username: user.username,
            publicKey: user.publicKey,
            keychainDump: user.keychainDump // Salt và Private Key
        });

    } catch (err) {
        console.error('Login error:', err);
        socket.emit('login_error', { message: 'Đăng nhập thất bại' });
    }
};
