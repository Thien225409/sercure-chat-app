import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import twemoji from 'twemoji';

const MessageList = ({
    activeMessages,
    activeContact,
    messagesEndRef,
    chatStatus,
    typingUsers,
    handleDownloadDecrypt,
    handleMessageAction
}) => {
    // Helper to parse emojis in a DOM element
    const parseEmoji = (node) => {
        if (node) twemoji.parse(node, { folder: 'svg', ext: '.svg' });
    };

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {activeMessages.map((msg, i) => {
                const isMe = msg.sender === 'Me';
                const isLast = i === activeMessages.length - 1;
                const isDeleted = msg.isDeleted;

                return (
                    <div key={i} className={`group flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-popIn mb-2`}>
                        <div className="relative max-w-[85%]">
                            {/* Message Bubble */}
                            <div className={`px-5 py-3 shadow-md backdrop-blur-sm transition-all text-sm
                ${isDeleted
                                    ? 'bg-slate-800/50 border border-slate-700 text-slate-500 italic rounded-2xl'
                                    : (isMe
                                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl rounded-br-sm shadow-purple-500/10'
                                        : 'bg-slate-800 text-slate-200 rounded-2xl rounded-bl-sm border border-slate-700 shadow-slate-900/50')
                                }`}>

                                {isDeleted ? (
                                    <span className="flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Tin nhắn đã bị thu hồi</span>
                                ) : (
                                    <>
                                        {msg.content.type === 'TEXT' ? (
                                            <div
                                                className={`prose prose-sm prose-invert max-w-none break-words leading-relaxed`}
                                                ref={parseEmoji} // Parse emojis in text content
                                            >
                                                <ReactMarkdown components={{
                                                    code({ node, inline, className, children, ...props }) {
                                                        return !inline ? (
                                                            <div className="bg-black/30 p-2 rounded-md my-2 overflow-x-auto text-[10px] font-mono border border-white/5">{children}</div>
                                                        ) : (
                                                            <code className="bg-black/20 px-1 py-0.5 rounded text-[10px] font-mono border border-white/5" {...props}>{children}</code>
                                                        )
                                                    },
                                                    p: ({ children }) => <p className="mb-0">{children}</p>
                                                }}>
                                                    {msg.content.text}
                                                </ReactMarkdown>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <div className='bg-black/20 p-2 rounded-lg'>
                                                    {msg.content.mimeType?.startsWith('image/') ? '🖼️' : '📄'}
                                                </div>
                                                <div>
                                                    <div className='text-sm font-bold truncate max-w-[150px]'>{msg.content.fileName}</div>
                                                    <button onClick={() => handleDownloadDecrypt(msg.content)} className="text-xs underline text-indigo-200 hover:text-white mt-1">Tải xuống</button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Reactions Display */}
                                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                            <div className={`absolute -bottom-4 ${isMe ? 'right-0' : 'left-0'} flex -space-x-1 z-10`}>
                                                {Object.entries(msg.reactions).map(([u, emoji], idx) => (
                                                    <div key={idx} className="bg-slate-800 border-2 border-slate-900 rounded-full w-8 h-8 flex items-center justify-center shadow-md animate-popIn" title={u} ref={parseEmoji}>
                                                        {emoji}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Message Actions Menu (Hover) */}
                            {!isDeleted && activeContact !== 'Gemini AI' && (
                                <div className={`absolute top-1/2 -translate-y-1/2 ${isMe ? 'right-full mr-3' : 'left-full ml-3'} flex items-center opacity-0 group-hover:opacity-100 transition-all duration-200 z-20`}>
                                    <div className="flex items-center gap-1.5 bg-slate-800/90 backdrop-blur-md rounded-full shadow-2xl border border-slate-600/50 p-1.5 transform hover:scale-105 transition-transform">
                                        {/* Reactions */}
                                        <div className="flex gap-1 border-r border-slate-600/50 pr-2 mr-1">
                                            {['❤️', '👍', '😂', '😮', '😡', '😭'].map(emoji => (
                                                <button
                                                    key={emoji}
                                                    onClick={(e) => { e.stopPropagation(); handleMessageAction(msg.id, 'REACT', emoji); }}
                                                    className="hover:scale-125 hover:bg-slate-700 rounded-full transition-all p-1.5 text-xl leading-none flex items-center justify-center w-8 h-8"
                                                    ref={parseEmoji}
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                        {isMe && (
                                            <button onClick={(e) => { e.stopPropagation(); handleMessageAction(msg.id, 'REVOKE'); }} className="p-2 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-full transition-colors" title="Thu hồi">
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        )}
                                        <button onClick={(e) => { e.stopPropagation(); handleMessageAction(msg.id, 'DELETE_ME'); }} className="p-2 hover:bg-slate-700 text-slate-400 hover:text-red-400 rounded-full transition-colors" title="Xóa phía tôi">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {isMe && isLast && activeContact !== 'Gemini AI' && (<div className='text-[10px] text-slate-400 mt-2 mr-1 transition-all'>{chatStatus[activeContact] || 'Đã gửi'}</div>)}
                    </div>
                );
            })}
            {typingUsers.has(activeContact) && activeContact !== 'Gemini AI' && (
                <div className="flex items-center gap-2 text-slate-500 text-sm ml-2 animate-pulse">
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-200"></div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>
    );
};

export default MessageList;
