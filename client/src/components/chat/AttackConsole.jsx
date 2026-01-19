import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { decryptWithGCM, fromBase64 } from '../../crypto/lib';

const AttackConsole = ({ clientRef, user }) => {
    const [capturedPackets, setCapturedPackets] = useState([]);
    const [isOpen, setIsOpen] = useState(false);

    // State cho Attack Labs
    const [savedForRollback, setSavedForRollback] = useState(null); // Cho Replay Attack
    const [forwardSecrecyTarget, setForwardSecrecyTarget] = useState(null); // Cho Forward Secrecy

    // Manual Editor State
    const [editorMode, setEditorMode] = useState(false);
    const [editHeader, setEditHeader] = useState('');
    const [editCiphertext, setEditCiphertext] = useState('');
    const [editSender, setEditSender] = useState('');

    useEffect(() => {
        if (!user?.socket) {
            console.error("❌ AttackConsole: No socket found in user object!");
            return;
        }

        console.log("✅ AttackConsole: Socket attached", user.socket.id);

        const handleSniffIncoming = (data) => {
            console.log("🐞 Sniffer Captured Incoming:", data);
            addPacket(data.from, data.payload.header, data.payload.ciphertext, false);
        };

        const handleSniffOffline = (msgs) => {
            console.log("🐞 Sniffer Captured Offline:", msgs);
            msgs.forEach(msg => {
                addPacket(msg.from, msg.payload.header, msg.payload.ciphertext, false);
            });
        };

        // Listen for standard events
        user.socket.on('receive_message', handleSniffIncoming);
        user.socket.on('offline_messages', handleSniffOffline);

        return () => {
            console.log("AttackConsole: Cleanup listeners");
            user.socket.off('receive_message', handleSniffIncoming);
            user.socket.off('offline_messages', handleSniffOffline);
        };
    }, [user?.socket]);

    const addPacket = (sender, header, ciphertext, isOutgoing) => {
        setCapturedPackets(prev => [{
            timestamp: new Date().toLocaleTimeString(),
            sender: sender,
            header: typeof header === 'string' ? header : JSON.stringify(header),
            ciphertext: ciphertext,
            id: crypto.randomUUID(),
            isOutgoing
        }, ...prev].slice(0, 50)); // Tăng bộ nhớ diff lên 50 để dễ test
    };

    const loadIntoEditor = (packet) => {
        if (packet.isOutgoing) {
            toast.warn("⚠️ Đây là tin nhắn GỬI ĐI! Bạn không thể dùng nó để tấn công ngược lại chính mình (vì khác chìa khóa mã hóa). Hãy chọn tin nhắn ĐẾN (Incoming).", { autoClose: 5000 });
        }
        setEditSender(packet.sender);
        try {
            const headerObj = typeof packet.header === 'string' ? JSON.parse(packet.header) : packet.header;
            setEditHeader(JSON.stringify(headerObj, null, 4));
        } catch (e) {
            setEditHeader(packet.header);
        }
        setEditCiphertext(packet.ciphertext);
        setEditorMode(true);
    };

    const handleManualInject = async () => {
        if (!clientRef.current) return;
        const toastId = toast.loading(`💉 Đang Inject gói tin thủ công...`);

        try {
            // Convert Base64 Ciphertext back to ArrayBuffer
            const binary_string = window.atob(editCiphertext);
            const len = binary_string.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) { bytes[i] = binary_string.charCodeAt(i); }
            const ciphertextBuffer = bytes.buffer;

            // Direct Injection
            const start = performance.now(); // Start timer
            try {
                await clientRef.current.receiveMessage(editSender, [editHeader, ciphertextBuffer]);
                const duration = (performance.now() - start).toFixed(0);
                toast.update(toastId, { render: `😱 THẤT BẠI: Hệ thống đã CHẤP NHẬN gói tin giả mạo! (+${duration}ms)`, type: "error", isLoading: false, autoClose: 5000 });
            } catch (e) {
                const duration = (performance.now() - start).toFixed(0);
                console.log("Attack Blocked:", e);
                let message = e.message;

                // Map common errors
                if (message.includes("Unexpected token")) message = "JSON Error: Header không hợp lệ";
                if (message.includes("The string to be decoded is not correctly encoded")) message = "Base64 Error: Ciphertext lỗi";
                if (message.includes("Message already processed")) message = "Phát hiện tin nhắn cũ (Replay/Old)";
                if (message.includes("Decryption failed")) message = "Integrity Check Failed (HMAC mismatch)";
                if (message.includes("Unknown user certificate")) message = "Không tìm thấy User/Cert";

                toast.update(toastId, {
                    render: `🛡️ ĐÃ CHẶN ĐỨNG!\n💥 CPU Time: ${duration}ms\nLỗi: "${message}"`,
                    type: "success",
                    isLoading: false,
                    autoClose: 8000
                });
            }
        } catch (setupError) {
            console.error(setupError);
            toast.dismiss(toastId);
        }
    };

    // State cho Manual Decrypt (Raw Tool)
    const [leakedKeys, setLeakedKeys] = useState([]);

    // 4 Nguyên liệu cần thiết cho AES-GCM
    const [rawKey, setRawKey] = useState('');
    const [rawCiphertext, setRawCiphertext] = useState('');
    const [rawIV, setRawIV] = useState('');
    const [rawAAD, setRawAAD] = useState('');

    const [manualDecryptResult, setManualDecryptResult] = useState(null);

    // Khi chọn mục tiêu, tự động điền các thông số vào Raw Tool để tiện thao tác (nhưng user vẫn sửa được)
    useEffect(() => {
        if (forwardSecrecyTarget) {
            setRawCiphertext(forwardSecrecyTarget.ciphertext);
            setRawAAD(forwardSecrecyTarget.header);
            try {
                const h = JSON.parse(forwardSecrecyTarget.header);
                setRawIV(h.receiverIV);
            } catch (e) {
                setRawIV("");
            }
            setManualDecryptResult(null);
            setRawKey(""); // Reset key để user tự paste
        }
    }, [forwardSecrecyTarget]);

    // --- FORWARD SECRECY TEST LOGIC (MANUAL) ---
    const handleLeakKeys = async () => {
        if (!forwardSecrecyTarget || !clientRef.current) return;

        const sender = forwardSecrecyTarget.sender;
        const currentState = clientRef.current.conns[sender];
        const debugOldKeys = clientRef.current.debugOldKeys || [];

        if (!currentState) {
            toast.error("Không tìm thấy session nào!");
            return;
        }

        const keys = [];
        const { subtle } = window.crypto;

        // 1. Lấy Keys cũ từ Backdoor (Message Keys)
        const relevantOldKeys = debugOldKeys.filter(k => k.sender === sender);
        for (const k of relevantOldKeys) {
            keys.push({
                type: `🔑 OLD MESSAGE KEY (${k.msgPreview})`,
                val: k.key,
                group: 'old'
            });
        }

        const exportKey = async (k) => {
            const exported = await subtle.exportKey("jwk", k);
            return exported.k; // Lấy raw key value (Base64Url)
        }

        if (currentState.CKr) {
            keys.push({
                type: '⛓️ CURRENT CHAIN KEY (Future Msgs)',
                val: await exportKey(currentState.CKr),
                group: 'current'
            });
        }
        for (const [idx, key] of Object.entries(currentState.skippedKeys)) {
            keys.push({ type: `Skipped Key [${idx}]`, val: await exportKey(key) });
        }

        setLeakedKeys(keys);
        toast.warning(`WARNING: Đã trộm được ${keys.length} chìa khóa từ bộ nhớ!`);
    };

    const handleTryDecryptRaw = async () => {
        setManualDecryptResult(null);
        try {
            if (!rawKey || !rawCiphertext || !rawIV) {
                toast.error("Vui lòng điền đủ Key, IV và Ciphertext!");
                return;
            }

            console.log("🛠️ Raw Decrypt Attempt:");
            console.log("Key:", rawKey);
            console.log("IV:", rawIV);
            console.log("AAD:", rawAAD);

            // 1. Prepare Key
            const { subtle } = window.crypto;
            let keyBuffer;
            try {
                const base64 = rawKey.replace(/-/g, '+').replace(/_/g, '/');
                const binary_string = window.atob(base64);
                const len = binary_string.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) { bytes[i] = binary_string.charCodeAt(i); }
                keyBuffer = bytes.buffer;
            } catch (e) {
                throw new Error("Key không hợp lệ (Base64 Error)");
            }

            const key = await subtle.importKey("raw", keyBuffer, "AES-GCM", true, ["decrypt"]);

            // 2. Prepare Data
            const iv = fromBase64(rawIV);
            const ciphertext = fromBase64(rawCiphertext);

            // 3. Decrypt
            const plaintextBuffer = await decryptWithGCM(key, ciphertext, iv, rawAAD);
            const plaintext = new TextDecoder().decode(plaintextBuffer);

            setManualDecryptResult({ success: true, msg: `🔓 MỞ KHÓA THÀNH CÔNG: "${plaintext}"` });
        } catch (e) {
            console.error("Decryption Error:", e);
            setManualDecryptResult({
                success: false,
                msg: `❌ CRITICAL ERROR: ${e.message ? `[${e.name}] ${e.message}` : e.toString()}`
            });
        }
    };


    if (!isOpen) return (
        <button onClick={() => setIsOpen(true)} className="fixed bottom-6 right-6 bg-red-600 text-white px-6 py-4 rounded-full shadow-2xl z-[9999] hover:bg-red-500 hover:scale-105 transition-all duration-300 border-4 border-red-400 flex items-center gap-3 animate-bounce">
            <div className="text-2xl">🐞</div>
            <span className="font-bold text-lg tracking-wider">HACKER LAB</span>
        </button>
    );

    return (
        <div className="fixed bottom-4 right-4 w-[500px] h-[650px] bg-slate-900/95 border border-red-500/50 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col backdrop-blur-md transition-all animate-in slide-in-from-bottom-10 fade-in duration-300 font-mono">

            <div className="bg-gradient-to-r from-red-900 to-slate-900 text-red-100 p-3 flex justify-between items-center border-b border-red-500/30">
                <span className="font-bold flex items-center gap-2">⚠️ MANUAL ATTACK LAB</span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setEditorMode(!editorMode)}
                        className={`text-xs px-2 py-1 rounded ${editorMode ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300'}`}
                    >
                        {editorMode ? 'Sniffer' : 'Editor'}
                    </button>
                    <button onClick={() => setIsOpen(false)} className="hover:text-white hover:bg-red-500/20 rounded w-6 h-6 flex items-center justify-center">✕</button>
                </div>
            </div>

            <div className="flex-1 p-3 overflow-y-auto scrollbar-thin scrollbar-thumb-red-900 scrollbar-track-transparent">

                {editorMode ? (
                    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                        {/* EDITOR UI GIỮ NGUYÊN */}
                        <div>
                            <label className="text-xs text-red-300 font-bold block mb-1">Target Identity (Sender ID)</label>
                            <input
                                value={editSender}
                                onChange={(e) => setEditSender(e.target.value)}
                                className="w-full bg-black/40 border border-slate-700 rounded p-2 text-green-400 text-sm focus:border-red-500 focus:outline-none"
                            />
                        </div>

                        <div>
                            <label className="text-xs text-red-300 font-bold block mb-1">Header (Cleartext JSON)</label>
                            <textarea
                                value={editHeader}
                                onChange={(e) => setEditHeader(e.target.value)}
                                className="w-full h-32 bg-black/40 border border-slate-700 rounded p-2 text-yellow-500 text-xs font-mono focus:border-red-500 focus:outline-none"
                                spellCheck="false"
                            />
                        </div>

                        <div>
                            <label className="text-xs text-red-300 font-bold block mb-1">Ciphertext (Base64 Payload)</label>
                            <textarea
                                value={editCiphertext}
                                onChange={(e) => setEditCiphertext(e.target.value)}
                                className="w-full h-32 bg-black/40 border border-slate-700 rounded p-2 text-cyan-500 text-xs font-mono focus:border-red-500 focus:outline-none break-all"
                                spellCheck="false"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-4">
                            <button
                                onClick={handleManualInject}
                                className="col-span-2 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded shadow-lg shadow-red-900/40 active:scale-95 transition-all text-sm uppercase tracking-wider"
                            >
                                🚀 INJECT PACKET
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="mb-4 bg-slate-950/50 p-3 rounded border border-slate-800">
                            <h4 className="text-yellow-500 font-bold mb-1 flex items-center gap-2 text-xs">
                                <span className="block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                LIVE TRAFFIC SNIFFER
                            </h4>
                            <p className="text-slate-500 text-[10px]">Capturing end-to-end encrypted traffic...</p>
                        </div>

                        {/* DANH SÁCH PACKET */}
                        {capturedPackets.length === 0 && (
                            <div className="text-center py-10 text-slate-500/50 italic text-xs">Waiting for messages...</div>
                        )}

                        {capturedPackets.map((p, idx) => (
                            <div key={p.id} className="mb-3 bg-slate-800/50 p-2 rounded border border-slate-700/50 hover:border-red-500/30 transition-colors group">
                                <div className="flex justify-between text-indigo-300 mb-1 text-xs">
                                    <span className="font-bold">FROM: {p.sender}</span>
                                    <span className="opacity-50">{p.timestamp}</span>
                                </div>
                                <div className="bg-black/30 p-1.5 rounded text-[10px] text-slate-500 break-all h-6 overflow-hidden mb-2 pointer-events-none">
                                    {p.ciphertext.substring(0, 50)}...
                                </div>

                                <div className="grid grid-cols-2 gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => loadIntoEditor(p)}
                                        className="col-span-2 bg-slate-700 hover:bg-indigo-600 text-white py-1 text-xs rounded mb-1"
                                    >
                                        📝 Load into Editor (MITM)
                                    </button>
                                    <button
                                        onClick={() => setSavedForRollback(p)}
                                        className={`bg-blue-900/40 hover:bg-blue-600 text-blue-200 py-1 text-[10px] rounded ${savedForRollback?.id === p.id ? 'border border-blue-400 text-white bg-blue-600' : ''}`}
                                    >
                                        ⏪ Target Replay
                                    </button>
                                    <button
                                        onClick={() => setForwardSecrecyTarget(p)}
                                        className={`bg-purple-900/40 hover:bg-purple-600 text-purple-200 py-1 text-[10px] rounded ${forwardSecrecyTarget?.id === p.id ? 'border border-purple-400 text-white bg-purple-600' : ''}`}
                                    >
                                        🔐 Target F.Secrecy
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* CONTROL PANEL CHO CÁC KỊCH BẢN TẤN CÔNG */}
                        <div className="mt-4 border-t border-red-500/30 pt-4 space-y-4">

                            {/* REPLAY ATTACK PANEL */}
                            {savedForRollback && (
                                <div className="bg-blue-900/20 p-2 rounded border border-blue-500/30">
                                    <h5 className="text-blue-300 text-xs font-bold mb-1">REPLAY ATTACK SETUP</h5>
                                    <p className="text-[10px] text-slate-400 mb-2">Đã lưu gói tin cũ (Timestamp: {savedForRollback.timestamp}). Thử gửi lại để xem hệ thống có nhận không.</p>
                                    <button onClick={() => loadIntoEditor(savedForRollback)} className="w-full bg-blue-700 hover:bg-blue-600 text-white py-2 rounded text-xs font-bold">
                                        LOAD TO REPLAY
                                    </button>
                                </div>
                            )}

                            {/* FORWARD SECRECY PANEL (RAW TOOL) */}
                            {forwardSecrecyTarget && (
                                <div className="bg-purple-900/20 p-2 rounded border border-purple-500/30 animate-in slide-in-from-bottom-2">
                                    <div className="flex justify-between items-center mb-2">
                                        <h5 className="text-purple-300 text-xs font-bold">🛠️ RAW DECRYPTOR WORKBENCH</h5>
                                        <button
                                            onClick={handleLeakKeys}
                                            className="bg-red-900/50 hover:bg-red-600 border border-red-500/50 text-white text-[9px] px-2 py-1 rounded"
                                        >
                                            🔥 DUMP RAM KEYS
                                        </button>
                                    </div>

                                    {/* KHU VỰC HIỂN THỊ KEY LEAK */}
                                    {leakedKeys.length > 0 && (
                                        <div className="mb-4 space-y-1 bg-black/40 p-2 rounded border border-red-500/30">
                                            <div className="text-[9px] text-red-400 font-bold mb-1">⚠️ LEAKED KEYS (CLICK TO COPY)</div>
                                            <div className="max-h-32 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-purple-900">
                                                {leakedKeys.map((k, i) => (
                                                    <div key={i} className="group relative">
                                                        <div className={`text-[9px] font-bold ${k.group === 'old' ? 'text-green-400' : 'text-orange-400'}`}>
                                                            {k.type}
                                                        </div>
                                                        <div
                                                            className={`text-[10px] font-mono p-1 rounded break-all cursor-pointer transition-colors border ${k.group === 'old' ? 'bg-green-900/20 text-green-200 border-green-500/30 hover:bg-green-800/50' : 'bg-red-900/40 text-red-200 border-red-500/30 hover:bg-red-800/50'}`}
                                                            onClick={() => {
                                                                setRawKey(k.val);
                                                                toast.success("Copied Key!");
                                                            }}
                                                            title={k.type}
                                                        >
                                                            {k.val.substring(0, 30)}...
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* RAW INPUT FORM */}
                                    <div className="space-y-2">
                                        <div>
                                            <label className="text-[9px] text-purple-400 block font-bold">KEY (Base64)</label>
                                            <input
                                                value={rawKey}
                                                onChange={e => setRawKey(e.target.value)}
                                                className="w-full bg-black/60 border border-purple-500/30 rounded p-1 text-[10px] text-white font-mono"
                                                placeholder="Paste key here..."
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-[9px] text-purple-400 block font-bold">IV (Base64)</label>
                                                <input
                                                    value={rawIV}
                                                    onChange={e => setRawIV(e.target.value)}
                                                    className="w-full bg-black/60 border border-purple-500/30 rounded p-1 text-[10px] text-zinc-400 font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] text-purple-400 block font-bold">AAD Header (Raw)</label>
                                                <input
                                                    value={rawAAD}
                                                    onChange={e => setRawAAD(e.target.value)}
                                                    className="w-full bg-black/60 border border-purple-500/30 rounded p-1 text-[10px] text-zinc-400 font-mono"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-[9px] text-purple-400 block font-bold">Ciphertext (Base64)</label>
                                            <textarea
                                                value={rawCiphertext}
                                                onChange={e => setRawCiphertext(e.target.value)}
                                                className="w-full h-12 bg-black/60 border border-purple-500/30 rounded p-1 text-[10px] text-zinc-400 font-mono scrollbar-thin"
                                            />
                                        </div>

                                        <button
                                            onClick={handleTryDecryptRaw}
                                            className="w-full bg-purple-700 hover:bg-purple-600 text-white py-2 rounded text-xs font-bold shadow-lg shadow-purple-900/50"
                                        >
                                            🔓 DECRYPT WITH RAW PARAMS
                                        </button>

                                        {manualDecryptResult && (
                                            <div className={`p-2 rounded text-xs font-bold text-center border animate-in zoom-in ${manualDecryptResult.success ? 'bg-green-900/80 border-green-500 text-green-100' : 'bg-red-900/80 border-red-500 text-red-100'}`}>
                                                {manualDecryptResult.msg}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                    </>
                )}
            </div>
        </div >
    );
};

export default AttackConsole;
