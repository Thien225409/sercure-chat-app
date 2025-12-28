import { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientContext } from '../App';
import { MessengerClient } from '../crypto/messenger';
import { deriveKeyFromPassword } from '../utils';
import { decryptWithGCM, fromBase64 } from '../crypto/lib';
import io from 'socket.io-client';

const Login = () => {
  const { clientRef, setUser } = useContext(ClientContext);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    const socket = io('http://localhost:8001');

    socket.emit('login', { username, passwordHash: password });

    socket.on('login_success', async (data) => {
      try {
        // Server return keychainDump

        const pkg = JSON.parse(data.keychainDump);
        const salt = fromBase64(pkg.salt);
        const iv = fromBase64(pkg.iv);
        const ciphertext = fromBase64(pkg.data);

        // Tái tạo key
        const pwKey = await deriveKeyFromPassword(password, salt);
        const keychainBuffer = await decryptWithGCM(pwKey, ciphertext, iv);
        const keychainJSON = new TextDecoder().decode(keychainBuffer);

        const client = new MessengerClient(null, null);
        await client.deserializeState(keychainJSON);

        clientRef.current = client;
        setUser({ username: data.username, socket });
        navigate('/chat');
      } catch (err) {
        console.error(err);
        alert("Sai password hoặc lỗi giải mã Keychain!");
      }
    });
    socket.on('error', (msg) => alert(msg));
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black">
      {/* Background Effects */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>

      {/* Main Card */}
      <div className="relative z-10 w-full max-w-md p-px bg-linear-to-b from-cyan-500/20 to-purple-500/20 rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.5)]">
        <div className="w-full h-full bg-black/90 backdrop-blur-md rounded-2xl p-8 border border-white/10">
          
          {/* Logo / Header */}
          <div className="text-center mb-8">
            
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-linear-to-tr from-cyan-400 to-purple-500 mb-4 shadow-[0_0_20px_rgba(34,211,238,0.5)]">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
            </div>
            
            <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-purple-400 tracking-wider">
              SECURE CHAT
            </h2>
            <p className="text-xs text-slate-400 mt-2 uppercase tracking-[0.2em]">End-to-End Encryption</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="group">
              <label className="block text-xs text-cyan-400 mb-1 ml-1 uppercase font-bold tracking-wide">USERNAME</label>
              <input 
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all placeholder-slate-600"
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)} 
                required
              />
            </div>

            <div className="group">
              <label className="block text-xs text-purple-400 mb-1 ml-1 uppercase font-bold tracking-wide">PASSWORD</label>
              <input 
                type="password" 
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder-slate-600"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)} 
                required
              />
            </div>

            <button 
              type="submit" 
              className="w-full relative overflow-hidden group bg-linear-to-r from-cyan-500 to-purple-600 rounded-lg px-4 py-3 font-bold text-white shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] transition-all transform hover:-translate-y-1"
            >
              <span className="relative z-10">LOGIN</span>
              <div className="absolute inset-0 h-full w-full scale-0 rounded-lg transition-all duration-300 group-hover:scale-100 group-hover:bg-linear-to-r group-hover:from-purple-600 group-hover:to-cyan-500"></div>
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              Chưa có danh tính?{' '}
              <span onClick={() => navigate('/register')} className="cursor-pointer text-cyan-400 hover:text-cyan-300 underline underline-offset-4 decoration-1">
                Đăng kí ngay
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Login;