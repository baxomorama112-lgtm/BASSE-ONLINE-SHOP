const express=require("express"),Database=require("better-sqlite3"),multer=require("multer"),path=require("path"),crypto=require("crypto"),fs=require("fs");
const app=express(),PORT=process.env.PORT||3000,ROOT=__dirname,DATA_DIR=process.env.DATA_DIR||path.join(ROOT,"data");
const PUBLIC_BASE_URL=(process.env.PUBLIC_BASE_URL||"https://basse-online-shop.onrender.com").replace(/\/$/,"");
const STATIC_WAYCHIT_URL=process.env.WAYCHIT_STATIC_URL||"https://app.waychit.com/pm/?param1=%7B%22type%22%3A%22staticPaymentRequest%22%2C%22merchantAccountId%22%3A%226a8b03204ad0d928fc3a529c%22%7D";
const SHOP_WHATSAPP=String(process.env.BASSE_MARKET_WHATSAPP||"2206963349").replace(/\D/g,"");fs.mkdirSync(DATA_DIR,{recursive:true});fs.mkdirSync(path.join(DATA_DIR,"uploads"),{recursive:true});
app.use(express.json({limit:"20mb",verify:(req,res,buf)=>{if(req.originalUrl==="/api/waychit/webhook")req.rawBody=buf.toString("utf8")}}));
app.use("/uploads",express.static(path.join(DATA_DIR,"uploads")));
app.use("/admin",express.static(path.join(ROOT,"../admin")));app.use("/vendor",express.static(path.join(ROOT,"../vendor")));
app.use("/",express.static(path.join(ROOT,"../marketplace")));
const DB_PATH=path.join(DATA_DIR,"basse-shop.db"),BACKUP_PATH=path.join(DATA_DIR,"catalog-backup.json");
const db=new Database(DB_PATH);db.pragma("journal_mode=WAL");db.pragma("synchronous=FULL");db.pragma("busy_timeout=5000");
db.exec(`CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,category TEXT,price INTEGER,stock INTEGER,description TEXT,image TEXT,active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,product_id INTEGER,product_name TEXT,quantity INTEGER,customer_name TEXT,whatsapp TEXT,location TEXT,total INTEGER,payment_status TEXT DEFAULT 'PENDING',order_status TEXT DEFAULT 'NEW',waychit_request_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,vendor_id INTEGER DEFAULT NULL,commission INTEGER DEFAULT 0,vendor_earnings INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS vendors(id INTEGER PRIMARY KEY AUTOINCREMENT,full_name TEXT,business_name TEXT,whatsapp TEXT,email TEXT DEFAULT '',email_verified INTEGER DEFAULT 0,verification_code TEXT,verification_expires TEXT,location TEXT,category TEXT,description TEXT,password_hash TEXT,status TEXT DEFAULT 'PENDING',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS vendor_products(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER,vendor_id INTEGER,status TEXT DEFAULT 'PENDING',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS customer_accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,full_name TEXT,whatsapp TEXT UNIQUE,password_hash TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payout_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,vendor_id INTEGER,amount INTEGER,status TEXT DEFAULT 'PENDING',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS vendor_submission_keys(idempotency_key TEXT PRIMARY KEY,vendor_id INTEGER NOT NULL,product_id INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS auth_sessions(token TEXT PRIMARY KEY,type TEXT NOT NULL,vendor_id INTEGER DEFAULT NULL,expires_at INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
try{db.exec("ALTER TABLE products ADD COLUMN images TEXT DEFAULT ''")}catch(e){}
const BACKUP_TABLES=["products","orders","vendors","vendor_products","customer_accounts","payout_requests","vendor_submission_keys"];
function buildShopSnapshot(){
  const data={version:3,createdAt:new Date().toISOString(),tables:{}};
  for(const table of BACKUP_TABLES)data.tables[table]=db.prepare(`SELECT * FROM ${table}`).all();
  data.meta={productCount:data.tables.products.length,orderCount:data.tables.orders.length,vendorCount:data.tables.vendors.length,orderTotal:data.tables.orders.reduce((n,o)=>n+Number(o.total||0),0)};
  return data;
}
function collectBackupFiles(){
  const dir=path.join(DATA_DIR,"uploads");
  if(!fs.existsSync(dir))return [];
  const out=[];
  for(const name of fs.readdirSync(dir)){
    const full=path.join(dir,name);
    try{
      if(fs.statSync(full).isFile()){
        out.push({path:`uploads/${name}`,content:fs.readFileSync(full).toString("base64")});
      }
    }catch{}
  }
  return out;
}
function buildFullBackupSnapshot(reason="auto"){
  const data=buildShopSnapshot();
  data.version=4;
  data.reason=reason;
  data.backupNote="Includes shop database records and uploaded files from server/data/uploads.";
  data.files=collectBackupFiles();
  return data;
}
function backupShopData(reason="auto"){
  try{
    const data=buildFullBackupSnapshot(reason);
    const tmp=BACKUP_PATH+".tmp";
    fs.writeFileSync(tmp,JSON.stringify(data,null,2),"utf8");
    fs.renameSync(tmp,BACKUP_PATH);
    return {ok:true,createdAt:data.createdAt,meta:data.meta,cloudConfigured:false,cloudStatus:"disabled"};
  }catch(e){
    console.error("Shop auto-save failed:",e.message);
    return {ok:false,error:e.message};
  }
}
function backupCatalog(){ return backupShopData("data-change"); }

function restoreShopBackupIfEmpty(){
  try{
    const counts=BACKUP_TABLES.map(t=>Number(db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c));
    if(counts.some(Boolean)||!fs.existsSync(BACKUP_PATH))return false;
    const data=JSON.parse(fs.readFileSync(BACKUP_PATH,"utf8"));
    if(!data?.tables?.products)return false;
    const schemas={
      products:["id","name","category","price","stock","description","image","active","created_at","images","vendor_id"],
      orders:["id","product_id","product_name","quantity","customer_name","whatsapp","location","total","payment_status","order_status","waychit_request_id","created_at","vendor_id","commission","vendor_earnings"],
      vendors:["id","full_name","business_name","whatsapp","email","email_verified","verification_code","verification_expires","location","category","description","password_hash","status","created_at"],
      vendor_products:["id","product_id","vendor_id","status","created_at"],
      customer_accounts:["id","full_name","whatsapp","password_hash","created_at"],
      payout_requests:["id","vendor_id","amount","status","created_at"],
      vendor_submission_keys:["idempotency_key","vendor_id","product_id","created_at"]
    };
    const tx=db.transaction(()=>{
      db.pragma("foreign_keys = OFF");
      for(const table of BACKUP_TABLES)db.prepare(`DELETE FROM ${table}`).run();
      for(const table of BACKUP_TABLES){
        const cols=schemas[table], rows=Array.isArray(data.tables[table])?data.tables[table]:[];
        if(!rows.length)continue;
        const ins=db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(()=>"?").join(",")})`);
        for(const row of rows)ins.run(...cols.map(k=>row[k]??null));
      }
    });
    tx();
    for(const file of (data.files||[])){
      if(!file?.path || !file.path.startsWith("uploads/") || file.path.includes("..")) continue;
      const dest=path.join(DATA_DIR,file.path);
      fs.mkdirSync(path.dirname(dest),{recursive:true});
      fs.writeFileSync(dest,Buffer.from(file.content||"","base64"));
    }
    console.log(`AUTO-RESTORE completed: ${data.meta?.productCount||0} products, ${data.meta?.vendorCount||0} vendors.`);

    return true;
  }catch(e){console.error("Shop auto-restore failed:",e.message);return false}
}

