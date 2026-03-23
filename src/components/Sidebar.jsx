import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileJson, AlertCircle, AlertTriangle, Download, Trash2, Map, Eye, EyeOff, List, Building, Search, Loader2, LifeBuoy, ShieldCheck, ShieldAlert, Shield, Info, MapPin, Calendar, History, ChevronDown, Compass } from 'lucide-react';
import JSZip from 'jszip';
import { parseGML } from '../utils/gmlParser';
import { parseDXF } from '../utils/dxfParser';
import { generateGMLv4 } from '../utils/gmlGenerator';
import { generateDXF } from '../utils/dxfGenerator';
import { validateTopology, calculatePerimeter, calculateBbox, preValidateMacro, calculatePolygonArea } from '../utils/geoUtils';
import { fetchParcelsByBbox } from '../utils/cadastreService';
import Statistics from './Statistics';
import { generateGeoJSON, generateKML } from '../utils/exportUtils';
import { preValidateICUC } from '../utils/icucValidator';

import quotesData from '../assets/quotes.json';
import AddressSearch from './AddressSearch';

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
  areaUnit,
  setAreaUnit,
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
  onOpenSupportModal,
  onOpenLegalModal,
  selectedParcelId,
  onSelectParcel,
  isHistoricalLayerActive,
  setIsHistoricalLayerActive,
  historicalDate,
  setHistoricalDate,
  onHusoRequired,
  husoAlertCounter
}) {

  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchRefCat, setSearchRefCat] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [randomQuote, setRandomQuote] = useState('');
  const [isPreValidating, setIsPreValidating] = useState(false);
  const [macroValidationResult, setMacroValidationResult] = useState(null);
  const [expandedHist, setExpandedHist] = useState(false); // Local state for unfolding reliability
  const [isIcncValidating, setIsIcncValidating] = useState(false);
  const [icucValidationResult, setIcncValidationResult] = useState(null);
  const [showHusoAlert, setShowHusoAlert] = useState(false);
  const [pendingFiles, setPendingFiles] = useState(null);

  useEffect(() => {
    const pick = quotesData[Math.floor(Math.random() * quotesData.length)];
    setRandomQuote(pick);
  }, []);

  // Refs for auto-scrolling to alerts/errors
  const errorRef = useRef(null);
  const adjustmentRef = useRef(null);
  const ivgaRef = useRef(null);
  const husoAlertRef = useRef(null);

  // Auto-scroll logic
  useEffect(() => {
    if (errorMsg && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [errorMsg]);

  useEffect(() => {
    if (adjustmentSession && adjustmentRef.current) {
      adjustmentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [adjustmentSession]);


  useEffect(() => {
    if (ivgaReport && ivgaRef.current) {
      ivgaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [ivgaReport]);

  useEffect(() => {
    if (showHusoAlert && husoAlertRef.current) {
      husoAlertRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showHusoAlert]);

  // When the parent signals that a HUSO-requiring tool was activated, show the alert
  useEffect(() => {
    if (husoAlertCounter && husoAlertCounter > 0) {
      setShowHusoAlert(true);
    }
  }, [husoAlertCounter]);


  // Auto-scroll sidebar to the selected parcel card (e.g. selected from map click)
  const parcelCardRefs = useRef({});
  useEffect(() => {
    if (selectedParcelId && parcelCardRefs.current[selectedParcelId]) {
      parcelCardRefs.current[selectedParcelId].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedParcelId]);

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

  const handlePreValidateGlobal = async () => {
    if (!huso) {
      setErrorMsg('Por favor, selecciona un HUSO UTM antes de realizar la pre-validación.');
      return;
    }

    if (parcels.length === 0) {
      setErrorMsg('No hay parcelas cargadas para validar.');
      return;
    }

    setIsPreValidating(true);
    setErrorMsg('');
    setMacroValidationResult(null);

    try {
      // Obtener el Bounding Box global de TODAS las parcelas juntas
      const allRings = parcels.flatMap(p => p.originalCoords || []);
      if (allRings.length === 0) throw new Error("Las parcelas no tienen coordenadas válidas.");

      const bbox = calculateBbox(allRings);

      // Fetch parcelas oficiales interceptando ese bounding box global
      const officialParcels = await fetchParcelsByBbox(bbox, huso);

      if (!officialParcels || officialParcels.length === 0) {
        throw new Error("El servicio del Catastro no devolvió parcelas en esta zona. Comprueba el HUSO.");
      }

      // Ejecutar el motor de macro-validación Turf.js
      const result = preValidateMacro(parcels, officialParcels);
      setMacroValidationResult(result);

      if (ivgaRef.current) {
        ivgaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (err) {
      console.error("Error en macro-validación global:", err);
      setErrorMsg("Error en la Pre-Validación: " + (err.message || 'Error desconocido.'));
    } finally {
      setIsPreValidating(false);
    }
  };

  const handlePreValidateICUC = async () => {
    if (!huso) {
      setErrorMsg('Por favor, selecciona un HUSO UTM antes de realizar la pre-validación.');
      return;
    }

    if (parcels.length === 0) {
      setErrorMsg('No hay elementos cargados para validar.');
      return;
    }

    setIsIcncValidating(true);
    setErrorMsg('');
    setIcncValidationResult(null);

    try {
      const allRings = parcels.flatMap(p => p.originalCoords || []);
      if (allRings.length === 0) throw new Error("Los elementos no tienen coordenadas válidas.");

      const bbox = calculateBbox(allRings);
      const officialParcelsData = await fetchParcelsByBbox(bbox, huso);

      if (!officialParcelsData || officialParcelsData.length === 0) {
        throw new Error("El servicio del Catastro no devolvió parcelas en esta zona. Comprueba el HUSO.");
      }

      const result = preValidateICUC(parcels, officialParcelsData);
      setIcncValidationResult(result);

      if (ivgaRef.current) {
        ivgaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (err) {
      console.error("Error en validación ICUC:", err);
      setErrorMsg("Error en la Pre-Validación ICUC: " + (err.message || 'Error desconocido.'));
    } finally {
      setIsIcncValidating(false);
    }
  };

  const handleFileInput = (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const processFiles = async (files, husoOverride = null) => {
    const currentHuso = husoOverride || huso;
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
          if (!currentHuso) {
            setPendingFiles(Array.from(files)); // Guarda los ficheros para re-intentar tras elegir Huso
            setShowHusoAlert(true);
            // setErrorMsg Removed to avoid duplicate alerts as requested
            return;
          }
          const p = await parseDXF(file, currentHuso);
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

  const handleExportSingle = async (p, format) => {
    let content = "";
    let mimeType = "";
    let extension = format;

    if (format === 'geojson') {
      content = generateGeoJSON([p]);
      mimeType = 'application/json;charset=utf-8;';
      extension = 'geojson';

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${p.name || "parcela"}.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'kml') {
      content = generateKML([p]);
      // For KMZ we need to zip it
      const zip = new JSZip();
      zip.file("doc.kml", content);
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${p.name || "parcela"}.kmz`;
      a.click();
      URL.revokeObjectURL(url);
    }

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
        <p>Infraestructura de Datos Espaciales • GML V4  • GML ICUC • .DXF </p>
      </header>

      {/* 1. DropZone (Sube tus ficheros) */}
      <div className="form-group glass-card" style={{ marginBottom: '12px', padding: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <label style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--accent-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          <UploadCloud size={13} /> Sube tus ficheros
        </label>
        <div
          className={`dropzone ${dragActive ? 'active' : ''} ${errorMsg ? 'error' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-upload').click()}
          style={{ borderRadius: '0', background: 'rgba(0,0,0,0.2)', padding: '20px' }}
        >
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '0.8rem' }}>Arrastra ficheros .gml o .dxf, o haz clic aquí</p>
          </div>
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

      {/* 2. Localizador de Direcciones */}
      <div className="form-group glass-card" style={{ marginBottom: '12px', padding: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <label style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--accent-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          <MapPin size={13} /> Localizador de Direcciones
        </label>
        <AddressSearch onSelectLocation={(coords, name) => {
          onFlyToLocation({ lat: coords[0], lng: coords[1], label: name });
          onIncrementStat('searches');
        }} />
      </div>

      {/* 3. Búsqueda por Ref. Catastral */}
      <div className="form-group glass-card" style={{ marginBottom: '12px', padding: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <label style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--accent-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          <Search size={13} /> Búsqueda por Ref. Catastral
        </label>
        <form onSubmit={handleSearchCatastro} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input
            type="text"
            placeholder="Ej: 30030A070000380000WU"
            value={searchRefCat}
            onChange={(e) => setSearchRefCat(e.target.value.toUpperCase())}
            maxLength={20}
            autoComplete="off"
            style={{
              width: '100%', padding: '10px 12px',
              background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '0', color: 'var(--accent-primary)',
              fontSize: '0.8rem', fontFamily: 'monospace', outline: 'none',
              transition: 'all 0.2s ease'
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--accent-primary)'; e.target.style.background = 'rgba(0,0,0,0.6)'; }}
            onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.background = 'rgba(0,0,0,0.4)'; }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSearching}
            style={{ width: '100%', padding: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.72rem', fontWeight: '700', height: '38px', letterSpacing: '0.05em' }}
          >
            {isSearching ? <Loader2 size={16} className="animate-spin" /> : <><Map size={14} /> LOCALIZAR PARCELA</>}
          </button>
        </form>
      </div>

      {/* 4. Cartografía Histórica */}
      <div className="form-group glass-card" style={{ marginBottom: '12px', padding: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="historical-cadastre-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div 
            className="header-left" 
            onClick={() => setExpandedHist(!expandedHist)} 
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}
          >
            <History size={13} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--accent-primary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>CATASTRO HISTÓRICO</span>
            <ChevronDown className={`chevron-icon ${expandedHist ? 'open' : ''}`} size={14} style={{ transition: 'transform 0.3s', color: 'var(--accent-primary)' }} />
          </div>
          <div className="header-right">
            <div style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '2px',
              borderRadius: '0'
            }}>
              <button 
                type="button"
                onClick={() => {
                  setIsHistoricalLayerActive(false);
                  setExpandedHist(false);
                }}
                style={{
                  padding: '4px 10px',
                  border: 'none',
                  background: !expandedHist ? 'var(--accent-primary)' : 'transparent',
                  color: !expandedHist ? '#000' : 'var(--text-secondary)',
                  fontSize: '0.6rem',
                  fontWeight: '800',
                  cursor: 'pointer',
                  borderRadius: '0',
                  transition: 'all 0.2s'
                }}
              >
                ACTUAL
              </button>
              <button 
                type="button"
                onClick={() => {
                  setIsHistoricalLayerActive(true);
                  setExpandedHist(true);
                }}
                style={{
                  padding: '4px 10px',
                  border: 'none',
                  background: expandedHist ? 'var(--accent-primary)' : 'transparent',
                  color: expandedHist ? '#000' : 'var(--text-secondary)',
                  fontSize: '0.6rem',
                  fontWeight: '800',
                  cursor: 'pointer',
                  borderRadius: '0',
                  transition: 'all 0.2s'
                }}
              >
                HISTÓRICO
              </button>
            </div>
          </div>
        </div>

        {expandedHist && (
          <div className="animate-unfold" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '8px', 
            marginTop: '12px',
            padding: '12px',
            background: 'rgba(24, 24, 27, 0.4)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: '0'
          }}>
            <div style={{ position: 'relative' }}>
              <Calendar size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-primary)', pointerEvents: 'none' }} />
              <input
                type="date"
                value={historicalDate}
                onChange={(e) => setHistoricalDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 34px',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--accent-primary)',
                  borderRadius: '0',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  fontFamily: 'monospace',
                  outline: 'none',
                  colorScheme: 'dark'
                }}
              />
            </div>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
              * Seleccione la fecha deseada para consultar la cartografía.
            </p>
          </div>
        )}
      </div>

      {/* Error Message Display */}
      {errorMsg && (
        <div ref={errorRef} style={{
          marginBottom: '12px',
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

      {/* 5. Sistema de Referencia */}
      <div className="form-group glass-card" style={{ marginBottom: '12px', padding: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <label htmlFor="huso" style={{
          fontSize: '0.7rem', fontWeight: '700', color: 'var(--accent-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.06em', textTransform: 'uppercase'
        }}>
          <Compass size={13} /> SISTEMA DE REFERENCIA (EPSG)
        </label>


        {showHusoAlert && (
          <div ref={husoAlertRef} className="animate-pulse" style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--accent-danger)',
            padding: '10px',
            marginBottom: '12px',
            borderRadius: '4px',
            color: 'var(--accent-danger)',
            fontSize: '0.75rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <AlertCircle size={16} /> ⚠️ SELECCIONA EL HUSO CORRESPONDIENTE
          </div>
        )}


        <select id="huso" value={huso} onChange={(e) => { 
          const selectedHuso = e.target.value;
          setHuso(selectedHuso); 
          setErrorMsg(''); 
          setShowHusoAlert(false); 
          
          // Si había ficheros pendientes de procesar (esperando el Huso), relanzar el proceso
          if (selectedHuso && pendingFiles) {
            processFiles(pendingFiles, selectedHuso);
            setPendingFiles(null);
          }
        }} style={{
          width: '100%', padding: '10px', background: 'rgba(0,0,0,0.4)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0'
        }}>
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
        <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.3' }}>
          Obligatorio para herramientas Catastrales, exportar DXF, o ver Coordenadas.
        </p>
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
        <div ref={adjustmentRef} className="adjustment-review-panel glass-card pulse-indicator" style={{
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

              <div ref={ivgaRef} style={{ marginBottom: '16px' }}>
                <button
                  onClick={handlePreValidateGlobal}
                  className="btn btn-primary pulse-indicator"
                  style={{ width: '100%', padding: '10px 15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.8rem', background: 'linear-gradient(45deg, #10b981, #059669)', border: 'none', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)' }}
                  disabled={isPreValidating}
                >
                  {isPreValidating ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                  {isPreValidating ? 'CALCULANDO...' : 'PRE-VALIDACIÓN CATASTRAL (IVGA)'}
                </button>

                <button
                  onClick={handlePreValidateICUC}
                  className="btn btn-secondary"
                  style={{
                    width: '100%',
                    marginTop: '10px',
                    padding: '10px 15px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '0.8rem',
                    background: 'rgba(56, 189, 248, 0.1)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    color: '#38bdf8'
                  }}
                  disabled={isIcncValidating}
                >
                  {isIcncValidating ? <Loader2 className="animate-spin" size={18} /> : <Building size={18} />}
                  {isIcncValidating ? 'VALIDANDO...' : 'PRE-VALIDACIÓN ICUC (CONSTRUCCIONES)'}
                </button>
              </div>

              {macroValidationResult && (() => {
                const isWarning = macroValidationResult.isValid && macroValidationResult.message.includes('Advertencia');
                const color = macroValidationResult.isValid ? (isWarning ? '#f59e0b' : '#10b981') : '#ef4444';
                const bgColor = macroValidationResult.isValid ? (isWarning ? 'rgba(245, 158, 11, 0.05)' : 'rgba(16, 185, 129, 0.05)') : 'rgba(239, 68, 68, 0.05)';
                const Icon = macroValidationResult.isValid ? (isWarning ? AlertTriangle : ShieldCheck) : ShieldAlert;

                return (
                  <div className="glass-card" style={{ padding: '15px', marginBottom: '16px', background: bgColor, borderLeft: `3px solid ${color}` }}>
                    <h3 style={{ fontSize: '0.85rem', color: color, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <Icon size={18} />
                      RESULTADO: {macroValidationResult.isValid ? 'POSITIVO' : 'NEGATIVO'}
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: '1.4' }}>
                      {macroValidationResult.message}
                    </p>

                    {macroValidationResult.userArea !== undefined && (
                      <div style={{ fontSize: '0.7rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div><strong style={{ color: 'var(--text-primary)' }}>Topografía:</strong> {(macroValidationResult.userArea).toFixed(2)} m²</div>
                        <div><strong style={{ color: 'var(--text-primary)' }}>Catastro act.:</strong> {(macroValidationResult.officialArea).toFixed(2)} m²</div>
                      </div>
                    )}

                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      padding: '8px',
                      background: 'rgba(56, 189, 248, 0.03)',
                      borderRadius: '4px',
                      border: '1px solid rgba(56, 189, 248, 0.1)'
                    }}>
                      <Info size={14} style={{ color: '#38bdf8', flexShrink: 0, marginTop: '1px' }} />
                      <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', lineHeight: '1.3', margin: 0 }}>
                        <strong style={{ color: '#38bdf8' }}>NOTA:</strong> Este resultado es puramente informativo y basado en cálculos locales.
                        <strong> Es obligatorio</strong> realizar la validación final en la
                        <a href="https://www.sedecatastro.gob.es/" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline', marginLeft: '3px' }}>
                          Sede Electrónica del Catastro
                        </a>
                      </p>
                    </div>
                  </div>
                );
              })()}
              {icucValidationResult && (() => {
                const color = icucValidationResult.isValid ? '#10b981' : '#ef4444';
                const bgColor = icucValidationResult.isValid ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)';
                const Icon = icucValidationResult.isValid ? ShieldCheck : ShieldAlert;

                return (
                  <div className="glass-card" style={{ padding: '15px', marginBottom: '16px', background: bgColor, borderLeft: `3px solid ${color}` }}>
                    <h3 style={{ fontSize: '0.85rem', color: color, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <Icon size={18} />
                      RESULTADO ICUC: {icucValidationResult.isValid ? 'POSITIVO' : 'NEGATIVO'}
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: '1.4' }}>
                      {icucValidationResult.message}
                    </p>

                    <div style={{ fontSize: '0.7rem', color: 'var(--text-primary)', marginBottom: '10px', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                      <div><strong>Parcela Objetivo:</strong> {icucValidationResult.targetParcel}</div>
                      <div><strong>Área Ocupada:</strong> {icucValidationResult.totalBuildingArea.toFixed(2)} m²</div>
                      {icucValidationResult.invasionArea > 0 && (
                        <div style={{ color: '#ef4444', marginTop: '4px' }}><strong>Invasión Colindantes:</strong> {icucValidationResult.invasionArea.toFixed(2)} m²</div>
                      )}
                      {icucValidationResult.outsideArea > 0 && (
                        <div style={{ color: '#ef4444' }}><strong>Invasión Vía Pública:</strong> {icucValidationResult.outsideArea.toFixed(2)} m²</div>
                      )}
                    </div>

                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      padding: '8px',
                      background: 'rgba(56, 189, 248, 0.03)',
                      borderRadius: '4px',
                      border: '1px solid rgba(56, 189, 248, 0.1)'
                    }}>
                      <Info size={14} style={{ color: '#38bdf8', flexShrink: 0, marginTop: '1px' }} />
                      <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', lineHeight: '1.3', margin: 0 }}>
                        <strong style={{ color: '#38bdf8' }}>NOTA:</strong> Este resultado es puramente informativo y basado en cálculos locales.
                        <strong> Es obligatorio</strong> realizar la validación final en la
                        <a href="https://www.sedecatastro.gob.es/" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline', marginLeft: '3px' }}>
                          Sede Electrónica del Catastro
                        </a> (este último tienes que mandar al enlace siguiente).
                      </p>
                    </div>
                  </div>
                );
              })()}

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

                  const area = (p.originalCoords || []).reduce((acc, ring) => acc + calculatePolygonArea(ring), 0);
                  const perimeter = (p.originalCoords || []).reduce((acc, ring) => acc + calculatePerimeter(ring), 0);

                  return (
                    <div
                      key={p.id}
                      ref={el => { parcelCardRefs.current[p.id] = el; }}
                      className={`glass-card ${selectedParcelId === p.id ? 'parcel-list-item-selected' : ''}`}
                      onClick={() => onSelectParcel(p)}
                      style={{
                        borderColor: isVisible ? (selectedParcelId === p.id ? 'var(--accent-primary)' : 'var(--border-active)') : 'var(--border-color)',
                        opacity: isVisible ? 1 : 0.7,
                        cursor: 'pointer'
                      }}
                    >
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
                            <span style={{ whiteSpace: 'nowrap' }}>
                              {p.area ? (() => {
                                if (areaUnit === 'ha') return `${(p.area / 10000).toLocaleString('es-ES', { maximumFractionDigits: 4 })} ha`;
                                if (areaUnit === 'km2') return `${(p.area / 1000000).toLocaleString('es-ES', { maximumFractionDigits: 6 })} km²`;
                                return `${p.area.toLocaleString('es-ES', { maximumFractionDigits: 2 })} m²`;
                              })() : ''}
                            </span>
                          )}

                          {p.isBuilding && p.metadata?.condition && (
                            <span style={{ whiteSpace: 'nowrap' }}>Estado: {p.metadata.condition}</span>
                          )}

                          <span style={{ color: 'var(--accent-primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{perimeter > 0 ? `P: ${perimeter.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m` : ''}</span>
                        </div>
                      </div>

                      {/* === Bottom row: action buttons === */}
                      <div
                        style={{ display: 'flex', gap: 2, marginTop: '6px', justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}
                        onClick={(e) => e.stopPropagation()} // Prevent selecting when clicking buttons
                      >
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
                          style={{ color: 'var(--accent-primary)' }}
                          title={isExpanded ? "Ocultar Vértices" : "Mostrar Vértices"}
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
                      {(p.topologyErrors && p.topologyErrors.length > 0) && (() => {
                        const geoErrors = p.topologyErrors;
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
      {/* Footer Legal */}
      <footer style={{
        marginTop: '30px',
        paddingTop: '15px',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', gap: '15px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          <span
            onClick={() => onOpenLegalModal('legal')}
            style={{ cursor: 'pointer', transition: 'color 0.2s' }}
            onMouseOver={(e) => e.target.style.color = 'var(--accent-primary)'}
            onMouseOut={(e) => e.target.style.color = 'var(--text-secondary)'}
          >
            Aviso Legal
          </span>
          <span
            onClick={() => onOpenLegalModal('privacy')}
            style={{ cursor: 'pointer', transition: 'color 0.2s' }}
            onMouseOver={(e) => e.target.style.color = 'var(--accent-primary)'}
            onMouseOut={(e) => e.target.style.color = 'var(--text-secondary)'}
          >
            Privacidad
          </span>
          <span
            onClick={() => onOpenLegalModal('cookies')}
            style={{ cursor: 'pointer', transition: 'color 0.2s' }}
            onMouseOver={(e) => e.target.style.color = 'var(--accent-primary)'}
            onMouseOut={(e) => e.target.style.color = 'var(--text-secondary)'}
          >
            Cookies
          </span>
          <span
            onClick={onOpenSupportModal}
            style={{ cursor: 'pointer', transition: 'color 0.2s' }}
            onMouseOver={(e) => e.target.style.color = 'var(--accent-primary)'}
            onMouseOut={(e) => e.target.style.color = 'var(--text-secondary)'}
          >
            Contacto
          </span>
        </div>
        <div style={{
          fontSize: '0.65rem',
          color: 'var(--text-secondary)',
          opacity: 0.7,
          textAlign: 'center',
          marginTop: '15px',
          lineHeight: '1.5',
          letterSpacing: '0.02em',
          borderTop: '1px solid rgba(255,255,255,0.03)',
          paddingTop: '15px'
        }}>
          <i>{randomQuote}</i><br />
          <span style={{ color: 'var(--accent-primary)', fontWeight: 800, marginTop: '5px', display: 'inline-block' }}>
            — KIRAKIRA 2026
          </span>
        </div>
      </footer>
    </div>
  );
}
