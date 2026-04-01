import DxfParser from 'dxf-parser';
import { transformToWGS84, calculatePolygonArea, closeRing, isClosedRing } from './geoUtils.js';

/**
 * Parses a DXF file and extracts closed polygons.
 * Matches polygons with internal text markers for naming.
 * Handles rotated, diagonal and offset text entities at any angle.
 * Filters out duplicate overlapping geometries typical in CAD exports.
 * @param {File} file - DXF file object
 * @param {String} husoSelection - The EPSG code selected by the user
 * @returns {Promise<Array>} Array of parcel objects
 */
export const parseDXF = async (file, husoSelection) => {
    const raw = await file.text();
    const parser = new DxfParser();
    let dxf;

    if (!husoSelection) {
        throw new Error("Se requiere seleccionar un HUSO (EPSG) antes de procesar ficheros DXF para asegurar su posicionamiento correcto.");
    }

    try {
        dxf = parser.parseSync(raw);
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

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Ray-casting point-in-polygon (works for any convex/concave polygon)
     */
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

    /**
     * Compute the centroid of a polygon ring
     */
    const polygonCentroid = (ring) => {
        let cx = 0, cy = 0;
        const n = ring.length;
        for (const p of ring) { cx += p[0]; cy += p[1]; }
        return [cx / n, cy / n];
    };

    /**
     * Axis-aligned bounding box check (fast pre-filter)
     */
    const getBBox = (ring) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of ring) {
            if (p[0] < minX) minX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] > maxY) maxY = p[1];
        }
        return { minX, minY, maxX, maxY };
    };

    const pointInBBox = (point, bbox, margin = 0) => {
        return point[0] >= bbox.minX - margin && point[0] <= bbox.maxX + margin &&
               point[1] >= bbox.minY - margin && point[1] <= bbox.maxY + margin;
    };

    /**
     * Euclidean distance
     */
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

    /**
     * Given a text entity with a rotation angle (degrees) and an estimated
     * text width, return several candidate probe points:
     *   - insertion point (anchor)
     *   - midpoint of the text baseline
     *   - center of the text bounding box (accounting for height)
     *   - various fractional positions along the baseline
     *
     * This handles left/center/right horizontal justification (hjust 0/1/2/3/4/5)
     * and bottom/middle/top vertical justification (vjust 0/1/2/3).
     */
    const textProbePoints = (entity) => {
        const px = entity.position
            ? entity.position.x
            : (entity.startPoint ? entity.startPoint.x : entity.x);
        const py = entity.position
            ? entity.position.y
            : (entity.startPoint ? entity.startPoint.y : entity.y);
        if (px === undefined || py === undefined) return [];

        // Also check secondaryPoint / alignmentPoint (group code 11) used for aligned text
        const ax = entity.alignmentPoint ? entity.alignmentPoint.x : undefined;
        const ay = entity.alignmentPoint ? entity.alignmentPoint.y : undefined;

        const rotation = (entity.rotation || 0) * Math.PI / 180; // to radians
        const height = entity.textHeight || entity.height || 1;
        const rawText = cleanMText(entity.text || '');
        // Estimate text width ≈ 0.6 × height × number of chars (CAD typical ratio)
        const estWidth = rawText.length * height * 0.6;

        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        // Perpendicular direction (rotated 90° CCW) for vertical offset
        const perpCos = Math.cos(rotation + Math.PI / 2);
        const perpSin = Math.sin(rotation + Math.PI / 2);

        // Vertical offset: place probe at half-height above baseline
        const halfH = height * 0.5;

        const probes = [];

        // Anchor point itself
        probes.push([px, py]);

        // Probe points along baseline at various fractional positions
        for (const frac of [0, 0.25, 0.5, 0.75, 1.0]) {
            const bx = px + cos * estWidth * frac;
            const by = py + sin * estWidth * frac;
            probes.push([bx, by]);
            // Also probe at half-height above baseline
            probes.push([bx + perpCos * halfH, by + perpSin * halfH]);
        }

        // If we have an alignmentPoint (group 11), use it too
        if (ax !== undefined && ay !== undefined) {
            probes.push([ax, ay]);
            probes.push([(px + ax) / 2, (py + ay) / 2]);
        }

        // Midpoint of estimated bounding box center
        const midX = px + cos * estWidth * 0.5 + perpCos * halfH;
        const midY = py + sin * estWidth * 0.5 + perpSin * halfH;
        probes.push([midX, midY]);

        return probes;
    };

    /**
     * Clean MTEXT formatting codes and extract plain text.
     * Handles: {\P...}, \P, \~, {\\...}, font codes, color codes, etc.
     */
    const cleanMText = (str) => {
        if (!str) return '';
        return str
            .replace(/\\A\d+;/g, '')           // vertical alignment codes
            .replace(/\\C\d+;/g, '')           // color codes
            .replace(/\\f[^;]+;/gi, '')        // font codes
            .replace(/\\H[\d.]+x?;/gi, '')     // height codes
            .replace(/\\W[\d.]+;/gi, '')       // width factor codes
            .replace(/\\Q[\d.]+;/gi, '')       // oblique angle codes
            .replace(/\\S[^;]+;/g, '')         // stacking
            .replace(/\\L/g, '').replace(/\\l/g, '') // underline
            .replace(/\\O/g, '').replace(/\\o/g, '') // overline
            .replace(/\{\\[^}]+\}/g, '')       // grouped format codes
            .replace(/\\P/g, ' ')              // paragraph break → space
            .replace(/\\~/g, ' ')              // non-breaking space
            .replace(/[{}]/g, '')              // remaining braces
            .replace(/\s+/g, ' ')             // collapse whitespace
            .trim();
    };

    /**
     * Returns true if the text content looks like a valid parcel name.
     * Much more permissive than before – we now accept any alphanumeric
     * text of 5+ characters that looks like a code/reference.
     *
     * Accepts:
     *  - Exactly 14 chars (española Referencia Catastral)
     *  - Codes with hyphens: FR-3252, FB-6674
     *  - Codes with slashes or underscores
     *  - Any sequence that is mostly numbers/letters (land registry style)
     *  - Known keyword prefixes
     */
    const isValidParcelText = (str) => {
        if (!str || str.length < 2) return false;
        // Strip whitespace already done, but just in case
        const s = str.replace(/\s/g, '');

        // Explicit keyword prefixes always valid
        if (/^(FINCA|PARCELA|FR[-_]|FB[-_]|REF|RECINTO|_MOD)/i.test(s)) return true;

        // Referencia Catastral española: 14 alphanumeric characters
        if (/^[A-Z0-9]{14}$/i.test(s)) return true;

        // eCadastro code patterns seen in image: like "0022048-0VESLHCC"
        // Pattern: digits + dash + digits + letters
        if (/^\d{4,}-\d+[A-Z]+$/i.test(s)) return true;

        // More general: 7+ chars, contains at least one digit and one letter
        if (s.length >= 7 && /\d/.test(s) && /[A-Z]/i.test(s)) return true;

        // Short codes like "FB-6674" or "FR-3252"
        if (/^[A-Z]{1,4}[-_]\d{3,}$/i.test(s)) return true;

        return false;
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Collect all text entities (TEXT, MTEXT)
    // ─────────────────────────────────────────────────────────────────────────
    dxf.entities.forEach(entity => {
        if (entity.type !== "TEXT" && entity.type !== "MTEXT") return;

        const rawText = entity.text || entity.string || '';
        const cleaned = cleanMText(rawText).trim();
        if (!cleaned) return;

        const probes = textProbePoints(entity);
        if (probes.length === 0) return;

        texts.push({
            text: cleaned,
            probes,                          // multiple candidate points
            rotation: entity.rotation || 0,
            height: entity.textHeight || entity.height || 1,
            isValid: isValidParcelText(cleaned)
        });
    });

    console.log(`[dxfParser] Found ${texts.length} text entities`);
    texts.forEach(t => console.log(`  · "${t.text}" | valid=${t.isValid} | probes=${t.probes.length} | rot=${t.rotation}°`));

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: find the best text for a polygon ring
    // Strategy (in priority order):
    //   1. Valid text whose ANY probe point is inside the polygon
    //   2. Valid text closest to the centroid (within a max radius)
    //   3. Any text (not just "valid") whose probe is inside the polygon
    //   4. Auto-generated name
    // ─────────────────────────────────────────────────────────────────────────
    const findBestText = (coords) => {
        const bbox = getBBox(coords);
        const bboxMargin = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) * 0.1;
        const centroid = polygonCentroid(coords);

        // Candidate texts near this polygon (bbox pre-filter)
        const nearby = texts.filter(t =>
            t.probes.some(p => pointInBBox(p, bbox, bboxMargin))
        );

        // 1. Valid texts with probe inside polygon
        const insideValid = nearby.filter(t =>
            t.isValid && t.probes.some(p => isPointInPolygon(p, coords))
        );
        if (insideValid.length > 0) {
            // Pick closest to centroid among valid inside ones
            insideValid.sort((a, b) => {
                const da = Math.min(...a.probes.map(p => dist(p, centroid)));
                const db = Math.min(...b.probes.map(p => dist(p, centroid)));
                return da - db;
            });
            return insideValid[0].text;
        }

        // 2. Valid texts NOT inside polygon but very close (centroid distance)
        // Handles edge case where text overhangs the boundary or is slightly outside
        const polySize = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
        const proximityThreshold = polySize * 0.35; // 35% of polygon size

        const closeValid = nearby.filter(t => {
            const dmin = Math.min(...t.probes.map(p => dist(p, centroid)));
            return t.isValid && dmin < proximityThreshold;
        });
        if (closeValid.length > 0) {
            closeValid.sort((a, b) => {
                const da = Math.min(...a.probes.map(p => dist(p, centroid)));
                const db = Math.min(...b.probes.map(p => dist(p, centroid)));
                return da - db;
            });
            return closeValid[0].text;
        }

        // 3. Any text (even "non-valid" by our heuristic) whose probe is inside
        const insideAny = nearby.filter(t =>
            t.probes.some(p => isPointInPolygon(p, coords))
        );
        if (insideAny.length > 0) {
            // Prefer longer texts (more likely to be a real reference)
            insideAny.sort((a, b) => b.text.length - a.text.length);
            return insideAny[0].text;
        }

        return null;
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Process Polylines (LWPOLYLINE and POLYLINE)
    // ─────────────────────────────────────────────────────────────────────────
    dxf.entities.forEach(entity => {
        if (entity.type !== "LWPOLYLINE" && entity.type !== "POLYLINE") return;
        if (!entity.vertices || entity.vertices.length < 3) return;

        let coords = entity.vertices.map(v => [v.x, v.y]);

        // Force closing the ring if needed
        if (!isClosedRing(coords)) {
            coords = closeRing(coords);
        }

        const name = findBestText(coords) || (() => {
            const n = generateAutoName(autoIndex++);
            return n;
        })();

        const area = calculatePolygonArea(coords);
        const geometryCoords = transformToWGS84(coords, epsgCode);

        parcels.push({
            id: `dxf-${file.name}-${parcels.length}`,
            name: name.replace(/\s+/g, ''),
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

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Filter exact duplicates (same area and same start vertex)
    // ─────────────────────────────────────────────────────────────────────────
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

    console.log(`[dxfParser] Result: ${uniqueParcels.length} unique parcels`);
    uniqueParcels.forEach(p => console.log(`  · "${p.name}" | area=${p.area.toFixed(2)}m²`));

    return uniqueParcels;
};
