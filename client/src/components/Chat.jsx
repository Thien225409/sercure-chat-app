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
import EmojiPicker from 'emoji-picker-react';
import ReactMarkdown from 'react-markdown';

const Chat = () => {
  const { clientRef, user, setUser } = useContext(ClientContext);
  const navigate = useNavigate();

  const [conversations, setConversations] = useState({});
  const [activeContact, setActiveContact] = useState(null);
  const [unread, setUnread] = useState({});
  const [input, setInput] = useState('');
  const [searchUser, setSearchUser] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [userStatuses, setUserStatuses] = useState({});
  const [showEmoji, setShowEmoji] = useState(false);

  // --- UX STATES ---
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [chatStatus, setChatStatus] = useState({});

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  const activeMessages = activeContact ? (conversations[activeContact] || []) : [];

  // ==================== AUTO LOGIN (PORT 8001) ====================
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
        // UPDATE PORT TO 8001
        const socket = io('http://localhost:8001');
        socket.emit('login_token', { token: savedToken });

        await new Promise((resolve, reject) => {
          socket.on('login_success', async (data) => {
            try {
              const jwk = JSON.parse(savedKeyJson);
              const pwKey = await window.crypto.subtle.importKey(
                "jwk", jwk, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
              );
              const pkg = JSON.parse(data.keychainDump);
              const iv = fromBase64(pkg.iv);
              const ciphertext = fromBase64(pkg.data);
              const keychainBuffer = await decryptWithGCM(pwKey, ciphertext, iv);
              const keychainJSON = new TextDecoder().decode(keychainBuffer);

              const client = new MessengerClient(null, null);
              client.caPublicKey = await window.crypto.subtle.importKey(
                "jwk", CA_PUBLIC_KEY, { name: "ECDSA", namedCurve: "P-384" }, true, ["verify"]
              );
              client.govPublicKey = await window.crypto.subtle.importKey(
                "jwk", GOV_PUBLIC_KEY, { name: "ECDH", namedCurve: "P-384" }, true, []
              );
              await client.deserializeState(keychainJSON);

              clientRef.current = client;
              setUser({
                username: data.username,
                socket,
                pwKey,
                salt: fromBase64(pkg.salt)
              });
              resolve();
            } catch (e) { console.error("❌ Lỗi khôi phục:", e); reject(e); }
          });
          socket.on('login_error', (err) => { reject(err); });
          setTimeout(() => reject(new Error("Timeout")), 5000);
        });
        setIsRestoring(false);
      } catch (err) {
        sessionStorage.clear();
        navigate('/login');
      }
    };
    restoreSession();
  }, [user, navigate, setUser, clientRef]);

  // ==================== HISTORY & SYNC ====================
  useEffect(() => {
    if (!user?.username || !user?.pwKey) return;
    const loadHistory = async () => {
      const storageKey = `CONVERSATIONS_${user.username}`;
      const savedEncrypted = localStorage.getItem(storageKey);

      const decryptAndLoad = async (encryptedPkg) => {
        try {
          let pkg;
          try { pkg = JSON.parse(encryptedPkg); } catch { pkg = null; }
          if (pkg && pkg.iv && pkg.data) {
            const iv = fromBase64(pkg.iv);
            const ciphertext = fromBase64(pkg.data);
            const plaintextBuffer = await decryptWithGCM(user.pwKey, ciphertext, iv);
            const plaintext = new TextDecoder().decode(plaintextBuffer);
            setConversations(JSON.parse(plaintext));
            return true;
          }
        } catch (e) { console.error("❌ Lỗi giải mã history:", e); }
        return false;
      };

      if (savedEncrypted) {
        await decryptAndLoad(savedEncrypted);
        setIsHistoryLoaded(true);
      } else {
        user.socket.emit('download_history', user.username);
        user.socket.once('download_history_response', async (data) => {
          if (data.encryptedHistory) await decryptAndLoad(data.encryptedHistory);
          setIsHistoryLoaded(true);
        });
        setTimeout(() => setIsHistoryLoaded(true), 3000);
      }
    };
    loadHistory();
  }, [user?.username, user?.pwKey, user?.socket]);

  useEffect(() => {
    if (!user?.username || !user?.pwKey || !isHistoryLoaded) return;
    const saveHistory = async () => {
      try {
        const jsonStr = JSON.stringify(conversations);
        const iv = genRandomSalt(12);
        const ciphertextBuffer = await encryptWithGCM(user.pwKey, jsonStr, iv);
        const pkg = JSON.stringify({
          iv: toBase64(iv), data: toBase64(new Uint8Array(ciphertextBuffer))
        });
        localStorage.setItem(`CONVERSATIONS_${user.username}`, pkg);

        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = setTimeout(() => {
          if (user?.socket) user.socket.emit('upload_history', { username: user.username, encryptedHistory: pkg });
        }, 5000);
      } catch (e) { console.error("Lỗi lưu history:", e); }
    };
    saveHistory();
  }, [conversations, user?.username, user?.pwKey, isHistoryLoaded, user?.socket]);

  // ==================== SCROLL & UX ====================
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    if (activeContact && activeContact !== 'Gemini AI' && user?.socket) {
      user.socket.emit('msg_seen_status', { to: activeContact });
      setUnread(prev => ({ ...prev, [activeContact]: 0 }));
    }
  }, [conversations, activeContact, user?.socket]);

  const saveRatchetState = async () => {
    if (!clientRef.current || !user?.pwKey) return;
    try {
      const keychainRaw = await clientRef.current.serializeState();
      const iv = genRandomSalt(12);
      const encryptKeychainBuffer = await encryptWithGCM(user.pwKey, keychainRaw, iv);
      const pkg = JSON.stringify({
        iv: toBase64(iv), data: toBase64(new Uint8Array(encryptKeychainBuffer)), salt: toBase64(user.salt)
      });
      user.socket.emit('update_keychain', { username: user.username, encryptedKeychain: pkg });
    } catch (error) { console.error("Save keychain failed", error); }
  };

  const handleIncomingMessage = (sender, content) => {
    setConversations(prev => {
      const currentList = prev[sender] || [];
      return { ...prev, [sender]: [...currentList, { sender, content }] };
    });
    if (sender !== activeContact) {
      setUnread(prev => ({ ...prev, [sender]: (prev[sender] || 0) + 1 }));
    } else {
      if (user?.socket) user.socket.emit('msg_seen_status', { to: sender });
    }
  };

  // ==================== SOCKET LISTENERS ====================
  useEffect(() => {
    if (!user?.socket) return;

    // Status Logic ...
    user.socket.on('user_status', (data) => setUserStatuses(prev => ({ ...prev, [data.username]: data.status })));
    user.socket.on('online_users_list', (users) => setUserStatuses(prev => {
      const newStatuses = { ...prev };
      users.forEach(u => { if (u !== user.username) newStatuses[u] = 'ONLINE'; });
      return newStatuses;
    }));
    user.socket.emit('get_online_users');

    user.socket.on('receive_message', async (data) => {
      try {
        if (!clientRef.current.certs[data.from]) await fetchAndImportCert(data.from);
        const ciphertextBuffer = fromBase64(data.payload.ciphertext);
        const plaintext = await clientRef.current.receiveMessage(data.from, [data.payload.header, ciphertextBuffer]);
        let content;
        try { content = JSON.parse(plaintext).type ? JSON.parse(plaintext) : { type: 'TEXT', text: plaintext }; }
        catch { content = { type: 'TEXT', text: plaintext }; }
        handleIncomingMessage(data.from, content);
        await saveRatchetState();
      } catch (err) {
        if (err.message?.includes("Message already")) return;
        handleIncomingMessage(data.from, { type: 'TEXT', text: '⚠️ [Tin nhắn lỗi]' });
      }
    });

    user.socket.on('offline_messages', async (msgs) => {
      let needsSave = false;
      for (const msg of msgs) {
        try {
          if (!clientRef.current.certs[msg.from]) await fetchAndImportCert(msg.from);
          const ciphertextBuffer = fromBase64(msg.payload.ciphertext);
          const plaintext = await clientRef.current.receiveMessage(msg.from, [msg.payload.header, ciphertextBuffer]);
          let content;
          try { content = JSON.parse(plaintext).type ? JSON.parse(plaintext) : { type: 'TEXT', text: plaintext }; }
          catch { content = { type: 'TEXT', text: plaintext }; }
          setConversations(prev => ({ ...prev, [msg.from]: [...(prev[msg.from] || []), { sender: msg.from, content }] }));
          setUnread(prev => ({ ...prev, [msg.from]: (prev[msg.from] || 0) + 1 }));
          needsSave = true;
        } catch (e) { if (!e.message?.includes("Message already")) console.error(e); }
      }
      if (needsSave) await saveRatchetState();
    });

    user.socket.on('ai_response', (data) => {
      handleIncomingMessage('Gemini AI', { type: 'TEXT', text: data.text });
    });

    user.socket.on('friend_typing', ({ username }) => setTypingUsers(prev => new Set(prev).add(username)));
    user.socket.on('friend_stop_typing', ({ username }) => setTypingUsers(prev => { const next = new Set(prev); next.delete(username); return next; }));
    user.socket.on('friend_seen', ({ username }) => setChatStatus(prev => ({ ...prev, [username]: 'Đã xem' })));

    return () => {
      user.socket.off('user_status');
      user.socket.off('online_users_list');
      user.socket.off('receive_message');
      user.socket.off('offline_messages');
      user.socket.off('ai_response');
      user.socket.off('friend_typing');
      user.socket.off('friend_stop_typing');
      user.socket.off('friend_seen');
    };
  }, [user, activeContact, clientRef]);

  // ... (Helper functions: fetchAndImportCert, handleDownloadDecrypt stay same)
  const fetchAndImportCert = async (targetUsername) => {
    return new Promise((resolve, reject) => {
      user.socket.emit('get_certificate', targetUsername, async (response) => {
        if (!response || !response.pk) return resolve(false);
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
      const decryptedBlob = await decryptFile(await encryptedBlob.arrayBuffer(), key, iv, fileContent.mimeType);
      const url = URL.createObjectURL(decryptedBlob);
      const a = document.createElement('a'); a.href = url; a.download = fileContent.fileName; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert("Lỗi tải file"); }
  };

  const handleStartChat = () => {
    if (!searchUser || !user?.socket) return;
    user.socket.emit('check_user', searchUser, (response) => {
      if (response.exists) {
        if (!conversations[searchUser]) setConversations(prev => ({ ...prev, [searchUser]: [] }));
        setUserStatuses(prev => ({ ...prev, [searchUser]: response.isOnline ? 'ONLINE' : 'OFFLINE' }));
        setActiveContact(searchUser);
        setSearchUser('');
      } else { alert("User không tồn tại!"); }
    });
  };

  const handleSend = async () => {
    if ((!input && !fileInputRef.current?.files[0]) || !activeContact) return;

    if (activeContact === 'Gemini AI') {
      const history = conversations['Gemini AI'] || [];
      const recentHistory = history.slice(-50);
      user.socket.emit('ask_ai', { prompt: input, history: recentHistory });
      setConversations(prev => ({
        ...prev, 'Gemini AI': [...(prev['Gemini AI'] || []), { sender: 'Me', content: { type: 'TEXT', text: input } }]
      }));
      setInput('');
      return;
    }

    if (!clientRef.current.certs[activeContact]) {
      const success = await fetchAndImportCert(activeContact);
      if (!success) return;
    }
    const targetCert = clientRef.current.certs[activeContact];
    if (targetCert?.pk && typeof targetCert.pk === 'object' && !targetCert.pk.type) {
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
        // FIX PORT 8001 HERE TOO
        const res = await axios.post('http://localhost:8001/api/upload', formData);
        const filePayload = { type: 'FILE', url: res.data.url, fileName: file.name, mimeType: type, key: toBase64(key), iv: toBase64(iv) };
        finalContent = JSON.stringify(filePayload);
        displayContent = filePayload;
      } catch (e) { return alert("Upload thất bại"); }
    }

    try {
      const [headerStr, ciphertext] = await clientRef.current.sendMessage(activeContact, finalContent);
      user.socket.emit('private_message', { to: activeContact, header: headerStr, ciphertext: toBase64(new Uint8Array(ciphertext)) });
      setConversations(prev => ({ ...prev, [activeContact]: [...(prev[activeContact] || []), { sender: 'Me', content: displayContent }] }));
      setChatStatus(prev => ({ ...prev, [activeContact]: 'Đã gửi' }));
      setInput('');
      if (fileInputRef.current) fileInputRef.current.value = null;
      await saveRatchetState();
    } catch (err) { alert("Lỗi gửi tin"); }
  };
  // ... UI RENDER LOGIC ...
  const onEmojiClick = (emojiObject) => setInput(prev => prev + emojiObject.emoji);
  const handleLogout = () => {
    if (confirm("Đăng xuất khỏi thiết bị này?")) {
      if (user?.socket) user.socket.disconnect();
      sessionStorage.clear();
      setUser(null);
      navigate('/login');
    }
  };
  const handleDeleteChat = (targetUser, e) => {
    e.stopPropagation();
    if (confirm(`Xóa toàn bộ cuộc trò chuyện với ${targetUser}?`)) {
      setConversations(prev => { const next = { ...prev }; delete next[targetUser]; return next; });
      if (activeContact === targetUser) setActiveContact(null);
      setMenuOpenId(null);
    }
  };
  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!activeContact || activeContact === 'Gemini AI') return;
    user.socket.emit('typing', { to: activeContact });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => { user.socket.emit('stop_typing', { to: activeContact }); }, 1000);
  };

  if (isRestoring || !user) return <div className="flex h-screen w-full items-center justify-center bg-black text-cyan-500 animate-pulse">ĐANG KHÔI PHỤC PHIÊN...</div>;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900 text-slate-100 font-sans" onClick={() => { setMenuOpenId(null); setShowEmoji(false); }}>
      <div className="w-80 shrink-0 border-r border-slate-700 bg-slate-800/50 flex flex-col">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 circle-avatar bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold shadow-lg">{user.username.charAt(0).toUpperCase()}</div>
            <h3 className="font-bold text-lg">{user.username}</h3>
          </div>
          <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></button>
        </div>
        <div className="p-4 pt-2">
          <div className="flex gap-2">
            <input className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none transition-all" placeholder="Thêm tin nhắn mới..." value={searchUser} onChange={e => setSearchUser(e.target.value)} />
            <button onClick={handleStartChat} className="bg-indigo-600 hover:bg-indigo-700 w-10 rounded-lg text-lg flex items-center justify-center font-bold transition-transform active:scale-95">+</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          <div onClick={() => setActiveContact('Gemini AI')} className={`p-3 cursor-pointer rounded-lg flex justify-between items-center transition-all ${activeContact === 'Gemini AI' ? 'bg-indigo-600/20 border-l-4 border-indigo-500' : 'hover:bg-slate-700/50'}`}>
            <div className='flex items-center gap-3'><span className='text-xl'>🤖</span><span className='font-medium'>Gemini AI</span></div>
            {unread['Gemini AI'] > 0 && (<span className="bg-red-500 text-xs font-bold rounded-full px-2 py-0.5 shadow-sm">{unread['Gemini AI']}</span>)}
          </div>
          {Object.keys(conversations).filter(u => u !== 'Gemini AI').map(username => (
            <div key={username} className={`group relative p-3 cursor-pointer rounded-lg flex justify-between items-center transition-all ${activeContact === username ? 'bg-indigo-600/20 border-l-4 border-indigo-500' : 'hover:bg-slate-700/50'}`}>
              <div className="flex items-center gap-3 flex-1" onClick={() => setActiveContact(username)}>
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center font-bold text-slate-300">{username.charAt(0).toUpperCase()}</div>
                  <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-800 ${userStatuses[username] === 'ONLINE' ? 'bg-emerald-500' : 'bg-slate-500'}`}></div>
                </div>
                <div className='flex flex-col'>
                  <span className='font-medium text-slate-200'>{username}</span>
                  <span className='text-xs text-slate-500 truncate max-w-[120px]'>
                    {typingUsers.has(username) ? <span className='text-indigo-400 animate-pulse italic'>Đang soạn tin...</span> : (conversations[username]?.length > 0 ? (conversations[username].at(-1).content.type === 'FILE' ? 'Sent a file' : conversations[username].at(-1).content.text.substring(0, 15) + '...') : 'Bắt đầu trò chuyện')}
                  </span>
                </div>
              </div>
              <div className='flex items-center gap-2'>
                {unread[username] > 0 && (<span className="bg-red-500 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">{unread[username]}</span>)}
                <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === username ? null : username); }} className="p-1 hover:bg-slate-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><svg className="w-5 h-5 text-slate-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg></button>
                {menuOpenId === username && (
                  <div className="absolute right-2 top-10 w-40 bg-slate-800 border border-slate-600 shadow-xl rounded-lg z-50 overflow-hidden py-1 animate-fadeIn">
                    <button className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2" onClick={(e) => handleDeleteChat(username, e)}>🗑️ Xóa hội thoại</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col bg-slate-900 relative">
        <div className="h-16 border-b border-slate-700 flex items-center px-6 bg-slate-800 shadow-md">
          {activeContact ? (
            <div className='flex flex-col'>
              <span className="font-bold text-lg flex items-center gap-2">{activeContact === 'Gemini AI' ? '✨ Chat với AI' : activeContact}</span>
              {activeContact !== 'Gemini AI' && (<span className='text-xs text-emerald-400 font-medium'>{typingUsers.has(activeContact) ? 'Đang soạn tin...' : (userStatuses[activeContact] === 'ONLINE' ? 'Đang hoạt động' : 'Không hoạt động')}</span>)}
            </div>
          ) : (<span className="text-slate-500">Chọn một cuộc hội thoại</span>)}
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!activeContact && (<div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4 opacity-50"><div className='text-6xl'>💬</div><div className='text-xl font-light'>Chào mừng quay trở lại, {user.username}!</div></div>)}
          {activeMessages.map((msg, i) => {
            const isMe = msg.sender === 'Me';
            const isLast = i === activeMessages.length - 1;
            return (
              <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-slideIn`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2 shadow-sm ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-700 text-slate-100 rounded-bl-none'}`}>
                  {msg.content.type === 'TEXT' ? (
                    <div className={`prose prose-sm prose-invert max-w-none break-words leading-relaxed`}>
                      <ReactMarkdown components={{
                        code({ node, inline, className, children, ...props }) {
                          return !inline ? (
                            <div className="bg-black/50 p-2 rounded-md my-2 overflow-x-auto text-xs font-mono border border-white/10">{children}</div>
                          ) : (
                            <code className="bg-black/30 px-1 py-0.5 rounded text-xs font-mono border border-white/10" {...props}>{children}</code>
                          )
                        },
                        ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-1">{children}</ol>,
                        li: ({ children }) => <li>{children}</li>,
                        strong: ({ children }) => <strong className="text-yellow-200 font-bold">{children}</strong>,
                        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>
                      }}>
                        {msg.content.text}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className='bg-black/20 p-2 rounded-lg'>📄</div>
                      <div>
                        <div className='text-sm font-bold truncate max-w-[150px]'>{msg.content.fileName}</div>
                        <button onClick={() => handleDownloadDecrypt(msg.content)} className="text-xs underline text-indigo-200 hover:text-white mt-1">Tải xuống & Giải mã</button>
                      </div>
                    </div>
                  )}
                </div>
                {isMe && isLast && activeContact !== 'Gemini AI' && (<div className='text-[10px] text-slate-400 mt-1 mr-1 transition-all'>{chatStatus[activeContact] || 'Đã gửi'}</div>)}
              </div>
            );
          })}
          {typingUsers.has(activeContact) && activeContact !== 'Gemini AI' && (<div className="flex items-center gap-2 text-slate-500 text-sm ml-2 animate-pulse"><div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-100"></div><div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-200"></div></div>)}
          <div ref={messagesEndRef} />
        </div>
        {activeContact && (
          <div className="p-4 border-t border-slate-700 bg-slate-800 flex gap-3 items-center relative" onClick={e => e.stopPropagation()}>
            {showEmoji && (<div className="absolute bottom-20 left-4 z-50 shadow-2xl rounded-2xl overflow-hidden border border-slate-600"><EmojiPicker theme="dark" onEmojiClick={onEmojiClick} searchDisabled={false} width={300} height={400} /></div>)}
            <button onClick={() => setShowEmoji(!showEmoji)} className={`p-2 rounded-full transition-all ${showEmoji ? 'text-yellow-400 bg-slate-700' : 'text-slate-400 hover:text-yellow-400 hover:bg-slate-700/50'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
            <button onClick={() => fileInputRef.current.click()} className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-700/50 rounded-full transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg></button>
            <input type="file" ref={fileInputRef} className="hidden" />
            <input className="flex-1 bg-slate-900 text-slate-200 rounded-full px-5 py-3 outline-none border border-slate-700 focus:border-indigo-500 transition-colors shadow-inner" placeholder={`Nhắn tin tới ${activeContact}...`} value={input} onChange={handleInputChange} onKeyPress={e => e.key === 'Enter' && handleSend()} onFocus={() => setShowEmoji(false)} />
            <button onClick={handleSend} disabled={!input && !fileInputRef.current?.files[0]} className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg transition-transform active:scale-90 disabled:opacity-50 disabled:active:scale-100"><svg className="w-5 h-5 translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg></button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;