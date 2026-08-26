let token=localStorage.getItem("basseAdminToken")||"";
function cacheAdminProducts(ps){try{if(Array.isArray(ps)&&ps.length)localStorage.setItem("basseAdminProductsCache",JSON.stringify(ps))}catch{}}
function cachedAdminProducts(){try{const p=JSON.parse(localStorage.getItem("basseAdminProductsCache")||"[]");return Array.isArray(p)?p:[]}catch{return []}}
const H=()=>({Authorization:"Bearer "+token}),$=id=>document.getElementById(id),money=n=>"D"+Number(n||0).toLocaleString();
async function login(){try{let r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("email").value,password:$("password").value})}),d=await r.json();if(!r.ok)throw new Error(d.error||"Invalid login");token=d.token;localStorage.setItem("basseAdminToken",token);start()}catch(e){notify(e.message,true)}}
function start(){$("login").classList.add("hidden");$("app").classList.remove("hidden");refresh();refreshBackupStatus();clearInterval(window.__refresh);window.__refresh=setInterval(refresh,5000);clearInterval(window.__backupRefresh);window.__backupRefresh=setInterval(refreshBackupStatus,10000);connectLive()}
function connectLive(){try{const es=new EventSource("/api/live");es.addEventListener("refresh",()=>refresh());es.addEventListener("catalog",()=>refresh());es.addEventListener("orders",()=>refresh());es.addEventListener("vendors",()=>refresh());es.onerror=()=>{es.close();setTimeout(connectLive,3000)}}catch{setTimeout(connectLive,3000)}}
async function logout(){try{await fetch("/api/auth/logout",{method:"POST",headers:H()})}catch{} localStorage.removeItem("basseAdminToken");location.reload()}
function show(id,btn){["dashboard","products","orders","vendors","customers","backup"].forEach(x=>$(x).classList.add("hidden"));$(id).classList.remove("hidden");$("title").textContent=id[0].toUpperCase()+id.slice(1);document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));if(btn)btn.classList.add("active");refresh()}
async function api(url,opt={}){let r=await fetch(url,{...opt,headers:{...H(),...(opt.headers||{})}});let d=await r.json().catch(()=>({}));if(r.status===401){logout();throw new Error("Admin session expired.")}if(!r.ok)throw new Error(d.error||"Request failed");return d}
async function refresh(){try{if($("delivery")&&!$("delivery").classList.contains("hidden"))loadDelivery();let [st,ps,os,vs,vst,cs]=await Promise.all([api("/api/admin/stats"),api("/api/admin/products").then(x=>(cacheAdminProducts(x),x)).catch(()=>cachedAdminProducts()),api("/api/admin/orders"),api("/api/admin/vendors"),api("/api/admin/vendor-stats"),api("/api/admin/customers")]);$("productsCount").textContent=st.products;$("ordersCount").textContent=st.orders;$("pendingCount").textContent=st.pending;$("paidCount").textContent=st.paid;$("customersCount").textContent=st.customers||cs.length;$("cancelledCount").textContent=st.cancelled||0;$("refundedCount").textContent=st.refunded||0;$("sales").textContent=money(st.sales);$("recent").innerHTML=os.slice(0,7).map(o=>`<div class="order"><b>${esc(o.id)}</b> · ${esc(o.product_name)} × ${o.quantity}<br>${esc(o.customer_name)} · ${money(o.total)} · <span class="badge ${o.payment_status.toLowerCase()}">${o.payment_status}</span></div>`).join("")||"<p>No orders yet.</p>";$("productTable").innerHTML=`<div class="tablewrap"><table class="table"><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr>${ps.map(p=>`<tr><td><img class="thumb" src="${p.image||""}" alt=""><br><b>${esc(p.name)}</b></td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td>${p.stock}</td><td><span class="badge ${p.active?"paid":"pending"}">${p.active?"LIVE":"PENDING APPROVAL"}</span></td><td>${!p.active&&p.vendor_id?`<button onclick="approveProduct(${p.id})">✓ APPROVE</button><button class="danger" onclick="rejectProduct(${p.id})">✕ REJECT</button>`:""}<button onclick='editProduct(${JSON.stringify(p)})'>✎ Edit</button><button class="danger" onclick="deleteProduct(${p.id})">🗑 Delete</button></td></tr>`).join("")}</table></div>`;$("orderTable").innerHTML=os.map(renderOrder).join("")||"<p>No orders yet.</p>";
$("customerTotal").textContent=cs.length;$("customerActive").textContent=cs.filter(c=>c.status==="ACTIVE").length;$("customerBlocked").textContent=cs.filter(c=>c.status==="BLOCKED").length;$("customerGuests").textContent=cs.filter(c=>c.status==="GUEST").length;
$("customerTable").innerHTML=cs.map(function(c){var action=c.id?(c.status==="BLOCKED"?'<button onclick="customerStatus('+c.id+',\'ACTIVE\')">ACTIVATE</button>':'<button class="warning" onclick="customerStatus('+c.id+',\'BLOCKED\')">BLOCK</button><button class="danger" onclick="deleteCustomer('+c.id+')">DELETE</button>'):'<span class="guest-label">ORDER-ONLY</span>';return '<div class="customer-card"><div class="customer-avatar">👤</div><div class="customer-main"><b>'+esc(c.full_name||"Customer")+'</b><small>+'+esc(c.whatsapp||"")+' · '+c.status+'</small><small>'+(c.order_count||0)+' orders · '+money(c.total_spent)+' spent'+(c.last_order?' · Last order '+esc(c.last_order):'')+'</small></div><span class="badge '+String(c.status).toLowerCase()+'">'+c.status+'</span><div class="customer-actions">'+action+'</div></div>';}).join("")||"<p>No customers yet.</p>";
$("vendorTotal").textContent=vst.vendors;$("vendorPending").textContent=vst.pending;$("vendorActive").textContent=vst.active;$("vendorCommission").textContent=money(vst.commission);
$("vendorTable").innerHTML=vs.map(v=>`<div class="vendor-card"><div><div class="vendor-avatar">🏪</div></div><div class="vendor-main"><b>${esc(v.business_name)}</b><small>${esc(v.full_name)} · +${esc(v.whatsapp)} · ${esc(v.location)}</small><small>${esc(v.category||"General")} · ${esc(v.description||"")}</small></div><span class="badge ${v.status.toLowerCase()}">${v.status}</span><div class="vendor-actions">${v.status==="PENDING"?`<button onclick="vendorAction(${v.id},'approve')">✓ APPROVE</button><button class="danger" onclick="vendorAction(${v.id},'reject')">✕ REJECT</button>`:""}${v.status==="APPROVED"?`<button class="warning" onclick="vendorAction(${v.id},'suspend')">SUSPEND</button><button class="pin-reset" onclick="resetVendorPin(${v.id})">🔐 RESET PIN</button>`:""}${v.status==="SUSPENDED"?`<button onclick="vendorAction(${v.id},'approve')">REACTIVATE</button>`:""}</div></div>`).join("")||"<p>No vendor applications yet.</p>"}catch(e){if(e.message!=="Admin session expired")notify(e.message,true)}}
async function resetVendorPin(id){const pin=prompt("Enter a new 4 or 5 digit vendor PIN:");if(pin===null)return;if(!/^\\d{4,5}$/.test(pin)){notify("PIN must be exactly 4 or 5 digits.",true);return}try{await api(`/api/admin/vendors/${id}/reset-pin`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pin})});notify("Vendor PIN reset successfully.");refresh()}catch(e){notify(e.message,true)}}
function renderOrder(o){let ps=o.payment_status,osx=o.order_status,cls=ps==="PAID"?"paid":ps==="REFUNDED"?"refunded":ps==="CANCELLED"?"cancelled":"pending";return `<div class="order order-card"><div class="order-head"><b>${esc(o.id)}</b><span>${esc(o.product_name)} × ${o.quantity}</span><b>${money(o.total)}</b><span class="badge ${cls}">${ps}</span><span class="badge status">${osx}</span></div><small>Customer: ${esc(o.customer_name)} · WhatsApp +${esc(o.whatsapp)} · ${esc(o.location)}</small><div class="order-actions">${ps!=="PAID"&&ps!=="REFUNDED"&&ps!=="CANCELLED"?`<button onclick="confirmPay('${o.id}')">✓ CONFIRM PAYMENT</button><button class="warning" onclick="cancelPayment('${o.id}')">✕ CANCEL PAYMENT</button>`:""}${ps==="PAID"?`<button class="warning" onclick="refundPayment('${o.id}')">↩ MARK REFUNDED</button>`:""}${ps==="CANCELLED"||ps==="REFUNDED"?`<button class="secondary" onclick="reopenOrder('${o.id}')">↻ REOPEN</button>`:""}<select onchange="changeStatus('${o.id}',this.value)"><option value="NEW" ${osx==="NEW"?"selected":""}>NEW</option><option value="PROCESSING" ${osx==="PROCESSING"?"selected":""}>PROCESSING</option><option value="READY" ${osx==="READY"?"selected":""}>READY</option><option value="DELIVERED" ${osx==="DELIVERED"?"selected":""}>DELIVERED</option><option value="CANCELLED" ${osx==="CANCELLED"?"selected":""}>CANCELLED</option><option value="REFUNDED" ${osx==="REFUNDED"?"selected":""}>REFUNDED</option></select></div></div>`}
function openProduct(p=null){$("editor").innerHTML=`<div class="modal-title"><span>🛍️</span><div><small>CATALOG MANAGEMENT</small><h2>${p?"Edit":"Add"} Product</h2></div></div><form id="productForm" class="form"><label>Product pictures (optional, up to 8)</label><input name="images" type="file" accept="image/*" multiple><small>Select 1–8 photos. The first photo is the main image.</small><label>Image URL (optional)</label><input name="imageUrl" value="${esc(p?.image||"")}"><label>Product name</label><input name="name" value="${esc(p?.name||"")}" required><label>Category</label><select name="category">${["Fashion","Electronics","Phones","Beauty","Home & Living","Accessories"].map(c=>`<option ${c===p?.category?"selected":""}>${c}</option>`).join("")}</select><label>Price (Dalasi)</label><input name="price" type="number" min="0" value="${p?.price||""}" required><label>Stock</label><input name="stock" type="number" min="0" value="${p?.stock??0}" required><label>Description</label><textarea name="description" placeholder="Short product description">${esc(p?.description||"")}</textarea><button class="primary-submit" type="submit">${p?"SAVE CHANGES":"🚀 PUBLISH PRODUCT"}</button></form>`;$('modal').classList.remove('hidden');$("productForm").onsubmit=e=>saveProduct(e,p?.id)}
function editProduct(p){openProduct(p)}
async function saveProduct(e,id){e.preventDefault();try{await api(id?"/api/admin/products/"+id:"/api/admin/products",{method:id?"PUT":"POST",body:new FormData(e.target)});closeModal();notify(id?"Product updated successfully.":"Product published — now live on the marketplace.");refresh()}catch(x){notify(x.message,true)}}
async function approveProduct(id){try{await api("/api/admin/products/"+id+"/approve",{method:"POST"});notify("Product approved and now LIVE ✓");refresh()}catch(e){notify(e.message,true)}}
async function rejectProduct(id){if(!confirm("Reject this vendor product?"))return;try{await api("/api/admin/products/"+id+"/reject",{method:"POST"});notify("Product rejected.");refresh()}catch(e){notify(e.message,true)}}
async function deleteProduct(id){if(!confirm("Delete this product from the customer marketplace?"))return;try{await api("/api/admin/products/"+id,{method:"DELETE"});notify("Product removed.");refresh()}catch(e){notify(e.message,true)}}
async function confirmPay(id){try{await api("/api/admin/orders/"+id+"/payment",{method:"POST"});notify("Payment confirmed. Order is now PROCESSING.");refresh()}catch(e){notify(e.message,true)}}
async function cancelPayment(id){if(!confirm("Cancel this unpaid payment/order?"))return;try{await api("/api/admin/orders/"+id+"/cancel-payment",{method:"POST"});notify("Payment cancelled.");refresh()}catch(e){notify(e.message,true)}}
async function refundPayment(id){if(!confirm("Mark this PAID order as REFUNDED? Make sure the actual money reversal has happened in Waychit."))return;try{let d=await api("/api/admin/orders/"+id+"/refund",{method:"POST"});notify(d.notice||"Order marked refunded.");refresh()}catch(e){notify(e.message,true)}}
async function reopenOrder(id){try{await api("/api/admin/orders/"+id+"/reopen",{method:"POST"});notify("Order reopened.");refresh()}catch(e){notify(e.message,true)}}
async function changeStatus(id,status){try{await api("/api/admin/orders/"+id+"/status",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});notify("Order status updated.");refresh()}catch(e){notify(e.message,true)}}

