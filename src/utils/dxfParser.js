import DxfParser from 'dxf-parser';
import { transformToWGS84, calculatePolygonArea, closeRing, isClosedRing } from './geoUtils.js';

/**
 * Parses a DXF file and extracts closed polygons.
 * Matches polygons with internal text markers for naming.
 * Filters out duplicate overlapping geometries typical in CAD exports.
 * @param {File} file - DXF file object
 * @param {String} husoSelection - The EPSG code selected by the user
 * @returns {Promise<Array>} Array of parcel objects
 */
export const parseDXF = async (file, husoSelection) => {
    const text = await file.text();
    const parser = new DxfParser();
    let dxf;

    if (!husoSelection) {
        throw new Error("Se requiere seleccionar un HUSO (EPSG) antes de procesar ficheros DXF para asegurar su posicionamiento correcto.");
    }

    try {
        dxf = parser.parseSync(text);
    } catch (error) {
        console.error("DXF Parse Error:", error);
        throw new Error("El fichero no parece ser un DXF válido o está corrupto.");
    }

    const parcels = [];
    const texts = [];
    const epsgCode = husoSelection;

    let autoIndex = 0;
    function generateAutoName(index) {
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const number = Math.floor(index / letters.length) + 1;
        const letter = letters[index % letters.length];
        return `${number}${letter}`;
    }

    // Ray-casting point in polygon algorithm for naming association
    const isPointInPolygon = (point, polygon) => {
        let x = point[0], y = point[1];
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            let xi = polygon[i][0], yi = polygon[i][1];
            let xj = polygon[j][0], yj = polygon[j][1];
            let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    };

    // 1. Collect all text markers (names)
    dxf.entities.forEach(entity => {
        if (entity.type === "TEXT" || entity.type === "MTEXT") {
            if (!entity.text) return;

            // Handle different position formats in DXF
            const px = entity.position ? entity.position.x : (entity.startPoint ? entity.startPoint.x : entity.x);
            const py = entity.position ? entity.position.y : (entity.startPoint ? entity.startPoint.y : entity.y);

            if (px === undefined || py === undefined) return;

            texts.push({
                text: entity.text.trim(),
                position: [px, py]
            });
        }
    });

    // 2. Process Polylines
    dxf.entities.forEach(entity => {
        if (entity.type !== "LWPOLYLINE" && entity.type !== "POLYLINE") return;
        if (!entity.vertices || entity.vertices.length < 3) return;

        let coords = entity.vertices.map(v => [v.x, v.y]);

        // Force closing the ring if needed
        if (!isClosedRing(coords)) {
            coords = closeRing(coords);
        }

        let name = null;

        // Try to find a text marker inside this polyline
        for (let t of texts) {
            if (isPointInPolygon(t.position, coords)) {
                // Heuristic for valid parcel names (Ref Catastral or common prefixes)
                const valid = t.text.match(/(FINCA|_MOD|PARCELA|FR-|REF|RECINTO)/i) || t.text.trim().length === 14;
                if (valid) {
                    name = t.text.trim().replace(/\s/g, "");
                    break;
                }
            }
        }

        if (!name) {
            name = generateAutoName(autoIndex);
            autoIndex++;
        }

        const area = calculatePolygonArea(coords);
        const geometryCoords = transformToWGS84(coords, epsgCode);

        parcels.push({
            id: `dxf-${file.name}-${parcels.length}`, // We'll filter duplicates later, so index is fine for now
            name: name,
            area: area,
            filename: file.name,
            huso: epsgCode,
            originalCoords: [coords],
            geometry: {
                type: "Polygon",
                coordinates: [geometryCoords]
            }
        });
    });

    // 3. Filter exact duplicates (same area and same start vertex)
    // CAD files often contain duplicate overlaying geometries.
    const uniqueParcels = [];
    parcels.forEach(p => {
        let isDuplicate = false;
        for (const u of uniqueParcels) {
            if (Math.abs(p.area - u.area) < 0.1) {
                const ringA = p.originalCoords[0];
                const ringB = u.originalCoords[0];
                if (ringA.length === ringB.length) {
                    const diffX = Math.abs(ringA[0][0] - ringB[0][0]);
                    const diffY = Math.abs(ringA[0][1] - ringB[0][1]);
                    if (diffX < 0.05 && diffY < 0.05) {
                        isDuplicate = true;
                        break;
                    }
                }
            }
        }
        if (!isDuplicate) {
            uniqueParcels.push(p);
        }
    });

    return uniqueParcels;
};
