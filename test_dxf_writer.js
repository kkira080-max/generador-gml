import Drawing from 'dxf-writer';
import fs from 'fs';

try {
    let d = new Drawing();
    d.setUnits('Meters');

    // Adding layer
    d.addLayer('RECINTOS_GML', Drawing.ACI.RED, 'CONTINUOUS');
    d.setActiveLayer('RECINTOS_GML');

    // draw closed polyline
    const points = [[0, 0], [10, 0], [10, 10], [0, 10]];
    d.drawPolyline(points, true);

    d.drawText(0, 0, 1.5, 0, 'TEST_PARCEL');

    const output = d.toDxfString();
    fs.writeFileSync('test_output.dxf', output);
    console.log('SUCCESS');
} catch (e) {
    console.error(e);
}
