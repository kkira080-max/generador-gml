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

const SLIVER_AREA_TOLERANCE_SQM = 1.0; // Tolerancia para solapes/huecos (± 1 m²)

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
    feature.properties = { 
      ...feature.properties, 
      id: p.id, 
      name: p.name || p.id,
      hasCadastralReference: p.hasCadastralReference 
    };
    return feature;
  });

  // Filter reference features to ONLY those that are actually affected (> 1 m² overlap)
  // This allows for tiny neighbor touches caused by BBox padding.
  const affectedReferenceFeatures = referenceFeatures.filter(refFeat => {
    // Ignorar por completo a nivel de cálculo fincas del WFS que no tengan Referencia (Dominio Público/Carreteras)
    if (refFeat.properties.hasCadastralReference === false) return false;

    const intersection = turf.intersect(turf.featureCollection([refFeat, proposedUnion]));
    if (!intersection) return false;
    const intersectionArea = calculateFeatureArea(intersection);
    return intersectionArea > SLIVER_AREA_TOLERANCE_SQM;
  });

  if (affectedReferenceFeatures.length === 0) {
    if (internalOverlaps.length > 0) {
      const totalInternalOverlapArea = internalOverlaps.reduce((acc, o) => acc + calculateFeatureArea(o), 0);
      if (totalInternalOverlapArea > SLIVER_AREA_TOLERANCE_SQM) {
        errors.push({ 
          type: 'SOLAPE_INTERNO', 
          message: `Existe una INVASIÓN o superposición entre geometrías del propio dibujo (${totalInternalOverlapArea.toFixed(2)} m² superpuestos).` 
        });
      }
    }

    const totalProposedArea = calculateFeatureArea(proposedUnion);
    const isValid = errors.length === 0;

    return {
      success: true,
      summary: {
        totalProposedArea,
        totalReferenceArea: 0,
        gapArea: 0,
        encroachmentArea: 0,
        publicDomainArea: totalProposedArea,
        isValid,
        isPositive: isValid,
        isPublicDomain: isValid,
        errors
      },
      geometries: reportGeometries
    };
  }

  let referenceUnion = affectedReferenceFeatures[0];
  for (let i = 1; i < affectedReferenceFeatures.length; i++) {
    referenceUnion = turf.union(turf.featureCollection([referenceUnion, affectedReferenceFeatures[i]]));
  }

  // Modify Unions to extract ONLY exterior perimeters.
  // turf.union naturally dissolves internal boundaries if polygons share an edge.
  // Any remaining 'holes' inside the union will still exist, but we mainly care about the outer hull and the solid geometry.

  // 5. Detect Gaps & Encroachments Based on Perimeters
  // HUECOS: Catastro area not covered by Proposal (Diferencia directa sin buffer)
  let gaps = turf.difference(turf.featureCollection([referenceUnion, proposedUnion]));
  let gapArea = gaps ? calculateFeatureArea(gaps) : 0;

  // SOLAPES: Proposal area falling outside Catastro (Diferencia directa sin buffer)
  let encroachments = turf.difference(turf.featureCollection([proposedUnion, referenceUnion]));
  let encroachmentArea = encroachments ? calculateFeatureArea(encroachments) : 0;

  // Evaluate perimeter differences
  if (gapArea > SLIVER_AREA_TOLERANCE_SQM) {
    errors.push({ type: 'HUECO', message: `El perímetro exterior deja huecos en la cartografía catastral (${gapArea.toFixed(2)} m²).` });
    reportGeometries.gaps = gaps;
  }

  // DOMINIO PÚBLICO: Ver si el solape recae en parcelas existentes o en espacio en blanco
  let publicDomainArea = 0;
  let thirdPartyInvasionArea = encroachmentArea;
  if (encroachmentArea > 0) {
    let publicDomainFeatures = encroachments;
    for (const refFeat of referenceFeatures) {
      if (refFeat.properties.hasCadastralReference === false) continue;
      if (!publicDomainFeatures) break;
      try {
        publicDomainFeatures = turf.difference(turf.featureCollection([publicDomainFeatures, refFeat]));
      } catch (e) { /* Ignorar finca si rompe topología */ }
    }
    publicDomainArea = publicDomainFeatures ? calculateFeatureArea(publicDomainFeatures) : 0;
    thirdPartyInvasionArea = Math.max(0, encroachmentArea - publicDomainArea);
  }

  if (thirdPartyInvasionArea > SLIVER_AREA_TOLERANCE_SQM) {
    errors.push({ type: 'SOLAPE_TERCEROS', message: `El perímetro exterior invade terceros fuera de las parcelas de referencia (${thirdPartyInvasionArea.toFixed(2)} m²).` });
    reportGeometries.encroachments = encroachments;
  } else if (publicDomainArea > SLIVER_AREA_TOLERANCE_SQM) {
    // Invasión reportada, pero solo es sobre vía pública (DOMINIO PÚBLICO)
    reportGeometries.encroachments = encroachments;
  }

  // 5.5. Detect Internal Overlaps (Invasiones Internas)
  // Criterio solicitado: NO se permite superposición de geometrías del propio dibujo del usuario.
  if (internalOverlaps.length > 0) {
    const totalInternalOverlapArea = internalOverlaps.reduce((acc, o) => acc + calculateFeatureArea(o), 0);
    if (totalInternalOverlapArea > SLIVER_AREA_TOLERANCE_SQM) {
      errors.push({
        type: 'SOLAPE_INTERNO',
        message: `Existe una INVASIÓN o superposición entre geometrías del propio dibujo (${totalInternalOverlapArea.toFixed(2)} m² superpuestos).`
      });
    }
  }

  // 6. Results Summary
  const totalProposedArea = calculateFeatureArea(proposedUnion);
  const totalReferenceArea = calculateFeatureArea(referenceUnion);

  // According to Cadastre, a validation is positive if the proposed area is essentially
  // identical to the affected area, AND there are no gaps/encroachments.
  const areaDifference = Math.abs(totalProposedArea - totalReferenceArea);

  // Según especificaciones: tolerancia de 1.0 m² (±) para la discrepancia de área
  const isAreaMatched = areaDifference <= 1.0;

  const isPurelyPublicDomain = publicDomainArea > (totalProposedArea * 0.95);

  // Ignorar error de HUECO si realmente el dibujo está casi todo en Dominio Público Puro
  const relevantErrors = errors.filter(e => {
    if (isPurelyPublicDomain && e.type === 'HUECO') return false;
    return true;
  });

  // Es Dominio Público si la invasión solo recae en espacio en blanco
  const isPublicDomain = publicDomainArea > SLIVER_AREA_TOLERANCE_SQM && thirdPartyInvasionArea <= SLIVER_AREA_TOLERANCE_SQM && relevantErrors.length === 0;

  // Si la única queja fue Dominio Público, entonces el conjunto es positivo
  const isValid = relevantErrors.length === 0 || isPublicDomain;
  const isPositive = (isValid && isAreaMatched) || isPublicDomain;

  return {
    success: true,
    summary: {
      totalProposedArea,
      totalReferenceArea,
      gapArea: gapArea > SLIVER_AREA_TOLERANCE_SQM ? gapArea : 0,
      encroachmentArea: encroachmentArea > SLIVER_AREA_TOLERANCE_SQM ? encroachmentArea : 0,
      publicDomainArea,
      isValid,
      isPositive,
      isPublicDomain,
      errors: relevantErrors
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
