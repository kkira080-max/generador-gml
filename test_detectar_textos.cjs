/**
 * test_detectar_textos.cjs
 * 
 * 1. Generates a test DXF file (detectar_textos.dxf) with polygons
 *    and text labels at various rotation angles (0°, 30°, -15°, 45°, 90°)
 * 2. Parses the DXF using the raw DxfParser library (not our wrapper)
 *    to validate what entities it extracts
 * 3. Simulates the logic of our improved dxfParser.js to verify text detection
 */

const fs = require('fs');
const path = require('path');

// ─── 1. Generate DXF content ────────────────────────────────────────────────

function dxfText(handle, x, y, rotation, text, layer = '0') {
    return [
        '0', 'TEXT',
        '5', handle,
        '8', layer,
        '10', x.toFixed(6),
        '20', y.toFixed(6),
        '30', '0.0',
        '40', '2.5',       // text height
        '1', text,
        '50', rotation.toFixed(2),
        '72', '0',         // hjust: left
        '73', '0',         // vjust: baseline
    ].join('\n');
}

function dxfMText(handle, x, y, rotation, text, layer = '0') {
    // MTEXT uses group 71 for attachment point and 50 for rotation in radians... 
    // but dxf-parser reads 50 as degrees for MTEXT too
    return [
        '0', 'MTEXT',
        '5', handle,
        '8', layer,
        '10', x.toFixed(6),
        '20', y.toFixed(6),
        '30', '0.0',
        '40', '2.5',       // text height
        '41', '50.0',      // reference rectangle width
        '71', '1',         // attachment: top left
        '1', text,
        '50', rotation.toFixed(2),
    ].join('\n');
}

function dxfLwPolyline(handle, vertices, layer = 'PARCELAS') {
    const lines = [
        '0', 'LWPOLYLINE',
        '5', handle,
        '8', layer,
        '90', vertices.length.toString(),
        '70', '1',  // closed flag
    ];
    for (const [x, y] of vertices) {
        lines.push('10', x.toFixed(6));
        lines.push('20', y.toFixed(6));
    }
    return lines.join('\n');
}

// Parcels as rectangles with their text labels and rotations
// Coordinates in UTM-like space (meters), realistic for Spain zone 30N
const parcels = [
    {
        name: '0022048-0VESLHCC',
        angle: 0,           // text horizontal
        vertices: [
            [700100, 4400200],
            [700200, 4400200],
            [700200, 4400100],
            [700100, 4400100],
        ],
        textOffset: [30, 30]  // offset from bottom-left vertex
    },
    {
        name: '0025474-0VESLHCC',
        angle: 15,          // slight tilt
        vertices: [
            [700250, 4400300],
            [700380, 4400320],
            [700370, 4400420],
            [700240, 4400400],
        ],
        textOffset: [30, 40]
    },
    {
        name: 'FR-3252',
        angle: -20,         // negative rotation
        vertices: [
            [700150, 4400070],
            [700330, 4400080],
            [700340, 4400150],
            [700160, 4400140],
        ],
        textOffset: [50, 20]
    },
    {
        name: 'FB-6674',
        angle: 45,          // diagonal 45°
        vertices: [
            [699980, 4400050],
            [700090, 4400060],
            [700100, 4400150],
            [699990, 4400140],
        ],
        textOffset: [30, 30]
    },
    {
        name: '0022049-0VESLHCC',
        angle: 90,          // vertical text
        vertices: [
            [699850, 4400000],
            [699950, 4400000],
            [699950, 4400120],
            [699850, 4400120],
        ],
        textOffset: [20, 50]
    },
    {
        name: '0022068-0VEST_HCC',  // with underscore, non-14 chars
        angle: -45,         // diagonal negative
        vertices: [
            [699900, 4399880],
            [700020, 4399895],
            [700010, 4399990],
            [699890, 4399975],
        ],
        textOffset: [40, 30]
    },
    {
        name: '0412069-8VEST_HCC',
        angle: 33,
        vertices: [
            [699800, 4399850],
            [699900, 4399860],
            [699890, 4399950],
            [699790, 4399940],
        ],
        textOffset: [25, 35]
    },
    {
        name: '0412069-0VEST_HCC',  // MTEXT entity with formatting
        angle: -10,
        useMText: true,
        mTextContent: '{\\fArial;0412069-0VEST_HCC}',  // MTEXT with font code
        vertices: [
            [700050, 4399870],
            [700190, 4399880],
            [700180, 4399970],
            [700040, 4399960],
        ],
        textOffset: [50, 25]
    },
];

