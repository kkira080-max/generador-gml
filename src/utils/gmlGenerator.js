import { calculateCentroid } from './geoUtils.js';

export const generateGMLv4 = (parcels, defaultHuso) => {
  if (!parcels || parcels.length === 0) return null;

  // Header template with current timestamp
  const timestamp = new Date().toISOString().split('.')[0];
  let xmlString = `<?xml version="1.0" encoding="utf-8"?>
<FeatureCollection
    xmlns="http://www.opengis.net/wfs/2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:gml="http://www.opengis.net/gml/3.2"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    xmlns:cp="http://inspire.ec.europa.eu/schemas/cp/4.0"
    xmlns:gmd="http://www.isotc211.org/2005/gmd"
    xsi:schemaLocation="http://www.opengis.net/wfs/2.0 http://schemas.opengis.net/wfs/2.0/wfs.xsd http://inspire.ec.europa.eu/schemas/cp/4.0 http://inspire.ec.europa.eu/schemas/cp/4.0/CadastralParcels.xsd"
    timeStamp="${timestamp}"
    numberMatched="${parcels.length}"
    numberReturned="${parcels.length}">\n`;

  parcels.forEach((parcel, index) => {
    // If parcel was loaded from GML without a specific HUSO or DXF, use the selected one
    const huso = parcel.huso || defaultHuso;
    const srsName = `http://www.opengis.net/def/crs/EPSG/0/${huso}`;
    const srsPointUri = `http://www.opengis.net/def/crs/EPSG/0/${huso}`;


    // Clean parcel name for IDs
    const safeName = parcel.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    // Choose namespace based on name length (14 chars = Cadastral Reference)
    const isCadastralRef = parcel.name.length === 14;
    const namespace = isCadastralRef ? "ES.SDGC.CP" : "ES.LOCAL.CP";
    const parcelId = `${namespace}.${safeName}`;
    const surfaceId = `Surface_${safeName}`;

    // Reference Point calculation (Centroid)
    // originalCoords structure can be [[ring]] for Polygon or [[[ring]]] for MultiPolygon
    let centroidRing;
    if (parcel.geometry.type === 'MultiPolygon') {
        // MultiPolygon: [patch1, patch2, ...] where each patch is [exterior, interior, ...]
        centroidRing = parcel.originalCoords[0][0]; 
    } else {
        // Polygon: [exterior, interior, ...]
        centroidRing = parcel.originalCoords[0];
    }
    const centroid = calculateCentroid(centroidRing);

    xmlString += `  <member>
    <cp:CadastralParcel gml:id="${parcelId}">
      <cp:areaValue uom="m2">${Math.round(parcel.area)}</cp:areaValue>
      <cp:beginLifespanVersion xsi:nil="true" nilReason="http://inspire.ec.europa.eu/codelist/VoidReasonValue/Unpopulated"/>
      <cp:endLifespanVersion xsi:nil="true" nilReason="http://inspire.ec.europa.eu/codelist/VoidReasonValue/Unpopulated"/>
      <cp:geometry>
        <gml:MultiSurface gml:id="MultiSurface_${safeName}" srsName="${srsName}">\n`;

    const buildSurfaceMember = (rings, patchIndex) => {
      const polyId = patchIndex !== undefined ? `Polygon_${safeName}_${patchIndex}` : `Polygon_${safeName}`;
      let memberXml = `          <gml:surfaceMember>
            <gml:Polygon gml:id="${polyId}" srsName="${srsName}">\n`;

      if (rings && rings.length > 0) {
        // 1. Exterior
        const exteriorRing = rings[0];
        const extCoords = exteriorRing.map(pt => `${pt[0].toFixed(3)} ${pt[1].toFixed(3)}`).join(" ");

        memberXml += `              <gml:exterior>
                <gml:LinearRing>
                  <gml:posList srsDimension="2">${extCoords}</gml:posList>
                </gml:LinearRing>
              </gml:exterior>\n`;

        // 2. Interiors (Islands)
        for (let i = 1; i < rings.length; i++) {
          const intCoords = rings[i].map(pt => `${pt[0].toFixed(3)} ${pt[1].toFixed(3)}`).join(" ");
          memberXml += `              <gml:interior>
                <gml:LinearRing>
                  <gml:posList srsDimension="2">${intCoords}</gml:posList>
                </gml:LinearRing>
              </gml:interior>\n`;
        }
      }

      memberXml += `            </gml:Polygon>
          </gml:surfaceMember>\n`;
      return memberXml;
    };

    if (parcel.geometry.type === 'MultiPolygon') {
      parcel.originalCoords.forEach((patchCoords, idx) => {
        xmlString += buildSurfaceMember(patchCoords, idx + 1);
      });
    } else {
      xmlString += buildSurfaceMember(parcel.originalCoords);
    }

    xmlString += `        </gml:MultiSurface>
      </cp:geometry>
      <cp:inspireId>
        <Identifier xmlns="http://inspire.ec.europa.eu/schemas/base/3.3">
          <localId>${parcel.name}</localId>
          <namespace>${namespace}</namespace>
        </Identifier>
      </cp:inspireId>
      <cp:label>${parcel.name}</cp:label>
      <cp:nationalCadastralReference>${parcel.name}</cp:nationalCadastralReference>
      <cp:referencePoint>
        <gml:Point gml:id="ReferencePoint_${parcelId}" srsName="${srsPointUri}">
          <gml:pos>${centroid[0].toFixed(2)} ${centroid[1].toFixed(2)}</gml:pos>
        </gml:Point>
      </cp:referencePoint>
    </cp:CadastralParcel>
  </member>\n`;
  });

  xmlString += `</FeatureCollection>`;

  return xmlString;
};
