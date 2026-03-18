import { performIvgaCheck } from './src/utils/ivgaValidator.js';
import * as turf from '@turf/turf';

// Mock Cadastre (Reference): A 10x10 square at origin
const cadastreParcel = {
  id: 'CATASTRO_1',
  name: 'CATASTRO_1',
  originalCoords: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
  geometry: {
    type: 'Polygon',
    coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]
  }
};

// Mock Neighbor (Reference): Another 10x10 square next to it (not modified)
const neighborParcel = {
    id: 'CATASTRO_2',
    name: 'CATASTRO_2',
    originalCoords: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]],
    geometry: {
      type: 'Polygon',
      coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]]
    }
  };


// Mock Proposal: Same 10x10 square, but with a microscopic sliver (0.001) over the neighbor
const proposedParcel = {
  id: 'PROPUESTA_1',
  name: 'PROPUESTA_1',
  originalCoords: [[[0, 0], [10.001, 0], [10.001, 10], [0, 10], [0, 0]]], // 0.01 m² overlap
  geometry: {
    type: 'Polygon',
    coordinates: [[[0, 0], [10.001, 0], [10.001, 10], [0, 10], [0, 0]]]
  }
};

const result = performIvgaCheck([proposedParcel], [cadastreParcel, neighborParcel]);
console.log(JSON.stringify(result.summary, null, 2));

if (result.summary.isValid) {
    console.log("TEST PASSED: The microscopic overlap and missing neighbor gap were correctly ignored.");
} else {
    console.log("TEST FAILED: IVGA reported errors.");
}
