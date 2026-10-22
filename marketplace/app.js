let category="All",selected=null,searchTimer=null,searchIndex=[];
function setActiveNav(name){
  document.querySelectorAll('.bottom [data-nav]').forEach(el=>el.classList.toggle('active',el.dataset.nav===name));
  const shops=document.querySelector('.stores-head-btn');
  if(shops)shops.classList.toggle('active',name==='shops');
}
function resetStoreNav(){const shops=document.querySelector('.stores-head-btn');if(shops)shops.classList.remove('active')}
// Anonymous live-viewer heartbeat for the Admin Dashboard.
const BASSE_VIEWER_ID=(()=>{try{let id=sessionStorage.getItem("basseViewerId");if(!id){id=(crypto.randomUUID?crypto.randomUUID():"v_"+Date.now()+"_"+Math.random().toString(36).slice(2));sessionStorage.setItem("basseViewerId",id)}return id}catch{return "v_"+Date.now()+"_"+Math.random().toString(36).slice(2)}})();
const BASSE_UA=(navigator.userAgent||"").toLowerCase();
const BASSE_VIEWER_SOURCE=(window.__BASSE_APP__===true||/android/.test(BASSE_UA)&&(/\bwv\b|version\/4\.0|; wv|webview/.test(BASSE_UA))||window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches)?"app":"website";
async function sendViewerHeartbeat(){try{await fetch("/api/presence/heartbeat",{method:"POST",headers:{"Content-Type":"application/json","X-BASSE-SOURCE":BASSE_VIEWER_SOURCE},body:JSON.stringify({id:BASSE_VIEWER_ID,source:BASSE_VIEWER_SOURCE}),cache:"no-store",keepalive:true})}catch{}}
function startViewerPresence(){sendViewerHeartbeat();clearInterval(window.__viewerPresence);window.__viewerPresence=setInterval(sendViewerHeartbeat,15000);window.addEventListener("pageshow",sendViewerHeartbeat);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")sendViewerHeartbeat()})}
window.addEventListener("pagehide",()=>{try{navigator.sendBeacon("/api/presence/leave",new Blob([JSON.stringify({id:BASSE_VIEWER_ID})],{type:"application/json"}))}catch{}});
const $=id=>document.getElementById(id),money=n=>"D"+Number(n||0).toLocaleString();
let checkoutGps={lat:null,lng:null,accuracy:null},selectedChoices=[],trackingMap=null,trackingPoll=null,trackingStream=null,trackingLocationWatch=null,trackingLastLocationSent=0,trackingPhone="",trackingOrderId="",trackingRefreshing=false,trackingLastEvent=0;
function hasGpsCoordinate(value){return value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));}
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
    grid.innerHTML=ps.length?ps.map((p,i)=>`<article class="product" data-id="${p.id}" tabindex="0" role="button" aria-label="View ${esc(p.name)} details" style="--card-index:${Math.min(i,9)}" onclick="buy(${p.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();buy(${p.id})}"><div class="pic"><img src="${p.image||""}" alt="${esc(p.name)}" loading="lazy" decoding="async"><span class="product-image-glint" aria-hidden="true"></span></div><div class="info"><h3>${esc(p.name)}</h3><div class="product-price-row"><div class="price">${money(p.price)}</div><span class="product-card-arrow" aria-hidden="true">↗</span></div><div class="product-view-link"><span>View details</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div></article>`).join(""):`<div class="empty-search"><div></div><h3>No products found</h3><p>Try another product name or category.</p></div>`;
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
function setCat(c,b){setActiveNav("categories");category=c;document.querySelectorAll(".cats button").forEach(x=>x.classList.remove("active"));b.classList.add("active");loadProducts();document.querySelector("#products").scrollIntoView({behavior:"auto",block:"start"})}

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
      <div class="detail-info modern-detail-info"><span class="tagline">${esc(product.category)}</span><h2>${esc(product.name)}</h2><div class="detail-price">${money(product.price)}</div><p class="muted">${esc(product.description||"Quality product from BASSE MARKET.")}</p>${renderOptionFields(product)?`<div class="product-options"><b>Choose options</b>${renderOptionFields(product)}</div>`:""}<div class="stock-note ${product.stock<1?'out':''}">${product.stock>0?` ${product.stock} available`:"Out of stock"}</div><div class="detail-actions"><button class="secondary-btn cart-add-btn" ${product.stock<1?"disabled":""} onclick="addSelectedToCart()"><b>ADD TO CART</b></button><button class="pay buy-now-modern" ${product.stock<1?"disabled":""} onclick="openCheckout()"><span></span><b>BUY NOW</b><span class="arrow">→</span></button>${product.vendor_id?`<button class="secondary-btn" type="button" onclick="openChat(${Number(product.vendor_id)},'Vendor')"><b>CHAT WITH VENDOR</b></button>`:""}</div><div class="product-hint">Secure checkout · Pay with Waychit</div></div>
    </div></div>`;
  window.__productImages=imgs;
  $("modal").classList.add("show");resetModalSheet();
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
function getCart(){try{const c=JSON.parse(localStorage.getItem("basseCart")||"[]");return Array.isArray(c)?c:[]}catch{return []}}
function saveCart(c){try{localStorage.setItem("basseCart",JSON.stringify(c));updateCartCount()}catch{}}
function cartKey(item){return String(item.productId)+"|"+JSON.stringify(item.options||[])}
function updateCartCount(){const n=getCart().reduce((a,x)=>a+Math.max(1,Number(x.quantity)||1),0);document.querySelectorAll("#cartCount").forEach(e=>e.textContent=n)}
function addSelectedToCart(){
  if(!selected||selected.stock<1)return;
  if(!validateProductOptions())return;
  const options=getSelectedOptionSummary(), c=getCart(), key=cartKey({productId:selected.id,options});
  const existing=c.find(x=>cartKey(x)===key);
  if(existing)existing.quantity=Math.min(Number(selected.stock),Math.max(1,Number(existing.quantity)||1)+1);
  else c.push({productId:Number(selected.id),name:selected.name,price:Number(selected.price),image:selected.image||normalizeProductImages(selected)[0]||"",stock:Number(selected.stock),quantity:1,options});
  saveCart(c);toast("Added to cart ✓");
}
function removeFromCart(i){const c=getCart();c.splice(i,1);saveCart(c);openCart()}
function changeCartQty(i,d){const c=getCart(),x=c[i];if(!x)return;x.quantity=Math.max(1,Math.min(Number(x.stock)||1,(Number(x.quantity)||1)+d));saveCart(c);openCart()}
function openCart(){
  setActiveNav("cart");
  const c=getCart();
  if(!c.length){$("modal").innerHTML='<div class="sheet return-sheet"><button class="close" onclick="closeModal()">×</button><div class="result-icon" aria-hidden="true">🛒</div><h2>Your cart is empty</h2><p>Add products to your cart and they will appear here.</p><button class="secondary-btn" onclick="closeModal()">CONTINUE SHOPPING</button></div>';$('modal').classList.add('show');document.body.classList.add('basse-modal-open');syncVisualViewport();return;}
  const total=c.reduce((a,x)=>a+Number(x.price||0)*Math.max(1,Number(x.quantity)||1),0);
  $("modal").innerHTML=`<div class="sheet checkout-sheet"><button class="close" onclick="closeModal()">×</button><div class="checkout-head"><span class="mini-bag" aria-hidden="true">🛒</span><div><small>BASSE ONLINE SHOP</small><h2>Your cart</h2></div></div><div class="cart-list">${c.map((x,i)=>`<div class="cart-item"><img src="${esc(x.image||"")}" alt=""><div class="cart-item-main"><b>${esc(x.name)}</b><small>${(x.options||[]).map(esc).join(" · ")||"Standard"}</small><strong>${money(x.price*Math.max(1,x.quantity))}</strong><div class="qty-row"><button type="button" onclick="changeCartQty(${i},-1)">−</button><input value="${Math.max(1,x.quantity)}" readonly><button type="button" onclick="changeCartQty(${i},1)">+</button><button type="button" class="secondary-btn" onclick="removeFromCart(${i})">REMOVE</button></div></div></div>`).join("")}</div><div class="summary"><div class="row"><span>Items</span><b>${c.reduce((a,x)=>a+Math.max(1,x.quantity),0)}</b></div><div class="row total-row"><span>Total</span><b>${money(total)}</b></div></div><button class="pay pulse" onclick="openCartCheckout()">CHECKOUT WITH WAYCHIT <span>→</span></button></div>`;$('modal').classList.add('show');document.body.classList.add('basse-modal-open');syncVisualViewport();
}
function openCartCheckout(){
  const c=getCart();if(!c.length)return openCart();
  const saved=JSON.parse(localStorage.getItem("basseCustomer")||"null");const name=esc(saved?.name||""),phone=esc(String(saved?.phone||"").replace(/\D/g,"").replace(/^220/,""));
  checkoutGps={lat:null,lng:null,accuracy:null};
  const total=c.reduce((a,x)=>a+Number(x.price||0)*Math.max(1,Number(x.quantity)||1),0);
  $("modal").innerHTML=`<div class="sheet checkout-sheet"><button class="close" onclick="openCart()">←</button><div class="checkout-head"><span class="mini-bag">🛒</span><div><small>SECURE CHECKOUT</small><h2>Cart checkout</h2></div></div><p class="muted">${c.length} product${c.length===1?'':'s'} · ${money(total)}</p><div class="form"><label>Full Name</label><input id="cartName" autocomplete="name" placeholder="Your name" value="${name}"><label>WhatsApp Number</label><input id="cartPhone" inputmode="numeric" placeholder="7XXXXXX" value="${phone}"><small>+220 will be added automatically.</small><label>Delivery Area</label><select id="cartLoc"><option>Basse</option><option>Bansang</option><option>Fatoto</option><option>Other</option></select><button type="button" class="location-btn" onclick="captureCheckoutLocationCart()"> USE MY CURRENT GPS LOCATION</button><small id="cartGpsState" class="gps-note">GPS is optional.</small><div class="summary"><div class="row total-row"><span>Total</span><b>${money(total)}</b></div></div><button class="pay pulse" onclick="placeCartOrder()">PAY WITH WAYCHIT <span>→</span></button></div></div>`;$('modal').classList.add('show');document.body.classList.add('basse-modal-open');syncVisualViewport();
}
function captureCheckoutLocationCart(){const state=$("cartGpsState");if(!navigator.geolocation){if(state)state.textContent="GPS is not supported.";return}if(state)state.textContent="Getting your location…";navigator.geolocation.getCurrentPosition(p=>{checkoutGps={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy};if(state)state.textContent=`GPS location saved (±${Math.round(p.coords.accuracy||0)}m).`},()=>{if(state)state.textContent="GPS permission not granted. You can continue."},{enableHighAccuracy:true,maximumAge:10000,timeout:15000})}
async function placeCartOrder(){
  const c=getCart();if(!c.length)return openCart();let phone=$("cartPhone").value.replace(/\D/g,"").replace(/^220/,"");if(!$("cartName").value.trim())return toast("Please enter your full name.");if(phone.length<6)return toast("Please enter a valid WhatsApp number.");const btn=document.querySelector('.pay');if(btn){btn.disabled=true;btn.innerHTML=" CONNECTING TO WAYCHIT…"}
  try{const r=await fetch("/api/orders/cart",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:c.map(x=>({productId:x.productId,quantity:x.quantity,options:x.options||[]})),name:$("cartName").value.trim(),whatsapp:phone,location:$("cartLoc").value,customerLat:checkoutGps.lat,customerLng:checkoutGps.lng,customerAccuracy:checkoutGps.accuracy})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Could not create your order.");localStorage.setItem("basseLastOrder",JSON.stringify(d.order));localStorage.setItem("basseOrderPhone",phone);refreshOrderNotifications();localStorage.setItem("bassePendingPayment",JSON.stringify({orderId:d.order.id,groupId:d.groupId,startedAt:Date.now(),paymentMode:d.paymentMode||"dynamic"}));localStorage.removeItem("basseCart");updateCartCount();if(d.paymentUrl){setTimeout(()=>window.location.href=d.paymentUrl,120);return}throw new Error(d.paymentError||"Waychit payment is not available right now.");}catch(e){if(btn){btn.disabled=false;btn.innerHTML="PAY WITH WAYCHIT <span>→</span>"}toast(e.message)}
}

function openCheckout(){
  if(!selected)return;
  if(!validateProductOptions())return;
  selectedChoices=getSelectedOptionSummary();
  const savedCustomer=JSON.parse(localStorage.getItem("basseCustomer")||"null");
  const savedName=esc(savedCustomer?.name||"");
  const savedPhone=esc(String(savedCustomer?.phone||"").replace(/\D/g,"").replace(/^220/,""));
  checkoutGps={lat:null,lng:null,accuracy:null};
  $("modal").innerHTML=`<div class="sheet checkout-sheet"><button class="close" onclick="buy(${selected.id})">←</button><div class="checkout-head"><span class="mini-bag" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M12 18h24l-2 23H14z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M18 18v-4a6 6 0 0 1 12 0v4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></span><div><small>SECURE CHECKOUT</small><h2>Your order</h2></div></div><p class="muted">${esc(selected.name)}</p><div class="selected-options-summary" id="selectedOptionsSummary"></div><div class="form"><label>Quantity</label><div class="qty-row"><button type="button" onclick="changeQty(-1)">−</button><input id="qty" type="number" min="1" max="${selected.stock}" value="1"><button type="button" onclick="changeQty(1)">+</button></div><label>Full Name</label><input id="name" autocomplete="name" placeholder="Your name" value="${savedName}"><label>WhatsApp Number</label><input id="phone" inputmode="numeric" autocomplete="tel" placeholder="7XXXXXX" value="${savedPhone}"><small>+220 will be added automatically. No account/login is required.</small><label>Delivery Area</label><select id="loc"><option>Basse</option><option>Bansang</option><option>Fatoto</option><option>Other</option></select><button type="button" class="location-btn" onclick="captureCheckoutLocation()"> USE MY CURRENT GPS LOCATION</button><small id="checkoutGpsState" class="gps-note">GPS is optional. Your written delivery area can still be used.</small><div class="summary"><div class="row"><span>Product</span><b>${money(selected.price)}</b></div><div class="row total-row"><span>Total</span><b id="total">${money(selected.price)}</b></div></div><button class="pay pulse" onclick="placeOrder()"> PAY WITH WAYCHIT <span>→</span></button><div class="secure-note"> Secure checkout · You will be redirected to Waychit</div></div></div>`;
  $("modal").classList.add("show");resetModalSheet();$("qty").oninput=updateTotal;$("phone").addEventListener("keydown",e=>{if(e.key==="Enter")placeOrder()});
}
function changeQty(d){let q=Math.max(1,Math.min(selected.stock,(+$('qty').value||1)+d));$('qty').value=q;updateTotal()}
function updateTotal(){$("total").textContent=money(selected.price*Math.max(1,Math.min(selected.stock,+$("qty").value||1)))}


function storeInitials(name){
  const parts=String(name||"BASSE").trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0,2).map(x=>x[0]).join("")||"BS").toUpperCase();
}
function storeCoverClass(id){return "store-cover c"+(Number(id)%6)}
async function openStores(){
  setActiveNav("shops");
  const modal=$("modal");
  modal.innerHTML=`<div class="sheet stores-sheet"><button class="close" onclick="closeModal()">×</button>
    <div class="stores-heading"><div><small>BASSE MARKETPLACE</small><h2>All Stores</h2><p>Discover trusted local stores and shop directly from them.</p></div><span class="store-heading-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v10H4zM3 10l2-6h14l2 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 20v-6h8v6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span></div>
    <div id="storeGrid" class="store-grid"><div class="store-loading">Loading stores…</div></div></div>`;
  modal.classList.add("show");
  try{
    const r=await fetch("/api/stores",{cache:"no-store"});const stores=await r.json();if(!r.ok)throw Error(stores.error||"Could not load stores");
    const grid=$("storeGrid");
    grid.innerHTML=stores.length?stores.map(s=>`
      <article class="store-card-pro" tabindex="0" role="button" onclick="openStore(${s.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openStore(${s.id})}">
        <div class="${storeCoverClass(s.id)}">
          <div class="store-cover-badge">VERIFIED STORE</div>
          <div class="store-logo">${s.logo_url?`<img src="${esc(s.logo_url)}" alt="${esc(s.business_name)} logo" loading="lazy">`:esc(storeInitials(s.business_name))}</div>
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
    $("storeDetail").innerHTML=`<div class="store-detail-head"><div class="${storeCoverClass(s.id)} detail-cover"><div class="store-logo big">${s.logo_url?`<img src="${esc(s.logo_url)}" alt="${esc(s.business_name)} logo" loading="lazy">`:esc(initials)}</div></div><div class="store-detail-info"><small>VERIFIED BASSE STORE</small><h2>${esc(s.business_name)}</h2><p>${esc(s.description||s.category||"Local vendor")}</p><div class="store-meta"><span> ${esc(s.location||"Basse")}</span><span> ${s.products.length} products</span></div></div></div>
      <div class="store-products-head"><h3>Products</h3><span>${s.products.length} available</span></div>
      <div class="store-products">${s.products.length?s.products.map(p=>`<article class="product" data-id="${p.id}" tabindex="0" role="button" onclick="buy(${p.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();buy(${p.id})}"><div class="pic"><img src="${p.image||""}" alt="${esc(p.name)}" loading="lazy" decoding="async"></div><div class="info"><h3>${esc(p.name)}</h3><div class="price">${money(p.price)}</div><button class="buy" type="button" onclick="event.stopPropagation();buy(${p.id})">VIEW PRODUCT →</button></div></article>`).join(""):`<div class="empty-search"><div></div><h3>No products yet</h3><p>This store has no approved products available right now.</p></div>`}</div>`;
  }catch(e){$("storeDetail").innerHTML=`<div class="empty-search"><div></div><h3>Store unavailable</h3><p>${esc(e.message||"Please try again.")}</p><button class="view-store-btn" onclick="openStore(${id})">TRY AGAIN</button></div>`}
}
function trackOrderPrompt(){
  const modal=$("modal");
  modal.innerHTML=`<div class="sheet form-sheet tracking-entry-sheet"><button class="close" onclick="closeModal()">×</button><div class="checkout-head"><span class="mini-bag" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M12 18h24l-2 23H14z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M18 18v-4a6 6 0 0 1 12 0v4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></span><div><small>BASSE DELIVERY</small><h2>Track Your Order</h2></div></div><p class="muted">No account is required. Enter the order number and the WhatsApp number used when you placed the order.</p><div class="form"><label>Order Number</label><input id="trackOrderId" autocomplete="off" placeholder="BOS-AB12CD34"><label>WhatsApp Number</label><input id="trackPhone" inputmode="numeric" autocomplete="tel" placeholder="7XXXXXX"><button class="pay" type="button" onclick="submitGuestTracking()"> TRACK ORDER <span>→</span></button><button class="secondary-btn" type="button" onclick="closeModal()">CANCEL</button></div></div>`;
  modal.classList.add('show');document.body.classList.add('basse-modal-open');syncVisualViewport();
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
    const hasCustomer=hasGpsCoordinate(d.order.customer_lat)&&hasGpsCoordinate(d.order.customer_lng);
    const hasDriver=hasGpsCoordinate(d.delivery?.lat)&&hasGpsCoordinate(d.delivery?.lng);
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
  // OpenStreetMap first: CARTO may show an API-key watermark without firing tileerror.
  return L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    maxZoom:19,keepBuffer:2,updateWhenIdle:true,updateWhenZooming:false,
    attribution:"© OpenStreetMap contributors",crossOrigin:true
  }).addTo(map);
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
  const hasCustomer=hasGpsCoordinate(customerLat)&&hasGpsCoordinate(customerLng);
  const hasDriver=hasGpsCoordinate(driverLat)&&hasGpsCoordinate(driverLng);
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
function closeModal(){stopTrackingPolling();stopChatPoll();$("modal").classList.remove("show");document.body.classList.remove("basse-modal-open");resetStoreNav();setActiveNav("home")}
function syncVisualViewport(){
  const vv=window.visualViewport;
  const h=vv&&Number.isFinite(vv.height)?vv.height:window.innerHeight;
  const top=vv&&Number.isFinite(vv.offsetTop)?vv.offsetTop:0;
  const safeHeight=Math.max(260,Math.round(h));
  document.documentElement.style.setProperty("--basse-vv-height",safeHeight+"px");
  document.documentElement.style.setProperty("--basse-vv-top",Math.max(0,Math.round(top))+"px");
  const sheet=document.querySelector(".modal.show .sheet");
  if(sheet){
    // Mobile CSS owns the sheet height. Avoid forcing it to the content's
    // current scrollHeight, which can collapse the form while the iOS keyboard opens.
    sheet.style.removeProperty("height");
    sheet.style.maxHeight=Math.max(260,safeHeight-4)+"px";
  }
  if(document.querySelector(".modal.show .chat-sheet.keyboard-open")){
    const box=$("chatMessages");
    if(box)box.scrollTop=box.scrollHeight;
  }
}
function resetModalSheet(){
  const modal=$("modal");
  if(!modal)return;
  document.body.classList.add("basse-modal-open");
  modal.scrollTop=0;
  const sheet=modal.querySelector(".sheet");
  if(sheet){
    sheet.scrollTop=0;
    sheet.style.removeProperty("height");
    sheet.style.removeProperty("max-height");
  }
  syncVisualViewport();
}
if(window.visualViewport){
  window.visualViewport.addEventListener("resize",syncVisualViewport);
  window.visualViewport.addEventListener("scroll",syncVisualViewport);
}
window.addEventListener("orientationchange",()=>setTimeout(syncVisualViewport,120));
syncVisualViewport();

