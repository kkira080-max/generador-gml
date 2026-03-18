import React, { useState } from 'react';

export default function FeedbackModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // En un entorno real aquí harías una llamada a tu API/backend (ej. Formspree, EmailJS o tu propio servidor)
    // Para la demo, simplemente simulamos el envío
    console.log("Feedback enviado:", { email, message });
    setSubmitted(true);
    setTimeout(() => {
      setIsOpen(false);
      setSubmitted(false);
      setMessage('');
      setEmail('');
    }, 2500);
  };

  return (
    <>
      <button 
        className="btn btn-primary feedback-trigger" 
        onClick={() => setIsOpen(true)}
        title="Enviar comentarios o reportar un problema"
      >
        <span className="feedback-icon">💬</span> Soporte
      </button>

      {isOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Feedback / Soporte</h2>
              <button className="close-btn" onClick={() => setIsOpen(false)}>×</button>
            </div>
            
            {!submitted ? (
              <form onSubmit={handleSubmit} className="form-group">
                <p>¿Has encontrado algún problema o tienes alguna sugerencia para mejorar el visor?</p>
                
                <label htmlFor="email">Email (Opcional)</label>
                <input 
                  type="email" 
                  id="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="tu@email.com"
                />

                <label htmlFor="message">Tu mensaje *</label>
                <textarea 
                  id="message" 
                  required 
                  value={message} 
                  onChange={(e) => setMessage(e.target.value)} 
                  placeholder="Describe el problema o sugerencia..."
                  rows={4}
                />

                <button type="submit" className="btn btn-primary" style={{ marginTop: '12px' }}>
                  Enviar Feedback
                </button>
              </form>
            ) : (
              <div className="success-message">
                <span className="success-icon">✓</span>
                <p>¡Gracias por tu mensaje! Lo tendremos en cuenta para seguir mejorando.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
