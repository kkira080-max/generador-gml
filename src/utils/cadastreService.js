import proj4 from 'proj4';
import { transformToWGS84, roundRings } from './geoUtils.js';

/**
 * Computes polygon area in m² for UTM coordinates using the Shoelace formula.
 */
function computeAreaUTM(rings) {
  if (!rings || rings.length === 0 || !rings[0] || rings[0].length < 3) return 0;
  const ring = rings[0]; // outer ring only
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  area += ring[n - 1][0] * ring[0][1] - ring[0][0] * ring[n - 1][1];
  return Math.abs(area) / 2;
}

/**
 * Fetches cadastral parcels from the Spanish Cadastre WFS service that intersect with the given bbox.
 * @param {Array} bbox - [minX, minY, maxX, maxY] in the specified EPSG.
 * @param {String} epsg - The EPSG code (e.g., '25830').
 * @returns {Promise<Array>} List of parcels found.
 */
export const fetchParcelsByBbox = async (bbox, epsg) => {
  // Since we are now requesting the target UTM EPSG directly from WFS (e.g. EPSG:25830),
  // we can pass the UTM BBox directly without converting to EPSG:4258 first.
  // WFS 2.0.0 with Projected CRS (like EPSG:25830) expects Easting/Northing order:
  // [minX, minY, maxX, maxY]
  const geoBbox = [bbox[0], bbox[1], bbox[2], bbox[3]];

  const isBrowser = typeof window !== 'undefined';
  const baseUrl = isBrowser ? '/catastro/' : 'http://ovc.catastro.meh.es/';
  
  // Directly request the UTM projection the user selected (e.g., EPSG:25830)
  const targetEpsg = epsg.startsWith('EPSG:') ? epsg : `EPSG:${epsg}`;
  
  const url = `${baseUrl}INSPIRE/wfsCP.aspx?` +
    `SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=cp:CadastralParcel&` +
    `SRSNAME=${targetEpsg}&BBOX=${geoBbox[0]},${geoBbox[1]},${geoBbox[2]},${geoBbox[3]}` +
    `&OUTPUTFORMAT=application/gml+xml; version=3.2`;

  console.log("Fetching from Catastro Proxy URL:", url);

  try {
    const response = await fetch(url);
    console.log("Catastro Response Status:", response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Catastro error response text:", errorText);
      throw new Error(`Error en Catastro (HTTP ${response.status}): ${response.statusText}`);
    }
    
    const text = await response.text();
    // Check if the response is actually an XML exception
    if (text.includes('ExceptionReport') || text.includes('ServiceException')) {
      console.error("Catastro WFS Exception Detail:", text);
      throw new Error('El servicio del Catastro ha devuelto un error interno o de parámetros.');
    }

    return parseWfsGml(text, epsg);
  } catch (error) {
    console.error('CRITICAL: Cadastre Fetch Error:', error);
    if (error.message.includes('Failed to fetch')) {
      throw new Error(`No se pudo conectar con el Proxy del servidor. Detalle: ${error.message}`);
    }
    throw error;
  }
};

/**
 * Minimal parser for the GML returned by the Cadastre WFS.
 * This is a simplified version targeting CP:CadastralParcel.
 */
const parseWfsGml = (xmlString, huso) => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlString, 'application/xml');
  const features = xml.getElementsByTagNameNS('*', 'CadastralParcel');
  
  const results = [];
  
  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    
    // Prioritize nationalCadastralReference, then localId
    const nationalRef = feature.getElementsByTagNameNS('*', 'nationalCadastralReference')[0]?.textContent;
    const localId = feature.getElementsByTagNameNS('*', 'localId')[0]?.textContent;
    const ref = nationalRef || localId || `PARCELA-${i}`;
    
    const label = feature.getElementsByTagNameNS('*', 'label')[0]?.textContent || ref;
    
    // Extract geometry (can be in posList or pos elements)
    const posLists = feature.getElementsByTagNameNS('*', 'posList');
    const rings = [];
    
    if (posLists.length > 0) {
      for (let j = 0; j < posLists.length; j++) {
        const coordsText = posLists[j].textContent.trim().split(/\s+/);
        const ring = [];
        for (let k = 0; k < coordsText.length; k += 2) {
          if (coordsText[k] && coordsText[k+1]) {
            // WFS 2.0 with EPSG:25830 natively returns Easting (X), Northing (Y)
            const x = parseFloat(coordsText[k]);
            const y = parseFloat(coordsText[k+1]);
            ring.push([x, y]);
          }
        }
        if (ring.length > 0) rings.push(ring);
      }
    } else {
      // Fallback to pos elements if posList is missing (unlikely in WFS 2.0 but safe)
      const poses = feature.getElementsByTagNameNS('*', 'pos');
      if (poses.length > 0) {
        const ring = [];
        for (let j = 0; j < poses.length; j++) {
          const coordsText = poses[j].textContent.trim().split(/\s+/);
          const x = parseFloat(coordsText[0]);
          const y = parseFloat(coordsText[1]);
          ring.push([x, y]);
        }
        rings.push(ring);
      }
    }
    
    if (rings.length > 0) {
      // Data is returned natively in Target UTM EPSG thanks to the SRSNAME parameter.
      // Unlike 4258, UTM coords (X, Y) are returned in order (Easting, Northing).
      const utmEpsg = huso.startsWith('EPSG:') ? huso : `EPSG:${huso}`;
      
      const utmRings = rings; 

      // And geometry in WGS84 for the map
      const wgs84Rings = rings.map(ring => transformToWGS84(ring, utmEpsg));

      // MAINTAIN SOURCE PRECISION (No rounding to avoid gaps)
      const roundedUtmRings = utmRings; // Keep raw precision from WFS
      const areaM2 = computeAreaUTM(roundedUtmRings);

      results.push({
        id: `cadastre-${ref}-${i}`,
        name: ref,
        label: label,
        filename: `${ref}.gml`,
        originalCoords: roundedUtmRings,
        area: Math.round(areaM2), // m² for GML v4 cp:areaValue
        huso: huso,
        isCadastre: true,
        geometry: {
          type: 'Polygon',
          coordinates: wgs84Rings
        }
      });

    }
  }
  
  return results;
};
