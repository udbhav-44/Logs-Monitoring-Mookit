import React, { useState } from 'react';
import { Trash2, X, Calendar, Server, AlertTriangle, Check } from 'lucide-react';
import { deletePartition } from '../lib/api';

const DeleteLogModal = ({ app, vmIds, onClose, onSuccess }) => {
    const [selectedVm, setSelectedVm] = useState(vmIds[0] || '');
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [confirmText, setConfirmText] = useState('');

    const handleDelete = async () => {
        if (!selectedVm || !month) return;
        if (confirmText !== 'delete') return;

        const formattedMonth = month.replace('-', '');

        setLoading(true);
        setError('');
        try {
            await deletePartition(selectedVm, app, formattedMonth);
            onSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Failed to delete logs.');
            setLoading(false);
        }
    };

    const isConfirmed = confirmText === 'delete';

    return (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[400px] overflow-hidden transform transition-all animate-in zoom-in-95 slide-in-from-bottom-2 duration-300">

                {/* Header */}
                <div className="px-6 pt-6 pb-2 flex justify-between items-start">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-red-600 mb-1">
                            <div className="bg-red-50 p-1.5 rounded-md">
                                <AlertTriangle size={16} strokeWidth={2.5} />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider">Critical Action</span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900">Delete Logs</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors hover:bg-gray-100 p-2 rounded-full"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="px-6 pb-6">
                    <p className="text-gray-500 text-sm mb-6">
                        Permanently delete logs for <strong className="text-gray-800">{app}</strong>. This cannot be undone.
                    </p>

                    {/* Controls */}
                    <div className="space-y-3 mb-6">
                        <div className="flex gap-3">
                            <div className="w-1/2 space-y-1">
                                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide ml-1">Virtual Machine</label>
                                <div className="relative group">
                                    <Server size={14} className="absolute left-3 top-3 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                                    <select
                                        value={selectedVm}
                                        onChange={(e) => setSelectedVm(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-transparent hover:border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none appearance-none font-medium"
                                    >
                                        {vmIds.map(vm => (
                                            <option key={vm} value={vm}>{vm}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="w-1/2 space-y-1">
                                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide ml-1">Month</label>
                                <div className="relative group">
                                    <Calendar size={14} className="absolute left-3 top-3 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                                    <input
                                        type="month"
                                        value={month}
                                        onChange={(e) => setMonth(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-transparent hover:border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none font-medium"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Confirmation */}
                    <div className="space-y-4">
                        <div className={`relative transition-all duration-300 ${isConfirmed ? 'opacity-50 grayscale' : 'opacity-100'}`}>
                            <label className="text-sm text-gray-600 block mb-2">
                                Type <span className="font-bold text-gray-900 mx-1 select-none font-mono bg-gray-100 px-1.5 py-0.5 rounded">delete</span> to confirm:
                            </label>
                            <input
                                type="text"
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder="delete"
                                className={`w-full px-4 py-3 text-lg tracking-widest border-2 rounded-xl text-center font-bold outline-none transition-all placeholder:font-normal placeholder:text-gray-300 placeholder:tracking-normal
                                    ${isConfirmed
                                        ? 'border-green-500/50 text-green-600 bg-green-50/50'
                                        : 'border-gray-100 bg-white focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
                                    }`}
                            />
                            {isConfirmed && (
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-green-600 animate-in zoom-in fade-in duration-300">
                                    <Check size={24} strokeWidth={3} />
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="text-red-600 text-xs flex items-center justify-center gap-1.5 bg-red-50 p-2 rounded-lg animate-in fade-in slide-in-from-top-1">
                                <AlertTriangle size={14} />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={onClose}
                                className="flex-1 px-4 py-3 text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 rounded-xl text-sm font-semibold transition-all"
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={loading || !isConfirmed}
                                className={`flex-[2] px-4 py-3 rounded-xl text-sm font-semibold text-white shadow-lg transition-all flex items-center justify-center gap-2
                                    ${isConfirmed
                                        ? 'bg-red-600 hover:bg-red-700 hover:shadow-red-200 active:scale-[0.98]'
                                        : 'bg-gray-200 text-gray-400 shadow-none cursor-not-allowed'
                                    }`}
                            >
                                {loading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <Trash2 size={18} />
                                        <span>Delete Forever</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DeleteLogModal;
