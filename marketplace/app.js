let category="All",selected=null,searchTimer=null,searchIndex=[];
const $=id=>document.getElementById(id),money=n=>"D"+Number(n||0).toLocaleString();

async function loadProducts(){
  try{
    const r=await fetch(`/api/products?category=${encodeURIComponent(category)}&q=${encodeURIComponent($("search").value.trim())}`);
    const ps=await r.json();
    $("count").textContent=ps.length+" products";
    $("grid").innerHTML=ps.length?ps.map(p=>`<article class="product reveal" tabindex="0" role="button" onclick="buy(${p.id})" onkeydown="if(event.key==='Enter'||event.key===' ')buy(${p.id})"><div class="pic"><img src="${p.image||""}" alt="${esc(p.name)}" loading="lazy"><span class="tag">${esc(p.category)}</span></div><div class="info"><h3>${esc(p.name)}</h3><div class="price">${money(p.price)}</div></div></article>`).join(""):`<div class="empty-search"><div>🔎</div><h3>No products found</h3><p>Try another product name or category.</p></div>`;
    $("clearSearch").classList.toggle("show",!!$("search").value.trim());
    requestAnimationFrame(()=>document.querySelectorAll(".reveal").forEach((x,i)=>setTimeout(()=>x.classList.add("in"),i*35)));
  }catch(e){$("grid").innerHTML='<div class="empty-search"><div>⚠️</div><h3>Shop temporarily unavailable</h3><p>Please refresh and try again.</p></div>'}
}
async function loadSearchIndex(){try{let r=await fetch("/api/products?category=All");searchIndex=await r.json()}catch{searchIndex=[]}}
function showSuggestions(){let term=$("search").value.trim().toLowerCase(),box=$("searchSuggestions");if(!term){box.classList.remove("show");box.innerHTML="";return}let matches=searchIndex.filter(p=>(p.name+" "+p.category+" "+(p.description||"")).toLowerCase().includes(term)).slice(0,7);box.innerHTML=matches.length?matches.map(p=>`<button type="button" class="suggest-item" onclick="pickSuggestion(${p.id})"><span class="suggest-icon">🔎</span><span><b>${esc(p.name)}</b><small>${esc(p.category)} · ${money(p.price)}</small></span></button>`).join(""):"<div class=suggest-empty>No matching products</div>";box.classList.add("show")}
function pickSuggestion(id){let p=searchIndex.find(x=>x.id===id);if(!p)return;$("search").value=p.name;$("searchSuggestions").classList.remove("show");loadProducts();document.querySelector("#products").scrollIntoView({behavior:"smooth",block:"start"})}
function runSearch(){clearTimeout(searchTimer);searchTimer=setTimeout(loadProducts,160);showSuggestions()}
function clearSearch(){$("search").value="";$('searchSuggestions').classList.remove("show");loadProducts();$('search').focus()}
function setCat(c,b){category=c;document.querySelectorAll(".cats button").forEach(x=>x.classList.remove("active"));b.classList.add("active");loadProducts();document.querySelector("#products").scrollIntoView({behavior:"smooth",block:"start"})}