async function refreshBackupStatus(){
  if($("backupStatus")===null)return;
  try{
    const d=await api("/api/admin/backup/status");
    $("backupStatus").textContent=d.lastSaved
      ? `AUTO-SAVE ON · ${new Date(d.lastSaved).toLocaleTimeString()}`
      : "AUTO-SAVE ON · Waiting";
    if($("backupCloudStatus")) $("backupCloudStatus").textContent="LOCAL BACKUP · ACTIVE";
    if($("backupMeta")) $("backupMeta").textContent=`${d.meta?.productCount||0} products · ${d.meta?.vendorCount||0} vendors · ${d.meta?.orderCount||0} orders`;
  }catch(e){}
}

async function saveShopNow(){
  try{
    const d=await api("/api/admin/backup/save-now",{method:"POST"});
    notify(d.message||"Shop data and images saved ✓");
    refreshBackupStatus();
  }catch(e){notify(e.message,true)}
}
async function downloadBackup(){
  try{
    notify("Preparing full backup with products and images…");
    const r=await fetch("/api/admin/backup",{headers:H()});
    if(!r.ok){let d=await r.json().catch(()=>({}));throw new Error(d.error||"Could not download backup.")}
    const blob=await r.blob();
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`basse-online-shop-full-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    notify("Full backup downloaded ✓ Products, vendors, orders and uploaded images are included.");
  }catch(e){notify(e.message,true)}
}
async function restoreBackup(input){
  const file=input?.files?.[0];
  if(!file)return;
  if(!confirm("Restore this full BASSE backup? Current shop data and uploaded images will be replaced by the backup.")){input.value="";return}
  try{
    notify("Restoring products, vendors, orders and images…");
    const text=await file.text();
    const data=JSON.parse(text);
    const d=await api("/api/admin/restore",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
    notify(d.message||"Backup restored successfully ✓");
    input.value="";
    await refresh();
    refreshBackupStatus();
  }catch(e){notify(e.message||"Restore failed.",true);input.value=""}
}
function closeModal(){$("modal").classList.add("hidden")}
async function customerStatus(id,status){try{await api("/api/admin/customers/"+id+"/status",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});notify(status==="BLOCKED"?"Customer blocked.":"Customer activated.");refresh()}catch(e){notify(e.message,true)}}
async function deleteCustomer(id){if(!confirm("Delete this customer account? Their existing orders will remain in the system."))return;try{await api("/api/admin/customers/"+id,{method:"DELETE"});notify("Customer account deleted.");refresh()}catch(e){notify(e.message,true)}}
async function vendorAction(id,action){try{await api(`/api/admin/vendors/${id}/${action}`,{method:"POST"});notify("Vendor updated ✓");refresh()}catch(e){notify(e.message,true)}}
function notify(t,error=false){let x=$("toast");if(!x){x=document.createElement("div");x.id="toast";document.body.appendChild(x)}x.className="toast show "+(error?"error":"");x.textContent=t;clearTimeout(window.__toast);window.__toast=setTimeout(()=>x.classList.remove("show"),3000)}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}if(token)start();


async function loadDelivery(){
  try{
    const [ds,drs]=await Promise.all([api("/api/admin/deliveries"),api("/api/admin/drivers")]);
    $("deliveryTable").innerHTML=ds.length?ds.map(d=>`<div class="delivery-row"><div><b>#${esc(d.order_id)}</b> · ${esc(d.customer_name||"Customer")}<br><small>${esc(d.business_name||"Direct order")} · ${esc(d.location||"")}</small></div><span class="badge">${esc(d.status.replaceAll("_"," "))}</span><div><small>Driver: ${esc(d.driver_name||"Unassigned")}</small><br>${d.lat&&d.lng?`<a target="_blank" href="https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lng}#map=17/${d.lat}/${d.lng}">📍 Live location</a>`:"Waiting for GPS"}</div><select onchange="assignDelivery(${d.order_id?`'${d.order_id}'`:"''"},this.value)"><option value="">Assign driver…</option>${drs.filter(x=>x.status==="ACTIVE").map(x=>`<option value="${x.id}" ${Number(x.id)===Number(d.driver_id)?"selected":""}>${esc(x.full_name)}</option>`).join("")}</select></div>`).join(""):"<p>No deliveries yet. Assign a driver after a paid order is ready.</p>";
    $("driverTable").innerHTML=drs.map(d=>`<div class="driver-row"><div><b>${esc(d.full_name)}</b><small>+${esc(d.whatsapp)} · ${d.status}</small></div><button onclick="driverStatus(${d.id},'${d.status==="ACTIVE"?"BLOCKED":"ACTIVE"}')">${d.status==="ACTIVE"?"BLOCK":"ACTIVATE"}</button></div>`).join("")||"<p>No drivers yet.</p>";
  }catch(e){if($("deliveryTable"))$("deliveryTable").innerHTML=`<p>${esc(e.message)}</p>`}
}
async function addDriver(){
  try{const d=await api("/api/admin/drivers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({full_name:$("driverName").value,whatsapp:$("driverPhone").value,pin:$("driverPin").value})});$("driverName").value=$("driverPhone").value=$("driverPin").value="";notify("Driver added.");loadDelivery()}catch(e){notify(e.message,true)}
}
async function driverStatus(id,status){try{await api("/api/admin/drivers/"+id+"/status",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});loadDelivery()}catch(e){notify(e.message,true)}}
async function assignDelivery(orderId,driverId){if(!driverId)return;try{await api("/api/admin/orders/"+encodeURIComponent(orderId)+"/assign-driver",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({driverId:Number(driverId)})});notify("Driver assigned.");loadDelivery();refresh()}catch(e){notify(e.message,true)}}
