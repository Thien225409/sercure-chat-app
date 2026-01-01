import { useEffect, useState, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientContext } from '../App';
import axios from 'axios';
import {
  encryptFile, decryptFile, toBase64,
  fromBase64, encryptWithGCM, genRandomSalt, decryptWithGCM,
  verifyWithECDSA
} from '../crypto/lib';
import { CA_PUBLIC_KEY, GOV_PUBLIC_KEY } from '../config';
import io from 'socket.io-client';
import { deriveKeyFromPassword } from '../utils';
import { MessengerClient } from '../crypto/messenger';

const Chat = () => {
  const { clientRef, user, setUser } = useContext(ClientContext);
  const navigate = useNavigate();
  
  // --- STATE QUẢN LÝ NHIỀU PHÒNG CHAT ---
  // conversations: { 'username1': [msgs...], 'username2': [msgs...] }
  const [conversations, setConversations] = useState({});
  const [activeContact, setActiveContact] = useState(null); // Người đang chat cùng (username hoặc 'AI')
  const [unread, setUnread] = useState({}); // { 'username1': 5, ... }

  const [input, setInput] = useState('');
  const [searchUser, setSearchUser] = useState(''); // Input tìm người dùng mới
  const [isRestoring, setIsRestoring] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Helper: Lấy tin nhắn hiện tại để hiển thị
  const activeMessages = activeContact 
    ? (conversations[activeContact] || []) 
    : [];

  // Tự động đăng nhập khi F5
  useEffect(() => {
    if (user?.socket || isRestoring) return;

    const restoreSession = async () => {
      const savedToken = sessionStorage.getItem('AUTH_TOKEN');
      const savedKeyJson = sessionStorage.getItem('ENC_KEY');

      if (!savedToken || !savedKeyJson) {
        navigate('/login');
        return;
      }

      console.log("🔄 Phát hiện Reload: Đang khôi phục phiên...");
      setIsRestoring(true);

      try {
        const socket = io('http://localhost:8001');
        socket.emit('login_token', { token: savedToken });

        await new Promise((resolve, reject) => {
          socket.on('login_success', async (data) => {
            try {
              const jwk = JSON.parse(savedKeyJson);
              const pwKey = await window.crypto.subtle.importKey(
                "jwk", jwk,
                { name: "AES-GCM", length: 256 },
                true, ["encrypt", "decrypt"]
              );

              const pkg = JSON.parse(data.keychainDump);
              const iv = fromBase64(pkg.iv);
              const ciphertext = fromBase64(pkg.data);
              const keychainBuffer = await decryptWithGCM(pwKey, ciphertext, iv);
              const keychainJSON = new TextDecoder().decode(keychainBuffer);

              const client = new MessengerClient(null, null);
              const caKey = await window.crypto.subtle.importKey(
                "jwk", CA_PUBLIC_KEY,
                { name: "ECDSA", namedCurve: "P-384" },
                true, ["verify"]
              );
              client.caPublicKey = caKey;
              const govKey = await window.crypto.subtle.importKey(
                "jwk", GOV_PUBLIC_KEY,
                { name: "ECDH", namedCurve: "P-384" },
                true, []
              );
              client.govPublicKey = govKey;
              await client.deserializeState(keychainJSON);

              // --- RESTORE KEYS (FIXED LOGIC) ---
              for (const targetUsername in client.certs) {
                const cert = client.certs[targetUsername];
                if (cert.pk && !(cert.pk instanceof CryptoKey)) {
                    cert.pk = await window.crypto.subtle.importKey("jwk", cert.pk, { name: "ECDH", namedCurve: "P-384" }, true, []);
                }
              }
              for (const name in client.conns) {
                const conn = client.conns[name];
                if (conn.DHr && !(conn.DHr instanceof CryptoKey)) {
                    conn.DHr = await window.crypto.subtle.importKey("jwk", conn.DHr, { name: "ECDH", namedCurve: "P-384" }, true, []);
                }
                if (conn.DHs) {
                   if (conn.DHs.pub && !(conn.DHs.pub instanceof CryptoKey)) conn.DHs.pub = await window.crypto.subtle.importKey("jwk", conn.DHs.pub, { name: "ECDH", namedCurve: "P-384" }, true, []);
                   if (conn.DHs.sec && !(conn.DHs.sec instanceof CryptoKey)) conn.DHs.sec = await window.crypto.subtle.importKey("jwk", conn.DHs.sec, { name: "ECDH", namedCurve: "P-384" }, true, ["deriveKey"]);
                }
                const hmacAlg = { name: 'HMAC', hash: 'SHA-256', length: 256 };
                const fixHmac = async (k) => (k && !(k instanceof CryptoKey)) ? await window.crypto.subtle.importKey("jwk", k, hmacAlg, true, ["sign"]) : k;
                conn.RK = await fixHmac(conn.RK);
                conn.CKs = await fixHmac(conn.CKs);
                conn.CKr = await fixHmac(conn.CKr);
              }

              clientRef.current = client;

              setUser({
                username: data.username,
                socket,
                pwKey,
                salt: fromBase64(pkg.salt)
              });
              resolve();
            } catch (e) {
              reject(e);
            }
          });
          socket.on('login_error', (err) => reject(err));
          setTimeout(() => reject("Timeout"), 5000);
        });
        setIsRestoring(false);
      } catch (err) {
        console.error("Khôi phục thất bại:", err);
        sessionStorage.clear();
        navigate('/login');
      }
    };
    restoreSession();
  }, [user, navigate]);

  // LOAD LỊCH SỬ CHAT TỪ LOCAL STORAGE
  useEffect(() => {
    if (!user?.username) return;
    const storageKey = `CONVERSATIONS_${user.username}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setConversations(JSON.parse(saved));
      } catch (e) { console.error(e); }
    }
  }, [user?.username]);

  // SAVE LỊCH SỬ KHI CÓ THAY ĐỔI
  useEffect(() => {
    if (!user?.username) return;
    const storageKey = `CONVERSATIONS_${user.username}`;
    localStorage.setItem(storageKey, JSON.stringify(conversations));
  }, [conversations, user?.username]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, activeContact]);

  // Reset Unread khi chuyển tab
  useEffect(() => {
    if (activeContact && unread[activeContact]) {
      setUnread(prev => ({ ...prev, [activeContact]: 0 }));
    }
  }, [activeContact]);

  const saveRatchetState = async () => {
    if (!clientRef.current || !user?.pwKey) return;
    try {
      const keychainRaw = await clientRef.current.serializeState();
      const iv = genRandomSalt(12);
      const encryptKeychainBuffer = await encryptWithGCM(user.pwKey, keychainRaw, iv);
      const pkg = JSON.stringify({
        iv: toBase64(iv),
        data: toBase64(new Uint8Array(encryptKeychainBuffer)),
        salt: toBase64(user.salt)
      });
      user.socket.emit('update_keychain', { username: user.username, encryptedKeychain: pkg });
    } catch (error) { console.error("Save keychain failed", error); }
  };

  // --- XỬ LÝ TIN NHẮN ĐẾN (Helper) ---
  const handleIncomingMessage = (sender, content) => {
    setConversations(prev => {
        const currentList = prev[sender] || [];
        return {
            ...prev,
            [sender]: [...currentList, { sender, content }]
        };
    });

    // Nếu không phải tab đang mở thì tăng unread
    if (sender !== activeContact) {
        setUnread(prev => ({
            ...prev,
            [sender]: (prev[sender] || 0) + 1
        }));
    }
  };

  // --- SOCKET LISTENERS ---
  useEffect(() => {
    if (!user?.socket) return;

    user.socket.on('receive_message', async (data) => {
      try {
        if (!clientRef.current.certs[data.from]) {
          await fetchAndImportCert(data.from);
        }

        const ciphertextBuffer = fromBase64(data.payload.ciphertext);

        const plaintext = await clientRef.current.receiveMessage(
          data.from,
          [data.payload.header, ciphertextBuffer]
        );

        let content;
        try {
          const jsonContent = JSON.parse(plaintext);
          content = jsonContent.type ? jsonContent : { type: 'TEXT', text: plaintext };
        } catch {
          content = { type: 'TEXT', text: plaintext };
        }

        handleIncomingMessage(data.from, content);
        await saveRatchetState();
      } catch (err) {
        console.error("Lỗi giải mã:", err);
      }
    });

    user.socket.on('offline_messages', async (msgs) => {
      // Logic xử lý offline messages: Cập nhật vào từng conversation tương ứng
      let needsSave = false;
      for (const msg of msgs) {
        try {
          if (!clientRef.current.certs[msg.from]) await fetchAndImportCert(msg.from);

          const ciphertextBuffer = fromBase64(msg.payload.ciphertext);
          const plaintext = await clientRef.current.receiveMessage(
            msg.from, 
            [msg.payload.header, ciphertextBuffer]
          );
          
          let content;
          try {
             const j = JSON.parse(plaintext);
             content = j.type ? j : { type: 'TEXT', text: plaintext };
          } catch { content = { type: 'TEXT', text: plaintext }; }

          // Cập nhật state (lưu ý state update trong loop cần functional update cẩn thận)
          setConversations(prev => ({
              ...prev,
              [msg.from]: [...(prev[msg.from] || []), { sender: msg.from, content }]
          }));
          setUnread(prev => ({ ...prev, [msg.from]: (prev[msg.from] || 0) + 1 }));
          needsSave = true;
        } catch (e) { console.error(e); }
      }
      if (needsSave) await saveRatchetState();
    });

    user.socket.on('ai_response', (data) => {
        handleIncomingMessage('Gemini AI', { type: 'TEXT', text: data.text });
    });

    return () => {
      user.socket.off('receive_message');
      user.socket.off('offline_messages');
      user.socket.off('ai_response');
    };
  }, [user, activeContact]); // activeContact trong dep để check unread chính xác

  const fetchAndImportCert = async (targetUsername) => {
    return new Promise((resolve, reject) => {
      user.socket.emit('get_certificate', targetUsername, async (response) => {
        if (!response || !response.pk) {
          alert(`Không tìm thấy user ${targetUsername}`);
          return resolve(false);
        }
        try {
          const certRaw = JSON.stringify({ username: response.username, pk: response.pk });
          const isValid = await verifyWithECDSA(clientRef.current.caPublicKey, certRaw, fromBase64(response.signature));
          if (!isValid) return resolve(false);

          const importedKey = await window.crypto.subtle.importKey("jwk", response.pk, { name: "ECDH", namedCurve: "P-384" }, true, []);
          clientRef.current.certs[targetUsername] = { username: targetUsername, pk: importedKey };
          resolve(true);
        } catch (e) { reject(e); }
      });
    });
  };

  const handleDownloadDecrypt = async (fileContent) => {
    try {
      const response = await fetch(fileContent.url);
      const encryptedBlob = await response.blob();
      const key = fromBase64(fileContent.key);
      const iv = fromBase64(fileContent.iv);
      const decryptedBlob = await decryptFile(encryptedBlob.arrayBuffer(), key, iv, fileContent.mimeType);
      const url = URL.createObjectURL(decryptedBlob);
      const a = document.createElement('a');
      a.href = url; a.download = fileContent.fileName; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert("Lỗi tải file."); }
  }

  const handleStartChat = () => {
      if (!searchUser) return;
      if (!conversations[searchUser]) {
          setConversations(prev => ({ ...prev, [searchUser]: [] }));
      }
      setActiveContact(searchUser);
      setSearchUser('');
  }

  const handleSend = async () => {
    if ((!input && !fileInputRef.current?.files[0]) || !activeContact) return;

    // A. Chat AI
    if (activeContact === 'Gemini AI') {
        user.socket.emit('ask_ai', { prompt: input });
        setConversations(prev => ({
            ...prev,
            'Gemini AI': [...(prev['Gemini AI']||[]), { sender: 'Me', content: { type: 'TEXT', text: input } }]
        }));
        setInput('');
        return;
    }

    // B. Chat E2E
    if (!clientRef.current.certs[activeContact]) {
      const success = await fetchAndImportCert(activeContact);
      if (!success) return;
    }

    // Fix Cert Check
    const targetCert = clientRef.current.certs[activeContact];
    if (targetCert?.pk && !(targetCert.pk instanceof CryptoKey)) {
        targetCert.pk = await window.crypto.subtle.importKey("jwk", targetCert.pk, { name: "ECDH", namedCurve: "P-384" }, true, []);
    }

    let finalContent = input;
    let displayContent = { type: 'TEXT', text: input };

    const file = fileInputRef.current?.files[0];
    if (file) {
      try {
        const { encryptedBlob, key, iv, type } = await encryptFile(file);
        const formData = new FormData();
        formData.append('encryptedFile', encryptedBlob, file.name);
        const res = await axios.post('http://localhost:8001/api/upload', formData);
        const filePayload = {
          type: 'FILE',
          url: res.data.url,
          fileName: file.name,
          mimeType: type,
          key: toBase64(key),
          iv: toBase64(iv)
        };
        finalContent = JSON.stringify(filePayload);
        displayContent = filePayload;
      } catch (e) { return alert("Upload thất bại"); }
    }

    try {
      const [headerStr, ciphertext] = await clientRef.current.sendMessage(activeContact, finalContent);
      const ciphertextB64 = toBase64(new Uint8Array(ciphertext));

      user.socket.emit('private_message', { 
          to: activeContact,
          header: headerStr,
          ciphertext: ciphertextB64
        }
      );

      // Update Local Chat
      setConversations(prev => ({
          ...prev,
          [activeContact]: [...(prev[activeContact]||[]), { sender: 'Me', content: displayContent }]
      }));

      setInput('');
      if (fileInputRef.current) fileInputRef.current.value = null;
      await saveRatchetState();
    } catch (err) {
      console.error(err);
      alert("Lỗi gửi tin: " + err.message);
    }
  };

  if (isRestoring || !user) return <div className="text-white text-center mt-20">Đang tải...</div>;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900 text-slate-100">
      
      {/* SIDEBAR */}
      <div className="w-80 shrink-0 border-r border-slate-700 bg-slate-800/50 flex flex-col">
        <div className="p-4 border-b border-slate-700">
             <div className="flex items-center space-x-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center font-bold">
                    {user.username.charAt(0).toUpperCase()}
                </div>
                <div><h3 className="font-bold">{user.username}</h3></div>
             </div>
             
             {/* Tìm người dùng mới */}
             <div className="flex gap-2">
                 <input 
                    className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm"
                    placeholder="Tìm user..."
                    value={searchUser}
                    onChange={e => setSearchUser(e.target.value)}
                 />
                 <button onClick={handleStartChat} className="bg-indigo-600 px-3 rounded text-sm">+</button>
             </div>
        </div>

        {/* Danh sách phòng chat */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* AI Room */}
            <div 
                onClick={() => setActiveContact('Gemini AI')}
                className={`p-3 cursor-pointer hover:bg-slate-700 flex justify-between items-center ${activeContact === 'Gemini AI' ? 'bg-slate-700 border-l-4 border-indigo-500' : ''}`}
            >
                <span>🤖 Gemini AI</span>
                {unread['Gemini AI'] > 0 && <span className="bg-red-500 text-xs rounded-full px-2 py-0.5">{unread['Gemini AI']}</span>}
            </div>

            {/* User Rooms */}
            {Object.keys(conversations).filter(u => u !== 'Gemini AI').map(username => (
                <div 
                    key={username}
                    onClick={() => setActiveContact(username)}
                    className={`p-3 cursor-pointer hover:bg-slate-700 flex justify-between items-center ${activeContact === username ? 'bg-slate-700 border-l-4 border-indigo-500' : ''}`}
                >
                    <div className="flex items-center gap-2">
                         <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                         <span>{username}</span>
                    </div>
                    {unread[username] > 0 && (
                        <span className="bg-red-500 text-xs rounded-full h-5 w-5 flex items-center justify-center">
                            {unread[username]}
                        </span>
                    )}
                </div>
            ))}
        </div>
      </div>

      {/* CHAT MAIN AREA */}
      <div className="flex flex-1 flex-col bg-slate-900">
        {/* Header */}
        <div className="h-14 border-b border-slate-700 flex items-center px-6 bg-slate-800">
            {activeContact ? (
                <span className="font-bold text-lg">{activeContact === 'Gemini AI' ? '✨ Chat với AI' : `🔒 ${activeContact}`}</span>
            ) : <span className="text-slate-500">Chọn một cuộc hội thoại</span>}
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {!activeContact && (
                <div className="h-full flex items-center justify-center text-slate-600">
                    <div>Chào mừng quay trở lại!</div>
                </div>
            )}
            
            {activeMessages.map((msg, i) => {
                const isMe = msg.sender === 'Me';
                return (
                    <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                         <div className={`max-w-[70%] rounded-lg px-4 py-2 ${isMe ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                            {msg.content.type === 'TEXT' ? (
                                <p>{msg.content.text}</p>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span>📄 {msg.content.fileName}</span>
                                    <button onClick={() => handleDownloadDecrypt(msg.content)} className="underline text-indigo-300 text-sm">Tải về</button>
                                </div>
                            )}
                         </div>
                    </div>
                )
            })}
            <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {activeContact && (
            <div className="p-4 border-t border-slate-700 bg-slate-800 flex gap-2">
                <button onClick={() => fileInputRef.current.click()} className="text-slate-400 hover:text-white">📎</button>
                <input type="file" ref={fileInputRef} className="hidden" />
                <input 
                    className="flex-1 bg-slate-900 rounded px-3 py-2 outline-none border border-slate-700 focus:border-indigo-500"
                    placeholder="Nhập tin nhắn..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleSend()}
                />
                <button onClick={handleSend} className="bg-indigo-600 px-4 rounded font-bold">Gửi</button>
            </div>
        )}
      </div>
    </div>
  );
};

export default Chat;