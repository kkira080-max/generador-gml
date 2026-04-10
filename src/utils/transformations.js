import * as turf from '@turf/turf';
import { calculateCentroid, calculatePolygonArea, closeRing, roundRings } from './geoUtils';

/**
 * Funciones de cálculo matricial necesarias para el "Método de la Matriz Inversa"
 */
const transpose = (m) => m[0].map((_, i) => m.map(row => row[i]));
const multiplyMatrices = (a, b) => a.map(row => transpose(b).map(col => row.reduce((sum, val, i) => sum + val * col[i], 0)));

const gaussJordanInverse = (matrix) => {
  const n = matrix.length;
  const m = matrix.map(row => [...row]);
  const inv = Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => i === j ? 1 : 0));

  for (let i = 0; i < n; i++) {
    let pivot = m[i][i];
    if (pivot === 0) {
      let swapRow = -1;
      for (let k = i + 1; k < n; k++) {
        if (m[k][i] !== 0) { swapRow = k; break; }
      }
      if (swapRow === -1) throw new Error("Matriz singular");
      [m[i], m[swapRow]] = [m[swapRow], m[i]];
      [inv[i], inv[swapRow]] = [inv[swapRow], inv[i]];
      pivot = m[i][i];
    }
    const invPivot = 1 / pivot;
    for (let j = 0; j < n; j++) {
      m[i][j] *= invPivot;
      inv[i][j] *= invPivot;
    }
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = m[k][i];
        for (let j = 0; j < n; j++) {
          m[k][j] -= factor * m[i][j];
          inv[k][j] -= factor * inv[i][j];
        }
      }
    }
  }
  return inv;
};

/**
 * Calculates 4-parameter Helmert Transformation (Cramer method) between two sets of polygons.
 * USING THE EXPLICIT INVERSE MATRIX METHOD: X = (A^T * A)^-1 * A^T * L
 * 
 * Formula: 
 * X_new = a * X - b * Y + Tx
 * Y_new = b * X + a * Y + Ty

 * 
 * @param {Array} coordsOriginal - Outer ring [ [x, y], ... ] of reality parcel
 * @param {Array} coordsAdapted - Outer ring [ [x, y], ... ] of adapted parcel
 * @returns {Object} { Tx, Ty, rotation (deg), scale, errorMsg }
 */
