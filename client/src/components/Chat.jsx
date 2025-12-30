import { useEffect, useState, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientContext } from '../App';
import axios from 'axios';
import { encryptFile, decryptFile, toBase64,
  fromBase64, encryptWithGCM, genRandomSalt, decryptWithGCM,
  verifyWithECDSA} from '../crypto/lib';
import { CA_PUBLIC_KEY } from '../config';
import io from 'socket.io-client';
import { deriveKeyFromPassword } from '../utils';
import { MessengerClient } from '../crypto/messenger';

const Chat = () => {
  const { clientRef, user, setUser } = useContext(ClientContext);
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [targetUser, setTargetUser] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [isAiMode, setIsAiMode] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Tự động đăng nhập khi F5
  useEffect(() => {
    // Nếu đã có user (đăng nhập rồi), hoặc đang khôi phục thì thôi
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
        //  Kết nối lại Socket
        const socket = io('http://localhost:8001');
        
        // Gửi lệnh login để lấy lại Keychain từ server
        socket.emit('login_token', { token: savedToken });

        // Xử lý phản hồi (Dùng Promise để await cho gọn)
        await new Promise((resolve, reject) => {
          socket.on('login_success', async (data) => {
            try {
              const jwk = JSON.parse(savedKeyJson);
              const pwKey = await window.crypto.subtle.importKey(
                  "jwk", jwk,
                  { name: "AES-GCM", length: 256 },
                  true, ["encrypt", "decrypt"]
              );

              // Giải mã Keychain bằng pwKey vừa khôi phục
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
              await client.deserializeState(keychainJSON);
              clientRef.current = client;

              // Cập nhật lại Context
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
          // Timeout sau 5s nếu server không trả lời
          setTimeout(() => reject("Timeout"), 5000);
        });

        setIsRestoring(false);
        console.log("✅ Khôi phục thành công!");

      } catch (err) {
        console.error("Khôi phục thất bại:", err);
        sessionStorage.clear(); // Xóa session lỗi
        navigate('/login');
      }
    };

    restoreSession();
  }, [user, navigate]); // Chỉ chạy khi user thay đổi (null -> có)

  // Auto scroll khi có tin nhắn mới
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [messages]);

  // ĐỒNG BỘ KEYCHAIN
  const saveRatchetState = async () => {
    if(!clientRef.current || !user?.pwKey) return;

    try {
      // Serialize trạng thái hiện tại của MessagerClient
      const keychainRaw = await clientRef.current.serializeState();

      // Mã hóa bằng key đăng nhập của user (pwKey từ login)
      const iv = genRandomSalt(12);
      const encryptKeychainBuffer = await encryptWithGCM(user.pwKey, keychainRaw, iv);

      // Đóng gói
      const encryptedKeychainPkg = JSON.stringify({
        iv: toBase64(iv),
        data: toBase64(new Uint8Array(encryptKeychainBuffer)),
        salt: toBase64(user.salt)
      });

      // Gửi lên server để update state
      user.socket.emit('update_keychain', { 
          username: user.username, 
          encryptedKeychain: encryptedKeychainPkg 
      });
      console.log("🔒 Ratchet State Saved!");
    } catch (error) {
      console.error("Lỗi lưu Keychain:", error);
    }
  };

  // --- LẮNG NGHE SỰ KIỆN TỪ SERVER ---
  useEffect(() => {
    if (!user?.socket) return;

    // Nhận tin nhắn E2E
    user.socket.on('receive_message', async (data) => {
      try {
        // Handshake: Nếu chưa có Cert (publickey) của người gửi, phải lấy ngay
        if (!clientRef.current.certs[data.from]) {
           await fetchAndImportCert(data.from);
        }

        // GIẢI MÃ: Double Ratchet xử lý (messenger.js)
        const plaintext = await clientRef.current.receiveMessage(
          data.from, 
          [data.payload.header, data.payload.ciphertext]
        );

        // Parse nội dung (Text hoặc File JSON)
        let content;
        try {
          const jsonContent = JSON.parse(plaintext);
          content = jsonContent.type ? jsonContent : { type: 'TEXT', text: plaintext };
        } catch {
          content = { type: 'TEXT', text: plaintext };
        }

        setMessages(prev => [...prev, { sender: data.from, content }]);
        
        // Lưu trạng thái Ratchet mới ngay sau khi nhận tin
        await saveRatchetState();
      } catch (err) {
        console.error("Lỗi giải mã tin nhắn đến:", err);
      }
    });

    // Nhận tin nhắn cũ (offline messages) khi vừa mới login
    user.socket.on('offline_messages', async (msgs) => {
      console.log(`Đang tải ${msgs.length} tin nhắn offline...`);
      for(const msg of msgs) {
        try {
          if (!clientRef.current.certs[msg.from]) {
            await fetchAndImportCert(msg.from);
          }
          const plaintext = await clientRef.current.receiveMessage(
            msg.from, 
            [msg.payload.header, msg.payload.ciphertext]
          );
          let content;
          try {
            const jsonContent = JSON.parse(plaintext);
            content = jsonContent.type ? jsonContent : { type: 'TEXT', text: plaintext };
          } catch {
            content = { type: 'TEXT', text: plaintext };
          }
          setMessages(prev => [...prev, { sender: msg.from, content }]);
        } catch (error) {
          console.error("Lỗi giải mã tin offline:", e);
        }
      }
      // Xử lý xong hết offline message thì lưu state 1 lần
      if(msgs.length > 0) await saveRatchetState();
    });
    
    // Nhận tin từ AI
    user.socket.on('ai_response', (data) => {
      setMessages(prev => [...prev, { sender: 'Gemini AI', content: { type: 'TEXT', text: data.text } }]);
    });

    return () => {
      user.socket.off('receive_message');
      user.socket.off('offline_messages');
      user.socket.off('ai_response');
    };
  }, [user]);

  // --- CÁC HÀM HỖ TRỢ (HANDSHAKE & FILE) ---
  const fetchAndImportCert = async (targetUsername) => {
    return new Promise((resolve, reject) => {
      // Emit sự kiện lấy certificate (Cần server hỗ trợ sự kiện này hoặc dùng API)
      user.socket.emit('get_certificate', targetUsername, async (response) => {
        // response: { username, pk } (pk là JWK)
        if (!response || !response.pk || !response.signature) {
            alert(`⚠️ CẢNH BÁO BẢO MẬT: Không nhận được chứng chỉ hợp lệ của ${targetUsername}.`);
            return resolve(false);
          }

          try {
            console.log(`🔍 Đang xác thực danh tính của ${targetUsername}...`);

            // 2. Tái tạo chuỗi dữ liệu gốc (phải khớp 100% với server)
            // Cấu trúc: { username, pk }
            const certRaw = JSON.stringify({ 
              username: response.username, 
              pk: response.pk 
            });

            // 3. Thực hiện Verify Chữ ký
            const signatureBuffer = fromBase64(response.signature);
            const isValid = await verifyWithECDSA(
              clientRef.current.caPublicKey, // Dùng Key Root để check
              certRaw,
              signatureBuffer
            );

            if (!isValid) {
              // PHÁT HIỆN GIẢ MẠO -> DỪNG NGAY LẬP TỨC
              const msg = `⛔ BÁO ĐỘNG ĐỎ: Phát hiện giả mạo chữ ký của ${targetUsername}! Có thể đang bị tấn công Man-in-the-Middle.`;
              console.error(msg);
              alert(msg);
              return resolve(false);
            }

            console.log("✅ Chữ ký hợp lệ. Tin tưởng Import Key.");

            // 4. Import Key
            const importedKey = await window.crypto.subtle.importKey(
              "jwk", response.pk, 
              { name: "ECDH", namedCurve: "P-384" }, 
              true, []
            );

            clientRef.current.certs[targetUsername] = {
              username: targetUsername,
              pk: importedKey
            };
            resolve(true);

          } catch (e) {
            console.error("Lỗi xác thực:", e);
            reject(e);
          }
      });
    });
  };

  const handleDownloadDecrypt = async (fileContent) => {
    try {
      // 1. Tải file mã hóa từ server
      const response = await fetch(fileContent.url);
      const encryptedBlob = await response.blob();
      
      // 2. Lấy key/iv từ tin nhắn E2E
      const key = fromBase64(fileContent.key);
      const iv = fromBase64(fileContent.iv);
      
      // 3. Giải mã file ở phía Client (Browser)
      const decryptedBlob = await decryptFile(encryptedBlob.arrayBuffer(), key, iv, fileContent.mimeType);
      
      // 4. Tạo link download
      const url = URL.createObjectURL(decryptedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileContent.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
        console.error(e);
        alert("Lỗi tải hoặc giải mã file.");
    }
  }

  // --- 3. GỬI TIN NHẮN (MÃ HÓA & GỬI) ---
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

    // B. Chat E2E - Kiểm tra Handshake
    if (!clientRef.current.certs[targetUser]) {
        try {
            console.log(`Đang lấy Public Key của ${targetUser}...`);
            const success = await fetchAndImportCert(targetUser);
            if(!success) return alert("Không tìm thấy người dùng này!");
        } catch (e) {
            return alert("Lỗi kết nối tới người dùng.");
        }
    }

    let finalContent = input;
    let displayContent = { type: 'TEXT', text: input };

    // C. Xử lý File (nếu có)
    const file = fileInputRef.current?.files[0];
    if (file) {
      try {
          // Mã hóa file cục bộ
          const { encryptedBlob, key, iv, type } = await encryptFile(file);
          
          // Upload file mã hóa lên server (qua REST API cho nhanh)
          const formData = new FormData();
          formData.append('encryptedFile', encryptedBlob, file.name);
          
          const res = await axios.post('http://localhost:8001/api/upload', formData);
          
          // Tạo payload chứa thông tin để giải mã (Key file sẽ được mã hóa E2E)
          const filePayload = {
            type: 'FILE',
            url: res.data.url,
            fileName: file.name,
            mimeType: type,
            key: toBase64(key), // Key AES dùng để giải mã file
            iv: toBase64(iv)
          };
          
          // Chuyển thành string để encryption hàm sendMessage xử lý
          finalContent = JSON.stringify(filePayload);
          displayContent = filePayload;
      } catch (e) {
          console.error(e);
          alert("Upload file thất bại.");
          return;
      }
    }

    // D. Mã hóa E2E & Gửi
    try {
      // 1. MessengerClient thực hiện Ratchet và Mã hóa
      const [header, ciphertext] = await clientRef.current.sendMessage(targetUser, finalContent);

      // 2. Gửi gói tin qua Socket
      user.socket.emit('private_message', {
        to: targetUser,
        header, 
        ciphertext 
      });

      // 3. Cập nhật UI
      setMessages(prev => [...prev, { sender: 'Me', content: displayContent }]);
      setInput('');
      if (fileInputRef.current) fileInputRef.current.value = null;

      // 4. QUAN TRỌNG: Lưu trạng thái Ratchet mới
      await saveRatchetState();

    } catch (err) {
      console.error("Lỗi gửi tin:", err);
      alert("Lỗi mã hóa: " + err.message);
    }
  };

  // --- MÀN HÌNH CHỜ KHI ĐANG KHÔI PHỤC ---
  if (isRestoring || (!user && sessionStorage.getItem('SECURE_CHAT_USER'))) {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-slate-900 text-white">
            <div className="text-center animate-pulse">
                <div className="text-4xl mb-4">🔐</div>
                <p className="text-lg font-semibold text-cyan-400">Đang khôi phục khóa bảo mật...</p>
                <p className="text-xs text-slate-500 mt-2">Vui lòng đợi giây lát</p>
            </div>
        </div>
    );
  }
  return (
    <div className="flex h-screen overflow-hidden bg-slate-900 text-slate-100">
      
      {/* SIDEBAR */}
      <div className="w-80 shrink-0 border-r border-slate-700 bg-slate-800/50 flex flex-col">
        {/* User Profile */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center space-x-3">
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
                        {/* Icon file */}
                        📄
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium truncate max-w-40">{msg.content.fileName}</span>
                        <button 
                            onClick={() => handleDownloadDecrypt(msg.content)}
                            className="text-xs font-bold text-indigo-300 hover:text-indigo-100 underline mt-1 text-left"
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
                title="Gửi file"
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