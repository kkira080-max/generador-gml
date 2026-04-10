const fs = require('fs');
const DxfParser = require('dxf-parser');
const parser = new DxfParser();

try {
  const dxfContent = fs.readFileSync('../adapta_a_catastro_2.dxf', 'utf8');
  const parsed = parser.parseSync(dxfContent);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  parsed.entities.forEach(ent => {
    if(ent.vertices) {
       ent.vertices.forEach(v => {
           if(v.x < minX) minX = v.x;
           if(v.y < minY) minY = v.y;
           if(v.x > maxX) maxX = v.x;
           if(v.y > maxY) maxY = v.y;
       });
    }
  });

  console.log('BBOX:', [minX, minY, maxX, maxY]);
  
  // Try calling cadastre WFS manually
  const wfsUrl = `https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=cp:CadastralParcel&SRSNAME=EPSG:25830&BBOX=${minX},${minY},${maxX},${maxY}`;
  console.log("WFS URL:", wfsUrl);

  fetch(wfsUrl).then(r => r.text()).then(text => {
     console.log("Response starts with:", text.substring(0, 200));
  }).catch(e => console.error(e));

} catch(e) {
  console.error(e);
}
