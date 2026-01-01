import { useState } from 'react';
import { MessengerClient } from '../crypto/messenger';
import { GOV_PUBLIC_KEY } from '../config';
import { cryptoKeyToJSON, encryptWithGCM, genRandomSalt, toBase64 } from '../crypto/lib';
import { deriveKeyFromPassword } from '../utils';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const Register = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const navigate = useNavigate();

    const handleRegister = async () => {
        if (!username || !password) {
            setErrorMsg("Vui lòng điền đủ thông tin!"); // Thay alert
            return;
        }
        setErrorMsg('');

        try {
            const client = new MessengerClient(null, null);
            const govKey = await window.crypto.subtle.importKey(
                "jwk", GOV_PUBLIC_KEY,
                { name: "ECDH", namedCurve: "P-384" },
                true, []
            );
            client.govPublicKey = govKey;
            const certObj = await client.generateCertificate(username);
            const certJson = { username: certObj.username, pk: await cryptoKeyToJSON(certObj.pk) };
            const keychainRaw = await client.serializeState();

            const salt = genRandomSalt();
            const pwKey = await deriveKeyFromPassword(password, salt);
            const iv = genRandomSalt(12);

            const encryptedKeychainBuffer = await encryptWithGCM(pwKey, keychainRaw, iv);
            const encryptedKeychainPkg = JSON.stringify({
                iv: toBase64(iv),
                data: toBase64(new Uint8Array(encryptedKeychainBuffer)),
                salt: toBase64(salt)
            });

            const socket = io('http://localhost:8001');
            socket.emit('register', { username, passwordHash: password, certificate: certJson, encryptedKeychain: encryptedKeychainPkg });
            // Sự kiện đăng kí thất bại
            socket.on('register_error', (data) => {
                setErrorMsg(data.message);
                socket.disconnect();
            });
            // Sự kiện đăng kí thành công
            socket.on('register_success', () => {
                alert("Đăng ký thành công!");
                socket.disconnect();
                navigate('/login');
            });

            // Fallback cho lỗi kết nối
            socket.on('connect_error', () => setErrorMsg("Không thể kết nối đến server"));
        } catch (e) {
            console.error(e);
            setErrorMsg("Lỗi Client: " + e.message);
        }
    };

    return (
        <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black">
            {/* Background Effects (Đồng bộ style với Login nhưng tông màu Xanh Ngọc) */}
            <div className="absolute top-0 -left-4 w-72 h-72 bg-emerald-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
            <div className="absolute top-0 -right-4 w-72 h-72 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-8 left-20 w-72 h-72 bg-teal-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>

            {/* Main Card */}
            <div className="relative z-10 w-full max-w-md p-px bg-linear-to-b from-emerald-500/20 to-cyan-500/20 rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.5)]">
                <div className="w-full h-full bg-black/90 backdrop-blur-md rounded-2xl p-8 border border-white/10">
                    {/* ... Header ... */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-linear-to-tr from-emerald-400 to-cyan-500 mb-4 shadow-[0_0_20px_rgba(16,185,129,0.5)]">
                            <span className="text-2xl">🛡️</span>
                        </div>
                        <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-linear-to-r from-emerald-400 to-cyan-400 tracking-wider">
                            CREATE ACCOUNT
                        </h2>
                        <p className="text-xs text-slate-400 mt-2 uppercase tracking-[0.2em]">Secure & Private</p>
                    </div>

                    {/*HIỂN THỊ LỖI*/}
                    {errorMsg && (
                        <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-200 text-sm text-center animate-pulse">
                            ⚠️ {errorMsg}
                        </div>
                    )}

                    <div className="space-y-6">
                        <div className="group">
                            <label className="block text-xs text-emerald-400 mb-1 ml-1 uppercase font-bold tracking-wide">Username</label>
                            <input
                                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder-slate-600"
                                placeholder="Username"
                                value={username}
                                onChange={e => {
                                    setUsername(e.target.value);
                                    setErrorMsg('');
                                }}
                            />
                        </div>
                        <div className="group">
                            <label className="block text-xs text-cyan-400 mb-1 ml-1 uppercase font-bold tracking-wide">Password</label>
                            <input
                                type="password"
                                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all placeholder-slate-600"
                                placeholder="Password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>

                        <button
                            onClick={handleRegister}
                            className="w-full relative overflow-hidden group bg-linear-to-r from-emerald-500 to-cyan-600 rounded-lg px-4 py-3 font-bold text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all transform hover:-translate-y-1"
                        >
                            <span className="relative z-10">SIGN UP</span>
                            <div className="absolute inset-0 h-full w-full scale-0 rounded-lg transition-all duration-300 group-hover:scale-100 group-hover:bg-linear-to-r group-hover:from-cyan-600 group-hover:to-emerald-500"></div>
                        </button>
                    </div>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-slate-500">
                            Đã có tài khoản?{' '}
                            <span onClick={() => navigate('/login')} className="cursor-pointer text-emerald-400 hover:text-emerald-300 underline underline-offset-4 decoration-1">
                                Đăng nhập
                            </span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default Register;