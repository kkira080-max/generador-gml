import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import proj4 from 'proj4';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import '@geoman-io/leaflet-geoman-free';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { calculatePolygonArea, calculatePerimeter, transformFromWGS84 } from '../utils/geoUtils';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const SPAIN_CENTER = [40.463667, -3.74922];
const DEFAULT_ZOOM = 6;

export default function MapViewer({ parcels, expandedParcelIds = new Set(), onDrawingCreated, adjustmentSession, onGeometryEdited, huso, flyToTarget }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const featuresLayer = useRef(null);
  const adjustmentLayers = useRef(new L.LayerGroup());
  const prevAdjustmentSession = useRef(adjustmentSession);

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
    });

    const satelliteLayer = L.layerGroup([
      L.tileLayer.wms('https://www.ign.es/wms-inspire/pnoa-ma', {
        layers: 'OI.OrthoimageCoverage',
        format: 'image/jpeg',
        transparent: false,
        version: '1.3.0',
        attribution: 'PNOA con origen en servicio web del IGN',
        maxNativeZoom: 19,
        maxZoom: 24,
      }),
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CartoDB',
        maxNativeZoom: 19,
        maxZoom: 24,
      })
    ]);

    const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CartoDB',
      maxNativeZoom: 19,
      maxZoom: 24,
    });

    const cadLayer = L.layerGroup([]);
    const catastroLayer = L.tileLayer.wms('https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx', {
      layers: 'catastro',
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      attribution: 'Sede Electrónica del Catastro',
      maxNativeZoom: 19,
      maxZoom: 24,
    });


    defaultLayer.addTo(initialMap);

    const baseMaps = {
      "Predeterminado (Claro)": defaultLayer,
      "Imagen PNOA": satelliteLayer,
      "Oscuro": darkLayer,
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
      drawPolyline: true,
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
      
      // If we are in "Measurement mode", we DON'T add to parcels, 
      // we just let the layer stay until "Clear" or "Exit measurement mode".
      const isMeasurementMode = initialMap.pm.globalDrawMode === 'Line' || initialMap.pm.globalDrawMode === 'Polygon';
      // Wait, Geoman doesn't have a specific "measurement" flag on p:create by default 
      // unless we manage it. 

      // I will add a custom property to the map to track if we are just measuring
      if (initialMap._isMeasuring) {
        // Just let it be, it has tooltips. Add a 'Remove' button to the layer tooltip?
        layer.bindPopup('Medición finalizada. <button onclick="this.parentNode.parentNode.remove()">Eliminar</button>');
        return;
      }

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

    // --- CUSTOM MEASUREMENT BUTTON ---
    const measureControl = L.Control.extend({
      onAdd: function() {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const button = L.DomUtil.create('a', 'measure-tool-btn', container);
        button.innerHTML = '📏';
        button.title = 'Modo Medición (No crea parcelas)';
        button.href = '#';

        L.DomEvent.on(button, 'click', (ev) => {
          L.DomEvent.preventDefault(ev);
          initialMap._isMeasuring = !initialMap._isMeasuring;
          if (initialMap._isMeasuring) {
            button.style.backgroundColor = '#38bdf8';
            button.style.color = '#000';
            initialMap.pm.enableDraw('Line', { 
              measurements: { display: true },
              snappable: true,
              snapDistance: 20
            });
            alert("Modo Medición ACTIVO. Dibuja líneas o polígonos para ver medidas. No se guardarán como parcelas.");
          } else {
            button.style.backgroundColor = '';
            button.style.color = '';
            initialMap.pm.disableDraw();
            alert("Modo Medición DESACTIVADO.");
          }
        });
        return container;
      }
    });

    new measureControl({ position: 'topleft' }).addTo(initialMap);

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
        div.innerHTML = `<span>COORDENADAS UTM (${huso || '25830'})</span><div id="utm-coords-display">ESPERANDO MOVIMIENTO...</div>`;
        return div;
      }
    });
    new utmControl({ position: 'bottomleft' }).addTo(initialMap);

    // 3. Layer Control - positioned last to appear at the end of the flex-row
    L.control.layers(baseMaps, overlayMaps, { position: 'bottomleft' }).addTo(initialMap);

    const onMouseMove = (e) => {
      const { lat, lng } = e.latlng;
      const epsgCode = `EPSG:${huso || '25830'}`;
      try {
        const utm = proj4('EPSG:4326', epsgCode, [lng, lat]);
        const display = document.getElementById('utm-coords-display');
        if (display) {
          display.innerHTML = `E: ${utm[0].toLocaleString('es-ES', { minimumFractionDigits: 3 })} • N: ${utm[1].toLocaleString('es-ES', { minimumFractionDigits: 3 })}`;
        }
      } catch (err) {
        const display = document.getElementById('utm-coords-display');
        if (display) {
          display.innerHTML = `Error UTM (${huso || '25830'})`;
        }
      }
    };

    initialMap.on('mousemove', onMouseMove);

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
  }, [huso]);

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
      
      const geojson = L.geoJSON(p.geometry, {
        style: () => {
          if (isOverlapWarning) return { className: 'overlap-highlight-svg', color: '#f59e0b', weight: 3, fillOpacity: 0.4 };
          if (isSpecialType) return { className: parcelClassName };
          
          return {
            color: options.color || '#3388ff',
            weight: options.weight || 2,
            fillOpacity: options.fillOpacity || 0.2,
            className: options.className || ''
          };
        }
      });

      geojson.eachLayer((layer) => {
        // Default tooltip showing Name and Area
        const areaStr = p.area ? `${p.area.toLocaleString('es-ES')} m²` : 'Superficie no disp.';
        const defaultTooltip = `
          <div class="custom-tooltip">
            <div class="value-name">${p.name}</div>
            <div class="value-detail">Área: <strong>${areaStr}</strong></div>
            ${p.huso ? `<div class="value-detail">Huso: ${p.huso}</div>` : ''}
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
                  } else {
                    const marker = L.circleMarker([coord[1], coord[0]], {
                      radius: 4,
                      color: p.isCadastre ? '#ff0000' : '#00ff00',
                      weight: 1,
                      fillColor: '#fff',
                      fillOpacity: 0.8,
                      className: 'vertex-marker'
                    });
                    marker.addTo(layerGroup);
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

      drawParcel(p, { 
        editable: isRegularParcel,
        color: color
      });
    });

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
        zoom = Math.max(15, Math.min(22, zoom));
        mapInstance.current.flyTo(adjBounds.getCenter(), zoom, { duration: 1.5 });
        return; 
      }
    }

    const sessionJustCleared = prevAdjustmentSession.current && !adjustmentSession;
    prevAdjustmentSession.current = adjustmentSession;

    if (allCoordsForBounds.length > 0 && !sessionJustCleared) {
      const bounds = L.latLngBounds(allCoordsForBounds);
      const zoom = mapInstance.current.getBoundsZoom(bounds);
      if (zoom < 10) {
        mapInstance.current.setView(bounds.getCenter(), 14);
      } else {
        mapInstance.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 19 });
      }
    } else if (parcels.length === 0) {
      mapInstance.current.setView(SPAIN_CENTER, DEFAULT_ZOOM);
    }

  }, [parcels, adjustmentSession, expandedParcelIds]);

  useEffect(() => {
    if (!mapInstance.current || !flyToTarget) return;

    const { lat, lng, label } = flyToTarget;
    mapInstance.current.flyTo([lat, lng], 17, { duration: 1.5 });

    const marker = L.marker([lat, lng])
      .addTo(mapInstance.current)
      .bindPopup(`<b>Referencia Catastral:</b><br/>${label}`)
      .openPopup();

    // Remove marker after 10 seconds or when target changes
    const timer = setTimeout(() => {
      if (mapInstance.current && marker) {
        mapInstance.current.removeLayer(marker);
      }
    }, 10000);

    return () => {
      clearTimeout(timer);
      if (mapInstance.current && marker) {
        mapInstance.current.removeLayer(marker);
      }
    };
  }, [flyToTarget]);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <div ref={mapRef} style={{ height: '100%', width: '100%', zIndex: 1, position: 'relative' }}></div>
    </div>
  );
}