export const calculateHelmertParameters = (coordsOriginal, coordsAdapted) => {
  // 1. Strict validation requested by user: Must have exact same number of vertices
  if (!coordsOriginal || !coordsAdapted) {
    return { errorMsg: "Geometrías inválidas para el cálculo." };
  }

  // Remove the closing duplicate vertex if present, for pure vertex counting
  const cleanOriginal = isClosed(coordsOriginal) ? coordsOriginal.slice(0, -1) : coordsOriginal;
  const cleanAdapted = isClosed(coordsAdapted) ? coordsAdapted.slice(0, -1) : coordsAdapted;

  if (cleanOriginal.length !== cleanAdapted.length) {
    return { 
      errorMsg: `Discrepancia en vértices: La geometría original tiene ${cleanOriginal.length} puntos, pero la adaptada tiene ${cleanAdapted.length}. Asegúrate de que ambas son idénticas en forma topológica antes de obtener los parámetros.` 
    };
  }

  if (cleanOriginal.length < 2) {
    return { errorMsg: "Se necesitan al menos 2 vértices para calcular rotación y traslación." };
  }

  // 2. Mínimos Cuadrados mediante el Método de la Matriz Inversa
  // Ecuaciones de observación (2N x 4):
  // X'_i = a*X_i - b*Y_i + Tx
  // Y'_i = b*X_i + a*Y_i + Ty
  // Sistema: A * X = L  ==> X = (A^T * A)^-1 * A^T * L
  
  const n = cleanOriginal.length;
  
  // 3. Estabilización Numérica (Obligatorio en Topografía)
  // Las coordenadas UTM son del orden de millones (ej. 4000000). 
  // Al elevar al cuadrado en A^T*A perdemos toda la precisión flotante de 64 bits y la matriz
  // da error de singularidad. Desplazamos el origen localmente al centroide.
  let sumX = 0, sumY = 0, sumXp = 0, sumYp = 0;
  for(let i = 0; i < n; i++) {
    sumX += cleanOriginal[i][0];
    sumY += cleanOriginal[i][1];
    sumXp += cleanAdapted[i][0];
    sumYp += cleanAdapted[i][1];
  }
  const Xc = sumX / n;
  const Yc = sumY / n;
  const Xcp = sumXp / n;
  const Ycp = sumYp / n;

  const A = []; // Matriz de coeficientes (2N x 4)
  const L = []; // Vector de observaciones (2N x 1)
  
  for (let i = 0; i < n; i++) {
    const origX = cleanOriginal[i][0] - Xc;
    const origY = cleanOriginal[i][1] - Yc;
    const adpX = cleanAdapted[i][0] - Xcp;
    const adpY = cleanAdapted[i][1] - Ycp;

    A.push([origX, -origY, 1, 0]);
    L.push([adpX]);

    A.push([origY, origX, 0, 1]);
    L.push([adpY]);
  }

  const AT = transpose(A); // A traspuesta
  const ATA = multiplyMatrices(AT, A); // A^T * A
  
  let ATA_inv;
  try {
    ATA_inv = gaussJordanInverse(ATA); // (A^T * A)^-1 (La matriz inversa propiamente dicha)
  } catch (e) {
    return { errorMsg: "La matriz es singular o los datos son colineales y no se puede invertir." };
  }

  const ATL = multiplyMatrices(AT, L); // A^T * L
  const X_params = multiplyMatrices(ATA_inv, ATL); // Vector solución X (4x1)

  const a = X_params[0][0];
  const b = X_params[1][0];
  const dx = X_params[2][0];
  const dy = X_params[3][0];

  // 4. Transformar los parámetros desplazados al sistema UTM global
  const Tx = Xcp - a * Xc + b * Yc + dx;
  const Ty = Ycp - b * Xc - a * Yc + dy;

  const scale = Math.sqrt(a * a + b * b);
  // Rotation in radians
  const rotRad = Math.atan2(b, a);
  // Rotation in degrees
  const rotDeg = rotRad * (180 / Math.PI);

  // Strict cadastre checks (usually scale must be near 1.0)
  return {
    Tx,
    Ty,
    rotationDeg: rotDeg,
    a,
    b,
    scale,
    errorMsg: null
  };
};

/**
 * Applies translation and rotation (and scale implicitly from a,b) to an entire multi-polygon / polygon array.
 */
export const applyHelmertTransformation = (coordsArray, { Tx, Ty, a, b }) => {
  const transformPoint = (coord) => {
    const xNew = coord[0] * a - coord[1] * b + Tx;
    const yNew = coord[0] * b + coord[1] * a + Ty;
    return [xNew, yNew];
  };

  const transformDeep = (arr) => {
    // Si el primer elemento es un número, significa que estamos en un [x, y]
    if (arr && typeof arr[0] === 'number') {
      return transformPoint(arr);
    }
    // De lo contrario, seguimos bajando niveles (Ring, Polygon, MultiPolygon)
    return arr.map(subArr => transformDeep(subArr));
  };

  return transformDeep(coordsArray);
};

/**
 * Iterative best fit using centroid matching and angular sweeps.
 * @param {Array} originalCoords - Target geometry to move
 * @param {Array} cadastreCoords - Reference geometry to match
 * @returns {Object} Best transformation parameters to apply { Tx, Ty, a, b, rotationDeg }
 */
