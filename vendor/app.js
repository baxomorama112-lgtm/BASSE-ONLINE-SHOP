let token=localStorage.getItem("basseVendorToken")||"";
const $=x=>document.getElementById(x),money=n=>"D"+Number(n||0).toLocaleString();
const H=()=>token?({Authorization:"Bearer "+token}):{};
const draftKey=()=>`basseVendorProductDraft:${token||"guest"}`;
let submitBusy=false;
let currentSubmissionKey="";
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
    let [me,st,ps,os,ts]=await Promise.all([
      api("/api/vendor/me"),api("/api/vendor/stats"),api("/api/vendor/products"),api("/api/vendor/orders"),api("/api/vendor/transactions")
    ]);
    $("shop").textContent=me.business_name;
    $("products").textContent=st.products;
    $("pending").textContent=st.pendingProducts;
    $("sales").textContent=money(st.sales);
    $("earnings").textContent=money(st.earnings);
    $("productsList").innerHTML=ps.map(p=>`<div class="product-row"><img src="${p.image||""}"><div><b>${esc(p.name)}</b><small>${money(p.price)} · Stock ${p.stock}</small></div><span class="badge">${p.approval_status}</span></div>`).join("")||"<p>No products yet.</p>";
    $("orders").innerHTML=os.map(o=>`<div class="order-row"><div><b>${esc(o.id)}</b><br><small>${esc(o.product_name)} × ${o.quantity} · ${esc(o.customer_name)}</small></div><b>${money(o.total)}</b><span class="badge">${o.payment_status}</span></div>`).join("")||"<p>No orders yet.</p>";
    $("transactions").innerHTML=ts.map(t=>`<div class="order-row"><div><b>${esc(t.id)}</b><br><small>${esc(t.product_name)} × ${t.quantity} · ${esc(t.created_at||"")}</small></div><div><b>${money(t.total)}</b><br><small>Commission ${money(t.commission)} · Earnings ${money(t.vendor_earnings)}</small></div><span class="badge">${t.payment_status}</span></div>`).join("")||"<p>No transactions yet.</p>";
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
function saveDraft(form){
  const data={};
  new FormData(form).forEach((v,k)=>{if(typeof v==="string")data[k]=v});
  if(currentSubmissionKey)data.__submissionKey=currentSubmissionKey;
  localStorage.setItem(draftKey(),JSON.stringify(data));
}
function restoreDraft(form){
  try{
    const d=JSON.parse(localStorage.getItem(draftKey())||"null");
    if(!d)return;
    ["name","price","stock","description"].forEach(k=>{if(d[k]!==undefined&&form.elements[k])form.elements[k].value=d[k]});
    if(d.category&&form.elements.category)form.elements.category.value=d.category;
    if(d.__submissionKey)currentSubmissionKey=d.__submissionKey;
    if(d.name||d.price||d.stock||d.description)showToast("Draft restored", "info");
  }catch{}
}
function clearDraft(){localStorage.removeItem(draftKey())}
function showToast(message,type="success"){
  const t=$("toast");if(!t)return;
  t.className=`toast ${type}`;
  t.innerHTML=type==="success"?`<span class="toast-check">✓</span><span>${esc(message)}</span>`:`<span>${esc(message)}</span>`;
  clearTimeout(window.__toastTimer);
  requestAnimationFrame(()=>t.classList.add("show"));
  window.__toastTimer=setTimeout(()=>t.classList.remove("show"),4200);
}
function closeModal(){
  if(submitBusy)return;
  $("modal")?.classList.add("hidden");
}
function openAdd(){
  submitBusy=false;
  currentSubmissionKey="";
  $("modal").classList.remove("hidden");
  $("form").innerHTML=`<button class="modal-close" type="button" aria-label="Close" onclick="closeModal()">×</button><div class="modal-title"><h2>Add Product</h2><p>Submit your product once. It will stay saved while waiting for Admin approval.</p></div><form class="form" id="pf"><input name="name" placeholder="Product name" autocomplete="off" required><select name="category"><option>Fashion</option><option>Electronics</option><option>Phones</option><option>Beauty</option><option>Home & Living</option><option>Accessories</option></select><input name="price" type="number" min="0" step="1" inputmode="numeric" placeholder="Price" required><input name="stock" type="number" min="0" step="1" inputmode="numeric" placeholder="Stock" required><label class="file-label"><span>Product photos</span><input name="images" type="file" accept="image/*" multiple></label><textarea name="description" placeholder="Description"></textarea><button class="submit-product" type="submit"><span>✓</span> SUBMIT FOR APPROVAL <b>→</b></button><div class="submit-note">One click • Saved securely • Admin approval required</div></form>`;
  const form=$("pf");
  restoreDraft(form);
  form.addEventListener("input",()=>saveDraft(form));
  form.addEventListener("change",()=>saveDraft(form));
  form.onsubmit=submitProduct;
  setTimeout(()=>form.elements.name?.focus(),50);
}
async function submitProduct(e){
  e.preventDefault();
  if(submitBusy)return;
  const form=e.currentTarget;
  if(!form.reportValidity())return;
  submitBusy=true;
  const btn=form.querySelector(".submit-product");
  const original=btn.innerHTML;
  btn.disabled=true;btn.classList.add("is-submitting");btn.innerHTML=`<span class="spinner"></span> SUBMITTING…`;
  if(!currentSubmissionKey)currentSubmissionKey=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  saveDraft(form);
  const key=currentSubmissionKey;
  const body=new FormData(form);
  try{
    const d=await api("/api/vendor/products",{method:"POST",headers:{"X-Idempotency-Key":key},body});
    clearDraft();
    $("modal").classList.add("hidden");
    refresh();
    showToast("Product submitted successfully ✓ Waiting for Admin approval.");
  }catch(x){
    // Keep the form open and the draft intact so a dropped network never loses the entry.
    submitBusy=false;
    btn.disabled=false;btn.classList.remove("is-submitting");btn.innerHTML=original;
    showToast(x.message||"Network problem. Your product is still here — press submit again.","error");
  }
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
async function boot(){
  if(!token){showLogin();return}
  try{await api("/api/vendor/me");start()}catch{showLogin()}
}
document.addEventListener("DOMContentLoaded",()=>{
  $("login")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();e.stopPropagation();}});
  $("modal")?.addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});
  boot();
});
