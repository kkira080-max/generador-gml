const fs = require('fs');
const DxfParser = require('dxf-parser');

const parser = new DxfParser();
const dxf = parser.parseSync(fs.readFileSync('C:\\Users\\kirak\\OneDrive\\Escritorio\\GML-GENERATOR\\ISLAS_.dxf', 'utf-8'));

const pointInPolygon = (point, polygon) => {
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let xi = polygon[i][0], yi = polygon[i][1];
        let xj = polygon[j][0], yj = polygon[j][1];
        let intersect = ((yi > y) !== (yj > y)) && (x <= (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

const getCentroid = (ring) => {
    let x = 0, y = 0, a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        let f = ring[i][0] * ring[i+1][1] - ring[i+1][0] * ring[i][1];
        x += (ring[i][0] + ring[i+1][0]) * f;
        y += (ring[i][1] + ring[i+1][1]) * f;
        a += f;
    }
    a *= 3;
    if (a === 0) return ring[0];
    return [x/a, y/a];
}

const parcels = [];
let idx = 0;
dxf.entities.forEach(entity => {
    if (entity.type !== "LWPOLYLINE" && entity.type !== "POLYLINE") return;
    if (!entity.vertices || entity.vertices.length < 3) return;

    let coords = entity.vertices.map(v => [v.x, v.y]);
    
    // Force close
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (Math.abs(first[0] - last[0]) > 0.001 || Math.abs(first[1] - last[1]) > 0.001) {
        coords.push([...first]);
    }

    let a = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        a += coords[i][0] * coords[i+1][1] - coords[i+1][0] * coords[i][1];
    }
    const area = Math.abs(a) / 2;

    parcels.push({ id: idx++, name: `Poly_${idx}`, area: area, coords, centroid: getCentroid(coords) });
});

parcels.sort((a,b) => b.area - a.area);
const used = new Set();

for(let i=0; i<parcels.length; i++) {
    const outer = parcels[i];
    if(used.has(outer.id)) continue;
    
    console.log(`Checking Outer: ${outer.name} (Area: ${outer.area.toFixed(2)})`);
    
    for(let j=i+1; j<parcels.length; j++) {
        const inner = parcels[j];
        if(used.has(inner.id)) continue;

        let pointsInside = 0;
        for(let pt of inner.coords) {
             if(pointInPolygon(pt, outer.coords)) pointsInside++;
        }

        const centroidInside = pointInPolygon(inner.centroid, outer.coords);
        
        console.log(`  -> Inner ${inner.name} (Area: ${inner.area.toFixed(2)}): ${pointsInside}/${inner.coords.length} points inside. Centroid Inside: ${centroidInside}`);
        
        // If centroid is inside and at least SOME points are inside/touching
        if (centroidInside && pointsInside > 0) {
            console.log(`     *** DECLARED AS ISLAND ***`);
            used.add(inner.id);
        }
    }
}
