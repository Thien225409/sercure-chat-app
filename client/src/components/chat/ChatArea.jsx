import React from 'react';
import WelcomeScreen from './WelcomeScreen';
import MessageList from './MessageList';
import ChatInput from './ChatInput';

const ChatArea = ({
    activeContact,
    activeMessages,
    userStatuses,
    typingUsers,
    chatStatus,
    messagesEndRef,
    onSendMessage,
    onTyping,
    handleMessageAction,
    handleDownloadDecrypt,
    isLoadingChat,
    aiSessionStartIndex,
    toggleAI,
    onBack
}) => {
    return (
        <div className={`z-10 flex-col bg-slate-900/50 backdrop-blur-sm relative ${activeContact ? 'flex flex-1 w-full md:flex-1' : 'hidden md:flex md:flex-1'}`}>
            <div className="h-16 border-b border-white/5 flex items-center justify-between px-4 md:px-6 glass shadow-sm">
                {activeContact ? (
                    <>
                        <div className='flex items-center gap-3'>
                            <button onClick={onBack} className="md:hidden text-slate-300 hover:text-white mr-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                                </svg>
                            </button>
                            <div className='flex flex-col'>
                                <span className="font-bold text-lg flex items-center gap-2">{activeContact === 'Gemini AI' ? '✨ Chat với AI' : activeContact}</span>
                                {activeContact !== 'Gemini AI' && (<span className='text-xs text-emerald-400 font-medium'>{typingUsers.has(activeContact) ? 'Đang soạn tin...' : (userStatuses[activeContact] === 'ONLINE' ? 'Đang hoạt động' : 'Không hoạt động')}</span>)}
                            </div>
                        </div>

                        {/* AI Toggle Button */}
                        {activeContact !== 'Gemini AI' && (
                            <button
                                onClick={toggleAI}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${aiSessionStartIndex !== null
                                    ? 'bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30'
                                    : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50 hover:bg-indigo-500/30'
                                    }`}
                                title={aiSessionStartIndex !== null ? "Kick AI ra khỏi phòng" : "Mời AI vào phòng chat"}
                            >
                                {aiSessionStartIndex !== null ? (
                                    <>🚫 Kick AI</>
                                ) : (
                                    <>🤖 Invite AI</>
                                )}
                            </button>
                        )}
                    </>
                ) : (<span className="text-slate-500">Chọn một cuộc hội thoại</span>)}
            </div>

            {!activeContact && <WelcomeScreen />}

            {activeContact && (
                <>
                    <div className={`flex-1 flex flex-col min-h-0 relative ${isLoadingChat ? 'hidden' : 'block'}`}>
                        <MessageList
                            activeMessages={activeMessages}
                            activeContact={activeContact}
                            messagesEndRef={messagesEndRef}
                            chatStatus={chatStatus}
                            typingUsers={typingUsers}
                            handleDownloadDecrypt={handleDownloadDecrypt}
                            handleMessageAction={handleMessageAction}
                        />
                    </div>

                    {isLoadingChat && (
                        <div className="flex-1 p-4 space-y-4 overflow-hidden">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="animate-pulse flex flex-col gap-2">
                                    <div className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`h-10 w-48 rounded-2xl ${i % 2 === 0 ? 'bg-indigo-900/30' : 'bg-slate-700/30'}`}></div>
                                    </div>
                                    <div className={`flex ${i % 2 !== 0 ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`h-16 w-64 rounded-2xl ${i % 2 !== 0 ? 'bg-indigo-900/30' : 'bg-slate-700/30'}`}></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <ChatInput
                        activeContact={activeContact}
                        onSendMessage={onSendMessage}
                        onTyping={onTyping}
                    />
                </>
            )}
        </div>
    );
};

export default ChatArea;
