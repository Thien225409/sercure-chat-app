import React from 'react';

const WelcomeScreen = () => {
    return (
        <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-8 animate-fadeIn select-none">
            <div className="relative group">
                <div className="w-32 h-32 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full blur-2xl opacity-20 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse group-hover:opacity-40 transition-opacity duration-500"></div>
                <div className="relative z-10 w-24 h-24 bg-slate-800/50 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-white/5 shadow-2xl skew-y-3 group-hover:skew-y-0 transition-transform duration-500 ease-out">
                    <svg className="w-12 h-12 text-indigo-400 drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                </div>
                <div className="absolute -top-4 -right-4 w-12 h-12 bg-slate-800/80 backdrop-blur-md rounded-xl border border-white/5 flex items-center justify-center shadow-lg animate-bounce delay-700">
                    <span className="text-xl">🔒</span>
                </div>
            </div>

            <div className="text-center space-y-3 px-4">
                <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 animate-text">
                    Secure Chat
                </h2>
                <p className="font-medium text-slate-400 max-w-sm mx-auto leading-relaxed">
                    Mọi tin nhắn đều được mã hóa đầu cuối.<br />
                    <span className="text-slate-500 text-sm">Không ai có thể đọc được tin nhắn của bạn, kể cả chúng tôi.</span>
                </p>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4 opacity-50 text-xs text-slate-500">
                <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_5px_rgba(16,185,129,0.5)]"></div> E2E Encryption</div>
                <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full shadow-[0_0_5px_rgba(99,102,241,0.5)]"></div> Zero-Knowledge</div>
            </div>
        </div>
    );
};

export default WelcomeScreen;
