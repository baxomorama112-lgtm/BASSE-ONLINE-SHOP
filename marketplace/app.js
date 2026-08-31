let category="All",selected=null,searchTimer=null,searchIndex=[];
// Anonymous live-viewer heartbeat for the Admin Dashboard.
const BASSE_VIEWER_ID=(()=>{try{let id=sessionStorage.getItem("basseViewerId");if(!id){id=(crypto.randomUUID?crypto.randomUUID():"v_"+Date.now()+"_"+Math.random().toString(36).slice(2));sessionStorage.setItem("basseViewerId",id)}return id}catch{return "v_"+Date.now()+"_"+Math.random().toString(36).slice(2)}})();
const BASSE_UA=(navigator.userAgent||"").toLowerCase();
const BASSE_VIEWER_SOURCE=(window.__BASSE_APP__===true||/android/.test(BASSE_UA)&&(/\bwv\b|version\/4\.0|; wv|webview/.test(BASSE_UA))||window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches)?"app":"website";
async function sendViewerHeartbeat(){try{await fetch("/api/presence/heartbeat",{method:"POST",headers:{"Content-Type":"application/json","X-BASSE-SOURCE":BASSE_VIEWER_SOURCE},body:JSON.stringify({id:BASSE_VIEWER_ID,source:BASSE_VIEWER_SOURCE}),cache:"no-store",keepalive:true})}catch{}}
function startViewerPresence(){sendViewerHeartbeat();clearInterval(window.__viewerPresence);window.__viewerPresence=setInterval(sendViewerHeartbeat,15000);window.addEventListener("pageshow",sendViewerHeartbeat);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")sendViewerHeartbeat()})}
window.addEventListener("pagehide",()=>{try{navigator.sendBeacon("/api/presence/leave",new Blob([JSON.stringify({id:BASSE_VIEWER_ID})],{type:"application/json"}))}catch{}});
const $=id=>document.getElementById(id),money=n=>"D"+Number(n||0).toLocaleString();
let checkoutGps={lat:null,lng:null,accuracy:null},selectedChoices=[],trackingMap=null,trackingPoll=null,trackingStream=null,trackingLocationWatch=null,trackingLastLocationSent=0,trackingPhone="",trackingOrderId="",trackingRefreshing=false,trackingLastEvent=0;
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
  });
  return leafletPromise;
}

function renderProductGrid(ps, silent=false){
  const grid=$("grid");
  const ids=ps.map(p=>String(p.id));
  const existing=[...grid.querySelectorAll(".product")];
  const existingIds=existing.map(x=>x.dataset.id);
  const sameOrder=existingIds.length===ids.length && existingIds.every((id,i)=>id===ids[i]);

  if(!sameOrder){
    grid.innerHTML=ps.length?ps.map(p=>`<article class="product" data-id="${p.id}" tabindex="0" role="button" onclick="buy(${p.id})" onkeydown="if(event.key==='Enter'||event.key===' ')buy(${p.id})"><div class="pic"><img src="${p.image||""}" alt="${esc(p.name)}" loading="eager"><span class="tag">${esc(p.category)}</span></div><div class="info"><h3>${esc(p.name)}</h3><div class="price">${money(p.price)}</div></div></article>`).join(""):`<div class="empty-search"><div></div><h3>No products found</h3><p>Try another product name or category.</p></div>`;
    return;
  }

  ps.forEach((p,i)=>{
    const el=existing[i];
    const img=el.querySelector("img"), tag=el.querySelector(".tag"), name=el.querySelector("h3"), price=el.querySelector(".price");
    if(img && p.image && img.getAttribute("src")!==String(p.image)) img.src=p.image;
    if(img) img.alt=p.name||"Product";
    if(tag) tag.textContent=p.category||"";
    if(name) name.textContent=p.name||"";
    if(price) price.textContent=money(p.price);
  });
}

function cachedCatalog(){try{const x=JSON.parse(localStorage.getItem("basseCatalogCache")||"[]");return Array.isArray(x)?x:[]}catch{return []}}
function saveCatalogCache(ps){try{if(Array.isArray(ps)&&ps.length)localStorage.setItem("basseCatalogCache",JSON.stringify(ps))}catch{}}
function filterCachedCatalog(){const q=$("search").value.trim().toLowerCase();return cachedCatalog().filter(p=>(category==="All"||p.category===category)&&(!q||(p.name+" "+p.category+" "+(p.description||"")).toLowerCase().includes(q)))}
async function loadProducts(silent=false){
  const cached=filterCachedCatalog();
  if(cached.length && !$("search").value.trim() && category==="All"){
    $("count").textContent=cached.length+" products";
    renderProductGrid(cached,true);
  }
  try{
    const r=await fetch(`/api/products?category=${encodeURIComponent(category)}&q=${encodeURIComponent($("search").value.trim())}`,{cache:"default"});
    if(!r.ok)throw new Error("Catalog unavailable");
    const ps=await r.json();
    if(category==="All"&&!$("search").value.trim())searchIndex=ps;
    saveCatalogCache(category==="All"&&!$("search").value.trim()?ps:[...cachedCatalog().filter(p=>!ps.some(x=>Number(x.id)===Number(p.id))),...ps]);
    $("count").textContent=ps.length+" products";
    renderProductGrid(ps,silent);
    $("clearSearch").classList.toggle("show",!!$("search").value.trim());
  }catch(e){
    const ps=filterCachedCatalog();
    if(ps.length){$("count").textContent=ps.length+" products";renderProductGrid(ps,true);}
    else if(!$("grid").querySelector(".product")) $("grid").innerHTML='<div class="empty-search"><div></div><h3>Shop temporarily unavailable</h3><p>Your saved catalog will return when the connection is restored.</p></div>';
  }
}
async function loadSearchIndex(){try{let r=await fetch("/api/products?category=All",{cache:"no-store"});if(!r.ok)throw Error();searchIndex=await r.json();saveCatalogCache(searchIndex)}catch{searchIndex=cachedCatalog()}}
function showSuggestions(){let term=$("search").value.trim().toLowerCase(),box=$("searchSuggestions");if(!term){box.classList.remove("show");box.innerHTML="";return}let matches=searchIndex.filter(p=>(p.name+" "+p.category+" "+(p.description||"")).toLowerCase().includes(term)).slice(0,7);box.innerHTML=matches.length?matches.map(p=>`<button type="button" class="suggest-item" onclick="pickSuggestion(${p.id})"><span class="suggest-icon"></span><span><b>${esc(p.name)}</b><small>${esc(p.category)} · ${money(p.price)}</small></span></button>`).join(""):"<div class=suggest-empty>No matching products</div>";box.classList.add("show")}
function pickSuggestion(id){let p=searchIndex.find(x=>x.id===id);if(!p)return;$("search").value=p.name;$("searchSuggestions").classList.remove("show");loadProducts();document.querySelector("#products").scrollIntoView({behavior:"auto",block:"start"})}
function runSearch(){clearTimeout(searchTimer);searchTimer=setTimeout(loadProducts,160);showSuggestions()}
function clearSearch(){$("search").value="";$('searchSuggestions').classList.remove("show");loadProducts();$('search').focus()}
function setCat(c,b){category=c;document.querySelectorAll(".cats button").forEach(x=>x.classList.remove("active"));b.classList.add("active");loadProducts();document.querySelector("#products").scrollIntoView({behavior:"auto",block:"start"})}

