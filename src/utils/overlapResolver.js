import * as turf from '@turf/turf';
import proj4 from 'proj4';
import { roundRings, snapToGrid, calculatePolygonArea } from './geoUtils.js';

/**
 * CONFIGURATION & TOLERANCES
 * Following Cadastre standards (centimetric precision)
 */
const PRECISION_DECIMALS = 2; // 0.01 m
const SLIVER_THRESHOLD_SQM = 0.01; // Discard polygons smaller than 1dm²
const SNAP_TOLERANCE_M = 0.05; // 5cm tolerance for vertex snapping

// ─────────────────────────────────────────────────────────────────────────────
// GEOMETRY UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures a ring is closed and valid.
 */
function cleanRing(ring) {
  if (!ring || ring.length < 3) return null;
  const p1 = snapToGrid(ring[0], PRECISION_DECIMALS);
  const plast = snapToGrid(ring[ring.length - 1], PRECISION_DECIMALS);
  
  const closed = [...ring.map(c => snapToGrid(c, PRECISION_DECIMALS))];
  if (p1[0] !== plast[0] || p1[1] !== plast[1]) {
    closed.push(p1);
  }
  return closed;
}

/**
 * Calculates planar area for a GeoJSON Polygon or MultiPolygon coordinate structure
 * using UTM coordinates.
 */
function getPlanarArea(type, coordinates) {
  if (type === 'Polygon') {
    // [exterior, interior1, ...]
    const extArea = calculatePolygonArea(coordinates[0]);
    const intArea = coordinates.slice(1).reduce((s, r) => s + calculatePolygonArea(r), 0);
    return Math.max(0, extArea - intArea);
  } else if (type === 'MultiPolygon') {
    // [[ext, int], [ext], ...]
    return coordinates.reduce((sum, poly) => sum + getPlanarArea('Polygon', poly), 0);
  }
  return 0;
}

/**
 * Fixes self-intersections and ensures valid orientation.
 */
function validateGeometry(geojson) {
  try {
    let fixed = turf.buffer(geojson, 0);
    const area = getPlanarArea(fixed.geometry.type, fixed.geometry.coordinates);
    if (area < SLIVER_THRESHOLD_SQM) return null;
    
    // Remove tiny slivers if MultiPolygon
    if (fixed.geometry.type === 'MultiPolygon') {
      const filtered = fixed.geometry.coordinates.filter(poly => {
        return getPlanarArea('Polygon', poly) > SLIVER_THRESHOLD_SQM;
      });
      if (filtered.length === 0) return null;
      fixed.geometry.coordinates = filtered;
      if (filtered.length === 1) {
        fixed.geometry.type = 'Polygon';
        fixed.geometry.coordinates = filtered[0];
      }
    }
    return fixed;
  } catch (e) {
    console.warn("Geometry validation failed", e);
    return geojson;
  }
}

/**
 * Projects a point [px, py] onto the segment [a, b].
 * Returns the closest point on the segment.
 */
/**
 * Projects a point [px, py] onto the segment [a, b].
 * Returns the closest point on the segment.
 */
function projectPointToSegment(p, a, b) {
  const px = p[0], py = p[1];
  const ax = a[0], ay = a[1];
  const bx = b[0], by = b[1];
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return [ax, ay];
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  if (t < 0) return [ax, ay];
  if (t > 1) return [bx, by];
  return [ax + t * dx, ay + t * dy];
}

/**
 * Checks if a point p lies on the segment [a, b] within a tiny tolerance.
 */
function isPointOnSegment(p, a, b, tol = 0.000001) {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;

  // Check if p is A or B (avoid division by zero)
  if ((px === ax && py === ay) || (px === bx && py === by)) return true;

  // Cross product to check collinearity
  const crossProduct = (py - ay) * (bx - ax) - (px - ax) * (by - ay);
  if (Math.abs(crossProduct) > tol * Math.max(Math.abs(bx - ax), Math.abs(by - ay))) return false;

  // Dot product to check if it's within bounds
  const dotProduct = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
  if (dotProduct < 0) return false;

  const squaredLength = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
  if (dotProduct > squaredLength) return false;

  return true;
}

/**
 * High-Fidelity Reconstruction with Healing:
 * Re-inserts ALL missing vertices from the original neighbor if they lie on the result perimeter.
 */
