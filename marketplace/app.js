let category="All",cart=JSON.parse(localStorage.getItem("basseCart")||"[]"),selected=null,searchTimer=null,searchIndex=[];
const $=id=>document.getElementById(id),money=n=>"D"+Number(n||0).toLocaleString();

async function loadProducts(){
  let r=await fetch("/api/products?category="+encodeURIComponent(category)+"&q="+encodeURIComponent($("search").value.trim()));
  let ps=await r.json();
  $("count").textContent=ps.length+" products";
  $("grid").innerHTML=ps.length?ps.map(p=>`<article class="product"><div class="pic"><img src="${p.image||""}" alt="${esc(p.name)}" loading="lazy"><span class="tag">${esc(p.category)}</span></div><div class="info"><h3>${esc(p.name)}</h3><p>${esc(p.description||"Quality product from BASSE ONLINE SHOP.")}</p><div class="price">${money(p.price)}</div><button class="buy" onclick="buy(${p.id})">BUY NOW</button></div></article>`).join(""):`<div class="empty-search"><div>🔎</div><h3>No products found</h3><p>Try another product name or category.</p></div>`;
  $("clearSearch").classList.toggle("show",!!$("search").value.trim());
}

async function loadSearchIndex(){
  try{
    let r=await fetch("/api/products?category=All");
    searchIndex=await r.json();
  }catch(e){searchIndex=[]}
}

function showSuggestions(){
  let term=$("search").value.trim().toLowerCase(),box=$("searchSuggestions");
  if(!term){box.classList.remove("show");box.innerHTML="";return}
  let matches=searchIndex.filter(p=>(p.name+" "+p.category+" "+(p.description||"")).toLowerCase().includes(term)).slice(0,6);
  if(!matches.length){box.innerHTML=`<div class="suggest-empty">No matching products</div>`;box.classList.add("show");return}
  box.innerHTML=matches.map(p=>`<button type="button" class="suggest-item" onclick="pickSuggestion(${p.id})"><span class="suggest-icon">🔎</span><span><b>${esc(p.name)}</b><small>${esc(p.category)} · ${money(p.price)}</small></span></button>`).join("");
  box.classList.add("show");
}

function pickSuggestion(id){
  let p=searchIndex.find(x=>x.id===id);
  if(!p)return;
  $("search").value=p.name;
  $("searchSuggestions").classList.remove("show");
  loadProducts();
  document.querySelector("#products").scrollIntoView({behavior:"smooth",block:"start"});
}

function runSearch(){
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>loadProducts(),180);
  showSuggestions();
}

