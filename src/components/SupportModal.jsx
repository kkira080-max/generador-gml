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
      <div className="modal-content glass-card support-modal">
        <div className="modal-header">
          <h3>SOPORTE TÉCNICO</h3>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {status === 'success' ? (
          <div className="success-message">
            <CheckCircle size={48} color="var(--accent-primary)" />
            <h4>¡Mensaje enviado!</h4>
            <p>Te responderemos lo antes posible a tu correo electrónico.</p>
            <button className="btn btn-primary" onClick={onClose} style={{ marginTop: '20px' }}>Cerrar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="support-form">
            <p className="form-intro">Cuéntanos qué necesitas y te ayudaremos.</p>
            
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
                rows="4"
                value={formData.message}
                onChange={(e) => setFormData({...formData, message: e.target.value})}
                placeholder="Describe tu problema o sugerencia..."
              ></textarea>
            </div>

            {status === 'error' && (
              <div className="error-msg">{errorMsg}</div>
            )}

            <button type="submit" className="btn btn-primary submit-btn" disabled={status === 'loading'}>
              {status === 'loading' ? <Loader2 className="animate-spin" /> : <><Send size={18} /> ENVIAR MENSAJE</>}
            </button>
          </form>
        )}
      </div>

      <style jsx="true">{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          animation: fadeIn 0.3s ease;
        }
        .support-modal {
          width: 90%;
          max-width: 450px;
          padding: 30px;
          border: 1px solid var(--accent-primary);
          box-shadow: 0 0 30px rgba(0, 255, 157, 0.1);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .modal-header h3 {
          margin: 0;
          font-size: 1.2rem;
          color: var(--accent-primary);
          letter-spacing: 0.1em;
        }
        .close-btn {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
        }
        .form-intro {
          font-size: 0.9rem;
          color: var(--text-secondary);
          margin-bottom: 20px;
        }
        .form-group {
          margin-bottom: 15px;
        }
        .form-group label {
          display: block;
          font-size: 0.75rem;
          text-transform: uppercase;
          color: var(--accent-primary);
          margin-bottom: 8px;
          font-weight: bold;
        }
        .form-group input, .form-group textarea {
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 12px;
          color: #fff;
          font-size: 0.9rem;
          outline: none;
        }
        .form-group input:focus, .form-group textarea:focus {
          border-color: var(--accent-primary);
        }
        .submit-btn {
          width: 100%;
          height: 48px;
          margin-top: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-weight: bold;
        }
        .success-message {
          text-align: center;
          padding: 20px 0;
        }
        .success-message h4 {
          margin: 15px 0 10px;
          color: var(--accent-primary);
        }
        .success-message p {
          color: var(--text-secondary);
          font-size: 0.9rem;
        }
        .error-msg {
          color: #ff4d4d;
          font-size: 0.8rem;
          margin-bottom: 10px;
          text-align: center;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
