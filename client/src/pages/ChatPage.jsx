import { useEffect, useState, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientContext } from '../App';
import axios from 'axios';
import { deriveKeyFromPassword } from '../utils';
import {
    encryptFile, decryptFile, toBase64,
    fromBase64, encryptWithGCM, genRandomSalt, decryptWithGCM,
    verifyWithECDSA
} from '../crypto/lib';
import { CA_PUBLIC_KEY, GOV_PUBLIC_KEY } from '../config';
import io from 'socket.io-client';

import { MessengerClient } from '../crypto/messenger';
import { toast } from 'react-toastify';

// Import sub-components
import Sidebar from '../components/chat/Sidebar';
import ChatArea from '../components/chat/ChatArea';
import LockScreen from '../components/chat/LockScreen';
import ConfirmationModal from '../components/chat/ConfirmationModal';

const ChatPage = () => {
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
    const [isLocked, setIsLocked] = useState(false);
    const [unlockPassword, setUnlockPassword] = useState('');
    const [tempData, setTempData] = useState(null);

    // --- UX STATES ---
    const [menuOpenId, setMenuOpenId] = useState(null);
    const [typingUsers, setTypingUsers] = useState(new Set());
    const [chatStatus, setChatStatus] = useState({});
    const [isLoadingChat, setIsLoadingChat] = useState(false);

    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const syncTimeoutRef = useRef(null);
    const prevActiveContactRef = useRef(null);

    const activeMessages = activeContact ? (conversations[activeContact] || []) : [];

    // ==================== AUTO LOGIN (PORT 8001) ====================
    useEffect(() => {
        if (user?.socket || isRestoring) return;

        const restoreSession = async () => {
            const savedToken = sessionStorage.getItem('AUTH_TOKEN');
            const savedKeyJson = sessionStorage.getItem('ENC_KEY');

            if (!savedToken) {
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
                        // Trường hợp 1: Có sẵn Key trong Session (F5) -> Tự động vào luôn
                        if (savedKeyJson) {
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
                                setIsRestoring(false);
                                return resolve();
                            } catch (e) {
                                console.warn("Session Key không hợp lệ, chuyển sang nhập tay.", e);
                            }
                        }

                        // Trường hợp 2: Không có Key (hoặc lỗi) -> Hiện màn hình khóa
                        setTempData({
                            keychainDump: data.keychainDump,
                            username: data.username,
                            socket: socket,
                            token: savedToken
                        });
                        setIsLocked(true);
                        setIsRestoring(false);
                        resolve();
                    });
                    socket.on('login_error', (err) => { reject(err); });
                    setTimeout(() => reject(new Error("Timeout")), 5000);
                });
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
                setTimeout(() => setIsHistoryLoaded(true), 3000); // Timeout
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

                // Sync lên server (backup)
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
        // Nếu thay đổi contact hoặc đang loading, dùng behavior auto để nhảy ngay xuống cuối
        const isSwitching = prevActiveContactRef.current !== activeContact;
        const behavior = isSwitching || isLoadingChat ? "auto" : "smooth";

        // Chỉ scroll nếu không đang trong trạng thái loading (hoặc nếu muốn scroll ngầm thì bỏ check này)
        // Ở đây ta scroll luôn, vì nếu đang loading thì div MessageList bị ẩn, nhưng scroll vẫn có tác dụng khi hiện lại
        messagesEndRef.current?.scrollIntoView({ behavior });

        if (activeContact && activeContact !== 'Gemini AI' && user?.socket) {
            user.socket.emit('msg_seen_status', { to: activeContact });
            setUnread(prev => ({ ...prev, [activeContact]: 0 }));
        }

        // Update ref sau khi logic chạy xong
        if (!isLoadingChat) {
            prevActiveContactRef.current = activeContact;
        }
    }, [conversations, activeContact, user?.socket, isLoadingChat]);

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
        // Xử lý các lệnh điều khiển (CMD) - Thay vì hiển thị
        if (content.type === 'CMD') {
            setConversations(prev => {
                const currentList = [...(prev[sender] || [])];
                const targetIndex = currentList.findIndex(m => m.id === content.targetId);

                if (targetIndex !== -1) {
                    if (content.cmd === 'REVOKE') {
                        currentList[targetIndex] = { ...currentList[targetIndex], isDeleted: true, content: { type: 'TEXT', text: 'Checking...' } };
                    } else if (content.cmd === 'REACTION') {
                        const msg = currentList[targetIndex];
                        const reactions = { ...(msg.reactions || {}) }; // Deep copy
                        // Toggle reaction
                        if (reactions[sender] === content.emoji) delete reactions[sender];
                        else reactions[sender] = content.emoji;

                        currentList[targetIndex] = { ...msg, reactions };
                    }
                }
                return { ...prev, [sender]: currentList };
            });
            return; // Không notify tin nhắn CMD
        }

        setConversations(prev => {
            const currentList = prev[sender] || [];
            // Tránh duplicate nếu mạng lag
            if (content.id && currentList.some(m => m.id === content.id)) return prev;
            return { ...prev, [sender]: [...currentList, { sender, content, id: content.id, reactions: {} }] };
        });

        if (sender !== activeContact) {
            setUnread(prev => ({ ...prev, [sender]: (prev[sender] || 0) + 1 }));

            const previewText = content.type === 'FILE' ? 'đã gửi một tệp tin 📁' : (content.text.length > 30 ? content.text.substring(0, 30) + '...' : content.text);
            toast(
                <div className="flex items-center gap-3 w-full" onClick={() => setActiveContact(sender)}>
                    <div className="h-10 w-10 min-w-[2.5rem] rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-md">
                        {sender.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <span className="font-bold text-indigo-300 truncate">{sender}</span>
                        <span className="text-slate-300 text-xs truncate">{previewText}</span>
                    </div>
                </div>,
                { icon: false, closeButton: false }
            );
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
                try { content = JSON.parse(plaintext).type ? JSON.parse(plaintext) : { type: 'TEXT', text: plaintext, id: crypto.randomUUID() }; }
                catch { content = { type: 'TEXT', text: plaintext, id: crypto.randomUUID() }; }
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
                    try { content = JSON.parse(plaintext).type ? JSON.parse(plaintext) : { type: 'TEXT', text: plaintext, id: crypto.randomUUID() }; }
                    catch { content = { type: 'TEXT', text: plaintext, id: crypto.randomUUID() }; }

                    if (content.type === 'CMD') {
                        handleIncomingMessage(msg.from, content);
                    } else {
                        setConversations(prev => {
                            const list = prev[msg.from] || [];
                            if (content.id && list.some(m => m.id === content.id)) return prev;
                            return { ...prev, [msg.from]: [...list, { sender: msg.from, content, id: content.id }] };
                        });
                        setUnread(prev => ({ ...prev, [msg.from]: (prev[msg.from] || 0) + 1 }));
                    }
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
        } catch (e) { toast.error("❌ Lỗi tải file hoặc giải mã!"); }
    };

    const handleSelectContact = (contactId) => {
        if (contactId === activeContact) return;
        setIsLoadingChat(true);
        setActiveContact(contactId);
        // Fake loading delay để che việc scroll
        setTimeout(() => {
            setIsLoadingChat(false);
        }, 150); // 150ms đủ để render và scroll
    };

    const handleStartChat = (targetUserWrapper) => {
        if (!targetUserWrapper || !user?.socket) return;
        user.socket.emit('check_user', targetUserWrapper, (response) => {
            if (response.exists) {
                if (!conversations[targetUserWrapper]) setConversations(prev => ({ ...prev, [targetUserWrapper]: [] }));
                setUserStatuses(prev => ({ ...prev, [targetUserWrapper]: response.isOnline ? 'ONLINE' : 'OFFLINE' }));
                handleSelectContact(targetUserWrapper); // Use the new handler
            } else { toast.error("🚫 Người dùng không tồn tại!"); }
        });
    };

    // Helper gửi tin nhắn
    const processAndSendMessage = async (contentPayload, uiContent = {}) => {
        if (!user?.socket || !activeContact || !clientRef.current) return;
        try {
            if (!contentPayload.id) {
                const id = crypto.randomUUID();
                if (typeof contentPayload === 'string') {
                    contentPayload = { type: 'TEXT', text: contentPayload, id };
                    uiContent.id = id;
                } else {
                    contentPayload.id = id;
                    uiContent.id = id;
                }
            }

            const payloadStr = JSON.stringify(contentPayload);
            const [headerStr, ciphertext] = await clientRef.current.sendMessage(activeContact, payloadStr);

            user.socket.emit('private_message', {
                to: activeContact,
                header: headerStr,
                ciphertext: toBase64(new Uint8Array(ciphertext))
            });

            if (contentPayload.type !== 'CMD') {
                setConversations(prev => ({
                    ...prev,
                    [activeContact]: [...(prev[activeContact] || []), { sender: 'Me', content: uiContent, id: uiContent.id, reactions: {} }]
                }));
            }
            setChatStatus(prev => ({ ...prev, [activeContact]: 'Đã gửi' }));
        } catch (err) {
            console.error("Send Error:", err);
            toast.error("❌ Lỗi gửi tin nhắn/lệnh!");
        }
    };

    const handleSend = async (textInput, fileInput) => {
        if ((!textInput && !fileInput) || !activeContact) return;

        if (activeContact === 'Gemini AI') {
            const history = conversations['Gemini AI'] || [];
            const recentHistory = history.slice(-50);
            user.socket.emit('ask_ai', { prompt: textInput, history: recentHistory });
            setConversations(prev => ({
                ...prev, 'Gemini AI': [...(prev['Gemini AI'] || []), { sender: 'Me', content: { type: 'TEXT', text: textInput }, id: crypto.randomUUID(), reactions: {} }]
            }));
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

        if (fileInput) {
            try {
                const { encryptedBlob, key, iv, type } = await encryptFile(fileInput);
                const formData = new FormData();
                formData.append('encryptedFile', encryptedBlob, fileInput.name);
                const res = await axios.post('http://localhost:8001/api/upload', formData);
                const filePayload = {
                    type: 'FILE',
                    url: res.data.url,
                    fileName: fileInput.name,
                    mimeType: type,
                    key: toBase64(key),
                    iv: toBase64(iv)
                };
                await processAndSendMessage(filePayload, filePayload);
            } catch (e) {
                console.error(e);
                return toast.error("❌ Upload file thất bại!");
            }
        }

        if (textInput && textInput.trim()) {
            await processAndSendMessage({ type: 'TEXT', text: textInput }, { type: 'TEXT', text: textInput });
        }

        await saveRatchetState();
    };

    const handleMessageAction = async (msgId, action, extra = null) => {
        if (action === 'DELETE_ME') {
            setModalConfig({
                isOpen: true,
                title: 'Xóa tin nhắn?',
                message: 'Tin nhắn này sẽ bị xóa khỏi lịch sử chat trên thiết bị của bạn.',
                type: 'danger',
                onConfirm: () => {
                    setConversations(prev => {
                        const list = [...(prev[activeContact] || [])];
                        return { ...prev, [activeContact]: list.filter(m => m.id !== msgId) };
                    });
                    toast.success("Đã xóa tin nhắn khỏi thiết bị");
                    setModalConfig({ isOpen: false, onConfirm: null });
                }
            });
        } else if (action === 'REVOKE') {
            if (activeContact === 'Gemini AI') return toast.error("Không thể thu hồi tin nhắn với AI");
            setModalConfig({
                isOpen: true,
                title: 'Thu hồi tin nhắn?',
                message: 'Hành động này sẽ xóa tin nhắn ở cả phía bạn và người nhận.',
                type: 'danger',
                onConfirm: async () => {
                    setConversations(prev => {
                        const list = [...(prev[activeContact] || [])];
                        const idx = list.findIndex(m => m.id === msgId);
                        if (idx !== -1) list[idx] = { ...list[idx], isDeleted: true };
                        return { ...prev, [activeContact]: list };
                    });
                    await processAndSendMessage({ type: 'CMD', cmd: 'REVOKE', targetId: msgId }, {});
                    setModalConfig({ isOpen: false, onConfirm: null });
                    toast.success("Đã thu hồi tin nhắn");
                }
            });
        } else if (action === 'REACT') {
            if (activeContact === 'Gemini AI') return;
            setConversations(prev => {
                const list = [...(prev[activeContact] || [])];
                const idx = list.findIndex(m => m.id === msgId);
                if (idx !== -1) {
                    const reactions = { ...(list[idx].reactions || {}) }; // Deep copy reaction object
                    if (reactions['Me'] === extra) delete reactions['Me'];
                    else reactions['Me'] = extra;
                    list[idx] = { ...list[idx], reactions };
                }
                return { ...prev, [activeContact]: list };
            });
            await processAndSendMessage({ type: 'CMD', cmd: 'REACTION', targetId: msgId, emoji: extra }, {});
        }
    };

    // --- MODAL & ACTION HANDLERS ---
    const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', type: 'danger', onConfirm: null });

    const handleLogoutClick = () => {
        setModalConfig({
            isOpen: true,
            title: 'Đăng xuất?',
            message: 'Bạn có chắc chắn muốn đăng xuất khỏi thiết bị này? Key giải mã phiên làm việc sẽ bị xóa.',
            type: 'danger',
            onConfirm: () => {
                if (user?.socket) user.socket.disconnect();
                sessionStorage.clear();
                setUser(null);
                navigate('/login');
                setModalConfig({ isOpen: false, onConfirm: null });
            }
        });
    };

    const handleDeleteChatClick = (targetUser, e) => {
        e.stopPropagation();
        setModalConfig({
            isOpen: true,
            title: `Xóa hội thoại với ${targetUser}?`,
            message: 'Hành động này sẽ xóa lịch sử chat trên máy này. Dữ liệu không thể khôi phục.',
            type: 'danger',
            onConfirm: () => {
                setConversations(prev => { const next = { ...prev }; delete next[targetUser]; return next; });
                if (activeContact === targetUser) setActiveContact(null);
                setMenuOpenId(null);
                setModalConfig({ isOpen: false, onConfirm: null });
                toast.success(`Đã xóa hội thoại với ${targetUser}`);
            }
        });
    };

    const handleUnlock = async (e) => {
        e.preventDefault();
        if (!tempData || !unlockPassword) return;

        try {
            const pkg = JSON.parse(tempData.keychainDump);
            const salt = fromBase64(pkg.salt);
            const iv = fromBase64(pkg.iv);
            const ciphertext = fromBase64(pkg.data);

            // Tái tạo key từ mật khẩu vừa nhập
            const pwKey = await deriveKeyFromPassword(unlockPassword, salt);

            // Thử giải mã
            const keychainBuffer = await decryptWithGCM(pwKey, ciphertext, iv);
            const keychainJSON = new TextDecoder().decode(keychainBuffer);

            // Khôi phục Client
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
                username: tempData.username,
                socket: tempData.socket,
                pwKey,
                salt
            });
            setIsLocked(false);
            setUnlockPassword('');
        } catch (err) {
            console.error(err);
            toast.error("Mật khẩu không đúng hoặc dữ liệu lỗi!");
        }
    };

    if (isRestoring) return <div className="flex h-screen w-full items-center justify-center bg-black text-cyan-500 animate-pulse">ĐANG KHÔI PHỤC PHIÊN...</div>;

    if (isLocked) {
        return <LockScreen isLocked={isLocked} unlockPassword={unlockPassword} setUnlockPassword={setUnlockPassword} handleUnlock={handleUnlock} handleLogout={() => { sessionStorage.clear(); navigate('/login'); }} />;
    }

    if (!user) return null;

    const handleTyping = () => {
        if (!activeContact || activeContact === 'Gemini AI') return;
        user.socket.emit('typing', { to: activeContact });
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => { user.socket.emit('stop_typing', { to: activeContact }); }, 1000);
    };

    return (
        <div className="relative flex h-screen overflow-hidden bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30" onClick={() => { setMenuOpenId(null); }}>
            {/* Background Decor */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-500/30 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
                <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-indigo-500/30 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-32 left-20 w-96 h-96 bg-pink-500/30 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>
            </div>

            <Sidebar
                user={user}
                conversations={conversations}
                activeContact={activeContact}
                onSelectContact={handleSelectContact}
                unread={unread}
                userStatuses={userStatuses}
                typingUsers={typingUsers}
                menuOpenId={menuOpenId}
                setMenuOpenId={setMenuOpenId}
                handleDeleteChatClick={handleDeleteChatClick}
                onStartChat={handleStartChat}
                handleLogoutClick={handleLogoutClick}
            />

            <ChatArea
                activeContact={activeContact}
                activeMessages={activeMessages}
                userStatuses={userStatuses}
                typingUsers={typingUsers}
                chatStatus={chatStatus}
                messagesEndRef={messagesEndRef}
                onSendMessage={handleSend}
                onTyping={handleTyping}
                handleMessageAction={handleMessageAction}
                handleDownloadDecrypt={handleDownloadDecrypt}
                isLoadingChat={isLoadingChat}
            />

            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                onConfirm={modalConfig.onConfirm}
                onCancel={() => setModalConfig({ ...modalConfig, isOpen: false })}
            />
        </div>
    );

};

export default ChatPage;