function normalizeProductImages(product){
  let imgs=[];
  try{imgs=JSON.parse(product.images||"[]")}catch(e){}
  if(!Array.isArray(imgs))imgs=[];
  if(product.image&&!imgs.includes(product.image))imgs.unshift(product.image);
  return imgs.length?imgs:[""];
}
function productOptions(product){try{return typeof product.options_json==="string"?JSON.parse(product.options_json||"{}"):((product.options_json&&typeof product.options_json==="object")?product.options_json:{})}catch{return {}}}
function optionValues(v){return String(v||"").split(",").map(x=>x.trim()).filter(Boolean)}
function renderOptionFields(product){const o=productOptions(product),defs=[["option_colors","Color"],["option_sizes","Size"],["option_phone_type","Phone Type / Brand"],["option_phone_model","Phone Model"],["option_storage","Storage / Variant"],["option_other","Other Option"]];return defs.filter(x=>optionValues(o[x[0]]).length).map(([key,label])=>`<label>${esc(label)}<select id="${key}"><option value="">Select ${esc(label)}</option>${optionValues(o[key]).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select></label>`).join("")}
function getSelectedOptionSummary(){const labels=[["option_colors","Color"],["option_sizes","Size"],["option_phone_type","Phone Type / Brand"],["option_phone_model","Phone Model"],["option_storage","Storage / Variant"],["option_other","Option"]];return labels.map(([id,label])=>{const e=$(id);return e&&e.value?label+": "+e.value:null}).filter(Boolean)}
function validateProductOptions(){const o=productOptions(selected);const defs=[["option_colors","Color"],["option_sizes","Size"],["option_phone_type","Phone Type / Brand"],["option_phone_model","Phone Model"],["option_storage","Storage / Variant"],["option_other","Option"]];for(const [id,label] of defs){if(optionValues(o[id]).length&&$(id)&&!$(id).value){toast("Please select a "+label+".");return false}}return true}
function renderProductDetail(product){
  selected=product;
  const imgs=normalizeProductImages(product);
  const thumbs=imgs.length>1?`<div class="thumbs" aria-label="Product photos">${imgs.map((im,i)=>`<button type="button" class="${i===0?'active':''}" onclick="pickImage(${i})" aria-label="View photo ${i+1}"><img src="${im}" alt=""></button>`).join("")}</div>`:"";
  $("modal").innerHTML=`<div class="sheet product-sheet product-sheet-modern">
    <button class="close modern-close" onclick="closeModal()" aria-label="Close">×</button>
    <div class="product-detail">
      <div class="gallery"><div class="main-photo-wrap"><img id="mainProductImage" src="${imgs[0]}" alt="${esc(product.name)}" loading="eager" decoding="async"></div>${thumbs}</div>
      <div class="detail-info modern-detail-info"><span class="tagline">${esc(product.category)}</span><h2>${esc(product.name)}</h2><div class="detail-price">${money(product.price)}</div><p class="muted">${esc(product.description||"Quality product from BASSE MARKET.")}</p>${renderOptionFields(product)?`<div class="product-options"><b>Choose options</b>${renderOptionFields(product)}</div>`:""}<div class="stock-note ${product.stock<1?'out':''}">${product.stock>0?` ${product.stock} available`:"Out of stock"}</div><div class="detail-actions"><button class="pay buy-now-modern" ${product.stock<1?"disabled":""} onclick="openCheckout()"><span></span><b>BUY NOW</b><span class="arrow">→</span></button></div><div class="product-hint">Secure checkout · Pay with Waychit</div></div>
    </div></div>`;
  window.__productImages=imgs;
  $("modal").classList.add("show");
}
async function preloadProductImages(images){
  const list=[...new Set((images||[]).filter(Boolean).map(String))];
  await Promise.all(list.map(src=>new Promise(resolve=>{
    const im=new Image();
    im.onload=()=>resolve(true);
    im.onerror=()=>resolve(false);
    im.src=src;
  })));
  return list;
}
function setProductGallery(images){
  const imgs=Array.isArray(images)&&images.length?images:[""];
  window.__productImages=imgs;
  const gallery=document.querySelector('.gallery');
  if(!gallery)return;
  let main=gallery.querySelector('#mainProductImage');
  if(!main){
    const wrap=document.createElement('div');wrap.className='main-photo-wrap';
    main=document.createElement('img');main.id='mainProductImage';wrap.appendChild(main);gallery.prepend(wrap);
  }
  main.alt=selected?.name||'Product';
  const oldThumbs=gallery.querySelector('.thumbs');
  const thumbs=document.createElement('div');thumbs.className='thumbs';thumbs.setAttribute('aria-label','Product photos');
  imgs.forEach((im,i)=>{
    const b=document.createElement('button');b.type='button';b.className=i===0?'active':'';b.setAttribute('aria-label',`View photo ${i+1}`);
    const t=document.createElement('img');t.src=im;t.alt='';t.decoding='async';b.appendChild(t);
    b.onclick=()=>{const src=window.__productImages?.[i];if(src){main.src=src;thumbs.querySelectorAll('button').forEach((x,n)=>x.classList.toggle('active',n===i))}};
    thumbs.appendChild(b);
  });
  main.src=imgs[0];main.decoding='async';main.loading='eager';
  if(oldThumbs)oldThumbs.replaceWith(thumbs);else if(imgs.length>1)gallery.appendChild(thumbs);
}
async function buy(id){
  // Open immediately from the cached catalog. Never rebuild an already-open product sheet.
  const cached=cachedCatalog().find(p=>Number(p.id)===Number(id)) || searchIndex.find(p=>Number(p.id)===Number(id));
  if(cached) renderProductDetail(cached);
  try{
    const r=await fetch(`/api/products/${id}`,{cache:'no-store'});
    const fresh=await r.json();
    if(!r.ok)throw new Error(fresh.error||'Product unavailable');
    saveCatalogCache((cachedCatalog().filter(p=>Number(p.id)!==Number(id))).concat([fresh]));
    if(cached && $('modal').classList.contains('show') && Number(selected?.id)===Number(id)){
      const oldImages=normalizeProductImages(selected);
      const newImages=normalizeProductImages(fresh);
      selected=fresh;
      const name=document.querySelector('.modern-detail-info h2');
      const price=document.querySelector('.modern-detail-info .detail-price');
      const desc=document.querySelector('.modern-detail-info .muted');
      const stock=document.querySelector('.modern-detail-info .stock-note');
      if(name)name.textContent=fresh.name;
      if(price)price.textContent=money(fresh.price);
      if(desc)desc.textContent=fresh.description||'Quality product from BASSE MARKET.';
      if(stock){stock.className='stock-note'+(fresh.stock<1?' out':'');stock.textContent=fresh.stock>0?` ${fresh.stock} available`:'Out of stock';}
      if(JSON.stringify(oldImages)!==JSON.stringify(newImages)){
        // Decode the new gallery before touching the visible gallery. This prevents the
        // image "come and go" blink when the live catalog refreshes after restore.
        await preloadProductImages(newImages);
        if($('modal').classList.contains('show') && Number(selected?.id)===Number(id))setProductGallery(newImages);
      }
    }else if(!cached){
      await preloadProductImages(normalizeProductImages(fresh));
      renderProductDetail(fresh);
    }
  }catch(e){if(!cached)toast(e.message)}
}
function pickImage(i){let im=window.__productImages?.[i];if(im){$("mainProductImage").src=im;document.querySelectorAll(".thumbs button").forEach((b,n)=>b.classList.toggle("active",n===i))}}
function openCheckout(){
  if(!selected)return;
  if(!validateProductOptions())return;
  selectedChoices=getSelectedOptionSummary();
  const savedCustomer=JSON.parse(localStorage.getItem("basseCustomer")||"null");
  const savedName=esc(savedCustomer?.name||"");
  const savedPhone=esc(String(savedCustomer?.phone||"").replace(/\D/g,"").replace(/^220/,""));
  checkoutGps={lat:null,lng:null,accuracy:null};
  $("modal").innerHTML=`<div class="sheet checkout-sheet"><button class="close" onclick="buy(${selected.id})">←</button><div class="checkout-head"><span class="mini-bag" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M12 18h24l-2 23H14z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M18 18v-4a6 6 0 0 1 12 0v4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></span><div><small>SECURE CHECKOUT</small><h2>Your order</h2></div></div><p class="muted">${esc(selected.name)}</p><div class="selected-options-summary" id="selectedOptionsSummary"></div><div class="form"><label>Quantity</label><div class="qty-row"><button type="button" onclick="changeQty(-1)">−</button><input id="qty" type="number" min="1" max="${selected.stock}" value="1"><button type="button" onclick="changeQty(1)">+</button></div><label>Full Name</label><input id="name" autocomplete="name" placeholder="Your name" value="${savedName}"><label>WhatsApp Number</label><input id="phone" inputmode="numeric" autocomplete="tel" placeholder="7XXXXXX" value="${savedPhone}"><small>+220 will be added automatically. No account/login is required.</small><label>Delivery Area</label><select id="loc"><option>Basse</option><option>Bansang</option><option>Fatoto</option><option>Other</option></select><button type="button" class="location-btn" onclick="captureCheckoutLocation()"> USE MY CURRENT GPS LOCATION</button><small id="checkoutGpsState" class="gps-note">GPS is optional. Your written delivery area can still be used.</small><div class="summary"><div class="row"><span>Product</span><b>${money(selected.price)}</b></div><div class="row total-row"><span>Total</span><b id="total">${money(selected.price)}</b></div></div><button class="pay pulse" onclick="placeOrder()"> PAY WITH WAYCHIT <span>→</span></button><div class="secure-note"> Secure checkout · You will be redirected to Waychit</div></div></div>`;
  $("modal").classList.add("show");$("qty").oninput=updateTotal;$("phone").addEventListener("keydown",e=>{if(e.key==="Enter")placeOrder()});
}
function changeQty(d){let q=Math.max(1,Math.min(selected.stock,(+$('qty').value||1)+d));$('qty').value=q;updateTotal()}
function updateTotal(){$("total").textContent=money(selected.price*Math.max(1,Math.min(selected.stock,+$("qty").value||1)))}


