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
    isLoadingChat
}) => {
    return (
        <div className="z-10 flex flex-1 flex-col bg-slate-900/50 backdrop-blur-sm relative">
            <div className="h-16 border-b border-white/5 flex items-center px-6 glass shadow-sm">
                {activeContact ? (
                    <div className='flex flex-col'>
                        <span className="font-bold text-lg flex items-center gap-2">{activeContact === 'Gemini AI' ? '✨ Chat với AI' : activeContact}</span>
                        {activeContact !== 'Gemini AI' && (<span className='text-xs text-emerald-400 font-medium'>{typingUsers.has(activeContact) ? 'Đang soạn tin...' : (userStatuses[activeContact] === 'ONLINE' ? 'Đang hoạt động' : 'Không hoạt động')}</span>)}
                    </div>
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
