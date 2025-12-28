import { useEffect, useState, useContext, useRef } from 'react';
import { ClientContext } from '../App';
import axios from 'axios';
import { encryptFile, decryptFile, toBase64, fromBase64 } from '../crypto/lib';

const Chat = () => {
  const { clientRef, user } = useContext(ClientContext);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [targetUser, setTargetUser] = useState('');
  const [isAiMode, setIsAiMode] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto scroll
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [messages]);

  // --- 1. NHẬN TIN NHẮN (LOGIC THẬT) ---
  useEffect(() => {
    if (!user?.socket) return;

    user.socket.on('receive_message', async (data) => {
      try {
        // Handshake: Nếu chưa có Cert của người gửi, phải lấy ngay
        if (!clientRef.current.certs[data.from]) {
           await fetchAndImportCert(data.from);
        }

        const plaintext = await clientRef.current.receiveMessage(
          data.from, 
          [data.payload.header, data.payload.ciphertext]
        );

        let content;
        try {
          const jsonContent = JSON.parse(plaintext);
          content = jsonContent.type ? jsonContent : { type: 'TEXT', text: plaintext };
        } catch {
          content = { type: 'TEXT', text: plaintext };
        }

        setMessages(prev => [...prev, { sender: data.from, content }]);
        // Lưu keychain (Tạm bỏ qua để code gọn, thực tế cần syncKeychain ở đây)
      } catch (err) {
        console.error("Lỗi nhận tin:", err);
      }
    });
    
    // Nhận tin từ AI
    user.socket.on('ai_response', (data) => {
        setMessages(prev => [...prev, { sender: 'Gemini AI', content: { type: 'TEXT', text: data.text } }]);
    });

    return () => user.socket.off('receive_message');
  }, [user]);

  // --- 2. CÁC HÀM HỖ TRỢ (HANDSHAKE & FILE) ---
  const fetchAndImportCert = async (targetUsername) => {
    return new Promise((resolve, reject) => {
        user.socket.emit('get_certificate', targetUsername, async (certJson) => {
            if (!certJson) {
                reject("User not found");
                return;
            }
            try {
                const importedKey = await window.crypto.subtle.importKey(
                    "jwk", certJson.pk, 
                    { name: "ECDH", namedCurve: "P-384" }, 
                    true, []
                );
                clientRef.current.certs[targetUsername] = {
                    username: targetUsername,
                    pk: importedKey
                };
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
        const decryptedBlob = await decryptFile(encryptedBlob, key, iv, fileContent.mimeType);
        
        const url = URL.createObjectURL(decryptedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileContent.fileName;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        alert("Lỗi tải/giải mã file.");
    }
  }

  // --- 3. GỬI TIN NHẮN (LOGIC THẬT) ---
  const handleSend = async () => {
    if ((!input && !fileInputRef.current?.files[0])) return;
    
    // A. Chat AI
    if (isAiMode) {
        user.socket.emit('ask_ai', { prompt: input });
        setMessages(prev => [...prev, { sender: 'Me', content: { type: 'TEXT', text: input } }]);
        setInput('');
        return;
    }

    if (!targetUser) return alert("Chưa nhập người nhận!");

    // B. Chat Người - Handshake
    if (!clientRef.current.conns[targetUser]) {
        try {
            await fetchAndImportCert(targetUser);
        } catch (e) {
            alert("Không tìm thấy người dùng này!");
            return;
        }
    }

    let finalContent = input;
    let displayContent = { type: 'TEXT', text: input };

    // C. Xử lý File
    const file = fileInputRef.current?.files[0];
    if (file) {
      const { encryptedBlob, key, iv, type } = await encryptFile(file);
      const formData = new FormData();
      formData.append('encryptedFile', encryptedBlob, file.name);
      
      try {
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
      } catch (e) {
          alert("Upload thất bại.");
          return;
      }
    }

    // D. Mã hóa & Gửi
    try {
      const [header, ciphertext] = await clientRef.current.sendMessage(targetUser, finalContent);

      user.socket.emit('send_message', {
        to: targetUser,
        payload: { header, ciphertext }
      });

      setMessages(prev => [...prev, { sender: 'Me', content: displayContent }]);
      setInput('');
      if (fileInputRef.current) fileInputRef.current.value = null;

    } catch (err) {
      console.error("Lỗi gửi tin:", err);
      alert("Lỗi mã hóa: " + err.message);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900 text-slate-100">
      
      {/* SIDEBAR */}
      <div className="w-80 shrink-0 border-r border-slate-700 bg-slate-800/50 flex flex-col">
        {/* User Profile */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            {/* SỬA: bg-gradient-to-tr -> bg-linear-to-tr (Tailwind v4) */}
            <div className="h-10 w-10 rounded-full bg-linear-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-lg">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-bold text-white">{user?.username}</h3>
              <div className="flex items-center text-xs text-emerald-400">
                <span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Online
              </div>
            </div>
          </div>
        </div>

        {/* Search / Target Input */}
        <div className="p-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Người nhận</label>
            <input 
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
              placeholder="Nhập username..." 
              value={targetUser}
              onChange={e => setTargetUser(e.target.value)}
              disabled={isAiMode}
            />
          </div>

          {/* AI Toggle */}
          <div 
            onClick={() => setIsAiMode(!isAiMode)}
            className={`cursor-pointer rounded-lg p-3 border transition-all duration-200 flex items-center space-x-3 ${isAiMode ? 'bg-indigo-600/20 border-indigo-500/50' : 'bg-slate-900 border-slate-700 hover:border-slate-500'}`}
          >
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isAiMode ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
              🤖
            </div>
            <div className="flex-1">
              <div className={`font-medium text-sm ${isAiMode ? 'text-indigo-300' : 'text-slate-300'}`}>Gemini AI</div>
              <div className="text-xs text-slate-500">Trợ lý ảo thông minh</div>
            </div>
            {isAiMode && <div className="h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]"></div>}
          </div>
        </div>
      </div>

      {/* CHAT MAIN AREA */}
      <div className="flex flex-1 flex-col bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-900 to-[#0f172a]">
        
        {/* Header */}
        <div className="flex h-16 items-center border-b border-slate-700/50 bg-slate-900/50 px-6 backdrop-blur-md">
            {isAiMode ? (
                 <span className="font-semibold text-indigo-400 flex items-center gap-2">✨ Đang chat với Gemini AI</span>
            ) : targetUser ? (
                 <span className="font-semibold text-slate-100 flex items-center gap-2">🔒 Chatting with: <span className="text-white">{targetUser}</span></span>
            ) : (
                 <span className="text-slate-500 italic">Chưa chọn người nhận</span>
            )}
        </div>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-slate-500 opacity-60">
              <div className="text-6xl mb-4">🛡️</div>
              <p>Tin nhắn được mã hóa đầu cuối (E2E).</p>
              <p className="text-sm">Không ai (kể cả server) đọc được nội dung này.</p>
            </div>
          )}

          {messages.map((msg, index) => {
            const isMe = msg.sender === 'Me';
            return (
              <div key={index} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`group relative max-w-[70%] rounded-2xl px-5 py-3 text-sm shadow-md transition-all ${
                  isMe 
                    ? 'rounded-tr-sm bg-indigo-600 text-white' 
                    : 'rounded-tl-sm bg-slate-700 text-slate-100'
                }`}>
                  <div className={`mb-1 text-[10px] font-bold uppercase tracking-wider opacity-70 ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                    {msg.sender}
                  </div>
                  
                  {msg.content.type === 'TEXT' ? (
                    <p className="leading-relaxed">{msg.content.text}</p>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/20 text-xl">
                        📎
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium truncate max-w-40">{msg.content.fileName}</span>
                        <button 
                            onClick={() => handleDownloadDecrypt(msg.content)}
                            className="text-xs underline opacity-80 hover:opacity-100 text-left"
                        >
                            Tải & Giải mã
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-slate-700/50 bg-slate-900/50 backdrop-blur-md">
          <div className="flex items-center gap-3 rounded-xl bg-slate-800 p-2 ring-1 ring-slate-700 focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
            <button 
                onClick={() => fileInputRef.current.click()}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition"
            >
              📎
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
            />
            
            <input 
              className="flex-1 bg-transparent px-2 text-sm text-white placeholder-slate-500 focus:outline-none"
              placeholder="Nhập tin nhắn..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSend()}
            />
            
            <button 
                onClick={handleSend}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 active:scale-95 transition"
            >
              Gửi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;