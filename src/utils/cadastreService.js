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
    
    // Extract geometry preserving MultiPolygon structure (Islands and Holes)
    const multiPolygon = [];
    const surfaces = feature.getElementsByTagNameNS('*', 'Surface');
    const polygonPatches = feature.getElementsByTagNameNS('*', 'PolygonPatch');
    // En WFS de Catastro suelen venir como Surface o PolygonPatch
    const targetSurfaces = surfaces.length > 0 ? surfaces : polygonPatches;

    for (let s = 0; s < targetSurfaces.length; s++) {
      const surface = targetSurfaces[s];
      const polygonRings = []; // [exteriorRing, interior1, interior2...]

      const extractRing = (node) => {
        const ringNode = node.getElementsByTagNameNS('*', 'LinearRing')[0];
        if (!ringNode) return null;
        const posList = ringNode.getElementsByTagNameNS('*', 'posList')[0];
        if (posList) {
          const coordsText = posList.textContent.trim().split(/\s+/);
          const ring = [];
          for (let k = 0; k < coordsText.length; k += 2) {
            if (coordsText[k] && coordsText[k+1]) {
              ring.push([parseFloat(coordsText[k]), parseFloat(coordsText[k+1])]);
            }
          }
          return ring.length > 0 ? ring : null;
        } else {
          // Fallback to pos
          const poses = ringNode.getElementsByTagNameNS('*', 'pos');
          if (poses.length > 0) {
            const ring = [];
            for (let j = 0; j < poses.length; j++) {
              const coordsText = poses[j].textContent.trim().split(/\s+/);
              ring.push([parseFloat(coordsText[0]), parseFloat(coordsText[1])]);
            }
            return ring.length > 0 ? ring : null;
          }
        }
        return null;
      };

      // 1. Exterior ring
      const exteriors = surface.getElementsByTagNameNS('*', 'exterior');
      if (exteriors.length > 0) {
        const extRing = extractRing(exteriors[0]);
        if (extRing) polygonRings.push(extRing);
      } else {
        // If there is no strict exterior/interior tag, just parse the first LinearRing we find inside this surface
        const firstRing = extractRing(surface);
        if (firstRing) polygonRings.push(firstRing);
      }

      // 2. Interior holes
      const interiors = surface.getElementsByTagNameNS('*', 'interior');
      for (let i = 0; i < interiors.length; i++) {
        const intRing = extractRing(interiors[i]);
        if (intRing) polygonRings.push(intRing);
      }

      if (polygonRings.length > 0) {
        multiPolygon.push(polygonRings);
      }
    }

    // Si por algún motivo el parseo estructural falla, hacemos un fallback simple a la primera posList como polygon simple
    if (multiPolygon.length === 0) {
      const fallbackPos = feature.getElementsByTagNameNS('*', 'posList')[0];
      if (fallbackPos) {
        const coordsText = fallbackPos.textContent.trim().split(/\s+/);
        const ring = [];
        for (let k = 0; k < coordsText.length; k += 2) {
          if (coordsText[k] && coordsText[k+1]) ring.push([parseFloat(coordsText[k]), parseFloat(coordsText[k+1])]);
        }
        if (ring.length > 0) multiPolygon.push([ring]);
      }
    }
    
    if (multiPolygon.length > 0) {
      const utmEpsg = huso.startsWith('EPSG:') ? huso : `EPSG:${huso}`;
      
      // Calculate Area (MultiPolygon)
      let areaM2 = 0;
      multiPolygon.forEach(poly => {
         if (poly.length > 0) {
            areaM2 += computeAreaUTM([poly[0]]); // Add exterior
            for (let i=1; i<poly.length; i++) areaM2 -= computeAreaUTM([poly[i]]); // Subtract holes
         }
      });
      
      // WGS84 rings for UI
      const wgs84Multi = multiPolygon.map(poly => 
         poly.map(ring => transformToWGS84(ring, utmEpsg))
      );

      results.push({
        id: `cadastre-${ref}-${i}`,
        name: ref,
        label: label,
        filename: `${ref}.gml`,
        originalCoords: multiPolygon, // Esto AHORA ES un verdadero MultiPolygon: [ [ext, int], [ext] ]
        area: Math.round(Math.abs(areaM2)),
        huso: huso,
        isCadastre: true,
        geometry: {
          type: 'MultiPolygon',
          coordinates: wgs84Multi
        }
      });
    }
  }
  
  return results;
};

/**
 * Gets the Cadastral Reference (RC) for a given X,Y coordinate pair.
 * Useful for deep-linking into Sede Electrónica.
 */
export const fetchRcByCoordinates = async (x, y, epsg) => {
  const isBrowser = typeof window !== 'undefined';
  const baseUrl = isBrowser ? '/catastro/' : 'http://ovc.catastro.meh.es/'; // Using proxy if in browser
  
  const targetEpsg = epsg.startsWith('EPSG:') ? epsg : `EPSG:${epsg}`;
  
  // Endpoint: /ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR
  const url = `${baseUrl}ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR?SRS=${targetEpsg}&Coordenada_X=${x}&Coordenada_Y=${y}`;
  
  console.log("Fetching RC by coords:", url);
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Network response was not ok");
    const text = await response.text();
    
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    
    // The response has <coor><pc1>XXXXXXX</pc1><pc2>XXXXXXX</pc2></coor>
    const pc1Node = xml.getElementsByTagName('pc1')[0];
    const pc2Node = xml.getElementsByTagName('pc2')[0];
    
    if (pc1Node && pc2Node) {
      return pc1Node.textContent.trim() + pc2Node.textContent.trim();
    }
    
    return null;
  } catch (err) {
    console.error("Error fetching RC from coordinates:", err);
    return null;
  }
};
