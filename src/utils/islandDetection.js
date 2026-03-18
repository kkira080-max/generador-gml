import { calculatePolygonArea } from './geoUtils';

const pointInPolygon = (point, polygon) => {
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let xi = polygon[i][0], yi = polygon[i][1];
        let xj = polygon[j][0], yj = polygon[j][1];
        
        let intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            
        if (intersect) inside = !inside;
    }
    return inside;
};

// Check if ring B is inside ring A by testing if the majority of points of B are inside A.
// CAD geometries often share boundaries, so a strict "all points inside" check fails easily.
const isRingInsideRing = (outer, inner) => {
    let pointsInside = 0;
    for (const pt of inner) {
        if (pointInPolygon(pt, outer)) {
            pointsInside++;
        }
    }
    // Si más del 50% de los vértices están dentro, es una isla (tolera linderos compartidos)
    return pointsInside > (inner.length / 2);
};

/**
 * Organizes a flat list of DXF parcels (which right now are just 1 exterior ring each)
 * into a structured list where smaller polygons inside larger ones become interior rings.
 * @param {Array} parcels - Array of parcel objects parsed from DXF
 */
export const detectAndSubtractIslands = (parcels) => {
    // Sort parcels by area descending, so we check largest outer polygons first
    const sorted = [...parcels].sort((a, b) => b.area - a.area);
    const result = [];
    const usedAsIsland = new Set();

    for (let i = 0; i < sorted.length; i++) {
        const potentialOuter = sorted[i];
        if (usedAsIsland.has(potentialOuter.id)) continue;

        // Clone the parcel so we don't mutate input completely
        const finalParcel = { 
            ...potentialOuter,
            originalCoords: [[...potentialOuter.originalCoords[0]]], // Outer ring
            geometry: { type: "Polygon", coordinates: [[...potentialOuter.geometry.coordinates[0]]] }
        };

        let finalArea = finalParcel.area;

        // Check smaller polygons to see if they are inside
        for (let j = i + 1; j < sorted.length; j++) {
            const potentialInner = sorted[j];
            if (usedAsIsland.has(potentialInner.id)) continue;

            const outerRing = finalParcel.originalCoords[0];
            const innerRing = potentialInner.originalCoords[0];

            if (isRingInsideRing(outerRing, innerRing)) {
                // It is an island!
                usedAsIsland.add(potentialInner.id);
                // 1. Subtract area
                finalArea -= potentialInner.area;
                // 2. Add as interior to originalCoords (for GML)
                finalParcel.originalCoords.push([...innerRing]);
                // 3. Add as interior to Leaflet geometry (WGS84)
                finalParcel.geometry.coordinates.push([...potentialInner.geometry.coordinates[0]]);
            }
        }
        
        finalParcel.area = finalArea;
        result.push(finalParcel);
    }

    return result;
};