let handleCounter = 100;
function nextHandle() {
    return (handleCounter++).toString(16).toUpperCase();
}

const entityLines = [];

for (const parcel of parcels) {
    const [tx, ty] = [
        parcel.vertices[0][0] + parcel.textOffset[0],
        parcel.vertices[0][1] + parcel.textOffset[1]
    ];

    // Add polygon
    entityLines.push(dxfLwPolyline(nextHandle(), parcel.vertices));

    // Add text label
    if (parcel.useMText) {
        entityLines.push(dxfMText(nextHandle(), tx, ty, parcel.angle, parcel.mTextContent));
    } else {
        entityLines.push(dxfText(nextHandle(), tx, ty, parcel.angle, parcel.name));
    }
}

const dxfContent = `  0
SECTION
  2
HEADER
  9
$ACADVER
  1
AC1015
  0
ENDSEC
  0
SECTION
  2
ENTITIES
${entityLines.join('\n')}
  0
ENDSEC
  0
EOF
`;

const outPath = path.join(__dirname, 'detectar_textos.dxf');
fs.writeFileSync(outPath, dxfContent, 'utf-8');
console.log(`✅ DXF generado: ${outPath}`);

// ─── 2. Parse and test ──────────────────────────────────────────────────────

let DxfParser;
try {
    DxfParser = require('dxf-parser');
} catch (e) {
    console.error('dxf-parser not found in this CJS context. Install it or run from the gml-webapp root.');
    process.exit(1);
}

const parser = new DxfParser();
const dxf = parser.parseSync(dxfContent);

console.log(`\n📦 Entidades encontradas: ${dxf.entities.length}`);

// ─── Replicate cleaned text logic ──────────────────────────────────────────

