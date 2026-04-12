import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { calculateHelmertParameters, findBestCadastreFit, applyHelmertTransformation } from '../utils/transformations';
import { calculateBbox, calculatePolygonArea, closeRing, transformToWGS84, calculateCentroid } from '../utils/geoUtils';
import { fetchParcelsByBbox } from '../utils/cadastreService';

export default function CramerModal({ isOpen, onClose, parcels, huso, onAddParcel }) {
  const [activeTab, setActiveTab] = useState(1);
  const [selectedRealMapId, setSelectedRealMapId] = useState('');
  const [selectedAdaptedId, setSelectedAdaptedId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [results, setResults] = useState(null);
  const [fitAlternatives, setFitAlternatives] = useState([]);
  const [currentFitIndex, setCurrentFitIndex] = useState(0);
  const [params3P, setParams3P] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualOffsetX, setManualOffsetX] = useState(0);
  const [manualOffsetY, setManualOffsetY] = useState(0);

  // Evita pintar valores como -0.000000000
  const formatZero = (val, dec) => {
    if (typeof val !== 'number') return val;
    const str = val.toFixed(dec);
    // Si la cadena es idéntica a -0.000... retorna 0.000...
    if (str.match(/^-0\.0+$/)) return str.substring(1);
    return str;
  };

  const getOuterRing = (coords) => {
    if (!coords || !coords[0]) return null;
    if (typeof coords[0][0] === 'number') return coords; // Ring: [[x,y], ...]
    if (typeof coords[0][0][0] === 'number') return coords[0]; // Polygon: [ [[x,y]], [[x,y]] ]
    if (typeof coords[0][0][0][0] === 'number') return coords[0][0]; // MultiPolygon
    return coords;
  };

  if (!isOpen) return null;

  const validParcels = parcels.filter(p => !p.isCadastre && p.originalCoords);
  const realParcel = validParcels.find(p => p.id === selectedRealMapId);
  const adaptedParcel = validParcels.find(p => p.id === selectedAdaptedId);

  const resetState = () => {
    setErrorMsg('');
    setResults(null);
    setFitAlternatives([]);
    setCurrentFitIndex(0);
    setParams3P(null);
  };

  const applyAlternative = (index, fitsArray) => {
    const activeFits = fitsArray || fitAlternatives;
    if (!activeFits || activeFits.length === 0) return;

    const fit = activeFits[index];
    setResults(fit);
    setCurrentFitIndex(index);

    const newCoords = applyHelmertTransformation(realParcel.originalCoords, fit);

    let wgs84Coords;
    if (realParcel.geometry.type === 'MultiPolygon') {
      wgs84Coords = newCoords.map(ring => transformToWGS84(ring, huso));
    } else {
      wgs84Coords = newCoords.map(ring => transformToWGS84(ring, huso));
    }

    const geom = {
      type: 'Polygon',
      coordinates: wgs84Coords
    };

    const newArea = calculatePolygonArea(newCoords[0]);
    const adaptedName = `${realParcel.name} (ADAPTADA)`;

    // Usar un ID fijo en base al origen para que App.jsx lo sobreescriba en vez de duplicarlo cada vez
    const adaptedId = `adapted-${realParcel.id}`;

    onAddParcel({
      id: adaptedId,
      name: adaptedName,
      filename: `${adaptedName}.gml`,
      geometry: geom,
      originalCoords: newCoords,
      area: newArea,
      huso: huso,
      isGmlV4: false
    });

    // Auto-select for the Cramer matrix tab
    setSelectedAdaptedId(adaptedId);
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

      // Run iterative fit returning an array of top alternatives
      const options = {
        manualOffsetX: parseFloat(manualOffsetX) || 0,
        manualOffsetY: parseFloat(manualOffsetY) || 0
      };
      const fits = findBestCadastreFit(realParcel.originalCoords, closestCadastre.originalCoords, options);

      setFitAlternatives(fits);
      applyAlternative(0, fits);

    } catch (e) {
      setErrorMsg(e.message || "Error al realizar el ajuste automático.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunOption2 = (downloadPdf = false) => {
    resetState();

    if (!selectedRealMapId || !selectedAdaptedId) {
      setErrorMsg("Debes seleccionar ambas parcelas: la original (realidad física) y la adaptada.");
      return;
    }

    const ring1 = getOuterRing(realParcel?.originalCoords);
    const ring2 = getOuterRing(adaptedParcel?.originalCoords);

    if (!ring1 || !ring2 || ring1.length !== ring2.length || ring1.length < 3) {
      setErrorMsg("Ambas parcelas deben tener exactamente el mismo número y orden de vértices.");
      return;
    }

    const n = ring1.length;
    let idx1 = 0;
    let idx2 = Math.floor(n / 3);
    let idx3 = Math.floor(2 * n / 3);

    const x1 = ring1[idx1][0]; const y1 = ring1[idx1][1];
    const x2 = ring1[idx2][0]; const y2 = ring1[idx2][1];
    const x3 = ring1[idx3][0]; const y3 = ring1[idx3][1];

    const xp1 = ring2[idx1][0]; const yp1 = ring2[idx1][1];
    const xp2 = ring2[idx2][0]; const yp2 = ring2[idx2][1];
    const xp3 = ring2[idx3][0]; const yp3 = ring2[idx3][1];

    const dx2 = x2 - x1; const dy2 = y2 - y1;
    const dx3 = x3 - x1; const dy3 = y3 - y1;

    const dxp2 = xp2 - xp1; const dyp2 = yp2 - yp1;
    const dxp3 = xp3 - xp1; const dyp3 = yp3 - yp1;

    const D = dx2 * dy3 - dx3 * dy2;
    if (Math.abs(D) < 1e-10) {
      setErrorMsg('Los vértices de la parcela son colineales y no configuran un polígono válido para esta matriz.');
      return;
    }

    const ax = (dxp2 * dy3 - dxp3 * dy2) / D;
    const bx = (dx2 * dxp3 - dx3 * dxp2) / D;
    const cx = xp1 - ax * x1 - bx * y1;

    const ay = (dyp2 * dy3 - dyp3 * dy2) / D;
    const by = (dx2 * dyp3 - dx3 * dyp2) / D;
    const cy = yp1 - ay * x1 - by * y1;

    // RUN LEAST SQUARES MATRIX INVERSE METHOD (4 PARAMETERS) AS VERIFICATION
    const helmert = calculateHelmertParameters(ring1, ring2);

    // CALCULATE RESIDUALS FOR ALL POINTS
    const residuals = ring1.map((p, i) => {
      const rx = p[0];
      const ry = p[1];
      const cxF = ax * rx + bx * ry + cx;
      const cyF = ay * rx + by * ry + cy;

      const destX = ring2[i][0];
      const destY = ring2[i][1];

      const errX = cxF - destX;
      const errY = cyF - destY;
      const errDist = Math.hypot(errX, errY);

      return { id: i + 1, errX, errY, errDist };
    });

    const maxErr = Math.max(...residuals.map(r => r.errDist));
    const avgErr = residuals.reduce((acc, r) => acc + r.errDist, 0) / residuals.length;

    setParams3P({ ax, bx, cx, ay, by, cy, helmert, residuals, maxErr, avgErr, pdfDownloaded: downloadPdf });

    if (downloadPdf) {
      // GENERATE PDF
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("INFORME DE CÁLCULO DE PARÁMETROS DE DESPLAZAMIENTO", 14, 20);
      doc.setFontSize(11);
      doc.text("Cálculo mediante Cramer (3 Puntos) y Matriz Inversa M.C.", 14, 28);

      autoTable(doc, {
        startY: 35,
        head: [['Punto', 'X (Física)', 'Y (Física)', "X' (Catastro)", "Y' (Catastro)"]],
        body: [
          [(idx1 + 1).toString(), formatZero(x1, 3), formatZero(y1, 3), formatZero(xp1, 3), formatZero(yp1, 3)],
          [(idx2 + 1).toString(), formatZero(x2, 3), formatZero(y2, 3), formatZero(xp2, 3), formatZero(yp2, 3)],
          [(idx3 + 1).toString(), formatZero(x3, 3), formatZero(y3, 3), formatZero(xp3, 3), formatZero(yp3, 3)],
        ]
      });

      let currentY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text("1. Parámetros Exactos (Método Cramer por 3 puntos):", 14, currentY);

      const axS = formatZero(ax, 9);
      const bxS = formatZero(bx, 9);
      const cxS = formatZero(cx, 3);
      const ayS = formatZero(ay, 9);
      const byS = formatZero(by, 9);
      const cyS = formatZero(cy, 3);

      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text("Ecuación Genérica: X' = AX * X + BX * Y + CX  |  Y' = AY * X + BY * Y + CY", 14, currentY + 6);
      doc.text(`Ecuación Eje X: X' = (${axS}) * X + (${bxS}) * Y + (${cxS})`, 14, currentY + 11);
      doc.text(`Ecuación Eje Y: Y' = (${ayS}) * X + (${byS}) * Y + (${cyS})`, 14, currentY + 16);
      doc.setTextColor(0);

      const paramData = [
        ['AX', axS, 'AY', ayS],
        ['BX', bxS, 'BY', byS],
        ['CX (Tx)', cxS, 'CY (Ty)', cyS]
      ];

      autoTable(doc, {
        startY: currentY + 21,
        head: [['Eje X', 'Valor', 'Eje Y', 'Valor']],
        body: paramData
      });

      currentY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text("2. Verificación Mínimos Cuadrados (Todas las coordenadas):", 14, currentY);

      if (helmert.errorMsg) {
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text("Error en verificación: " + helmert.errorMsg, 14, currentY + 7);
        doc.setTextColor(0);
        currentY += 15;
      } else {
        const haS = formatZero(helmert.a, 9);
        const hbS = formatZero(helmert.b, 9);
        const hTxS = formatZero(helmert.Tx, 3);
        const hTyS = formatZero(helmert.Ty, 3);

        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text("Ecuación Genérica: X' = a * X - b * Y + Tx  |  Y' = b * X + a * Y + Ty", 14, currentY + 6);
        doc.text(`Ecuación Eje X: X' = (${haS}) * X - (${hbS}) * Y + (${hTxS})`, 14, currentY + 11);
        doc.text(`Ecuación Eje Y: Y' = (${hbS}) * X + (${haS}) * Y + (${hTyS})`, 14, currentY + 16);
        doc.setTextColor(0);

        const helmertData = [
          ['AX', haS, 'AY', hbS],
          ['BX', formatZero(-helmert.b, 9), 'BY', haS],
          ['CX (Tx)', hTxS, 'CY (Ty)', hTyS]
        ];
        autoTable(doc, {
          startY: currentY + 21,
          head: [['Eje X', 'Valor', 'Eje Y', 'Valor']],
          body: helmertData
        });
        currentY = doc.lastAutoTable.finalY + 10;
      }

      doc.setFontSize(12);
      doc.text("Comprobación de Coordenadas de todo el Perímetro:", 14, currentY);

      const verificationBody = [];
      let totalErrorCramer = 0;
      let maxErrorCramer = 0;

      for (let i = 0; i < ring1.length; i++) {
        let rx = ring1[i][0];
        let ry = ring1[i][1];
        let cxF = ax * rx + bx * ry + cx;
        let cyF = ay * rx + by * ry + cy;

        let destX = ring2[i][0];
        let destY = ring2[i][1];

        let errDist = Math.hypot(cxF - destX, cyF - destY);
        totalErrorCramer += errDist;
        if (errDist > maxErrorCramer) maxErrorCramer = errDist;

        verificationBody.push([
          (i + 1).toString(),
          formatZero(rx, 3), formatZero(ry, 3),
          formatZero(destX, 3), formatZero(destY, 3),
          formatZero(cxF, 3), formatZero(cyF, 3),
          formatZero(errDist, 3)
        ]);
      }

      autoTable(doc, {
        startY: currentY + 5,
        head: [['Nº', 'X Física', 'Y Física', 'X Catastro', 'Y Catastro', 'X Calc.', 'Y Calc.', 'Error (m)']],
        body: verificationBody,
        styles: { fontSize: 8 }, // Reduce font to fit more columns
        headStyles: { fillGray: 200 }
      });

      currentY = doc.lastAutoTable.finalY + 8;
      doc.setFontSize(10);
      doc.text(`Error Máximo Cramer: ${formatZero(maxErrorCramer, 3)} m`, 14, currentY);
      doc.text(`Error Medio Cramer: ${(totalErrorCramer / ring1.length).toFixed(3)} m`, 14, currentY + 5);

      if (!helmert.errorMsg) {
        currentY += 15;
        doc.setFontSize(12);
        doc.text("Comprobación Mínimos Cuadrados (Matriz Inversa):", 14, currentY);

        const verificationHelmert = [];
        let totalErrorHelmert = 0;
        let maxErrorHelmert = 0;

        for (let i = 0; i < ring1.length; i++) {
          let rx = ring1[i][0];
          let ry = ring1[i][1];

          let hX = rx * helmert.a - ry * helmert.b + helmert.Tx;
          let hY = rx * helmert.b + ry * helmert.a + helmert.Ty;

          let destX = ring2[i][0];
          let destY = ring2[i][1];

          let errDist = Math.hypot(hX - destX, hY - destY);
          totalErrorHelmert += errDist;
          if (errDist > maxErrorHelmert) maxErrorHelmert = errDist;

          verificationHelmert.push([
            (i + 1).toString(),
            formatZero(rx, 3), formatZero(ry, 3),
            formatZero(destX, 3), formatZero(destY, 3),
            formatZero(hX, 3), formatZero(hY, 3),
            formatZero(errDist, 3)
          ]);
        }

        autoTable(doc, {
          startY: currentY + 5,
          head: [['Nº', 'X Física', 'Y Física', 'X Catastro', 'Y Catastro', 'X Calc.', 'Y Calc.', 'Error (m)']],
          body: verificationHelmert,
          styles: { fontSize: 8 }
        });

        currentY = doc.lastAutoTable.finalY + 8;
        doc.setFontSize(10);
        doc.text(`Error Máximo M. Cuadrados: ${formatZero(maxErrorHelmert, 3)} m`, 14, currentY);
        doc.text(`Error Medio M. Cuadrados: ${(totalErrorHelmert / ring1.length).toFixed(3)} m`, 14, currentY + 5);
      }

      // --- ADD FOOTERS TO ALL PAGES ---
      const pageCount = doc.internal.getNumberOfPages();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);

        // Formateado legal/visual
        doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
        doc.text("Generado exclusivamente mediante herramienta topográfica online: generador-gml.xyz", 14, pageHeight - 10);
        doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
      }

      doc.save(`Informe_Desplazamiento_Catastro_${Date.now()}.pdf`);
    }
  };

  const handleExportExcel = () => {
    if (!params3P || !realParcel || !adaptedParcel) return;

    const ring1 = getOuterRing(realParcel.originalCoords);
    const ring2 = getOuterRing(adaptedParcel.originalCoords);

    // 1. Data for Parameters Sheet
    const paramRows = [
      { Parametro: 'Metodo', Valor: 'Cramer (3 Puntos)' },
      { Parametro: 'AX', Valor: params3P.ax },
      { Parametro: 'BX', Valor: params3P.bx },
      { Parametro: 'CX', Valor: params3P.cx },
      { Parametro: 'AY', Valor: params3P.ay },
      { Parametro: 'BY', Valor: params3P.by },
      { Parametro: 'CY', Valor: params3P.cy },
      { Parametro: '', Valor: '' },
      { Parametro: 'Verificacion (Helmerta)', Valor: '' },
      { Parametro: 'a', Valor: params3P.helmert.a },
      { Parametro: 'b', Valor: params3P.helmert.b },
      { Parametro: 'Tx', Valor: params3P.helmert.Tx },
      { Parametro: 'Ty', Valor: params3P.helmert.Ty },
      { Parametro: '', Valor: '' },
      { Parametro: 'Error Maximo', Valor: params3P.maxErr },
      { Parametro: 'Error Medio', Valor: params3P.avgErr }
    ];

    // 2. Data for Vertices Sheet
    const vertexRows = ring1.map((p, i) => {
      const rx = p[0];
      const ry = p[1];
      const destX = ring2[i][0];
      const destY = ring2[i][1];
      // Recalc calc coordinates to ensure they match what's in the state
      const cxF = params3P.ax * rx + params3P.bx * ry + params3P.cx;
      const cyF = params3P.ay * rx + params3P.by * ry + params3P.cy;
      const err = Math.hypot(cxF - destX, cyF - destY);

      return {
        Punto: i + 1,
        'X Fisica': rx,
        'Y Fisica': ry,
        'X Catastro': destX,
        'Y Catastro': destY,
        'X Calculada': cxF,
        'Y Calculada': cyF,
        'Error (m)': err
      };
    });

    // Create workbook and sheets
    const wb = XLSX.utils.book_new();
    const wsParams = XLSX.utils.json_to_sheet(paramRows);
    const wsVertices = XLSX.utils.json_to_sheet(vertexRows);

    XLSX.utils.book_append_sheet(wb, wsParams, "Parametros");
    XLSX.utils.book_append_sheet(wb, wsVertices, "Vertices");

    // Save File
    XLSX.writeFile(wb, `Parametros_Desplazamiento_${realParcel.name}_${Date.now()}.xlsx`);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>PARÁMETROS DESPLAZAMIENTO</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="tabs" style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
            <button
              className={`btn ${activeTab === 1 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setActiveTab(1); resetState(); }}
              style={{ flex: 1, padding: '10px', fontSize: '0.9rem' }}
            >
              1. Extraer Parámetros (PDF)
            </button>
            <button
              className={`btn ${activeTab === 2 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setActiveTab(2); resetState(); }}
              style={{ flex: 1, padding: '10px' }}
            >
              2. Ajuste Automágico a Catastro (beta)
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

          {activeTab === 2 && (
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

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '12px', marginBottom: '15px' }}>
                <label style={{ color: '#38bdf8', fontSize: '0.8rem', display: 'block', marginBottom: '10px' }}>Guía Manual Opcional (Desplazamiento inicial del foco)</label>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.7rem', color: '#999' }}>Eje X (Este / Oeste) [m]</label>
                    <input
                      type="number"
                      step="0.5"
                      className="form-control"
                      placeholder="Ej. 2.0 (Este)"
                      value={manualOffsetX}
                      onChange={(e) => setManualOffsetX(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.7rem', color: '#999' }}>Eje Y (Norte / Sur) [m]</label>
                    <input
                      type="number"
                      step="0.5"
                      className="form-control"
                      placeholder="Ej. -1.5 (Sur)"
                      value={manualOffsetY}
                      onChange={(e) => setManualOffsetY(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div style={{ background: 'rgba(56, 189, 248, 0.1)', borderLeft: '3px solid #38bdf8', padding: '10px', fontSize: '0.8rem', color: '#e0f2fe', marginBottom: '15px' }}>
                💡 <strong>Tip visual:</strong> Puedes pulsar el botón "X" o cerrar esta ventana libremente para ver el mapa en pantalla completa y comprobar cómo queda la parcela. Tus datos y el progreso de ajuste se mantienen intactos al volver a abrir.
              </div>

              <button
                className="btn btn-primary"
                onClick={handleRunOption1}
                disabled={isProcessing}
                style={{ width: '100%', marginTop: '10px', padding: '12px' }}
              >
                {isProcessing ? 'Procesando ajuste espacial...' : 'Calcular Ajuste Automágico'}
              </button>
            </div>
          )}

          {activeTab === 1 && (
            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '5px' }}>
              <p style={{ fontSize: '0.85rem', color: '#ccc', marginBottom: '15px' }}>
                Selecciona la geometría física de origen y la adaptada a Catastro. El sistema extraerá de forma automática 3 puntos no colineales mediante Matriz Inversa y exportará un **Informe en PDF** con los parámetros deducidos junto a la comprobación vértice por vértice del ajuste perimetral. Ademas de un fichero excel con los mismos datos para su uso en otros programas.
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

              <div style={{ display: 'flex', gap: '8px', marginTop: '15px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleRunOption2(false)}
                  style={{ flex: '1 1 100%', padding: '10px' }}
                >
                  Solo Calcular Parámetros
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleRunOption2(true)}
                  style={{ flex: 1, padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Download size={18} />
                  PDF
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleExportExcel}
                  style={{ flex: 1, padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#166534', borderColor: '#15803d' }}
                >
                  <Download size={18} />
                  Excel
                </button>
              </div>

              {params3P && (
                <div className="results-panel glass-card" style={{ marginTop: '20px', padding: '15px', border: '1px solid var(--accent-primary)' }}>
                  <p style={{ fontSize: '0.8rem', color: '#8fbc8f', marginBottom: '10px' }}>
                    ✓ {params3P.pdfDownloaded ? "El PDF ha sido exportado. Estos son los parámetros calculados:" : "Parámetros calculados en pantalla:"}
                  </p>
                  <h4 style={{ margin: '0 0 10px 0', color: 'var(--accent-primary)' }}>MATRIZ DE PARÁMETROS (3 Puntos)</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.85rem', backgroundColor: '#2a2a2a', color: '#fff', marginBottom: '15px' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '5px', border: '1px solid #444', color: '#7baaf7' }}>PARÁMETROS</th>
                        <th style={{ padding: '5px', border: '1px solid #444', color: '#7baaf7' }}>VALORES</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td style={{ border: '1px solid #444', padding: '5px' }}>AX</td><td style={{ border: '1px solid #444', padding: '5px' }}>{formatZero(params3P.ax, 9)}</td></tr>
                      <tr><td style={{ border: '1px solid #444', padding: '5px' }}>BX</td><td style={{ border: '1px solid #444', padding: '5px' }}>{formatZero(params3P.bx, 9)}</td></tr>
                      <tr><td style={{ border: '1px solid #444', padding: '5px' }}>CX</td><td style={{ border: '1px solid #444', padding: '5px' }}>{formatZero(params3P.cx, 3)}</td></tr>
                      <tr><td style={{ border: '1px solid #444', padding: '5px', borderTop: '2px solid #555' }}>AY</td><td style={{ border: '1px solid #444', padding: '5px', borderTop: '2px solid #555' }}>{formatZero(params3P.ay, 9)}</td></tr>
                      <tr><td style={{ border: '1px solid #444', padding: '5px' }}>BY</td><td style={{ border: '1px solid #444', padding: '5px' }}>{formatZero(params3P.by, 9)}</td></tr>
                      <tr><td style={{ border: '1px solid #444', padding: '5px' }}>CY</td><td style={{ border: '1px solid #444', padding: '5px' }}>{formatZero(params3P.cy, 3)}</td></tr>
                    </tbody>
                  </table>

                  <h4 style={{ margin: '15px 0 10px 0', color: 'var(--accent-primary)', fontSize: '0.9rem' }}>COMPROBACIÓN DE RESIDUOS (VÉRTICES)</h4>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #444' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.75rem', backgroundColor: '#1a1a1a', color: '#ccc' }}>
                      <thead style={{ position: 'sticky', top: 0, backgroundColor: '#333' }}>
                        <tr>
                          <th style={{ padding: '4px', border: '1px solid #444' }}>Punto</th>
                          <th style={{ padding: '4px', border: '1px solid #444' }}>Error (m)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {params3P.residuals.map(r => (
                          <tr key={r.id}>
                            <td style={{ border: '1px solid #444', padding: '3px' }}>{r.id}</td>
                            <td style={{ border: '1px solid #444', padding: '3px', color: r.errDist > 0.05 ? '#ff4d4d' : '#4ade80' }}>
                              {r.errDist.toFixed(3)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#ccc', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Error Máximo: <strong style={{ color: params3P.maxErr > 0.05 ? '#ff4d4d' : '#4ade80' }}>{params3P.maxErr.toFixed(3)} m</strong></span>
                    <span>Error Medio: <strong>{params3P.avgErr.toFixed(3)} m</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {results && !errorMsg && activeTab === 2 && (
            <div className="results-panel glass-card" style={{ marginTop: '20px', padding: '15px', border: '1px solid var(--accent-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0, color: 'var(--accent-primary)' }}>Resultados de Traslación/Rotación (Alt. {currentFitIndex + 1}/{fitAlternatives.length})</h4>

                {fitAlternatives.length > 1 && (
                  <button
                    onClick={() => applyAlternative((currentFitIndex + 1) % fitAlternatives.length)}
                    style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid #38bdf8', color: '#38bdf8', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                  >
                    🔄 Probar otra alternativa
                  </button>
                )}
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem', lineHeight: '1.6' }}>
                <li><strong>Desplazamiento X (Tx):</strong> {results.Tx.toFixed(3)} m</li>
                <li><strong>Desplazamiento Y (Ty):</strong> {results.Ty.toFixed(3)} m</li>
                <li><strong>Giro (Rotación):</strong> {results.rotationDeg.toFixed(6)}°</li>
                <li><strong>Factor de Escala (K):</strong> {results.scale.toFixed(6)}</li>
              </ul>

              <p style={{ marginTop: '10px', fontSize: '0.8rem', color: '#8fbc8f' }}>
                ✓ La parcela adaptada se ha añadido a tu proyecto con éxito. Ya puedes exportarla en formato GML o DXF.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