function surgicalReconstruction(ring, originalNeighborRings, originalFincaRings, tol = SNAP_TOLERANCE_M) {
  if (!ring || ring.length === 0) return null;
  const tolSq = tol * tol;
  
  // Phase 1: High-Precision Base Reconstruction
  const baseReconstruction = ring.map(c => {
    const [cx, cy] = c;

    // 1. Match to Neighbor Vertex (BIT-FOR-BIT)
    for (const refRing of originalNeighborRings) {
      for (const v of refRing) {
        const dx = cx - v[0], dy = cy - v[1];
        if (dx * dx + dy * dy <= tolSq) return [v[0], v[1]];
      }
    }

    // 2. Match to Finca Vertex (BIT-FOR-BIT)
    for (const refRing of originalFincaRings) {
      for (const v of refRing) {
        const dx = cx - v[0], dy = cy - v[1];
        if (dx * dx + dy * dy <= tolSq) return [v[0], v[1]];
      }
    }

    // 3. Segment Match (BIT-FOR-BIT Projection)
    let bestSnap = null;
    let minSnapDistSq = tolSq;

    const snapToEdges = (sourceRings) => {
      for (const sourceRing of sourceRings) {
        for (let i = 0; i < sourceRing.length - 1; i++) {
          const projected = projectPointToSegment([cx, cy], sourceRing[i], sourceRing[i+1]);
          const ddx = cx - projected[0], ddy = cy - projected[1];
          const distSq = ddx * ddx + ddy * ddy;
          if (distSq < minSnapDistSq) {
            minSnapDistSq = distSq;
            bestSnap = projected;
          }
        }
      }
    };

    snapToEdges(originalNeighborRings);
    snapToEdges(originalFincaRings);

    if (bestSnap) return bestSnap;
    return snapToGrid(c, 8); // High precision fallback
  });

  // Phase 2: Healing (Vertex Re-insertion)
  // We explore every segment [p1, p2] of the result.
  // If p1 and p2 both lie on the SAME original neighbor segment [s1, s2],
  // OR if we skip intermediate vertices between p1 and p2.
  const healed = [];
  for (let i = 0; i < baseReconstruction.length - 1; i++) {
    const p1 = baseReconstruction[i];
    const p2 = baseReconstruction[i+1];
    healed.push(p1);

    // Collect all intermediate vertices from the original neighbor
    // that lie ON the segment p1-p2
    const intermediate = [];
    for (const sourceRing of originalNeighborRings) {
      for (const sv of sourceRing) {
        if ((sv[0] === p1[0] && sv[1] === p1[1]) || (sv[0] === p2[0] && sv[1] === p2[1])) continue;
        
        if (isPointOnSegment(sv, p1, p2, 0.0000001)) {
          const distSq = (sv[0] - p1[0])**2 + (sv[1] - p1[1])**2;
          intermediate.push({ coords: [sv[0], sv[1]], d: distSq });
        }
      }
    }
    
    // Sort and insert
    intermediate.sort((a, b) => a.d - b.d);
    intermediate.forEach(item => healed.push(item.coords));
  }
  
  // Last point
  const last = baseReconstruction[baseReconstruction.length - 1];
  healed.push([last[0], last[1]]);

  // Final validation and closure
  if (healed.length > 0) {
    const start = healed[0];
    const end = healed[healed.length - 1];
    if (start[0] !== end[0] || start[1] !== end[1]) {
      healed.push([start[0], start[1]]);
    }
  }

  return healed;
}




/**
 * Shift all coordinates in a GeoJSON geometry by [dx, dy].
 */
function shiftGeometry(geometry, dx, dy) {
  const shiftRing = (ring) => ring.map(c => [c[0] + dx, c[1] + dy]);
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: geometry.coordinates.map(shiftRing) };
  } else if (geometry.type === 'MultiPolygon') {
    return { ...geometry, coordinates: geometry.coordinates.map(poly => poly.map(shiftRing)) };
  }
  return geometry;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves overlaps by cutting the main finca from neighboring parcels.
 * IMPORTANT: This version preserves original source coordinates bit-for-bit
 * for non-affected vertices to avoid micro-gaps (huecos) in Catastro.
 */
