import fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';
global.DOMParser = DOMParser;
import { parseDXF } from './src/utils/dxfParser.js';
import { fetchParcelsByBbox } from './src/utils/cadastreService.js';
import { performIvgaCheck } from './src/utils/ivgaValidator.js';
import { calculateBbox } from './src/utils/geoUtils.js';

async function run() {
  const dxfPath = '../VALIDACION_.dxf';
  let fileObj = {
    name: 'VALIDACION_.dxf',
    text: async () => fs.readFileSync(dxfPath, 'utf8')
  };

  console.log("Parsing DXF...");
  const proposedParcels = await parseDXF(fileObj, '25830');
  console.log(`Parsed ${proposedParcels.length} parcels.`);
  
  const allRings = proposedParcels.flatMap(p => {
    if (Array.isArray(p.originalCoords[0][0][0])) return p.originalCoords.flat();
    return p.originalCoords;
  });
  
  const bbox = calculateBbox(allRings);
  console.log("BBox:", bbox);
  
  console.log("Fetching cadastral reference parcels...");
  const referenceParcels = await fetchParcelsByBbox(bbox, huso);
  console.log(`Fetched ${referenceParcels.length} reference parcels. Top 3:`, referenceParcels.slice(0,3).map(p=>p.name));
  
  if (proposedParcels.length > 0 && proposedParcels[0].originalCoords.length > 0) {
     console.log("Sample Proposed Coord (DXF):", proposedParcels[0].originalCoords[0][0]);
  }
  if (referenceParcels.length > 0 && referenceParcels[0].originalCoords.length > 0) {
     console.log("Sample Reference Coord (WFS->UTM):", referenceParcels[0].originalCoords[0][0]);
     console.log("Sample Reference Coord (raw WFS lat/lon):", referenceParcels[0].geometry.coordinates[0][0]);
  }
  
  console.log("Running IVGA Check...");
  const report = performIvgaCheck(proposedParcels, referenceParcels);
  console.log("IVGA Report Summary:");
  console.log(JSON.stringify(report.summary, null, 2));
}

run().catch(err => {
  console.error("FATAL ERROR:");
  console.error(err.message);
  console.error(err.stack);
  fs.writeFileSync('debug_error.log', err.stack);
});
