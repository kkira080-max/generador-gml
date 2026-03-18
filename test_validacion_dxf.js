import fs from 'fs';
import { extractPolygonsFromDxf } from './src/utils/dxfParser.js';

const dxfPath = '../VALIDACION_.dxf';
try {
  const dxfContent = fs.readFileSync(dxfPath, 'utf8');
  const result = extractPolygonsFromDxf(dxfContent, 'VALIDACION_.dxf');
  console.log('DXF Parsed:', result.success);
  if (result.success) {
      console.log('Parcels:', result.parcels.length);
      result.parcels.forEach((p, i) => {
          console.log(`Parcel ${i+1}:`, p.name);
          console.log(`Area:`, p.area.toFixed(2));
      });
  } else {
     console.log('Error parsing:', result.error);
  }
} catch (e) {
  console.log('Fatal Error', e.message);
}
