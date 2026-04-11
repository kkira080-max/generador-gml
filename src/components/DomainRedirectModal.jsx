import React, { useState, useEffect } from 'react';
import { Globe, X, ExternalLink } from 'lucide-react';

export default function DomainRedirectModal() {
  const [isVisible, setIsVisible] = useState(false);
  const [dontShowCheckbox, setDontShowCheckbox] = useState(false);
  const CANONICAL_DOMAIN = 'generador-gml.xyz';

  useEffect(() => {
    try {
      // Mantenemos un conteo de visitas para re-mostrar cada 10 veces
      let visits = parseInt(localStorage.getItem('domain_notice_visits') || '0', 10);
      visits += 1;
      localStorage.setItem('domain_notice_visits', visits.toString());

      const isDismissed = localStorage.getItem('domain_notice_dismissed') === 'true';
      const isMilestoneVisit = visits % 10 === 0;

      // Mostrar si: 
      // 1. Nunca la ha cerrado para siempre
      // 2. O la ha cerrado, pero ha llegado a una visita múltiplo de 10
      if (!isDismissed || isMilestoneVisit) {
        // Un ligero delay para que no sea super intrusivo con el parpadeo de carga de la web
        const timer = setTimeout(() => {
          setIsVisible(true);
        }, 1500);
        return () => clearTimeout(timer);
      }
    } catch (e) {
      console.error("Local storage not available for domain notice.");
    }
  }, []);

  const handleClose = () => {
    if (dontShowCheckbox) {
      localStorage.setItem('domain_notice_dismissed', 'true');
    }
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div 
        className="modal-content glass-card" 
        style={{ 
          maxWidth: '450px', 
          border: '1px solid #38bdf8', 
          boxShadow: '0 10px 40px rgba(56, 189, 248, 0.15)',
          animation: 'slideUp 0.3s ease-out'
        }}
      >
        <button className="close-btn" onClick={handleClose} style={{ top: '15px', right: '15px' }}>
          <X size={20} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: '20px', marginTop: '10px' }}>
          <div style={{ background: 'rgba(56, 189, 248, 0.1)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 15px auto', color: '#38bdf8' }}>
            <Globe size={32} />
          </div>
          <h2 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '10px', fontWeight: '700' }}>Web Oficial Disponible</h2>
          <p style={{ color: '#aaa', fontSize: '0.9rem', lineHeight: '1.5' }}>
            Asegúrate de acceder a la aplicación mediante nuestra dirección oficial y guárdala en tus marcadores para la mejor experiencia y actualización:
          </p>
        </div>

        <a 
          href={`http://${CANONICAL_DOMAIN}`} 
          target="_blank" 
          rel="noreferrer"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '10px', 
            background: 'rgba(56, 189, 248, 0.15)', 
            border: '1px dashed #38bdf8', 
            color: '#38bdf8', 
            padding: '15px', 
            borderRadius: '6px', 
            textDecoration: 'none', 
            fontWeight: 'bold',
            fontSize: '1.1rem',
            marginBottom: '20px',
            transition: '0.2s all'
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = '#38bdf8'; e.currentTarget.style.color = '#000'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)'; e.currentTarget.style.color = '#38bdf8'; }}
        >
          {CANONICAL_DOMAIN}
          <ExternalLink size={18} />
        </a>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '4px' }}>
          <input 
            type="checkbox" 
            id="dont-show-domain-notice" 
            checked={dontShowCheckbox}
            onChange={(e) => setDontShowCheckbox(e.target.checked)}
            style={{ marginRight: '10px', width: '16px', height: '16px', cursor: 'pointer', accentColor: '#38bdf8' }}
          />
          <label htmlFor="dont-show-domain-notice" style={{ color: '#888', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none' }}>
            No volver a mostrar de inicio 
            <br />
            <span style={{ fontSize: '0.7rem', color: '#555' }}>(Reaparecerá como recordatorio cada 10 accesos)</span>
          </label>
        </div>

        <button 
          className="btn btn-primary" 
          onClick={handleClose} 
          style={{ width: '100%', padding: '12px' }}
        >
          Entendido, continuar a la app
        </button>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
