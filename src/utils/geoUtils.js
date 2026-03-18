import proj4 from 'proj4';
import * as turf from '@turf/turf';


// Define the UTM ETRS89 projections used in Spain
proj4.defs('EPSG:25827', '+proj=utm +zone=27 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:25828', '+proj=utm +zone=28 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:25829', '+proj=utm +zone=29 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:25830', '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:25831', '+proj=utm +zone=31 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Define Canary Islands REGCAN95 & WGS84 projections
proj4.defs('EPSG:4080', '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs');
proj4.defs('EPSG:4081', '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs');
proj4.defs('EPSG:4082', '+proj=utm +zone=27 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:4083', '+proj=utm +zone=28 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:32628', '+proj=utm +zone=28 +datum=WGS84 +units=m +no_defs');

proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs('EPSG:4258', '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs');

/**
 * Transforms an array of [lng, lat] coordinates to a specific EPSG
 * @param {Array} coords - Array of [lng, lat]
 * @param {String} targetEpsg - e.g. '25830' or 'EPSG:25830'
 * @returns {Array} Array of [x, y]
 */
export const transformFromWGS84 = (coords, targetEpsg) => {
  const epsg = targetEpsg.startsWith('EPSG:') ? targetEpsg : `EPSG:${targetEpsg}`;
  if (!proj4.defs(epsg)) {
    console.warn(`Projection ${epsg} not found, defaulting to EPSG:25830`);
  }
  const toProj = proj4.defs(epsg) ? epsg : 'EPSG:25830';
  return coords.map(coord => proj4('EPSG:4326', toProj, [coord[0], coord[1]]));
};

/**
 * Transforms an array of [x, y] coordinates from a specific EPSG to WGS84 [lng, lat]
 * @param {Array} coords - Array of [x, y]
 * @param {String} sourceEpsg - e.g. '25830' or 'EPSG:25830'
 * @returns {Array} Array of [lng, lat]
 */
export const transformToWGS84 = (coords, sourceEpsg) => {
  const epsg = sourceEpsg.startsWith('EPSG:') ? sourceEpsg : `EPSG:${sourceEpsg}`;
  if (!proj4.defs(epsg)) {
    console.warn(`Projection ${epsg} not found, defaulting to EPSG:25830`);
  }
  const fromProj = proj4.defs(epsg) ? epsg : 'EPSG:25830';
  return coords.map(coord => proj4(fromProj, 'EPSG:4326', [coord[0], coord[1]]));
};


/**
 * Calculates the area of a polygon using the shoelace formula on projected coordinates.
 * Coordinates must be in a projected CRS (meters) like UTM.
 * This version handles wrap-around for both closed and open rings.
 * @param {Array} ring - Array of [x, y] coordinates
 * @returns {Number} Area in square meters
 */
export const calculatePolygonArea = (ring) => {
  if (!ring || ring.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const p1 = ring[i];
    const p2 = ring[j];
    area += (p2[0] + p1[0]) * (p2[1] - p1[1]);
  }
  return Math.abs(area) / 2;
};

/**
 * Calculates the perimeter of a polygon ring.
 * @param {Array} ring - Array of [x, y] coordinates in meters
 * @returns {Number} Perimeter in meters
 */
export const calculatePerimeter = (ring) => {
  if (!ring || ring.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const p1 = ring[i];
    const p2 = ring[i + 1];
    perimeter += Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2));
  }
  return perimeter;
};


/**
 * Validates if the first and last coordinates match (closed ring).
 * @param {Array} ring - Array of [x, y]
 */
export const isClosedRing = (ring) => {
  if (!ring || ring.length < 4) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return Math.abs(first[0] - last[0]) < 0.001 && Math.abs(first[1] - last[1]) < 0.001;
};

/**
 * Forces a ring to close by appending the first coordinate to the end if not closed.
 */