function storeInitials(name){
  const parts=String(name||"BASSE").trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0,2).map(x=>x[0]).join("")||"BS").toUpperCase();
}
function storeCoverClass(id){return "store-cover c"+(Number(id)%6)}
async function openStores(){
  const modal=$("modal");
  modal.innerHTML=`<div class="sheet stores-sheet"><button class="close" onclick="closeModal()">×</button>
    <div class="stores-heading"><div><small>BASSE MARKETPLACE</small><h2>All Stores</h2><p>Discover trusted local stores and shop directly from them.</p></div><span class="store-heading-icon"></span></div>
    <div id="storeGrid" class="store-grid"><div class="store-loading">Loading stores…</div></div></div>`;
  modal.classList.add("show");
  try{
    const r=await fetch("/api/stores",{cache:"no-store"});const stores=await r.json();if(!r.ok)throw Error(stores.error||"Could not load stores");
    const grid=$("storeGrid");
    grid.innerHTML=stores.length?stores.map(s=>`
      <article class="store-card-pro" tabindex="0" role="button" onclick="openStore(${s.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openStore(${s.id})}">
        <div class="${storeCoverClass(s.id)}">
          <div class="store-cover-badge">VERIFIED STORE</div>
          <div class="store-logo">${esc(storeInitials(s.business_name))}</div>
        </div>
        <div class="store-card-body">
          <div class="store-title-row"><div><h3>${esc(s.business_name||"BASSE Store")}</h3><span>${esc(s.category||"Local Store")}</span></div><span class="store-chevron">›</span></div>
          <p>${esc(s.description||"Shop quality products from this local BASSE vendor.")}</p>
          <div class="store-meta"><span> ${s.product_count||0} products</span><span> ${esc(s.location||"Basse")}</span></div>
          <button type="button" class="view-store-btn" onclick="event.stopPropagation();openStore(${s.id})">VIEW STORE <span>→</span></button>
        </div>
      </article>`).join(""):`<div class="empty-search"><div></div><h3>No stores yet</h3><p>Approved vendors will appear here automatically.</p></div>`;
  }catch(e){$("storeGrid").innerHTML=`<div class="empty-search"><div></div><h3>Stores unavailable</h3><p>${esc(e.message||"Please try again.")}</p><button class="view-store-btn" onclick="openStores()">TRY AGAIN</button></div>`}
}
async function openStore(id){
  const modal=$("modal");
  modal.innerHTML=`<div class="sheet stores-sheet"><button class="close" onclick="openStores()">←</button><div id="storeDetail"><div class="store-loading">Loading store…</div></div></div>`;
  modal.classList.add("show");
  try{
    const r=await fetch("/api/stores/"+id,{cache:"no-store"});const s=await r.json();if(!r.ok)throw Error(s.error||"Store unavailable");
    const initials=storeInitials(s.business_name);
    $("storeDetail").innerHTML=`<div class="store-detail-head"><div class="${storeCoverClass(s.id)} detail-cover"><div class="store-logo big">${esc(initials)}</div></div><div class="store-detail-info"><small>VERIFIED BASSE STORE</small><h2>${esc(s.business_name)}</h2><p>${esc(s.description||s.category||"Local vendor")}</p><div class="store-meta"><span> ${esc(s.location||"Basse")}</span><span> ${s.products.length} products</span></div></div></div>
      <div class="store-products-head"><h3>Products</h3><span>${s.products.length} available</span></div>
      <div class="store-products">${s.products.length?s.products.map(p=>`<article class="product" data-id="${p.id}" tabindex="0" role="button" onclick="buy(${p.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();buy(${p.id})}"><div class="pic"><img src="${p.image||""}" alt="${esc(p.name)}" loading="eager"><span class="tag">${esc(p.category)}</span></div><div class="info"><h3>${esc(p.name)}</h3><div class="price">${money(p.price)}</div><button class="buy" type="button" onclick="event.stopPropagation();buy(${p.id})">VIEW PRODUCT →</button></div></article>`).join(""):`<div class="empty-search"><div></div><h3>No products yet</h3><p>This store has no approved products available right now.</p></div>`}</div>`;
  }catch(e){$("storeDetail").innerHTML=`<div class="empty-search"><div></div><h3>Store unavailable</h3><p>${esc(e.message||"Please try again.")}</p><button class="view-store-btn" onclick="openStore(${id})">TRY AGAIN</button></div>`}
}
function trackOrderPrompt(){
  const modal=$("modal");
  modal.innerHTML=`<div class="sheet form-sheet tracking-entry-sheet"><button class="close" onclick="closeModal()">×</button><div class="checkout-head"><span class="mini-bag" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M12 18h24l-2 23H14z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M18 18v-4a6 6 0 0 1 12 0v4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></span><div><small>BASSE DELIVERY</small><h2>Track Your Order</h2></div></div><p class="muted">No account is required. Enter the order number and the WhatsApp number used when you placed the order.</p><div class="form"><label>Order Number</label><input id="trackOrderId" autocomplete="off" placeholder="BOS-AB12CD34"><label>WhatsApp Number</label><input id="trackPhone" inputmode="numeric" autocomplete="tel" placeholder="7XXXXXX"><button class="pay" type="button" onclick="submitGuestTracking()"> TRACK ORDER <span>→</span></button><button class="secondary-btn" type="button" onclick="closeModal()">CANCEL</button></div></div>`;
  modal.classList.add('show');
  const orderInput=$("trackOrderId"), phoneInput=$("trackPhone");
  [orderInput,phoneInput].forEach(input=>input&&input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();submitGuestTracking()}}));
}
async function submitGuestTracking(){
  const id=String($("trackOrderId")?.value||"").trim().toUpperCase().replace(/\s+/g,"");
  const phone=normalizeBassePhone($("trackPhone")?.value||"");
  const btn=document.querySelector('.tracking-entry-sheet .pay');
  if(!id)return toast("Enter your order number.");
  if(phone.length<6)return toast("Enter the WhatsApp number used for the order.");
  if(btn){btn.disabled=true;btn.dataset.originalText=btn.innerHTML;btn.innerHTML=" CHECKING ORDER…"}
  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10000);
    const r=await fetch(`/api/order/${encodeURIComponent(id)}/tracking?phone=${encodeURIComponent(phone)}`,{cache:"no-store",signal:controller.signal});
    clearTimeout(timeout);
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.error||"Order not found. Check the order number and WhatsApp number.");
    closeModal();
    await openOrderTracking(d.order?.id||id,phone);
  }catch(e){
    toast(e.name==="AbortError"?"The server took too long to respond. Please try again.":(e.message||"Could not find this order."));
  }finally{
    if(btn){btn.disabled=false;btn.innerHTML=btn.dataset.originalText||' TRACK ORDER <span>→</span>'}
  }
}
function normalizeBassePhone(value){
  let n=String(value||"").replace(/\D/g,"");
  if(n.startsWith("220"))n=n.slice(3);
  return n.slice(-9);
}
function captureTrackingLocation(){
  if(!trackingOrderId)return;
  if(!navigator.geolocation){toast("This phone/browser does not support GPS.");return}
  const btn=document.querySelector('.live-location-btn');
  if(btn){btn.disabled=true;btn.dataset.originalText=btn.innerHTML;btn.innerHTML=" GETTING YOUR LOCATION…"}
  const readings=[];let watcher=null,done=false;const finish=async()=>{if(done)return;done=true;if(watcher!==null)navigator.geolocation.clearWatch(watcher);const best=readings.sort((a,b)=>a.accuracy-b.accuracy)[0];if(!best)throw Error("Could not get a GPS reading. Please enable Precise Location and try again.");
    try{
      const r=await fetch(`/api/order/${encodeURIComponent(trackingOrderId)}/customer-location`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone:trackingPhone,lat:best.lat,lng:best.lng,accuracy:best.accuracy})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw Error(d.error||"Could not save your location.");
      toast("Your live location was updated.");
      await refreshTracking(trackingOrderId,false);
    }catch(e){toast(e.message||"Could not update your location.");}
    finally{if(btn){btn.disabled=false;btn.innerHTML=btn.dataset.originalText||' UPDATE MY LOCATION'}}
  };
  const onPos=p=>{const a=Number(p.coords.accuracy||999999);if(Number.isFinite(a)&&a<5000)readings.push({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:a});if(readings.length>=3||a<=80)finish()};
  watcher=navigator.geolocation.watchPosition(onPos,()=>{if(!readings.length){if(btn){btn.disabled=false;btn.innerHTML=btn.dataset.originalText||' VIEW LIVE DRIVER LOCATION'}toast("Location permission/GPS unavailable. Enable Precise Location and try again.")}}, {enableHighAccuracy:true,maximumAge:0,timeout:20000});
  setTimeout(finish,6000);
}
async function openOrderTracking(id,phone=""){
  stopTrackingPolling();
  trackingPhone=normalizeBassePhone(phone);
  trackingOrderId=String(id||"");
  const modal=$("modal");
  modal.innerHTML=`<div class="sheet tracking-sheet"><button class="close" onclick="closeModal()">×</button><div class="checkout-head"><span class="mini-bag" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M12 18h24l-2 23H14z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M18 18v-4a6 6 0 0 1 12 0v4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></span><div><small>BASSE DELIVERY</small><h2>Track Order</h2></div></div><div id="trackingBody"><div class="store-loading">Loading tracking…</div></div></div>`;
  modal.classList.add("show");
  const mapReady=ensureLeaflet();
  await refreshTracking(id,true);
  await mapReady;
  await refreshTracking(id,false);
  // The modal is fully laid out now; force Leaflet to recalculate its size.
  setTimeout(()=>{try{if(trackingMap){trackingMap.invalidateSize({pan:false});if(trackingMap.__latest)renderTrackingMapContent(trackingMap.__latest.customerLat,trackingMap.__latest.customerLng,trackingMap.__latest.driverLat,trackingMap.__latest.driverLng)}}catch{}},120);
  // Start live driver refresh immediately. The customer location is also watched
  // automatically while this tracking window is open, so the customer does not
  // have to keep pressing UPDATE MY LOCATION.
  startCustomerLocationWatch();
  startTrackingLiveStream(id);
  trackingPoll=setInterval(()=>{if(document.visibilityState!=="hidden")refreshTracking(id,false)},3000);
}
function startCustomerLocationWatch(){
  if(trackingLocationWatch!==null || !trackingOrderId || !trackingPhone || !navigator.geolocation)return;
  const send=async(pos)=>{
    const accuracy=Number(pos.coords.accuracy||999999);
    if(!Number.isFinite(accuracy)||accuracy>1500)return;
    const now=Date.now();
    if(now-trackingLastLocationSent<8000)return;
    trackingLastLocationSent=now;
    try{
      const r=await fetch(`/api/order/${encodeURIComponent(trackingOrderId)}/customer-location`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone:trackingPhone,lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy}),cache:"no-store"});
      if(r.ok)await refreshTracking(trackingOrderId,false);
    }catch{}
  };
  try{
    trackingLocationWatch=navigator.geolocation.watchPosition(send,()=>{}, {enableHighAccuracy:true,maximumAge:5000,timeout:15000});
  }catch{trackingLocationWatch=null}
}
function trackingDistanceKm(a,b,c,d){const R=6371,rad=x=>x*Math.PI/180;const p1=rad(a),p2=rad(c),dp=rad(c-a),dl=rad(d-b);const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))}
function startTrackingLiveStream(orderId){
  if(trackingStream){try{trackingStream.close()}catch{}trackingStream=null}
  if(!window.EventSource)return;
  try{
    const es=new EventSource("/api/live");
    const handle=(ev)=>{try{const p=JSON.parse(ev.data||"{}");if(String(p.orderId||"")===String(orderId)){trackingLastEvent=Date.now();if(document.visibilityState!=="hidden")refreshTracking(orderId,false)}}catch{}};
    es.addEventListener("orders",handle);
    es.onerror=()=>{};
    trackingStream=es;
  }catch{}
}