export const resolveOverlaps = (mainParcel, neighbors) => {
  if (!mainParcel?.originalCoords?.length) return neighbors;
  
  const results = [];
  
  // Use original coordinates for maximum fidelity where possible
  // Helper to flattem MultiPolygon originalCoords into a flat list of rings
  const flattenRings = (ringsOrMulti) => {
    if (!ringsOrMulti?.length) return [];
    if (Array.isArray(ringsOrMulti[0][0][0])) {
      // It's a MultiPolygon array of polygons
      return ringsOrMulti.flat();
    }
    return ringsOrMulti;
  };

  const mainRings = flattenRings(mainParcel.originalCoords);
  const mainType = mainParcel.geometry.type;
  
  // Shift to local origin to prevent Turf.js geographic wrap-around on large UTM values
  const originX = mainRings[0][0][0];
  const originY = mainRings[0][0][1];

  const shiftToLocal = (rings) => rings.map(ring => ring.map(c => [c[0] - originX, c[1] - originY]));
  const shiftToGlobal = (rings) => rings.map(ring => ring.map(c => [c[0] + originX, c[1] + originY]));

  // Finca shifts to local
  const mainPolyShifted = mainType === 'MultiPolygon'
    ? turf.multiPolygon(mainParcel.originalCoords.map(poly => shiftToLocal(poly)))
    : turf.polygon(shiftToLocal(mainRings));

  neighbors.forEach(neighbor => {
    if (!neighbor?.originalCoords?.length) return;
    
    const neighborRings = flattenRings(neighbor.originalCoords);
    const nType = neighbor.geometry.type;

    const neighborPolyShifted = nType === 'MultiPolygon'
      ? turf.multiPolygon(neighbor.originalCoords.map(poly => shiftToLocal(poly)))
      : turf.polygon(shiftToLocal(neighborRings));

    try {
      // 1. Check for intersection using a small buffer to avoid micro-noise
      const intersection = turf.intersect(turf.featureCollection([mainPolyShifted, neighborPolyShifted]));
      
      const intersectArea = intersection ? getPlanarArea(intersection.geometry.type, intersection.geometry.coordinates) : 0;

      if (!intersection || intersectArea < SLIVER_THRESHOLD_SQM) {
        results.push(neighbor);
        return;
      }

      // 2. Perform Difference (Cut)
      let differenceShifted = turf.difference(turf.featureCollection([neighborPolyShifted, mainPolyShifted]));
      
      if (!differenceShifted) {
        results.push({
          ...neighbor,
          originalCoords: [],
          area: 0,
          geometry: { type: 'Polygon', coordinates: [] },
          status: 'absorbed'
        });
        return;
      }

      // 3. Simple validation (still shifted)
      differenceShifted = validateGeometry(differenceShifted);
      if (!differenceShifted) {
        results.push({ ...neighbor, area: 0, status: 'removed_as_sliver' });
        return;
      }

      // 4. Shift back to global UTM
      const diffGlobal = shiftGeometry(differenceShifted.geometry, originX, originY);
      
      // 5. SURGICAL RECONSTRUCTION: Map back to EXACT source coordinates
      const epsgCode = neighbor.huso ? neighbor.huso.replace('EPSG:', '') : '25830';
      const toWGS84 = (rings) => rings.map(ring => ring.map(c => proj4(`EPSG:${epsgCode}`, 'EPSG:4326', [c[0], c[1]])));

      const neighborRingsFlat = flattenRings(neighbor.originalCoords);
      const mainRingsFlat = flattenRings(mainParcel.originalCoords);

      let finalCoordsUTM = [];
      if (diffGlobal.type === 'Polygon') {
        finalCoordsUTM = diffGlobal.coordinates.map(ring => {
          return surgicalReconstruction(ring, neighborRingsFlat, mainRingsFlat);
        }).filter(Boolean);
      } else {
        finalCoordsUTM = diffGlobal.coordinates.map(poly => {
          return poly.map(ring => {
            return surgicalReconstruction(ring, neighborRingsFlat, mainRingsFlat);
          }).filter(Boolean);
        });
      }

      const totalArea = getPlanarArea(diffGlobal.type, finalCoordsUTM);

      results.push({
        ...neighbor,
        originalCoords: finalCoordsUTM,
        area: Math.round(totalArea),
        geometry: {
          type: diffGlobal.type,
          coordinates: diffGlobal.type === 'Polygon' ? toWGS84(finalCoordsUTM) : finalCoordsUTM.map(p => toWGS84(p))
        },
        status: 'adjusted'
      });

    } catch (e) {
      console.error("GIS processing error for parcel", neighbor.id, e);
      results.push(neighbor);
    }
  });

  return results;
};

export const detectOverlaps = (mainParcel, neighbors) => {
  if (!mainParcel?.originalCoords?.length) return [];
  const mainRings = mainParcel.originalCoords;
  
  const originX = mainRings[0][0][0];
  const originY = mainRings[0][0][1];
  const shiftToLocal = (rings) => rings.map(ring => ring.map(c => [c[0] - originX, c[1] - originY]));

  const mainPolyShifted = turf.polygon(shiftToLocal(mainRings));
  
  return neighbors
    .filter(n => {
      if (!n?.originalCoords?.length) return false;
      const nRings = n.originalCoords;
      const nPolyShifted = turf.polygon(shiftToLocal(nRings));
      
      const inter = turf.intersect(turf.featureCollection([mainPolyShifted, nPolyShifted]));
      if (!inter) return false;
      
      const area = getPlanarArea(inter.geometry.type, inter.geometry.coordinates);
      return area > SLIVER_THRESHOLD_SQM;
    })
    .map(n => n.id);
};

// -----------------------------------------------------------------------------
// BATCH OPERATIONS & ALIGNMENT
// -----------------------------------------------------------------------------

/**
 * Detects ALL overlaps for a set of parcels against their neighbors.
 * Returns a map of parcelId -> [neighborIds]
 */
export const detectBatchOverlaps = (parcels, neighbors) => {
  const overlapMap = {};
  parcels.forEach(p => {
    const overlapping = detectOverlaps(p, neighbors);
    if (overlapping.length > 0) {
      overlapMap[p.id] = overlapping;
    }
  });
  return overlapMap;
};

/**
 * Validates topology for multiple parcels.
 * Returns true if NO overlaps are detected.
 */
export const validateTopology = (parcels, neighbors) => {
  const map = detectBatchOverlaps(parcels, neighbors);
  return Object.keys(map).length === 0;
};

export const validateBatchTopology = validateTopology;


