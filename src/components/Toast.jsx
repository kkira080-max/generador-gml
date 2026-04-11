import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export default function Toast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleAddToast = (e) => {
      const { message, type, duration } = e.detail;
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    };

    window.addEventListener('show-toast', handleAddToast);
    return () => window.removeEventListener('show-toast', handleAddToast);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      pointerEvents: 'none',
      width: 'max-content',
      maxWidth: '90vw'
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          background: 'rgba(25, 25, 30, 0.95)',
          color: '#fff',
          padding: '12px 18px',
          borderRadius: '8px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
          border: `1px solid ${t.type === 'error' ? 'rgba(239, 68, 68, 0.5)' : t.type === 'success' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(59, 130, 246, 0.5)'}`,
          borderLeft: `4px solid ${t.type === 'error' ? '#ef4444' : t.type === 'success' ? '#10b981' : '#3b82f6'}`,
          backdropFilter: 'blur(10px)',
          animation: 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          pointerEvents: 'auto',
          cursor: 'pointer'
        }}
        onClick={() => removeToast(t.id)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {t.type === 'error' && <AlertCircle size={20} color="#ef4444" />}
            {t.type === 'success' && <CheckCircle size={20} color="#10b981" />}
            {t.type === 'info' && <Info size={20} color="#3b82f6" />}
            <span style={{ fontSize: '0.95rem', fontWeight: 500, lineHeight: 1.4, paddingRight: '15px' }}>{t.message}</span>
          </div>
          <X size={16} color="#aaa" style={{ flexShrink: 0 }} />
          
          <style>{`
            @keyframes slideDown {
              from { opacity: 0; transform: translateY(-30px) scale(0.9); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </div>
      ))}
    </div>
  );
}
