let token=localStorage.getItem("basseVendorToken")||"";
const $=x=>document.getElementById(x),money=n=>"D"+Number(n||0).toLocaleString();
const H=()=>token?({Authorization:"Bearer "+token}):{};
async function api(u,o={}){
  let r=await fetch(u,{...o,headers:{...H(),...(o.headers||{})},cache:"no-store"});
  let d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||"Request failed");
  return d;
}
function showLogin(){
  token="";
  localStorage.removeItem("basseVendorToken");
  if($("app"))$("app").classList.add("hidden");
  if($("login"))$("login").classList.remove("hidden");
}
async function login(){
  const phone=($("phone")?.value||"").trim();
  const pin=($("pin")?.value||"").trim();
  if(!phone){alert("Enter your WhatsApp number.");return}
  if(!/^\d{4,5}$/.test(pin)){alert("PIN must be 4 or 5 digits.");return}
  const btn=document.querySelector("#login button");
  const old=btn?.textContent;
  if(btn){btn.disabled=true;btn.textContent="SIGNING IN…";}
  try{
    const r=await fetch("/api/vendor/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({whatsapp:phone,pin}),cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.error||"Invalid vendor login or account not approved.");
    token=d.token;
    localStorage.setItem("basseVendorToken",token);
    start();
  }catch(e){alert(e.message)}
  finally{if(btn){btn.disabled=false;btn.textContent=old||"LOGIN";}}
}
function start(){
  if($("login"))$("login").classList.add("hidden");
  if($("app"))$("app").classList.remove("hidden");
  refresh();
  startLive();
}
function logout(){
  if(window.__vendorFallbackTimer)clearInterval(window.__vendorFallbackTimer);
  if(window.__vendorLive)window.__vendorLive.close();
  showLogin();
}
async function refresh(){
  try{
    let [me,st,ps,os]=await Promise.all([
      api("/api/vendor/me"),api("/api/vendor/stats"),api("/api/vendor/products"),api("/api/vendor/orders")
    ]);
    $("shop").textContent=me.business_name;
    $("products").textContent=st.products;
    $("pending").textContent=st.pendingProducts;
    $("sales").textContent=money(st.sales);
    $("earnings").textContent=money(st.earnings);
    $("productsList").innerHTML=ps.map(p=>`<div class="product-row"><img src="${p.image||""}"><div><b>${esc(p.name)}</b><small>${money(p.price)} · Stock ${p.stock}</small></div><span class="badge">${p.approval_status}</span></div>`).join("")||"<p>No products yet.</p>";
    $("orders").innerHTML=os.map(o=>`<div class="order-row"><div><b>${esc(o.id)}</b><br><small>${esc(o.product_name)} × ${o.quantity} · ${esc(o.customer_name)}</small></div><b>${money(o.total)}</b><span class="badge">${o.payment_status}</span></div>`).join("")||"<p>No orders yet.</p>";
  }catch(e){
    if(/login|approved|unauthorized/i.test(e.message))showLogin();
  }
}
function startLive(){
  if(window.__vendorLive)window.__vendorLive.close();
  if(window.__vendorFallbackTimer)clearInterval(window.__vendorFallbackTimer);
  try{
    const es=new EventSource("/api/live");
    window.__vendorLive=es;
    const sync=()=>{if(token&&document.visibilityState==="visible")refresh()};
    es.addEventListener("orders",sync);
    es.addEventListener("catalog",sync);
    es.addEventListener("vendors",sync);
    es.onerror=()=>{es.close();window.__vendorLive=null;if(token)setTimeout(startLive,3000)};
  }catch{}
  window.__vendorFallbackTimer=setInterval(()=>{if(token&&document.visibilityState==="visible")refresh()},10000);
}
function openAdd(){
  $("modal").classList.remove("hidden");
  $("form").innerHTML=`<h2>Add Product</h2><form class="form" id="pf"><input name="name" placeholder="Product name" required><select name="category"><option>Fashion</option><option>Electronics</option><option>Phones</option><option>Beauty</option><option>Home & Living</option><option>Accessories</option></select><input name="price" type="number" placeholder="Price" required><input name="stock" type="number" placeholder="Stock" required><input name="images" type="file" accept="image/*" multiple><textarea name="description" placeholder="Description"></textarea><button type="submit">SUBMIT FOR APPROVAL</button></form>`;
  $("pf").onsubmit=submitProduct;
}
async function submitProduct(e){
  e.preventDefault();
  try{await api("/api/vendor/products",{method:"POST",body:new FormData(e.target)});$("modal").classList.add("hidden");refresh();alert("Product submitted for Admin approval.")}catch(x){alert(x.message)}
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
async function boot(){
  if(!token){showLogin();return}
  try{
    await api("/api/vendor/me");
    start();
  }catch{
    showLogin();
  }
}
document.addEventListener("DOMContentLoaded",()=>{
  $("login")?.addEventListener("keydown",e=>{
    if(e.key==="Enter"){e.preventDefault();e.stopPropagation();}
  });
  boot();
});
