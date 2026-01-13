import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

const AttackConsole = ({ clientRef, user }) => {
    const [capturedPackets, setCapturedPackets] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [savedForRollback, setSavedForRollback] = useState(null);

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
        }, ...prev].slice(0, 10));
    };

    const runAttack = async (type, packet) => {
        // Stub for Rollback Button compatibility, essentially redirects to manual inject if needed
        // But for Rollback specifically we need the old packet:
        if (type === 'ROLLBACK' && packet) {
            loadIntoEditor(packet);
            toast.info("Đã nạp gói tin cũ vào Editor. Hãy nhấn INJECT để tấn công!");
        }
    };

    const loadIntoEditor = (packet) => {
        if (packet.isOutgoing) {
            toast.warn("⚠️ Đây là tin nhắn GỬI ĐI! Bạn không thể dùng nó để tấn công ngược lại chính mình (vì khác chìa khóa mã hóa). Hãy chọn tin nhắn ĐẾN (Incoming).", { autoClose: 5000 });
        }
        setEditSender(packet.sender);
        setEditHeader(packet.header); // Pretty print for easier editing
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

    if (!isOpen) return (
        <button onClick={() => setIsOpen(true)} className="fixed bottom-6 right-6 bg-red-600 text-white px-6 py-4 rounded-full shadow-2xl z-[9999] hover:bg-red-500 hover:scale-105 transition-all duration-300 border-4 border-red-400 flex items-center gap-3 animate-bounce">
            <div className="text-2xl">🐞</div>
            <span className="font-bold text-lg tracking-wider">HACKER LAB</span>
        </button>
    );

    return (
        <div className="fixed bottom-4 right-4 w-[500px] h-[600px] bg-slate-900/95 border border-red-500/50 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col backdrop-blur-md transition-all animate-in slide-in-from-bottom-10 fade-in duration-300 font-mono">

            <div className="bg-gradient-to-r from-red-900 to-slate-900 text-red-100 p-3 flex justify-between items-center border-b border-red-500/30">
                <span className="font-bold flex items-center gap-2">⚠️ MANUAL ATTACK LAB</span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setEditorMode(!editorMode)}
                        className={`text-xs px-2 py-1 rounded ${editorMode ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300'}`}
                    >
                        {editorMode ? 'View Sniffer' : 'Open Editor'}
                    </button>
                    <button onClick={() => setIsOpen(false)} className="hover:text-white hover:bg-red-500/20 rounded w-6 h-6 flex items-center justify-center">✕</button>
                </div>
            </div>

            <div className="flex-1 p-3 overflow-y-auto scrollbar-thin scrollbar-thumb-red-900 scrollbar-track-transparent">

                {editorMode ? (
                    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
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
                            <p className="text-[10px] text-slate-500 mt-1">Try modifying 'N' (counter) or 'ivGov'...</p>
                        </div>

                        <div>
                            <label className="text-xs text-red-300 font-bold block mb-1">Ciphertext (Base64 Payload)</label>
                            <textarea
                                value={editCiphertext}
                                onChange={(e) => setEditCiphertext(e.target.value)}
                                className="w-full h-32 bg-black/40 border border-slate-700 rounded p-2 text-cyan-500 text-xs font-mono focus:border-red-500 focus:outline-none break-all"
                                spellCheck="false"
                            />
                            <p className="text-[10px] text-slate-500 mt-1">Try changing a few characters to break integrity...</p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-4">
                            <button
                                onClick={handleManualInject}
                                className="col-span-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded shadow-lg shadow-red-900/40 active:scale-95 transition-all text-sm uppercase tracking-wider"
                            >
                                🚀 INJECT PACKET
                            </button>
                            <button
                                onClick={() => {
                                    try {
                                        const h = JSON.parse(editHeader);
                                        h.N = (h.N || 0) + 50000; // Increment by 50,000 for massive lag
                                        setEditHeader(JSON.stringify(h, null, 2));
                                        toast.warning("💣 Đã chỉnh N cực lớn (+50,000). Nhấn INJECT và quan sát thời gian xử lý!");
                                    } catch (e) { toast.error("Header lỗi JSON"); }
                                }}
                                className="col-span-1 bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 rounded shadow-lg shadow-yellow-900/40 active:scale-95 transition-all text-sm uppercase tracking-wider flex flex-col items-center justify-center leading-tight"
                            >
                                <span>💥 DoS ATTACK</span>
                                <span className="text-[9px] opacity-80">(Heavy Load)</span>
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

                        {capturedPackets.length === 0 && (
                            <div className="text-center py-10 text-slate-500 text-sm flex flex-col items-center gap-4">
                                <p>
                                    📡 Sniffer đang chạy...<br />
                                    Chưa có gói tin MỚI nào.<br />
                                    <span className="text-xs opacity-70">(Lịch sử chat cũ không chứa gói tin gốc)</span>
                                </p>
                                <div className="animate-pulse text-yellow-500 font-bold">
                                    👉 Hãy nhắn tin cho ai đó ngay bây giờ!
                                </div>
                                <div className="text-xs text-slate-600">- HOẶC -</div>
                                <button
                                    onClick={() => setCapturedPackets([{
                                        timestamp: new Date().toLocaleTimeString(),
                                        sender: "BOT_SIMULATION",
                                        header: JSON.stringify({ vGov: "Mock", N: 123, ivGov: "MockIV", dh: {} }, null, 2),
                                        ciphertext: "U2ltdWxhdGVkRW5jcnlptGVkRGF0YQ==",
                                        id: crypto.randomUUID()
                                    }])}
                                    className="bg-slate-800 hover:bg-slate-700 text-indigo-300 px-4 py-2 rounded border border-indigo-500/30 transition-all text-xs"
                                >
                                    ⚡ Tạo gói tin giả lập (Demo)
                                </button>
                            </div>
                        )}

                        {capturedPackets.map((p, idx) => (
                            <div key={p.id} className="mb-3 bg-slate-800/50 p-2 rounded border border-slate-700/50 hover:border-red-500/30 transition-colors group">
                                <div className="flex justify-between text-indigo-300 mb-1 text-xs">
                                    <span className="font-bold">FROM: {p.sender}</span>
                                    <span className="opacity-50">{p.timestamp}</span>
                                </div>
                                <div className="bg-black/30 p-1.5 rounded text-[10px] text-slate-500 break-all h-6 overflow-hidden mb-2 pointer-events-none group-hover:text-slate-300 transition-all">
                                    {p.ciphertext}
                                </div>

                                <button
                                    onClick={() => loadIntoEditor(p)}
                                    className="w-full bg-slate-700 hover:bg-indigo-600 text-white py-1 text-xs rounded transition-colors flex items-center justify-center gap-1"
                                >
                                    <span>📝</span> Load into Editor (MITM)
                                </button>
                                <button
                                    onClick={() => setSavedForRollback(p)}
                                    className="w-full bg-blue-900/40 hover:bg-blue-800/60 text-blue-200 py-1 text-xs rounded transition-colors flex items-center justify-center gap-1 mt-1"
                                >
                                    <span>�</span> Snapshot for Rollback
                                </button>
                            </div>
                        ))}

                        {savedForRollback && (
                            <div className="mt-4 border-t border-red-500/30 pt-4 animate-in fade-in slide-in-from-bottom-2">
                                <h4 className="text-red-400 font-bold mb-2 flex items-center gap-2 text-xs">
                                    <span>💉</span> ATTACK PLANNING
                                </h4>
                                <button onClick={() => runAttack('ROLLBACK', savedForRollback)} className="w-full bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-bold py-3 rounded shadow-lg shadow-red-900/20 active:scale-95 transition-all text-xs">
                                    LOAD OLD SNAPSHOT (ROLLBACK)
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div >
    );
};

export default AttackConsole;
