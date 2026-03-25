import React, { useState } from 'react';
import { Wrench, Ruler, Square, Crosshair, ChevronLeft, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

export default function MapTools({ onToolChange, activeTool, measurements = {}, areaUnit, setAreaUnit, huso, onSearchCoords, onHusoChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null); // 'mediciones' | 'coordenadas' | 'catastro' | null

  const [distUnit, setDistUnit] = useState('m'); // 'm' | 'km'
  const [searchX, setSearchX] = useState('');
  const [searchY, setSearchY] = useState('');

  const currentToolType = activeTool === 'area' ? 'area' : 'distance';

  const toggleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      // Keep menu at root when opening
      setActiveMenu(null);
    } else {
      // Clean up when closing
      setActiveMenu(null);
      onToolChange(null);
    }
  };

  const handleToolClick = (tool) => {
    onToolChange(tool === activeTool ? null : tool);
  };

  const formatArea = (areaM2) => {
    if (!areaM2) return '0 m²';
    if (areaUnit === 'ha') return (areaM2 / 10000).toLocaleString('es-ES', { maximumFractionDigits: 4 }) + ' ha';
    if (areaUnit === 'km2') return (areaM2 / 1000000).toLocaleString('es-ES', { maximumFractionDigits: 6 }) + ' km²';
    return areaM2.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' m²';
  };

  const formatDistance = (distM) => {
    if (!distM) return '0 m';
    if (distUnit === 'km') return (distM / 1000).toLocaleString('es-ES', { maximumFractionDigits: 3 }) + ' km';
    return distM.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' m';
  };

  const handleSearch = () => {
    if (!searchX || !searchY) {
      alert("Introduce las coordenadas X e Y.");
      return;
    }
    const targetHuso = huso;
    if (!targetHuso) {
      alert("Selecciona el Huso (EPSG) en el desplegable.");
      return;
    }
    onSearchCoords({
      x: parseFloat(searchX),
      y: parseFloat(searchY),
      huso: targetHuso
    });
  };

  const HusoSelector = () => (
    <div className="input-field" style={{ gridColumn: 'span 2', marginBottom: '8px' }}>
      <label style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>SISTEMA DE REFERENCIA (OBLIGATORIO)</label>
      <select 
        value={huso || ''} 
        onChange={(e) => onHusoChange(e.target.value)}
        className="tool-select animate-pulse-border"
        style={{ width: '100%', borderColor: !huso ? 'var(--accent-warning)' : 'rgba(255,255,255,0.1)' }}
      >
         <option value="">-- SELECCIONA HUSO --</option>
         <option value="25827">HUSO 27 (EPSG:25827)</option>
         <option value="25828">HUSO 28 (EPSG:25828)</option>
         <option value="25829">HUSO 29 (EPSG:25829)</option>
         <option value="25830">HUSO 30 (EPSG:25830)</option>
         <option value="25831">HUSO 31 (EPSG:25831)</option>
         <option value="4082">HUSO 27 (EPSG:4082 REGCAN)</option>
         <option value="4083">HUSO 28 (EPSG:4083 REGCAN)</option>
         <option value="32628">HUSO 28 (EPSG:32628 WGS84)</option>
      </select>
    </div>
  );

  return (
    <div className="map-tools-container">
      {/* Main Wrench Button */}
      {!activeMenu && (
        <button
          className={`map-tools-main-btn ${isOpen ? 'active' : ''}`}
          onClick={toggleOpen}
          title="Herramientas de Medición y Coordenadas"
        >
          <Wrench size={20} />
        </button>
      )}

      {/* Root Menu */}
      {isOpen && !activeMenu && (
        <div className="map-tools-menu-root glass-card">
          <button className="menu-item" onClick={() => setActiveMenu('mediciones')}>
            <Ruler size={16} />
            <span>Mediciones</span>
            <ChevronRight size={14} className="ml-auto" />
          </button>
          <button className="menu-item" onClick={() => setActiveMenu('coordenadas')}>
            <Crosshair size={16} />
            <span>Coordenadas</span>
            <ChevronRight size={14} className="ml-auto" />
          </button>
          <button className="menu-item" onClick={() => setActiveMenu('visores_externos')}>
            <ExternalLink size={16} />
            <span>Visores Externos</span>
            <ChevronRight size={14} className="ml-auto" />
          </button>
        </div>
      )}

      {/* Mediciones Panel (Matching Image Design) */}
      {isOpen && activeMenu === 'mediciones' && (
        <div className="map-tools-panel glass-card">
          <div className="panel-header">
            <button className="back-btn" onClick={() => setActiveMenu(null)}>
              <ChevronLeft size={16} />
            </button>
            <span className="panel-title">MEDICIONES</span>
          </div>

          <div className="panel-body">
            {!huso && <HusoSelector />}
            
            <div className="tools-controls-row">
              <div className="tools-select-container">
                {currentToolType === 'distance' ? (
                  <select value={distUnit} onChange={(e) => setDistUnit(e.target.value)} className="tools-unit-select">
                    <option value="m">Metros</option>
                    <option value="km">Kilómetros</option>
                  </select>
                ) : (
                  <select value={areaUnit} onChange={(e) => setAreaUnit(e.target.value)} className="tools-unit-select">
                    <option value="ha">Hectáreas</option>
                    <option value="km2">Kilómetros cuadrados</option>
                    <option value="m2">Metros cuadrados</option>
                  </select>
                )}
                <ChevronDown size={14} className="select-arrow" />
              </div>

              <div className="tools-icons-group">
                <button
                  className={`tool-icon-btn ${activeTool === 'distance' ? 'active' : ''}`}
                  onClick={() => handleToolClick('distance')}
                  title="Medir distancia"
                >
                  <Ruler size={18} />
                </button>
                <div className="tool-divider"></div>
                <button
                  className={`tool-icon-btn ${activeTool === 'area' ? 'active' : ''}`}
                  onClick={() => handleToolClick('area')}
                  title="Medir área"
                >
                  <Square size={18} />
                </button>
              </div>
            </div>

            {/* Live Result Display */}
            {(activeTool === 'distance' || activeTool === 'area') && (
              <div className="tools-live-result">
                {huso ? (
                  <span className="result-value">
                    {activeTool === 'distance' ? formatDistance(measurements.distance) : formatArea(measurements.area)}
                  </span>
                ) : (
                  <span className="result-value" style={{ color: 'var(--accent-warning)', fontSize: '0.7rem' }}>
                    SELECCIONA HUSO PARA MEDIR
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Coordenadas Panel */}
      {isOpen && activeMenu === 'coordenadas' && (
        <div className="map-tools-panel glass-card">
          <div className="panel-header">
            <button className="back-btn" onClick={() => setActiveMenu(null)}>
              <ChevronLeft size={16} />
            </button>
            <span className="panel-title">COORDENADAS</span>
          </div>

          <div className="panel-body" style={{ maxHeight: '350px', overflowY: 'auto' }}>
            <div className="tools-controls-row" style={{ justifyContent: 'center', marginBottom: '14px' }}>
              <button
                className={`tool-btn-full ${activeTool === 'coordinates' ? 'active' : ''}`}
                onClick={() => handleToolClick('coordinates')}
              >
                <Crosshair size={18} style={{ marginRight: 8 }} />
                {activeTool === 'coordinates' ? 'Captura Activa' : 'Obtener Coordenadas'}
              </button>
            </div>

            {activeTool === 'coordinates' && measurements.coords ? (
              <div className="tools-live-result coord-grid" style={{ marginBottom: '16px' }}>
                <div className="coord-item">
                  <span className="coord-label">X:</span>
                  <span className="coord-val">{measurements.coords.x.toFixed(3)}</span>
                </div>
                <div className="coord-item">
                  <span className="coord-label">Y:</span>
                  <span className="coord-val">{measurements.coords.y.toFixed(3)}</span>
                </div>
                <div className="coord-item" style={{ gridColumn: 'span 2' }}>
                  <span className="coord-label">EPSG:</span>
                  <span className="coord-val">{measurements.coords.epsg}</span>
                </div>
              </div>
            ) : activeTool === 'coordinates' ? (
              <div className="tools-live-result pending-msg" style={{ marginBottom: '16px' }}>
                Selecciona el Huso. Haz clic en el mapa...
              </div>
            ) : null}

            {/* BUSCADOR DE COORDENADAS */}
            <div className="coord-search-section" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px', marginTop: '4px' }}>
               <span style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--accent-primary)', textTransform: 'uppercase', marginBottom: '10px', display: 'block', letterSpacing: '0.05em' }}>
                 Buscador de Coordenadas UTM
               </span>
               <div className="search-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px' }}>
                  <div className="input-field">
                    <label style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Coordenada X (Este)</label>
                    <input 
                      type="number" 
                      value={searchX} 
                      onChange={(e) => setSearchX(e.target.value)}
                      placeholder="Ej: 400000"
                      className="tool-input"
                    />
                  </div>
                  <div className="input-field">
                    <label style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Coordenada Y (Norte)</label>
                    <input 
                      type="number" 
                      value={searchY} 
                      onChange={(e) => setSearchY(e.target.value)}
                      placeholder="Ej: 4000000"
                      className="tool-input"
                    />
                  </div>
                  {!huso && <HusoSelector />}
                  <button 
                    className="btn btn-primary btn-sm" 
                    style={{ gridColumn: 'span 2', marginTop: '4px', height: '32px', fontSize: '0.7rem' }}
                    onClick={handleSearch}
                  >
                    <Crosshair size={14} style={{ marginRight: 8 }} />
                    LOCALIZAR PUNTO
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Visores Externos Panel */}
      {isOpen && activeMenu === 'visores_externos' && (
        <div className="map-tools-panel glass-card">
          <div className="panel-header">
            <button className="back-btn" onClick={() => setActiveMenu(null)}>
              <ChevronLeft size={16} />
            </button>
            <span className="panel-title">VISORES OFICIALES</span>
          </div>

          <div className="panel-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className={`tool-btn-full ${activeTool === 'go_to_cadastre' ? 'active' : ''}`}
                onClick={() => handleToolClick('go_to_cadastre')}
              >
                <ExternalLink size={18} style={{ marginRight: 8 }} />
                {activeTool === 'go_to_cadastre' ? 'Sede Catastro: Pica mapa' : 'Abrir en Catastro'}
              </button>

              <button
                className={`tool-btn-full ${activeTool === 'go_to_registradores' ? 'active' : ''}`}
                onClick={() => handleToolClick('go_to_registradores')}
              >
                <Square size={18} style={{ marginRight: 8 }} />
                {activeTool === 'go_to_registradores' ? 'Registradores: Pica mapa' : 'Geoportal Registradores'}
              </button>
            </div>
            
            <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '12px', textAlign: 'center', lineHeight: '1.4' }}>
              Selecciona una herramienta y haz clic en cualquier lugar del mapa para abrir la ubicación exacta en el visor oficial.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
