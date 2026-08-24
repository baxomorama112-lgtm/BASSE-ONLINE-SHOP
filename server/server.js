const express=require("express"),Database=require("better-sqlite3"),multer=require("multer"),path=require("path"),crypto=require("crypto"),fs=require("fs"),nodemailer=require("nodemailer");
const app=express(),PORT=process.env.PORT||3000,ROOT=__dirname,DATA_DIR=process.env.DATA_DIR||path.join(ROOT,"data");
const PUBLIC_BASE_URL=(process.env.PUBLIC_BASE_URL||"https://basse-online-shop.onrender.com").replace(/\/$/,"");
const STATIC_WAYCHIT_URL=process.env.WAYCHIT_STATIC_URL||"https://app.waychit.com/pm/?param1=%7B%22type%22%3A%22staticPaymentRequest%22%2C%22merchantAccountId%22%3A%226a8b03204ad0d928fc3a529c%22%7D";
const SHOP_WHATSAPP=String(process.env.BASSE_MARKET_WHATSAPP||"2206963349").replace(/\D/g,"");fs.mkdirSync(DATA_DIR,{recursive:true});fs.mkdirSync(path.join(DATA_DIR,"uploads"),{recursive:true});
app.use(express.json({limit:"2mb",verify:(req,res,buf)=>{if(req.originalUrl==="/api/waychit/webhook")req.rawBody=buf.toString("utf8")}}));
app.use("/uploads",express.static(path.join(DATA_DIR,"uploads")));
app.use("/admin",express.static(path.join(ROOT,"../admin")));app.use("/vendor",express.static(path.join(ROOT,"../vendor")));
app.use("/",express.static(path.join(ROOT,"../marketplace")));
const db=new Database(path.join(DATA_DIR,"basse-shop.db"));db.pragma("journal_mode=WAL");
db.exec(`CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,category TEXT,price INTEGER,stock INTEGER,description TEXT,image TEXT,active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,product_id INTEGER,product_name TEXT,quantity INTEGER,customer_name TEXT,whatsapp TEXT,location TEXT,total INTEGER,payment_status TEXT DEFAULT 'PENDING',order_status TEXT DEFAULT 'NEW',waychit_request_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,vendor_id INTEGER DEFAULT NULL,commission INTEGER DEFAULT 0,vendor_earnings INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS vendors(id INTEGER PRIMARY KEY AUTOINCREMENT,full_name TEXT,business_name TEXT,whatsapp TEXT,location TEXT,category TEXT,description TEXT,password_hash TEXT,status TEXT DEFAULT 'PENDING',created_at TEXT DEFAULT CURRENT_TIMESTAMP,email TEXT,email_verified INTEGER DEFAULT 0,otp_hash TEXT,otp_expires_at INTEGER,otp_attempts INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS vendor_products(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER,vendor_id INTEGER,status TEXT DEFAULT 'PENDING',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS customer_accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,full_name TEXT,whatsapp TEXT UNIQUE,password_hash TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payout_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,vendor_id INTEGER,amount INTEGER,status TEXT DEFAULT 'PENDING',created_at TEXT DEFAULT CURRENT_TIMESTAMP);\nCREATE TABLE IF NOT EXISTS auth_sessions(token TEXT PRIMARY KEY,type TEXT NOT NULL,vendor_id INTEGER DEFAULT NULL,customer_id INTEGER DEFAULT NULL,expires_at INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
try{db.exec("ALTER TABLE products ADD COLUMN images TEXT DEFAULT ''")}catch(e){}
try{db.exec("ALTER TABLE products ADD COLUMN vendor_id INTEGER DEFAULT NULL")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN vendor_id INTEGER DEFAULT NULL")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN commission INTEGER DEFAULT 0")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN vendor_earnings INTEGER DEFAULT 0")}catch(e){}
try{db.exec("ALTER TABLE vendors ADD COLUMN email TEXT")}catch(e){}
try{db.exec("ALTER TABLE vendors ADD COLUMN email_verified INTEGER DEFAULT 0")}catch(e){}
try{db.exec("ALTER TABLE vendors ADD COLUMN otp_hash TEXT")}catch(e){}
try{db.exec("ALTER TABLE vendors ADD COLUMN otp_expires_at INTEGER")}catch(e){}
try{db.exec("ALTER TABLE vendors ADD COLUMN otp_attempts INTEGER DEFAULT 0")}catch(e){}
if(!db.prepare("SELECT COUNT(*) c FROM products").get().c){let q=db.prepare("INSERT INTO products(name,category,price,stock,description,image) VALUES(?,?,?,?,?,?)");[
["Premium Blue Hoodie","Fashion",850,15,"Comfortable everyday hoodie.","https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?auto=format&fit=crop&w=900&q=80"],
["Wireless Headphones","Electronics",1500,10,"Clear wireless sound.","https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80"],
["Smartphone 128GB","Phones",3290,8,"Modern 128GB smartphone.","https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=80"],
["Beauty Care Set","Beauty",450,20,"Everyday beauty care bundle.","https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=80"],
["Leather Handbag","Accessories",1200,12,"Elegant everyday handbag.","https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=80"],
["Smart Watch Pro","Electronics",2200,9,"Smart everyday watch.","https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80"]].forEach(x=>q.run(...x))}
const upload=multer({storage:multer.diskStorage({destination:path.join(DATA_DIR,"uploads"),filename:(r,f,cb)=>cb(null,crypto.randomBytes(8).toString("hex")+path.extname(f.originalname))}),limits:{fileSize:6e6}});
const sessions=new Map(); // short-lived cache; auth_sessions is the persistent source of truth
const SESSION_DAYS=30;
function createSession(type,fields={}){
 const token=crypto.randomBytes(32).toString("hex"),expires=Date.now()+SESSION_DAYS*864e5;
 db.prepare("INSERT INTO auth_sessions(token,type,vendor_id,customer_id,expires_at) VALUES(?,?,?,?,?)").run(token,type,fields.vendorId||null,fields.customerId||null,expires);
 sessions.set(token,{expires,type,...fields}); return token;
}
function getSession(token){
 if(!token)return null;
 const cached=sessions.get(token);
 if(cached&&cached.expires>Date.now())return cached;
 const row=db.prepare("SELECT type,vendor_id,customer_id,expires_at FROM auth_sessions WHERE token=?").get(token);
 if(!row||row.expires_at<=Date.now()){if(row)db.prepare("DELETE FROM auth_sessions WHERE token=?").run(token);sessions.delete(token);return null;}
 const s={expires:row.expires_at,type:row.type,vendorId:row.vendor_id||undefined,customerId:row.customer_id||undefined};sessions.set(token,s);return s;
}
function deleteSession(token){if(token){sessions.delete(token);db.prepare("DELETE FROM auth_sessions WHERE token=?").run(token)}}
db.prepare("DELETE FROM auth_sessions WHERE expires_at<=?").run(Date.now());
// Live-update stream: browsers connected to the marketplace/admin/vendor receive an event
// whenever products, vendors, orders or payments change. A short polling fallback remains
// on the clients so the site still recovers automatically after a dropped connection.
const liveClients=new Set();
function broadcastLive(type="refresh",payload={}){
  const data=`event: ${type}\ndata: ${JSON.stringify({type,...payload})}\n\n`;
  for(const res of liveClients){ try{res.write(data)}catch{liveClients.delete(res)} }
}
app.get("/api/live",(req,res)=>{
  res.set({"Content-Type":"text/event-stream","Cache-Control":"no-cache, no-transform","Connection":"keep-alive","X-Accel-Buffering":"no"});
  res.flushHeaders?.();
  res.write(`event: connected\ndata: ${JSON.stringify({type:"connected",at:Date.now()})}\n\n`);
  liveClients.add(res);
  const heartbeat=setInterval(()=>{try{res.write(`: heartbeat ${Date.now()}\n\n`)}catch{clearInterval(heartbeat);liveClients.delete(res)}},25000);
  req.on("close",()=>{clearInterval(heartbeat);liveClients.delete(res)});
});
function authToken(req){return String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim()}
function guard(req,res,next){const s=getSession(authToken(req));if(!s||s.type!=="admin")return res.status(401).json({error:"Admin login required"});next()}
function vendorGuard(req,res,next){const s=getSession(authToken(req));if(!s||s.type!=="vendor")return res.status(401).json({error:"Vendor login required"});req.vendorId=s.vendorId;next()}
function customerGuard(req,res,next){const s=getSession(authToken(req));if(!s||s.type!=="customer")return res.status(401).json({error:"Customer login required"});req.customerId=s.customerId;next()}
function normalizePhone(value){return String(value||"").replace(/\D/g,"").replace(/^220/,"");}
function hashSecret(value){return crypto.createHash("sha256").update(String(value||"")).digest("hex");}
function secretMatches(value,stored){
  const input=hashSecret(value);
  if(stored===input)return true;
  // Compatibility with any older build that may have stored the PIN directly.
  if(/^\d{4,5}$/.test(String(stored||"")) && String(stored)===String(value)){return true;}
  return false;
}
function gmailTransport(){
  const user=process.env.GMAIL_USER||process.env.ADMIN_EMAIL;
  const pass=process.env.GMAIL_APP_PASSWORD;
  if(!user||!pass)return null;
  return nodemailer.createTransport({host:"smtp.gmail.com",port:465,secure:true,auth:{user,pass}});
}
async function sendVendorOtp(email,code){
  const transport=gmailTransport();
  if(!transport)throw new Error("Email verification is not configured yet. Add GMAIL_APP_PASSWORD in Render.");
  const from=process.env.EMAIL_FROM||process.env.GMAIL_USER||process.env.ADMIN_EMAIL;
  await transport.sendMail({from,to:email,subject:"BASSE ONLINE SHOP verification code",text:`Your BASSE ONLINE SHOP verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>BASSE ONLINE SHOP</h2><p>Your verification code is:</p><div style="font-size:34px;font-weight:700;letter-spacing:8px;padding:18px;background:#f2f5fb;text-align:center">${code}</div><p>This code expires in 10 minutes.</p></div>`});
}

app.get("/api/products",(req,res)=>{let p=db.prepare("SELECT * FROM products WHERE active=1 ORDER BY id DESC").all(),c=req.query.category||"All",q=(req.query.q||"").toLowerCase();if(c!=="All")p=p.filter(x=>x.category===c);if(q)p=p.filter(x=>(x.name+" "+x.category+" "+x.description).toLowerCase().includes(q));res.json(p)});
app.get("/api/products/:id",(req,res)=>{let p=db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(req.params.id);p?res.json(p):res.status(404).json({error:"Product not found"})});
app.post("/api/admin/login",(req,res)=>{if(req.body.email===process.env.ADMIN_EMAIL&&req.body.password===process.env.ADMIN_PASSWORD){let t=createSession("admin");res.json({token:t})}else res.status(401).json({error:"Invalid admin login"})});
app.get("/api/admin/products",guard,(req,res)=>res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all()));
app.post("/api/admin/products",guard,upload.array("images",8),(req,res)=>{let b=req.body,files=req.files||[],fileImgs=files.map(f=>"/uploads/"+f.filename),img=fileImgs[0]||b.imageUrl||"",imgs=JSON.stringify(fileImgs.length?fileImgs:(b.images?String(b.images).split(",").map(x=>x.trim()).filter(Boolean):[]));
let x=db.prepare("INSERT INTO products(name,category,price,stock,description,image,images,vendor_id) VALUES(?,?,?,?,?,?,?,?)").run(b.name,b.category,+b.price,+b.stock||0,b.description||"",img,imgs,b.vendorId?+b.vendorId:null);let created=db.prepare("SELECT * FROM products WHERE id=?").get(x.lastInsertRowid);broadcastLive("catalog",{productId:created.id});res.json(created)});
app.put("/api/admin/products/:id",guard,upload.array("images",8),(req,res)=>{let p=db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id);if(!p)return res.status(404).json({error:"Product not found"});let b=req.body,files=req.files||[],fileImgs=files.map(f=>"/uploads/"+f.filename),img=fileImgs[0]||b.imageUrl||p.image,oldImgs=p.images||"[]",imgs=fileImgs.length?JSON.stringify(fileImgs):(b.images?JSON.stringify(String(b.images).split(",").map(x=>x.trim()).filter(Boolean)):oldImgs);db.prepare("UPDATE products SET name=?,category=?,price=?,stock=?,description=?,image=?,images=?,vendor_id=? WHERE id=?").run(b.name,b.category,+b.price,+b.stock,b.description||"",img,imgs,b.vendorId?+b.vendorId:p.vendor_id||null,p.id);let updated=db.prepare("SELECT * FROM products WHERE id=?").get(p.id);broadcastLive("catalog",{productId:p.id});res.json(updated)});
app.delete("/api/admin/products/:id",guard,(req,res)=>{db.prepare("UPDATE products SET active=0 WHERE id=?").run(req.params.id);broadcastLive("catalog",{productId:Number(req.params.id)});res.json({ok:true})});
app.get("/api/admin/orders",guard,(req,res)=>res.json(db.prepare("SELECT * FROM orders ORDER BY datetime(created_at) DESC").all()));
app.get("/api/admin/stats",guard,(req,res)=>res.json({products:db.prepare("SELECT COUNT(*) c FROM products WHERE active=1").get().c,orders:db.prepare("SELECT COUNT(*) c FROM orders").get().c,pending:db.prepare("SELECT COUNT(*) c FROM orders WHERE payment_status='PENDING'").get().c,paid:db.prepare("SELECT COUNT(*) c FROM orders WHERE payment_status='PAID'").get().c,cancelled:db.prepare("SELECT COUNT(*) c FROM orders WHERE payment_status='CANCELLED' OR order_status='CANCELLED'").get().c,refunded:db.prepare("SELECT COUNT(*) c FROM orders WHERE payment_status='REFUNDED'").get().c,sales:db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE payment_status='PAID' AND order_status!='CANCELLED' AND date(created_at)=date('now','localtime')").get().s}));
app.post("/api/orders",async(req,res)=>{
  let p=db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(req.body.productId);
  let q=Math.max(1,+req.body.quantity||1);
  if(!p)return res.status(404).json({error:"Product unavailable"});
  if(q>p.stock)return res.status(400).json({error:"Not enough stock"});
  let rawPhone=String(req.body.whatsapp||"").replace(/\D/g,"").replace(/^220/,"");
  if(rawPhone.length<6)return res.status(400).json({error:"Enter a valid WhatsApp number"});
  let id="BOS-"+crypto.randomBytes(4).toString("hex").toUpperCase();
  let phone="220"+rawPhone,total=p.price*q;
  let vendorId=p.vendor_id||null, commission=Math.round(total*0.10), vendorEarnings=total-commission;
  db.prepare("INSERT INTO orders(id,product_id,product_name,quantity,customer_name,whatsapp,location,total,vendor_id,commission,vendor_earnings) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run(id,p.id,p.name,q,String(req.body.name||"").trim(),phone,String(req.body.location||""),total,vendorId,commission,vendorEarnings);
  broadcastLive("orders",{orderId:id});

  let paymentUrl="";
  let paymentError="";
  if(process.env.WAYCHIT_API_KEY){
    try{
      let r=await fetch("https://api.waychit.com/v1/payment-requests",{
        method:"POST",
        headers:{"Authorization":"Bearer "+process.env.WAYCHIT_API_KEY,"Content-Type":"application/json","Accept":"application/json"},
        body:JSON.stringify({
          amount:total,
          description:p.name+" x "+q+" — BASSE ONLINE SHOP",
          clientReference:id,
          successRedirectUrl:PUBLIC_BASE_URL+"/?payment=success&order="+encodeURIComponent(id),
          failureRedirectUrl:PUBLIC_BASE_URL+"/?payment=failed&order="+encodeURIComponent(id)
        })
      });
      let body=await r.text();
      let d={}; try{d=JSON.parse(body)}catch{}
      console.log("Waychit payment request:",r.status,body.slice(0,1200));
      if(r.ok&&d.paymentRequest&&d.paymentRequest.waychitLaunchUrl){
        paymentUrl=d.paymentRequest.waychitLaunchUrl;
        db.prepare("UPDATE orders SET waychit_request_id=? WHERE id=?").run(d.paymentRequest.id,id);
      }else{
        paymentError=d.message||d.error||`Waychit rejected the payment request (HTTP ${r.status}).`;
        console.error("Waychit rejected payment:",r.status,body.slice(0,1200));
      }
    }catch(e){paymentError="Waychit is temporarily unavailable.";console.error("Waychit request error:",e)}
  }
  let paymentMode="dynamic";
  if(!paymentUrl){paymentUrl=STATIC_WAYCHIT_URL;paymentMode="fallback";}
  res.status(201).json({
    order:db.prepare("SELECT * FROM orders WHERE id=?").get(id),
    paymentUrl,
    paymentError:paymentError,
    paymentMode,
    whatsappSupport:SHOP_WHATSAPP
  });
});
app.get("/api/order/:id",(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);o?res.json({...o,whatsappSupport:SHOP_WHATSAPP}):res.status(404).json({error:"Order not found"})});
app.post("/api/admin/orders/:id/payment",guard,(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});if(o.payment_status==='REFUNDED'||o.payment_status==='CANCELLED')return res.status(400).json({error:'This payment is already closed.'});db.prepare("UPDATE orders SET payment_status='PAID',order_status='PROCESSING' WHERE id=?").run(req.params.id);broadcastLive("orders",{orderId:req.params.id});res.json({ok:true})});
app.post("/api/admin/orders/:id/cancel-payment",guard,(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});if(o.payment_status==='PAID')return res.status(400).json({error:'A paid order cannot be cancelled. Use Refund instead.'});db.prepare("UPDATE orders SET payment_status='CANCELLED',order_status='CANCELLED' WHERE id=?").run(req.params.id);broadcastLive("orders",{orderId:req.params.id});res.json({ok:true})});
app.post("/api/admin/orders/:id/refund",guard,(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});if(o.payment_status!=='PAID')return res.status(400).json({error:'Only paid orders can be marked refunded.'});db.prepare("UPDATE orders SET payment_status='REFUNDED',order_status='REFUNDED' WHERE id=?").run(req.params.id);broadcastLive("orders",{orderId:req.params.id});res.json({ok:true,notice:'Order marked refunded. Complete the actual money reversal in Waychit if required.'})});
app.post("/api/admin/orders/:id/reopen",guard,(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});db.prepare("UPDATE orders SET payment_status='PENDING',order_status='NEW' WHERE id=?").run(req.params.id);broadcastLive("orders",{orderId:req.params.id});res.json({ok:true})});
app.patch("/api/admin/orders/:id/status",guard,(req,res)=>{let allowed=['NEW','PROCESSING','READY','DELIVERED','CANCELLED','REFUNDED'];let status=String(req.body.status||'').toUpperCase();if(!allowed.includes(status))return res.status(400).json({error:'Invalid order status'});db.prepare("UPDATE orders SET order_status=? WHERE id=?").run(status,req.params.id);broadcastLive("orders",{orderId:req.params.id});res.json({ok:true})});
app.get("/api/payment-config",(req,res)=>res.json({configured:!!process.env.WAYCHIT_API_KEY,publicBaseUrl:PUBLIC_BASE_URL,staticFallback:true}));
app.post("/api/waychit/webhook",(req,res)=>{
  let sig=req.headers["waychit-signature"],secret=process.env.WAYCHIT_WEBHOOK_SECRET,raw=req.rawBody||"";
  if(!sig||!secret||!raw)return res.status(400).send("Webhook not configured");
  try{
    let parts=String(sig).split(","),t=parts.find(x=>x.trim().startsWith("t="))?.trim().split("=")[1],sigs=parts.filter(x=>x.trim().startsWith("v1=")).map(x=>x.trim().split("=")[1]);
    if(!t||!sigs.length||Math.abs(Date.now()/1000-Number(t))>300)return res.status(400).send("Invalid signature");
    let expected=crypto.createHmac("sha256",secret).update(`${t}.${raw}`).digest("hex");
    if(!sigs.includes(expected))return res.status(400).send("Invalid signature");
    let e=JSON.parse(raw);
    let ref=e.paymentRequest?.clientReference||e.paymentSession?.clientReference||e.data?.clientReference;
    if((e.type==="payment.request.completed"||e.type==="payment.session.completed")&&ref){
      db.prepare("UPDATE orders SET payment_status='PAID',order_status='PROCESSING' WHERE id=? AND payment_status!='REFUNDED'").run(ref);broadcastLive("orders",{orderId:ref});
    }
    res.sendStatus(200);
  }catch(e){res.status(400).send("Bad webhook")}
});


app.post("/api/customer/signup",(req,res)=>{
 const b=req.body||{},name=String(b.fullName||"").trim(),phone=String(b.whatsapp||"").replace(/\D/g,"").replace(/^220/,""),password=String(b.password||"");
 if(!name||phone.length<6||password.length<6)return res.status(400).json({error:"Enter your name, valid WhatsApp number and a password of at least 6 characters."});
 const hash=crypto.createHash("sha256").update(password).digest("hex");
 try{const x=db.prepare("INSERT INTO customer_accounts(full_name,whatsapp,password_hash) VALUES(?,?,?)").run(name,"220"+phone,hash);const token=createSession("customer",{customerId:x.lastInsertRowid});res.json({token,customer:{id:x.lastInsertRowid,name,phone:"+220 "+phone}})}
 catch(e){res.status(409).json({error:"An account already exists for this WhatsApp number."})}
});
app.post("/api/customer/login",(req,res)=>{
 const phone=String(req.body.whatsapp||"").replace(/\D/g,"").replace(/^220/,""),password=String(req.body.password||"");
 const c=db.prepare("SELECT * FROM customer_accounts WHERE whatsapp=?").get("220"+phone),hash=crypto.createHash("sha256").update(password).digest("hex");
 if(!c||hash!==c.password_hash)return res.status(401).json({error:"Invalid WhatsApp number or password."});
 const token=createSession("customer",{customerId:c.id});res.json({token,customer:{id:c.id,name:c.full_name,phone:"+220 "+phone}});
});
app.get("/api/customer/me",customerGuard,(req,res)=>{
 const c=db.prepare("SELECT id,full_name,whatsapp,created_at FROM customer_accounts WHERE id=?").get(req.customerId);
 c?res.json({id:c.id,name:c.full_name,phone:"+"+c.whatsapp,created_at:c.created_at}):res.status(404).json({error:"Customer account not found"});
});
app.post("/api/customer/logout",(req,res)=>{deleteSession(authToken(req));res.json({ok:true})});

app.post("/api/vendor/login",(req,res)=>{
 const phone=normalizePhone(req.body.whatsapp||req.body.phone),pin=String(req.body.pin||"").trim();
 if(phone.length<6)return res.status(400).json({error:"Enter a valid WhatsApp number."});
 if(!/^\d{4,5}$/.test(pin))return res.status(400).json({error:"PIN must be 4 or 5 digits."});
 const v=db.prepare("SELECT * FROM vendors WHERE whatsapp=? AND status='APPROVED'").get("220"+phone);
 if(!v||!secretMatches(pin,v.password_hash))return res.status(401).json({error:"Invalid vendor number or PIN. If you recently changed your PIN, use the new PIN."});
 // Upgrade any legacy plain-text PIN immediately to a hash.
 if(String(v.password_hash||"")===pin)db.prepare("UPDATE vendors SET password_hash=? WHERE id=?").run(hashSecret(pin),v.id);
 const t=createSession("vendor",{vendorId:v.id});
 res.json({token:t,vendor:{id:v.id,business_name:v.business_name,full_name:v.full_name}});
});
app.post("/api/vendor/logout",(req,res)=>{deleteSession(authToken(req));res.json({ok:true})});

app.get("/api/vendor/me",vendorGuard,(req,res)=>{let v=db.prepare("SELECT id,full_name,business_name,whatsapp,location,category,status FROM vendors WHERE id=?").get(req.vendorId);res.json(v)});
app.get("/api/vendor/orders",vendorGuard,(req,res)=>res.json(db.prepare("SELECT * FROM orders WHERE vendor_id=? ORDER BY datetime(created_at) DESC").all(req.vendorId)));
app.get("/api/vendor/stats",vendorGuard,(req,res)=>res.json({
 products:db.prepare("SELECT COUNT(*) c FROM products WHERE vendor_id=? AND active=1").get(req.vendorId).c,
 pendingProducts:db.prepare("SELECT COUNT(*) c FROM products WHERE vendor_id=? AND active=0").get(req.vendorId).c,
 sales:db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE vendor_id=? AND payment_status='PAID'").get(req.vendorId).s,
 earnings:db.prepare("SELECT COALESCE(SUM(vendor_earnings),0) s FROM orders WHERE vendor_id=? AND payment_status='PAID'").get(req.vendorId).s
}));
app.post("/api/vendor/products",vendorGuard,upload.array("images",8),(req,res)=>{
 let b=req.body,files=req.files||[],imgs=files.map(f=>"/uploads/"+f.filename),img=imgs[0]||b.imageUrl||"";
 if(!b.name||!b.price)return res.status(400).json({error:"Product name and price are required."});
 let x=db.prepare("INSERT INTO products(name,category,price,stock,description,image,images,active,vendor_id) VALUES(?,?,?,?,?,?,?,?,?)").run(b.name,b.category,+b.price,+b.stock||0,b.description||"",img,JSON.stringify(imgs),0,req.vendorId);
 db.prepare("INSERT INTO vendor_products(product_id,vendor_id,status) VALUES(?,?,?)").run(x.lastInsertRowid,req.vendorId,"PENDING");
 broadcastLive("catalog",{productId:Number(x.lastInsertRowid),pending:true});
 res.json({ok:true,id:x.lastInsertRowid,status:"PENDING"});
});
app.get("/api/vendor/products",vendorGuard,(req,res)=>res.json(db.prepare("SELECT p.*,COALESCE(vp.status,'APPROVED') approval_status FROM products p LEFT JOIN vendor_products vp ON vp.product_id=p.id WHERE p.vendor_id=? ORDER BY p.id DESC").all(req.vendorId)));

// Vendor applications: public application, admin approval, isolated vendor data
app.post("/api/vendors/apply",async(req,res)=>{
  const b=req.body||{};
  const pin=String(b.password||"").trim(), confirm=String(b.confirmPin||pin).trim();
  const email=String(b.email||"").trim().toLowerCase();
  const phone=normalizePhone(b.whatsapp);
  if(!String(b.fullName||"").trim()||!String(b.businessName||"").trim()||phone.length<6)return res.status(400).json({error:"Please complete your name, business name and WhatsApp number."});
  if(email && !/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:"Enter a valid email address."});
  if(!/^\d{4,5}$/.test(pin))return res.status(400).json({error:"Vendor PIN must be exactly 4 or 5 digits."});
  if(pin!==confirm)return res.status(400).json({error:"PINs do not match."});
  const exists=db.prepare("SELECT id FROM vendors WHERE whatsapp=? AND status!='REJECTED'").get("220"+phone);
  if(exists)return res.status(409).json({error:"A vendor application already exists for this number."});
  const code=String(crypto.randomInt(100000,1000000)),otpHash=hashSecret(code),expires=Date.now()+10*60*1000;
  try{
    const x=db.prepare("INSERT INTO vendors(full_name,business_name,whatsapp,location,category,description,password_hash,status,email,email_verified,otp_hash,otp_expires_at,otp_attempts) VALUES(?,?,?,?,?,?,?,'PENDING',?,0,?,?,0)").run(String(b.fullName).trim(),String(b.businessName).trim(),"220"+phone,String(b.location||""),String(b.category||""),String(b.description||""),hashSecret(pin),email || null,email ? otpHash : null,email ? expires : null);
    let verificationRequired=false, message="Application submitted successfully. Your PIN has been saved securely and your application is waiting for Admin approval.";
    if(email){
      try{await sendVendorOtp(email,code);verificationRequired=true;message="Application submitted. A verification code was sent to your email. Email verification is optional for Admin approval.";}
      catch(mailErr){message="Application submitted successfully, but the verification email could not be sent. Admin can still approve your vendor account.";}
    }
    broadcastLive("vendors",{vendorId:Number(x.lastInsertRowid)});
    const waText=[
      "BASSE ONLINE SHOP – VENDOR APPLICATION",
      "",
      `Hello, I have applied to become a vendor/member on BASSE ONLINE SHOP.`,
      "",
      `Application ID: ${Number(x.lastInsertRowid)}`,
      `Owner Name: ${String(b.fullName).trim()}`,
      `Business/Shop: ${String(b.businessName).trim()}`,
      `WhatsApp Number: +220 ${phone}`,
      `Email: ${email || "Not provided"}`,
      `Category: ${String(b.category||"").trim() || "Not provided"}`,
      `Location: ${String(b.location||"").trim() || "Not provided"}`,
      `Description: ${String(b.description||"").trim() || "Not provided"}`,
      "",
      "Please review my application and approve my vendor account. Thank you."
    ].join("\n");
    const whatsappUrl=`https://wa.me/${SHOP_WHATSAPP}?text=${encodeURIComponent(waText)}`;
    res.json({ok:true,id:x.lastInsertRowid,verificationRequired,email,message,whatsappUrl});
  }catch(e){res.status(500).json({error:"Unable to create vendor account."})}
});
app.post("/api/vendors/verify-email",(req,res)=>{
  const email=String(req.body.email||"").trim().toLowerCase(),code=String(req.body.code||"").replace(/\D/g,"");
  if(!email||!/\d{6}/.test(code))return res.status(400).json({error:"Enter the 6-digit verification code."});
  const v=db.prepare("SELECT * FROM vendors WHERE email=? AND status='PENDING' ORDER BY id DESC LIMIT 1").get(email);
  if(!v)return res.status(404).json({error:"Vendor application not found."});
  if(v.email_verified)return res.json({ok:true,verified:true});
  if(Number(v.otp_attempts||0)>=5)return res.status(429).json({error:"Too many incorrect codes. Request a new code."});
  if(!v.otp_expires_at||Number(v.otp_expires_at)<Date.now())return res.status(400).json({error:"That code has expired. Please request a new code."});
  if(!secretMatches(code,v.otp_hash)){db.prepare("UPDATE vendors SET otp_attempts=COALESCE(otp_attempts,0)+1 WHERE id=?").run(v.id);return res.status(400).json({error:"Incorrect verification code."});}
  db.prepare("UPDATE vendors SET email_verified=1,otp_hash=NULL,otp_expires_at=NULL,otp_attempts=0 WHERE id=?").run(v.id);
  broadcastLive("vendors",{vendorId:v.id,emailVerified:true});
  res.json({ok:true,verified:true,message:"Email verified. Your application is now waiting for Admin approval."});
});
app.post("/api/vendors/resend-otp",async(req,res)=>{
  const email=String(req.body.email||"").trim().toLowerCase();
  const v=db.prepare("SELECT * FROM vendors WHERE email=? AND status='PENDING' ORDER BY id DESC LIMIT 1").get(email);
  if(!v)return res.status(404).json({error:"Vendor application not found."});
  const code=String(crypto.randomInt(100000,1000000));
  try{await sendVendorOtp(email,code);db.prepare("UPDATE vendors SET otp_hash=?,otp_expires_at=?,otp_attempts=0 WHERE id=?").run(hashSecret(code),Date.now()+10*60*1000,v.id);res.json({ok:true,message:"A new verification code was sent."});}
  catch(e){res.status(503).json({error:e.message})}
});
app.get("/api/admin/vendors",guard,(req,res)=>res.json(db.prepare("SELECT * FROM vendors ORDER BY datetime(created_at) DESC").all()));
app.post("/api/admin/vendors/:id/approve",guard,(req,res)=>{const v=db.prepare("SELECT id,email,email_verified FROM vendors WHERE id=?").get(req.params.id);if(!v)return res.status(404).json({error:"Vendor not found"});db.prepare("UPDATE vendors SET status='APPROVED' WHERE id=?").run(req.params.id);broadcastLive("vendors",{vendorId:Number(req.params.id)});res.json({ok:true,message:"Vendor approved successfully. Email verification is optional."})});
app.post("/api/admin/vendors/:id/reject",guard,(req,res)=>{db.prepare("UPDATE vendors SET status='REJECTED' WHERE id=?").run(req.params.id);broadcastLive("vendors",{vendorId:Number(req.params.id)});res.json({ok:true})});
app.post("/api/admin/vendors/:id/suspend",guard,(req,res)=>{db.prepare("UPDATE vendors SET status='SUSPENDED' WHERE id=?").run(req.params.id);broadcastLive("vendors",{vendorId:Number(req.params.id)});res.json({ok:true})});
app.post("/api/admin/vendors/:id/reset-pin",guard,(req,res)=>{
  const pin=String(req.body?.pin||"");
  if(!/^\d{4,5}$/.test(pin))return res.status(400).json({error:"PIN must be exactly 4 or 5 digits."});
  const v=db.prepare("SELECT id FROM vendors WHERE id=?").get(req.params.id);
  if(!v)return res.status(404).json({error:"Vendor not found"});
  db.prepare("UPDATE vendors SET password_hash=? WHERE id=?").run(hashSecret(pin),req.params.id);
  broadcastLive("vendors",{vendorId:Number(req.params.id),pinReset:true});
  res.json({ok:true});
});
app.get("/api/vendor/:id/products",(req,res)=>{let v=db.prepare("SELECT id FROM vendors WHERE id=? AND status='APPROVED'").get(req.params.id);if(!v)return res.status(403).json({error:"Vendor not approved"});res.json(db.prepare("SELECT * FROM products WHERE vendor_id=? ORDER BY id DESC").all(v.id))});
app.post("/api/admin/products/:id/approve",guard,(req,res)=>{db.prepare("UPDATE products SET active=1 WHERE id=?").run(req.params.id);db.prepare("UPDATE vendor_products SET status='APPROVED' WHERE product_id=?").run(req.params.id);broadcastLive("catalog",{productId:Number(req.params.id)});res.json({ok:true})});
app.post("/api/admin/products/:id/reject",guard,(req,res)=>{db.prepare("UPDATE products SET active=0 WHERE id=?").run(req.params.id);db.prepare("UPDATE vendor_products SET status='REJECTED' WHERE product_id=?").run(req.params.id);broadcastLive("catalog",{productId:Number(req.params.id)});res.json({ok:true})});
app.get("/api/admin/vendor-stats",guard,(req,res)=>res.json({vendors:db.prepare("SELECT COUNT(*) c FROM vendors").get().c,pending:db.prepare("SELECT COUNT(*) c FROM vendors WHERE status='PENDING'").get().c,active:db.prepare("SELECT COUNT(*) c FROM vendors WHERE status='APPROVED'").get().c,commission:db.prepare("SELECT COALESCE(SUM(commission),0) s FROM orders WHERE payment_status='PAID'").get().s}));

app.listen(PORT,"0.0.0.0",()=>console.log("BASSE ONLINE SHOP running on "+PORT));