import React, { useState } from 'react';
import { X, Send, CheckCircle, Loader2 } from 'lucide-react';

export default function SupportModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [errorMsg, setErrorMsg] = useState('');

  const formspreeId = import.meta.env.VITE_FORMSPREE_ID;

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

    try {
      const response = await fetch(`https://formspree.io/f/${formspreeId}`, {
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
      <div className="modal-content glass-panel support-modal">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LifeBuoy size={20} color="var(--accent-primary)" />
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>SOPORTE TÉCNICO</h2>
          </div>
          <button className="close-btn" onClick={onClose}><X size={24} /></button>
        </div>

        {status === 'success' ? (
          <div className="success-message">
            <CheckCircle size={48} color="var(--accent-primary)" />
            <h4>¡Mensaje enviado!</h4>
            <p>Te responderemos lo antes posible a tu correo electrónico.</p>
            <button className="btn btn-primary" onClick={onClose} style={{ marginTop: '20px', width: '200px' }}>Cerrar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="support-form">
            <p className="form-intro">Cuéntanos qué necesitas y el equipo técnico de GML-Generator te ayudará lo antes posible.</p>
            
            <div className="form-group">
              <label>Tu Nombre</label>
              <input 
                type="text" 
                required 
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="Ej: Juan Pérez"
              />
            </div>

            <div className="form-group">
              <label>Tu Email</label>
              <input 
                type="email" 
                required 
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                placeholder="Ej: juan@email.com"
              />
            </div>

            <div className="form-group">
              <label>Mensaje / Consulta</label>
              <textarea 
                required 
                rows="5"
                value={formData.message}
                onChange={(e) => setFormData({...formData, message: e.target.value})}
                placeholder="Describe tu problema o sugerencia con el mayor detalle posible..."
              ></textarea>
            </div>

            {status === 'error' && (
              <div className="error-msg">{errorMsg}</div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
              <button type="submit" className="btn btn-primary submit-btn" disabled={status === 'loading'} style={{ flex: 1 }}>
                {status === 'loading' ? <Loader2 className="animate-spin" /> : <><Send size={18} /> ENVIAR CONSULTA</>}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 0.5 }}>
                CANCELAR
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

import { LifeBuoy } from 'lucide-react';
