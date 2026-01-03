
import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import ChatPage from './pages/ChatPage';

import { MessengerClient } from './crypto/messenger';
import { decryptWithGCM, fromBase64 } from './crypto/lib';
import { CA_PUBLIC_KEY, GOV_PUBLIC_KEY } from './config';
import io from 'socket.io-client';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export const ClientContext = React.createContext();


function App() {
  const clientRef = useRef(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      const token = sessionStorage.getItem('AUTH_TOKEN');
      const encKeyJson = sessionStorage.getItem('ENC_KEY');

      if (!token || !encKeyJson) {
        setLoading(false);
        return;
      }

      console.log("🔄 Đang khôi phục phiên đăng nhập...");
      const socket = io('http://localhost:8001');
      socket.emit('login_token', { token });

      socket.on('login_success', async (data) => {
        try {
          // 1. Khôi phục Key giải mã Keychain
          const importedKey = await window.crypto.subtle.importKey(
            "jwk", JSON.parse(encKeyJson),
            { name: "AES-GCM" }, true, ["encrypt", "decrypt"]
          );

          // 2. Giải mã Keychain
          const pkg = JSON.parse(data.keychainDump);
          const iv = fromBase64(pkg.iv);
          const ciphertext = fromBase64(pkg.data);

          const keychainBuffer = await decryptWithGCM(importedKey, ciphertext, iv);
          const keychainJSON = new TextDecoder().decode(keychainBuffer);

          // 3. Khôi phục Client Crypto
          const client = new MessengerClient(null, null);
          client.caPublicKey = await window.crypto.subtle.importKey(
            "jwk", CA_PUBLIC_KEY, { name: "ECDSA", namedCurve: "P-384" }, true, ["verify"]
          );
          client.govPublicKey = await window.crypto.subtle.importKey(
            "jwk", GOV_PUBLIC_KEY, { name: "ECDH", namedCurve: "P-384" }, true, []
          );

          // Logic deserializeState mới trong messenger.js đã tự handle việc importKey
          await client.deserializeState(keychainJSON);

          clientRef.current = client;

          // 4. Set User
          setUser({
            username: data.username,
            socket,
            pwKey: importedKey,
            salt: fromBase64(pkg.salt)
          });
          console.log("✅ Khôi phục thành công!");

        } catch (err) {
          console.error("Auto-login failed:", err);
          sessionStorage.clear();
        } finally {
          setLoading(false);
        }
      });

      socket.on('login_error', () => {
        console.warn("Phiên đăng nhập hết hạn.");
        sessionStorage.clear();
        setLoading(false);
      });

      setTimeout(() => setLoading(false), 5000);
    };
    restoreSession();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black text-cyan-500 font-mono">
        <div className="animate-pulse"> INITIALIZING SECURE CONNECTION...</div>
      </div>
    );
  }

  return (
    <ClientContext.Provider value={{ clientRef, user, setUser }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/chat" />} />
          <Route path="/register" element={!user ? <Register /> : <Navigate to="/chat" />} />
          <Route path="/chat" element={user ? <ChatPage /> : <Navigate to="/login" />} />
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
      <ToastContainer
        position="bottom-right"
        autoClose={4000}
        hideProgressBar={true}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
        toastClassName="!bg-slate-800/90 !backdrop-blur-md !border !border-white/10 !shadow-2xl !rounded-xl !mb-3 !cursor-pointer overflow-hidden transform transition-all hover:scale-[1.02]"
        bodyClassName="!p-3 !m-0 !flex !items-start !gap-3 text-sm font-medium text-white"
        progressClassName="!bg-indigo-500"
      />
    </ClientContext.Provider>
  );
}

export default App;