async function buy(id){
  try{
    let r=await fetch("/api/products/"+id);selected=await r.json();if(!r.ok)throw new Error(selected.error||"Product unavailable");
    let imgs=[];try{imgs=JSON.parse(selected.images||"[]")}catch(e){};if(!Array.isArray(imgs))imgs=[];if(selected.image&&!imgs.includes(selected.image))imgs.unshift(selected.image);if(!imgs.length)imgs=[""];
    $("modal").innerHTML=`<div class="sheet product-sheet"><button class="close" onclick="closeModal()">×</button><div class="product-detail"><div class="gallery"><img id="mainProductImage" src="${imgs[0]}" alt="${esc(selected.name)}">${imgs.length>1?`<div class="thumbs">${imgs.map((im,i)=>`<button class="${i===0?'active':''}" onclick="pickImage(${i})"><img src="${im}" alt=""></button>`).join("")}</div>`:""}</div><div class="detail-info"><span class="tagline">${esc(selected.category)}</span><h2>${esc(selected.name)}</h2><div class="detail-price">${money(selected.price)}</div><p class="muted">${esc(selected.description||"Quality product from BASSE MARKET.")}</p><div class="stock-note">${selected.stock>0?`✓ ${selected.stock} available`:"Out of stock"}</div><label>Quantity</label><div class="qty-row"><button type="button" onclick="changeQty(-1)">−</button><input id="qty" type="number" min="1" max="${selected.stock}" value="1"><button type="button" onclick="changeQty(1)">+</button></div><div class="summary"><div class="row"><span>Price</span><b>${money(selected.price)}</b></div><div class="row total-row"><span>Total</span><b id="total">${money(selected.price)}</b></div></div><button class="pay pulse" ${selected.stock<1?"disabled":""} onclick="openCheckout()">🛒 BUY NOW <span>→</span></button></div></div></div>`;
    window.__productImages=imgs;$("modal").classList.add("show");
  }catch(e){toast(e.message)}
}
function pickImage(i){let im=window.__productImages?.[i];if(im){$("mainProductImage").src=im;document.querySelectorAll(".thumbs button").forEach((b,n)=>b.classList.toggle("active",n===i))}}
function openCheckout(){
  if(!selected)return;
  $("modal").innerHTML=`<div class="sheet checkout-sheet"><button class="close" onclick="buy(${selected.id})">←</button><div class="checkout-head"><span class="mini-bag">🛍️</span><div><small>SECURE CHECKOUT</small><h2>Your order</h2></div></div><p class="muted">${esc(selected.name)}</p><div class="form"><label>Quantity</label><div class="qty-row"><button type="button" onclick="changeQty(-1)">−</button><input id="qty" type="number" min="1" max="${selected.stock}" value="1"><button type="button" onclick="changeQty(1)">+</button></div><label>Full Name</label><input id="name" autocomplete="name" placeholder="Your name"><label>WhatsApp Number</label><input id="phone" inputmode="numeric" autocomplete="tel" placeholder="7XXXXXX"><small>+220 will be added automatically.</small><label>Location</label><select id="loc"><option>Basse</option><option>Bansang</option><option>Fatoto</option><option>Other</option></select><div class="summary"><div class="row"><span>Product</span><b>${money(selected.price)}</b></div><div class="row total-row"><span>Total</span><b id="total">${money(selected.price)}</b></div></div><button class="pay pulse" onclick="placeOrder()">💳 PAY WITH WAYCHIT <span>→</span></button><div class="secure-note">🔒 Secure checkout · You will be redirected to Waychit</div></div></div>`;
  $("modal").classList.add("show");$("qty").oninput=updateTotal;$("phone").addEventListener("keydown",e=>{if(e.key==="Enter")placeOrder()});
}
function changeQty(d){let q=Math.max(1,Math.min(selected.stock,(+$('qty').value||1)+d));$('qty').value=q;updateTotal()}
function updateTotal(){$("total").textContent=money(selected.price*Math.max(1,Math.min(selected.stock,+$("qty").value||1)))}

