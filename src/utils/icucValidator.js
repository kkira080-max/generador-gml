import * as turf from '@turf/turf';
import { roundRings, calculatePolygonArea } from './geoUtils.js';
import polygonClipping from 'polygon-clipping';

/**
 * Performs ICUC (Constructions Location) Validation.
 * 
 * Rules:
 * - Positive: All constructions are entirely inside the target official parcel 
 *   and do not invade neighbors.
 * - Negative: Constructions overlap with other parcels or fall outside the target.
 * 
 * @param {Array} constructions - Array of user parcel objects (the buildings)
 * @param {Array} officialParcels - Array of official cadastral parcels from WFS
 * @returns {Object} Validation result
 */
export const preValidateICUC = (constructions, officialParcels) => {
  if (!constructions || constructions.length === 0) {
    return { isValid: false, message: "No hay construcciones para validar." };
  }
  if (!officialParcels || officialParcels.length === 0) {
    return { isValid: false, message: "No se encontraron parcelas oficiales en esta zona." };
  }

  try {
    // 1. Prepare UTM geometries with millimeter precision
    const constructionPolys = constructions
      .map(c => roundRings(c.originalCoords, 3))
      .filter(p => p && p.length > 0);

    const officialPolys = officialParcels
      .map(p => ({
        id: p.id,
        ref: p.name || p.id,
        geometry: roundRings(p.originalCoords, 3)
      }))
      .filter(p => p.geometry && p.geometry.length > 0);

    if (constructionPolys.length === 0) return { isValid: false, message: "Construcciones sin coordenadas válidas." };

    // 2. Union all constructions to get the total building footprint
    const buildingsUnion = polygonClipping.union(...constructionPolys);
    const totalBuildingArea = calculateMultiPolygonArea(buildingsUnion);

    // 3. Identify the Target Parcel (the one most involved with the buildings)
    let maxOverlapArea = -1;
    let targetParcelData = null;

    officialPolys.forEach(o => {
      const inter = polygonClipping.intersection(buildingsUnion, o.geometry);
      const interArea = calculateMultiPolygonArea(inter);
      if (interArea > maxOverlapArea) {
        maxOverlapArea = interArea;
        targetParcelData = o;
      }
    });

    if (!targetParcelData || maxOverlapArea < 0.01) {
      return { isValid: false, message: "Las construcciones no parecen estar sobre ninguna parcela catastral conocida." };
    }

    // 4. Detailed analysis
    // - Check how much of the building is inside the target parcel
    const buildingInTarget = polygonClipping.intersection(buildingsUnion, targetParcelData.geometry);
    const buildingInTargetArea = calculateMultiPolygonArea(buildingInTarget);
    
    // - Check if there is any overlap with neighbors
    const neighbors = officialPolys.filter(o => o.id !== targetParcelData.id);
    let invasionArea = 0;
    const invasionDetails = [];

    neighbors.forEach(n => {
      const inter = polygonClipping.intersection(buildingsUnion, n.geometry);
      const area = calculateMultiPolygonArea(inter);
      if (area > 0.01) { // 1cm2 threshold for noise
        invasionArea += area;
        invasionDetails.push({ ref: n.ref, area });
      }
    });

    // - Check if there is any area falling outside ANY official parcel (e.g. into the street/public domain)
    // We can do this by: buildingArea - (buildingInTargetArea + invasionArea)
    // But better: union all official parcels in the set and subtract from buildings
    const allOfficialUnion = polygonClipping.union(...officialPolys.map(o => o.geometry));
    const buildingOutsideOfficial = polygonClipping.difference(buildingsUnion, allOfficialUnion);
    const outsideArea = calculateMultiPolygonArea(buildingOutsideOfficial);

    // 5. Validation Logic
    // Tolerance for ICUC is very strict (millimetric), but we allow 0.1 m2 for vertex snapping noise
    const TOLERANCE = 0.1; 
    
    // A building is "within" if (totalArea - areaInTarget) is minimal AND no invasion to neighbors
    const areaMissingFromTarget = Math.max(0, totalBuildingArea - buildingInTargetArea);
    const totalInvasion = invasionArea + outsideArea;

    const isValid = totalInvasion <= TOLERANCE && areaMissingFromTarget <= TOLERANCE;

    let message = "";
    if (isValid) {
      message = `POSITIVO: Las construcciones están íntegramente dentro de la parcela ${targetParcelData.ref}. No se detectan invasiones a parcelas colindantes ni a dominio público.`;
    } else {
      if (invasionArea > TOLERANCE) {
        const refs = invasionDetails.map(d => d.ref).join(", ");
        message = `NEGATIVO: Se detecta INVASIÓN de construcciones sobre parcelas colindantes (${refs}). Área invadida: ${invasionArea.toFixed(2)} m².`;
      } else if (outsideArea > TOLERANCE) {
        message = `NEGATIVO: Parte de las construcciones (${outsideArea.toFixed(2)} m²) se encuentran fuera de cualquier parcela catastral (posible invasión de vía pública o dominio público).`;
      } else if (areaMissingFromTarget > TOLERANCE) {
        message = `NEGATIVO: Las construcciones no están totalmente contenidas en la parcela objetivo.`;
      } else {
        message = "NEGATIVO: Error en el posicionamiento de las construcciones.";
      }
    }

    return {
      isValid,
      message,
      targetParcel: targetParcelData.ref,
      totalBuildingArea,
      buildingInTargetArea,
      invasionArea,
      outsideArea,
      invasionDetails
    };

  } catch (error) {
    console.error("Error during ICUC validation:", error);
    return { isValid: false, message: "Error de cálculo geométrico en la validación ICUC." };
  }
};

/**
 * Helper to calculate area of MultiPolygon from polygon-clipping output.
 */
const calculateMultiPolygonArea = (multiPoly) => {
  if (!multiPoly || multiPoly.length === 0) return 0;
  let totalArea = 0;
  multiPoly.forEach(polygon => {
    if (!polygon || polygon.length === 0) return;
    // Outer ring positive, inner rings negative
    let polyArea = calculatePolygonArea(polygon[0]);
    for (let i = 1; i < polygon.length; i++) {
      polyArea -= calculatePolygonArea(polygon[i]);
    }
    totalArea += polyArea;
  });
  return totalArea;
};