async function viewLiveDriverLocation(){
  if(!trackingOrderId)return toast("Enter your order number first.");
  const btn=document.querySelector('.live-location-refresh');
  if(btn){btn.disabled=true;btn.dataset.originalText=btn.innerHTML;btn.innerHTML=' CHECKING LIVE GPS…'}
  refreshTracking(trackingOrderId,false).then(()=>{
    const m=trackingMap;
    if(m){
      const points=[];
      if(m.__driver)points.push(m.__driver.getLatLng());
      if(m.__customer)points.push(m.__customer.getLatLng());
      if(points.length>1)m.fitBounds(L.latLngBounds(points),{padding:[30,30],maxZoom:17});
      else if(points.length===1)m.setView(points[0],16);
      m.invalidateSize({pan:false});
    }
    const note=document.querySelector('#trackingNote');
    const hasDriver=!!trackingMap?.__driver;
    if(!hasDriver)toast('The driver has not shared a fresh GPS location yet. Keep tracking open and try again.');
    else toast('Driver location refreshed.');
  }).catch(()=>{}).finally(()=>{if(btn){btn.disabled=false;btn.innerHTML=btn.dataset.originalText||' VIEW LIVE DRIVER LOCATION'}});
}

async function refreshTracking(id,initial){
  if(trackingRefreshing)return;
  trackingRefreshing=true;
  try{
    const r=await fetch("/api/order/"+encodeURIComponent(id)+"/tracking"+(trackingPhone?"?phone="+encodeURIComponent(trackingPhone):""),{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"Order not found");
    const status=d.delivery?.status||d.order.order_status||"NEW";
    const steps=["NEW","READY","ACCEPTED","PICKED_UP","ON_THE_WAY","ARRIVED","DELIVERED"];
    const idx=Math.max(0,steps.indexOf(status));
    const hasCustomer=Number.isFinite(Number(d.order.customer_lat))&&Number.isFinite(Number(d.order.customer_lng));
    const hasDriver=Number.isFinite(Number(d.delivery?.lat))&&Number.isFinite(Number(d.delivery?.lng));
    if(initial){
      const map=`<div class="live-map-wrap"><div id="customerMap" class="customer-map"><div class="map-placeholder"><br><b>Live delivery map</b><small>Loading map…</small></div></div></div>`;
      $("trackingBody").innerHTML=`<div class="tracking-card"><div class="track-top"><b>#${esc(d.order.id)}</b><span id="trackingStatus" class="badge"></span></div><h3 id="trackingProduct"></h3><p id="trackingLocation"></p>${map}<div class="tracking-location-actions"><button type="button" class="live-location-btn" onclick="captureTrackingLocation()"><span aria-hidden="true">⌖</span> UPDATE MY LOCATION</button><button type="button" class="live-location-refresh" onclick="viewLiveDriverLocation()"><span aria-hidden="true">◉</span> VIEW LIVE DRIVER LOCATION</button></div><div class="timeline" id="trackingTimeline"></div><p class="muted" id="trackingNote"></p></div>`;
    }
    const statusEl=$("trackingStatus"),productEl=$("trackingProduct"),locationEl=$("trackingLocation"),timelineEl=$("trackingTimeline"),noteEl=$("trackingNote");
    if(!statusEl||!productEl||!locationEl||!timelineEl||!noteEl)return;
    statusEl.textContent=status.replaceAll("_"," ");productEl.textContent=`${d.order.product_name} × ${d.order.quantity}`;locationEl.textContent=(d.order.location||"Delivery location pending")+(hasCustomer?" ·  GPS location saved":"");
    timelineEl.innerHTML=steps.map((x,i)=>`<div class="timeline-step ${i<=idx?"done":""}"><span>${i<=idx?"":"•"}</span><b>${x.replaceAll("_"," ")}</b></div>`).join("");
    const distance=hasCustomer&&hasDriver?trackingDistanceKm(Number(d.delivery.lat),Number(d.delivery.lng),Number(d.order.customer_lat),Number(d.order.customer_lng)):null;
    noteEl.innerHTML=hasDriver?`Driver: <b>${esc(d.delivery.driver_name||"Assigned driver")}</b> · ${distance!==null?`<b>${distance<1?Math.round(distance*1000)+" m":distance.toFixed(1)+" km"}</b> away · `:""}${d.delivery.last_seen?`last update ${new Date(d.delivery.last_seen).toLocaleTimeString()}`:"live"}`:(d.delivery?.driver_name?`Driver: <b>${esc(d.delivery.driver_name)}</b> · Waiting for GPS. Keep this screen open and tap the live-location button to refresh.`:"A driver will be assigned after your order is confirmed.");
    if(window.L)loadTrackingMap(d.order.customer_lat,d.order.customer_lng,d.delivery?.lat,d.delivery?.lng);
    if(status==="DELIVERED")stopTrackingPolling();
  }catch(e){if(initial)$("trackingBody").innerHTML=`<div class="empty-search"><div></div><h3>Order not found</h3><p>${esc(e.message||"Check your order number.")}</p></div>`}
  finally{trackingRefreshing=false}
}
function mapMarker(label,type){
  return L.divIcon({className:`basse-map-marker ${type}-marker`,html:`<span></span><b>${label}</b>`,iconSize:[90,34],iconAnchor:[12,30]});
}
function mapTiles(map){
  const style="https://tiles.openfreemap.org/styles/liberty";
  if(window.L?.maplibreGL&&window.maplibregl){
    try{return L.maplibreGL({style}).addTo(map)}catch(e){}
  }
  const providers=[
    ["https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",'© OpenStreetMap contributors © CARTO'],
    ["https://tile.openstreetmap.org/{z}/{x}/{y}.png",'© OpenStreetMap contributors']
  ];
  let layer=L.tileLayer(providers[0][0],{maxZoom:19,keepBuffer:2,updateWhenIdle:true,updateWhenZooming:false,attribution:providers[0][1]}).addTo(map);
  let switched=false;layer.on("tileerror",()=>{if(switched)return;switched=true;try{map.removeLayer(layer)}catch{};layer=L.tileLayer(providers[1][0],{maxZoom:19,keepBuffer:2,updateWhenIdle:true,updateWhenZooming:false,attribution:providers[1][1]}).addTo(map)});
  return layer;
}
function renderTrackingMapContent(customerLat,customerLng,driverLat,driverLng){
  const m=trackingMap;if(!m)return;
  const clat=Number(customerLat),clng=Number(customerLng),dlat=Number(driverLat),dlng=Number(driverLng);
  const hc=Number.isFinite(clat)&&Number.isFinite(clng),hd=Number.isFinite(dlat)&&Number.isFinite(dlng);
  if(hc){
    if(!m.__customer)m.__customer=L.marker([clat,clng],{icon:mapMarker("Customer","customer"),zIndexOffset:500}).addTo(m);
    else m.__customer.setLatLng([clat,clng]);
  }
  if(hd){
    if(!m.__driver)m.__driver=L.marker([dlat,dlng],{icon:mapMarker("Driver","driver"),zIndexOffset:1200}).addTo(m);
    else m.__driver.setLatLng([dlat,dlng]);
  }
  if(hc&&hd){
    const points=[[dlat,dlng],[clat,clng]];
    if(!m.__line)m.__line=L.polyline(points,{weight:4,dashArray:"9 8"}).addTo(m);else m.__line.setLatLngs(points);
    if(m.__initialFit){m.fitBounds(L.latLngBounds(points),{padding:[25,25],maxZoom:16});m.__initialFit=false}
  }else if(hc&&m.__initialFit){m.setView([clat,clng],15);m.__initialFit=false}
  requestAnimationFrame(()=>{try{m.invalidateSize({pan:false})}catch{}});
}
function showLiveDriverLocation(){
  if(!trackingOrderId)return toast("Enter your order number first.");
  const btn=document.querySelector('.live-location-refresh');
  if(btn){btn.disabled=true;btn.dataset.originalText=btn.innerHTML;btn.innerHTML=' CHECKING LIVE GPS…'}
  refreshTracking(trackingOrderId,false).then(()=>{
    const m=trackingMap;
    if(m){
      const points=[];
      if(m.__driver)points.push(m.__driver.getLatLng());
      if(m.__customer)points.push(m.__customer.getLatLng());
      if(points.length>1)m.fitBounds(L.latLngBounds(points),{padding:[30,30],maxZoom:17});
      else if(points.length===1)m.setView(points[0],16);
      m.invalidateSize({pan:false});
    }
    const note=document.querySelector('#trackingNote');
    const hasDriver=!!trackingMap?.__driver;
    if(!hasDriver)toast('The driver has not shared a fresh GPS location yet. Keep tracking open and try again.');
    else toast('Driver location refreshed.');
  }).catch(()=>{}).finally(()=>{if(btn){btn.disabled=false;btn.innerHTML=btn.dataset.originalText||' VIEW LIVE DRIVER LOCATION'}});
}

function loadTrackingMap(customerLat,customerLng,driverLat,driverLng){
  const el=$("customerMap");if(!el)return;
  const hasCustomer=Number.isFinite(Number(customerLat))&&Number.isFinite(Number(customerLng));
  const hasDriver=Number.isFinite(Number(driverLat))&&Number.isFinite(Number(driverLng));
  if(!window.L){
    el.innerHTML='<div class="map-placeholder"><br><b>Map service is loading</b><small>Please wait a moment and tap Track Order again.</small></div>';
    return;
  }
  if(!hasCustomer&&!hasDriver){
    el.innerHTML='<div class="map-placeholder"><br><b>Waiting for location</b><small>The order has no GPS location yet.</small></div>';
    if(trackingMap){try{trackingMap.remove()}catch{}trackingMap=null}return;
  }
  const clat=Number(customerLat),clng=Number(customerLng),dlat=Number(driverLat),dlng=Number(driverLng);
  if(!trackingMap){
    el.innerHTML="";
    const center=[hasDriver?dlat:clat,hasDriver?dlng:clng];
    trackingMap=L.map(el,{zoomControl:true,scrollWheelZoom:false,dragging:true,doubleClickZoom:false,boxZoom:false,keyboard:true,preferCanvas:true,fadeAnimation:false,zoomAnimation:true,markerZoomAnimation:false}).setView(center,15);
    mapTiles(trackingMap);
    trackingMap.__customer=null;trackingMap.__driver=null;trackingMap.__line=null;trackingMap.__initialFit=true;
  }
  const m=trackingMap;
  if(hasCustomer){
    if(!m.__customer)m.__customer=L.marker([clat,clng],{icon:L.divIcon({className:"basse-map-marker customer-marker",html:"<span></span><b>Customer</b>",iconSize:[82,30],iconAnchor:[12,28],zIndexOffset:500})}).addTo(m).bindPopup(" Your delivery location");
    else m.__customer.setLatLng([clat,clng]);
  }
  if(hasDriver){
    if(!m.__driver)m.__driver=L.marker([dlat,dlng],{icon:L.divIcon({className:"basse-map-marker driver-marker",html:"<span></span><b>Driver</b>",iconSize:[70,30],iconAnchor:[12,28],zIndexOffset:1200})}).addTo(m).bindPopup(" Driver — live");
    else m.__driver.setLatLng([dlat,dlng]);
  }
  if(hasCustomer&&hasDriver){
    const points=[[dlat,dlng],[clat,clng]];
    if(!m.__line)m.__line=L.polyline(points,{weight:4,dashArray:"9 8"}).addTo(m);else m.__line.setLatLngs(points);
    if(m.__initialFit){m.fitBounds(L.latLngBounds(points),{padding:[25,25],maxZoom:16});m.__initialFit=false}
  }else if(hasCustomer&&m.__initialFit){m.setView([clat,clng],15);m.__initialFit=false}
  requestAnimationFrame(()=>{try{m.invalidateSize({pan:false})}catch(e){}});
}
function stopTrackingPolling(){
  if(trackingPoll){clearInterval(trackingPoll);trackingPoll=null}
  if(trackingStream){try{trackingStream.close()}catch{}trackingStream=null}
  if(trackingLocationWatch!==null){try{navigator.geolocation.clearWatch(trackingLocationWatch)}catch{}trackingLocationWatch=null}
  trackingLastLocationSent=0;
  if(trackingMap){try{trackingMap.remove()}catch{}trackingMap=null}
  trackingPhone="";trackingOrderId="";trackingRefreshing=false;
}

function captureCheckoutLocation(){
  const state=$("checkoutGpsState");
  if(!navigator.geolocation){if(state)state.textContent="This phone/browser does not support GPS.";return}
  if(state)state.textContent="Getting your location…";
  navigator.geolocation.getCurrentPosition(p=>{checkoutGps={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy};if(state)state.textContent=` GPS location saved (±${Math.round(p.coords.accuracy||0)}m).`;},()=>{if(state)state.textContent="GPS permission was not granted. You can continue with the delivery area."},{enableHighAccuracy:true,maximumAge:10000,timeout:15000});
}

async function placeOrder(){
  let q=Math.max(1,Math.min(selected.stock,+$("qty").value||1)),phone=$("phone").value.replace(/\D/g,"").replace(/^220/,"");
  if(!$('name').value.trim())return toast("Please enter your full name.");
  if(phone.length<6)return toast("Please enter a valid WhatsApp number.");
  let btn=document.querySelector('.pay');if(btn){btn.disabled=true;btn.innerHTML=" CONNECTING TO WAYCHIT…"}
  try{
    let r=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:selected.id,quantity:q,name:$('name').value.trim(),whatsapp:phone,location:$('loc').value,customerLat:checkoutGps.lat,customerLng:checkoutGps.lng,customerAccuracy:checkoutGps.accuracy,options:selectedChoices})});
    let d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||"Could not create your order.");
    localStorage.setItem("basseLastOrder",JSON.stringify(d.order));
    localStorage.setItem("bassePendingPayment",JSON.stringify({orderId:d.order.id,startedAt:Date.now(),paymentMode:d.paymentMode||"dynamic"}));
    if(d.paymentUrl){
      localStorage.setItem("bassePaymentMode",d.paymentMode||"dynamic");
      if(d.paymentMode==="fallback") toast("Opening Waychit checkout…");
      setTimeout(()=>window.location.href=d.paymentUrl,120);
      return;
    }
    throw new Error(d.paymentError||"Waychit payment could not be started.");
  }catch(e){if(btn){btn.disabled=false;btn.innerHTML=" PAY WITH WAYCHIT <span>→</span>"}showReturn({id:"",total:selected.price*q,whatsappSupport:""},"",false,"",e.message||"Payment could not be started.")}
}
function receiptMessage(o){return `Hello BASSE ONLINE SHOP 

I have paid for my order.

Order: ${o.id}
Product: ${o.product_name} × ${o.quantity}
Total: ${money(o.total)}
Location: ${o.location}
Customer WhatsApp: +${o.whatsapp}
Payment: PAID

Please confirm my order. Thank you.`}
function showReturn(o,msg,paid,adminWhatsApp,note=""){
  let target=String(adminWhatsApp||o.whatsappSupport||"").replace(/\D/g,"");
  let href=target?`https://wa.me/${target}?text=${encodeURIComponent(msg||receiptMessage(o))}`:"#";
  $("modal").innerHTML=`<div class="sheet return-sheet"><button class="close" onclick="closeModal()">×</button><div class="result-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="m10 25 9 9 19-20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div><h2>${paid?"Payment successful!":"Order received"}</h2><p>${paid?"Your payment has been confirmed.":note||"Your order has been received."}</p>${o.id?`<div class="summary"><div class="row"><span>Order</span><b>${esc(o.id)}</b></div><div class="row"><span>Total</span><b>${money(o.total)}</b></div><div class="row"><span>Payment</span><b>${paid?"PAID":"PENDING"}</b></div></div>`:""}${target&&o.id?`<a class="whats" href="${href}" target="_blank" rel="noopener"> SEND ORDER TO BASSE SHOP</a>`:""}${o.id?`<button class="secondary-btn" onclick="openOrderTracking('${o.id}','${esc(o.whatsapp||'')}')"> TRACK ORDER</button>`:""}<button class="secondary-btn" onclick="closeModal()">CONTINUE SHOPPING</button></div>`;$('modal').classList.add('show')
}
async function waitForPayment(id,attempt=0){
  try{
    let r=await fetch("/api/order/"+encodeURIComponent(id),{cache:"no-store"});
    let o=await r.json();
    if(o.payment_status==="PAID"){
      localStorage.removeItem("bassePendingPayment");
      return showReturn(o,"",true,o.whatsappSupport);
    }
    if(o.payment_status==="CANCELLED"||o.payment_status==="REFUNDED"){
      localStorage.removeItem("bassePendingPayment");
      return showReturn(o,"",false,o.whatsappSupport,"This payment is no longer active.");
    }
    if(attempt<30)return setTimeout(()=>waitForPayment(id,attempt+1),2000);
    showReturn(o,"",false,o.whatsappSupport,"Payment is still being verified. If you already paid, your order will update automatically when Waychit confirms it.");
  }catch{
    if(attempt<30)return setTimeout(()=>waitForPayment(id,attempt+1),2000);
    showReturn({id,total:0},"",false,"","We could not verify the payment right now. Please try again.");
  }
}
function handleReturn(){
  let u=new URLSearchParams(location.search),st=u.get("payment"),id=u.get("order");
  if(!id||!st)return;
  // Clean the URL without reloading the marketplace.
  try{history.replaceState({},document.title,location.pathname||"/")}catch{}
  if(st==="success"){
    // Waychit redirects here after its hosted payment page. The webhook is authoritative;
    // polling only waits for that server-side confirmation before showing success.
    localStorage.removeItem("bassePendingPayment");
    waitForPayment(id,0);
  }else{
    fetch("/api/order/"+encodeURIComponent(id)).then(r=>r.json()).then(o=>{
      if(o?.id)showReturn(o,"",false,o.whatsappSupport,"The Waychit payment was not completed. Your order is still pending.");
      else showReturn({id,total:0},"",false,"","The Waychit payment was not completed.");
    }).catch(()=>showReturn({id,total:0},"",false,"","The Waychit payment was not completed. Your order is still pending."));
  }
}
function resumePendingPayment(){
  try{
    const raw=localStorage.getItem("bassePendingPayment");
    if(!raw)return;
    const p=JSON.parse(raw);
    if(!p?.orderId)return;
    // Keep checking after the customer returns from the Waychit app.
    // This also works when Waychit does not automatically hand the browser back.
    waitForPayment(p.orderId,0);
  }catch{}
}
function closeModal(){stopTrackingPolling();$("modal").classList.remove("show")}
function openCart(){toast("Cart checkout is coming next — Buy Now is fully active.")}
async function openOrders(){let raw=localStorage.getItem("basseLastOrder");if(!raw)return toast("No recent order found on this phone.");try{let old=JSON.parse(raw),r=await fetch("/api/order/"+encodeURIComponent(old.id)),o=await r.json();if(!r.ok)throw new Error(o.error||"Order not found");showReturn(o,"",o.payment_status==="PAID",o.whatsappSupport,o.payment_status==="PENDING"?"Your order is waiting for payment confirmation.":"")}catch(e){toast(e.message)}}


