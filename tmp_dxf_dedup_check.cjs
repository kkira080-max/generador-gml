const fs = require('fs');
const DxfParser = require('dxf-parser');
const { parseDXF } = require('./src/utils/dxfParser.js');
const { detectAndSubtractIslands } = require('./src/utils/islandDetection.js');

async function check() {
    const fileContent = fs.readFileSync('C:\\Users\\kirak\\OneDrive\\Escritorio\\GML-GENERATOR\\ISLAS_.dxf');
    const fakeFile = {
        name: 'ISLAS_.dxf',
        text: async () => fileContent.toString('utf-8')
    };
    
    let parcels = await parseDXF(fakeFile, "25830");
    console.log(`Initial parse total: ${parcels.length}`);
    parcels.forEach((p, i) => console.log(`[Init] Extracted Poly ${i}: Area ${p.area}`));

    // Deduplication logic
    const uniqueParcels = [];
    parcels.forEach(p => {
        let isDuplicate = false;
        // Fast bounding box / area check vs existing unique parcels
        for (const u of uniqueParcels) {
            // If area is within 1 square meter and bounds match, it's a duplicate
            if (Math.abs(p.area - u.area) < 0.5) {
                const ringA = p.originalCoords[0];
                const ringB = u.originalCoords[0];
                if (ringA.length === ringB.length) {
                    const diffX = Math.abs(ringA[0][0] - ringB[0][0]);
                    const diffY = Math.abs(ringA[0][1] - ringB[0][1]);
                    if (diffX < 0.1 && diffY < 0.1) {
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

    console.log(`\nAfter deduplication: ${uniqueParcels.length}`);
    uniqueParcels.forEach((p, i) => console.log(`[Unique] Poly ${i}: Area ${p.area}`));

    const finalResult = detectAndSubtractIslands(uniqueParcels);
    console.log(`\nEnd Result: ${finalResult.length} root parcels`);
    finalResult.forEach((p, i) => console.log(`[Final] Poly ${i}: Final Area ${p.area}, Islands count: ${p.originalCoords.length - 1}`));
}
check();
