import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { calculateHelmertParameters, findBestCadastreFit, applyHelmertTransformation } from '../utils/transformations';
import { calculateBbox, calculatePolygonArea, closeRing, transformToWGS84, calculateCentroid } from '../utils/geoUtils';
import { fetchParcelsByBbox } from '../utils/cadastreService';

export default function CramerModal({ isOpen, onClose, parcels, huso, onAddParcel }) {
  const [activeTab, setActiveTab] = useState(1);
  const [selectedRealMapId, setSelectedRealMapId] = useState('');
  const [selectedAdaptedId, setSelectedAdaptedId] = useState('');
  
  // States
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [results, setResults] = useState(null);

  if (!isOpen) return null;

  const validParcels = parcels.filter(p => !p.isCadastre && p.originalCoords);
  const realParcel = validParcels.find(p => p.id === selectedRealMapId);
  const adaptedParcel = validParcels.find(p => p.id === selectedAdaptedId);

  const resetState = () => {
    setErrorMsg('');
    setResults(null);
  };

  const handleRunOption1 = async () => {
    if (!huso) {
      setErrorMsg("Debes seleccionar un Huso válido en el panel lateral antes de continuar.");
      return;
    }
    if (!realParcel) {
      setErrorMsg("Selecciona la parcela de la realidad física obtenida en tu levantamiento.");
      return;
    }

    setIsProcessing(true);
    resetState();

    try {
      // 1. Fetch cadastre parcels nearby
      const bbox = calculateBbox(realParcel.originalCoords);
      // We will expand bbox slightly to make sure we grab the neighbor they overlap with.
      const buffer = 50;
      bbox[0] -= buffer; bbox[1] -= buffer; bbox[2] += buffer; bbox[3] += buffer;
      
      let cadastreParcels = parcels.filter(p => p.isCadastre);
      if (cadastreParcels.length === 0) {
        cadastreParcels = await fetchParcelsByBbox(bbox, huso);
      }

      if (cadastreParcels.length === 0) {
        throw new Error("No hay cartografía catastral en esta zona. Descarga primero usando la lupa.");
      }

      const getOuterRing = (coords) => {
        if (!coords || !coords[0]) return null;
        if (typeof coords[0][0] === 'number') return coords; // Ring: [[x,y], ...]
        if (typeof coords[0][0][0] === 'number') return coords[0]; // Polygon: [ [[x,y]], [[x,y]] ]
        if (typeof coords[0][0][0][0] === 'number') return coords[0][0]; // MultiPolygon
        return coords;
      };

      // Check which cadastre parcel is closest to centroid
      const origRing = getOuterRing(realParcel.originalCoords);
      const origCentroid = calculateCentroid(origRing);
      let closestCadastre = null;
      let minDist = Infinity;
      cadastreParcels.forEach(cp => {
         try {
           if (!cp || !cp.originalCoords || cp.originalCoords.length === 0) return; // Obviar zonas en blanco o geometrías nulas
           const cpRing = getOuterRing(cp.originalCoords);
           if (!cpRing) return;
           const cpCentroid = calculateCentroid(cpRing);
           const dist = Math.sqrt(Math.pow(origCentroid[0] - cpCentroid[0], 2) + Math.pow(origCentroid[1] - cpCentroid[1], 2));
           if (dist < minDist) {
             minDist = dist;
             closestCadastre = cp;
           }
         } catch (err) {
           // Ignorar silenciosamente las parcelas mal formadas de catastro
         }
      });

      if (!closestCadastre) throw new Error("No se pudo identificar una parcela oficial cercana.");

      // Run iterative fit
      const fit = findBestCadastreFit(realParcel.originalCoords, closestCadastre.originalCoords);
      
      setResults(fit);

      // Create new adapted geometry
      const newCoords = applyHelmertTransformation(realParcel.originalCoords, fit);
      
      // Convert back to WGS84 for mapping
      let wgs84Coords;
      if (realParcel.geometry.type === 'MultiPolygon') {
        wgs84Coords = newCoords.map(ring => transformToWGS84(ring, huso)); // Simplification: assuming input was mostly 1 poly array structure 
      } else {
        wgs84Coords = newCoords.map(ring => transformToWGS84(ring, huso));
      }

      const geom = {
        type: 'Polygon',
        coordinates: wgs84Coords
      };

      const newArea = calculatePolygonArea(newCoords[0]);
      
      const adaptedName = `${realParcel.name} (ADAPTADA)`;
      onAddParcel({
        id: `adapted-${Date.now()}`,
        name: adaptedName,
        filename: `${adaptedName}.gml`,
        geometry: geom,
        originalCoords: newCoords,
        area: newArea,
        huso: huso,
        isGmlV4: false
      });

    } catch (e) {
      setErrorMsg(e.message || "Error al realizar el ajuste automático.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunOption2 = () => {
    resetState();
    if (!realParcel || !adaptedParcel) {
      setErrorMsg("Debes seleccionar ambas parcelas: la original (realidad física) y la adaptada.");
      return;
    }

    // Pass the first ring of both for parameter calculation
    const result = calculateHelmertParameters(realParcel.originalCoords[0], adaptedParcel.originalCoords[0]);

    if (result.errorMsg) {
      setErrorMsg(result.errorMsg);
    } else {
      setResults(result);
    }
  };

  const handleDownloadCSV = () => {
    if (!results) return;

    const csvContent = 
`PARAMETROS DE DESPLAZAMIENTO CATASTRO;
AX;${results.a.toFixed(9).replace('.', ',')}
BX;${(-results.b).toFixed(9).replace('.', ',')}
CX;${results.Tx.toFixed(3).replace('.', ',')}
AY;${results.b.toFixed(9).replace('.', ',')}
BY;${results.a.toFixed(9).replace('.', ',')}
CY;${results.Ty.toFixed(3).replace('.', ',')}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parametros_matriz_inversa_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>Ajuste Geométrico (Matriz Inversa)</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="tabs" style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
            <button 
              className={`btn ${activeTab === 1 ? 'btn-primary' : 'btn-secondary'}`} 
              onClick={() => { setActiveTab(1); resetState(); }}
              style={{ flex: 1, padding: '10px' }}
            >
              1. Ajuste Automágico a Catastro
            </button>
            <button 
              className={`btn ${activeTab === 2 ? 'btn-primary' : 'btn-secondary'}`} 
              onClick={() => { setActiveTab(2); resetState(); }}
              style={{ flex: 1, padding: '10px' }}
            >
              2. Extraer Parámetros (2 Parcelas)
            </button>
          </div>

          {errorMsg && (
            <div className="alert alert-error blink-error" style={{ 
              marginBottom: '15px', 
              backgroundColor: 'rgba(239, 68, 68, 0.1)', 
              color: '#ef4444', 
              border: '2px solid #ef4444',
              padding: '12px',
              borderRadius: '6px',
              animation: 'strongBlink 1.2s infinite'
            }}>
              <style>{`
                @keyframes strongBlink {
                  0%, 100% { opacity: 1; box-shadow: 0 0 5px rgba(239, 68, 68, 0.4); }
                  50% { opacity: 0.4; box-shadow: 0 0 20px rgba(239, 68, 68, 0.8); }
                }
              `}</style>
              <strong>Error:</strong> {errorMsg}
            </div>
          )}

          {activeTab === 1 && (
            <div>
              <p style={{ fontSize: '0.85rem', color: '#ccc', marginBottom: '15px' }}>
                Selecciona la geometría obtenida en campo. El sistema cruzará datos con la Sede de Catastro 
                para encontrar la parcela oficial más cercana y calculará la rotación y traslación óptima iterando hasta obtener el mejor encaje posible. Generará la versión "Adaptada".
              </p>
              <div className="form-group">
                <label>Parcela de la Realidad Física (Origen)</label>
                <select 
                  className="form-control" 
                  value={selectedRealMapId} 
                  onChange={(e) => setSelectedRealMapId(e.target.value)}
                >
                  <option value="">-- Selecciona una parcela --</option>
                  {validParcels.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <button 
                className="btn btn-primary" 
                onClick={handleRunOption1} 
                disabled={isProcessing}
                style={{ width: '100%', marginTop: '10px', padding: '12px' }}
              >
                {isProcessing ? 'Procesando ajuste espacial...' : 'Calcular Ajuste Automático'}
              </button>
            </div>
          )}

          {activeTab === 2 && (
            <div>
              <p style={{ fontSize: '0.85rem', color: '#ccc', marginBottom: '15px' }}>
                Selecciona las dos geometrías: la del levantamiento (origen) y la que has encajado visualmente a catastro (adaptada). Extraeremos matemáticamente **Tx**, **Ty** y el **Giro** necesarios para formalizar los anexos obligatorios mediante el método de Matriz Inversa.
                <br/><strong style={{ color: 'var(--accent-primary)' }}>NOTA IMPORTANTE: Ambas líneas deben estar formadas por exactamente el mismo número y orden de vértices topológicos.</strong>
              </p>
              
              <div className="form-group" style={{ marginBottom: '10px' }}>
                <label>Parcela de la Realidad Física (Origen)</label>
                <select 
                  className="form-control" 
                  value={selectedRealMapId} 
                  onChange={(e) => setSelectedRealMapId(e.target.value)}
                >
                  <option value="">-- Selecciona una parcela --</option>
                  {validParcels.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>Parcela Ya Adaptada a Catastro (Destino)</label>
                <select 
                  className="form-control" 
                  value={selectedAdaptedId} 
                  onChange={(e) => setSelectedAdaptedId(e.target.value)}
                >
                  <option value="">-- Selecciona una parcela --</option>
                  {validParcels.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <button 
                className="btn btn-primary" 
                onClick={handleRunOption2} 
                style={{ width: '100%', padding: '12px' }}
              >
                Extraer Parámetros de Transformación
              </button>
            </div>
          )}

          {results && !errorMsg && (
            <div className="results-panel glass-card" style={{ marginTop: '20px', padding: '15px', border: '1px solid var(--accent-primary)' }}>
              <h4 style={{ margin: '0 0 10px 0', color: 'var(--accent-primary)' }}>Resultados de Transformación (Matriz Inversa)</h4>
              
              {activeTab === 2 ? (
                <div style={{ textAlign: 'center' }}>
                  <table style={{ width: '100%', maxWidth: '300px', margin: '0 auto 15px auto', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem', backgroundColor: '#fff', color: '#000' }}>
                    <thead>
                      <tr>
                        <th colSpan="2" style={{ backgroundColor: '#7baaf7', color: '#000', padding: '6px', border: '1px solid #000', textTransform: 'uppercase' }}>
                          PARAMETROS DE DESPLAZAMIENTO CATASTRO
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td style={{ border: '1px solid #000', padding: '4px', fontWeight: 'bold' }}>AX</td><td style={{ border: '1px solid #000', padding: '4px' }}>{results.a.toFixed(9).replace('.', ',')}</td></tr>
                      <tr><td style={{ border: '1px solid #000', padding: '4px', fontWeight: 'bold' }}>BX</td><td style={{ border: '1px solid #000', padding: '4px' }}>{(-results.b).toFixed(9).replace('.', ',')}</td></tr>
                      <tr><td style={{ border: '1px solid #000', padding: '4px', fontWeight: 'bold' }}>CX</td><td style={{ border: '1px solid #000', padding: '4px' }}>{results.Tx.toFixed(3).replace('.', ',')}</td></tr>
                      <tr><td style={{ border: '1px solid #000', padding: '4px', fontWeight: 'bold' }}>AY</td><td style={{ border: '1px solid #000', padding: '4px' }}>{results.b.toFixed(9).replace('.', ',')}</td></tr>
                      <tr><td style={{ border: '1px solid #000', padding: '4px', fontWeight: 'bold' }}>BY</td><td style={{ border: '1px solid #000', padding: '4px' }}>{results.a.toFixed(9).replace('.', ',')}</td></tr>
                      <tr><td style={{ border: '1px solid #000', padding: '4px', fontWeight: 'bold' }}>CY</td><td style={{ border: '1px solid #000', padding: '4px' }}>{results.Ty.toFixed(3).replace('.', ',')}</td></tr>
                    </tbody>
                  </table>
                  <button 
                    onClick={handleDownloadCSV}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Download size={14} />
                    Descargar en Excel
                  </button>
                </div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem', lineHeight: '1.6' }}>
                  <li><strong>Desplazamiento X (Tx):</strong> {results.Tx.toFixed(3)} m</li>
                  <li><strong>Desplazamiento Y (Ty):</strong> {results.Ty.toFixed(3)} m</li>
                  <li><strong>Giro (Rotación):</strong> {results.rotationDeg.toFixed(6)}°</li>
                  <li><strong>Factor de Escala (K):</strong> {results.scale.toFixed(6)}</li>
                </ul>
              )}
              
              {activeTab === 1 && (
                <p style={{ marginTop: '10px', fontSize: '0.8rem', color: '#8fbc8f' }}>
                  ✓ La parcela adaptada se ha añadido a tu proyecto con éxito. Ya puedes exportarla en formato GML o DXF.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