function showSupport(){
  const modal=$("modal");
  modal.innerHTML=`<div class="sheet support-sheet"><button class="close" onclick="closeModal()">×</button><div class="checkout-head"><span class="support-modal-icon"><svg viewBox="0 0 48 48"><path d="M10 25v-4a14 14 0 0 1 28 0v4" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><rect x="6" y="23" width="9" height="13" rx="4" fill="none" stroke="currentColor" stroke-width="2.8"/><rect x="33" y="23" width="9" height="13" rx="4" fill="none" stroke="currentColor" stroke-width="2.8"/><path d="M33 36c-1 5-5 7-10 7h-3" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg></span><div><small>BASSE ONLINE SHOP</small><h2>Customer Support</h2></div></div><p class="muted">Need help with an order, payment or delivery? Call our support team.</p><div class="support-number">+220 6963349</div><a class="pay support-call" href="tel:+2206963349">CALL CUSTOMER SUPPORT <span>→</span></a><button class="secondary-btn" type="button" onclick="closeModal()">CLOSE</button></div>`;
  modal.classList.add('show');
}
function openAccount(){
  const customer=JSON.parse(localStorage.getItem("basseCustomer")||"null");
  $("modal").innerHTML=`<div class="sheet account-sheet"><button class="close" onclick="closeModal()">×</button><div class="account-hero"><div class="account-avatar" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="16" r="7" fill="none" stroke="currentColor" stroke-width="3"/><path d="M10 41c1.5-9 6-13 14-13s12.5 4 14 13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></div><h2>${customer?`Welcome, ${esc(customer.name)}`:"BASSE MARKET ACCOUNT"}</h2><p>${customer?"Manage your shopping account.":"Shop as a guest or create an account."}</p></div>
  ${customer?`<button class="account-option" onclick="openOrders()"> <span><b>My Orders</b><small>View your recent purchases</small></span> →</button><button class="account-option" onclick="toast('Account details are saved on this device.')"> <span><b>My Details</b><small>${esc(customer.phone)}</small></span> →</button><button class="secondary-btn" onclick="localStorage.removeItem('basseCustomer');openAccount()">LOG OUT</button>`:
  `<button class="account-option" type="button" onclick="openCustomerSignup()"> <span><b>Create Customer Account</b><small>Optional — save your details and orders</small></span> →</button>
  <button class="account-option" type="button" onclick="openCustomerLogin()"> <span><b>Customer Login</b><small>Already have an account?</small></span> →</button>
  <button class="account-option vendor-option" type="button" onclick="openVendorApply()"> <span><b>Become a Vendor</b><small>Apply to sell on BASSE MARKET</small></span> →</button>
  <button class="account-option vendor-login-option" type="button" onclick="openVendorLogin()"> <span><b>Vendor Login</b><small>Approved vendors: enter your phone and PIN</small></span> →</button>
  <div class="guest-note"> <b>Continue as Guest</b><br><span>No customer login is required to browse or place an order.</span></div>`}</div>`;
  $("modal").classList.add("show")
}
function openCustomerSignup(){
 $("modal").innerHTML=`<div class="sheet form-sheet"><button class="close" onclick="openAccount()">←</button><h2>Create Customer Account</h2><p class="muted">Optional — you can always shop as a guest.</p><div class="form"><label>Full Name</label><input id="caName" placeholder="Your name"><label>WhatsApp Number</label><input id="caPhone" inputmode="numeric" placeholder="7XXXXXX"><label>Password</label><input id="caPass" type="password" placeholder="Create a password"><button class="pay" onclick="createCustomer()">CREATE ACCOUNT</button><button class="secondary-btn" onclick="openAccount()">CONTINUE AS GUEST</button></div></div>`;$('modal').classList.add('show')
}
async function createCustomer(){let n=$("caName").value.trim(),p=$("caPhone").value.replace(/\D/g,"").replace(/^220/,""),pw=$("caPass").value;if(!n||p.length<6)return toast("Enter your name and valid WhatsApp number.");if(pw.length<4)return toast("Password must be at least 4 characters.");try{let r=await fetch("/api/customers/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n,whatsapp:p,password:pw})}),d=await r.json();if(!r.ok)throw Error(d.error||"Could not create customer account.");localStorage.setItem("basseCustomer",JSON.stringify({name:d.full_name,phone:"+220 "+p,id:d.id,status:d.status}));openAccount();toast("Customer account created ")}catch(e){toast(e.message)}}
function openCustomerLogin(){
 $("modal").innerHTML=`<div class="sheet form-sheet"><button class="close" onclick="openAccount()">←</button><h2>Customer Login</h2><p class="muted">Login is optional. You can also continue shopping as a guest.</p><div class="form"><label>WhatsApp Number</label><input id="clPhone" inputmode="numeric" placeholder="7XXXXXX"><label>Password</label><input id="clPass" type="password" placeholder="Your password"><button class="pay" onclick="loginCustomer()">LOGIN</button><button class="secondary-btn" onclick="openAccount()">CONTINUE AS GUEST</button></div></div>`;$('modal').classList.add('show')
}
async function loginCustomer(){let p=$("clPhone").value.replace(/\D/g,"").replace(/^220/,""),pw=$("clPass").value;if(p.length<6||!pw)return toast("Enter your WhatsApp number and password.");try{let r=await fetch("/api/customers/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({whatsapp:p,password:pw})}),d=await r.json();if(!r.ok)throw Error(d.error||"Customer login failed.");localStorage.setItem("basseCustomer",JSON.stringify({name:d.full_name,phone:"+220 "+p,id:d.id,status:d.status}));openAccount();toast("Welcome back ")}catch(e){toast(e.message)}}
function openVendorApply(){
 $("modal").innerHTML=`<div class="sheet form-sheet"><button class="close" onclick="openAccount()">←</button><h2>Become a Vendor</h2><p class="muted">Apply to sell on BASSE MARKET. Admin will review your application.</p><div class="form"><label>Full Name</label><input id="vName" placeholder="Full name"><label>Business / Shop Name</label><input id="vBusiness" placeholder="Your shop name"><label>WhatsApp Number</label><input id="vPhone" inputmode="numeric" placeholder="7XXXXXX"><label>Location</label><input id="vLocation" placeholder="Basse"><label>Category</label><input id="vCategory" placeholder="Fashion, Phones, Beauty..."><label>Short Description</label><textarea id="vDesc" placeholder="Tell us about your business"></textarea><label>Create Vendor PIN</label><input id="vPass" type="password" inputmode="numeric" minlength="4" maxlength="5" pattern="[0-9]{4,5}" placeholder="4 or 5 digit PIN" required><button class="pay" onclick="submitVendor()">SUBMIT APPLICATION</button></div></div>`;$("modal").classList.add("show")
}
function openVendorLogin(){
 $("modal").innerHTML=`<div class="sheet form-sheet vendor-login-sheet">
 <button class="close" type="button" onclick="openAccount()">←</button>
 <div class="account-avatar" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="16" r="7" fill="none" stroke="currentColor" stroke-width="3"/><path d="M10 41c1.5-9 6-13 14-13s12.5 4 14 13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></div>
 <h2>Vendor Login</h2>
 <p class="muted">Only approved vendors can access their dashboard.</p>
 <div class="form" id="marketVendorLoginForm">
 <label>WhatsApp / Phone Number</label>
 <input id="vendorLoginPhone" inputmode="numeric" autocomplete="tel" placeholder="7XXXXXX">
 <label>Vendor PIN</label>
 <input id="vendorLoginPin" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="5" placeholder="4 or 5 digits">
 <button class="pay" type="button" id="vendorLoginBtn"> LOGIN TO VENDOR DASHBOARD <span>→</span></button>
 <small>Forgot your PIN? Contact BASSE MARKET Admin for a reset.</small>
 </div></div>`;
 $("modal").classList.add("show");
 $("vendorLoginBtn").addEventListener("click", async function(){
   const phone=$("vendorLoginPhone").value.trim();
   const pin=$("vendorLoginPin").value.trim();
   if(!phone) return toast("Enter your phone number.");
   if(!/^\d{4,5}$/.test(pin)) return toast("PIN must be 4 or 5 digits.");
   const btn=$("vendorLoginBtn"); btn.disabled=true; btn.innerHTML=" SIGNING IN…";
   try{
     const r=await fetch("/api/vendor/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({whatsapp:phone,pin})});
     const d=await r.json().catch(()=>({}));
     if(!r.ok) throw new Error(d.error||"Vendor login failed.");
     if(d.token) localStorage.setItem("basseVendorToken",d.token);
     location.href="/vendor/";
   }catch(e){btn.disabled=false;btn.innerHTML=" LOGIN TO VENDOR DASHBOARD <span>→</span>";toast(e.message);}
 });
}
async function submitVendor(){
  let pin=String($("vPass").value||"");
  if(!/^\d{4,5}$/.test(pin)){toast("PIN must be exactly 4 or 5 digits.");return}
  let phone=String($("vPhone").value||"").replace(/\D/g,"").replace(/^220/,"");
  let b={fullName:$("vName").value,businessName:$("vBusiness").value,whatsapp:phone,location:$("vLocation").value,category:$("vCategory").value,description:$("vDesc").value,password:pin};
  if(!b.fullName||!b.businessName||phone.length<6)return toast("Complete the form with a valid WhatsApp number.");
  try{
    let r=await fetch("/api/vendors/apply",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    let d=await r.json();
    if(!r.ok)throw Error(d.error||"Application failed");
    sessionStorage.setItem("basseVendorApplication",JSON.stringify({phone,pin,id:d.id,businessName:b.businessName,fullName:b.fullName}));
    window.__vendorPendingName=b.fullName;
    showVendorPending(d.id,phone,pin,b.businessName);
  }catch(e){toast(e.message)}
}
function showVendorPending(id,phone,pin,businessName){
  $("modal").innerHTML=`<div class="sheet return-sheet vendor-pending-sheet">
    <div class="result-icon pending-icon"></div>
    <h2>Waiting for Approval</h2>
    <p>Your <b>${esc(businessName)}</b> vendor application has been submitted.</p>
    <div class="pending-box"><strong>Application Status</strong><span id="vendorPendingStatus">PENDING</span></div>
    <p class="muted">No email verification is required. Your application is waiting for Admin approval.</p>
    <button class="pay" type="button" id="sendVendorWhatsApp"> SEND APPLICATION TO ADMIN</button>
    <button class="secondary-btn" type="button" id="checkVendorApproval">CHECK STATUS</button>
    <button class="secondary-btn" type="button" onclick="closeModal()">CLOSE</button>
  </div>`;
  $("modal").classList.add("show");
  const waText=` *BASSE MARKET — NEW VENDOR APPLICATION*%0A%0ABusiness: ${encodeURIComponent(businessName)}%0AVendor: ${encodeURIComponent((window.__vendorPendingName||""))}%0AWhatsApp: +220${encodeURIComponent(phone)}%0AStatus: PENDING%0A%0APlease review and approve this vendor in the Admin Dashboard.`;
  $("sendVendorWhatsApp").onclick=()=>{ location.href=`https://wa.me/2206963349?text=${waText}`; };
  window.__vendorPending={id,phone,pin,businessName};
  clearInterval(window.__vendorPendingTimer);
  const check=async()=>{
    try{
      const r=await fetch("/api/vendors/status?whatsapp="+encodeURIComponent(phone),{cache:"no-store"});
      const d=await r.json();
      if(!r.ok)throw Error(d.error||"Status unavailable");
      const label=$("vendorPendingStatus");
      if(label)label.textContent=d.status;
      if(d.status==="APPROVED"){
        clearInterval(window.__vendorPendingTimer);
        const lr=await fetch("/api/vendor/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({whatsapp:phone,pin})});
        const ld=await lr.json().catch(()=>({}));
        if(lr.ok&&ld.token){
          localStorage.setItem("basseVendorToken",ld.token);
          sessionStorage.removeItem("basseVendorApplication");
          $("modal").innerHTML=`<div class="sheet return-sheet"><div class="result-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="m10 25 9 9 19-20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div><h2>Vendor Approved!</h2><p>Your shop is approved. Opening your Vendor Dashboard…</p></div>`;
          setTimeout(()=>location.href="/vendor/",400);
        }else{
          $("modal").innerHTML=`<div class="sheet return-sheet"><div class="result-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="m10 25 9 9 19-20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div><h2>Vendor Approved!</h2><p>Your account is approved. Use Vendor Login with your phone and PIN.</p><button class="pay" type="button" onclick="openVendorLogin()"> VENDOR LOGIN</button></div>`;
        }
      }else if(d.status==="REJECTED"||d.status==="SUSPENDED"){
        clearInterval(window.__vendorPendingTimer);
      }
    }catch(e){}
  };
  $("checkVendorApproval").onclick=check;
  check();
  window.__vendorPendingTimer=setInterval(check,3000);
}
function resumeVendorApplication(){
  try{
    const a=JSON.parse(sessionStorage.getItem("basseVendorApplication")||"null");
    if(a&&a.id&&a.phone&&a.pin){window.__vendorPendingName=a.fullName||"";showVendorPending(a.id,a.phone,a.pin,a.businessName||"Your shop");}
  }catch{}
}

function toast(t){let x=$("toast");x.textContent=t;x.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>x.classList.remove("show"),2800)}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
$("search").addEventListener("input",runSearch);$("search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("searchSuggestions").classList.remove("show");loadProducts();document.querySelector("#products").scrollIntoView({behavior:"auto",block:"start"})}if(e.key==="Escape")clearSearch()});$("searchBtn").addEventListener("click",()=>{$("searchSuggestions").classList.remove("show");loadProducts();document.querySelector("#products").scrollIntoView({behavior:"auto",block:"start"});});$("clearSearch").addEventListener("click",clearSearch);document.addEventListener("click",e=>{if(!e.target.closest(".search-wrap"))$("searchSuggestions").classList.remove("show")});

async function loadStorePreview(){
  const grid=$("storePreviewGrid"); if(!grid)return;
  try{
    const r=await fetch("/api/stores",{cache:"no-store"}); const stores=await r.json();
    if(!r.ok)throw Error("Could not load stores");
    const list=Array.isArray(stores)?stores.slice(0,4):[];
    grid.innerHTML=list.length?list.map(s=>`<button type="button" class="store-preview-card" onclick="openStore(${s.id})">
      <span class="preview-logo">${esc(storeInitials(s.business_name))}</span>
      <span class="preview-info"><b>${esc(s.business_name||"BASSE Store")}</b><small>${esc(s.category||"Local Store")} · ${s.product_count||0} products</small></span>
      <span class="preview-arrow" aria-hidden="true">→</span>
    </button>`).join(""):`<div class="preview-loading">Approved stores will appear here as vendors go live.</div>`;
  }catch{
    grid.innerHTML=`<div class="preview-loading">Stores will appear here when the marketplace reconnects.</div>`;
  }
}

const initialSearch=new URLSearchParams(location.search).get("q");if(initialSearch){$("search").value=initialSearch;}loadProducts();loadStorePreview();handleReturn();setTimeout(()=>{if(new URLSearchParams(location.search).get("vendor")==="apply"){openVendorApply();history.replaceState({},"",location.pathname)}resumeVendorApplication();if(!new URLSearchParams(location.search).get("payment"))resumePendingPayment()},200);
// Instant catalog/order updates. EventSource reconnects automatically if the connection drops.
function connectLive(){
  try{
    const es=new EventSource("/api/live");
    es.addEventListener("catalog",()=>{loadStorePreview();if(document.visibilityState==="visible"&&!$("modal").classList.contains("show"))loadProducts(true);});
    es.addEventListener("orders",()=>{
      // Never replace the customer's live Track Order screen with the order sheet.
      // Delivery/GPS events are handled by the dedicated tracking stream above.
      if(trackingOrderId)return;
      if(document.visibilityState==="visible"&&localStorage.getItem("basseLastOrder"))openOrders().catch(()=>{});
    });
    es.onerror=()=>{es.close();setTimeout(connectLive,3000)};
  }catch{setTimeout(connectLive,3000)}
}
connectLive();
startViewerPresence();
// Safety fallback for networks that block EventSource.
setInterval(()=>{if(document.visibilityState==="visible"&&!$("modal").classList.contains("show"))loadProducts(true)},60000);

window.addEventListener("visibilitychange",()=>{
  if(document.visibilityState!=="visible")return;
  let u=new URLSearchParams(location.search),id=u.get("order"),st=u.get("payment");
  if(id&&st==="success"){waitForPayment(id,0);return;}
  if(!id&&!st)resumePendingPayment();
});

/* BASSE feature banner carousel: App → Order Tracking → Payments */
(function initFeatureCarousel(){
  const track=document.getElementById('featureTrack'), dots=[...document.querySelectorAll('.feature-dots button')];
  if(!track||!dots.length)return;
  let index=0,timer=null;
  const go=(n)=>{index=(n+3)%3;track.style.transform=`translateX(-${index*100}%)`;dots.forEach((d,i)=>d.classList.toggle('active',i===index));};
  dots.forEach((d,i)=>d.addEventListener('click',()=>{go(i);restart();}));
  const start=()=>{clearInterval(timer);timer=setInterval(()=>{if(document.visibilityState==='visible')go(index+1)},5000)};
  const restart=()=>start();
  start();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')start();else clearInterval(timer)});
  let sx=0;
  track.addEventListener('touchstart',e=>{sx=e.changedTouches[0].clientX},{passive:true});
  track.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>45){go(index+(dx<0?1:-1));restart();}},{passive:true});
})();

// Explicit globals for Android WebView/iOS WebKit and inline UI actions.
window.trackOrderPrompt=trackOrderPrompt;
window.submitGuestTracking=submitGuestTracking;
window.openOrderTracking=openOrderTracking;
window.refreshTracking=refreshTracking;
window.captureTrackingLocation=captureTrackingLocation;
