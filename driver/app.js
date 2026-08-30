let token=localStorage.getItem("basseDriverToken")||"";const $=x=>document.getElementById(x);const H=()=>token?{Authorization:"Bearer "+token}:{};let activeGps=null,maps={};
let leafletPromise=null;
function ensureLeaflet(){
  if(window.L&&window.L.maplibreGL)return Promise.resolve(window.L);
  if(leafletPromise)return leafletPromise;
  leafletPromise=new Promise(resolve=>{
    if(!document.querySelector('link[data-basse-leaflet]')){const css=document.createElement("link");css.rel="stylesheet";css.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";css.dataset.basseLeaflet="1";document.head.appendChild(css)}
    if(!document.querySelector('link[data-basse-maplibre]')){const css=document.createElement("link");css.rel="stylesheet";css.href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css";css.dataset.basseMaplibre="1";document.head.appendChild(css)}
    const load=(src,ok,fail)=>{const sc=document.createElement("script");sc.src=src;sc.onload=ok;sc.onerror=fail;document.head.appendChild(sc)};
    const finish=()=>resolve(window.L||null);
    const loadPlugin=()=>load("https://unpkg.com/@maplibre/maplibre-gl-leaflet/leaflet-maplibre-gl.js",finish,finish);
    const loadMapLibre=()=>load("https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js",loadPlugin,finish);
    const loadLeaflet=()=>load("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",loadMapLibre,()=>load("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js",loadMapLibre,finish));
    if(window.L){if(window.maplibregl)loadPlugin();else loadMapLibre()}else loadLeaflet();
  });return leafletPromise
}function mapMarker(label,type){return L.divIcon({className:`basse-map-marker ${type}-marker`,html:`<span></span><b>${label}</b>`,iconSize:[90,34],iconAnchor:[12,30]})}
function mapTiles(map){
  // Standard OpenStreetMap tiles; no API key required.
  return L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,keepBuffer:3,updateWhenIdle:true,updateWhenZooming:false,attribution:"© OpenStreetMap contributors"}).addTo(map);
}
function mercator(lat,lng,z){const n=Math.pow(2,z),x=(lng+180)/360*n,rad=lat*Math.PI/180,y=(1-Math.asinh(Math.tan(rad))/Math.PI)/2*n;return{x:x*256,y:y*256}};

function fallbackMapTileUrl(x,y,z){const n=Math.pow(2,z);return `https://tile.openstreetmap.org/${z}/${((x%n)+n)%n}/${Math.max(0,Math.min(n-1,y))}.png`}

function initFallbackMap(d){const el=$("map-"+d.id);if(!el)return;const clat=Number(d.customer_lat),clng=Number(d.customer_lng);if(!Number.isFinite(clat)||!Number.isFinite(clng))return;el.innerHTML='';el.classList.add('fallback-map');const wrap=document.createElement('div');wrap.className='fallback-map-inner';el.appendChild(wrap);const z=15,c=mercator(clat,clng,z),tx=Math.floor(c.x/256),ty=Math.floor(c.y/256);for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){const img=document.createElement('img');img.className='fallback-tile';img.src=fallbackMapTileUrl(tx+xx,ty+yy,z);img.style.left=((tx+xx)*256-c.x+el.clientWidth/2)+'px';img.style.top=((ty+yy)*256-c.y+el.clientHeight/2)+'px';wrap.appendChild(img)}const cust=document.createElement('div');cust.className='fallback-marker customer-fallback';cust.innerHTML=' <b>Customer</b>';wrap.appendChild(cust);const line=document.createElement('div');line.className='fallback-line';wrap.appendChild(line);const f={el,wrap,z,center:c,clat,clng,cust,driver:null,line};fallbackMaps[d.id]=f;positionFallback(f,Number(d.lat),Number(d.lng));setTimeout(()=>positionFallback(f,Number(d.lat),Number(d.lng)),200)}

function positionFallback(f,lat,lng){if(!f)return;const cp=mercator(f.clat,f.clng,f.z),ox=f.el.clientWidth/2-cp.x,oy=f.el.clientHeight/2-cp.y;const p=mercator(f.clat,f.clng,f.z);f.cust.style.left=(p.x+ox-18)+'px';f.cust.style.top=(p.y+oy-16)+'px';if(Number.isFinite(lat)&&Number.isFinite(lng)){const q=mercator(lat,lng,f.z);if(!f.driver){f.driver=document.createElement('div');f.driver.className='fallback-marker driver-fallback';f.driver.innerHTML=' <b>Driver</b>';f.wrap.appendChild(f.driver)}f.driver.style.left=(q.x+ox-18)+'px';f.driver.style.top=(q.y+oy-16)+'px';const cx=p.x+ox,cy=p.y+oy,dx=q.x+ox,dy=q.y+oy,dist=Math.hypot(dx-cx,dy-cy);f.line.style.left=cx+'px';f.line.style.top=cy+'px';f.line.style.width=dist+'px';f.line.style.transform='rotate('+Math.atan2(dy-cy,dx-cx)+'rad)';}}