function clearSearch(){
  $("search").value="";
  $("searchSuggestions").classList.remove("show");
  $("clearSearch").classList.remove("show");
  loadProducts();
  $("search").focus();
}
function setCat(c,b){category=c;document.querySelectorAll(".cats button").forEach(x=>x.classList.remove("active"));b.classList.add("active");loadProducts()}
async function buy(id){selected=await(await fetch("/api/products/"+id)).json();$("modal").innerHTML=`<div class="sheet"><button class="close" onclick="closeModal()">×</button><h2>Buy ${esc(selected.name)}</h2><p>${esc(selected.description||"")}</p><div class="form"><label>Quantity</label><input id="qty" type="number" min="1" max="${selected.stock}" value="1"><label>Full Name</label><input id="name" placeholder="Your name"><label>WhatsApp Number</label><input id="phone" inputmode="numeric" placeholder="7XXXXXX"><small>+220 will be added automatically.</small><label>Location</label><select id="loc"><option>Basse</option><option>Bansang</option><option>Fatoto</option><option>Other</option></select><div class="summary"><div class="row"><span>Product</span><b>${money(selected.price)}</b></div><div class="row"><span>Total</span><b id="total">${money(selected.price)}</b></div></div><button class="pay" onclick="placeOrder()">💳 PAY WITH WAYCHIT</button></div></div>`;$("modal").classList.add("show");$("qty").oninput=()=>$("total").textContent=money(selected.price*Math.max(1,+$("qty").value||1))}
async function placeOrder(){let q=Math.max(1,+$("qty").value||1),phone=$("phone").value.replace(/\D/g,"").replace(/^220/,"");if(!$("name").value.trim()||phone.length<6)return toast("Enter your name and WhatsApp number.");let r=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:selected.id,quantity:q,name:$("name").value.trim(),whatsapp:phone,location:$("loc").value})}),d=await r.json();if(!r.ok)return toast(d.error||"Order failed");localStorage.setItem("basseLastOrder",JSON.stringify(d.order));if(d.paymentUrl){location.href=d.paymentUrl}else{showReturn(d.order,`Hello BASSE ONLINE SHOP 👋%0A%0AI want to complete payment for order ${d.order.id}.%0A%0AProduct: ${d.order.product_name} × ${d.order.quantity}%0ATotal: ${money(d.order.total)}%0ALocation: ${d.order.location}%0ACustomer WhatsApp: +${d.order.whatsapp}`,false,d.whatsappSupport)}}
function showReturn(o,msg,paid,adminWhatsApp){let target=String(adminWhatsApp||o.whatsappSupport||"").replace(/\D/g,"");let href=target?`https://wa.me/${target}?text=${msg}`:"#";$("modal").innerHTML=`<div class="sheet" style="text-align:center"><button class="close" onclick="closeModal()">×</button><div style="font-size:52px">${paid?"🎉":"🧾"}</div><h2>${paid?"Payment successful!":"Order received"}</h2><p>${paid?"Your payment was completed. Send the receipt to BASSE ONLINE SHOP.":"Your order has been received. Payment is not connected yet."}</p><div class="summary"><div class="row"><span>Order</span><b>${o.id}</b></div><div class="row"><span>Total</span><b>${money(o.total)}</b></div><div class="row"><span>Payment</span><b>${paid?"PAID":"PENDING"}</b></div></div>${target?`<a class="whats" href="${href}" target="_blank" rel="noopener">💬 SEND RECEIPT TO BASSE SHOP</a>`:`<div class="summary"><b>Waychit payment is not configured yet.</b><p style="margin:6px 0 0;color:#687386;font-size:12px">Add WAYCHIT_API_KEY and PUBLIC_BASE_URL in Render Environment.</p></div>`}</div>`;$("modal").classList.add("show")}
function handleReturn(){let u=new URLSearchParams(location.search),st=u.get("payment"),id=u.get("order");if(!id||!st)return;fetch("/api/order/"+id).then(r=>r.json()).then(o=>{let msg=`Hello BASSE ONLINE SHOP 👋%0A%0APayment receipt for order ${o.id}.%0AProduct: ${o.product_name} × ${o.quantity}%0ATotal paid: ${money(o.total)}%0ALocation: ${o.location}%0ACustomer WhatsApp: +${o.whatsapp}%0APayment status: ${st.toUpperCase()}.`;showReturn(o,msg,st==="success",o.whatsappSupport);history.replaceState({},document.title,"/")})}
function closeModal(){$("modal").classList.remove("show")};function openCart(){toast("Cart is ready — checkout uses the same secure order system.")};function toast(t){$("toast").textContent=t;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2500)}function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
$("search").addEventListener("input",runSearch);
$("search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("searchSuggestions").classList.remove("show");loadProducts();document.querySelector("#products").scrollIntoView({behavior:"smooth",block:"start"})}if(e.key==="Escape"){clearSearch()}});
$("searchBtn").addEventListener("click",()=>{ $("searchSuggestions").classList.remove("show"); loadProducts(); document.querySelector("#products").scrollIntoView({behavior:"smooth",block:"start"}); });
$("clearSearch").addEventListener("click",clearSearch);
document.addEventListener("click",e=>{if(!e.target.closest(".search-wrap"))$("searchSuggestions").classList.remove("show")});
loadSearchIndex().then(loadProducts);
handleReturn();