function cleanMText(str) {
    if (!str) return '';
    return str
        .replace(/\\A\d+;/g, '')
        .replace(/\\C\d+;/g, '')
        .replace(/\\f[^;]+;/gi, '')
        .replace(/\\H[\d.]+x?;/gi, '')
        .replace(/\\W[\d.]+;/gi, '')
        .replace(/\\Q[\d.]+;/gi, '')
        .replace(/\\S[^;]+;/g, '')
        .replace(/\\L/g, '').replace(/\\l/g, '')
        .replace(/\\O/g, '').replace(/\\o/g, '')
        .replace(/\{\\[^}]+\}/g, '')
        .replace(/\\P/g, ' ')
        .replace(/\\~/g, ' ')
        .replace(/[{}]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isValidParcelText(str) {
    if (!str || str.length < 2) return false;
    const s = str.replace(/\s/g, '');
    if (/^(FINCA|PARCELA|FR[-_]|FB[-_]|REF|RECINTO|_MOD)/i.test(s)) return true;
    if (/^[A-Z0-9]{14}$/i.test(s)) return true;
    if (/^\d{4,}-\d+[A-Z]+$/i.test(s)) return true;
    if (s.length >= 7 && /\d/.test(s) && /[A-Z]/i.test(s)) return true;
    if (/^[A-Z]{1,4}[-_]\d{3,}$/i.test(s)) return true;
    return false;
}

function textProbePoints(entity) {
    const px = entity.position
        ? entity.position.x
        : (entity.startPoint ? entity.startPoint.x : entity.x);
    const py = entity.position
        ? entity.position.y
        : (entity.startPoint ? entity.startPoint.y : entity.y);
    if (px === undefined || py === undefined) return [];

    const ax = entity.alignmentPoint ? entity.alignmentPoint.x : undefined;
    const ay = entity.alignmentPoint ? entity.alignmentPoint.y : undefined;

    const rotation = (entity.rotation || 0) * Math.PI / 180;
    const height = entity.textHeight || entity.height || 1;
    const rawText = cleanMText(entity.text || entity.string || '');
    const estWidth = rawText.length * height * 0.6;

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const perpCos = Math.cos(rotation + Math.PI / 2);
    const perpSin = Math.sin(rotation + Math.PI / 2);
    const halfH = height * 0.5;

    const probes = [[px, py]];

    for (const frac of [0, 0.25, 0.5, 0.75, 1.0]) {
        const bx = px + cos * estWidth * frac;
        const by = py + sin * estWidth * frac;
        probes.push([bx, by]);
        probes.push([bx + perpCos * halfH, by + perpSin * halfH]);
    }

    if (ax !== undefined && ay !== undefined) {
        probes.push([ax, ay]);
        probes.push([(px + ax) / 2, (py + ay) / 2]);
    }

    const midX = px + cos * estWidth * 0.5 + perpCos * halfH;
    const midY = py + sin * estWidth * 0.5 + perpSin * halfH;
    probes.push([midX, midY]);

    return probes;
}

function isPointInPolygon(point, polygon) {
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let xi = polygon[i][0], yi = polygon[i][1];
        let xj = polygon[j][0], yj = polygon[j][1];
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

console.log('\n📝 Textos detectados:\n');
const textEntities = [];
dxf.entities.forEach(entity => {
    if (entity.type !== 'TEXT' && entity.type !== 'MTEXT') return;
    const raw = entity.text || entity.string || '';
    const cleaned = cleanMText(raw).trim();
    if (!cleaned) return;
    const probes = textProbePoints(entity);
    const valid = isValidParcelText(cleaned);
    textEntities.push({ text: cleaned, probes, valid, rotation: entity.rotation || 0 });
    console.log(`  [${entity.type}] "${cleaned}" | rotation=${entity.rotation || 0}° | valid=${valid} | probes=${probes.length}`);
});

console.log('\n🗺️  Asociación texto → polígono:\n');
let matched = 0;
let unmatched = 0;

dxf.entities.forEach(entity => {
    if (entity.type !== 'LWPOLYLINE' && entity.type !== 'POLYLINE') return;
    if (!entity.vertices || entity.vertices.length < 3) return;
    const coords = entity.vertices.map(v => [v.x, v.y]);

    // Find matching texts
    const found = textEntities.find(t =>
        t.valid && t.probes.some(p => isPointInPolygon(p, coords))
    ) || textEntities.find(t =>
        t.probes.some(p => isPointInPolygon(p, coords))
    );

    if (found) {
        console.log(`  ✅ Polígono (${coords.length} vértices) → "${found.text}"`);
        matched++;
    } else {
        // Try proximity fallback
        const centroid = coords.reduce((acc, p) => [acc[0] + p[0] / coords.length, acc[1] + p[1] / coords.length], [0, 0]);
        const closest = textEntities.reduce((best, t) => {
            const dmin = Math.min(...t.probes.map(p => Math.hypot(p[0] - centroid[0], p[1] - centroid[1])));
            if (!best || dmin < best.d) return { t, d: dmin };
            return best;
        }, null);

        if (closest && closest.d < 100) {
            console.log(`  ⚠️  Polígono (${coords.length} vértices) → "${closest.t.text}" (proximidad: ${closest.d.toFixed(1)}m)`);
            matched++;
        } else {
            console.log(`  ❌ Polígono (${coords.length} vértices) → SIN NOMBRE`);
            unmatched++;
        }
    }
});

console.log(`\n📊 Resumen: ${matched} matched, ${unmatched} sin nombre`);
console.log('\nTest completado ✅');
