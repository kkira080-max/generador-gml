const url = "http://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=cp:CadastralParcel&SRSNAME=EPSG:25830&BBOX=440000,4470000,440300,4470300&OUTPUTFORMAT=application/gml+xml;%20version=3.2";
fetch(url).then(r=>r.text()).then(t=>{
  const matches = [...t.matchAll(/<cp:CadastralParcel[^>]*>([\s\S]*?)<\/cp:CadastralParcel>/g)];
  console.log("Total Parcels:", matches.length);
  matches.forEach((m, idx) => {
    let natRef = "";
    const nMatch = m[1].match(/<base:nationalCadastralReference>([^<]+)<\/base:nationalCadastralReference>/);
    if(nMatch) natRef = nMatch[1];
    let localId = "";
    const lMatch = m[1].match(/<base:localId>([^<]+)<\/base:localId>/);
    if(lMatch) localId = lMatch[1];
    let label = "";
    const labelMatch = m[1].match(/<cp:label>([^<]+)<\/cp:label>/);
    if(labelMatch) label = labelMatch[1];
    console.log(`P${idx} -> natRef: '${natRef}', localId: '${localId}', label: '${label}'`);
  });
});
