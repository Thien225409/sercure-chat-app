import React, { useState } from 'react';

const LockScreen = ({ isLocked, unlockPassword, setUnlockPassword, handleUnlock, handleLogout }) => {
    if (!isLocked) return null;

    return (
        <div className="flex h-screen w-full items-center justify-center bg-slate-900 relative overflow-hidden select-none">
            {/* Ambient Background */}
            <div className="absolute top-0 -left-10 w-96 h-96 bg-indigo-600/20 rounded-full mix-blend-multiply filter blur-[128px] animate-blob"></div>
            <div className="absolute bottom-0 -right-10 w-96 h-96 bg-purple-600/20 rounded-full mix-blend-multiply filter blur-[128px] animate-blob animation-delay-2000"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>

            <div className="z-10 relative group">
                {/* Holographic Border Effect */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 rounded-2xl blur opacity-30 group-hover:opacity-75 transition duration-1000 animate-tilt"></div>

                <div className="relative glass-panel p-8 rounded-2xl w-full max-w-md mx-4 animate-popIn">
                    <div className="flex flex-col items-center mb-8">
                        <div className="relative mb-6">
                            <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                            <div className="relative w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center text-4xl shadow-2xl border border-white/5">
                                🔒
                            </div>
                            <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-lg">
                                <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                            </div>
                        </div>

                        <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 mb-2">
                            Session Locked
                        </h2>
                        <p className="text-slate-400 text-sm text-center max-w-xs leading-relaxed">
                            Mật khẩu của bạn là chìa khóa duy nhất để giải mã dữ liệu an toàn.
                        </p>
                    </div>

                    <form onSubmit={handleUnlock} className="space-y-5">
                        <div className="relative group/input">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within/input:text-indigo-400 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 000-2z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <input
                                type="password"
                                autoFocus
                                placeholder="Nhập mật khẩu mở khóa..."
                                className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 rounded-xl py-3.5 pl-11 pr-4 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-slate-900/80 transition-all shadow-inner placeholder:text-slate-600"
                                value={unlockPassword}
                                onChange={e => setUnlockPassword(e.target.value)}
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95 flex items-center justify-center gap-2"
                        >
                            <span>Mở khóa ngay</span>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <button
                            onClick={handleLogout}
                            className="text-slate-500 hover:text-red-400 text-sm font-medium transition-colors hover:underline underline-offset-4"
                        >
                            Đăng xuất khỏi tài khoản
                        </button>
                    </div>
                </div>

                <div className="mt-8 text-center opacity-30 text-[10px] uppercase font-bold tracking-widest text-slate-500 animate-pulse">
                    Secure Enclave Active
                </div>
            </div>
        </div>
    );
};

export default LockScreen;
