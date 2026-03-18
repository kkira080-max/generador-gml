import fs from 'fs';
import { JSDOM } from 'jsdom';

// mock DOMParser
const dom = new JSDOM();
global.DOMParser = dom.window.DOMParser;

import { parseGML } from './src/utils/gmlParser.js';
import { generateGMLv4 } from './src/utils/gmlGenerator.js';

const xmlString = `<?xml version="1.0" encoding="utf-8"?>
<FeatureCollection
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:gml="http://www.opengis.net/gml/3.2"
        xmlns:xlink="http://www.w3.org/1999/xlink"
        xmlns:cp="http://inspire.ec.europa.eu/schemas/cp/4.0"
        xmlns:gmd="http://www.isotc211.org/2005/gmd"
        xsi:schemaLocation="http://www.opengis.net/wfs/2.0 http://schemas.opengis.net/wfs/2.0/wfs.xsd http://inspire.ec.europa.eu/schemas/cp/4.0 http://inspire.ec.europa.eu/schemas/cp/4.0/CadastralParcels.xsd"
        xmlns="http://www.opengis.net/wfs/2.0"
        timeStamp="2026-03-10T15:52:51" numberMatched="1" numberReturned="1">
        <member>
            <cp:CadastralParcel gml:id="ES.LOCAL.CP.30029000295699">
                <cp:areaValue uom="m2">15490</cp:areaValue>
                <cp:geometry>
                    <gml:MultiSurface gml:id="MultiSurface_ES.LOCAL.CP.30029000295699" srsName="http://www.opengis.net/def/crs/EPSG/0/25830">
                        <gml:surfaceMember>
                            <gml:Surface gml:id="Surface_ES.LOCAL.CP.30029000295699.1" srsName="http://www.opengis.net/def/crs/EPSG/0/25830">
                                <gml:patches>
                                    <gml:PolygonPatch>
                                        <gml:exterior>
                                            <gml:LinearRing>
                                                <gml:posList srsDimension="2" count="4">664997.02 4211537.69 664996.7 4211537.58 664992.94 4211536.21 664997.02 4211537.69</gml:posList>
                                            </gml:LinearRing>
                                        </gml:exterior>
                                        <gml:interior>
                                            <gml:LinearRing>
                                                <gml:posList srsDimension="2" count="4">664992.66 4211541.44 664992.16 4211541.79 664992.65 4211541.43 664992.66 4211541.44</gml:posList>
                                            </gml:LinearRing>
                                        </gml:interior>
                                    </gml:PolygonPatch>
                                </gml:patches>
                            </gml:Surface>
                        </gml:surfaceMember>
                        <gml:surfaceMember>
                            <gml:Surface gml:id="Surface_ES.LOCAL.CP.30029000295699.2" srsName="http://www.opengis.net/def/crs/EPSG/0/25830">
                                <gml:patches>
                                    <gml:PolygonPatch>
                                        <gml:exterior>
                                            <gml:LinearRing>
                                                <gml:posList srsDimension="2" count="4">664976.49 4211498.27 664980.29 4211499.52 664981.85 4211500.0 664976.49 4211498.27</gml:posList>
                                            </gml:LinearRing>
                                        </gml:exterior>
                                    </gml:PolygonPatch>
                                </gml:patches>
                            </gml:Surface>
                        </gml:surfaceMember>
                    </gml:MultiSurface>
                </cp:geometry>
                <cp:inspireId>
                    <Identifier xmlns="http://inspire.ec.europa.eu/schemas/base/3.3">
                        <localId>30029000295699</localId>
                        <namespace>ES.LOCAL.CP</namespace>
                    </Identifier>
                </cp:inspireId>
                <cp:label/>
                <cp:nationalCadastralReference/>
            </cp:CadastralParcel>
        </member>
</FeatureCollection>`;

async function run() {
    const file = { text: async () => xmlString, name: 'test.gml' };
    const parcels = await parseGML(file);
    console.log('Parsed parcels:', parcels.length);
    const out = generateGMLv4(parcels, '25830');
    console.log('Output XML length:', out.length);
    console.log('Generated Output:');
    console.log(out.substring(0, 1000));
}
run();
