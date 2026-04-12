import React, { useState } from 'react';
import { X, Map, Download, Search, ShieldCheck, RefreshCcw, BookOpen, ChevronDown, Layers } from 'lucide-react';

export default function HelpModal({ isOpen, onClose }) {
  const [expandedSection, setExpandedSection] = useState(0);

  if (!isOpen) return null;

  const features = [
    {
      icon: <Download size={22} className="feature-icon" />,
      title: "Conversión de DXF a GML",
      desc: "Arrastra ficheros DXF procedentes de AutoCAD o cualquier software CAD (pueden contener polilíneas cerradas). El motor de GML-Generator extraerá los recintos, validará la geometría y generará un fichero GML v4 (formato estandarizado) por cada elemento o unificándolos todos. ¡Imprescindible para entregar informes a Catastro o Registro de la Propiedad!"
    },
    {
      icon: <Download size={22} className="feature-icon" />,
      title: "Conversión de GML V3 a GML V4",
      desc: "Arrastra ficheros gml v3 y los convierte a gml V4 valido para la Sede Electronica del Catastro. El motor de GML-Generator extraerá los recintos, validará la geometría y generará un fichero GML v4 (formato estandarizado) por cada elemento o unificándolos todos. ¡Imprescindible para entregar informes a Catastro o Registro de la Propiedad!"
    },
    {
      icon: <Download size={22} className="feature-icon" />,
      title: "Generación de GML de Edificaciones. ICUC.",
      desc: "Arrastra ficheros .dxf con la polilinea de cada edificacion (huella u ocupación de edificación) y genera el GML correspondiente para la Sede Electronica del Catastro."
    },
    {
      icon: <RefreshCcw size={22} className="feature-icon" />,
      title: "Ajuste Automágico a Catastro",
      desc: "Evita dolores de cabeza a la hora de buscar cómo encaja tu levantamiento topográfico con la cartografía oficial. Usa nuestra herramienta de Matrices Inversas para encontrar todas las combinaciones reales posibles y anclar con precisión centimétrica tu geometría (traslación, rotación) sin modificar la forma del elemento original."
    },
    {
      icon: <ShieldCheck size={22} className="feature-icon" />,
      title: "Asistente Pre-Validación (IVGA) y Prevalidación de ICUC",
      desc: "Analiza antes que nadie y detecta en local los Identificadores Gráficos. Descubre invaciones a vecinos, superposiciones con dominio público o huecos internos en tu geometría antes de llevar el GML a la sede del catastro tanto las parcelas y/o fincas como el de las construcciones."
    },
    {
      icon: <Search size={22} className="feature-icon" />,
      title: "Buscador y Catastro Histórico",
      desc: "Busca por referencia catastral o localiza calles. Contamos con una superposición (WMS) del Catastro Histórico para estudiar cómo era tu linde hace años, gestionando su nivel de opacidad directamente para superponerlo a las ortofotos (PNOA)."
    },
    {
      icon: <Layers size={22} className="feature-icon" />,
      title: "Edificios y Coordenadas",
      desc: "No solo te damos GML de parcelas catastrales. Podemos generar el etiquetado específico GML de Edificaciones. Y si lo necesitas para replanteo, puedes descargarte directamente un archivo CSV o TXT con el litado de Coordenadas de los vértices (Norte, Este)."
    },
    {
      icon: <Search size={22} className="feature-icon" />,
      title: "Acceos directos segun el sitio indicado en el mapa",
      desc: "Puedes acceder desde la vista del mapa varias fuentes oficiales, como el catastro (direcrtamente en el sitio seleccionado anteriormente en el mapa; Para descargar una imagen PNOA, pues selecciona un sitio en el mapa y te llevara a otra pestaña para poder descargar la imagen PNOA, tambien podras acceder a la Geoportal de los Registradores de España, haciendo la misma acción de selleccionar un punto sobre el mapa y te lleva a sitio indicado)."
    }
  ];

  return (
    <div className="modal-overlay" style={{ zIndex: 10000, animation: 'fadeIn 0.2s ease-out' }}>
      <div
        className="modal-content glass-card"
        style={{
          maxWidth: '650px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          boxShadow: '0 15px 50px rgba(0,0,0,0.6)',
          animation: 'slideInScale 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'var(--accent-primary)', color: '#000', padding: '8px', borderRadius: '8px' }}>
              <BookOpen size={24} />
            </div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#fff', fontWeight: 800 }}>Guía de Funciones</h2>
          </div>
          <button className="close-btn" onClick={onClose} style={{ position: 'relative', top: 0, right: 0 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', paddingRight: '10px' }} className="custom-scrollbar">
          <p style={{ color: '#aaa', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '25px' }}>
            Bienvenido al potencial completo. GML-Generator no solo convierte archivos; soluciona el ciclo completo del topógrafo para la validación geométrica legal en España. Descubre el poder de cada herramienta a continuación:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {features.map((feat, index) => {
              const isExpanded = expandedSection === index;
              return (
                <div
                  key={index}
                  style={{
                    background: isExpanded ? 'rgba(56, 189, 248, 0.05)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isExpanded ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)'}`,
                    borderRadius: '8px',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    overflow: 'hidden'
                  }}
                >
                  <button
                    onClick={() => setExpandedSection(isExpanded ? -1 : index)}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      padding: '15px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      color: isExpanded ? '#fff' : '#ccc',
                      fontWeight: 600,
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ color: isExpanded ? 'var(--accent-primary)' : '#888', transition: 'color 0.3s' }}>
                        {feat.icon}
                      </span>
                      {feat.title}
                    </div>
                    <ChevronDown size={18} style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s', color: '#888' }} />
                  </button>

                  <div
                    style={{
                      maxHeight: isExpanded ? '200px' : '0px',
                      opacity: isExpanded ? 1 : 0,
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      padding: isExpanded ? '0 20px 20px 45px' : '0 20px 0 45px',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#aaa', lineHeight: 1.6 }}>
                      {feat.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { background: rgba(0,0,0,0); }
          to { background: rgba(0,0,0,0.7); }
        }
        @keyframes slideInScale {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(56, 189, 248, 0.3);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(56, 189, 248, 0.5);
        }
        .feature-icon {
          filter: drop-shadow(0 0 5px rgba(56, 189, 248, 0.5));
        }
      `}</style>
    </div>
  );
}
