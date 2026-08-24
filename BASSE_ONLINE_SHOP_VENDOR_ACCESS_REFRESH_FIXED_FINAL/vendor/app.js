let token=localStorage.getItem("basseVendorToken")||"";const $=x=>document.getElementById(x),money=n=>"D"+Number(n||0).toLocaleString();const H=()=>({Authorization:"Bearer "+token});async function api(u,o={}){let r=await fetch(u,{...o,headers:{...H(),...(o.headers||{})}}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Request failed");return d}async function login(){try{let d=await api("/api/vendor/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({whatsapp:$("phone").value,pin:$("pin").value})});token=d.token;localStorage.setItem("basseVendorToken",token);start()}catch(e){alert(e.message)}}function start(){$("login").classList.add("hidden");$("app").classList.remove("hidden");refresh()}function logout(){
  localStorage.removeItem("basseVendorToken");
  if(window.__vendorFallbackTimer) clearInterval(window.__vendorFallbackTimer);
  location.href="/vendor/";
}async function refresh(){try{let [me,st,ps,os]=await Promise.all([api("/api/vendor/me"),api("/api/vendor/stats"),api("/api/vendor/products"),api("/api/vendor/orders")]);$("shop").textContent=me.business_name;$("products").textContent=st.products;$("pending").textContent=st.pendingProducts;$("sales").textContent=money(st.sales);$("earnings").textContent=money(st.earnings);$("productsList").innerHTML=ps.map(p=>`<div class="product-row"><img src="${p.image||""}"><div><b>${esc(p.name)}</b><small>${money(p.price)} · Stock ${p.stock}</small></div><span class="badge">${p.approval_status}</span></div>`).join("")||"<p>No products yet.</p>";$("orders").innerHTML=os.map(o=>`<div class="order-row"><div><b>${esc(o.id)}</b><br><small>${esc(o.product_name)} × ${o.quantity} · ${esc(o.customer_name)}</small></div><b>${money(o.total)}</b><span class="badge">${o.payment_status}</span></div>`).join("")||"<p>No orders yet.</p>"}catch(e){if(e.message.includes("login"))logout()}}function openAdd(){$("modal").classList.remove("hidden");$("form").innerHTML=`<h2>Add Product</h2><form class="form" id="pf"><input name="name" placeholder="Product name" required><select name="category"><option>Fashion</option><option>Electronics</option><option>Phones</option><option>Beauty</option><option>Home & Living</option><option>Accessories</option></select><input name="price" type="number" placeholder="Price" required><input name="stock" type="number" placeholder="Stock" required><input name="images" type="file" accept="image/*" multiple><textarea name="description" placeholder="Description"></textarea><button>SUBMIT FOR APPROVAL</button></form>`;$("pf").onsubmit=submitProduct}async function submitProduct(e){e.preventDefault();try{await api("/api/vendor/products",{method:"POST",body:new FormData(e.target)});$("modal").classList.add("hidden");refresh();alert("Product submitted for Admin approval.")}catch(x){alert(x.message)}}function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}if(token)start();
// Keep vendor dashboard synchronized with approvals, orders and marketplace changes.
function connectVendorLive(){
  if(!localStorage.getItem("basseVendorToken")) return;
  try{const es=new EventSource("/api/live");const sync=()=>{if(typeof refresh==='function')refresh();else if(typeof load==='function')load()};es.addEventListener("orders",sync);es.addEventListener("catalog",sync);es.addEventListener("vendors",sync);es.onerror=()=>{es.close();setTimeout(connectVendorLive,3000)}}catch{setTimeout(connectVendorLive,3000)}}
if(token){
  connectVendorLive();
  window.__vendorFallbackTimer=setInterval(()=>{if(document.visibilityState==="visible" && localStorage.getItem("basseVendorToken")){refresh()}},10000);
}

(function(){
  function initVendorLogin(){
    const form=document.getElementById("loginForm");
    if(!form || form.dataset.fixedLogin==="1") return;
    form.dataset.fixedLogin="1";
    form.setAttribute("novalidate","novalidate");
    form.addEventListener("submit", async function(e){
      e.preventDefault();
      e.stopImmediatePropagation();
      const phone=(document.getElementById("phone")?.value||"").trim();
      const pin=(document.getElementById("pin")?.value||"").trim();
      if(!phone){ alert("Enter your WhatsApp/phone number."); return; }
      if(!/^\d{4,5}$/.test(pin)){ alert("PIN must be 4 or 5 digits."); return; }
      const btn=form.querySelector("button[type=submit],button");
      const old=btn?.textContent;
      if(btn){btn.disabled=true;btn.textContent="Checking…";}
      try{
        const r=await fetch("/api/vendor/login",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({phone,pin}),
          credentials:"same-origin"
        });
        const d=await r.json().catch(()=>({}));
        if(!r.ok) throw new Error(d.error||"Vendor login failed.");
        sessionStorage.setItem("vendorLoggedIn","1");
        sessionStorage.setItem("vendorProfile",JSON.stringify(d));
        window.location.replace("/vendor/");
      }catch(err){
        alert(err.message);
        if(btn){btn.disabled=false;btn.textContent=old||"LOGIN";}
      }
    }, true);
    form.addEventListener("keydown", function(e){
      if(e.key==="Enter"){
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",initVendorLogin);
  else initVendorLogin();
})();
