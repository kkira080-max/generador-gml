import React, { useState, useEffect, useRef } from 'react';
import { History } from 'lucide-react';
import L from 'leaflet';
import proj4 from 'proj4';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import '@geoman-io/leaflet-geoman-free';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { calculatePolygonArea, calculatePerimeter, transformFromWGS84, closeRing } from '../utils/geoUtils';
import { fetchRcByCoordinates } from '../utils/cadastreService';
import * as turf from '@turf/turf';
import MapTools from './MapTools';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const SPAIN_CENTER = [40.463667, -3.74922];
const DEFAULT_ZOOM = 6;

export default function MapViewer({ parcels, expandedParcelIds = new Set(), onDrawingCreated, adjustmentSession, onGeometryEdited, huso,
  flyToTarget,
  selectedParcelId,
  onSelectParcel,
  isHistoricalLayerActive,
  historicalDate,
  historicalOpacity,
  areaUnit,
  setAreaUnit,
  onHusoRequired,
  onSearchCoords,
  onHusoChange
}) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const featuresLayer = useRef(null);
  const adjustmentLayers = useRef(new L.LayerGroup());
  const prevAdjustmentSession = useRef(adjustmentSession);
  const husoRef = useRef(huso);
  const prevParcelsLength = useRef(parcels.length);
  const historicalLayerRef = useRef(null);
  const mainCatastroLayerRef = useRef(null);

  // Keep husoRef in sync with the huso prop
  useEffect(() => {
    husoRef.current = huso;
  }, [huso]);

  // New states for measurement tools
  const [activeTool, setActiveTool] = useState(null);
  const [measurements, setMeasurements] = useState({ distance: 0, area: 0, coords: null });
  const activeToolRef = useRef(null);

  // Intercept tool changes — alert if HUSO required but not set
  const handleToolChange = (tool) => {
    if ((tool === 'coordinates' || tool === 'go_to_cadastre' || tool === 'go_to_registradores' || tool === 'go_to_ortofotos') && !huso) {
      if (onHusoRequired) onHusoRequired();
      return;
    }
    setActiveTool(tool);
  };

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const initialMap = L.map(mapRef.current, {
      zoomSnap: 0.1,
      zoomDelta: 1,
      maxZoom: 24,
      wheelPxPerZoomLevel: 60
    }).setView([40.4168, -3.7038], 6);

    const defaultLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxNativeZoom: 19,
      maxZoom: 24,
      keepBuffer: 6,
      updateWhenIdle: false,
      updateWhenZooming: false,
      crossOrigin: true
    });

    const satelliteLayer = L.layerGroup([
      L.tileLayer('https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0&Layer=OI.OrthoimageCoverage&Style=default&Format=image/jpeg&TileMatrixSet=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}', {
        attribution: 'PNOA con origen en servicio WMTS del IGN',
        maxNativeZoom: 19,
        maxZoom: 24,
        keepBuffer: 8,            // Precarga agresivamente los bordes de la zona de trabajo (8 filas de baldosas extras)
        updateWhenIdle: false,    // Refresca la red mientras mueves el ratón, sin esperar a que pares
        updateWhenZooming: false, // Evita pedir baldosas intermedias mientras haces scroll para ahorrar ancho de banda al destino final
        crossOrigin: true         // Aceleración de cacheado en canvas
      }),
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CartoDB',
        maxNativeZoom: 19,
        maxZoom: 24,
        keepBuffer: 6,
        updateWhenIdle: false,
        updateWhenZooming: false,
        crossOrigin: true
      })
    ]);

    const lightLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CartoDB',
      maxNativeZoom: 19,
      maxZoom: 24,
      keepBuffer: 6,
      updateWhenIdle: false,
      updateWhenZooming: false,
      crossOrigin: true
    });

    const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CartoDB',
      maxNativeZoom: 19,
      maxZoom: 24,
      keepBuffer: 6,
      updateWhenIdle: false,
      updateWhenZooming: false,
      crossOrigin: true
    });

    const cadLayer = L.layerGroup([]);
    const catastroLayer = L.tileLayer.wms('https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx', {
      layers: 'catastro',
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      attribution: 'Sede Electrónica del Catastro',
      tileSize: 512,            // 4x menos peticiones de red al unificar las losas (mejora radical para servidores WMS lentos)
      keepBuffer: 6,            // Retiene un radio amplio de parcelas en la memoria RAM del navegador
      updateWhenIdle: false,    // Refresca activamente el Catastro mientras mueves el ratón
      updateWhenZooming: false,
      maxNativeZoom: 19,
      maxZoom: 24,
    });
    mainCatastroLayerRef.current = catastroLayer;


    defaultLayer.addTo(initialMap);

    const baseMaps = {
      "Fondo Blanquecino": lightLayer,
      "Fondo Oscuro": darkLayer,
      "Fondo Satélite": satelliteLayer,
      "Mapa Predeterminado": defaultLayer,
      "Fondo estilo Autocad": cadLayer
    };

    const overlayMaps = {
      "Catastro Oficial": catastroLayer,
    };


    initialMap.on('baselayerchange', (e) => {
      const container = initialMap.getContainer();
      if (e.name === "Fondo estilo Autocad") {
        container.classList.add('map-cad-bg');
      } else {
        container.classList.remove('map-cad-bg');
      }
    });

    initialMap.pm.setLang('es');
    initialMap.pm.addControls({
      position: 'topleft',
      drawCircleMarker: false,
      drawPolyline: false,
      drawPolygon: false,
      drawRectangle: false,
      drawCircle: false,
      drawMarker: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
    });



    // Enable measurements during drawing/editing
    initialMap.pm.setGlobalOptions({ 
      measurements: {
        display: true,
        totalLength: true,
        segmentLength: true,
        area: true,
        showTooltip: true,
        pin: true,
      },
      templineStyle: { color: '#ffcc00', weight: 2, dashArray: '5,5' },
      hintlineStyle: { color: '#ffcc00', weight: 2, dashArray: '5,5' },
      pathOptions: { color: '#3388ff', weight: 3, fillOpacity: 0.2 }
    });

    initialMap.on('pm:create', (e) => {
      const layer = e.layer;
      const geojson = layer.toGeoJSON();
      
      if (e.shape === 'Marker') {
        const textValue = prompt('Introduce el texto para este punto:', 'Punto de interés');
        if (textValue === null) {
          initialMap.removeLayer(layer);
          return;
        }
        geojson.properties = { ...geojson.properties, name: textValue, type: 'text_marker' };
      }

      onDrawingCreated(geojson);
      initialMap.removeLayer(layer);
    });

    // -------------------------------------------------------------------------
    // HUD & BOTTOM CONTROLS (HORIZONTAL BAR)
    // -------------------------------------------------------------------------

    // 1. Scale Bar
    L.control.scale({ 
      metric: true, 
      imperial: false, 
      position: 'bottomleft',
      maxWidth: 250
    }).addTo(initialMap);

    // 2. UTM Tracker
    const utmControl = L.Control.extend({
      onAdd: function() {
        const div = L.DomUtil.create('div', 'coordinates-tracker');
        div.innerHTML = `<span>COORDENADAS UTM (${husoRef.current || '25830'})</span><div id="utm-coords-display">ESPERANDO MOVIMIENTO...</div>`;
        return div;
      }
    });
    new utmControl({ position: 'bottomleft' }).addTo(initialMap);

    // 3. Layer Control - positioned last to appear at the end of the flex-row
    L.control.layers(baseMaps, overlayMaps, { position: 'bottomleft' }).addTo(initialMap);

    const onMouseMove = (e) => {
      const { lat, lng } = e.latlng;
      const epsgCode = `EPSG:${husoRef.current || '25830'}`;
      try {
        const utm = proj4('EPSG:4326', epsgCode, [lng, lat]);
        const display = document.getElementById('utm-coords-display');
        if (display) {
          display.innerHTML = `E: ${utm[0].toLocaleString('es-ES', { minimumFractionDigits: 3 })} • N: ${utm[1].toLocaleString('es-ES', { minimumFractionDigits: 3 })}`;
        }
      } catch (err) {
        const display = document.getElementById('utm-coords-display');
        if (display) {
          display.innerHTML = `Error UTM (${husoRef.current || '25830'})`;
        }
      }
    };

    initialMap.on('mousemove', onMouseMove);

    // Coordinate and Cadastre tool click handler
    const onMapClick = async (e) => {
      if (activeToolRef.current === 'coordinates' || activeToolRef.current === 'go_to_cadastre' || activeToolRef.current === 'go_to_registradores' || activeToolRef.current === 'go_to_ortofotos') {
        const { lat, lng } = e.latlng;
        const epsgCode = `EPSG:${husoRef.current || '25830'}`;
        try {
          const utm = proj4('EPSG:4326', epsgCode, [lng, lat]);
          
          if (activeToolRef.current === 'go_to_cadastre') {
             if (!husoRef.current) {
                 if (onHusoRequired) onHusoRequired();
                 return;
             }

             // We fetch the precise Referencia Catastral at this coordinate
             // This is the only 100% reliable way to force the Sede Electrónica to zoom correctly
             // without showing the search dialog modal.
             const rc = await fetchRcByCoordinates(utm[0], utm[1], epsgCode);
             
             if (rc) {
                 const url = `https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?refcat=${rc}`;
                 window.open(url, '_blank');
             } else {
                 alert("No se ha detectado ninguna parcela del Catastro en las coordenadas indicadas. Intenta hacer clic un poco más al interior de la parcela.");
             }
             return;
          }

          if (activeToolRef.current === 'go_to_registradores') {
             if (!husoRef.current) {
                 if (onHusoRequired) onHusoRequired();
                 return;
             }

             const x = utm[0].toFixed(3);
             const y = utm[1].toFixed(3);
             const epsg = husoRef.current || '25830';

             // Intentamos obtener la RC para facilitar la búsqueda en el Geoportal
             let rc = null;
             try {
                rc = await fetchRcByCoordinates(utm[0], utm[1], epsgCode);
             } catch (err) {
                console.error("No se pudo obtener la RC para el Geoportal:", err);
             }
             
             const popupContent = `
               <div style="background: #111; padding: 15px; border-radius: 2px; border-left: 3px solid #38bdf8; width: 260px; font-family: 'Inter', sans-serif;">
                 <div style="font-size: 0.65rem; color: #38bdf8; font-weight: 800; margin-bottom: 12px; letter-spacing: 0.05em;">ASISTENTE REGISTRADORES</div>
                 
                 <div style="background: rgba(255,255,255,0.05); padding: 8px 10px; border-radius: 2px; margin-bottom: 12px; border: 1px solid ${rc ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255,255,255,0.1)'};">
                   <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                     <span style="font-size: 0.55rem; color: rgba(255,255,255,0.4); text-transform: uppercase;">REF. CATASTRAL (RECOMENDADO)</span>
                     ${rc ? `<button onclick="navigator.clipboard.writeText('${rc}'); this.innerText='✓'; setTimeout(()=>this.innerText='📋', 1000)" 
                               style="background: #38bdf8; border: none; padding: 2px 6px; border-radius: 2px; color: black; font-weight: bold; cursor: pointer; font-size: 0.6rem;">📋</button>` : ''}
                   </div>
                   <span style="font-size: 0.9rem; color: ${rc ? '#38bdf8' : 'rgba(255,255,255,0.3)'}; font-family: monospace; font-weight: 700;">${rc || 'NO DETECTADA'}</span>
                 </div>

                 <div style="display: flex; gap: 6px; margin-bottom: 6px; align-items: stretch;">
                   <div style="flex: 1; background: rgba(255,255,255,0.03); padding: 6px 10px; border-radius: 2px;">
                     <span style="font-size: 0.5rem; color: rgba(255,255,255,0.3); display: block; margin-bottom: 2px; text-transform: uppercase;">Coordenada X</span>
                     <span style="font-size: 0.8rem; color: white; font-family: monospace;">${x}</span>
                   </div>
                   <button onclick="navigator.clipboard.writeText('${x}'); this.innerText='✓'; setTimeout(()=>this.innerText='📋', 1000)" 
                           style="background: rgba(255,255,255,0.1); border: none; padding: 0 8px; border-radius: 2px; color: white; cursor: pointer;" title="Copiar X">📋</button>
                 </div>

                 <div style="display: flex; gap: 6px; margin-bottom: 12px; align-items: stretch;">
                   <div style="flex: 1; background: rgba(255,255,255,0.03); padding: 6px 10px; border-radius: 2px;">
                     <span style="font-size: 0.5rem; color: rgba(255,255,255,0.3); display: block; margin-bottom: 2px; text-transform: uppercase;">Coordenada Y</span>
                     <span style="font-size: 0.8rem; color: white; font-family: monospace;">${y}</span>
                   </div>
                   <button onclick="navigator.clipboard.writeText('${y}'); this.innerText='✓'; setTimeout(()=>this.innerText='📋', 1000)" 
                           style="background: rgba(255,255,255,0.1); border: none; padding: 0 8px; border-radius: 2px; color: white; cursor: pointer;" title="Copiar Y">📋</button>
                 </div>
                 
                 <div style="font-size: 0.6rem; color: rgba(255,255,255,0.4); line-height: 1.4; margin-bottom: 12px;">
                    Copia la <b>RC</b> y pégala en el buscador del Geoportal. Si no funciona, usa las coordenadas con la herramienta de la lupa.
                 </div>

                 <a href="https://geoportal.registradores.org/geoportal/" target="_blank" 
                    style="display: block; width: 100%; padding: 10px; background: #38bdf8; color: black; text-align: center; border-radius: 2px; text-decoration: none; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.05em; transition: 0.2s;">ABRIR GEOPORTAL REGISTRADORES</a>
               </div>
             `;

             L.popup({
               maxWidth: 320,
               className: 'custom-utm-popup'
             })
               .setLatLng(e.latlng)
               .setContent(popupContent)
               .openOn(initialMap);
             
             return;
          }

          if (activeToolRef.current === 'go_to_ortofotos') {
             if (!husoRef.current) {
                 if (onHusoRequired) onHusoRequired();
                 return;
             }
             
             // Usaremos nuestro propio contenedor HTML alojado localmente en la carpeta public
             // que carga exactamente las mismas librerías oficiales del CNIG y el plugin georefimage2,
             // pero que nos permite inyectar el zoom al inicializar el mapa sin restricciones.
             const xWeb = lng * 20037508.34 / 180;
             let yWeb = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
             yWeb = yWeb * 20037508.34 / 180;
             
             const url = `/cnig-ortho.html?x=${xWeb}&y=${yWeb}&zoom=18`;
             window.open(url, '_blank');
             return;
          }

          setMeasurements(prev => ({
            ...prev,
            coords: { x: utm[0], y: utm[1], epsg: epsgCode }
          }));

          const xVal = utm[0].toFixed(3);
          const yVal = utm[1].toFixed(3);
          const epsgVal = husoRef.current || '25830';

          const coordPopupContent = `
            <div style="background: #111; padding: 18px; border-radius: 2px; border-left: 3px solid #38bdf8; width: 260px; font-family: 'Inter', sans-serif;">
              <div style="font-size: 0.7rem; color: #38bdf8; font-weight: 800; margin-bottom: 15px; letter-spacing: 0.1em; text-transform: uppercase;">Coordenadas UTM</div>
              
              <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
                <div style="flex: 1; background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 2px;">
                  <span style="font-size: 0.6rem; color: rgba(255,255,255,0.4); display: block; margin-bottom: 2px; text-transform: uppercase;">X (Este)</span>
                  <span style="font-size: 1rem; color: white; font-family: monospace; font-weight: 600;">${xVal}</span>
                </div>
                <button onclick="navigator.clipboard.writeText('${xVal}'); this.innerText='✓'; setTimeout(()=>this.innerText='📋', 1000)" 
                        style="background: #38bdf8; border: none; padding: 10px; border-radius: 2px; color: black; font-weight: bold; cursor: pointer; transition: 0.2s;" title="Copiar X">📋</button>
              </div>

              <div style="display: flex; gap: 8px; margin-bottom: 15px; align-items: center;">
                <div style="flex: 1; background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 2px;">
                  <span style="font-size: 0.6rem; color: rgba(255,255,255,0.4); display: block; margin-bottom: 2px; text-transform: uppercase;">Y (Norte)</span>
                  <span style="font-size: 1rem; color: white; font-family: monospace; font-weight: 600;">${yVal}</span>
                </div>
                <button onclick="navigator.clipboard.writeText('${yVal}'); this.innerText='✓'; setTimeout(()=>this.innerText='📋', 1000)" 
                        style="background: #38bdf8; border: none; padding: 10px; border-radius: 2px; color: black; font-weight: bold; cursor: pointer; transition: 0.2s;" title="Copiar Y">📋</button>
              </div>
              
              <div style="background: rgba(255,255,255,0.03); padding: 6px 12px; border-radius: 2px; font-size: 0.65rem; color: rgba(255,255,255,0.5); text-align: center;">
                EPSG: ${epsgVal}
              </div>
            </div>
          `;

          L.popup({
            maxWidth: 320,
            className: 'custom-utm-popup'
          })
            .setLatLng(e.latlng)
            .setContent(coordPopupContent)
            .openOn(initialMap);
        } catch (err) {
          console.error("Error calculating coordinates", err);
        }
      }
    };
    initialMap.on('click', onMapClick);

    // Handle Geoman drawing events for real-time measurements
    initialMap.on('pm:drawstart', (e) => {
      setMeasurements({ distance: 0, area: 0, coords: null });
      const workingLayer = e.workingLayer;
      
      if (workingLayer) {
        workingLayer.on('pm:vertexadded', (v) => {
          try {
            if (activeToolRef.current === 'distance') {
              const latlngs = workingLayer.getLatLngs();
              let dist = 0;
              for (let i = 0; i < latlngs.length - 1; i++) {
                dist += latlngs[i].distanceTo(latlngs[i+1]);
              }
              setMeasurements(prev => ({ ...prev, distance: dist }));
            } else if (activeToolRef.current === 'area') {
               // Area is tricky to compute live with open polygons 
               // Geoman handles live area in its own tooltip. We update on finish mostly.
               // But if we have at least 3 points, we can close the ring for a live preview
               const latlngs = workingLayer.getLatLngs();
               if (latlngs && latlngs.length >= 3) {
                  // Simulate closed polygon for area calculation
                  const closedLatLngs = [...latlngs, latlngs[0]];
                  
                  // Use same projection logic as App.jsx to ensure exact match
                  const targetHuso = huso || '25830';
                  const wgs84Coords = closedLatLngs.map(ll => [ll.lng, ll.lat]);
                  const projectedCoords = transformFromWGS84(wgs84Coords, targetHuso);
                  
                  const areaM2 = calculatePolygonArea(projectedCoords);
                  setMeasurements(prev => ({ ...prev, area: areaM2 }));
               }
            }
          } catch (err) {
            console.error(err);
          }
        });
      }
    });

    mapInstance.current = initialMap;
    featuresLayer.current = L.featureGroup().addTo(initialMap);
    adjustmentLayers.current.addTo(initialMap);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.off('mousemove', onMouseMove);
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapInstance.current || !featuresLayer.current) return;
    featuresLayer.current.clearLayers();
    adjustmentLayers.current.clearLayers();

    const allCoordsForBounds = [];

    const drawParcel = (p, options = {}, layerGroup = featuresLayer.current) => {
      const getParcelClassName = (parcel) => {
        if (parcel.properties?.type === 'ivga_gap') return 'ivga-gap';
        if (parcel.properties?.type === 'ivga_encroachment') return 'ivga-encroachment';
        if (parcel.properties?.type === 'ivga_internal_overlap') return 'ivga-internal-overlap';
        if (parcel.properties?.type === 'overlap_warning') return 'overlap-warning';
        return '';
      };

      const parcelClassName = getParcelClassName(p);
      const isSpecialType = parcelClassName !== '';
      const isOverlapWarning = parcelClassName === 'overlap-warning';
      
      if (!p.geometry) return;

      const geojson = L.geoJSON(p.geometry, {
        style: () => {
          if (isOverlapWarning) return { className: 'overlap-highlight-svg', color: '#f59e0b', weight: 3, fillOpacity: 0.4 };
          if (isSpecialType) return { className: parcelClassName };
          
          return {
            color: options.color || '#3388ff',
            weight: options.weight || 2,
            fillOpacity: options.fillOpacity || 0.2,
            className: [options.className, p.id === selectedParcelId ? 'selected-parcel-highlight' : ''].filter(Boolean).join(' ') || undefined
          };
        }
      });

      geojson.eachLayer((layer) => {
        // Build rich tooltip with name, area, perimeter, vertices, huso
        const geom0 = p.geometry?.geometry || p.geometry;
        let vertexCount = 0;
        if (geom0?.coordinates) {
          const rings = geom0.type === 'Polygon' ? geom0.coordinates
            : geom0.type === 'MultiPolygon' ? geom0.coordinates.flat(1)
            : geom0.type === 'LineString' ? [geom0.coordinates]
            : [];
          rings.forEach(ring => {
            // Count unique vertices (exclude duplicate closing point)
            const last = ring[ring.length - 1];
            const first = ring[0];
            const closedDup = ring.length > 1 && Math.abs(first[0]-last[0]) < 0.000001 && Math.abs(first[1]-last[1]) < 0.000001;
            vertexCount += closedDup ? ring.length - 1 : ring.length;
          });
        }

        const perimeterM = (p.originalCoords || []).reduce((acc, ring) => {
          let d = 0;
          for (let i = 0; i < ring.length - 1; i++) {
            const dx = ring[i+1][0] - ring[i][0];
            const dy = ring[i+1][1] - ring[i][1];
            d += Math.sqrt(dx*dx + dy*dy);
          }
          return acc + d;
        }, 0);
        const perimeterStr = perimeterM > 0 ? `${perimeterM.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m` : 'N/D';

        let areaStr = 'Superficie no disp.';
        if (p.area) {
          if (p.area >= 10000) {
            areaStr = `${(p.area / 10000).toLocaleString('es-ES', { maximumFractionDigits: 4 })} ha`;
          } else {
            areaStr = `${p.area.toLocaleString('es-ES', { maximumFractionDigits: 2 })} m²`;
          }
        }

        const defaultTooltip = `
          <div class="custom-tooltip">
            <div class="value-name">${p.name || 'Sin nombre'}</div>
            <div class="value-detail">Área: <strong>${areaStr}</strong></div>
            <div class="value-detail">Perímetro: <strong>${perimeterStr}</strong></div>
            <div class="value-detail">Vértices: <strong>${vertexCount}</strong></div>
            ${p.huso ? `<div class="value-detail">Huso: <strong>EPSG:${p.huso}</strong></div>` : ''}
          </div>
        `;

        const isIvga = p.properties?.type?.startsWith('ivga_');
        if (!isOverlapWarning && !isIvga && p.name) {
          layer.bindTooltip(options.tooltip || defaultTooltip, { 
            sticky: true,
            className: 'custom-tooltip-wrapper',
            opacity: 0.9
          });
        }
        
        if (options.editable) {
          layer.pm.enable({ allowSelfIntersection: false });
          layer.on('pm:edit', (e) => {
            const updatedGeojson = e.target.toGeoJSON();
            onGeometryEdited(p.id, updatedGeojson);
          });
        }

        // Click on map polygon → select this parcel in sidebar
        const isSpecialOrCadastre = isSpecialType || p.isCadastre;
        if (!isSpecialOrCadastre && onSelectParcel) {
          layer.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            onSelectParcel(p);
          });
          layer.getElement && (layer.options.cursor = 'pointer');
        }

        if (p.geometry) {
          const geom = p.geometry.geometry || p.geometry;
            if (geom && geom.coordinates) {
              const isExpanded = expandedParcelIds.has(p.id);
              let globalVIdx = 0;

              // Helper to process a ring and add markers
              const processRing = (ring) => {
                ring.forEach((coord, idx) => {
                  // Skip duplicate closing point for polygons (if more than 3 points)
                  if (!p.isLine && idx === ring.length - 1 && ring.length > 3) {
                    const first = ring[0];
                    if (Math.abs(first[0] - coord[0]) < 0.000001 && Math.abs(first[1] - coord[1]) < 0.000001) {
                      return;
                    }
                  }

                  allCoordsForBounds.push([coord[1], coord[0]]);
                  
                  if (p.isCadastre) {
                    const halo = L.circleMarker([coord[1], coord[0]], {
                      radius: 8,
                      color: '#ff0000',
                      weight: 0,
                      fillColor: '#ff0000',
                      fillOpacity: 0.15,
                      interactive: false,
                      className: 'reference-halo'
                    });
                    halo.addTo(adjustmentLayers.current);
                  }

                  if (isExpanded) {
                    const noirIcon = L.divIcon({
                      className: 'noir-vertex-icon',
                      html: `<div style="
                        background: #1a1a1a;
                        color: #ffffff;
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 10px;
                        font-weight: 700;
                        border: 1.5px solid #ffffff;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                      ">${globalVIdx + 1}</div>`,
                      iconSize: [20, 20],
                      iconAnchor: [10, 10]
                    });
                    L.marker([coord[1], coord[0]], { icon: noirIcon, interactive: false }).addTo(layerGroup);
                  }
                  globalVIdx++;
                });
              };

              if (geom.type === 'MultiPolygon') {
                geom.coordinates.forEach(poly => poly.forEach(processRing));
              } else if (geom.type === 'Polygon') {
                geom.coordinates.forEach(processRing);
              } else if (geom.type === 'LineString') {
                processRing(geom.coordinates);
              } else if (geom.type === 'Point') {
                processRing([geom.coordinates]);
              }
            }
        }
      });

      geojson.addTo(layerGroup);
    };

    const PALETTE = [
      '#38bdf8', // Sky (Primary Accent)
      '#4ade80', // Emerald (Success)
      '#f59e0b', // Amber (Warning/Cadastre-like)
      '#a78bfa', // Violet
      '#fb7185', // Rose
      '#2dd4bf', // Teal
      '#fb923c', // Orange
      '#818cf8', // Indigo
      '#c084fc', // Fuchsia
      '#94a3b8'  // Slate (Neutral)
    ];


    try {
      parcels.forEach((p, idx) => {
        // Only enable editing for regular parcels (not overlaps/reference layers)
        const isRegularParcel = !p.properties || (p.properties.type !== 'overlap_warning');
        const isReference = p.isCadastre || p.isDxf;
        
        let color = '#3388ff';
        if (!isReference && isRegularParcel) {
            color = PALETTE[idx % PALETTE.length];
        } else if (p.isCadastre) {
            color = '#ff0000';
        } else if (p.properties?.type === 'overlap_warning') {
            color = '#ffcc00';
        }

        try {
          drawParcel(p, { 
            editable: isRegularParcel,
            color: color
          });
        } catch (err) {
          console.error(`Error drawing parcel ${p.id}:`, err);
        }
      });
    } catch (err) {
      console.error('Error in parcels.forEach:', err);
    }

    if (adjustmentSession) {
      const adjustmentBoundsList = [];
      adjustmentSession.originalNeighbors.forEach(n => {
        drawParcel(n, { color: '#ff4444', weight: 1, fillOpacity: 0.1 }, adjustmentLayers.current);
      });

      adjustmentSession.proposedNeighbors.forEach(n => {
        drawParcel(n, {
          color: '#39ff14',
          weight: 3,
          fillOpacity: 0.25,
          editable: true,
          tooltip: `<b>Propuesta de Ajuste</b>`,
          className: 'proposed-editable-layer'
        }, adjustmentLayers.current);
        
        if (n.geometry && n.geometry.coordinates) {
          const coords = n.geometry.type === 'MultiPolygon' ? n.geometry.coordinates.flat(2) : n.geometry.coordinates.flat(1);
          coords.forEach(c => adjustmentBoundsList.push([c[1], c[0]]));
        }
      });

      if (adjustmentBoundsList.length > 0) {
        const adjBounds = L.latLngBounds(adjustmentBoundsList);
        let zoom = mapInstance.current.getBoundsZoom(adjBounds);
        zoom = Math.max(15, Math.min(18, zoom));
        mapInstance.current.flyTo(adjBounds.getCenter(), zoom, { duration: 1.5 });
        return; 
      }
    }

    const sessionJustCleared = prevAdjustmentSession.current && !adjustmentSession;
    prevAdjustmentSession.current = adjustmentSession;

    // Only auto-frame (fitBounds) if the number of parcels changed (loaded or cleared)
    // or if an adjustment session was just cleared.
    const parcelsChanged = parcels.length !== prevParcelsLength.current;
    prevParcelsLength.current = parcels.length;

    if (allCoordsForBounds.length > 0 && (parcelsChanged || sessionJustCleared)) {
      const bounds = L.latLngBounds(allCoordsForBounds);
      const zoom = mapInstance.current.getBoundsZoom(bounds);
      if (zoom < 10) {
        mapInstance.current.setView(bounds.getCenter(), 14);
      } else {
        mapInstance.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
      }
    } else if (parcels.length === 0 && parcelsChanged) {
      mapInstance.current.setView(SPAIN_CENTER, DEFAULT_ZOOM);
    }
  }, [parcels, adjustmentSession, expandedParcelIds, selectedParcelId]);

  useEffect(() => {
    if (!mapInstance.current || !flyToTarget) return;

    const { lat, lng, label } = flyToTarget;
    const currentZoom = mapInstance.current.getZoom();
    // Maintain current zoom level, but ensure it's at least 14 for context
    const targetZoom = Math.max(currentZoom, 14);
    mapInstance.current.flyTo([lat, lng], targetZoom, { duration: 1.5 });

    const marker = L.marker([lat, lng])
      .addTo(mapInstance.current)
      .bindPopup(`
        <div style="
          background: rgba(2, 6, 23, 0.95);
          border: 1px solid rgba(56, 189, 248, 0.4);
          border-left: 3px solid #38bdf8;
          color: #f8fafc;
          font-family: Inter, system-ui, sans-serif;
          padding: 10px 14px;
          border-radius: 0;
          min-width: 160px;
        ">
          <div style="font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; color: #38bdf8; text-transform: uppercase; margin-bottom: 4px;">NOMBRE</div>
          <div style="font-size: 0.85rem; font-weight: 600; color: #f8fafc;">${label}</div>
        </div>
      `, {
        className: 'dark-popup',
        maxWidth: 280
      })
      .openPopup();

    return () => {
      if (mapInstance.current && marker) {
        mapInstance.current.removeLayer(marker);
      }
    };
  }, [flyToTarget]);

  // --- HISTORICAL CADASTRE LAYER EFFECT ---
  useEffect(() => {
    if (!mapInstance.current) return;

    if (isHistoricalLayerActive) {
      // Hide current cadastre layer if it's on the map
      if (mainCatastroLayerRef.current && mapInstance.current.hasLayer(mainCatastroLayerRef.current)) {
        mapInstance.current.removeLayer(mainCatastroLayerRef.current);
      }

      if (!historicalLayerRef.current) {
        historicalLayerRef.current = L.tileLayer.wms('https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx?layer=history', {
          layers: 'catastro',
          format: 'image/png',
          transparent: true,
          version: '1.1.1',
          attribution: 'Catastro Histórico',
          maxNativeZoom: 19,
          maxZoom: 24,
          zIndex: 100,
          tileSize: 512, 
          keepBuffer: 4,
          updateWhenIdle: false,
          updateWhenZooming: false,
          opacity: historicalOpacity
        });
      }
      
      // Update the TIME parameter. 
      // Important: We add a small cache-buster only if it really doesn't refresh, 
      // but Leaflet setParams usually handles this by redrawing.
      historicalLayerRef.current.setParams({ 
        TIME: historicalDate,
        _cb: Date.now()
      });
      
      historicalLayerRef.current.setOpacity(historicalOpacity);
      
      if (!mapInstance.current.hasLayer(historicalLayerRef.current)) {
        historicalLayerRef.current.addTo(mapInstance.current);
      }
    } else {
      // Remove historical layer
      if (historicalLayerRef.current && mapInstance.current.hasLayer(historicalLayerRef.current)) {
        mapInstance.current.removeLayer(historicalLayerRef.current);
      }
      
      // We no longer automatically re-add the current cadastre layer here.
      // This ensures that "no me muestre por defecto la cartografía catastral".
      // The user can still enable it manually via the Layer Control on the map.
    }
  }, [isHistoricalLayerActive, historicalDate, historicalOpacity]);

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } catch (e) {
      return dateStr;
    }
  };

  // Effect to handle tool changes
  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;
    activeToolRef.current = activeTool;

    // Disable all drawing modes first
    map.pm.disableDraw();

    if (activeTool === 'distance') {
      map.pm.enableDraw('Line', { finishOn: 'dblclick' });
    } else if (activeTool === 'area') {
      map.pm.enableDraw('Polygon', { finishOn: 'dblclick' });
    } else if (activeTool === 'coordinates' || activeTool === 'go_to_cadastre') {
      // Handled by the click listener
    }

    return () => {};
  }, [activeTool]);

  // Update measurements on completion
  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;

    const onPmCreate = (e) => {
      if (activeToolRef.current === 'distance' || activeToolRef.current === 'area') {
        const layer = e.layer;
        
        try {
          if (activeToolRef.current === 'area') {
            const geojson = layer.toGeoJSON();
            const targetHuso = husoRef.current || '25830';
            
            if (geojson.geometry && geojson.geometry.type === 'Polygon') {
               const projectedRing = closeRing(transformFromWGS84(geojson.geometry.coordinates[0], targetHuso));
               const areaM2 = calculatePolygonArea(projectedRing);
               setMeasurements(prev => ({ ...prev, area: areaM2 }));
            }
          } else if (activeToolRef.current === 'distance') {
            const latlngs = layer.getLatLngs();
            let dist = 0;
            for (let i = 0; i < latlngs.length - 1; i++) {
              dist += latlngs[i].distanceTo(latlngs[i+1]);
            }
            setMeasurements(prev => ({ ...prev, distance: dist }));
          }
        } catch (err) {
          console.error("Measurement error:", err);
        }
      }
    };

    map.on('pm:create', onPmCreate);
    return () => map.off('pm:create', onPmCreate);
  }, []);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <div ref={mapRef} style={{ height: '100%', width: '100%', zIndex: 1, position: 'relative' }}></div>
      
      {/* Historical HUD */}
      {isHistoricalLayerActive && (
        <div className="historical-hud">
          <div className="hud-header">
            <History size={16} color="#38bdf8" />
            <span>CARTOGRAFÍA HISTÓRICA</span>
          </div>
          <div className="hud-date-large">{formatDateDisplay(historicalDate)}</div>
        </div>
      )}
      
      <MapTools 
        activeTool={activeTool}
        onToolChange={handleToolChange}
        measurements={measurements}
        areaUnit={areaUnit}
        setAreaUnit={setAreaUnit}
        huso={huso}
        onSearchCoords={onSearchCoords}
        onHusoChange={onHusoChange}
      />
    </div>
  );
}
