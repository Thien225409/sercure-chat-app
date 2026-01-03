import React, { useRef, useState } from 'react';
import EmojiPicker from 'emoji-picker-react';

const ChatInput = ({ activeContact, onSendMessage, onTyping }) => {
    const [input, setInput] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const fileInputRef = useRef(null);

    const handleInputChange = (e) => {
        setInput(e.target.value);
        if (onTyping) onTyping();
    };

    const onEmojiClick = (emojiObject) => {
        setInput(prev => prev + emojiObject.emoji);
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const clearSelectedFile = () => {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = null;
    };

    const handleSendClick = () => {
        if (!input.trim() && !selectedFile) return;
        onSendMessage(input, selectedFile);
        setInput('');
        clearSelectedFile();
        setShowEmoji(false);
    };

    return (
        <div className="p-4 border-t border-white/5 glass relative" onClick={e => e.stopPropagation()}>
            {selectedFile && (
                <div className="absolute bottom-full left-4 mb-2 p-2 bg-slate-800 rounded-lg border border-slate-600 shadow-xl flex items-center gap-3 animate-slideIn max-w-sm">
                    <div className="w-10 h-10 bg-slate-700 rounded flex items-center justify-center text-xl">
                        {selectedFile.type.startsWith('image/') ? '🖼️' : '📄'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{selectedFile.name}</div>
                        <div className="text-xs text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <button onClick={clearSelectedFile} className="p-1 hover:bg-slate-700 rounded-full text-slate-400 hover:text-red-400 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            )}

            <div className="flex gap-3 items-end">
                {showEmoji && (<div className="absolute bottom-20 left-4 z-50 shadow-2xl rounded-2xl overflow-hidden border border-slate-600"><EmojiPicker theme="dark" onEmojiClick={onEmojiClick} searchDisabled={false} width={300} height={400} /></div>)}
                <button onClick={() => setShowEmoji(!showEmoji)} className={`p-2 mb-1 rounded-full transition-all ${showEmoji ? 'text-yellow-400 bg-slate-700' : 'text-slate-400 hover:text-yellow-400 hover:bg-slate-700/50'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
                <button onClick={() => fileInputRef.current.click()} className={`p-2 mb-1 rounded-full transition-all ${selectedFile ? 'text-indigo-400 bg-slate-700/50' : 'text-slate-400 hover:text-indigo-400 hover:bg-slate-700/50'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg></button>
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />

                <textarea
                    rows={1}
                    className="flex-1 bg-slate-900 text-slate-200 rounded-2xl px-5 py-3 outline-none border border-slate-700 focus:border-indigo-500 transition-colors shadow-inner resize-none custom-scrollbar"
                    placeholder={`Nhắn tin tới ${activeContact}...`}
                    value={input}
                    onChange={(e) => {
                        handleInputChange(e);
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendClick();
                            e.target.style.height = 'auto';
                        }
                    }}
                    onFocus={() => setShowEmoji(false)}
                />

                <button onClick={() => { handleSendClick(); document.querySelector('textarea').style.height = 'auto'; }} disabled={!input && !selectedFile} className="p-3 mb-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg transition-transform active:scale-90 disabled:opacity-50 disabled:active:scale-100"><svg className="w-5 h-5 translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg></button>
            </div>
        </div>
    );
};

export default ChatInput;
