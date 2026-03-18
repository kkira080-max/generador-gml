import React, { useState, useEffect } from 'react';

export default function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Verificar si el usuario ya aceptó las cookies previamente
    const consent = localStorage.getItem('cookie_consent');
    if (!consent) {
      setShow(true);
    }
  }, []);

  const acceptCookies = () => {
    localStorage.setItem('cookie_consent', 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="cookie-banner">
      <div className="cookie-content">
        <span className="cookie-icon">🍪</span>
        <div className="cookie-text">
          <strong>Aviso de Cookies:</strong> Utilizamos cookies para asegurar que damos la mejor experiencia al usuario en nuestra web. Si sigues utilizando este sitio asumiremos que estás de acuerdo.
        </div>
      </div>
      <button className="btn btn-primary cookie-btn" onClick={acceptCookies}>
        Entendido
      </button>
    </div>
  );
}
