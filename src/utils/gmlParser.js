import { transformToWGS84, calculatePolygonArea, closeRing } from './geoUtils';

export const parseGML = async (file) => {
  const text = await file.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");

  const parcels = [];

  // check if it's already GML v4 by inspecting namespace/schema attributes
  const rootElement = xmlDoc.documentElement;
  const isGmlV4 =
    rootElement.getAttribute("xmlns:cp") === "http://inspire.ec.europa.eu/schemas/cp/4.0" ||
    (rootElement.getAttribute("xsi:schemaLocation") || "").includes("cp/4.0");

  // Look for Parcels or Buildings / Other Constructions
  // We strictly target CadastralParcel and ignore internal divisions like Subparcelas or Recintos
  const parcelElements = [
    ...Array.from(xmlDoc.getElementsByTagNameNS("*", "CadastralParcel")),
    ...Array.from(xmlDoc.getElementsByTagNameNS("*", "Building")),
    ...Array.from(xmlDoc.getElementsByTagNameNS("*", "OtherConstruction"))
  ];

  for (let i = 0; i < parcelElements.length; i++) {
    const parcelElement = parcelElements[i];

    const isBuilding = ['Building', 'OtherConstruction'].includes(parcelElement.localName);
    let metadata = {};
    let baseName = "Desconocido";
    if (isBuilding) {
      const gmlId = parcelElement.getAttribute("gml:id") || parcelElement.getAttribute("id");
      if (gmlId && gmlId.includes(".BU.")) {
        baseName = gmlId.split(".BU.")[1];
      } else {
        const localId = parcelElement.getElementsByTagNameNS("*", "localId")[0];
        if (localId) {
          baseName = localId.textContent;
        } else if (gmlId) {
          baseName = gmlId;
        }
      }

      // Extract specific building info
      const currentUse = parcelElement.getElementsByTagNameNS("*", "currentUse")[0];
      const condition = parcelElement.getElementsByTagNameNS("*", "conditionOfConstruction")[0];
      
      // Building area is often in bu-ext2d:value or similar
      const areaValNode = parcelElement.getElementsByTagNameNS("*", "value")[0];
      let areaVal = areaValNode ? parseFloat(areaValNode.textContent) : null;

      // Map condition URIs to friendly labels
      let conditionLabel = condition ? condition.textContent.trim() : 'Desconocido';
      if (conditionLabel.includes('functional')) conditionLabel = 'Funcional';
      else if (conditionLabel.includes('ruin')) conditionLabel = 'Ruina';
      else if (conditionLabel.includes('declining')) conditionLabel = 'Deficiente';

      metadata = {
        isBuilding: true,
        use: currentUse ? currentUse.textContent : 'Desconocido',
        condition: conditionLabel,
        officialArea: areaVal
      };
    } else {
      const gmlId = parcelElement.getAttribute("gml:id") || parcelElement.getAttribute("id");
      if (gmlId && gmlId.includes(".CP.")) {
        baseName = gmlId.split(".CP.")[1];
      } else {
        const labelElem = parcelElement.getElementsByTagNameNS("*", "label")[0] || parcelElement.getElementsByTagNameNS("*", "nationalCadastralReference")[0] || parcelElement.getElementsByTagNameNS("*", "localId")[0];
        if (labelElem && labelElem.textContent) {
          baseName = labelElem.textContent;
        } else if (gmlId) {
          baseName = gmlId;
        }
      }
    }

    let epsgCode = "25830"; // default

    // Find coordinate system
    const multiSurfaceNode = parcelElement.getElementsByTagNameNS("*", "MultiSurface")[0];
    const surfaceNode = parcelElement.getElementsByTagNameNS("*", "Surface")[0];
    const envelopeNode = parcelElement.getElementsByTagNameNS("*", "Envelope")[0];

    // Check in order of likelihood
    const possibleNodes = [multiSurfaceNode, surfaceNode, envelopeNode, parcelElement].filter(Boolean);

    for (const node of possibleNodes) {
      const srsName = node.getAttribute("srsName");
      if (srsName) {
        const match = srsName.match(/(?:EPSG.*[/:])(\d{4,5})/i) || srsName.match(/(\d{4,5})/);
        if (match) {
          epsgCode = match[1];
          break;
        }
      }
    }

    // Find ALL geometry containers inside this parcel
    let patches = [
      ...Array.from(parcelElement.getElementsByTagNameNS("*", "PolygonPatch")),
      ...Array.from(parcelElement.getElementsByTagNameNS("*", "Polygon")),
      ...Array.from(xmlDoc.getElementsByTagNameNS("*", "surfaceMember"))
    ].filter(el => {
      // Ensure the geometry belongs to this parcel
      let parent = el.parentElement;
      while (parent) {
        if (parent === parcelElement) return true;
        parent = parent.parentElement;
      }
      return false;
    });

    // Deduplicate patches (some files might have Surface and Polygon nested)
    const uniquePatches = [];
    patches.forEach(p => {
      if (!uniquePatches.some(up => up.contains(p) || p.contains(up))) {
        uniquePatches.push(p);
      }
    });

    const multiCoords = [];
    const multiGeometryCoords = [];
    let totalArea = 0;

    for (let pIdx = 0; pIdx < uniquePatches.length; pIdx++) {
      const patchNode = uniquePatches[pIdx];
      let patchCoords = [];

      const exterior = patchNode.getElementsByTagNameNS("*", "exterior")[0];
      if (exterior) {
        const extList = exterior.getElementsByTagNameNS("*", "posList")[0] || exterior.getElementsByTagNameNS("*", "coordinates")[0];
        if (extList) {
          patchCoords.push(closeRing(parsePosList(extList.textContent)));
        }
      }

      const interiors = patchNode.getElementsByTagNameNS("*", "interior");
      for (let j = 0; j < interiors.length; j++) {
        const intList = interiors[j].getElementsByTagNameNS("*", "posList")[0] || interiors[j].getElementsByTagNameNS("*", "coordinates")[0];
        if (intList) {
          patchCoords.push(closeRing(parsePosList(intList.textContent)));
        }
      }

      if (patchCoords.length > 0) {
        let patchArea = calculatePolygonArea(patchCoords[0]);
        for (let k = 1; k < patchCoords.length; k++) {
          patchArea -= calculatePolygonArea(patchCoords[k]);
        }
        totalArea += patchArea;
        multiCoords.push(patchCoords);

        const geometryCoords = patchCoords.map(ring => transformToWGS84(ring, epsgCode));
        multiGeometryCoords.push(geometryCoords);
      }
    }

    if (multiCoords.length > 0) {
      // Create a single parcel entry, potentially containing a MultiPolygon
      parcels.push({
        id: `gml-${Date.now()}-${i}`,
        name: baseName,
        area: totalArea,
        filename: file.name,
        huso: epsgCode,
        isGmlV4: isGmlV4,
        metadata: metadata,
        isBuilding: isBuilding,
        originalCoords: multiCoords.length > 1 ? multiCoords : multiCoords[0],
        geometry: {
          type: multiCoords.length > 1 ? "MultiPolygon" : "Polygon",
          coordinates: multiCoords.length > 1 ? multiGeometryCoords : multiGeometryCoords[0]
        }
      });
    }
  }

  return parcels;
};

// Helper to parse a "x1 y1 x2 y2 ..." space or newline delimited string into [[x,y], [x,y]]
const parsePosList = (str) => {
  // Regex splits by any whitespace (tabs, newlines, spaces)
  const numbers = str.trim().split(/\s+/).map(Number);
  const coords = [];

  // Determine if axis order is Y,X instead of X,Y.
  // In Spain (Mainland and Canary), true UTM Easting (X) is 100k-850k and Northing (Y) is 3M-4.5M.
  // If the first parsed number is much larger than the second, the file provided them as Northing, Easting.
  let isSwapped = false;
  if (numbers.length >= 2 && !isNaN(numbers[0]) && !isNaN(numbers[1])) {
    if (numbers[0] > 1000000 && numbers[1] < 1000000) {
      isSwapped = true;
    }
  }

  for (let i = 0; i < numbers.length; i += 2) {
    if (!isNaN(numbers[i]) && !isNaN(numbers[i + 1])) {
      if (isSwapped) {
        coords.push([numbers[i + 1], numbers[i]]); // Swap back to [X, Y]
      } else {
        coords.push([numbers[i], numbers[i + 1]]);
      }
    }
  }
  return coords;
};
