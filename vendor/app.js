let token=localStorage.getItem("basseVendorToken")||"";const $=x=>document.getElementById(x),money=n=>"D"+Number(n||0).toLocaleString();const H=()=>({Authorization:"Bearer "+token});async function api(u,o={}){let r=await fetch(u,{...o,credentials:"same-origin",headers:{...H(),...(o.headers||{})}}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Request failed");return d}async function login(){try{let d=await api("/api/vendor/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({whatsapp:$("phone").value,pin:$("pin").value})});token=d.token;localStorage.setItem("basseVendorToken",token);start()}catch(e){alert(e.message)}}async function start(){
  try{
    if(!token)throw Error("no token");
    const me=await api("/api/vendor/me");
    $("login").classList.add("hidden");$("app").classList.remove("hidden");
    $("shop").textContent=me.business_name||"My Shop";
    refresh();
  }catch(e){
    localStorage.removeItem("basseVendorToken");token="";
    $("app").classList.add("hidden");$("login").classList.remove("hidden");
  }
}function logout(){
  localStorage.removeItem("basseVendorToken");
  if(window.__vendorFallbackTimer) clearInterval(window.__vendorFallbackTimer);
  location.href="/vendor/";
}async function refresh(){try{let [me,st,ps,os]=await Promise.all([api("/api/vendor/me"),api("/api/vendor/stats"),api("/api/vendor/products"),api("/api/vendor/orders")]);$("shop").textContent=me.business_name;$("products").textContent=st.products;$("pending").textContent=st.pendingProducts;$("sales").textContent=money(st.sales);$("earnings").textContent=money(st.earnings);$("productsList").innerHTML=ps.map(p=>`<div class="product-row"><img src="${p.image||""}"><div><b>${esc(p.name)}</b><small>${money(p.price)} · Stock ${p.stock}</small></div><span class="badge">${p.approval_status}</span></div>`).join("")||"<p>No products yet.</p>";$("orders").innerHTML=os.map(o=>`<div class="order-row"><div><b>${esc(o.id)}</b><br><small>${esc(o.product_name)} × ${o.quantity} · ${esc(o.customer_name)}</small></div><b>${money(o.total)}</b><span class="badge">${o.payment_status}</span></div>`).join("")||"<p>No orders yet.</p>"}catch(e){if(e.message.includes("login"))logout()}}function openApply(){
  $("modal").classList.remove("hidden");
  $("form").innerHTML=`<h2>Create Vendor Account</h2><p class="form-note">Apply to become a seller on BASSE ONLINE SHOP. Your PIN is saved securely on the server. Admin approval is required before login.</p><form class="form" id="vf"><input name="fullName" placeholder="Owner name" autocomplete="name" required><input name="businessName" placeholder="Business / shop name" autocomplete="organization" required><input name="whatsapp" placeholder="WhatsApp number" inputmode="numeric" autocomplete="tel" required><input name="email" type="email" placeholder="Gmail / Email address (optional)" autocomplete="email"><select name="category" required><option value="">Business category</option><option>Fashion</option><option>Electronics</option><option>Phones</option><option>Beauty</option><option>Home & Living</option><option>Accessories</option><option>Food</option><option>Other</option></select><input name="location" placeholder="Shop location" autocomplete="address-level2" required><textarea name="description" placeholder="Short description of your business"></textarea><input name="password" type="password" inputmode="numeric" maxlength="5" minlength="4" pattern="[0-9]{4,5}" autocomplete="new-password" placeholder="Create 4–5 digit PIN" required><input name="confirmPin" type="password" inputmode="numeric" maxlength="5" minlength="4" pattern="[0-9]{4,5}" autocomplete="new-password" placeholder="Confirm PIN" required><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">CANCEL</button><button>SUBMIT APPLICATION</button></div></form>`;
  $("vf").onsubmit=submitVendorApplication;
 }
 async function submitVendorApplication(e){
  e.preventDefault();
  const f=new FormData(e.target), pin=String(f.get("password")||"").trim(), confirm=String(f.get("confirmPin")||"").trim();
  if(!/^\d{4,5}$/.test(pin)){alert("PIN must be exactly 4 or 5 digits.");return}
  if(pin!==confirm){alert("PINs do not match.");return}
  try{
   const payload={fullName:f.get("fullName"),businessName:f.get("businessName"),whatsapp:f.get("whatsapp"),email:f.get("email"),category:f.get("category"),location:f.get("location"),description:f.get("description"),password:pin,confirmPin:confirm};
   const r=await fetch("/api/vendors/apply",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(d.error||"Unable to submit application.");
   showApplicationSubmitted(d);
  }catch(err){alert(err.message)}
 }
 function showApplicationSubmitted(d){
   const url=d.whatsappUrl||"";
   $("form").innerHTML=`<div class="success-box"><div class="success-icon">✓</div><h2>Application Submitted</h2><p>Your vendor application has been saved successfully. Your PIN is saved securely on the server.</p><p><b>Next:</b> Send the application details to BASSE ONLINE SHOP Admin on WhatsApp. Admin will approve the account from the dashboard.</p><button id="openVendorWhatsApp" ${url?"":"disabled"}>OPEN WHATSAPP</button><button class="secondary" type="button" onclick="closeModal()">DONE</button></div>`;
   if(url){
     $("openVendorWhatsApp").onclick=()=>{ window.location.href=url; };
     setTimeout(()=>{ try{window.location.href=url;}catch(e){} },400);
   }
 }
 function closeModal(){$("modal").classList.add("hidden");$("form").innerHTML=""}

function openAdd(){$("modal").classList.remove("hidden");$("form").innerHTML=`<h2>Add Product</h2><form class="form" id="pf"><input name="name" placeholder="Product name" required><select name="category"><option>Fashion</option><option>Electronics</option><option>Phones</option><option>Beauty</option><option>Home & Living</option><option>Accessories</option></select><input name="price" type="number" placeholder="Price" required><input name="stock" type="number" placeholder="Stock" required><input name="images" type="file" accept="image/*" multiple><textarea name="description" placeholder="Description"></textarea><button>SUBMIT FOR APPROVAL</button></form>`;$("pf").onsubmit=submitProduct}async function submitProduct(e){e.preventDefault();try{await api("/api/vendor/products",{method:"POST",body:new FormData(e.target)});$("modal").classList.add("hidden");refresh();alert("Product submitted for Admin approval.")}catch(x){alert(x.message)}}function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}if(token)start();
// Refresh only when the server tells the dashboard something changed.
// This avoids the old 10-second polling loop that made mobile devices feel frozen.
function connectVendorLive(){
 if(!localStorage.getItem("basseVendorToken"))return;
 try{
  const es=new EventSource("/api/live");
  const sync=()=>{if(document.visibilityState==="visible")refresh()};
  es.addEventListener("orders",sync);es.addEventListener("catalog",sync);es.addEventListener("vendors",sync);
  es.onerror=()=>{es.close();setTimeout(connectVendorLive,5000)};
  window.__vendorEventSource=es;
 }catch{setTimeout(connectVendorLive,5000)}
}
if(token)connectVendorLive();