try{db.exec("ALTER TABLE products ADD COLUMN vendor_id INTEGER DEFAULT NULL")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN vendor_id INTEGER DEFAULT NULL")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN commission INTEGER DEFAULT 0")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN vendor_earnings INTEGER DEFAULT 0")}catch(e){}
// Restore from the local backup before serving traffic.
// This version intentionally has no GitHub/cloud-backup dependency.
restoreShopBackupIfEmpty();
if(!db.prepare("SELECT COUNT(*) c FROM products").get().c){
  console.log("BASSE shop database is empty. Add products from Admin Dashboard.");
}
backupShopData("startup");

const upload=multer({storage:multer.diskStorage({destination:path.join(DATA_DIR,"uploads"),filename:(r,f,cb)=>cb(null,crypto.randomBytes(8).toString("hex")+path.extname(f.originalname))}),limits:{fileSize:6e6}});
const sessions=new Map(); // retained only for backwards compatibility; auth is persisted in SQLite
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
function getSession(req){
  const token=(req.headers.authorization||"").replace("Bearer ","").trim();
  if(!token)return null;
  const s=db.prepare("SELECT * FROM auth_sessions WHERE token=? AND expires_at>? ").get(token,Date.now());
  if(!s){ if(token)db.prepare("DELETE FROM auth_sessions WHERE token=?").run(token); return null; }
  return s;
}
function guard(req,res,next){const s=getSession(req);if(!s||s.type!=="admin")return res.status(401).json({error:"Admin login required"});req.sessionToken=s.token;next()}
function vendorGuard(req,res,next){const s=getSession(req);if(!s||s.type!=="vendor")return res.status(401).json({error:"Vendor login required"});req.vendorId=s.vendor_id;req.sessionToken=s.token;next()}
app.post("/api/auth/logout",(req,res)=>{const token=(req.headers.authorization||"").replace("Bearer ","").trim();if(token)db.prepare("DELETE FROM auth_sessions WHERE token=?").run(token);res.json({ok:true});});
app.get("/api/products",(req,res)=>{let p=db.prepare("SELECT * FROM products WHERE active=1 ORDER BY id DESC").all(),c=req.query.category||"All",q=(req.query.q||"").toLowerCase();if(c!=="All")p=p.filter(x=>x.category===c);if(q)p=p.filter(x=>(x.name+" "+x.category+" "+x.description).toLowerCase().includes(q));res.json(p)});
app.get("/api/products/:id",(req,res)=>{let p=db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(req.params.id);p?res.json(p):res.status(404).json({error:"Product not found"})});
app.post("/api/admin/login",(req,res)=>{
  if(req.body.email===process.env.ADMIN_EMAIL&&req.body.password===process.env.ADMIN_PASSWORD){
    const t=crypto.randomBytes(32).toString("hex"),exp=Date.now()+30*24*60*60*1000;
    db.prepare("INSERT OR REPLACE INTO auth_sessions(token,type,vendor_id,expires_at) VALUES(?,?,NULL,?)").run(t,"admin",exp);
    res.json({token:t,expiresAt:exp});
  }else res.status(401).json({error:"Invalid admin login"})
});
app.get("/api/admin/products",guard,(req,res)=>res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all()));
app.post("/api/admin/products",guard,upload.array("images",8),(req,res)=>{let b=req.body,files=req.files||[],fileImgs=files.map(f=>"/uploads/"+f.filename),img=fileImgs[0]||b.imageUrl||"",imgs=JSON.stringify(fileImgs.length?fileImgs:(b.images?String(b.images).split(",").map(x=>x.trim()).filter(Boolean):[]));
let x=db.prepare("INSERT INTO products(name,category,price,stock,description,image,images,vendor_id) VALUES(?,?,?,?,?,?,?,?)").run(b.name,b.category,+b.price,+b.stock||0,b.description||"",img,imgs,b.vendorId?+b.vendorId:null);let created=db.prepare("SELECT * FROM products WHERE id=?").get(x.lastInsertRowid);backupCatalog();broadcastLive("catalog",{productId:created.id});res.json(created)});
app.put("/api/admin/products/:id",guard,upload.array("images",8),(req,res)=>{let p=db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id);if(!p)return res.status(404).json({error:"Product not found"});let b=req.body,files=req.files||[],fileImgs=files.map(f=>"/uploads/"+f.filename),img=fileImgs[0]||b.imageUrl||p.image,oldImgs=p.images||"[]",imgs=fileImgs.length?JSON.stringify(fileImgs):(b.images?JSON.stringify(String(b.images).split(",").map(x=>x.trim()).filter(Boolean)):oldImgs);db.prepare("UPDATE products SET name=?,category=?,price=?,stock=?,description=?,image=?,images=?,vendor_id=? WHERE id=?").run(b.name,b.category,+b.price,+b.stock,b.description||"",img,imgs,b.vendorId?+b.vendorId:p.vendor_id||null,p.id);let updated=db.prepare("SELECT * FROM products WHERE id=?").get(p.id);backupCatalog();broadcastLive("catalog",{productId:p.id});res.json(updated)});
app.delete("/api/admin/products/:id",guard,(req,res)=>{db.prepare("UPDATE products SET active=0 WHERE id=?").run(req.params.id);backupCatalog();broadcastLive("catalog",{productId:Number(req.params.id)});res.json({ok:true})});
app.get("/api/admin/orders",guard,(req,res)=>res.json(db.prepare("SELECT * FROM orders ORDER BY datetime(created_at) DESC").all()));
app.get("/api/admin/backup",guard,(req,res)=>{
  try{
    const data=buildFullBackupSnapshot("manual-download");
    data.version=4;
    data.backupNote="Includes shop database records AND uploaded files from server/data/uploads.";
    res.set("Content-Disposition",`attachment; filename="basse-online-shop-full-backup-${new Date().toISOString().slice(0,10)}.json"`);
    res.type("application/json").send(JSON.stringify(data,null,2));
  }catch(e){res.status(500).json({error:"Could not create backup with images."})}
});
app.get("/api/admin/backup/status",guard,(req,res)=>{
  try{
    const exists=fs.existsSync(BACKUP_PATH);
    const stat=exists?fs.statSync(BACKUP_PATH):null;
    const data=exists?JSON.parse(fs.readFileSync(BACKUP_PATH,"utf8")):null;
    res.json({
      enabled:true,
      exists,
      lastSaved:data?.createdAt||null,
      sizeBytes:stat?.size||0,
      meta:data?.meta||{productCount:0,vendorCount:0,orderCount:0},
      storagePath:BACKUP_PATH,
      cloud:{provider:null,configured:false,status:"disabled",lastSaved:null,lastError:""}
    });
  }catch(e){
    res.json({enabled:true,exists:false,lastSaved:null,sizeBytes:0,meta:{},storagePath:BACKUP_PATH,cloud:{provider:null,configured:false,status:"disabled",lastSaved:null,lastError:""},error:e.message});
  }
});
app.post("/api/admin/backup/save-now",guard,(req,res)=>{
  const r=backupShopData("manual");
  if(!r.ok)return res.status(500).json({error:"Automatic save failed. Check server storage."});
  res.json({ok:true,message:"Shop data and uploaded images saved locally ✓",...r});
});
app.post("/api/admin/backup/auto-save",guard,(req,res)=>{
  const r=backupShopData("auto-toggle");
  if(!r.ok)return res.status(500).json({error:"Could not initialize automatic backup."});
  res.json({ok:true,enabled:true,message:"Automatic shop save is ON ✓",...r});
});
app.post("/api/admin/restore",guard,(req,res)=>{
  try{
    const data=req.body;
    if(!data||!data.tables||!Array.isArray(data.tables.products))return res.status(400).json({error:"Invalid BASSE backup file."});
    const tables=["products","orders","vendors","vendor_products","customer_accounts","payout_requests","vendor_submission_keys"];
    const tx=db.transaction(()=>{
      db.pragma("foreign_keys = OFF");
      for(const table of tables)db.prepare(`DELETE FROM ${table}`).run();
      const productCols=["id","name","category","price","stock","description","image","active","created_at","images","vendor_id"];
      const productIns=db.prepare(`INSERT INTO products (${productCols.join(",")}) VALUES (${productCols.map(()=>"?").join(",")})`);
      for(const x of (data.tables.products||[]))productIns.run(...productCols.map(k=>x[k]??null));
      const schemas={
        orders:["id","product_id","product_name","quantity","customer_name","whatsapp","location","total","payment_status","order_status","waychit_request_id","created_at","vendor_id","commission","vendor_earnings"],
        vendors:["id","full_name","business_name","whatsapp","email","email_verified","verification_code","verification_expires","location","category","description","password_hash","status","created_at"],
        vendor_products:["id","product_id","vendor_id","status","created_at"],
        customer_accounts:["id","full_name","whatsapp","password_hash","created_at"],
        payout_requests:["id","vendor_id","amount","status","created_at"],
        vendor_submission_keys:["idempotency_key","vendor_id","product_id","created_at"]
      };
      for(const table of Object.keys(schemas)){const cols=schemas[table],ins=db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(()=>"?").join(",")})`);for(const x of (data.tables[table]||[]))ins.run(...cols.map(k=>x[k]??null))}
    });
    tx(); backupCatalog(); broadcastLive("refresh",{});
    res.json({ok:true,message:`Backup restored successfully: ${data.tables.products.length} products, ${(data.tables.orders||[]).length} orders and ${(data.tables.vendors||[]).length} vendors.`});
  }catch(e){console.error("Backup restore failed:",e);res.status(500).json({error:"Restore failed. The backup format may not match this shop version."})}
});
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
  backupShopData("order-created");
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
          successRedirectUrl:PUBLIC_BASE_URL+"/payment-return?payment=success&order="+encodeURIComponent(id),
          failureRedirectUrl:PUBLIC_BASE_URL+"/payment-return?payment=failed&order="+encodeURIComponent(id)
        })
      });
      let body=await r.text();
      let d={}; try{d=JSON.parse(body)}catch{}
      console.log("Waychit payment request:",r.status,body.slice(0,1200));
      if(r.ok&&d.paymentRequest&&d.paymentRequest.waychitLaunchUrl){
        paymentUrl=d.paymentRequest.waychitLaunchUrl;
        db.prepare("UPDATE orders SET waychit_request_id=? WHERE id=?").run(d.paymentRequest.id,id);
        backupShopData("payment-request");
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
    returnUrl:PUBLIC_BASE_URL+"/payment-return",
    automaticReturnSupported:paymentMode==="dynamic",
    whatsappSupport:SHOP_WHATSAPP
  });
});
app.get("/api/order/:id",(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);o?res.json({...o,whatsappSupport:SHOP_WHATSAPP}):res.status(404).json({error:"Order not found"})});
app.post("/api/admin/orders/:id/payment",guard,(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});if(o.payment_status==='REFUNDED'||o.payment_status==='CANCELLED')return res.status(400).json({error:'This payment is already closed.'});db.prepare("UPDATE orders SET payment_status='PAID',order_status='PROCESSING' WHERE id=?").run(req.params.id);backupShopData("payment-confirmed");broadcastLive("orders",{orderId:req.params.id});res.json({ok:true})});
app.post("/api/admin/orders/:id/cancel-payment",guard,(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});if(o.payment_status==='PAID')return res.status(400).json({error:'A paid order cannot be cancelled. Use Refund instead.'});db.prepare("UPDATE orders SET payment_status='CANCELLED',order_status='CANCELLED' WHERE id=?").run(req.params.id);backupShopData("payment-cancelled");broadcastLive("orders",{orderId:req.params.id});res.json({ok:true})});
app.post("/api/admin/orders/:id/refund",guard,(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});if(o.payment_status!=='PAID')return res.status(400).json({error:'Only paid orders can be marked refunded.'});db.prepare("UPDATE orders SET payment_status='REFUNDED',order_status='REFUNDED' WHERE id=?").run(req.params.id);backupShopData("refund");broadcastLive("orders",{orderId:req.params.id});res.json({ok:true,notice:'Order marked refunded. Complete the actual money reversal in Waychit if required.'})});
app.post("/api/admin/orders/:id/reopen",guard,(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});db.prepare("UPDATE orders SET payment_status='PENDING',order_status='NEW' WHERE id=?").run(req.params.id);backupShopData("order-reopen");broadcastLive("orders",{orderId:req.params.id});res.json({ok:true})});
app.patch("/api/admin/orders/:id/status",guard,(req,res)=>{let allowed=['NEW','PROCESSING','READY','DELIVERED','CANCELLED','REFUNDED'];let status=String(req.body.status||'').toUpperCase();if(!allowed.includes(status))return res.status(400).json({error:'Invalid order status'});db.prepare("UPDATE orders SET order_status=? WHERE id=?").run(status,req.params.id);backupShopData("order-status");broadcastLive("orders",{orderId:req.params.id});res.json({ok:true})});
app.get("/api/payment-config",(req,res)=>res.json({configured:!!process.env.WAYCHIT_API_KEY,publicBaseUrl:PUBLIC_BASE_URL,staticFallback:true,returnUrl:PUBLIC_BASE_URL+"/payment-return",automaticReturnSupported:!!process.env.WAYCHIT_API_KEY}));
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
      db.prepare("UPDATE orders SET payment_status='PAID',order_status='PROCESSING' WHERE id=? AND payment_status!='REFUNDED'").run(ref);backupShopData("webhook-payment");broadcastLive("orders",{orderId:ref});
    }
    res.sendStatus(200);
  }catch(e){res.status(400).send("Bad webhook")}
});


app.post("/api/vendor/login",(req,res)=>{
 const phone=String(req.body.whatsapp||req.body.phone||"").replace(/\D/g,"").replace(/^220/,""),pin=String(req.body.pin||req.body.password||"");
 if(phone.length<6||!/^\d{4,5}$/.test(pin))return res.status(400).json({error:"Enter your phone number and 4 or 5 digit PIN."});
 const v=db.prepare("SELECT * FROM vendors WHERE whatsapp=? AND status='APPROVED'").get("220"+phone);
 const ok=v && v.password_hash && crypto.createHash("sha256").update(pin).digest("hex")===String(v.password_hash);
 if(!ok)return res.status(401).json({error:"Invalid vendor phone/PIN, or the vendor has not been approved yet."});
 const t=crypto.randomBytes(32).toString("hex"),exp=Date.now()+30*24*60*60*1000;
 db.prepare("INSERT OR REPLACE INTO auth_sessions(token,type,vendor_id,expires_at) VALUES(?,?,?,?)").run(t,"vendor",v.id,exp);
 res.json({token:t,expiresAt:exp,vendor:{id:v.id,business_name:v.business_name,full_name:v.full_name,email:v.email||""}});
});
app.get("/api/vendor/me",vendorGuard,(req,res)=>{let v=db.prepare("SELECT id,full_name,business_name,whatsapp,location,category,status FROM vendors WHERE id=?").get(req.vendorId);res.json(v)});
app.get("/api/vendor/orders",vendorGuard,(req,res)=>res.json(db.prepare("SELECT * FROM orders WHERE vendor_id=? ORDER BY datetime(created_at) DESC").all(req.vendorId)));
app.get("/api/vendor/stats",vendorGuard,(req,res)=>res.json({
 products:db.prepare("SELECT COUNT(*) c FROM products WHERE vendor_id=? AND active=1").get(req.vendorId).c,
 pendingProducts:db.prepare("SELECT COUNT(*) c FROM products WHERE vendor_id=? AND active=0").get(req.vendorId).c,
 sales:db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE vendor_id=? AND payment_status='PAID'").get(req.vendorId).s,
 earnings:db.prepare("SELECT COALESCE(SUM(vendor_earnings),0) s FROM orders WHERE vendor_id=? AND payment_status='PAID'").get(req.vendorId).s
}));
app.post("/api/vendor/products",vendorGuard,(req,res,next)=>{
  // A client keeps the same idempotency key when retrying after a dropped network.
  // If the first request already reached the server, return the original product
  // instead of creating a duplicate.
  const key=String(req.headers["x-idempotency-key"]||"").trim();
  req.vendorIdempotencyKey=key;
  if(key){
    const prior=db.prepare("SELECT product_id FROM vendor_submission_keys WHERE idempotency_key=? AND vendor_id=?").get(key,req.vendorId);
    if(prior){
      const product=db.prepare("SELECT id FROM products WHERE id=? AND vendor_id=?").get(prior.product_id,req.vendorId);
      if(product)return res.json({ok:true,id:product.id,status:"PENDING",duplicate:true});
    }
  }
  next();
},upload.array("images",8),(req,res)=>{
 let b=req.body,files=req.files||[],imgs=files.map(f=>"/uploads/"+f.filename),img=imgs[0]||b.imageUrl||"";
 if(!b.name||!b.price)return res.status(400).json({error:"Product name and price are required."});
 const create=db.transaction(()=>{
   let x=db.prepare("INSERT INTO products(name,category,price,stock,description,image,images,active,vendor_id) VALUES(?,?,?,?,?,?,?,?,?)").run(String(b.name).trim(),b.category,+b.price,+b.stock||0,b.description||"",img,JSON.stringify(imgs),0,req.vendorId);
   db.prepare("INSERT INTO vendor_products(product_id,vendor_id,status) VALUES(?,?,?)").run(x.lastInsertRowid,req.vendorId,"PENDING");backupCatalog();
   if(req.vendorIdempotencyKey){
     db.prepare("INSERT INTO vendor_submission_keys(idempotency_key,vendor_id,product_id) VALUES(?,?,?)").run(req.vendorIdempotencyKey,req.vendorId,x.lastInsertRowid);
   }
   backupShopData("vendor-product-submission");
   return Number(x.lastInsertRowid);
 });
 try{
   const id=create();
   broadcastLive("catalog",{productId:id,pending:true});
   res.json({ok:true,id,status:"PENDING"});
 }catch(err){
   // A simultaneous retry can hit the unique key. Return the already-created product.
   if(req.vendorIdempotencyKey){
     const prior=db.prepare("SELECT product_id FROM vendor_submission_keys WHERE idempotency_key=? AND vendor_id=?").get(req.vendorIdempotencyKey,req.vendorId);
     if(prior)return res.json({ok:true,id:prior.product_id,status:"PENDING",duplicate:true});
   }
   res.status(500).json({error:"Could not save the product. Please try again."});
 }
});
app.get("/api/vendor/products",vendorGuard,(req,res)=>res.json(db.prepare("SELECT p.*,COALESCE(vp.status,'APPROVED') approval_status FROM products p LEFT JOIN vendor_products vp ON vp.product_id=p.id WHERE p.vendor_id=? ORDER BY p.id DESC").all(req.vendorId)));


function hashPin(pin){return crypto.createHash("sha256").update(String(pin)).digest("hex")}

// Vendor applications: public application, admin approval, isolated vendor data
app.post("/api/vendors/apply",(req,res)=>{
  const b=req.body||{}, pin=String(b.password||"");
  const phone=String(b.whatsapp||"").replace(/\D/g,"").replace(/^220/,"");
  if(!String(b.fullName||"").trim()||!String(b.businessName||"").trim()||phone.length<6)
    return res.status(400).json({error:"Please complete your name, business name and WhatsApp number."});
  if(!/^\d{4,5}$/.test(pin))return res.status(400).json({error:"Vendor PIN must be exactly 4 or 5 digits."});
  const existing=db.prepare("SELECT * FROM vendors WHERE whatsapp=? AND status!='REJECTED'").get("220"+phone);
  if(existing)return res.status(409).json({error:`A vendor application already exists for this number (${existing.status}). Wait for Admin approval or ask Admin to reset/reopen it.`,id:existing.id,status:existing.status});
  const x=db.prepare("INSERT INTO vendors(full_name,business_name,whatsapp,email,email_verified,location,category,description,password_hash) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(String(b.fullName).trim(),String(b.businessName).trim(),"220"+phone,"",1,String(b.location||""),String(b.category||""),String(b.description||""),hashPin(pin));
  backupShopData("vendor-application");
  broadcastLive("vendors",{vendorId:Number(x.lastInsertRowid)});
  res.json({ok:true,id:x.lastInsertRowid,status:"PENDING",message:"Application submitted. Wait for Admin approval."});
});
app.get("/api/vendors/status",(req,res)=>{
  const phone=String(req.query.whatsapp||req.query.phone||"").replace(/\D/g,"").replace(/^220/,"");
  if(phone.length<6)return res.status(400).json({error:"Enter a valid WhatsApp number"});
  const v=db.prepare("SELECT id,status,business_name FROM vendors WHERE whatsapp=? ORDER BY id DESC LIMIT 1").get("220"+phone);
  if(!v)return res.status(404).json({error:"No vendor application found for this number."});
  res.json({id:v.id,status:v.status,business_name:v.business_name});
});
app.get("/api/admin/vendors",guard,(req,res)=>res.json(db.prepare("SELECT * FROM vendors ORDER BY datetime(created_at) DESC").all()));
app.post("/api/admin/vendors/:id/approve",guard,(req,res)=>{const v=db.prepare("SELECT id,status,password_hash FROM vendors WHERE id=?").get(req.params.id);if(!v)return res.status(404).json({error:"Vendor not found"});db.prepare("UPDATE vendors SET status='APPROVED' WHERE id=?").run(req.params.id);backupShopData("vendor-approved");broadcastLive("vendors",{vendorId:Number(req.params.id),status:"APPROVED"});res.json({ok:true,status:"APPROVED"})});
app.post("/api/admin/vendors/:id/reject",guard,(req,res)=>{db.prepare("UPDATE vendors SET status='REJECTED' WHERE id=?").run(req.params.id);backupShopData("vendor-rejected");broadcastLive("vendors",{vendorId:Number(req.params.id)});res.json({ok:true})});
app.post("/api/admin/vendors/:id/suspend",guard,(req,res)=>{db.prepare("UPDATE vendors SET status='SUSPENDED' WHERE id=?").run(req.params.id);backupShopData("vendor-suspended");broadcastLive("vendors",{vendorId:Number(req.params.id)});res.json({ok:true})});
app.post("/api/admin/vendors/:id/reset-pin",guard,(req,res)=>{
  const pin=String(req.body?.pin||"");
  if(!/^\d{4,5}$/.test(pin))return res.status(400).json({error:"PIN must be exactly 4 or 5 digits."});
  const v=db.prepare("SELECT id FROM vendors WHERE id=?").get(req.params.id);
  if(!v)return res.status(404).json({error:"Vendor not found"});
  db.prepare("UPDATE vendors SET password_hash=? WHERE id=?").run(crypto.createHash("sha256").update(pin).digest("hex"),req.params.id);
  backupShopData("vendor-pin-reset");
  broadcastLive("vendors",{vendorId:Number(req.params.id),pinReset:true});
  res.json({ok:true});
});
app.get("/api/vendor/:id/products",(req,res)=>{let v=db.prepare("SELECT id FROM vendors WHERE id=? AND status='APPROVED'").get(req.params.id);if(!v)return res.status(403).json({error:"Vendor not approved"});res.json(db.prepare("SELECT * FROM products WHERE vendor_id=? ORDER BY id DESC").all(v.id))});
app.post("/api/admin/products/:id/approve",guard,(req,res)=>{db.prepare("UPDATE products SET active=1 WHERE id=?").run(req.params.id);db.prepare("UPDATE vendor_products SET status='APPROVED' WHERE product_id=?").run(req.params.id);backupCatalog();broadcastLive("catalog",{productId:Number(req.params.id)});res.json({ok:true})});
app.post("/api/admin/products/:id/reject",guard,(req,res)=>{db.prepare("UPDATE products SET active=0 WHERE id=?").run(req.params.id);db.prepare("UPDATE vendor_products SET status='REJECTED' WHERE product_id=?").run(req.params.id);backupCatalog();broadcastLive("catalog",{productId:Number(req.params.id)});res.json({ok:true})});
app.get("/api/admin/vendor-stats",guard,(req,res)=>res.json({vendors:db.prepare("SELECT COUNT(*) c FROM vendors").get().c,pending:db.prepare("SELECT COUNT(*) c FROM vendors WHERE status='PENDING'").get().c,active:db.prepare("SELECT COUNT(*) c FROM vendors WHERE status='APPROVED'").get().c,commission:db.prepare("SELECT COALESCE(SUM(commission),0) s FROM orders WHERE payment_status='PAID'").get().s}));

setInterval(()=>{try{db.prepare("DELETE FROM auth_sessions WHERE expires_at<=?").run(Date.now())}catch{}},60*60*1000);
app.listen(PORT,"0.0.0.0",()=>console.log("BASSE ONLINE SHOP running on "+PORT));