function updateFallbackMap(id,lat,lng){const f=fallbackMaps[id];if(f)positionFallback(f,lat,lng)}

function removeFallbackMap(id){const f=fallbackMaps[id];if(f?.el)f.el.innerHTML='';delete fallbackMaps[id]}
const fallbackMaps={};
let deliveries=[];let lastStructure="";let lastGpsSentAt=0;let lastGpsSent={lat:null,lng:null};
async function api(u,o={}){const r=await fetch(u,{...o,headers:{...H(),...(o.headers||{})},cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Request failed");return d}
async function login(){const phone=$("phone").value.trim(),pin=$("pin").value.trim(),btn=$("loginBtn"),err=$("loginError");if(err){err.style.display="none";err.textContent=""}if(btn){btn.disabled=true;btn.textContent="LOGGING IN…"}try{const d=await api("/api/driver/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({whatsapp:phone,pin})});token=d.token;localStorage.setItem("basseDriverToken",token);start()}catch(e){if(err){err.textContent=e.message||"Login failed";err.style.display="block"}else alert(e.message)}finally{if(btn){btn.disabled=false;btn.textContent="LOGIN"}}}
function start(){$("login").classList.add("hidden");$("app").classList.remove("hidden");ensureLeaflet().then(()=>{load();ensureDriverMaps()});clearInterval(window.__driverTimer);window.__driverTimer=setInterval(load,12000)}
function structureSignature(ds){return ds.map(d=>[d.id,d.order_id,d.status,d.customer_lat,d.customer_lng,d.customer_name,d.location,d.product_name,d.quantity].join("|")).join(";;")}
async function load(){try{const me=await api("/api/driver/me");$("driverName").textContent=me.full_name;const ds=await api("/api/driver/deliveries");deliveries=ds;const sig=structureSignature(ds);if(sig!==lastStructure){Object.keys(maps).forEach(k=>{try{maps[k].map.remove()}catch{}delete maps[k]});$("list").innerHTML=ds.map(render).join("")||'<div class="card"><b>No deliveries assigned yet.</b><p class="muted">Admin will assign your deliveries here.</p></div>';lastStructure=sig;requestAnimationFrame(()=>setTimeout(ensureDriverMaps,80));setTimeout(ensureDriverMaps,350)}else{syncAllMaps(ds)}}catch(e){if(/login|driver/i.test(e.message))logout()}}
function render(d){const live=d.status==="ON_THE_WAY"||d.status==="ARRIVED";const hasCustomer=Number.isFinite(Number(d.customer_lat))&&Number.isFinite(Number(d.customer_lng));return `<div class="order-card"><div class="order-head"><b>#${esc(d.order_id)}</b><span class="status">${d.status.replaceAll("_"," ")}</span></div><h3>${esc(d.product_name)} × ${d.quantity}</h3><p class="muted">Customer: ${esc(d.customer_name||"Customer")}<br>WhatsApp: +${esc(d.whatsapp||"")}<br>Location: ${esc(d.location||"")}</p><div class="driver-map-head"><b> Delivery Map</b><small>${hasCustomer?(d.lat&&d.lng?"Live driver position":"Customer location saved"):"Customer GPS location not captured"}</small></div><div id="map-${d.id}" class="driver-map">${hasCustomer?"":"<div class=\"map-empty\"> Customer GPS was not captured for this order.<br><small>The written delivery location is shown above.</small></div>"}</div><div class="map-legend"><span> Customer</span><span> Driver</span><span>━━ Live distance line</span></div><div class="actions">${d.status==="ASSIGNED"?`<button onclick="setStatus(${d.id},'ACCEPTED')"> ACCEPT DELIVERY</button>`:""}${d.status==="ACCEPTED"?`<button onclick="setStatus(${d.id},'PICKED_UP')"> PICKED UP</button>`:""}${d.status==="PICKED_UP"?`<button onclick="setStatus(${d.id},'ON_THE_WAY')"> START DELIVERY & GPS</button>`:""}${live?`<button class="secondary" onclick="startGps(${d.id})"> SHARE LIVE LOCATION</button><button class="secondary" onclick="setStatus(${d.id},'ARRIVED')"> ARRIVED</button>`:""}${d.status==="ARRIVED"?`<button onclick="setStatus(${d.id},'DELIVERED');stopGps()"> MARK DELIVERED</button>`:""}</div></div>`}
function initMap(d){
  if(!window.L){initFallbackMap(d);return}
  const el=$("map-"+d.id);if(!el||!Number.isFinite(Number(d.customer_lat))||!Number.isFinite(Number(d.customer_lng)))return;
  try{
    if(maps[d.id]){try{maps[d.id].map.remove()}catch{}delete maps[d.id]}
    const clat=Number(d.customer_lat),clng=Number(d.customer_lng);
    const map=L.map(el,{zoomControl:true,scrollWheelZoom:false,dragging:true,doubleClickZoom:false,boxZoom:false,keyboard:true,preferCanvas:true,fadeAnimation:false,zoomAnimation:false,markerZoomAnimation:false}).setView([clat,clng],15);
    mapTileLayer(map);
    const customer=L.marker([clat,clng],{icon:L.divIcon({className:"basse-map-marker customer-marker",html:"<span></span><b>Customer</b>",iconSize:[82,30],iconAnchor:[12,28],zIndexOffset:500})}).addTo(map).bindPopup(" Customer delivery location");
    let driver=null,line=null;let initialFit=true;
    if(Number.isFinite(Number(d.lat))&&Number.isFinite(Number(d.lng))){driver=L.marker([Number(d.lat),Number(d.lng)],{icon:L.divIcon({className:"basse-map-marker driver-marker",html:"<span></span><b>Driver</b>",iconSize:[70,30],iconAnchor:[12,28],zIndexOffset:1000})}).addTo(map).bindPopup(" Driver");line=L.polyline([[Number(d.lat),Number(d.lng)],[clat,clng]],{weight:4,dashArray:"8 8"}).addTo(map);map.fitBounds(L.latLngBounds([[Number(d.lat),Number(d.lng)],[clat,clng]]),{padding:[25,25],maxZoom:16});initialFit=false}
    maps[d.id]={map,customer,driver,line,clat,clng,initialFit};
    const resize=()=>{try{map.invalidateSize({pan:false})}catch{}};
    map.whenReady(()=>{resize();setTimeout(resize,150);setTimeout(resize,500)});requestAnimationFrame(resize);
  }catch(e){console.warn("Driver Leaflet map init failed",e);delete maps[d.id];initFallbackMap(d)}
}
function syncMapData(d){const m=maps[d.id];if(!m||!window.L)return;requestAnimationFrame(()=>{try{m.map.invalidateSize({pan:false})}catch{}});const lat=Number(d.lat),lng=Number(d.lng);if(Number.isFinite(lat)&&Number.isFinite(lng)){if(!m.driver)m.driver=L.marker([lat,lng],{icon:L.divIcon({className:"basse-map-marker driver-marker",html:"<span></span><b>Driver</b>",iconSize:[70,30],iconAnchor:[12,28]})}).addTo(m.map).bindPopup(" Driver");else m.driver.setLatLng([lat,lng]);if(!m.line)m.line=L.polyline([[lat,lng],[m.clat,m.clng]],{weight:4,dashArray:"8 8"}).addTo(m.map);else m.line.setLatLngs([[lat,lng],[m.clat,m.clng]]);if(m.initialFit){m.map.fitBounds(L.latLngBounds([[lat,lng],[m.clat,m.clng]]),{padding:[25,25],maxZoom:16});m.initialFit=false}}}
function syncAllMaps(ds){const ids=new Set(ds.map(d=>String(d.id)));Object.keys(maps).forEach(k=>{if(!ids.has(String(k))){try{maps[k].map.remove()}catch{}delete maps[k]}});ds.forEach(d=>{if(Number.isFinite(Number(d.customer_lat))&&Number.isFinite(Number(d.customer_lng))){if(maps[d.id])syncMapData(d);else initMap(d)}})}
function ensureDriverMaps(){if(!window.L)return;syncAllMaps(deliveries);Object.values(maps).forEach(m=>{try{m.map.invalidateSize({pan:false})}catch{}})}
function mapTileLayer(map){
  if(window.L?.maplibreGL&&window.maplibregl){try{return L.maplibreGL({style:"https://tiles.openfreemap.org/styles/liberty"}).addTo(map)}catch(e){}}
  const providers=[
    ["https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",'© OpenStreetMap contributors © CARTO'],
    ["https://tile.openstreetmap.org/{z}/{x}/{y}.png",'© OpenStreetMap contributors']
  ];
  let layer=L.tileLayer(providers[0][0],{maxZoom:19,keepBuffer:2,updateWhenIdle:true,updateWhenZooming:false,attribution:providers[0][1]}).addTo(map);
  let switched=false;layer.on("tileerror",()=>{if(switched)return;switched=true;try{map.removeLayer(layer)}catch{}layer=L.tileLayer(providers[1][0],{maxZoom:19,keepBuffer:2,updateWhenIdle:true,updateWhenZooming:false,attribution:providers[1][1]}).addTo(map)});
  return layer;
}

function updateDriverMap(id,lat,lng){if(!window.L){updateFallbackMap(id,lat,lng);return}const m=maps[id];if(!m)return;if(!m.driver)m.driver=L.marker([lat,lng],{icon:L.divIcon({className:"basse-map-marker driver-marker",html:"<span></span><b>Driver</b>",iconSize:[70,30],iconAnchor:[12,28]})}).addTo(m.map).bindPopup(" Driver");else m.driver.setLatLng([lat,lng]);if(!m.line)m.line=L.polyline([[lat,lng],[m.clat,m.clng]],{weight:4,dashArray:"8 8"}).addTo(m.map);else m.line.setLatLngs([[lat,lng],[m.clat,m.clng]]);m.initialFit=false}

async function setStatus(id,status){try{await api("/api/driver/deliveries/"+id+"/status",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});if(status==="DELIVERED")stopGps();lastStructure="";await load();requestAnimationFrame(()=>setTimeout(ensureDriverMaps,100));if(status==="ON_THE_WAY")setTimeout(()=>{ensureDriverMaps();startGps(id)},180)}catch(e){alert(e.message)}}
function startGps(id){if(!navigator.geolocation){alert("This phone does not support GPS.");return}stopGps();lastGpsSentAt=0;lastGpsSent={lat:null,lng:null};$("gpsState").textContent="Getting fresh GPS location…";activeGps=navigator.geolocation.watchPosition(async p=>{const lat=p.coords.latitude,lng=p.coords.longitude,accuracy=Number(p.coords.accuracy||0);const inGambia=lat>=13.02&&lat<=13.90&&lng>=-16.90&&lng<=-13.70;if(!inGambia){$("gpsState").textContent="GPS looks incorrect/outside The Gambia • enable Precise Location";return}if(accuracy>1500){$("gpsState").textContent=`GPS accuracy is weak (±${Math.round(accuracy)}m) • waiting for a better reading…`;return}updateDriverMap(id,lat,lng);const now=Date.now();const moved=lastGpsSent.lat===null||Math.abs(lat-lastGpsSent.lat)>0.00002||Math.abs(lng-lastGpsSent.lng)>0.00002;if(now-lastGpsSentAt<3000&&!moved)return;lastGpsSentAt=now;lastGpsSent={lat,lng};try{await api("/api/driver/deliveries/"+id+"/location",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({lat,lng,accuracy})});$("gpsState").textContent=`Location sharing is ON • GPS ±${Math.round(accuracy||0)}m`;}catch(e){$("gpsState").textContent=e.message||"GPS update failed"}},e=>{$("gpsState").textContent="GPS permission/location unavailable • enable Precise Location";},{enableHighAccuracy:true,maximumAge:0,timeout:20000})}
function stopGps(){if(activeGps!==null&&navigator.geolocation){navigator.geolocation.clearWatch(activeGps);activeGps=null}$('gpsState').textContent="Location sharing is OFF"}
function logout(){stopGps();if(window.__driverTimer)clearInterval(window.__driverTimer);Object.values(maps).forEach(m=>{try{m.map.remove()}catch{}});maps={};localStorage.removeItem("basseDriverToken");token="";$("app").classList.add("hidden");$("login").classList.remove("hidden")}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
if(token)start();

window.addEventListener("pageshow",()=>setTimeout(ensureDriverMaps,150));document.addEventListener("visibilitychange",()=>{if(!document.hidden)setTimeout(ensureDriverMaps,150)});window.addEventListener("resize",()=>ensureDriverMaps());window.addEventListener("orientationchange",()=>setTimeout(ensureDriverMaps,300));
