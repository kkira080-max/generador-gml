/**
 * Generates a GML file for Buildings following the INSPIRE BuildingExtended2D schema (for Catastro ICUC).
 */
export const generateBuildingGML = (buildingData, geometry, huso) => {
  const {
    id = "1A",
    fechaInicio = "",
    fechaFinal = "",
    usoPrincipal = "residential",
    estadoConservacion = "funcional", // en_construccion, funcional, deficiente, ruina
    numInmuebles = "1",
    numViviendas = "1",
    plantasSobreRasante = "1",
    superficieConstruida = "0",
    precision = "0.1",
    esOtrasConstrucciones = false
  } = buildingData;

  const realId = id;
  const srsName = huso ? `urn:ogc:def:crs:EPSG::${huso}` : "urn:ogc:def:crs:EPSG::25830";
  
  // Use date str for versioning
  const formatDate = (date) => {
    if (!date) return new Date().toISOString().split('.')[0];
    const clean = date.replace(/\//g, '-').trim();
    if (!clean) return new Date().toISOString().split('.')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      // Assume DD-MM-YYYY converts to YYYY-MM-DD
      return `${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`;
    }
    return clean.includes('T') ? clean : `${clean}T00:00:00`;
  };

  const dateStr = formatDate(fechaInicio);
  const constrDateStr = formatDate(fechaFinal || fechaInicio);

  // Enforce integer for surface area
  const officialAreaInt = Math.round(parseFloat(superficieConstruida || 0));

  // Map status to INSPIRE values
  let statusValue = "functional";
  if (estadoConservacion === "en_construccion") statusValue = "underConstruction";
  else if (estadoConservacion === "deficiente") statusValue = "functional_poor";
  else if (estadoConservacion === "ruina") statusValue = "declined";
  else statusValue = "functional";
  
  // Handle geometry either as a feature/geometry object (WGS84) OR as raw originalCoords (UTM)
  let rings = [];
  if (Array.isArray(geometry)) {
    rings = geometry;
  } else if (geometry.type === 'Polygon') {
    rings = geometry.coordinates;
  } else if (geometry.type === 'MultiPolygon') {
    rings = geometry.coordinates[0];
  }

  // Calculate bounding box for Envelope
  const allCoords = rings.flat();
  const minX = Math.min(...allCoords.map(c => c[0]));
  const minY = Math.min(...allCoords.map(c => c[1]));
  const maxX = Math.max(...allCoords.map(c => c[0]));
  const maxY = Math.max(...allCoords.map(c => c[1]));

  // Format coordinates for GML (X Y)
  const formatCoords = (coords) => {
    return coords.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
  };

  // Map uso principal and other constructions
  const finalUseValue = usoPrincipal.startsWith('1_') ? usoPrincipal : `1_${usoPrincipal}`;
  const buildingTag = (usoPrincipal === 'otras_construcciones' || esOtrasConstrucciones) ? 'bu-ext2d:OtherConstruction' : 'bu-ext2d:Building';

  const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<!--Edificios de la D.G. del Catastro.-->
<gml:FeatureCollection gml:id="ES.LOCAL.BU" 
    xmlns:ad="urn:x-inspire:specification:gmlas:Addresses:3.0" 
    xmlns:base="urn:x-inspire:specification:gmlas:BaseTypes:3.2" 
    xmlns:bu-base="http://inspire.jrc.ec.europa.eu/schemas/bu-base/3.0" 
    xmlns:bu-core2d="http://inspire.jrc.ec.europa.eu/schemas/bu-core2d/2.0" 
    xmlns:bu-ext2d="http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0" 
    xmlns:cp="urn:x-inspire:specification:gmlas:CadastralParcels:3.0" 
    xmlns:gml="http://www.opengis.net/gml/3.2" 
    xmlns:xlink="http://www.w3.org/1999/xlink" 
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
    xsi:schemaLocation="http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0 http://inspire.ec.europa.eu/draft-schemas/bu-ext2d/2.0/BuildingExtended2D.xsd">
    <gml:featureMember>
        <${buildingTag} gml:id="ES.LOCAL.BU.${realId}">
            <gml:boundedBy>
                <gml:Envelope srsName="${srsName}">
                    <gml:lowerCorner>${minX.toFixed(2)} ${minY.toFixed(2)}</gml:lowerCorner>
                    <gml:upperCorner>${maxX.toFixed(2)} ${maxY.toFixed(2)}</gml:upperCorner>
                </gml:Envelope>
            </gml:boundedBy>
            <bu-core2d:beginLifespanVersion>${dateStr}</bu-core2d:beginLifespanVersion>
            <bu-core2d:conditionOfConstruction>${statusValue}</bu-core2d:conditionOfConstruction>
            <bu-core2d:dateOfConstruction>
                <bu-core2d:DateOfEvent>
                    <bu-core2d:beginning>${constrDateStr}</bu-core2d:beginning>
                    <bu-core2d:end>${constrDateStr}</bu-core2d:end>
                </bu-core2d:DateOfEvent>
            </bu-core2d:dateOfConstruction>
            <bu-core2d:endLifespanVersion xsi:nil="true" nilReason="other:unpopulated"></bu-core2d:endLifespanVersion>
            <bu-core2d:inspireId>
                <base:Identifier>
                    <base:localId>${realId}</base:localId>
                    <base:namespace>ES.LOCAL.BU</base:namespace>
                </base:Identifier>
            </bu-core2d:inspireId>
            <bu-ext2d:geometry>
                <bu-core2d:BuildingGeometry>
                    <bu-core2d:geometry>
                        <gml:Surface gml:id="Surface_ES.LOCAL.BU.${realId}" srsName="${srsName}">
                            <gml:patches>
                                <gml:PolygonPatch>
                                    <gml:exterior>
                                        <gml:LinearRing>
                                            <gml:posList srsDimension="2" count="${rings[0].length}">${formatCoords(rings[0])}</gml:posList>
                                        </gml:LinearRing>
                                    </gml:exterior>
                                    ${rings.slice(1).map(innerRing => `
                                    <gml:interior>
                                        <gml:LinearRing>
                                            <gml:posList srsDimension="2" count="${innerRing.length}">${formatCoords(innerRing)}</gml:posList>
                                        </gml:LinearRing>
                                    </gml:interior>`).join('')}
                                </gml:PolygonPatch>
                            </gml:patches>
                        </gml:Surface>
                    </bu-core2d:geometry>
                    <bu-core2d:horizontalGeometryEstimatedAccuracy uom="m">${precision}</bu-core2d:horizontalGeometryEstimatedAccuracy>
                    <bu-core2d:horizontalGeometryReference>footPrint</bu-core2d:horizontalGeometryReference>
                    <bu-core2d:referenceGeometry>true</bu-core2d:referenceGeometry>
                </bu-core2d:BuildingGeometry>
            </bu-ext2d:geometry>
            <bu-ext2d:currentUse>${finalUseValue}</bu-ext2d:currentUse>
            <bu-ext2d:numberOfBuildingUnits>${numInmuebles}</bu-ext2d:numberOfBuildingUnits>
            <bu-ext2d:numberOfDwellings>${numViviendas}</bu-ext2d:numberOfDwellings>
            <bu-ext2d:numberOfFloorsAboveGround ${plantasSobreRasante ? '' : 'xsi:nil="true" nilReason="other:unpopulated"'}>${plantasSobreRasante || ''}</bu-ext2d:numberOfFloorsAboveGround>
            <bu-ext2d:officialArea>
                <bu-ext2d:OfficialArea>
                    <bu-ext2d:officialAreaReference>grossFloorArea</bu-ext2d:officialAreaReference>
                    <bu-ext2d:value uom="m2">${officialAreaInt}</bu-ext2d:value>
                </bu-ext2d:OfficialArea>
            </bu-ext2d:officialArea>
        </${buildingTag}>
    </gml:featureMember>
</gml:FeatureCollection>`;

  return xml;
};
