import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const TOAST_EVENT = 'SHOW_TOAST';

export const toast = {
  success: (message, duration = 3000) => {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type: 'success', duration } }));
  },
  error: (message, duration = 3000) => {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type: 'error', duration } }));
  },
  info: (message, duration = 3000) => {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type: 'info', duration } }));
  }
};

export const Toaster = () => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleToast = (e) => {
      const id = Date.now() + Math.random();
      const newToast = { id, ...e.detail };
      setToasts(prev => [...prev, newToast]);

      if (newToast.duration) {
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
        }, newToast.duration);
      }
    };

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, []);

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium pointer-events-auto transition-all backdrop-blur-md${t.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-2000/20 text-red-300 border border-red-500/30' : t.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'glass-panel/10 text-white border border-white/15' }`}>
          <span>{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="text-gray-400 hover:text-gray-400 ml-2 focus:outline-none">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
