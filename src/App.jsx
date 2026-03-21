import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import MapViewer from './components/MapViewer';
import CookieBanner from './components/CookieBanner';
import { detectAndSubtractIslands } from './utils/islandDetection';
import { generateBuildingGML } from './utils/buildingGmlGenerator';
import { fetchParcelsByBbox } from './utils/cadastreService';
import { performIvgaCheck } from './utils/ivgaValidator';
import { detectOverlaps, resolveOverlaps, validateTopology } from './utils/overlapResolver';
import { calculateBbox, transformFromWGS84, transformToWGS84, calculatePolygonArea, closeRing } from './utils/geoUtils';
import * as turf from '@turf/turf';
import { supabase } from './utils/supabaseClient';
import BuildingDataModal from './components/BuildingDataModal';
import SupportModal from './components/SupportModal';
import LegalModal from './components/LegalModal';


function App() {
  const [rawParcels, setRawParcels] = useState([]);
  const [displayParcels, setDisplayParcels] = useState([]);
  const [visibleParcelIds, setVisibleParcelIds] = useState(new Set());
  const [expandedParcelIds, setExpandedParcelIds] = useState(new Set());
  const [huso, setHuso] = useState('');
  const [areaUnit, setAreaUnit] = useState('m2');
  const [detectIslands, setDetectIslands] = useState(false);
  const [isBuildingModalOpen, setIsBuildingModalOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [legalModalType, setLegalModalType] = useState('legal'); 
  const [buildingQueue, setBuildingQueue] = useState([]); // Kept for future or internal use if needed
  const [targetParcelForBuilding, setTargetParcelForBuilding] = useState(null);
  const [isProcessingCadastre, setIsProcessingCadastre] = useState(false);
  const [adjustmentSession, setAdjustmentSession] = useState(null);
  const [topologyStatus, setTopologyStatus] = useState({}); // { parcelId: [neighborIds] }
  const [overlappingAreas, setOverlappingAreas] = useState([]); // GeoJSON features of overlaps for mapping
  const [flyToTarget, setFlyToTarget] = useState(null); // { lat, lng, label }

  // --- STATISTICS LOGIC ---
  const [stats, setStats] = useState(() => {
    try {
      const saved = localStorage.getItem('gml_gen_stats');
      return saved ? JSON.parse(saved) : { visits: 0, conversions: 0, downloads: 0 };
    } catch (e) {
      return { visits: 0, conversions: 0, downloads: 0 };
    }
  });

  useEffect(() => {
    localStorage.setItem('gml_gen_stats', JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    // Increment visit only once per session/reload
    setStats(prev => ({ ...prev, visits: prev.visits + 1 }));
    
    // Real online sync
    const syncVisit = async () => {
      if (supabase && typeof supabase.rpc === 'function') {
        try {
          const { error } = await supabase.rpc('increment_stat', { row_id: 1, column_name: 'visits' });
          if (error) console.warn("Supabase visits sync issue:", error.message);
        } catch (err) {
          console.warn("Failed to sync visits:", err);
        }
      }
    };
    syncVisit();
  }, []);

  const incrementStat = async (type) => {
    setStats(prev => ({ ...prev, [type]: prev[type] + 1 }));
    // Real online sync
    if (supabase && typeof supabase.rpc === 'function') {
      try {
        const col = type === 'conversions' ? 'conversions' : 'downloads';
        const { error } = await supabase.rpc('increment_stat', { row_id: 1, column_name: col });
        if (error) console.warn(`Supabase ${type} sync issue:`, error.message);
      } catch (err) {
        console.warn(`Failed to sync ${type}:`, err);
      }
    }
  };
  // -------------------------


  // Prevent default browser behavior for global drag & drop
  useEffect(() => {
    const preventDefault = (e) => e.preventDefault();
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);
    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, []);

  useEffect(() => {
    import('./utils/geoUtils').then(({ transformToWGS84 }) => {
      let filteredParcels = [];
      if (detectIslands && rawParcels.length > 0) {
        filteredParcels = detectAndSubtractIslands(rawParcels);
      } else {
        filteredParcels = [...rawParcels];
      }

      // Reparameterize geometry for DXF files based on the global `huso` state
      const updatedParcels = filteredParcels.map(p => {
        const isDxf = p.filename && p.filename.toLowerCase().endsWith('.dxf');
        if (isDxf && huso) {
          try {
            // Apply new projection mapping to original coordinates
            const newGeometryCoords = p.originalCoords.map(ring => transformToWGS84(ring, huso));
            return {
              ...p,
              huso: huso,
              geometry: {
                ...p.geometry,
                coordinates: p.geometry.type === 'MultiPolygon' ? [newGeometryCoords] : newGeometryCoords // Adjust nested array structure
              }
            };
          } catch (e) {
            console.error("Coordinate transformation failed for DXF", e);
            return p;
          }
        }
        return p;
      });

      setDisplayParcels(updatedParcels);
    });
  }, [rawParcels, detectIslands, huso]);

  // Handlers for state updates from the Sidebar
  const handleFilesParsed = (newParcels) => {
    // Merge new parcels with existing ones, or replace them based on preference.
    setRawParcels(prev => [...prev, ...newParcels]);
    
    // Auto-enable visibility for newly added parcels
    setVisibleParcelIds(prev => {
      const next = new Set(prev);
      newParcels.forEach(p => next.add(p.id));
      return next;
    });
  };

  const handleClearParcels = () => {
    setRawParcels([]);
    setVisibleParcelIds(new Set());
    setExpandedParcelIds(new Set());
  };

  const handleDeleteParcel = (id) => {
    setRawParcels(prev => prev.filter(p => p.id !== id));
    setVisibleParcelIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    setExpandedParcelIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const toggleParcelVisibility = (id) => {
    setVisibleParcelIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleParcelDetails = (id) => {
    setExpandedParcelIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Filter parcels for the map. If it's a DXF and there's no HUSO selected, hide it.
  const mapParcels = [
    ...displayParcels.filter(p => {
      if (!visibleParcelIds.has(p.id)) return false;
      const isDxf = p.filename && p.filename.toLowerCase().endsWith('.dxf');
      if (isDxf && !huso) return false;
      return true;
    }),
    ...(adjustmentSession ? adjustmentSession.proposedNeighbors : []),
    ...overlappingAreas // Add highlighted overlap areas
  ];


  const handleOpenBuildingModal = (parcel) => {
    setTargetParcelForBuilding(parcel);
    setIsBuildingModalOpen(true);
  };

  const handleSaveBuildingGML = (formData) => {
    if (!targetParcelForBuilding) return;
    
    // Use originalCoords (UTM) if available, otherwise fallback to geometry (WGS84)
    const geometryToUse = targetParcelForBuilding.originalCoords || targetParcelForBuilding.geometry;
    const gmlString = generateBuildingGML(formData, geometryToUse, huso || formData.epsg);
    
    if (gmlString) {
      const blob = new Blob([gmlString], { type: 'application/xml;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edificio_${formData.id || 'generado'}.gml`;
      a.click();
      URL.revokeObjectURL(url);
      incrementStat('conversions');
    }

    setIsBuildingModalOpen(false);
    setTargetParcelForBuilding(null);
  };

  const handleDrawingCreated = (geometry, type) => {
    const drawingId = `drawing-${Date.now()}`;
    const drawingIndex = rawParcels.filter(p => p.id.startsWith('drawing-')).length + 1;
    const drawingName = `Dibujo ${drawingIndex}`;

    // Convert WGS84 coordinates to UTM using the currently selected HUSO
    // Fallback to 25830 if no HUSO is selected
    const targetHuso = huso || '25830';
    
    const geom = geometry.geometry || geometry;
    let originalCoords = [];
    let finalGeometry = geom;

    if (geom.type === 'Polygon') {
      originalCoords = geom.coordinates.map(ring => closeRing(transformFromWGS84(ring, targetHuso)));
    } else if (geom.type === 'LineString') {
      originalCoords = [closeRing(transformFromWGS84(geom.coordinates, targetHuso))];
      finalGeometry = {
        type: 'Polygon',
        coordinates: [geom.coordinates.concat([geom.coordinates[0]])]
      };
    }

    const area = finalGeometry.type === 'Polygon' ? calculatePolygonArea(originalCoords[0]) : 0;

    const newParcel = {
      id: drawingId,
      name: drawingName,
      filename: `${drawingName}.gml`,
      geometry: finalGeometry,
      originalCoords: originalCoords,
      area: area,
      huso: targetHuso,
      isGmlV4: false
    };

    setRawParcels(prev => [...prev, newParcel]);
    setVisibleParcelIds(prev => new Set([...prev, drawingId]));
  };

  const handleConfirmAdjustment = () => {
    if (!adjustmentSession) return;
    
    const newParcels = adjustmentSession.proposedNeighbors;
    
    setRawParcels(prev => {
      // Create a map of existing parcels for easy lookup
      const parcelMap = new Map(prev.map(p => [p.id, p]));
      // Update or add the new parcels
      newParcels.forEach(p => parcelMap.set(p.id, p));
      return Array.from(parcelMap.values());
    });
    
    // Ensure they are visible
    const newIds = newParcels.map(p => p.id);
    setVisibleParcelIds(prev => new Set([...prev, ...newIds]));
    
    setAdjustmentSession(null);
    alert("Ajuste de linderos confirmado. Las parcelas se han actualizado.");
  };


  const handleCancelAdjustment = () => {
    setAdjustmentSession(null);
  };

  const handleGeometryEdited = (id, newGeometryWGS84) => {
    const targetHuso = huso || '25830';

    // 1. Update Adjustment Session if active
    if (adjustmentSession) {
      setAdjustmentSession(prev => {
        if (!prev) return prev;
        const updatedProposed = prev.proposedNeighbors.map(p => {
          if (p.id === id) {
            let newOriginalCoords = newGeometryWGS84.coordinates.map(ring => transformFromWGS84(ring, targetHuso));
            
            // STRICT BIT-FOR-BIT SNAPPING for linderos
            const SNAP_THRESHOLD = 0.15;
            newOriginalCoords = newOriginalCoords.map(ring => {
              return ring.map(vertex => {
                let bestSnap = vertex;
                let minDistance = SNAP_THRESHOLD;
                prev.originalNeighbors.forEach(n => {
                  n.originalCoords.forEach(refRing => {
                    refRing.forEach(refVertex => {
                      const dx = vertex[0] - refVertex[0];
                      const dy = vertex[1] - refVertex[1];
                      const dist = Math.sqrt(dx * dx + dy * dy);
                      if (dist < minDistance) {
                        minDistance = dist;
                        bestSnap = [refVertex[0], refVertex[1]];
                      }
                    });
                  });
                });
                return bestSnap;
              });
            });

            newOriginalCoords = newOriginalCoords.map(ring => closeRing(ring));
            const newArea = calculatePolygonArea(newOriginalCoords[0]);
            
            return {
              ...p,
              geometry: newGeometryWGS84,
              originalCoords: newOriginalCoords,
              area: newArea
            };
          }
          return p;
        });
        
        return { ...prev, proposedNeighbors: updatedProposed };
      });
      // Also update rawParcels if the edited parcel exists there
    }

    // 2. Update Raw Parcels
    setRawParcels(prev => {
      return prev.map(p => {
        if (p.id === id) {
          const geom = newGeometryWGS84.geometry || newGeometryWGS84;
          const newOriginalCoords = geom.coordinates.map(ring => closeRing(transformFromWGS84(ring, targetHuso)));
          const newArea = calculatePolygonArea(newOriginalCoords[0]);
          return {
            ...p,
            geometry: geom,
            originalCoords: newOriginalCoords,
            area: newArea
          };
        }
        return p;
      });
    });
  };

  const handleDetectCadastreAffections = async (targetParcel) => {
    if (!huso) {
      alert("Por favor, selecciona primero el Sistema de Referencia (HUSO/EPSG).");
      return;
    }

    setIsProcessingCadastre(true);
    setOverlappingAreas([]);
    
    try {
      // 1. Fetch from Catastro
      const bbox = calculateBbox(targetParcel.originalCoords);
      const neighbors = await fetchParcelsByBbox(bbox, huso);
      
      if (neighbors.length === 0) {
        alert("No se han encontrado parcelas colindantes en el área.");
        setIsProcessingCadastre(false);
        return;
      }

      // 2. Detect overlaps
      const overlappingIds = detectOverlaps(targetParcel, neighbors);
      const relevantNeighbors = neighbors.filter(n => overlappingIds.includes(n.id));

      if (relevantNeighbors.length === 0) {
        alert("Se han encontrado parcelas cercanas, pero ninguna solapa con la seleccionada.");
        setIsProcessingCadastre(false);
        return;
      }

      // 3. Generate visual overlap features for the map
      const originX = targetParcel.originalCoords[0][0][0];
      const originY = targetParcel.originalCoords[0][0][1];
      
      const shiftCoords = (coords, dx, dy) => {
        if (targetParcel.geometry.type === 'MultiPolygon') {
          return coords.map(poly => poly.map(ring => ring.map(c => [c[0] - dx, c[1] - dy])));
        }
        return coords.map(ring => ring.map(c => [c[0] - dx, c[1] - dy]));
      };

      const localMain = targetParcel.geometry.type === 'MultiPolygon' 
        ? turf.multiPolygon(shiftCoords(targetParcel.originalCoords, originX, originY))
        : turf.polygon(shiftCoords(targetParcel.originalCoords, originX, originY));
      
      const overlaps = relevantNeighbors.map(n => {
        const localN = n.geometry.type === 'MultiPolygon'
          ? turf.multiPolygon(shiftCoords(n.originalCoords, originX, originY))
          : turf.polygon(shiftCoords(n.originalCoords, originX, originY));
          
        const inter = turf.intersect(turf.featureCollection([localMain, localN]));

        if (inter && inter.geometry) {
          // --- UN-SHIFT AND TRANSFORM BACK TO WGS84 ---
          const unshiftRing = (ring) => ring.map(c => [c[0] + originX, c[1] + originY]);
          const unshiftPolygon = (poly) => poly.map(unshiftRing);
          
          let utmCoords;
          if (inter.geometry.type === 'Polygon') {
            utmCoords = unshiftPolygon(inter.geometry.coordinates);
          } else if (inter.geometry.type === 'MultiPolygon') {
            utmCoords = inter.geometry.coordinates.map(unshiftPolygon);
          } else {
            return null; // Ignore line intersections for highlights
          }

          // Transform back to WGS84
          const targetHuso = huso || targetParcel.huso || '25830';
          let wgs84Coords;
          if (inter.geometry.type === 'Polygon') {
            wgs84Coords = utmCoords.map(ring => transformToWGS84(ring, targetHuso));
          } else {
            wgs84Coords = utmCoords.map(poly => poly.map(ring => transformToWGS84(ring, targetHuso)));
          }

          return {
            ...inter,
            id: `overlap-${targetParcel.id}-${n.id}`,
            geometry: {
              ...inter.geometry,
              coordinates: wgs84Coords
            },
            properties: { type: 'overlap_warning', parentId: targetParcel.id, neighborId: n.id }
          };
        }
        return null;
      }).filter(Boolean);
      
      // Update local state for sidebar indicators and highlights
      setTopologyStatus(prev => ({ ...prev, [targetParcel.id]: overlappingIds }));
      setOverlappingAreas(overlaps);

      
      // Automatically start adjustment session for better UX
      const modifiedNeighbors = resolveOverlaps(targetParcel, relevantNeighbors);
      setAdjustmentSession({
        mainParcel: targetParcel,
        originalNeighbors: relevantNeighbors,
        proposedNeighbors: modifiedNeighbors
      });



    } catch (error) {
      console.error("Cadastre integration failed", error);
      alert("Error al conectar con el Catastro. Revisa la consola para más detalles.");
    } finally {
      setIsProcessingCadastre(false);
    }
  };

  const [ivgaReport, setIvgaReport] = useState(null);

  const handleIvgaPreValidation = async () => {
    if (!huso) {
      alert("Por favor, selecciona primero el Sistema de Referencia (HUSO/EPSG).");
      return;
    }

    const proposedParcels = displayParcels.filter(p => !p.isCadastre);
    if (proposedParcels.length === 0) {
      alert("No hay parcelas propuestas (cargadas o dibujadas) para validar.");
      return;
    }

    setIsProcessingCadastre(true);
    setIvgaReport(null);
    setOverlappingAreas([]);

    try {
      // 1. Get Reference Parcels (already loaded or fetch from Bbox)
      let referenceParcels = displayParcels.filter(p => p.isCadastre);
      
      if (referenceParcels.length === 0) {
        // Fetch from Catastro using the union BBox of all proposed
        const allRings = proposedParcels.flatMap(p => {
          if (Array.isArray(p.originalCoords[0][0][0])) return p.originalCoords.flat();
          return p.originalCoords;
        });
        const bbox = calculateBbox(allRings);
        referenceParcels = await fetchParcelsByBbox(bbox, huso);
        
        if (referenceParcels.length === 0) {
          alert("No se pudieron obtener parcelas de referencia del Catastro en esta zona.");
          return;
        }
      }

      // 2. Perform IVGA Check
      console.log("Starting IVGA Check with", proposedParcels.length, "proposed and", referenceParcels.length, "reference parcels");
      const report = performIvgaCheck(proposedParcels, referenceParcels);
      
      if (report.error) {
        alert(report.error);
        return;
      }

      // 3. Process Result Geometries for Visualization
      const ivgaOverlays = [];
      const targetHuso = huso || '25830';

      const createOverlay = (feature, type, id) => {
        if (!feature) return null;
        // Transform geometries back to WGS84 for mapping
        const geom = feature.geometry;
        let wgs84Coords;
        if (geom.type === 'Polygon') {
           wgs84Coords = geom.coordinates.map(ring => transformToWGS84(ring, targetHuso));
        } else {
           wgs84Coords = geom.coordinates.map(poly => poly.map(ring => transformToWGS84(ring, targetHuso)));
        }
        return {
          ...feature,
          id,
          geometry: { ...geom, coordinates: wgs84Coords },
          properties: { type }
        };
      };

      if (report.geometries.gaps) {
        ivgaOverlays.push(createOverlay(report.geometries.gaps, 'ivga_gap', 'ivga-gap-overlay'));
      }
      if (report.geometries.encroachments) {
        ivgaOverlays.push(createOverlay(report.geometries.encroachments, 'ivga_encroachment', 'ivga-encroachment-overlay'));
      }
      if (report.geometries.internalOverlaps && report.geometries.internalOverlaps.length > 0) {
        report.geometries.internalOverlaps.forEach((feat, i) => {
          ivgaOverlays.push(createOverlay(feat, 'ivga_internal_overlap', `ivga-internal-${i}`));
        });
      }

      setIvgaReport(report.summary);
      setOverlappingAreas(prev => [...prev, ...ivgaOverlays.filter(Boolean)]);

    } catch (error) {
      console.error("IVGA Validation failed", error);
      alert("Error al realizar la pre-validación IVGA.");
    } finally {
      setIsProcessingCadastre(false);
    }
  };


  return (
    <div className="app-container">
      <div className="map-container">
        <MapViewer 
          parcels={mapParcels} 
          expandedParcelIds={expandedParcelIds} 
          onDrawingCreated={handleDrawingCreated}
          adjustmentSession={adjustmentSession}
          onGeometryEdited={handleGeometryEdited}
          huso={huso}
          flyToTarget={flyToTarget}
          areaUnit={areaUnit}
          setAreaUnit={setAreaUnit}
        />
      </div>
      <Sidebar 
        parcels={displayParcels}
        visibleParcelIds={visibleParcelIds}
        toggleParcelVisibility={toggleParcelVisibility}
        expandedParcelIds={expandedParcelIds}
        toggleParcelDetails={toggleParcelDetails}
        onFilesParsed={handleFilesParsed}
        onClearParcels={handleClearParcels}
        onOpenBuildingModal={handleOpenBuildingModal}
        onDetectCadastreAffections={handleDetectCadastreAffections}
        isProcessingCadastre={isProcessingCadastre}
        huso={huso}
        setHuso={setHuso}
        areaUnit={areaUnit}
        setAreaUnit={setAreaUnit}
        detectIslands={detectIslands}
        setDetectIslands={setDetectIslands}
        adjustmentSession={adjustmentSession}
        onConfirmAdjustment={handleConfirmAdjustment}
        onCancelAdjustment={handleCancelAdjustment}
        onDeleteParcel={handleDeleteParcel}
        onIvgaCheck={handleIvgaPreValidation}
        ivgaReport={ivgaReport}
        topologyStatus={topologyStatus}
        onFlyToLocation={setFlyToTarget}
        stats={stats}
        onIncrementStat={incrementStat}
        onOpenSupportModal={() => setIsSupportModalOpen(true)}
        onOpenLegalModal={(type) => { setLegalModalType(type); setIsLegalModalOpen(true); }}
      />
      <BuildingDataModal 
        isOpen={isBuildingModalOpen} 
        onClose={() => setIsBuildingModalOpen(false)} 
        onSave={handleSaveBuildingGML}
        initialData={targetParcelForBuilding ? { id: targetParcelForBuilding.name.replace(/\.[^/.]+$/, "") } : {}}
      />
      <CookieBanner />
      <SupportModal 
        isOpen={isSupportModalOpen} 
        onClose={() => setIsSupportModalOpen(false)} 
      />
      <LegalModal 
        isOpen={isLegalModalOpen} 
        onClose={() => setIsLegalModalOpen(false)} 
        type={legalModalType} 
      />
    </div>
  );
}

export default App;
