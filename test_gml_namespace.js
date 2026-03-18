
import { generateGMLv4 } from './src/utils/gmlGenerator.js';

try {
    const mockParcels = [
        {
            name: "12345678901234", // 14 chars
            area: 100,
            huso: "25830",
            originalCoords: [[[0,0], [10,0], [10,10], [0,10], [0,0]]],
            geometry: { type: "Polygon", coordinates: [[[0,0], [10,0], [10,10], [0,10], [0,0]]] }
        },
        {
            name: "PARCELA1", // 8 chars
            area: 200,
            huso: "25830",
            originalCoords: [[[20,20], [30,20], [30,30], [20,30], [20,20]]],
            geometry: { type: "Polygon", coordinates: [[[20,20], [30,20], [30,30], [20,30], [20,20]]] }
        }
    ];

    const gml = generateGMLv4(mockParcels, "25830");

    console.log("--- GML OUTPUT CHECK ---");
    
    const hasSdgId = gml.includes('gml:id="ES.SDGC.CP.12345678901234-0"');
    const hasSdgNs = gml.includes('<namespace>ES.SDGC.CP</namespace>');
    const hasLocalId = gml.includes('gml:id="ES.LOCAL.CP.PARCELA1-1"');
    const hasLocalNs = gml.includes('<namespace>ES.LOCAL.CP</namespace>');

    // New checks for referencePoint
    const hasRefPointHeader = gml.includes('<cp:referencePoint>');
    const hasRefPointPoint = gml.includes('<gml:Point gml:id="ReferencePoint_ES.SDGC.CP.12345678901234-0"');
    const hasRefPointSrs = gml.includes('srsName="http://www.opengis.net/def/crs/EPSG/0/25830"');
    const hasPos = gml.includes('<gml:pos>5.00 5.00</gml:pos>'); // Centroid of [0,0] to [10,10] box is [5,5]

    console.log(`Parcel 1 (SDGC ID): ${hasSdgId ? "PASS" : "FAIL"}`);
    console.log(`Parcel 1 (SDGC NS): ${hasSdgNs ? "PASS" : "FAIL"}`);
    console.log(`Parcel 2 (LOCAL ID): ${hasLocalId ? "PASS" : "FAIL"}`);
    console.log(`Parcel 2 (LOCAL NS): ${hasLocalNs ? "PASS" : "FAIL"}`);
    console.log(`Ref Point (Header): ${hasRefPointHeader ? "PASS" : "FAIL"}`);
    console.log(`Ref Point (Point ID): ${hasRefPointPoint ? "PASS" : "FAIL"}`);
    console.log(`Ref Point (SRS URI): ${hasRefPointSrs ? "PASS" : "FAIL"}`);
    console.log(`Ref Point (Pos): ${hasPos ? "PASS" : "FAIL"}`);

    if (hasSdgId && hasSdgNs && hasLocalId && hasLocalNs && hasRefPointHeader && hasRefPointPoint && hasRefPointSrs && hasPos) {
        process.exit(0);
    } else {
        console.log("Full GML output for debugging:");
        console.log(gml);
        process.exit(1);
    }
} catch (e) {
    console.error("Error during test:");
    console.error(e);
    process.exit(1);
}