async function placeOrder(){
  let q=Math.max(1,Math.min(selected.stock,+$("qty").value||1)),phone=$("phone").value.replace(/\D/g,"").replace(/^220/,"");
  if(!$('name').value.trim())return toast("Please enter your full name.");
  if(phone.length<6)return toast("Please enter a valid WhatsApp number.");
  let btn=document.querySelector('.pay');if(btn){btn.disabled=true;btn.innerHTML="⏳ CONNECTING TO WAYCHIT…"}
  try{
    let r=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:selected.id,quantity:q,name:$('name').value.trim(),whatsapp:phone,location:$('loc').value})});
    let d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||"Could not create your order.");
    localStorage.setItem("basseLastOrder",JSON.stringify(d.order));
    if(d.paymentUrl){
      localStorage.setItem("bassePaymentMode",d.paymentMode||"dynamic");
      if(d.paymentMode==="fallback") toast("Opening Waychit checkout…");
      setTimeout(()=>window.location.href=d.paymentUrl,120);
      return;
    }
    throw new Error(d.paymentError||"Waychit payment could not be started.");
  }catch(e){if(btn){btn.disabled=false;btn.innerHTML="💳 PAY WITH WAYCHIT <span>→</span>"}showReturn({id:"",total:selected.price*q,whatsappSupport:""},"",false,"",e.message||"Payment could not be started.")}
}
function receiptMessage(o){return `Hello BASSE ONLINE SHOP 👋\n\nI have paid for my order.\n\nOrder: ${o.id}\nProduct: ${o.product_name} × ${o.quantity}\nTotal: ${money(o.total)}\nLocation: ${o.location}\nCustomer WhatsApp: +${o.whatsapp}\nPayment: PAID\n\nPlease confirm my order. Thank you.`}
function showReturn(o,msg,paid,adminWhatsApp,note=""){
  let target=String(adminWhatsApp||o.whatsappSupport||"").replace(/\D/g,"");
  let href=target?`https://wa.me/${target}?text=${encodeURIComponent(msg||receiptMessage(o))}`:"#";
  $("modal").innerHTML=`<div class="sheet return-sheet"><button class="close" onclick="closeModal()">×</button><div class="result-icon">${paid?"✓":"🧾"}</div><h2>${paid?"Payment successful!":"Order received"}</h2><p>${paid?"Your payment has been confirmed.":note||"Your order has been received."}</p>${o.id?`<div class="summary"><div class="row"><span>Order</span><b>${esc(o.id)}</b></div><div class="row"><span>Total</span><b>${money(o.total)}</b></div><div class="row"><span>Payment</span><b>${paid?"PAID":"PENDING"}</b></div></div>`:""}${target&&o.id?`<a class="whats" href="${href}" target="_blank" rel="noopener">💬 SEND ORDER TO BASSE SHOP</a>`:""}<button class="secondary-btn" onclick="closeModal()">CONTINUE SHOPPING</button></div>`;$('modal').classList.add('show')
}
async function waitForPayment(id,attempt=0){try{let r=await fetch("/api/order/"+encodeURIComponent(id));let o=await r.json();if(o.payment_status==="PAID")return showReturn(o,"",true,o.whatsappSupport);if(o.payment_status==="CANCELLED"||o.payment_status==="REFUNDED")return showReturn(o,"",false,o.whatsappSupport,"This payment is no longer active.");if(attempt<20)return setTimeout(()=>waitForPayment(id,attempt+1),2000);showReturn(o,"",false,o.whatsappSupport,"Payment is still being verified. If you already paid, refresh this order in a moment.")}catch{showReturn({id,total:0},"",false,"","We could not verify the payment right now.")}}
function handleReturn(){let u=new URLSearchParams(location.search),st=u.get("payment"),id=u.get("order");if(!id||!st)return;history.replaceState({},document.title,"/");if(st==="success")waitForPayment(id);else fetch("/api/order/"+encodeURIComponent(id)).then(r=>r.json()).then(o=>showReturn(o,"",false,o.whatsappSupport,"The Waychit payment was not completed. Your order is still pending."))}
function closeModal(){$("modal").classList.remove("show")}
function openCart(){toast("Cart checkout is coming next — Buy Now is fully active.")}
async function openOrders(){let raw=localStorage.getItem("basseLastOrder");if(!raw)return toast("No recent order found on this phone.");try{let old=JSON.parse(raw),r=await fetch("/api/order/"+encodeURIComponent(old.id)),o=await r.json();if(!r.ok)throw new Error(o.error||"Order not found");showReturn(o,"",o.payment_status==="PAID",o.whatsappSupport,o.payment_status==="PENDING"?"Your order is waiting for payment confirmation.":"")}catch(e){toast(e.message)}}


