/**
 * Utility functions for exporting parcel data to different formats.
 */

/**
 * Generates a GeoJSON string from an array of parcels.
 * @param {Array} parcels 
 * @returns {string}
 */
export const generateGeoJSON = (parcels) => {
  const collection = {
    type: "FeatureCollection",
    features: parcels.map(p => ({
      type: "Feature",
      id: p.id,
      geometry: p.geometry,
      properties: {
        name: p.name,
        area: p.area,
        huso: p.huso,
        filename: p.filename,
        ...p.properties
      }
    }))
  };
  return JSON.stringify(collection, null, 2);
};

/**
 * Generates a KML string from an array of parcels.
 * @param {Array} parcels 
 * @returns {string}
 */
export const generateKML = (parcels) => {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Exportación GML Generator</name>
    <Style id="polygonStyle">
      <LineStyle>
        <color>ff00ff00</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>4000ff00</color>
      </PolyStyle>
    </Style>
    <Style id="lineStyle">
      <LineStyle>
        <color>ff0000ff</color>
        <width>3</width>
      </LineStyle>
    </Style>
`;

  parcels.forEach(p => {
    const geom = p.geometry.geometry || p.geometry;
    const type = geom.type;
    const name = p.name || "Parcela";
    
    kml += `    <Placemark>
      <name>${name}</name>
      <description>Área: ${p.area ? p.area.toFixed(2) : 'N/A'} m2</description>
      <styleUrl>${type === 'LineString' ? '#lineStyle' : '#polygonStyle'}</styleUrl>
`;

    if (type === 'Polygon') {
      kml += `      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${geom.coordinates[0].map(c => `${c[0]},${c[1]},0`).join(' ')}
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>\n`;
    } else if (type === 'MultiPolygon') {
      kml += `      <MultiGeometry>\n`;
      geom.coordinates.forEach(poly => {
        kml += `        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>
                ${poly[0].map(c => `${c[0]},${c[1]},0`).join(' ')}
              </coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>\n`;
      });
      kml += `      </MultiGeometry>\n`;
    } else if (type === 'LineString') {
      kml += `      <LineString>
        <coordinates>
          ${geom.coordinates.map(c => `${c[0]},${c[1]},0`).join(' ')}
        </coordinates>
      </LineString>\n`;
    } else if (type === 'Point') {
      kml += `      <Point>
        <coordinates>${geom.coordinates[0]},${geom.coordinates[1]},0</coordinates>
      </Point>\n`;
    }

    kml += `    </Placemark>\n`;
  });

  kml += `  </Document>
</kml>`;
  return kml;
};
