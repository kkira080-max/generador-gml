import * as turf from '@turf/turf';

const poly1 = turf.polygon([[[0,0], [0,10], [10,10], [10,0], [0,0]]]);
const poly2 = turf.polygon([[[5,0], [5,10], [15,10], [15,0], [5,0]]]);

try {
  const diff1 = turf.difference(turf.featureCollection([poly1, poly2]));
  console.log("diff(FeatureCollection) worked, type:", diff1.geometry.type);
} catch (e) {
  console.log("diff(FeatureCollection) FAILED:", e.message);
}

try {
  const diff2 = turf.difference(poly1, poly2);
  console.log("diff(poly1, poly2) worked, type:", diff2.geometry.type);
} catch (e) {
  console.log("diff(poly1, poly2) FAILED:", e.message);
}