async function openOrders(){let raw=localStorage.getItem("basseLastOrder");if(!raw)return toast("No recent order found on this phone.");try{let old=JSON.parse(raw),r=await fetch("/api/order/"+encodeURIComponent(old.id)),o=await r.json();if(!r.ok)throw new Error(o.error||"Order not found");showReturn(o,"",o.payment_status==="PAID",o.whatsappSupport,o.payment_status==="PENDING"?"Your order is waiting for payment confirmation.":"")}catch(e){toast(e.message)}}



let activeChatId=null,chatPoll=null;
function customerIdentity(){const c=JSON.parse(localStorage.getItem("basseCustomer")||"null");return {customerId:c?.id||null,name:c?.name||"Guest Customer",whatsapp:(c?.phone||"").replace(/\D/g,"").replace(/^220/,"")};}
function chatInbox(){try{const x=JSON.parse(localStorage.getItem("basseChatInbox")||"[]");return Array.isArray(x)?x:[]}catch{return []}}
function saveChatInbox(list){try{const dedup=new Map();for(const x of list){const key=x.vendorId?("vendor:"+x.vendorId):"admin";const prior=dedup.get(key);if(!prior||(Number(x.updatedAt)||0)>=(Number(prior.updatedAt)||0))dedup.set(key,x)}localStorage.setItem("basseChatInbox",JSON.stringify([...dedup.values()].sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0)).slice(0,30)))}catch{}}
function rememberChatConversation(c){if(!c?.id)return;const old=chatInbox().find(x=>Number(x.id)===Number(c.id));const list=chatInbox().filter(x=>Number(x.id)!==Number(c.id));list.unshift({id:Number(c.id),vendorId:c.vendor_id?Number(c.vendor_id):null,vendorName:c.vendor_id?(c.vendor_name||"Vendor"):"Admin",updatedAt:Date.now(),lastMessage:c.last_message||"",unread:old?.unread||0});saveChatInbox(list);}
function setChatUnreadBadge(n){const b=$("chatUnreadBadge");if(!b)return;n=Math.max(0,Number(n)||0);b.textContent=n>99?"99+":String(n);b.classList.toggle("hidden",n===0);}
async function refreshChatUnread(){const rawList=chatInbox();const seen=new Set();const list=rawList.filter(x=>{const key=x.vendorId?("vendor:"+x.vendorId):"admin";if(seen.has(key))return false;seen.add(key);return true});if(!list.length){setChatUnreadBadge(0);return;}let total=0;const rows=[];for(const x of list){try{const d=await chatApi('/api/chat/messages/'+x.id);const unread=(d.messages||[]).filter(m=>m.sender_type!=="customer"&&!m.read_at).length;total+=unread;rows.push({...x,unread});}catch{rows.push(x)}}saveChatInbox(rows);setChatUnreadBadge(total);}
function startChatUnreadPolling(){refreshChatUnread();if(window._chatUnreadTimer)clearInterval(window._chatUnreadTimer);window._chatUnreadTimer=setInterval(refreshChatUnread,5000);}

