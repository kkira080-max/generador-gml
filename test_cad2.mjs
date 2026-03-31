import fs from 'fs';
const url = "http://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=cp:CadastralParcel&SRSNAME=EPSG:25830&BBOX=440000,4470000,440300,4470300&OUTPUTFORMAT=application/gml+xml;%20version=3.2";
fetch(url).then(r=>r.text()).then(t=>{
  const matches = [...t.matchAll(/<cp:CadastralParcel[^>]*>([\s\S]*?)<\/cp:CadastralParcel>/g)];
  if(matches.length > 0) {
    fs.writeFileSync('sample_parcel.xml', matches[0][0]);
    console.log("Saved sample_parcel.xml");
  }
});
