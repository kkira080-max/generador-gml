import Drawing from 'dxf-writer';

export const generateDXF = (parcels) => {
    if (!parcels || parcels.length === 0) return null;

    let d = new Drawing();
    d.setUnits('Meters');

    // Add the specific layer and colors user requested
    d.addLayer('RECINTOS_GML', Drawing.ACI.RED, 'CONTINUOUS');
    d.setActiveLayer('RECINTOS_GML');

    // Sanitize text to remove characters that might break DXF parsing
    const sanitizeText = (str) => {
        if (!str) return "PARCELA";
        // Replace non-ascii, quotes, newlines, and other problematic DXF characters
        return str.replace(/[^\x20-\x7E]/g, '_').replace(/[\r\n"´`]/g, '_').trim();
    };

    // Helper to find the centroid of a polygon for placing text
    const getCentroid = (coords) => {
        let x = 0, y = 0, area = 0;
        for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
            const x0 = coords[i][0];
            const y0 = coords[i][1];
            const x1 = coords[j][0];
            const y1 = coords[j][1];
            const a = x0 * y1 - x1 * y0;
            area += a;
            x += (x0 + x1) * a;
            y += (y0 + y1) * a;
        }
        area *= 0.5;
        if (area === 0) return coords[0];
        x = x / (6 * area);
        y = y / (6 * area);
        return [x, y];
    };

    const drawRing = (ringCoords) => {
        if (ringCoords.length < 2) return;

        // dxf-writer expects points as [ [x,y], [x,y] ]
        d.drawPolyline(ringCoords, true); // true = closed polyline
    };

    parcels.forEach((parcel) => {
        // Handle direct text/point markers
        if (parcel.isText && parcel.geometry.type === 'Point') {
            const utm = parcel.originalCoords[0];
            const textHeight = 2.0;
            d.drawText(utm[0], utm[1], textHeight, 0, sanitizeText(parcel.name));
            return;
        }

        // Skip parcels with no valid geometry
        if (!parcel.originalCoords || parcel.originalCoords.length === 0) return;

        // Detect the nesting depth
        const firstEl = parcel.originalCoords[0];
        if (!firstEl || !Array.isArray(firstEl)) return; 
        
        const isPoint = typeof firstEl[0] === 'number'; 
        const isRing = Array.isArray(firstEl[0]) && typeof firstEl[0][0] === 'number'; 
        const isMultiPolygon = Array.isArray(firstEl[0]) && Array.isArray(firstEl[0][0]) && typeof firstEl[0][0][0] === 'number';

        let firstPatchExterior = null;

        if (isMultiPolygon) {
            parcel.originalCoords.forEach((patchCoords) => {
                if (!patchCoords || !patchCoords[0] || patchCoords[0].length < 2) return;
                if (!firstPatchExterior) firstPatchExterior = patchCoords[0];
                drawRing(patchCoords[0]); 
                for (let i = 1; i < patchCoords.length; i++) {
                    if (patchCoords[i]?.length >= 2) drawRing(patchCoords[i]); 
                }
            });
        } else if (isRing) {
            const rings = parcel.originalCoords;
            if (rings[0]?.length >= 2) {
                firstPatchExterior = rings[0];
                // Use parcel.isLine to decide if closed or open
                if (parcel.isLine) {
                  d.drawPolyline(rings[0], false);
                } else {
                  drawRing(rings[0]); 
                }
                for (let i = 1; i < rings.length; i++) {
                    if (rings[i]?.length >= 2) drawRing(rings[i]); 
                }
            }
        } else if (isPoint) {
            if (parcel.isLine) {
              d.drawPolyline(parcel.originalCoords, false);
            } else {
              drawRing(parcel.originalCoords);
            }
            firstPatchExterior = parcel.originalCoords;
        }

        // Place parcel name at the centroid for non-text entities
        if (firstPatchExterior && parcel.name && !parcel.isText) {
            const placement = getCentroid(firstPatchExterior);
            const textHeight = 1.5;
            const cleanName = sanitizeText(parcel.name);
            d.drawText(placement[0], placement[1], textHeight, 0, cleanName);
        }
    });

    return d.toDxfString();
};