async function chatApi(u,o={}){const r=await fetch(u,{...o,headers:{"Content-Type":"application/json",...(o.headers||{})},cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Chat request failed");return d;}
async function openChat(vendorId=null,vendorName="Admin",existingId=null){
  stopChatPoll();
  const modal=$("modal"), who=customerIdentity();
  modal.innerHTML=`<div class="sheet chat-sheet chat-window"><div class="wa-head"><button class="wa-back" type="button" onclick="openChatInbox()" aria-label="Back">‹</button><span class="wa-avatar">${esc(String(vendorName||"A").trim().charAt(0).toUpperCase())}</span><div class="wa-title"><b>${esc(vendorName)}</b><small class="chat-online">online</small></div></div><div id="chatMessages" class="chat-messages"><div class="muted">Loading conversation…</div></div><div class="chat-compose"><input id="chatText" placeholder="Type your message…" autocomplete="off"><button class="pay chat-send-btn" onclick="sendChatMessage()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12.6 2-12.6 2z"/></svg></button></div></div>`;
  modal.classList.add('show');document.body.classList.add('basse-modal-open');syncVisualViewport();
  enableChatKeyboardLayout();
  try{
    let c=null;
    if(existingId){try{const q=await chatApi('/api/chat/messages/'+existingId);c=q.conversation}catch{}}
    if(!c){const d=await chatApi('/api/chat/conversations',{method:'POST',body:JSON.stringify({customerId:who.customerId,customerName:who.name,customerWhatsapp:who.whatsapp,vendorId:vendorId||null})});c=d.conversation;}
    activeChatId=c.id;rememberChatConversation({...c,vendor_name:vendorName});await loadChatMessages();try{await chatApi("/api/chat/messages/"+activeChatId+"/read",{method:"POST",body:JSON.stringify({customerWhatsapp:who.whatsapp})});}catch{}refreshChatUnread();chatPoll=setInterval(loadChatMessages,3000);const chatInput=$("chatText");if(chatInput&&!chatInput.dataset.chatEnterBound){chatInput.dataset.chatEnterBound="1";chatInput.addEventListener("keydown",event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();sendChatMessage()}})}setTimeout(()=>{$("chatText")?.focus({preventScroll:true});syncVisualViewport()},100);
  }catch(e){$("chatMessages").innerHTML=`<p class="muted">${esc(e.message)}</p>`}
}
async function openChatInbox(){
  setActiveNav("chat");
  stopChatPoll();
  const modal=$("modal");
  modal.innerHTML=`<div class="sheet chat-inbox-sheet messenger-home-sheet"><button class="close" onclick="closeModal()">×</button><div class="chat-messenger-head"><div class="chat-welcome-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V5.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 8h8M8 11.5h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></div><div><div class="chat-welcome-kicker">BASSE ONLINE SHOP</div><h2>Messenger</h2><p>Chat with BASSE Admin or any approved Vendor.</p></div></div><div class="chat-start-grid"><button type="button" class="chat-start-card" onclick="openChat(null,'Admin')"><span class="chat-card-icon admin-chat-card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20c.6-4 3-6 7.5-6s6.9 2 7.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span><b>Chat with Admin</b><small>Orders, payments, delivery & support</small></button><button type="button" class="chat-start-card" onclick="openVendorChatPicker()"><span class="chat-card-icon vendor-chat-card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v10H4zM3 10l2-6h14l2 6M8 10v10M16 10v10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></span><b>Chat with a Vendor</b><small>Ask about products, prices & availability</small></button></div><div id="chatVendorPicker" class="chat-vendor-picker hidden"></div><div class="chat-inbox-heading"><div><b>Messages</b><small>Your conversations are saved for up to 72 hours.</small></div></div><div id="chatInboxList" class="chat-inbox-list"></div></div>`;
  modal.classList.add('show');document.body.classList.add('basse-modal-open');syncVisualViewport();
  await renderChatInbox();
}
async function openVendorChatPicker(){
  const box=$("chatVendorPicker"); if(!box)return;
  box.classList.remove('hidden'); box.innerHTML='<div class="chat-vendor-picker-title"><b>Choose a Vendor</b><button type="button" onclick="this.parentElement.parentElement.classList.add(\'hidden\')">×</button></div><div class="chat-vendor-picker-list">Loading vendors…</div>';
  try{
    const vendors=await chatApi('/api/stores');
    const list=Array.isArray(vendors)?vendors:[];
    box.querySelector('.chat-vendor-picker-list').innerHTML=list.length?list.map(v=>`<button type="button" class="chat-vendor-choice" onclick="openChat(${Number(v.id)},'${esc(v.business_name||'Vendor').replace(/'/g,"\\'")}')"><span class="chat-avatar">${v.logo_url?`<img src="${esc(v.logo_url)}" alt="${esc(v.business_name||'Vendor')} logo" loading="lazy">`:esc(storeInitials(v.business_name||'Vendor'))}</span><span><b>${esc(v.business_name||'Vendor')}</b><small>${esc(v.category||'Vendor')} · ${Number(v.product_count||0)} products</small></span><strong>›</strong></button>`).join(''):'<div class="chat-inbox-empty">No approved vendors are available yet.</div>';
  }catch(e){box.querySelector('.chat-vendor-picker-list').innerHTML=`<div class="chat-inbox-empty">${esc(e.message||'Could not load vendors.')}</div>`}
}
async function renderChatInbox(){const box=$("chatInboxList");if(!box)return;const list=chatInbox();if(!list.length){box.innerHTML='<div class="chat-inbox-empty">No conversations yet.<br><small>Start a chat with Admin or a Vendor.</small></div>';return;}const rows=[];for(const x of list){try{const d=await chatApi('/api/chat/messages/'+x.id);const last=d.messages?.[d.messages.length-1];const name=d.conversation?.vendor_id?(x.vendorName||'Vendor'):'Admin';rows.push({...x,vendorName:name,lastMessage:last?.message||x.lastMessage||'No messages',updatedAt:last?new Date(last.created_at).getTime():(x.updatedAt||0)});rememberChatConversation({...d.conversation,vendor_name:name,last_message:last?.message||''});}catch{rows.push(x)}}rows.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));saveChatInbox(rows);box.innerHTML=rows.map(x=>`<button class="chat-inbox-row ${x.unread?'chat-row-unread':''}" type="button" onclick="openChat(${x.vendorId||'null'},'${esc(x.vendorName||'Admin').replace(/'/g,"\'")}',${Number(x.id)})"><span class="chat-avatar">${x.vendorId?esc((x.vendorName&&x.vendorName!=='Admin'?storeInitials(x.vendorName):'V')):'A'}</span><span class="chat-inbox-copy"><b>${esc(x.vendorName||'Admin')}</b><small>${esc(x.lastMessage||'No messages')}</small></span>${x.unread?`<span class="chat-row-badge">${x.unread>99?'99+':x.unread}</span>`:''}<span class="chat-chevron">›</span></button>`).join('');setChatUnreadBadge(rows.reduce((n,x)=>n+(Number(x.unread)||0),0));}
async function loadChatMessages(){if(!activeChatId)return;try{const d=await chatApi('/api/chat/messages/'+activeChatId);const box=$("chatMessages");if(!box)return;box.innerHTML=d.messages.length?d.messages.map(m=>`<div class="chat-bubble ${m.sender_type==='customer'?'mine':'theirs'}"><div>${esc(m.message)}</div>${m.product_id?`<button class="chat-product" onclick="buy(${m.product_id})">VIEW PRODUCT →</button>`:''}<small>${new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div>`).join(''):`<div class="muted chat-empty">Start the conversation.</div>`;box.scrollTop=box.scrollHeight;const last=d.messages?.[d.messages.length-1];const c=d.conversation||{};rememberChatConversation({...c,vendor_name:c.vendor_id?'Vendor':'Admin',last_message:last?.message||''})}catch{}}
function enableChatKeyboardLayout(){const input=$("chatText"),sheet=document.querySelector(".chat-sheet");if(!input||!sheet)return;const apply=()=>{const vv=window.visualViewport;const h=vv?vv.height:window.innerHeight;const height=Math.max(260,Math.round(h));sheet.style.setProperty("--chat-viewport-height",height+"px");document.documentElement.style.setProperty("--basse-vv-height",height+"px");sheet.classList.toggle("keyboard-open",document.activeElement===input);const box=$("chatMessages");if(box){box.style.scrollBehavior="auto";box.scrollTop=box.scrollHeight}const compose=sheet.querySelector(".chat-compose");if(compose&&document.activeElement===input){try{compose.scrollIntoView({block:"nearest",behavior:"auto"})}catch{}}};if(window.visualViewport){window.visualViewport.removeEventListener("resize",apply);window.visualViewport.addEventListener("resize",apply);window.visualViewport.removeEventListener("scroll",apply);window.visualViewport.addEventListener("scroll",apply)}input.addEventListener("focus",()=>{sheet.classList.add("keyboard-open");document.body.classList.add("basse-typing");setTimeout(apply,60);setTimeout(apply,180);setTimeout(apply,320)});input.addEventListener("blur",()=>{sheet.classList.remove("keyboard-open");document.body.classList.remove("basse-typing")});apply()}
function quickChat(text){const input=$("chatText");if(!input)return;input.value=text;input.style.fontSize='16px';input.focus();}
async function sendChatMessage(){const input=$("chatText"),text=input?.value.trim();if(!text||!activeChatId)return;const btn=document.querySelector('.chat-compose .pay');if(btn)btn.disabled=true;try{await chatApi('/api/chat/messages/'+activeChatId,{method:'POST',body:JSON.stringify({senderType:'customer',senderName:customerIdentity().name,message:text})});input.value='';await loadChatMessages();await renderChatInbox()}catch(e){toast(e.message)}finally{if(btn)btn.disabled=false}}
function stopChatPoll(){if(chatPoll){clearInterval(chatPoll);chatPoll=null}activeChatId=null}
function showSupport(){
  const modal=$("modal");
  modal.innerHTML=`<div class="sheet support-sheet"><button class="close" onclick="closeModal()">×</button><div class="checkout-head"><span class="support-modal-icon"><svg viewBox="0 0 48 48"><path d="M10 25v-4a14 14 0 0 1 28 0v4" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><rect x="6" y="23" width="9" height="13" rx="4" fill="none" stroke="currentColor" stroke-width="2.8"/><rect x="33" y="23" width="9" height="13" rx="4" fill="none" stroke="currentColor" stroke-width="2.8"/><path d="M33 36c-1 5-5 7-10 7h-3" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg></span><div><small>BASSE ONLINE SHOP</small><h2>Customer Support</h2></div></div><p class="muted">Need help with an order, payment or delivery? Call our support team.</p><div class="support-number">+220 6963349</div><a class="pay support-call" href="tel:+2206963349">CALL CUSTOMER SUPPORT <span>→</span></a><button class="secondary-btn" type="button" onclick="closeModal()">CLOSE</button></div>`;
  modal.classList.add('show');document.body.classList.add('basse-modal-open');syncVisualViewport();
}
function openAccount(){
  setActiveNav("account");
  const customer=JSON.parse(localStorage.getItem("basseCustomer")||"null");
  $("modal").innerHTML=`<div class="sheet account-sheet"><button class="close" onclick="closeModal()">×</button><div class="account-hero"><div class="account-avatar" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="16" r="7" fill="none" stroke="currentColor" stroke-width="3"/><path d="M10 41c1.5-9 6-13 14-13s12.5 4 14 13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></div><h2>${customer?`Welcome, ${esc(customer.name)}`:"BASSE MARKET ACCOUNT"}</h2><p>${customer?"Manage your shopping account.":"Shop as a guest or create an account."}</p></div>
  <button class="account-option track-account-option" type="button" onclick="trackOrderPrompt()"><span><b>Track an Order</b><small>Check your delivery status</small></span><span class="account-option-arrow">→</span></button>
  ${customer?`<button class="account-option" onclick="openOrders()"> <span><b>My Orders</b><small>View your recent purchases</small></span> →</button><button class="account-option" onclick="toast('Account details are saved on this device.')"> <span><b>My Details</b><small>${esc(customer.phone)}</small></span> →</button><button class="secondary-btn" onclick="localStorage.removeItem('basseCustomer');openAccount()">LOG OUT</button>`:
  `<button class="account-option" type="button" onclick="openCustomerSignup()"> <span><b>Create Customer Account</b><small>Optional — save your details and orders</small></span> →</button>
  <button class="account-option" type="button" onclick="openCustomerLogin()"> <span><b>Customer Login</b><small>Already have an account?</small></span> →</button>
  <button class="account-option vendor-option" type="button" onclick="openVendorApply()"> <span><b>Become a Vendor</b><small>Apply to open your own BASSE shop or service page</small></span> →</button>
  <button class="account-option" type="button" onclick="window.location.href='scanner.html'"> <span><b>Become a Scanner</b><small>For people who want to scan and validate event tickets</small></span> →</button>
  <button class="account-option vendor-login-option" type="button" onclick="openVendorLogin()"> <span><b>Vendor Login</b><small>Approved vendors: enter your phone and PIN</small></span> →</button>
  <div class="guest-note"> <b>Continue as Guest</b><br><span>No customer login is required to browse or place an order.</span></div>`}</div>`;
  $("modal").classList.add("show");resetModalSheet();
}
function openCustomerSignup(){
 $("modal").innerHTML=`<div class="sheet form-sheet"><button class="close" onclick="openAccount()">←</button><h2>Create Customer Account</h2><p class="muted">Optional — you can always shop as a guest.</p><div class="form"><label>Full Name</label><input id="caName" placeholder="Your name"><label>WhatsApp Number</label><input id="caPhone" inputmode="numeric" placeholder="7XXXXXX"><label>Password</label><input id="caPass" type="password" placeholder="Create a password"><button class="pay" onclick="createCustomer()">CREATE ACCOUNT</button><button class="secondary-btn" onclick="openAccount()">CONTINUE AS GUEST</button></div></div>`;$('modal').classList.add('show');resetModalSheet()
}
async function createCustomer(){let n=$("caName").value.trim(),p=$("caPhone").value.replace(/\D/g,"").replace(/^220/,""),pw=$("caPass").value;if(!n||p.length<6)return toast("Enter your name and valid WhatsApp number.");if(pw.length<4)return toast("Password must be at least 4 characters.");const btn=document.querySelector(".form-sheet .pay");if(btn){btn.disabled=true;btn.textContent="SENDING CODE..."}try{let r=await fetch("/api/customers/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n,whatsapp:p,password:pw})}),d=await r.json();if(!r.ok)throw Error(d.error||"Could not send verification code.");$("modal").innerHTML=`<div class="sheet form-sheet"><button class="close" onclick="openAccount()">←</button><h2>Verify Your Phone</h2><p class="muted">Enter the 6-digit code sent by SMS to +220 ${p}. The code expires in 5 minutes.</p><div class="form"><label>SMS Verification Code</label><input id="caOtp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code"><button class="pay" onclick="verifyCustomerOtp('${p}')">VERIFY & CREATE ACCOUNT</button><button class="secondary-btn" onclick="openCustomerSignup()">START AGAIN</button></div></div>`;$("modal").classList.add("show");resetModalSheet();toast("Verification code sent.")}catch(e){if(btn){btn.disabled=false;btn.textContent="CREATE ACCOUNT"}toast(e.message)}}
async function verifyCustomerOtp(p){let code=$("caOtp").value.replace(/\D/g,"");if(code.length!==6)return toast("Enter the 6-digit code.");const btn=document.querySelector(".form-sheet .pay");if(btn){btn.disabled=true;btn.textContent="VERIFYING..."}try{let r=await fetch("/api/customers/register/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({whatsapp:p,code})}),d=await r.json();if(!r.ok)throw Error(d.error||"Could not verify your phone.");localStorage.setItem("basseCustomer",JSON.stringify({name:d.full_name,phone:"+220 "+p,id:d.id,status:d.status}));openAccount();toast("Phone verified. Customer account created.")}catch(e){if(btn){btn.disabled=false;btn.textContent="VERIFY & CREATE ACCOUNT"}toast(e.message)}}
function openCustomerLogin(){
 $("modal").innerHTML=`<div class="sheet form-sheet"><button class="close" onclick="openAccount()">←</button><h2>Customer Login</h2><p class="muted">Login is optional. You can also continue shopping as a guest.</p><div class="form"><label>WhatsApp Number</label><input id="clPhone" inputmode="numeric" placeholder="7XXXXXX"><label>Password</label><input id="clPass" type="password" placeholder="Your password"><button class="pay" onclick="loginCustomer()">LOGIN</button><button class="secondary-btn" onclick="openAccount()">CONTINUE AS GUEST</button></div></div>`;$('modal').classList.add('show');resetModalSheet()
}
async function loginCustomer(){let p=$("clPhone").value.replace(/\D/g,"").replace(/^220/,""),pw=$("clPass").value;if(p.length<6||!pw)return toast("Enter your WhatsApp number and password.");try{let r=await fetch("/api/customers/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({whatsapp:p,password:pw})}),d=await r.json();if(!r.ok)throw Error(d.error||"Customer login failed.");localStorage.setItem("basseCustomer",JSON.stringify({name:d.full_name,phone:"+220 "+p,id:d.id,status:d.status}));openAccount();toast("Welcome back ")}catch(e){toast(e.message)}}
function openVendorApply(){
 $("modal").innerHTML=`<div class="sheet form-sheet"><button class="close" onclick="openAccount()">←</button><h2>Become a Vendor</h2><p class="muted">Apply to sell on BASSE MARKET. Admin will review your application.</p><div class="form"><label>Full Name</label><input id="vName" placeholder="Full name"><label>Business / Shop Name</label><input id="vBusiness" placeholder="Your shop name"><label>WhatsApp Number</label><input id="vPhone" inputmode="numeric" placeholder="7XXXXXX"><label>Location</label><input id="vLocation" placeholder="Basse"><label>Business Type</label><select id="vCategory"><option value="Electronics">Electronics</option><option value="Fashion">Fashion / Clothing</option><option value="Phones">Phones & Accessories</option><option value="Beauty">Beauty</option><option value="Food">Food / Restaurant</option><option value="Salon / Barber">Salon / Barber</option><option value="Tailoring">Tailoring / Custom Outfits</option><option value="Event Organizer">Event Organizer</option><option value="General Store">General Store</option><option value="Other Services">Other Services</option></select><label>Short Description</label><textarea id="vDesc" placeholder="Tell us about your business"></textarea><label>Create Vendor PIN</label><input id="vPass" type="password" inputmode="numeric" minlength="4" maxlength="5" pattern="[0-9]{4,5}" placeholder="4 or 5 digit PIN" required><button class="pay" onclick="submitVendor()">SUBMIT APPLICATION</button></div></div>`;$("modal").classList.add("show");resetModalSheet()
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
 $("modal").classList.add("show");resetModalSheet();
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
  const btn=document.querySelector(".form-sheet .pay");if(btn){btn.disabled=true;btn.textContent="SENDING CODE..."}
  try{
    let r=await fetch("/api/vendors/apply",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    let d=await r.json();if(!r.ok)throw Error(d.error||"Could not send verification code.");
    sessionStorage.setItem("basseVendorOtpPending",JSON.stringify({phone,pin,businessName:b.businessName,fullName:b.fullName}));
    $("modal").innerHTML=`<div class="sheet form-sheet"><button class="close" onclick="openAccount()">←</button><h2>Verify Vendor Phone</h2><p class="muted">Enter the 6-digit SMS code sent to +220 ${esc(phone)}. It expires in 5 minutes.</p><div class="form"><label>SMS Verification Code</label><input id="vOtpCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code"><button class="pay" onclick="verifyVendorApplication('${phone}')">VERIFY & SUBMIT APPLICATION</button><button class="secondary-btn" onclick="openVendorApply()">START AGAIN</button></div></div>`;$("modal").classList.add("show");resetModalSheet();toast("Verification code sent.");
  }catch(e){if(btn){btn.disabled=false;btn.textContent="SUBMIT APPLICATION"}toast(e.message)}
}
async function verifyVendorApplication(phone){
  let code=$("vOtpCode").value.replace(/\D/g,"");if(code.length!==6)return toast("Enter the 6-digit code.");
  const btn=document.querySelector(".form-sheet .pay");if(btn){btn.disabled=true;btn.textContent="VERIFYING..."}
  try{
    let r=await fetch("/api/vendors/apply/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({whatsapp:phone,code})});
    let d=await r.json();if(!r.ok)throw Error(d.error||"Could not verify vendor phone.");
    const pendingData=JSON.parse(sessionStorage.getItem("basseVendorOtpPending")||"{}");
    sessionStorage.removeItem("basseVendorOtpPending");
    sessionStorage.setItem("basseVendorApplication",JSON.stringify({phone,pin:pendingData.pin||"",id:d.id,businessName:d.businessName,fullName:d.fullName}));
    window.__vendorPendingName=d.fullName;
    showVendorPending(d.id,phone,pendingData.pin||"",d.businessName);
  }catch(e){if(btn){btn.disabled=false;btn.textContent="VERIFY & SUBMIT APPLICATION"}toast(e.message)}
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
  $("modal").classList.add("show");resetModalSheet();
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



updateCartCount();const initialSearch=new URLSearchParams(location.search).get("q");if(initialSearch){$("search").value=initialSearch;}loadProducts();loadStorePreview();handleReturn();setTimeout(()=>{if(new URLSearchParams(location.search).get("vendor")==="apply"){openVendorApply();history.replaceState({},"",location.pathname)}resumeVendorApplication();if(!new URLSearchParams(location.search).get("payment"))resumePendingPayment()},200);
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

startChatUnreadPolling();

function getOrderNotificationPhone(){
  try{
    const c=JSON.parse(localStorage.getItem("basseCustomer")||"null");
    if(c?.phone)return String(c.phone).replace(/\D/g,"").replace(/^220/,"");
    const p=localStorage.getItem("basseOrderPhone"); if(p)return String(p).replace(/\D/g,"").replace(/^220/,"");
    const o=JSON.parse(localStorage.getItem("basseLastOrder")||"null"); if(o?.whatsapp)return String(o.whatsapp).replace(/\D/g,"").replace(/^220/,"");
  }catch{}
  return "";
}
async function refreshOrderNotifications(){
  const phone=getOrderNotificationPhone();
  if(phone.length<6)return;
  try{
    const r=await fetch(`/api/customer/order-notifications?phone=${encodeURIComponent(phone)}`,{cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)return;
    const n=Number(d.unread||0), badge=$("orderNotifyBadge");
    if(badge){badge.textContent=n>99?"99+":n;badge.classList.toggle("hidden",n===0)}
  }catch{}
}
async function openOrderNotifications(){
  const phone=getOrderNotificationPhone();
  if(phone.length<6){
    toast("Place an order or enter your customer account phone number to receive order notifications.");
    return;
  }
  try{
    const r=await fetch(`/api/customer/order-notifications?phone=${encodeURIComponent(phone)}`,{cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.error||"Notifications unavailable.");
    const rows=d.notifications||[];
    $("modal").innerHTML=`<div class="sheet notification-sheet"><button class="close" onclick="closeModal()">×</button><div class="checkout-head"><span class="mini-bag">🔔</span><div><small>BASSE ONLINE SHOP</small><h2>Order Notifications</h2></div></div><p class="muted">Updates about your orders, payment and delivery appear here.</p><div class="order-notification-list">${rows.length?rows.map(x=>`<button type="button" class="order-notification ${x.read_at?"":"unread"}" onclick="openNotificationOrder('${esc(x.order_id||"")}')"><b>${esc(x.title)}</b><span>${esc(x.message)}</span><small>${esc(new Date(x.created_at).toLocaleString())}${x.order_id?` · ${esc(x.order_id)}`:""}</small></button>`).join(""):"<p class='muted'>No order notifications yet.</p>"}</div></div>`;
    $("modal").classList.add("show");resetModalSheet();
    await fetch("/api/customer/order-notifications/read",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone})});
    refreshOrderNotifications();
  }catch(e){toast(e.message||"Notifications unavailable.")}
}
function openNotificationOrder(id){
  if(!id)return;
  closeModal();
  trackOrderPrompt();
  setTimeout(()=>{const input=$("trackOrderId");if(input){input.value=id;$("trackPhone").value=getOrderNotificationPhone()}},50);
}
function startOrderNotificationPolling(){
  refreshOrderNotifications();
  clearInterval(window.__orderNotifyPolling);
  window.__orderNotifyPolling=setInterval(refreshOrderNotifications,5000);
}
startOrderNotificationPolling();

// Keep account/application fields visible above the iOS keyboard without retaining old scroll offsets.
document.addEventListener("focusin",e=>{
  if(!e.target||!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||!e.target.closest(".modal.show .sheet"))return;
  document.body.classList.add("basse-typing");
  const target=e.target;
  setTimeout(()=>{
    syncVisualViewport();
    const sheet=target.closest(".modal.show .sheet");
    if(!sheet||!target.isConnected)return;
    const rect=target.getBoundingClientRect();
    const h=window.visualViewport?.height||window.innerHeight;
    const topGuard=72,bottomGuard=h-22;
    if(rect.top<topGuard)sheet.scrollTop-=topGuard-rect.top;
    else if(rect.bottom>bottomGuard)sheet.scrollTop+=rect.bottom-bottomGuard;
  },140);
});
document.addEventListener("focusout",()=>{document.body.classList.remove("basse-typing");setTimeout(syncVisualViewport,120)});

/* ===== Product photo viewer: tap the picture to see it large; tap again to zoom; swipe for next photo ===== */
(function(){
  let v,idx=0,sx=0;
  function list(){return Array.isArray(window.__productImages)?window.__productImages.filter(Boolean):[]}
  function build(){
    if(v)return v;v=document.createElement('div');v.id='imgViewer';v.className='img-viewer';v.hidden=true;
    v.innerHTML='<button type="button" class="iv-close" aria-label="Close photo">×</button><button type="button" class="iv-nav iv-prev" aria-label="Previous photo">‹</button><div class="iv-stage"><img alt="Product photo"></div><button type="button" class="iv-nav iv-next" aria-label="Next photo">›</button><div class="iv-hint"><span class="iv-count"></span><span>Tap photo to zoom</span></div>';
    document.body.appendChild(v);
    v.querySelector('.iv-close').onclick=close;
    v.querySelector('.iv-prev').onclick=()=>show(idx-1);v.querySelector('.iv-next').onclick=()=>show(idx+1);
    const img=v.querySelector('img'),stage=v.querySelector('.iv-stage');
    img.onclick=()=>{v.classList.toggle('zoom');stage.scrollTo(0,0)};
    stage.addEventListener('click',e=>{if(e.target===stage)close()});
    v.addEventListener('touchstart',e=>{sx=e.touches[0].clientX},{passive:true});
    v.addEventListener('touchend',e=>{if(v.classList.contains('zoom'))return;const d=e.changedTouches[0].clientX-sx;if(Math.abs(d)>60)show(idx+(d<0?1:-1))},{passive:true});
    document.addEventListener('keydown',e=>{if(v.hidden)return;if(e.key==='Escape')close();if(e.key==='ArrowRight')show(idx+1);if(e.key==='ArrowLeft')show(idx-1)});
    return v;
  }
  function show(i){const l=list();if(!l.length)return;idx=(i+l.length)%l.length;const el=build();el.classList.remove('zoom');el.querySelector('img').src=l[idx];el.querySelector('.iv-count').textContent=l.length>1?(idx+1)+' / '+l.length:'';el.classList.toggle('single',l.length<2)}
  function open(src){const l=list();const el=build();idx=Math.max(0,l.indexOf(src));el.hidden=false;document.documentElement.classList.add('iv-open');show(idx)}
  function close(){if(!v)return;v.hidden=true;v.classList.remove('zoom');document.documentElement.classList.remove('iv-open')}
  document.addEventListener('click',e=>{const m=e.target.closest&&e.target.closest('#mainProductImage');if(m){e.preventDefault();open(m.getAttribute('src'))}});
})();
