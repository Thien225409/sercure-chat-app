import React, { useState } from 'react';

const Sidebar = ({
    user,
    conversations,
    activeContact,
    onSelectContact,
    unread,
    userStatuses,
    typingUsers,
    menuOpenId,
    setMenuOpenId,
    handleDeleteChatClick,
    onStartChat,
    handleLogoutClick
}) => {
    const [searchUser, setSearchUser] = useState('');

    const handlePlusClick = () => {
        onStartChat(searchUser);
        setSearchUser('');
    };

    return (
        <div className="z-10 w-80 shrink-0 glass border-r-0 flex flex-col transition-all duration-300">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20 backdrop-blur-md">
                <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 circle-avatar bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold shadow-lg">
                        {user?.username?.charAt(0).toUpperCase()}
                    </div>
                    <h3 className="font-bold text-lg">{user?.username}</h3>
                </div>
                <button onClick={handleLogoutClick} className="text-slate-400 hover:text-red-500 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </button>
            </div>
            <div className="p-4 pt-2">
                <div className="flex gap-2">
                    <input
                        className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none transition-all"
                        placeholder="Thêm tin nhắn mới..."
                        value={searchUser}
                        onChange={e => setSearchUser(e.target.value)}
                    />
                    <button onClick={handlePlusClick} className="bg-indigo-600 hover:bg-indigo-700 w-10 rounded-lg text-lg flex items-center justify-center font-bold transition-transform active:scale-95">+</button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                <div onClick={() => onSelectContact('Gemini AI')} className={`p-3 cursor-pointer rounded-lg flex justify-between items-center transition-all ${activeContact === 'Gemini AI' ? 'bg-indigo-600/20 border-l-4 border-indigo-500' : 'hover:bg-slate-700/50'}`}>
                    <div className='flex items-center gap-3'><span className='text-xl'>🤖</span><span className='font-medium'>Gemini AI</span></div>
                    {unread['Gemini AI'] > 0 && (<span className="bg-red-500 text-xs font-bold rounded-full px-2 py-0.5 shadow-sm">{unread['Gemini AI']}</span>)}
                </div>
                {Object.keys(conversations).filter(u => u !== 'Gemini AI').map(username => (
                    <div key={username} className={`group relative p-3 cursor-pointer rounded-lg flex justify-between items-center transition-all ${activeContact === username ? 'bg-indigo-600/20 border-l-4 border-indigo-500' : 'hover:bg-slate-700/50'}`}>
                        <div className="flex items-center gap-3 flex-1" onClick={() => onSelectContact(username)}>
                            <div className="relative">
                                <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center font-bold text-slate-300 shadow-sm layer-shadow">{username.charAt(0).toUpperCase()}</div>
                                <div className="absolute bottom-0 right-0">
                                    {userStatuses[username] === 'ONLINE' && <span className="absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75 animate-ping"></span>}
                                    <span className={`relative inline-flex rounded-full h-3 w-3 border-2 border-slate-800 ${userStatuses[username] === 'ONLINE' ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
                                </div>
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
                                    <button className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2" onClick={(e) => handleDeleteChatClick(username, e)}>🗑️ Xóa hội thoại</button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Sidebar;
