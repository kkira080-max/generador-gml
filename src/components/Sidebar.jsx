import React, { useState } from 'react';
import { UploadCloud, FileJson, AlertCircle, AlertTriangle, Download, Trash2, Map, Eye, EyeOff, List, Building, Search, Loader2, LifeBuoy } from 'lucide-react';
import JSZip from 'jszip';
import { parseGML } from '../utils/gmlParser';
import { parseDXF } from '../utils/dxfParser';
import { generateGMLv4 } from '../utils/gmlGenerator';
import { generateDXF } from '../utils/dxfGenerator';
import { validateTopology, calculatePerimeter } from '../utils/geoUtils';
import Statistics from './Statistics';
import { generateGeoJSON, generateKML } from '../utils/exportUtils';


export default function Sidebar({
  parcels,
  visibleParcelIds,
  toggleParcelVisibility,
  expandedParcelIds,
  toggleParcelDetails,
  onFilesParsed,
  onClearParcels,
  onOpenBuildingModal,
  onDetectCadastreAffections,
  isProcessingCadastre,
  huso,
  setHuso,
  detectIslands,
  setDetectIslands,
  adjustmentSession,
  onConfirmAdjustment,
  onCancelAdjustment,
  onDeleteParcel,
  onIvgaCheck,
  ivgaReport,
  topologyStatus = {},
  onFlyToLocation,
  stats,
  onIncrementStat,
  onOpenSupportModal
}) {

  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchRefCat, setSearchRefCat] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setErrorMsg('');

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const processFiles = async (files) => {
    const validExtensions = ['.gml', '.dxf'];
    const invalidFiles = Array.from(files).filter(file => {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      return !validExtensions.includes(ext);
    });

    if (invalidFiles.length > 0) {
      setErrorMsg('Error: Solo se aceptan ficheros con extensión .gml o .dxf');
      return;
    }

    try {
      let newParcels = [];
      for (const file of Array.from(files)) {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (ext === '.gml') {
          const p = await parseGML(file);
          newParcels = newParcels.concat(p);
        } else if (ext === '.dxf') {
          const p = await parseDXF(file, huso);
          newParcels = newParcels.concat(p);
        }
      }
      onFilesParsed(newParcels);
    } catch (e) {
      setErrorMsg(e.message || 'Error al procesar los ficheros.');
    }
  };

  const handleGenerateDXF = async () => {
    const visibleParcels = parcels.filter(p => visibleParcelIds.has(p.id));
    if (visibleParcels.length === 0) {
      setErrorMsg('Error: No hay parcelas visibles para exportar.');
      return;
    }

    // Determine the base filename from the first valid GML (if available)
    let baseFileName = "exportacion_gml_convertido.dxf";
    const gmlParcel = visibleParcels.find(p => p.filename && p.filename.toLowerCase().endsWith('.gml'));
    if (gmlParcel) {
      baseFileName = gmlParcel.filename.substring(0, gmlParcel.filename.lastIndexOf('.')) + '.dxf';
    }

    const dxfString = generateDXF(visibleParcels);
    if (dxfString) {
      const blob = new Blob([dxfString], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = baseFileName;
      a.click();
      URL.revokeObjectURL(url);
      onIncrementStat('downloads');
    }

  };

  const handleGenerateGML = async () => {
    const visibleParcels = parcels.filter(p => visibleParcelIds.has(p.id));
    if (visibleParcels.length === 0) {
      setErrorMsg('Error: No hay parcelas visibles para exportar.');
      return;
    }

    // Check if there are any GMLv4 files already loaded. We block GML->GMLv4 generation for them.
    const hasGmlV4Parcels = visibleParcels.some(p => p.isGmlV4);
    if (hasGmlV4Parcels) {
      setErrorMsg('Error: Hay ficheros GML v4 cargados. Ya están en el formato final, no se permite regenerarlos. (Pero sí puedes Exportarlos a DXF).');
      return;
    }

    // Check if there's any file loaded from DXF
    const hasDxfParcels = visibleParcels.some(p => p.filename && p.filename.toLowerCase().endsWith('.dxf'));

    // For DXF files, user HUSO selection is strictly mandatory
    if (hasDxfParcels && !huso) {
      setErrorMsg('Error: Has cargado un fichero DXF. Es obligatorio seleccionar el Sistema de Referencia (HUSO) manualmente antes de generar.');
      return;
    }

    // Mandatory closure check for all parcels before generation
    const hasOpenRings = (rings) => {
      if (!rings || !Array.isArray(rings)) return true;
      return rings.some(ring => {
        if (!ring || ring.length < 4) return true;
        const first = ring[0];
        const last = ring[ring.length - 1];
        // 1mm tolerance for closure
        return Math.abs(first[0] - last[0]) > 0.001 || Math.abs(first[1] - last[1]) > 0.001;
      });
    };

    const parcelsWithOpenRings = visibleParcels.filter(p => hasOpenRings(p.originalCoords || []));
    if (parcelsWithOpenRings.length > 0) {
      const names = parcelsWithOpenRings.map(p => p.name).join(', ');
      setErrorMsg(`Error de geometría: Las siguientes parcelas no están cerradas (polilíneas abiertas): ${names}. Todos los recintos deben estar cerrados para generar el GML.`);
      return;
    }

    // For GMLs or combined, if a parcel lacks an EPSG (should only happen if GML was completely broken), require it.
    const missingHuso = visibleParcels.some(p => !p.huso);
    if (!huso && missingHuso) {
      setErrorMsg('Error: Parcela sin HUSO detectado. Selecciona un HUSO (EPSG) antes de generar.');
      return;
    }

    // Function to generate sequence like 1a, 1b, 1c...
    const getSequenceName = (index) => {
      const num = Math.floor(index / 26) + 1;
      const letter = String.fromCharCode(65 + (index % 26));
      return `${num}${letter}`;
    };

    let anonymousCounter = 0;

    // Group parcels by their source filename. 
    // EXCEPT for DXFs, where every parcel must stand on its own file.
    let filesToGenerate = []; // Array of { outName: string, parcels: [] }

    const gmlGroups = {}; // temporary object to group GML source files

    visibleParcels.forEach((parcel) => {
      const p = { ...parcel };
      let safeName = p.name ? p.name.trim() : '';
      if (!safeName || safeName.toLowerCase() === 'desconocido' || safeName.toLowerCase().startsWith('parcela ')) {
        const seqName = getSequenceName(anonymousCounter);
        p.name = seqName;
        anonymousCounter++;
      }
      p.name = p.name.replace(/[<>:"/\\|?*]+/g, '_');

      const isDxf = p.filename && p.filename.toLowerCase().endsWith('.dxf');

      if (isDxf) {
        // Individual file for each polyline
        let outName = p.name;
        if (!outName.toLowerCase().endsWith('.gml')) outName += '.gml';
        filesToGenerate.push({ outName, parcels: [p] });
      } else {
        // Group GML files together by source filename
        const fileKey = p.filename || 'generado.gml';
        if (!gmlGroups[fileKey]) gmlGroups[fileKey] = [];
        gmlGroups[fileKey].push(p);
      }
    });

    // Add regrouped GMLs to filesToGenerate
    for (const [fileKey, fileParcels] of Object.entries(gmlGroups)) {
      let outName = fileKey;
      if (fileParcels.length === 1) {
        outName = `${fileParcels[0].name}.gml`;
      } else if (!outName.toLowerCase().endsWith('.gml')) {
        outName += '.gml';
      }
      filesToGenerate.push({ outName, parcels: fileParcels });
    }

    // If there's only one file to generate, we can download it directly as a .gml
    if (filesToGenerate.length === 1) {
      const { outName, parcels: fileParcels } = filesToGenerate[0];

      const xmlString = generateGMLv4(fileParcels, huso);
      if (xmlString) {
        const blob = new Blob([xmlString], { type: 'application/xml;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = outName;
        a.click();
        URL.revokeObjectURL(url);
        onIncrementStat('conversions');
      }
      return;
    }

    // Multiple files -> generate a ZIP containing multiple GML files
    const zip = new JSZip();
    for (const fileObj of filesToGenerate) {
      const xmlString = generateGMLv4(fileObj.parcels, huso);
      if (xmlString) {
        zip.file(fileObj.outName, xmlString);
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parcelas_generadas_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    onIncrementStat('conversions');
  };

  const handleDownloadCoords = (p, format) => {
    const rings = p.originalCoords || [];
    let content = "";
    let vIndex = 1;
    let baseFileName = p.name || "parcela";

    if (format === 'csv') {
      content = "Punto,X (ESTE),Y (NORTE)\n";
      rings.forEach(ring => {
        ring.forEach((coord, idx) => {
          if (idx === ring.length - 1 && ring.length > 3) {
            const first = ring[0];
            if (Math.abs(first[0] - coord[0]) < 0.000001 && Math.abs(first[1] - coord[1]) < 0.000001) return;
          }
          content += `${vIndex},${coord[0].toFixed(3)},${coord[1].toFixed(3)}\n`;
          vIndex++;
        });
      });
    } else {
      content = `LISTADO DE COORDENADAS - ${p.name}\n`;
      content += `====================================\n`;
      content += `PUNTO\tX (ESTE)\tY (NORTE)\n`;
      rings.forEach(ring => {
        ring.forEach((coord, idx) => {
          if (idx === ring.length - 1 && ring.length > 3) {
            const first = ring[0];
            if (Math.abs(first[0] - coord[0]) < 0.000001 && Math.abs(first[1] - coord[1]) < 0.000001) return;
          }
          content += `${vIndex}\t${coord[0].toFixed(3)}\t${coord[1].toFixed(3)}\n`;
          vIndex++;
        });
      });
    }

    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseFileName}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    onIncrementStat('downloads');
  };

  const handleExportSingle = (p, format) => {
    let content = "";
    let mimeType = "";
    let extension = format;

    if (format === 'geojson') {
      content = generateGeoJSON([p]);
      mimeType = 'application/json;charset=utf-8;';
      extension = 'geojson';
    } else if (format === 'kml') {
      content = generateKML([p]);
      mimeType = 'application/vnd.google-earth.kml+xml;charset=utf-8;';
      extension = 'kml';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.name || "parcela"}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
    onIncrementStat('downloads');
  };

  const handleSearchCatastro = async (e) => {
    if (e) e.preventDefault();
    if (!searchRefCat || searchRefCat.length < 14) {
      setErrorMsg('Introduce una referencia catastral válida (mínimo 14 caracteres)');
      return;
    }

    setIsSearching(true);
    setErrorMsg('');

    try {
      // Use Consulta_CPMRC which returns coordinates (xcen, ycen)
      // The service requires SRS=EPSG:4326 and the parameter is "RC"
      const rc14 = searchRefCat.substring(0, 14).toUpperCase();
      const url = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_CPMRC?Provincia=&Municipio=&RC=${rc14}&SRS=EPSG:4326`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Error al conectar con la API del Catastro');

      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");

      // The structure is <geo><xcen>Longitude</xcen><ycen>Latitude</ycen></geo>
      const xcenNode = xmlDoc.getElementsByTagName("xcen")[0];
      const ycenNode = xmlDoc.getElementsByTagName("ycen")[0];

      if (xcenNode && ycenNode) {
        const lng = parseFloat(xcenNode.textContent);
        const lat = parseFloat(ycenNode.textContent);
        onFlyToLocation({ lat, lng, label: searchRefCat.toUpperCase() });
      } else {
        // Look for error description in <err><des>
        const descNode = xmlDoc.getElementsByTagName("des")[0];
        const errorText = descNode ? descNode.textContent : 'Referencia catastral no encontrada o sin coordenadas';
        throw new Error(errorText);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="sidebar">
      <header>
        <div className="title-container">
          <Map className="accent-icon" style={{ width: 28, height: 28, color: 'var(--accent-primary)' }} />
          <h1>GENERADOR GML <span style={{ fontSize: '0.6rem', background: 'var(--accent-primary)', color: '#000', padding: '2px 6px', borderRadius: '4px', verticalAlign: 'middle', marginLeft: '4px' }}></span></h1>
        </div>
        <p>Infraestructura de Datos Espaciales • Catastro INSPIRE  • GML V4 • .dxf </p>
      </header>

      {/* 1. DropZone (Sube tus ficheros) */}
      <div
        className={`dropzone ${dragActive ? 'active' : ''} ${errorMsg ? 'error' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-upload').click()}
        style={{ marginBottom: '20px' }}
      >
        <UploadCloud className="drop-icon" />
        <div>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: 4 }}>Sube tus ficheros</h3>
          <p>Arrastra ficheros .gml o .dxf, o haz clic aquí</p>
        </div>
        <input
          id="file-upload"
          type="file"
          multiple
          accept=".gml,.dxf"
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
      </div>

      {/* 2. Búsqueda Catastral */}
      <div className="search-section glass-card" style={{
        marginBottom: '20px',
        padding: '20px',
        border: '1px solid var(--accent-primary)',
        boxShadow: '0 4px 15px rgba(0,0,0,0.3), 0 0 10px rgba(0,255,157,0.1)',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '12px'
      }}>
        <label style={{
          fontSize: '0.8rem',
          fontWeight: 'bold',
          color: 'var(--accent-primary)',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          letterSpacing: '0.05em',
          textTransform: 'uppercase'
        }}>
          <Search size={14} /> Búsqueda Catastral
        </label>

        <form onSubmit={handleSearchCatastro} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Ej: 30030A070000380000WU"
              value={searchRefCat}
              onChange={(e) => setSearchRefCat(e.target.value.toUpperCase())}
              maxLength={20}
              autoComplete="off"
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'rgba(0,0,0,0.4)',
                border: '2px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: 'var(--accent-primary)',
                fontSize: '1rem',
                fontFamily: 'monospace',
                outline: 'none',
                transition: 'all 0.2s ease'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--accent-primary)';
                e.target.style.background = 'rgba(0,0,0,0.6)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                e.target.style.background = 'rgba(0,0,0,0.4)';
              }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSearching}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              height: '48px',
              boxShadow: '0 4px 10px rgba(0,255,157,0.2)'
            }}
          >
            {isSearching ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <>
                <Map size={18} /> LOCALIZAR PARCELA
              </>
            )}
          </button>
        </form>

        {errorMsg && (
          <div style={{
            marginTop: '12px',
            color: '#ff4d4d',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(255,77,77,0.1)',
            padding: '8px',
            borderRadius: '4px'
          }}>
            <AlertCircle size={14} /> {errorMsg}
          </div>
        )}
      </div>

      {/* 3. Estadísticas */}
      <Statistics localStats={stats} />

      <button 
        className="btn btn-secondary support-btn" 
        onClick={onOpenSupportModal}
        style={{
          width: '100%',
          marginTop: '-15px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          fontSize: '0.75rem',
          background: 'rgba(56, 189, 248, 0.05)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          color: '#38bdf8',
          height: '38px'
        }}
      >
        <LifeBuoy size={16} /> SOPORTE TÉCNICO
      </button>


      {adjustmentSession && (
        <div className="adjustment-review-panel glass-card pulse-indicator" style={{
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid #f59e0b',
          padding: '16px',
          margin: '0 0 16px 0'
        }}>

          <h3 style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.9rem' }}>
            <AlertCircle size={20} /> CORRECCIÓN DE LINDES
          </h3>
          <p style={{ fontSize: '0.8rem', marginBottom: 12, color: 'var(--text-primary)' }}>
            Se ha detectado un solape con <b>{adjustmentSession.proposedNeighbors.length}</b> parcelas del Catastro.
            Se ha generado una propuesta de recorte automático.
          </p>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" style={{ flex: 1, padding: '10px', fontSize: '0.75rem', borderColor: '#f59e0b', color: '#f59e0b' }} onClick={onConfirmAdjustment}>
              Confirmar Recorte
            </button>
            <button className="btn btn-secondary" style={{ flex: 1, padding: '10px', fontSize: '0.75rem' }} onClick={onCancelAdjustment}>
              Descartar
            </button>
          </div>
        </div>
      )}


      <div style={{ marginBottom: '20px' }}></div>

      {parcels.length > 0 && (() => {
        const drawnParcels = parcels.filter(p => p.id.startsWith('drawing-'));
        const loadedParcels = parcels.filter(p => !p.id.startsWith('drawing-'));
        const dxfCount = loadedParcels.filter(p => p.filename && p.filename.toLowerCase().endsWith('.dxf')).length;
        const gmlCount = loadedParcels.filter(p => p.filename && p.filename.toLowerCase().endsWith('.gml')).length;

        return (
          <>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ marginBottom: 0 }}>Elementos en mapa</label>
                <button onClick={onClearParcels} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Limpiar lista">
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Stats bar */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {gmlCount > 0 && (
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                    background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.4)',
                    color: '#38bdf8', borderRadius: '3px', letterSpacing: '0.05em', textTransform: 'uppercase'
                  }}>
                    GML · {gmlCount}
                  </span>
                )}
                {dxfCount > 0 && (
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                    background: 'rgba(74, 222, 128, 0.12)', border: '1px solid rgba(74, 222, 128, 0.4)',
                    color: '#4ade80', borderRadius: '3px', letterSpacing: '0.05em', textTransform: 'uppercase'
                  }}>
                    DXF · {dxfCount}
                  </span>
                )}
                {drawnParcels.length > 0 && (
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                    background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.4)',
                    color: '#f59e0b', borderRadius: '3px', letterSpacing: '0.05em', textTransform: 'uppercase'
                  }}>
                    ✏ Dibujo · {drawnParcels.length}
                  </span>
                )}
                <span style={{
                  fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                  background: 'rgba(148, 163, 184, 0.1)', border: '1px solid rgba(148, 163, 184, 0.25)',
                  color: 'var(--text-secondary)', borderRadius: '3px', letterSpacing: '0.05em', textTransform: 'uppercase', marginLeft: 'auto'
                }}>
                  Total · {parcels.length}
                </span>
              </div>

              {/* Ficheros cargados */}
              {loadedParcels.length > 0 && (() => {
                const uniqueFiles = [...new Set(loadedParcels.map(p => p.filename).filter(Boolean))];
                return (
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: '5px' }}>
                      Ficheros cargados
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {uniqueFiles.map((fname, i) => {
                        const isDxf = fname.toLowerCase().endsWith('.dxf');
                        const color = isDxf ? '#4ade80' : '#38bdf8';
                        const icon = isDxf ? '⬡' : '◈';
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color, fontSize: '0.7rem', flexShrink: 0 }}>{icon}</span>
                            <span style={{
                              fontSize: '0.68rem', color: 'var(--text-primary)', opacity: 0.8,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace'
                            }} title={fname}>{fname}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div style={{ marginBottom: '16px' }}></div>

              <div className="parcel-list">
                {parcels.map(p => {
                  const isVisible = visibleParcelIds.has(p.id);
                  const isExpanded = expandedParcelIds.has(p.id);
                  const hasTopologyConflict = !!topologyStatus[p.id];

                  // Flatten coordinates for the table if expanded
                  let coordsList = [];
                  if (isExpanded) {
                    const rings = p.originalCoords || [];
                    let vIndex = 1;
                    rings.forEach(ring => {
                      ring.forEach((coord, idx) => {
                        if (idx === ring.length - 1 && ring.length > 3) {
                          const first = ring[0];
                          if (Math.abs(first[0] - coord[0]) < 0.000001 && Math.abs(first[1] - coord[1]) < 0.000001) {
                            return; // skip duplicate closing point
                          }
                        }
                        coordsList.push({ id: vIndex, x: coord[0], y: coord[1] });
                        vIndex++;
                      });
                    });
                  }

                  const perimeter = (p.originalCoords || []).reduce((acc, ring) => acc + calculatePerimeter(ring), 0);

                  return (
                    <div key={p.id} className="glass-card" style={{
                      borderColor: isVisible ? 'var(--border-active)' : 'var(--border-color)',
                      opacity: isVisible ? 1 : 0.7
                    }}>
                      {/* === Top row: full-width name + metadata === */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <FileJson size={14} color={isVisible ? 'var(--accent-primary)' : 'var(--text-secondary)'} style={{ flexShrink: 0 }} />
                          <span style={{
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: isVisible ? 'var(--text-primary)' : 'var(--text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                            flex: 1
                          }} title={p.name}>{p.name}</span>
                        </div>

                        {/* Source file row */}
                        {(() => {
                          const isDrawn = p.id.startsWith('drawing-');
                          const isDxf = p.filename && p.filename.toLowerCase().endsWith('.dxf');
                          const badgeColor = isDrawn ? '#f59e0b' : isDxf ? '#4ade80' : '#38bdf8';
                          const badgeLabel = isDrawn ? '✏ Dibujo' : isDxf ? 'DXF' : 'GML';
                          const sourceText = isDrawn ? 'Dibujado en mapa' : (p.filename || 'Desconocido');
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span style={{
                                fontSize: '0.58rem', fontWeight: 700, padding: '1px 5px',
                                background: `${badgeColor}1a`, border: `1px solid ${badgeColor}66`,
                                color: badgeColor, borderRadius: '2px', flexShrink: 0, letterSpacing: '0.04em'
                              }}>{badgeLabel}</span>
                              <span style={{
                                fontSize: '0.62rem', color: 'var(--text-secondary)', opacity: 0.7,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0
                              }} title={sourceText}>{sourceText}</span>
                            </div>
                          );
                        })()}

                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                          <span style={{ whiteSpace: 'nowrap' }}>{p.huso ? `EPSG:${p.huso}` : 'Sin Huso'}</span>

                          {p.isBuilding && p.metadata?.officialArea ? (
                            <span style={{ color: 'var(--accent-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              Área Const.: {p.metadata.officialArea.toLocaleString('es-ES')} m²
                            </span>
                          ) : (
                            <span style={{ whiteSpace: 'nowrap' }}>{p.area ? `${p.area.toLocaleString('es-ES')} m²` : ''}</span>
                          )}

                          {p.isBuilding && p.metadata?.condition && (
                            <span style={{ whiteSpace: 'nowrap' }}>Estado: {p.metadata.condition}</span>
                          )}

                          <span style={{ color: 'var(--accent-primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{perimeter > 0 ? `P: ${perimeter.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m` : ''}</span>
                        </div>
                      </div>

                      {/* === Bottom row: action buttons === */}
                      <div style={{ display: 'flex', gap: 2, marginTop: '6px', justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                        <button
                          onClick={() => toggleParcelVisibility(p.id)}
                          className="action-icon-btn"
                          style={{ color: isVisible ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                          title={isVisible ? "Ocultar" : "Mostrar"}
                        >
                          {isVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                        </button>

                        <button
                          onClick={() => toggleParcelDetails(p.id)}
                          className="action-icon-btn"
                          style={{ color: isExpanded ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                          title="Vértices"
                        >
                          <List size={15} />
                        </button>

                        <button
                          onClick={() => onOpenBuildingModal(p)}
                          className="action-icon-btn"
                          style={{ color: 'var(--accent-primary)' }}
                          title="GMl Edificio"
                        >
                          <Building size={15} />
                        </button>



                        <button
                          onClick={() => onDeleteParcel(p.id)}
                          className="action-icon-btn"
                          style={{ color: 'var(--accent-danger)', marginLeft: 'auto' }}
                          title="Eliminar parcela"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      {/* Topology Health Check */}
                      {p.geometry && (() => {
                        const geoErrors = validateTopology(p.geometry);
                        if (geoErrors.length > 0) {
                          return (
                            <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '4px', borderLeft: '2px solid var(--accent-danger)' }}>
                              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent-danger)', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <AlertCircle size={10} /> Alerta de Geometría
                              </div>
                              {geoErrors.map((err, idx) => (
                                <div key={idx} style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                                  • {err.message}
                                </div>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {isExpanded && (
                        <div className="coords-table-container">
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8, padding: '0 4px' }}>
                            <button
                              className="btn-tiny"
                              onClick={() => handleDownloadCoords(p, 'csv')}
                              title="Descargar CSV"
                            >
                              <Download size={12} /> .CSV
                            </button>
                             <button
                              className="btn-tiny"
                              onClick={() => handleDownloadCoords(p, 'txt')}
                              title="Descargar TXT"
                            >
                              <Download size={12} /> .TXT
                            </button>
                            <button
                              className="btn-tiny"
                              onClick={() => handleExportSingle(p, 'kml')}
                              title="Exportar KML"
                              style={{ color: '#fb7185' }}
                            >
                              <Download size={12} /> .KML
                            </button>
                            <button
                              className="btn-tiny"
                              onClick={() => handleExportSingle(p, 'geojson')}
                              title="Exportar GeoJSON"
                              style={{ color: '#2dd4bf' }}
                            >
                              <Download size={12} /> .JSON
                            </button>
                          </div>

                          <table className="coords-table">
                            <thead>
                              <tr>
                                <th>Punto</th>
                                <th>X (ESTE)</th>
                                <th>Y (NORTE)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {coordsList.map(c => (
                                <tr key={c.id}>
                                  <td>{c.id}</td>
                                  <td>{Number(c.x).toFixed(3)}</td>
                                  <td>{Number(c.y).toFixed(3)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {parcels.some(p => p.filename && p.filename.toLowerCase().endsWith('.dxf')) && !huso && (
              <div style={{ color: 'var(--accent-warning)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(234, 179, 8, 0.1)', borderRadius: 8, marginBottom: '16px' }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>El plano DXF se ha cargado pero está oculto. Por favor, selecciona su Sistema de Referencia (HUSO) abajo para situarlo en el mapa.</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="huso">Sistema de Referencia (HUSO/EPSG)</label>
              <select id="huso" value={huso} onChange={(e) => { setHuso(e.target.value); setErrorMsg(''); }}>
                <option value="">-- Selecciona HUSO --</option>
                <optgroup label="Península y Baleares (ETRS89)">
                  <option value="25827">HUSO 27 (EPSG:25827)</option>
                  <option value="25828">HUSO 28 (EPSG:25828)</option>
                  <option value="25829">HUSO 29 (EPSG:25829)</option>
                  <option value="25830">HUSO 30 (EPSG:25830)</option>
                  <option value="25831">HUSO 31 / Baleares (EPSG:25831)</option>
                </optgroup>
                <optgroup label="Islas Canarias (REGCAN95 / WGS84)">
                  <option value="4082">HUSO 27 (EPSG:4082 REGCAN95)</option>
                  <option value="4083">HUSO 28 (EPSG:4083 REGCAN95)</option>
                  <option value="32628">HUSO 28 (EPSG:32628 WGS84)</option>
                </optgroup>
              </select>
            </div>

            <div className="switch-group">
              <div className="switch-label">
                <span>Detectar Islas</span>
                <small>Restar superficies interiores</small>
              </div>
              <label className="switch">
                <input type="checkbox" checked={detectIslands} onChange={(e) => setDetectIslands(e.target.checked)} />
                <span className="slider"></span>
              </label>
            </div>

            <button className="btn btn-secondary" style={{ marginTop: 'auto', marginBottom: '8px' }} onClick={handleGenerateDXF}>
              <Download size={18} />
              Exportar a DXF
            </button>

            <button className="btn btn-primary" onClick={handleGenerateGML}>
              <Download size={18} />
              Generar GML v4
            </button>
          </>
        );
      })()}
    </div>
  );
}