export const closeRing = (ring) => {
  if (!isClosedRing(ring)) {
    return [...ring, [...ring[0]]];
  }
  return ring;
};

/**
 * Calculates the centroid of a polygon ring.
 * @param {Array} ring - Array of [x, y] coordinates
 * @returns {Array} [x, y] Centroid coordinates
 */
export const calculateCentroid = (ring) => {
    if (!ring || ring.length === 0) return [0, 0];
    let x = 0, y = 0;
    const n = ring.length;

    // If it's closed and the last point is same as first, we avoid double counting
    const pointsToCount = (n > 1 && ring[0][0] === ring[n-1][0] && ring[0][1] === ring[n-1][1]) ? n - 1 : n;

    for (let i = 0; i < pointsToCount; i++) {
        x += ring[i][0];
        y += ring[i][1];
    }
    return [x / pointsToCount, y / pointsToCount];
};

/**
 * Snap coordinates to a grid (e.g., 0.01m for Cadastre).
 * Rounded to the specified number of decimals.
 */
export const snapToGrid = (coord, decimals = 2) => {
  return [
    Math.round(coord[0] * Math.pow(10, decimals)) / Math.pow(10, decimals),
    Math.round(coord[1] * Math.pow(10, decimals)) / Math.pow(10, decimals)
  ];
};

/**
 * Rounds all coordinates in an array of rings to the specified decimals.
 */
export const roundRings = (rings, decimals = 2) => {
  return rings.map(ring => ring.map(coord => snapToGrid(coord, decimals)));
};


/**
 * Calculates the bounding box of a parcel (all rings).
 * @param {Array} rings - Array of rings [[x,y], ...]
 * @returns {Array} [minX, minY, maxX, maxY]
 */
export const calculateBbox = (rings) => {
  if (!rings || rings.length === 0) return [0, 0, 0, 0];
  
  // Use rounded rings for bbox calculation to avoid tiny precision shifts
  const processedRings = roundRings(rings, 3);
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  processedRings.forEach(ring => {
    ring.forEach(coord => {
      if (coord[0] < minX) minX = coord[0];
      if (coord[1] < minY) minY = coord[1];
      if (coord[0] > maxX) maxX = coord[0];
      if (coord[1] > maxY) maxY = coord[1];
    });
  });
  // Add a small buffer (e.g., 100 meters)
  const buffer = 100;
  return [minX - buffer, minY - buffer, maxX + buffer, maxY + buffer];
};

/**
 * Validates a geometry for common topological errors.
 * @param {Object} geometry - GeoJSON-like geometry
 * @returns {Array} List of error objects { type: string, message: string }
 */
export const validateTopology = (geometry) => {
  const errors = [];
  if (!geometry || !geometry.coordinates) return errors;

  // El usuario desea que solo se muestre la advertencia si el polígono no está cerrado.
  // GML v4 requiere estrictamente anillos cerrados (primer punto = último punto).
  
  const checkRings = (rings) => {
    rings.forEach(ring => {
      if (!isClosedRing(ring)) {
        errors.push({ 
          type: 'error', 
          message: 'Polilínea abierta: El polígono no está cerrado.' 
        });
      }
    });
  };

  if (geometry.type === 'Polygon') {
    checkRings(geometry.coordinates);
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach(poly => checkRings(poly));
  }

  return errors;
};

/**
 * Ensures that the outer ring of a polygon is anti-clockwise (INSPIRE / GML v4 requirement).
 * @param {Array} ring - Array of [x, y] coordinates
 * @returns {Array} Oriented ring
 */
export const ensureInspireOrientation = (ring) => {
  if (!ring || ring.length < 3) return ring;
  
  // Use turf.booleanClockwise
  const feature = turf.polygon([ring]);
  if (turf.booleanClockwise(feature)) {
    // It's clockwise, reverse it to make it anti-clockwise for GML v4 Surface
    return [...ring].reverse();
  }
  return ring;
};