export const findBestCadastreFit = (originalCoords, cadastreCoords) => {
  if (!originalCoords || !cadastreCoords || originalCoords.length === 0 || cadastreCoords.length === 0) {
    throw new Error("Coordenadas inválidas para el ajuste.");
  }

  const getOuterRing = (coords) => {
    if (!coords || !coords[0]) return null;
    if (typeof coords[0][0] === 'number') return coords; // [ [x,y] ]
    if (typeof coords[0][0][0] === 'number') return coords[0]; // Polygon [ [ [x,y] ] ]
    if (typeof coords[0][0][0][0] === 'number') return coords[0][0]; // MultiPolygon
    return coords;
  };

  const origOuter = getOuterRing(originalCoords);
  const tgtOuter = getOuterRing(cadastreCoords);

  const origCentroid = calculateCentroid(origOuter);
  const tgtCentroid = calculateCentroid(tgtOuter);

  // Aseguramos anillos cerrados para Turf
  let safeTgtOuter = [...tgtOuter];
  if (Math.abs(safeTgtOuter[0][0] - safeTgtOuter[safeTgtOuter.length-1][0]) > 0.001) safeTgtOuter.push([...safeTgtOuter[0]]);
  let tgtTurfPoly;
  try {
    tgtTurfPoly = turf.polygon([safeTgtOuter]);
  } catch(e) {
    // Si no es un polígono válido para Turf, devolvemos sin mover
    return { Tx: tgtCentroid[0] - origCentroid[0], Ty: tgtCentroid[1] - origCentroid[1], a: 1, b: 0, rotationDeg: 0, scale: 1.0, maxArea: 0 };
  }

  // Función interna para comprobar un conjunto de parámetros y obtener el Área Intersectada
  const testFit = (rotRad, dx, dy) => {
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);

    const shiftedOrig = origOuter.map(coord => {
      const ldx = coord[0] - origCentroid[0];
      const ldy = coord[1] - origCentroid[1];
      
      const rx = ldx * cosR - ldy * sinR;
      const ry = ldx * sinR + ldy * cosR;

      return [rx + tgtCentroid[0] + dx, ry + tgtCentroid[1] + dy];
    });

    if (Math.abs(shiftedOrig[0][0] - shiftedOrig[shiftedOrig.length-1][0]) > 0.001) shiftedOrig.push([...shiftedOrig[0]]);

    try {
      const pA = turf.polygon([shiftedOrig]);
      const inter = turf.intersect(turf.featureCollection([pA, tgtTurfPoly]));
      if (inter) {
          return turf.area(inter);
      }
    } catch(e) {
      // Ignorar topologías degeneradas temporales
    }
    return -1; // -1 indica fallo o sin intersección
  };

  // Preparación topológica auxiliar
  const getEdges = (ring) => {
    let edges = [];
    for(let i=0; i<ring.length-1; i++) {
        if (Math.hypot(ring[i+1][0]-ring[i][0], ring[i+1][1]-ring[i][1]) > 0.05) { // min 5 cm
            edges.push([ring[i], ring[i+1]]);
        }
    }
    return edges;
  };
  const getAngle = ([p1, p2]) => Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
  const getMidpoint = ([p1, p2]) => [(p1[0]+p2[0])/2, (p1[1]+p2[1])/2];

  const origEdges = getEdges(origOuter);
  const tgtEdges = getEdges(safeTgtOuter);

  let candidates = [];

  // FASE A: Búsqueda intensiva de Traslación Pura (Giro 0).
  // Dado que el 95% de las veces es un simple desplazamiento, priorizamos encontrar el encaje perfecto solo moviendo en X/Y.
  // Escaneamos un radio de 1.5 metros desde el origen real en incrementos finos (15 cm).
  for(let dx = -1.5; dx <= 1.5; dx += 0.15) {
     for(let dy = -1.5; dy <= 1.5; dy += 0.15) {
        if (Math.hypot(dx, dy) <= 1.5) {
            candidates.push({ rotRad: 0, tx: dx, ty: dy });
        }
     }
  }

  // FASE B: Combinatoria de emparejamiento de linderos (Solo micromovimientos y giros muy sutiles)
  origEdges.forEach(eO => {
     let lenO = Math.hypot(eO[1][0]-eO[0][0], eO[1][1]-eO[0][1]);
     // Ignorar linderos ridículamente pequeños (< 1 metro) para referenciar giros, generan falsos positivos.
     if (lenO < 1.0) return; 

     let aO = getAngle(eO);
     let midO = getMidpoint(eO);
     
     tgtEdges.forEach(eT => {
         let aT = getAngle(eT);
         let midT = getMidpoint(eT);

         // Angulos para hacer las líneas colineales o completamente paralelas
         let rot1 = aT - aO;
         let rot2 = aT - aO + Math.PI;

         [rot1, rot2].forEach((r) => {
             // Normalizar a [-PI, PI]
             let normR = Math.atan2(Math.sin(r), Math.cos(r));
             
             // RESTRICCIÓN DRÁSTICA: "rara vez hacer un giro muy fuerte".
             // Limitamos el giro máximo permitido para acodalar linderos a 8 grados.
             if (Math.abs(normR) > (8 * Math.PI / 180)) return;

             let cosR = Math.cos(normR);
             let sinR = Math.sin(normR);

             // 1. Alineación estricta de centroides con este sutil giro.
             candidates.push({ rotRad: normR, tx: tgtCentroid[0] - origCentroid[0], ty: tgtCentroid[1] - origCentroid[1] });

             // 2. Emparejamiento Topográfico por Vértices (Desplazamiento para centrar lindero)
             let dxMid = midO[0] - origCentroid[0];
             let dyMid = midO[1] - origCentroid[1];
             let midORotX = dxMid * cosR - dyMid * sinR + origCentroid[0];
             let midORotY = dxMid * sinR + dyMid * cosR + origCentroid[1];
             
             let tx_mid = midT[0] - midORotX;
             let ty_mid = midT[1] - midORotY;
             
             candidates.push({ rotRad: normR, tx: tx_mid, ty: ty_mid });
         });
     });
  });

  // Evaluador
  let bestAngleRad = 0;
  let maxArea = -100;
  let bestTx = 0;
  let bestTy = 0;

  candidates.forEach(cand => {
      // Filtro de ruido: un topógrafo no buscaría la parcela original a 6 metros de distancia
      let movedCx = origCentroid[0] + cand.tx;
      // Filtro de rigor métrico: el desplazamiento total (distancia movida desde las coordenadas físicas reales)
      // no debe superar el umbral dictado por el operario topográfico (1.5 metros máximo)
      let displacementFromOriginal = Math.hypot(cand.tx, cand.ty);
      
      if (displacementFromOriginal > 1.5) return;

      const area = testFit(cand.rotRad, cand.tx, cand.ty);
      if (area > maxArea) {
          maxArea = area;
          bestAngleRad = cand.rotRad;
          bestTx = cand.tx;
          bestTy = cand.ty;
      }
  });

  // Deshacer traslación local (aplicada post-rotación de centroide) 
  // X_new = (X - Xc)*a - (Y - Yc)*b + Xc + tx
  // X_new = X*a - Y*b + [Xc - Xc*a + Yc*b + tx]
  const a = Math.cos(bestAngleRad);
  const b = Math.sin(bestAngleRad);

  const Tx = origCentroid[0] - origCentroid[0] * a + origCentroid[1] * b + bestTx;
  const Ty = origCentroid[1] - origCentroid[0] * b - origCentroid[1] * a + bestTy;

  return {
    Tx,
    Ty,
    a,
    b,
    rotationDeg: bestAngleRad * (180 / Math.PI),
    scale: 1.0,
    maxArea
  };
};

function isClosed(ring) {
  if (!ring || ring.length < 4) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return Math.abs(first[0] - last[0]) < 0.001 && Math.abs(first[1] - last[1]) < 0.001;
}
