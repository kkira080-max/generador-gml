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
  const pointsToCount = (n > 1 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]) ? n - 1 : n;

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
 * Rounds all coordinates in any GeoJSON-like coordinate array (Polygon or MultiPolygon) 
 * to the specified decimals recursively.
 */
export const roundRings = (geometry, decimals = 2) => {
  if (!geometry || geometry.length === 0) return geometry;

  // Si el primer elemento es un número, estamos ante una coordenada [x, y]
  if (typeof geometry[0] === 'number') {
    return snapToGrid(geometry, decimals);
  }

  // Si no, es un array de anillos o de polígonos. Entramos recursivamente.
  return geometry.map(item => roundRings(item, decimals));
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


import polygonClipping from 'polygon-clipping';

const calculateMultiPolygonArea = (multiPoly) => {
  if (!multiPoly || multiPoly.length === 0) return 0;
  let totalArea = 0;
  multiPoly.forEach(polygon => {
    if (!polygon || polygon.length === 0) return;
    let polyArea = calculatePolygonArea(polygon[0]);
    for (let i = 1; i < polygon.length; i++) {
      polyArea -= calculatePolygonArea(polygon[i]);
    }
    totalArea += polyArea;
  });
  return totalArea;
};

/**
 * Performs a macro-validation by comparing the outer perimeter of all user parcels
 * against the outer perimeter of the official cadastral parcels in that area.
 * Uses exact UTM coordinates (originalCoords) and robust 2D polygon clipping 
 * to achieve Cadastral millimeter precision.
 * @param {Array} userParcels - Array of user parcel objects (must have .originalCoords)
 * @param {Array} officialParcels - Array of official cadastral parcel objects (must have .originalCoords)
 * @returns {Object} Validation result { isValid, userArea, officialArea, diffArea, overlapPercent }
 */
export const preValidateMacro = (userParcels, officialParcels) => {
  if (!userParcels || userParcels.length === 0) {
    return { isValid: false, message: "No hay parcelas de usuario para validar." };
  }
  if (!officialParcels || officialParcels.length === 0) {
    return { isValid: false, message: "No se encontraron parcelas oficiales en esta zona." };
  }

  try {
    // 1. Extract UTM Polygons and ROUND perfectly to 3 decimal places (millimeters)
    // Esto es crucial para que el motor booleano no detecte falsos huecos por el "ruido matemático"
    // de los decimales flotantes del AutoCAD vs los del servidor del Catastro.
    const userPolys = userParcels
      .map(p => roundRings(p.originalCoords, 3))
      .filter(c => c && c.length > 0);

    const officialPolys = officialParcels
      .map(p => roundRings(p.originalCoords, 3))
      .filter(c => c && c.length > 0);

    if (userPolys.length === 0) return { isValid: false, message: "Parcelas de usuario sin coordenadas." };
    if (officialPolys.length === 0) return { isValid: false, message: "Parcelas oficiales sin coordenadas." };

    // 2. Union all user parcels to get the Macro-User-Perimeter
    const userMacro = polygonClipping.union(...userPolys);

    // 3. Identificador de Parcelas Objetivo (El algoritmo definitivo)
    // Al no introducir manualmente la Referencia Catastral, la App debe adivinar matemáticamente
    // qué parcelas oficiales son el "Objetivo" a modificar, y cuáles son "Vecinos Inocentes".
    // Regla de Oro:
    // - Si el dibujo del usuario cae predominantemente (> 30%) dentro de una parcela oficial, esa parcela es Objetivo.
    // - Si el dibujo del usuario engulle casi toda (> 80%) la parcela oficial, esa parcela es Objetivo (Agrupaciones).
    // - Si el solape no cumple ninguna, es una INVASIÓN ILEGAL a un vecino.

    // El BBox gigante descargará cientos de parcelas.
    const involvedOfficialPolys = officialPolys.filter(oPoly => {
      try {
        const inter = polygonClipping.intersection(userMacro, oPoly);
        const interArea = calculateMultiPolygonArea(inter);
        if (interArea < 0.1) return false; // Ruido puro

        const oPolyArea = calculateMultiPolygonArea(oPoly);
        const userArea = calculateMultiPolygonArea(userMacro);

        const coveredOfUser = interArea / userArea;
        const coveredOfOfficial = interArea / oPolyArea;

        // Es Target si el DXF dedica al menos el 30% de su propia área a pisar esta parcela oficial,
        // O si pisa más del 80% del área de la parcela oficial.
        return coveredOfUser >= 0.30 || coveredOfOfficial >= 0.80;
      } catch (e) {
        return false;
      }
    });

    if (involvedOfficialPolys.length === 0) {
      return { isValid: false, message: "No se identificaron parcelas oficiales directamente afectadas." };
    }

    // 4. Union de solo las parcelas oficiales afectadas para reconstruir la forma original del Catastro
    const officialMacro = polygonClipping.union(...involvedOfficialPolys);

    if (!userMacro || userMacro.length === 0 || !officialMacro || officialMacro.length === 0) {
      return { isValid: false, message: "Error al fusionar las geometrías (topología inválida)." };
    }

    // 5. Calculate exact UTM areas
    const userArea = calculateMultiPolygonArea(userMacro);
    const officialArea = calculateMultiPolygonArea(officialMacro);

    // 6. Análisis Estricto tipo Catastro (Ingeniería Inversa IVGA)
    // El Catastro es implacable: busca "Invasiones" (Solapes sobre parcelas no involucradas)
    // y "Huecos" (Gaps dejados sin cubrir del conjunto original).
    const intersection = polygonClipping.intersection(userMacro, officialMacro);
    const intersectionArea = calculateMultiPolygonArea(intersection);

    // Un "Hueco" es el área oficial que te has dejado sin rellenar con tu nuevo diseño.
    // Un "Solape/Invasión" es el área nueva que se sale de los límites oficiales afectados.
    const gapArea = Math.abs(officialArea - intersectionArea);
    const overlapInvasionArea = Math.abs(userArea - intersectionArea);

    // La tolerancia del Catastro suele estar rondando los pocos decímetros cuadrados (0.01 - 0.1 m2)
    // Las Tolerancias Catastrales Oficiales (Identidad Gráfica)
    // Permiten un margen de error relativo por desplazamientos milimétricos en el CAD.
    // Típicamente el margen permitido en área ronda un 0.2% - 0.5% por pequeños desplazamientos de vértices permitidos.
    const toleranceMargin = officialArea * 0.002; // 0.2% del área total afectada
    const baseTolerance = 1.5; // Mínimo 1.5 m2 para permitir micro-solapes técnicos en todos los casos

    const TOLERANCE_M2 = Math.max(baseTolerance, toleranceMargin);

    // CRÍTICO: Según solicitud del usuario, CUALQUIER merma/hueco o invasión por encima
    // de la tolerancia oficial debe dar un resultado NEGATIVO en la interfaz.
    const isValid = gapArea <= TOLERANCE_M2 && overlapInvasionArea <= TOLERANCE_M2;

    let message = "";
    if (isValid) {
      if (gapArea > 0.01 || overlapInvasionArea > 0.01) {
        message = `POSITIVO: Coincidencia geométrica correcta (con ajuste técnico).`;
      } else {
        message = "POSITIVO: El contorno exterior coincide exactamente con la cartografía oficial.";
      }
    } else {
      if (overlapInvasionArea > TOLERANCE_M2) {
        message = `NEGATIVO: Existe una INVASIÓN (solape a terceros) fuera del límite catastral oficial.`;
      } else if (gapArea > TOLERANCE_M2) {
        message = `NEGATIVO: Topología respetada, pero existe una **Disminución de Cabida o Hueco (Merma)** respecto al área catastral original. El Catastro te pedirá justificar por qué la parcela merma.`;
      } else {
        message = `NEGATIVO: La geometría del conjunto no encaja con la planimetría oficial.`;
      }
    }

    // Calculate a matching percentage just for the UI
    const overlapUser = (intersectionArea / userArea) * 100;
    const overlapOfficial = (intersectionArea / officialArea) * 100;
    const overlapPercent = Math.min(overlapUser, overlapOfficial);

    const diffArea = Math.abs(userArea - officialArea);

    return {
      isValid,
      userArea,
      officialArea,
      diffArea,
      overlapPercent,
      message,
      gapArea,
      overlapInvasionArea
    };

  } catch (error) {
    console.error("Error during exact macro-validation:", error);
    return { isValid: false, message: "Error de cálculo geométrico riguroso. Revisa si hay auto-intersecciones puras." };
  }
};

