import React from 'react';
import { X, ExternalLink, Link as LinkIcon } from 'lucide-react';

export default function LinksModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const links = [
    { name: 'Visor de GML y Parcela', url: 'https://generador-gml.xyz/', desc: 'Herramienta de visualización GML' },
    { name: 'Convertir puntos a .DXF', url: 'https://convertirtxtadxf.es/', desc: 'Conversor topográfico online' },
    { name: 'Sede Electrónica del Catastro', url: 'https://www.sedecatastro.gob.es/', desc: 'Portal oficial del Catastro' },
    { name: 'Visor Iberpix (IGN)', url: 'https://www.ign.es/iberpix/visor/', desc: 'Mapas y ortofotos oficiales' },
    { name: 'Georeferenciación IGN', url: 'https://componentes.cnig.es/api-core/georefimage2.jsp?language=es', desc: 'Herramienta de georeferencia' },
    { name: 'Urbanismo Murcia', url: 'http://urbanismo.murcia.es/infourb/geovisor', desc: 'Planeamiento urbanístico Murcia' },
    { name: 'Ayuntamiento de Murcia', url: 'https://geovisor.murcia.es/', desc: 'Geovisor municipal' },
    { name: 'Notas Simples (Registradores)', url: 'https://sede.registradores.org/sede/sede-corpme-web/home', desc: 'Petición de notas al Registro' },
    { name: 'Geoportal Registradores', url: 'https://geoportal.registradores.org/geoportal', desc: 'Visor registral de España' },
    { name: 'Zonas Inundables (SNCZI)', url: 'https://sig.miteco.gob.es/snczi/index.html?herramienta=DPHZI', desc: 'Sistema de cartografía de inundabilidad' },
  ];

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel" style={{ maxWidth: '650px', width: '95vw', maxHeight: '85vh', overflowY: 'auto', borderRadius: '0px', padding: '24px' }}>
        <div className="modal-header" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '8px', borderRadius: '4px' }}>
              <LinkIcon size={22} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: '800', letterSpacing: '-0.02em' }}>ENLACES DE INTERÉS</h2>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recursos externos útiles</p>
            </div>
          </div>
          <button onClick={onClose} className="close-btn" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', paddingBottom: '20px' }}>
          {links.map((link, i) => (
            <a 
              key={i} 
              href={link.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="glass-card"
              style={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: '4px',
                textDecoration: 'none',
                padding: '16px',
                border: '1px solid var(--border-color)',
                transition: 'var(--transition)',
                background: 'rgba(255,255,255,0.02)',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '600' }}>{link.name}</span>
                <ExternalLink size={14} color="var(--accent-primary)" style={{ opacity: 0.6 }} />
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{link.desc}</span>
            </a>
          ))}
        </div>

        <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
          <button className="btn btn-primary" onClick={onClose} style={{ width: '100%', height: '45px', fontWeight: '700' }}>
            CERRAR VENTANA
          </button>
        </div>
      </div>
    </div>
  );
}
