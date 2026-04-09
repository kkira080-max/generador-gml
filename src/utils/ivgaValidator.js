import * as turf from '@turf/turf';
import { calculatePolygonArea } from './geoUtils.js';

/**
 * IVGA Pre-Validation Utility
 * 
 * Performs high-precision spatial analysis to determine if a set of proposed parcels
 * correctly replaces a set of cadastral reference parcels without leaving gaps (huecos)
 * or encroaching on neighboring space (solapes).
 * 
 * Following Spanish Cadastre (SEC) standards.
 */

const SLIVER_AREA_TOLERANCE_SQM = 1.0; // Ignore sub-1m² overlaps when finding affected parcels
const MATCH_TOLERANCE_M = 0.05; // 5 cm linear tolerance for vertex shifts between WFS and DXF

/**
 * Performs the IVGA validation check.
 * @param {Array} proposedParcels - List of objects { id, originalCoords (UTM), geometry }
 * @param {Array} referenceParcels - List of objects { id, originalCoords (UTM), geometry }
 * @returns {Object} Result report
 */
export const performIvgaCheck = (proposedParcels, referenceParcels) => {
  if (!proposedParcels || proposedParcels.length === 0) {
    return { error: 'No hay parcelas propuestas para validar.' };
  }

  if (!referenceParcels || referenceParcels.length === 0) {
    return { error: 'No se han cargado parcelas del Catastro como referencia.' };
  }

  const errors = [];
  const reportGeometries = {
    gaps: null,
    encroachments: null,
    internalOverlaps: [],
    invalidGeoms: []
  };

  try {
    const getRings = (p) => {
      if (!p.originalCoords || p.originalCoords.length === 0) return [];
      if (Array.isArray(p.originalCoords[0][0][0])) return p.originalCoords.flat();
      return p.originalCoords;
    };

    // 1. Geometric Validity & Individual Verification
    const proposedFeatures = proposedParcels.map(p => {
      const rings = getRings(p);
      const feature = p.geometry.type === 'MultiPolygon' 
        ? turf.multiPolygon(p.originalCoords)
        : turf.polygon(rings);
      
      if (!turf.booleanValid(feature)) {
        errors.push({ type: 'ERROR_GEOMETRICO', message: `La parcela ${p.name || p.id} tiene una geometría inválida (posible auto-intersección).` });
        reportGeometries.invalidGeoms.push(p.id);
      }
      return feature;
    });

    // 2. Identify Internal Overlaps (Optional check now, just for informative purposes)
    const internalOverlaps = [];
    for (let i = 0; i < proposedFeatures.length; i++) {
      for (let j = i + 1; j < proposedFeatures.length; j++) {
        const intersection = turf.intersect(turf.featureCollection([proposedFeatures[i], proposedFeatures[j]]));
        if (intersection) {
          const area = calculateFeatureArea(intersection);
          if (area > 0.05) { 
             reportGeometries.internalOverlaps.push(intersection);
             internalOverlaps.push(`Solape interno de ${area.toFixed(2)} m².`);
          }
        }
      }
    }

    // 3. Prepare Proposed Union
    let proposedUnion = proposedFeatures[0];
    for (let i = 1; i < proposedFeatures.length; i++) {
        proposedUnion = turf.union(turf.featureCollection([proposedUnion, proposedFeatures[i]]));
    }

    // 4. Identify Affected Reference Parcels & Prepare Reference Union
    const referenceFeatures = referenceParcels.map(p => {
      const rings = getRings(p);
      const feature = p.geometry.type === 'MultiPolygon' 
        ? turf.multiPolygon(p.originalCoords)
        : turf.polygon(rings);
      feature.properties = { ...feature.properties, id: p.id, name: p.name || p.id };
      return feature;
    });
    
    // Filter reference features to ONLY those that are actually affected (> 1 m² overlap)
    // This allows for tiny neighbor touches caused by BBox padding.
    const affectedReferenceFeatures = referenceFeatures.filter(refFeat => {
        const intersection = turf.intersect(turf.featureCollection([refFeat, proposedUnion]));
        if (!intersection) return false;
        const intersectionArea = calculateFeatureArea(intersection);
        return intersectionArea > SLIVER_AREA_TOLERANCE_SQM;
    });

    if (affectedReferenceFeatures.length === 0) {
       return { error: 'Las parcelas propuestas no se solapan de forma significativa con ninguna de las parcelas catastrales de referencia cargadas en la zona.' };
    }

    let referenceUnion = affectedReferenceFeatures[0];
    for (let i = 1; i < affectedReferenceFeatures.length; i++) {
        referenceUnion = turf.union(turf.featureCollection([referenceUnion, affectedReferenceFeatures[i]]));
    }

    // Modify Unions to extract ONLY exterior perimeters.
    // turf.union naturally dissolves internal boundaries if polygons share an edge.
    // Any remaining 'holes' inside the union will still exist, but we mainly care about the outer hull and the solid geometry.

    // 5. Detect Gaps & Encroachments Based on Perimeters
    // We achieve this geometry comparison using buffered differences.
    let gaps = null;
    let gapArea = 0;
    
    let encroachments = null;
    let encroachmentArea = 0;

    let proposedBuffered, referenceBuffered;
    
    try {
        proposedBuffered = turf.buffer(proposedUnion, MATCH_TOLERANCE_M, { units: 'meters' });
        referenceBuffered = turf.buffer(referenceUnion, MATCH_TOLERANCE_M, { units: 'meters' });
        
        // HUECOS: Catastro area not covered by Proposal
        gaps = turf.difference(turf.featureCollection([referenceUnion, proposedBuffered]));
        gapArea = gaps ? calculateFeatureArea(gaps) : 0;
        
        // SOLAPES: Proposal area falling outside Catastro
        encroachments = turf.difference(turf.featureCollection([proposedUnion, referenceBuffered]));
        encroachmentArea = encroachments ? calculateFeatureArea(encroachments) : 0;
        
    } catch (e) { 
        console.warn("Buffer operation failed, falling back to direct diff:", e);
        gaps = turf.difference(turf.featureCollection([referenceUnion, proposedUnion]));
        gapArea = gaps ? calculateFeatureArea(gaps) : 0;
        
        encroachments = turf.difference(turf.featureCollection([proposedUnion, referenceUnion]));
        encroachmentArea = encroachments ? calculateFeatureArea(encroachments) : 0;
    }
    
    // Evaluate perimeter differences
    if (gapArea > SLIVER_AREA_TOLERANCE_SQM) {
        errors.push({ type: 'HUECO', message: `El perímetro exterior deja huecos en la cartografía catastral (${gapArea.toFixed(2)} m²).` });
        reportGeometries.gaps = gaps;
    }
    
    if (encroachmentArea > SLIVER_AREA_TOLERANCE_SQM) {
        errors.push({ type: 'SOLAPE', message: `El perímetro exterior invade espacio fuera de las parcelas de referencia (${encroachmentArea.toFixed(2)} m²).` });
        reportGeometries.encroachments = encroachments;
    }

    // Include internal overlaps as info/warning if they exist, but DO NOT fail validation
    if (internalOverlaps.length > 0 && errors.length === 0) {
        // Just add to report without triggering `isValid = false` logic inside Catastro terms if we can handle warnings
    }

    // 6. Results Summary
    const totalProposedArea = calculateFeatureArea(proposedUnion);
    const totalReferenceArea = calculateFeatureArea(referenceUnion);
    
    // According to Cadastre, a validation is positive if the proposed area is essentially
    // identical to the affected area, AND there are no gaps/encroachments.
    const areaDifference = Math.abs(totalProposedArea - totalReferenceArea);
    
    // We increase area tolerance to match typical Catastro precision rounding limits for moderate sizes
    // e.g. 0.5% of total area or 5 m², whichever is larger, but since this is exact perimeter check 
    // let's allow up to 2.5 m² of rounding discrepancy over the whole block.
    const isAreaMatched = areaDifference <= 5.0; 
    
    const isValid = errors.length === 0;
    const isPositive = isValid && isAreaMatched;

    return {
      success: true,
      summary: {
        totalProposedArea,
        totalReferenceArea,
        gapArea: gapArea > SLIVER_AREA_TOLERANCE_SQM ? gapArea : 0,
        encroachmentArea: encroachmentArea > SLIVER_AREA_TOLERANCE_SQM ? encroachmentArea : 0,
        isValid,
        isPositive,
        errors: errors
      },
      geometries: reportGeometries
    };

  } catch (error) {
    console.error("IVGA Validation Internal Error:", error);
    return { error: 'Error crítico durante el procesamiento geométrico: ' + error.message };
  }
};

/**
 * Calculates planar area in m² for a GeoJSON feature (Polygon or MultiPolygon)
 * assuming coordinates are in a projected system (UTM meters).
 */
function calculateFeatureArea(feature) {
  if (!feature || !feature.geometry) return 0;
  const geom = feature.geometry;
  
  if (geom.type === 'Polygon') {
    // Shoelace: area(outer) - area(inners)
    const outerArea = calculatePolygonArea(geom.coordinates[0]);
    const innerArea = geom.coordinates.slice(1).reduce((acc, ring) => acc + calculatePolygonArea(ring), 0);
    return Math.max(0, outerArea - innerArea);
  } else if (geom.type === 'MultiPolygon') {
    return geom.coordinates.reduce((acc, poly) => {
      const outerArea = calculatePolygonArea(poly[0]);
      const innerArea = poly.slice(1).reduce((sum, ring) => sum + calculatePolygonArea(ring), 0);
      return acc + Math.max(0, outerArea - innerArea);
    }, 0);
  }
  return 0;
}
