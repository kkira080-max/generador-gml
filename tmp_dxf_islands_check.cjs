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
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

const calcArea = (ring) => {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        a += ring[i][0] * ring[i+1][1] - ring[i+1][0] * ring[i][1];
    }
    return Math.abs(a) / 2;
};

const texts = [];
dxf.entities.forEach(entity => {
    if (entity.type === "TEXT" || entity.type === "MTEXT") {
        if (!entity.text) return;
        const px = entity.position ? entity.position.x : (entity.startPoint ? entity.startPoint.x : entity.x);
        const py = entity.position ? entity.position.y : (entity.startPoint ? entity.startPoint.y : entity.y);
        texts.push({ text: entity.text.trim(), position: [px, py] });
    }
});

const parcels = [];
let idx = 0;
dxf.entities.forEach(entity => {
    if (entity.type !== "LWPOLYLINE" && entity.type !== "POLYLINE") return;
    if (!entity.vertices || entity.vertices.length < 3) return;

    let coords = entity.vertices.map(v => [v.x, v.y]);
    
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (Math.abs(first[0] - last[0]) > 0.001 || Math.abs(first[1] - last[1]) > 0.001) {
        coords.push([...first]);
    }

    let name = `Auto_${idx++}`;
    for (let t of texts) {
        if (pointInPolygon(t.position, coords)) {
            const valid = t.text.match(/(FINCA|_MOD|PARCELA|FR-|REF|RECINTO)/i);
            if (valid) {
                name = t.text.replace(/\s/g, "");
                break;
            }
        }
    }

    parcels.push({ id: idx, name, area: calcArea(coords), coords });
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

        if(pointsInside === inner.coords.length) {
            console.log(`  -> Valid Island: ${inner.name} (Area ${inner.area.toFixed(2)}) is fully inside ${outer.name}`);
            used.add(inner.id);
        } else if (pointsInside > 0) {
            console.log(`  -> Partial overlap / failure: ${inner.name} has ${pointsInside}/${inner.coords.length} points inside ${outer.name}. Area: ${inner.area.toFixed(2)}`);
        }
    }
}
