import React, { useState } from 'react';
import { X, Save, FileText, Calendar, HardHat, Info, HelpCircle } from 'lucide-react';

export default function BuildingDataModal({ isOpen, onClose, onSave, initialData = {} }) {
  const [formData, setFormData] = useState({
    id: '1A',
    fechaInicio: '',
    fechaFinal: '',
    epsg: '25830',
    precision: '0.1',
    usoPrincipal: 'residential',
    estadoConservacion: 'en_construccion', // en_construccion, funcional, deficiente, ruina
    numInmuebles: '1',
    numViviendas: '1',
    plantasSobreRasante: '1',
    superficieConstruida: '',
    fechaConstruccion: '',
    esOtrasConstrucciones: false,
    ...initialData
  });

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    // Auto-toggle esOtrasConstrucciones based on usoPrincipal
    if (name === 'usoPrincipal') {
      const isOther = value === 'otras_construcciones';
      setFormData(prev => ({
        ...prev,
        [name]: value,
        esOtrasConstrucciones: isOther
      }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel" style={{ maxWidth: '800px', width: '95vw', maxHeight: '95vh', overflowY: 'auto', borderRadius: '0px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={20} color="var(--accent-primary)" />
            <h2 style={{ fontSize: '1.1rem' }}>Parámetros de GML e Informe de Edificio</h2>
          </div>
          <button onClick={onClose} className="close-btn"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>

          {/* Estado y Certificación */}
          <div className="form-section">
            <h3 className="section-title">Estado de la edificación y Certificación</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 1.5fr', gap: 20 }}>
              <div className="inner-group">
                <label className="group-label">Estado de conservación / Obra</label>
                <select name="estadoConservacion" value={formData.estadoConservacion} onChange={handleChange} style={{ width: '100%', marginTop: 8 }}>
                  <option value="en_construccion">En construcción, sin certi.</option>
                  <option value="funcional">Funcional / Terminado</option>
                  <option value="deficiente">Deficiente</option>
                  <option value="ruina">Ruina</option>
                </select>
              </div>
              <div className="inner-group">
                <label className="group-label">Cumplimentar sólo si se tiene el certif. de final de obra</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  <div className="form-group-vertical">
                    <label>la fecha de inicio de obras</label>
                    <input type="text" name="fechaInicio" value={formData.fechaInicio} onChange={handleChange} placeholder="DD-MM-AAAA" />
                  </div>
                  <div className="form-group-vertical">
                    <label>la fecha de final de obra del certificado</label>
                    <input type="text" name="fechaFinal" value={formData.fechaFinal} onChange={handleChange} placeholder="DD-MM-AAAA" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
            {/* Identificación */}
            <div className="form-section">
              <h3 className="section-title">Identificación del edificio según el protocolo</h3>
              <div className="form-group" style={{ marginTop: 10 }}>
                <label>Identificador del edificio</label>
                <input type="text" name="id" value={formData.id} onChange={handleChange} placeholder="1A" required />
              </div>
            </div>

            {/* Sistema de referencia */}
            <div className="form-section">
              <h3 className="section-title">Sistema de referencia y huso</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                <div className="form-row">
                  <label>Sist. ref. y huso</label>
                  <select name="epsg" value={formData.epsg} onChange={handleChange} style={{ width: '130px' }}>
                    <option value="25827">EPSG::25827</option>
                    <option value="25828">EPSG::25828</option>
                    <option value="25829">EPSG::25829</option>
                    <option value="25830">EPSG::25830</option>
                    <option value="25831">EPSG::25831</option>
                    <option value="32628">EPSG::32628</option>
                  </select>
                </div>
                <div className="form-row">
                  <label>Precisión de las coordenadas en metros</label>
                  <input type="number" step="0.1" name="precision" value={formData.precision} onChange={handleChange} style={{ width: '60px' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Uso principal */}
          <div className="form-section">
            <h3 className="section-title">Si lo conoce, indique el uso principal al que se destina el edificio (Vivienda, comercios...)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 10 }}>
              <div className="form-group">
                <label>Uso principal</label>
                <select name="usoPrincipal" value={formData.usoPrincipal} onChange={handleChange}>
                  <option value="residential">Residencial</option>
                  <option value="agriculture">Agricultura</option>
                  <option value="industrial">Industria</option>
                  <option value="office">Oficinas</option>
                  <option value="otras_construcciones">Otras Construcciones</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
            {/* Inmuebles */}
            <div className="form-section">
              <h3 className="section-title">Inmuebles = viviendas + garajes + locales</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                <div className="form-row">
                  <label>Número Inmuebles (= v+g+l)</label>
                  <input type="number" name="numInmuebles" value={formData.numInmuebles} onChange={handleChange} style={{ width: '60px' }} />
                </div>
                <div className="form-row">
                  <label>Número de viviendas</label>
                  <input type="number" name="numViviendas" value={formData.numViviendas} onChange={handleChange} style={{ width: '60px' }} />
                </div>
              </div>
            </div>

            {/* Alturas y superficie */}
            <div className="form-section">
              <h3 className="section-title">Alturas y superfice computable según normativa</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                <div className="form-row">
                  <label>Número de plantas sobre rasante</label>
                  <input type="number" name="plantasSobreRasante" value={formData.plantasSobreRasante} onChange={handleChange} style={{ width: '60px' }} />
                </div>
                <div className="form-row">
                  <label>Superficie construida computable (m²)</label>
                  <input
                    type="number"
                    name="superficieConstruida"
                    value={formData.superficieConstruida}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData(prev => ({ ...prev, superficieConstruida: val ? Math.round(parseFloat(val)).toString() : '' }));
                    }}
                    style={{ width: '100px' }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 5 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1, height: '45px', fontSize: '1rem' }}>
              <Save size={18} style={{ marginRight: 8 }} /> Aceptar
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1, height: '45px', fontSize: '1rem' }}>
              Cancelar
            </button>
            <button type="button" className="btn btn-secondary" style={{ width: '120px', height: '45px' }}>
              Ayuda
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .form-section {
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 12px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 0px;
        }
        .section-title {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-bottom: 5px;
          margin-top: 0;
          font-weight: 600;
        }
        .group-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          display: block;
          margin-bottom: 8px;
        }
        .inner-group {
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 10px;
          border-radius: 0px;
        }
        .radio-label {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.85rem;
          cursor: pointer;
          text-transform: none;
        }
        .form-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
          font-size: 0.85rem;
        }
        .form-row label {
          margin: 0;
          text-transform: none;
          flex: 1;
        }
        .form-group-vertical {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.85rem;
        }
        .form-group-vertical label {
          text-transform: none;
          margin: 0;
          color: var(--text-secondary);
        }
        .form-row-full {
          display: flex;
          align-items: center;
          gap: 15px;
          font-size: 0.85rem;
        }
        .form-row-full label {
          margin: 0;
          text-transform: none;
          min-width: 180px;
        }
        .form-row-full input {
          flex: 1;
        }
        input, select {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-color);
          color: white;
          padding: 6px 10px;
          border-radius: 0px;
          font-size: 0.85rem;
        }
        input:focus {
          border-color: var(--accent-primary);
          outline: none;
        }
        input[type="radio"] {
          appearance: none;
          width: 16px;
          height: 16px;
          border: 1px solid var(--border-color);
          border-radius: 50%;
          display: grid;
          place-content: center;
          cursor: pointer;
          margin: 0;
          padding: 0;
        }
        input[type="radio"]::before {
          content: "";
          width: 8px;
          height: 8px;
          border-radius: 50%;
          transform: scale(0);
          transition: 120ms transform ease-in-out;
          background-color: var(--accent-primary);
        }
        input[type="radio"]:checked::before {
          transform: scale(1);
        }
        input[type="radio"]:checked {
          border-color: var(--accent-primary);
        }
      `}</style>
    </div>
  );
}
