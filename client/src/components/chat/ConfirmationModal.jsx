import React from 'react';

const ConfirmationModal = ({ isOpen, title, message, type, onConfirm, onCancel }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <div className="glass-panel rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-popIn relative overflow-hidden transform transition-all group">
                {/* Glow Effect */}
                <div className={`absolute -top-10 -right-10 w-24 h-24 rounded-full blur-2xl opacity-20 ${type === 'danger' ? 'bg-red-500' : 'bg-indigo-500'}`}></div>
                <div className={`absolute top-0 left-0 w-full h-1 ${type === 'danger' ? 'bg-gradient-to-r from-red-500 to-pink-500' : 'bg-gradient-to-r from-indigo-500 to-cyan-500'}`}></div>

                <div className="relative z-10">
                    <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-3">
                        <span className={`flex items-center justify-center w-8 h-8 rounded-full ${type === 'danger' ? 'bg-red-500/20 text-red-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                            {type === 'danger' ? '!' : 'i'}
                        </span>
                        {title}
                    </h3>
                    <p className="text-slate-300 mb-8 text-sm leading-relaxed pl-11">{message}</p>

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={onCancel}
                            className="px-4 py-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors text-sm font-medium"
                        >
                            Hủy bỏ
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`px-5 py-2.5 font-bold text-white rounded-xl shadow-lg transform active:scale-95 transition-all text-sm flex items-center gap-2 ${type === 'danger'
                                ? 'bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 shadow-red-500/30'
                                : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-indigo-500/30'
                                }`}
                        >
                            <span>Xác nhận</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
