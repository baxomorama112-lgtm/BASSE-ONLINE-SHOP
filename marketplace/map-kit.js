/* BASSE map kit: ONE map look for the customer Track Order, the driver app and the admin live map. */
(function(){
  if(window.BasseMap)return;
  const BM=window.BasseMap={};
  const rad=x=>x*Math.PI/180;
  const km=(a,b)=>{const R=6371,dLat=rad(b[0]-a[0]),dLng=rad(b[1]-a[1]),s=Math.sin(dLat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(s))};
  const fmt=d=>d<1?Math.max(1,Math.round(d*1000))+' m':d.toFixed(1)+' km';
  BM.km=km;BM.fmt=fmt;
  /* same dashed route line everywhere */
  BM.lineStyle={color:'#1d55c9',weight:4,opacity:.9,dashArray:'2 10',lineCap:'round'};
  /* same pins everywhere: coloured dot on the exact point + name tag */
  BM.icon=function(type,label){const t=type==='driver'?'driver':'customer',safe=String(label==null?'':label).replace(/[<>&"]/g,'');
    return L.divIcon({className:'bm-icon bm-'+t,html:'<i class="bm-dot"></i><b class="bm-tag">'+safe+'</b>',iconSize:[0,0],iconAnchor:[0,0]})};
  /* same tiles everywhere: standard OpenStreetMap (no API key, always shows roads and place names) */
  BM.tiles=function(map){
    map.getContainer().classList.add('bm-map');
    const layer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:2,updateWhenIdle:true,updateWhenZooming:false,attribution:'© OpenStreetMap contributors',crossOrigin:true}).addTo(map);
    layer.on('tileerror',e=>{const t=e.tile;if(!t)return;t.__bmTry=(t.__bmTry||0)+1;if(t.__bmTry>3)return;setTimeout(()=>{const base=String(t.src).replace(/[?&]bm=\d+$/,'');t.src=base+(base.includes('?')?'&':'?')+'bm='+Date.now()},1200*t.__bmTry)});
    BM.chrome(map);return layer};
  /* distance badge (top-right) + "show both" button (bottom-right) */
  BM.chrome=function(map){
    if(map.__bm)return;const st=map.__bm={pts:{}};
    const hud=L.control({position:'topright'});hud.onAdd=()=>{const d=L.DomUtil.create('div','bm-hud');const b=L.DomUtil.create('div','bm-dist',d);b.hidden=true;L.DomEvent.disableClickPropagation(d);return d};hud.addTo(map);st.hud=hud.getContainer().querySelector('.bm-dist');
    const fit=L.control({position:'bottomright'});fit.onAdd=()=>{const b=L.DomUtil.create('button','bm-fit');b.type='button';b.title='Show driver and customer';b.setAttribute('aria-label','Show driver and customer');b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/><circle cx="12" cy="12" r="2.6"/></svg>';L.DomEvent.disableClickPropagation(b);b.onclick=()=>BM.fit(map);return b};fit.addTo(map)};
  BM.set=function(map,pts){if(!map)return;if(!map.__bm)BM.chrome(map);const st=map.__bm;st.pts=pts||{};const el=st.hud;if(!el)return;
    if(pts&&pts.c&&pts.d){el.hidden=false;el.textContent='Driver is '+fmt(km(pts.c,pts.d))+' away'}else el.hidden=true};
  BM.fit=function(map){const st=map.__bm||{},p=[st.pts&&st.pts.d,st.pts&&st.pts.c].filter(Boolean);if(p.length>1)map.fitBounds(L.latLngBounds(p),{padding:[44,44],maxZoom:17});else if(p.length===1)map.setView(p[0],16)};
})();
