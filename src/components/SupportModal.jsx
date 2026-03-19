import React, { useState } from 'react';
import { X, Send, CheckCircle, Loader2, LifeBuoy } from 'lucide-react';

export default function SupportModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [errorMsg, setErrorMsg] = useState('');

  const formspreeId = import.meta.env.VITE_FORMSPREE_ID || 'mbdzwldz';

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formspreeId) {
      setErrorMsg('Error: ID de Formspree no configurado en .env (VITE_FORMSPREE_ID)');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    // Robust ID parsing: if the user provided the full URL, extract just the ID
    let cleanId = formspreeId;
    if (cleanId.includes('formspree.io/f/')) {
      cleanId = cleanId.split('formspree.io/f/')[1];
    }

    try {
      const response = await fetch(`https://formspree.io/f/${cleanId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setStatus('success');
        setFormData({ name: '', email: '', message: '' });
      } else {
        throw new Error('Error al enviar el mensaje. Inténtalo de nuevo.');
      }
    } catch (err) {
      console.error("Support form error:", err);
      setErrorMsg(err.message);
      setStatus('error');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel" style={{ maxWidth: '500px', width: '95vw', maxHeight: '90vh', overflowY: 'auto', borderRadius: '0px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LifeBuoy size={20} color="var(--accent-primary)" />
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>SOPORTE TÉCNICO</h2>
          </div>
          <button onClick={onClose} className="close-btn"><X size={24} /></button>
        </div>

        <div style={{ padding: '10px 0' }}>
          {status === 'success' ? (
            <div className="success-message">
              <CheckCircle size={48} color="var(--accent-primary)" />
              <h4 style={{ margin: '15px 0 10px', color: 'var(--accent-primary)' }}>¡Mensaje enviado!</h4>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>Te responderemos lo antes posible a tu correo electrónico.</p>
              <button className="btn btn-primary" onClick={onClose} style={{ width: '100%', height: '45px' }}>
                Cerrar
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                Cuéntanos qué necesitas y te ayudaremos lo antes posible.
              </p>
              
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '600' }}>Tu Nombre</label>
                <input 
                  type="text" 
                  required 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Ej: Juan Pérez"
                  style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'white' }}
                />
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '600' }}>Tu Email</label>
                <input 
                  type="email" 
                  required 
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="Ej: juan@email.com"
                  style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'white' }}
                />
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '600' }}>Mensaje / Consulta</label>
                <textarea 
                  required 
                  rows="5"
                  value={formData.message}
                  onChange={(e) => setFormData({...formData, message: e.target.value})}
                  placeholder="Describe tu problema o sugerencia..."
                  style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'white', minHeight: '120px' }}
                ></textarea>
              </div>

              {status === 'error' && (
                <div style={{ color: 'var(--accent-danger)', fontSize: '0.85rem', textAlign: 'center', padding: '10px', background: 'rgba(248,113,113,0.1)', border: '1px solid var(--accent-danger)' }}>
                  {errorMsg}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={status === 'loading'} style={{ flex: 1, height: '45px', fontSize: '1rem' }}>
                  {status === 'loading' ? <Loader2 className="animate-spin" /> : <><Send size={18} style={{marginRight:8}} /> Enviar Consulta</>}
                </button>
                <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1, height: '45px', fontSize: '1rem' }}>
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