function openAccount(){
  const customer=JSON.parse(localStorage.getItem("basseCustomer")||"null");
  $("modal").innerHTML=`<div class="sheet account-sheet"><button class="close" onclick="closeModal()">×</button><div class="account-hero"><div class="account-avatar">👤</div><h2>${customer?`Welcome, ${esc(customer.name)}`:"BASSE MARKET ACCOUNT"}</h2><p>${customer?"Manage your shopping account.":"Shop as a guest or create an account."}</p></div>
  ${customer?`<button class="account-option" onclick="openOrders()">📦 <span><b>My Orders</b><small>View your recent purchases</small></span> →</button><button class="account-option" onclick="toast('Account details are saved on this device.')">⚙️ <span><b>My Details</b><small>${esc(customer.phone)}</small></span> →</button><button class="secondary-btn" onclick="localStorage.removeItem('basseCustomer');openAccount()">LOG OUT</button>`:
  `<button class="account-option" onclick="openCustomerSignup()">🛍️ <span><b>Customer Account</b><small>Create an account for order history</small></span> →</button><button class="account-option vendor-option" onclick="openVendorApply()">🏪 <span><b>Become a Vendor</b><small>Apply to sell on BASSE MARKET</small></span> →</button><p class="guest-note">You can buy without creating an account.</p>`}</div>`;
  $("modal").classList.add("show")
}
function openCustomerSignup(){
 $("modal").innerHTML=`<div class="sheet form-sheet"><button class="close" onclick="openAccount()">←</button><h2>Create Customer Account</h2><p class="muted">Optional — you can always shop as a guest.</p><div class="form"><label>Full Name</label><input id="caName" placeholder="Your name"><label>WhatsApp Number</label><input id="caPhone" inputmode="numeric" placeholder="7XXXXXX"><label>Password</label><input id="caPass" type="password" placeholder="Create a password"><button class="pay" onclick="createCustomer()">CREATE ACCOUNT</button></div></div>`;$("modal").classList.add("show")
}
function createCustomer(){let n=$("caName").value.trim(),p=$("caPhone").value.replace(/\D/g,"").replace(/^220/,"");if(!n||p.length<6)return toast("Enter your name and valid WhatsApp number.");localStorage.setItem("basseCustomer",JSON.stringify({name:n,phone:"+220 "+p}));openAccount();toast("Customer account created ✓")}
function openVendorApply(){
 $("modal").innerHTML=`<div class="sheet form-sheet"><button class="close" onclick="openAccount()">←</button><h2>Become a Vendor</h2><p class="muted">Your application goes to BASSE MARKET Admin for approval.</p><div class="form"><label>Full Name</label><input id="vName" placeholder="Full name"><label>Business / Shop Name</label><input id="vBusiness" placeholder="Your shop name"><label>WhatsApp Number</label><input id="vPhone" inputmode="numeric" placeholder="7XXXXXX"><label>Location</label><input id="vLocation" placeholder="Basse"><label>Category</label><input id="vCategory" placeholder="Fashion, Phones, Beauty..."><label>Short Description</label><textarea id="vDesc" placeholder="Tell us about your business"></textarea><label>Create Vendor PIN</label><input id="vPass" type="password" inputmode="numeric" maxlength="5" placeholder="4–5 digits"><button class="pay" onclick="submitVendor()">SUBMIT APPLICATION</button></div></div>`;$("modal").classList.add("show")
}
async function submitVendor(){let b={fullName:$("vName").value,businessName:$("vBusiness").value,whatsapp:$("vPhone").value,location:$("vLocation").value,category:$("vCategory").value,description:$("vDesc").value,password:$("vPass").value};if(!b.fullName||!b.businessName||String(b.whatsapp).replace(/\D/g,"").length<6||!/^[0-9]{4,5}$/.test(b.password))return toast("Complete the form and use a 4–5 digit PIN.");try{let r=await fetch("/api/vendors/apply",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}),d=await r.json();if(!r.ok)throw Error(d.error||"Application failed");$("modal").innerHTML=`<div class="sheet return-sheet"><div class="result-icon">✓</div><h2>Application sent!</h2><p>Your vendor application is now waiting for Admin approval.</p><button class="secondary-btn" onclick="closeModal()">DONE</button></div>`}catch(e){toast(e.message)}}

function toast(t){let x=$("toast");x.textContent=t;x.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>x.classList.remove("show"),2800)}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
$("search").addEventListener("input",runSearch);$("search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("searchSuggestions").classList.remove("show");loadProducts();document.querySelector("#products").scrollIntoView({behavior:"smooth",block:"start"})}if(e.key==="Escape")clearSearch()});$("searchBtn").addEventListener("click",()=>{$("searchSuggestions").classList.remove("show");loadProducts();document.querySelector("#products").scrollIntoView({behavior:"smooth",block:"start"});});$("clearSearch").addEventListener("click",clearSearch);document.addEventListener("click",e=>{if(!e.target.closest(".search-wrap"))$("searchSuggestions").classList.remove("show")});
loadSearchIndex().then(loadProducts);handleReturn();
// Instant catalog/order updates. EventSource reconnects automatically if the connection drops.
function connectLive(){
  try{
    const es=new EventSource("/api/live");
    es.addEventListener("catalog",()=>{loadSearchIndex();if(document.visibilityState==="visible"&&!$("modal").classList.contains("show"))loadProducts();});
    es.addEventListener("orders",()=>{if(document.visibilityState==="visible"&&localStorage.getItem("basseLastOrder"))openOrders().catch(()=>{});});
    es.onerror=()=>{es.close();setTimeout(connectLive,3000)};
  }catch{setTimeout(connectLive,3000)}
}
connectLive();
// Safety fallback for networks that block EventSource.
setInterval(()=>{if(document.visibilityState==="visible"&&!$("modal").classList.contains("show"))loadProducts()},5000);
