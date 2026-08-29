const express=require("express"),Database=require("better-sqlite3"),multer=require("multer"),compression=require("compression"),path=require("path"),crypto=require("crypto"),fs=require("fs");
const app=express(),PORT=process.env.PORT||3000,ROOT=__dirname,DATA_DIR=process.env.DATA_DIR||path.join(ROOT,"data");
app.use(compression({threshold:1024}));
const PUBLIC_BASE_URL=(process.env.PUBLIC_BASE_URL||"https://basse-online-shop.onrender.com").replace(/\/$/,"");
const STATIC_WAYCHIT_URL=process.env.WAYCHIT_STATIC_URL||"https://app.waychit.com/pm/?param1=%7B%22type%22%3A%22staticPaymentRequest%22%2C%22merchantAccountId%22%3A%226a8b03204ad0d928fc3a529c%22%7D";
const SHOP_WHATSAPP=String(process.env.BASSE_MARKET_WHATSAPP||"2206963349").replace(/\D/g,"");fs.mkdirSync(DATA_DIR,{recursive:true});fs.mkdirSync(path.join(DATA_DIR,"uploads"),{recursive:true});
app.use(express.json({limit:"100mb",verify:(req,res,buf)=>{if(req.originalUrl==="/api/waychit/webhook")req.rawBody=buf.toString("utf8")}}));
app.use("/uploads",express.static(path.join(DATA_DIR,"uploads"),{maxAge:"7d",immutable:false}));
app.use("/downloads",express.static(path.join(ROOT,"../downloads"),{fallthrough:true,maxAge:"1d"}));
app.get("/download",(req,res)=>{
  res.sendFile(path.join(ROOT,"../marketplace/download.html"));
});
app.get("/api/health",(req,res)=>{
  const productCount=Number(db.prepare("SELECT COUNT(*) c FROM products").get().c);
  res.json({ok:true,productCount,dataDir:DATA_DIR,persistentDataDir:DATA_DIR});
});
app.use("/admin",express.static(path.join(ROOT,"../admin"),{maxAge:0}));app.use("/vendor",express.static(path.join(ROOT,"../vendor"),{maxAge:0}));app.use("/driver",express.static(path.join(ROOT,"../driver"),{maxAge:0}));
app.use("/",express.static(path.join(ROOT,"../marketplace"),{maxAge:0}));
const DB_PATH=path.join(DATA_DIR,"basse-shop.db"),BACKUP_PATH=path.join(DATA_DIR,"catalog-backup.json"),PREV_BACKUP_PATH=path.join(DATA_DIR,"catalog-backup.previous.json");
const db=new Database(DB_PATH);db.pragma("journal_mode=WAL");db.pragma("synchronous=FULL");db.pragma("busy_timeout=5000");
db.exec(`CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,category TEXT,price INTEGER,stock INTEGER,description TEXT,image TEXT,active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP,options_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,product_id INTEGER,product_name TEXT,quantity INTEGER,customer_name TEXT,whatsapp TEXT,location TEXT,total INTEGER,payment_status TEXT DEFAULT 'PENDING',order_status TEXT DEFAULT 'NEW',waychit_request_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,vendor_id INTEGER DEFAULT NULL,commission INTEGER DEFAULT 0,vendor_earnings INTEGER DEFAULT 0,stock_reserved INTEGER DEFAULT 0,stock_released INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS vendors(id INTEGER PRIMARY KEY AUTOINCREMENT,full_name TEXT,business_name TEXT,whatsapp TEXT,email TEXT DEFAULT '',email_verified INTEGER DEFAULT 0,verification_code TEXT,verification_expires TEXT,location TEXT,category TEXT,description TEXT,password_hash TEXT,status TEXT DEFAULT 'PENDING',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS vendor_products(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER,vendor_id INTEGER,status TEXT DEFAULT 'PENDING',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS customer_accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,full_name TEXT,whatsapp TEXT UNIQUE,password_hash TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payout_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,vendor_id INTEGER,amount INTEGER,status TEXT DEFAULT 'PENDING',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS vendor_submission_keys(idempotency_key TEXT PRIMARY KEY,vendor_id INTEGER NOT NULL,product_id INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS auth_sessions(token TEXT PRIMARY KEY,type TEXT NOT NULL,vendor_id INTEGER DEFAULT NULL,expires_at INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS delivery_drivers(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  whatsapp TEXT UNIQUE NOT NULL,
  pin_hash TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS deliveries(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL UNIQUE,
  driver_id INTEGER,
  status TEXT DEFAULT 'ASSIGNED',
  lat REAL,
  lng REAL,
  accuracy REAL,
  last_seen TEXT,
  started_at TEXT,
  arrived_at TEXT,
  delivered_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(driver_id) REFERENCES delivery_drivers(id)
);`);
try{db.exec(`CREATE TABLE IF NOT EXISTS login_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,portal TEXT NOT NULL,identifier TEXT NOT NULL,success INTEGER DEFAULT 0,reason TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP); CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);`)}catch(e){console.error('Login log setup failed:',e.message)}
try{db.exec("ALTER TABLE products ADD COLUMN images TEXT DEFAULT ''")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN customer_lat REAL")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN customer_lng REAL")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN customer_accuracy REAL")}catch(e){}
const BACKUP_TABLES=["products","orders","vendors","vendor_products","customer_accounts","payout_requests","vendor_submission_keys","delivery_drivers","deliveries"];
function buildShopSnapshot(){
  const data={version:3,createdAt:new Date().toISOString(),tables:{}};
  for(const table of BACKUP_TABLES)data.tables[table]=db.prepare(`SELECT * FROM ${table}`).all();
  data.tables.products=data.tables.products.map(normalizeProductBackupRow);
  data.meta={productCount:data.tables.products.length,orderCount:data.tables.orders.length,vendorCount:data.tables.vendors.length,driverCount:(data.tables.delivery_drivers||[]).length,deliveryCount:(data.tables.deliveries||[]).length,orderTotal:data.tables.orders.reduce((n,o)=>n+Number(o.total||0),0)};
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
        out.push({path:`uploads/${name}`,size:fs.statSync(full).size,content:fs.readFileSync(full).toString("base64")});
      }
    }catch{}
  }
  return out;
}
function normalizeProductBackupRow(row){
  const x={...row};
  let opts={};
  try{if(typeof x.options_json==='string')opts=JSON.parse(x.options_json||"{}");else if(x.options_json&&typeof x.options_json==='object')opts={...x.options_json}}catch{}
  // Preserve option data even if an older backup stored these fields separately.
  for(const k of ["option_colors","option_sizes","option_phone_type","option_phone_model","option_storage","option_other"]){if(x[k]&&!opts[k])opts[k]=String(x[k])}
  x.options_json=Object.keys(opts).length?JSON.stringify(opts):"{}";
  x.options=opts;
  return x;
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
    // Never overwrite a healthy non-empty backup with an empty shop after a restart.
    const currentBackup=fs.existsSync(BACKUP_PATH)?JSON.parse(fs.readFileSync(BACKUP_PATH,"utf8")):null;
    const currentProducts=Number(data.meta?.productCount||0), previousProducts=Number(currentBackup?.meta?.productCount||0);
    if(currentProducts===0 && previousProducts>0){
      console.warn("BASSE backup protection: refusing to replace a non-empty backup with an empty database.");
      return {ok:true,protected:true,createdAt:currentBackup.createdAt,meta:currentBackup.meta,cloudConfigured:false,cloudStatus:"disabled"};
    }
    const tmp=BACKUP_PATH+".tmp";
    fs.writeFileSync(tmp,JSON.stringify(data,null,2),"utf8");
    if(fs.existsSync(BACKUP_PATH)) fs.renameSync(BACKUP_PATH,PREV_BACKUP_PATH);
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
    let data=null;
    const candidates=[BACKUP_PATH,PREV_BACKUP_PATH];
    for(const candidate of candidates){
      try{
        if(!fs.existsSync(candidate))continue;
        const parsed=JSON.parse(fs.readFileSync(candidate,"utf8"));
        if(parsed?.tables?.products && Number(parsed?.meta?.productCount||parsed.tables.products.length)>0){data=parsed;break;}
      }catch{}
    }
    if(!data?.tables?.products)return false;
    const schemas={
      products:["id","name","category","price","stock","description","image","active","created_at","images","vendor_id","options_json"],
      orders:["id","product_id","product_name","quantity","customer_name","whatsapp","location","total","payment_status","order_status","waychit_request_id","created_at","vendor_id","commission","vendor_earnings","stock_reserved","stock_released","customer_lat","customer_lng","customer_accuracy"],
      vendors:["id","full_name","business_name","whatsapp","email","email_verified","verification_code","verification_expires","location","category","description","password_hash","status","created_at"],
      vendor_products:["id","product_id","vendor_id","status","created_at"],
      customer_accounts:["id","full_name","whatsapp","password_hash","status","created_at"],
      payout_requests:["id","vendor_id","amount","status","created_at"],
      vendor_submission_keys:["idempotency_key","vendor_id","product_id","created_at"],
      delivery_drivers:["id","full_name","whatsapp","pin_hash","status","created_at"],
      deliveries:["id","order_id","driver_id","status","lat","lng","accuracy","last_seen","started_at","arrived_at","delivered_at","created_at"]
    };
    const tx=db.transaction(()=>{
      db.pragma("foreign_keys = OFF");
      for(const table of BACKUP_TABLES)db.prepare(`DELETE FROM ${table}`).run();
      for(const table of BACKUP_TABLES){
        const cols=schemas[table], rows=Array.isArray(data.tables[table])?data.tables[table]:[];
        if(!rows.length)continue;
        const ins=db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(()=>"?").join(",")})`);
        for(const row of rows){const r=table==="products"?normalizeProductBackupRow(row):row;ins.run(...cols.map(k=>r[k]??null));}
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
try{db.exec("ALTER TABLE customer_accounts ADD COLUMN status TEXT DEFAULT 'ACTIVE'")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN vendor_id INTEGER DEFAULT NULL")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN commission INTEGER DEFAULT 0")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN vendor_earnings INTEGER DEFAULT 0")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN stock_reserved INTEGER DEFAULT 0")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN stock_released INTEGER DEFAULT 0")}catch(e){}
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
const lastLocationBroadcast=new Map();
// Anonymous marketplace presence. No name, phone, IP or account data is stored.
const liveViewers=new Map();
function viewerSource(req,body={}){
  const hinted=String(body.source||req.headers["x-basse-source"]||"").toLowerCase();
  if(hinted==="app"||hinted==="android-app")return "app";
  const ua=String(req.headers["user-agent"]||"").toLowerCase();
  if(ua.includes("wv")||ua.includes("; wv")||(ua.includes("version/4.0")&&ua.includes("android")))return "app";
  return "website";
}
app.post("/api/presence/heartbeat",(req,res)=>{
  const id=String(req.body?.id||"").trim();
  if(!id||id.length>80)return res.status(400).json({error:"Invalid viewer id"});
  liveViewers.set(id,{source:viewerSource(req,req.body),lastSeen:Date.now()});
  res.json({ok:true});
});
app.post("/api/presence/leave",(req,res)=>{
  const id=String(req.body?.id||"").trim();
  if(id)liveViewers.delete(id);
  res.json({ok:true});
});
function liveViewerStats(){
  const cutoff=Date.now()-60000;
  for(const [id,v] of liveViewers){if(!v||v.lastSeen<cutoff)liveViewers.delete(id)}
  let website=0,appViewers=0;
  for(const v of liveViewers.values()){if(v.source==="app")appViewers++;else website++}
  return {total:website+appViewers,website,app:appViewers,updatedAt:Date.now()};
}
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
function maskLoginIdentifier(value){
  const raw=String(value||'').trim();
  if(!raw)return 'Unknown';
  if(raw.includes('@')){const [u,d]=raw.split('@');return `${(u||'').slice(0,2)}***@${d||''}`;}
  const digits=raw.replace(/\D/g,'');
  if(digits.length>=4)return `+${digits.slice(0,3)}***${digits.slice(-2)}`;
  return raw.length>3?raw.slice(0,2)+'***':raw;
}
function recordLoginAttempt(portal,identifier,success,reason=''){
  try{db.prepare('INSERT INTO login_attempts(portal,identifier,success,reason) VALUES(?,?,?,?)').run(String(portal||'unknown'),maskLoginIdentifier(identifier),success?1:0,String(reason||'').slice(0,180));}catch(e){}
}
function guard(req,res,next){const s=getSession(req);if(!s||s.type!=="admin")return res.status(401).json({error:"Admin login required"});req.sessionToken=s.token;next()}
function vendorGuard(req,res,next){const s=getSession(req);if(!s||s.type!=="vendor")return res.status(401).json({error:"Vendor login required"});req.vendorId=s.vendor_id;req.sessionToken=s.token;next()}
function driverGuard(req,res,next){const s=getSession(req);if(!s||s.type!=="driver")return res.status(401).json({error:"Driver login required"});req.driverId=s.vendor_id;req.sessionToken=s.token;next()}
app.post("/api/auth/logout",(req,res)=>{const token=(req.headers.authorization||"").replace("Bearer ","").trim();if(token)db.prepare("DELETE FROM auth_sessions WHERE token=?").run(token);res.json({ok:true});});

app.get("/api/stores",(req,res)=>{
  const stores=db.prepare(`
    SELECT v.id,v.business_name,v.full_name,v.category,v.description,v.location,v.created_at,
           COUNT(p.id) AS product_count
    FROM vendors v
    LEFT JOIN products p ON p.vendor_id=v.id AND p.active=1
    WHERE v.status='APPROVED'
    GROUP BY v.id
    ORDER BY LOWER(v.business_name) ASC
  `).all();
  res.json(stores);
});
app.get("/api/stores/:id",(req,res)=>{
  const v=db.prepare("SELECT id,business_name,full_name,category,description,location,created_at FROM vendors WHERE id=? AND status='APPROVED'").get(req.params.id);
  if(!v)return res.status(404).json({error:"Store not found"});
  const products=db.prepare("SELECT * FROM products WHERE vendor_id=? AND active=1 ORDER BY id DESC").all(req.params.id);
  res.json({...v,products});
});

app.get("/api/products",(req,res)=>{
  const c=String(req.query.category||"All"),q=String(req.query.q||"").trim().toLowerCase();
  let p=db.prepare("SELECT id,name,category,price,stock,description,image,active,vendor_id,options_json FROM products WHERE active=1 ORDER BY id DESC").all();
  if(c!=="All")p=p.filter(x=>x.category===c);
  if(q)p=p.filter(x=>(x.name+" "+x.category+" "+(x.description||"")).toLowerCase().includes(q));
  res.set("Cache-Control",q?"private,max-age=5":"public,max-age=5,stale-while-revalidate=20");
  res.json(p);
});
app.get("/api/products/:id",(req,res)=>{let p=db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(req.params.id);p?res.json(p):res.status(404).json({error:"Product not found"})});
app.post("/api/admin/login",(req,res)=>{
  if(req.body.email===process.env.ADMIN_EMAIL&&req.body.password===process.env.ADMIN_PASSWORD){
    const t=crypto.randomBytes(32).toString("hex"),exp=Date.now()+30*24*60*60*1000;
    db.prepare("INSERT OR REPLACE INTO auth_sessions(token,type,vendor_id,expires_at) VALUES(?,?,NULL,?)").run(t,"admin",exp);
    recordLoginAttempt('Admin',req.body?.email,true,'Login successful');
    res.json({token:t,expiresAt:exp});
  }else { recordLoginAttempt('Admin',req.body?.email,false,'Invalid email or password'); res.status(401).json({error:"Invalid admin login"}) }
});
app.get("/api/admin/products",guard,(req,res)=>res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all()));
app.post("/api/admin/products",guard,upload.array("images",8),(req,res)=>{let b=req.body,files=req.files||[],fileImgs=files.map(f=>"/uploads/"+f.filename),img=fileImgs[0]||b.imageUrl||"",imgs=JSON.stringify(fileImgs.length?fileImgs:(b.images?String(b.images).split(",").map(x=>x.trim()).filter(Boolean):[]));
let x=db.prepare("INSERT INTO products(name,category,price,stock,description,image,images,vendor_id,options_json) VALUES(?,?,?,?,?,?,?,?,?)").run(b.name,b.category,+b.price,+b.stock||0,b.description||"",img,imgs,b.vendorId?+b.vendorId:null,productOptionsFromBody(b));let created=db.prepare("SELECT * FROM products WHERE id=?").get(x.lastInsertRowid);backupCatalog();broadcastLive("catalog",{productId:created.id});res.json(created)});
app.put("/api/admin/products/:id",guard,upload.array("images",8),(req,res)=>{let p=db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id);if(!p)return res.status(404).json({error:"Product not found"});let b=req.body,files=req.files||[],fileImgs=files.map(f=>"/uploads/"+f.filename),img=fileImgs[0]||b.imageUrl||p.image,oldImgs=p.images||"[]",imgs=fileImgs.length?JSON.stringify(fileImgs):(b.images?JSON.stringify(String(b.images).split(",").map(x=>x.trim()).filter(Boolean)):oldImgs);db.prepare("UPDATE products SET name=?,category=?,price=?,stock=?,description=?,image=?,images=?,vendor_id=?,options_json=? WHERE id=?").run(b.name,b.category,+b.price,+b.stock,b.description||"",img,imgs,b.vendorId?+b.vendorId:p.vendor_id||null,productOptionsFromBody(b,p.options_json)||"{}",p.id);let updated=db.prepare("SELECT * FROM products WHERE id=?").get(p.id);backupCatalog();broadcastLive("catalog",{productId:p.id});res.json(updated)});
app.delete("/api/admin/products/:id",guard,(req,res)=>{db.prepare("UPDATE products SET active=0 WHERE id=?").run(req.params.id);backupCatalog();broadcastLive("catalog",{productId:Number(req.params.id)});res.json({ok:true})});
app.get("/api/admin/orders",guard,(req,res)=>res.json(db.prepare(`SELECT o.*,v.business_name AS vendor_business_name,v.whatsapp AS vendor_whatsapp FROM orders o LEFT JOIN vendors v ON v.id=o.vendor_id ORDER BY datetime(o.created_at) DESC`).all()));
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
    const tables=["products","orders","vendors","vendor_products","customer_accounts","payout_requests","vendor_submission_keys","delivery_drivers","deliveries"];
    const tx=db.transaction(()=>{
      db.pragma("foreign_keys = OFF");
      for(const table of tables)db.prepare(`DELETE FROM ${table}`).run();
      const productCols=["id","name","category","price","stock","description","image","active","created_at","images","vendor_id","options_json"];
      const productIns=db.prepare(`INSERT INTO products (${productCols.join(",")}) VALUES (${productCols.map(()=>"?").join(",")})`);
      for(const x of (data.tables.products||[])){const r=normalizeProductBackupRow(x);productIns.run(...productCols.map(k=>r[k]??null));}
      const schemas={
        orders:["id","product_id","product_name","quantity","customer_name","whatsapp","location","total","payment_status","order_status","waychit_request_id","created_at","vendor_id","commission","vendor_earnings","stock_reserved","stock_released","customer_lat","customer_lng","customer_accuracy"],
        vendors:["id","full_name","business_name","whatsapp","email","email_verified","verification_code","verification_expires","location","category","description","password_hash","status","created_at"],
        vendor_products:["id","product_id","vendor_id","status","created_at"],
        customer_accounts:["id","full_name","whatsapp","password_hash","status","created_at"],
        payout_requests:["id","vendor_id","amount","status","created_at"],
        vendor_submission_keys:["idempotency_key","vendor_id","product_id","created_at"],
        delivery_drivers:["id","full_name","whatsapp","pin_hash","status","created_at"],
        deliveries:["id","order_id","driver_id","status","lat","lng","accuracy","last_seen","started_at","arrived_at","delivered_at","created_at"]
      };
      for(const table of Object.keys(schemas)){const cols=schemas[table],ins=db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(()=>"?").join(",")})`);for(const x of (data.tables[table]||[]))ins.run(...cols.map(k=>x[k]??null))}
    });
    tx();
    // Restore the database immediately. Uploaded images are copied in the background so the
    // admin does not sit waiting on a large base64 image payload after the catalog is already restored.
    const files=Array.isArray(data.files)?data.files:[];
    const productCount=(data.tables.products||[]).length, orderCount=(data.tables.orders||[]).length, vendorCount=(data.tables.vendors||[]).length, driverCount=(data.tables.delivery_drivers||[]).length, deliveryCount=(data.tables.deliveries||[]).length;
    res.json({ok:true,message:`Catalog restored immediately: ${productCount} products, ${orderCount} orders, ${vendorCount} vendors, ${driverCount} drivers and ${deliveryCount} deliveries. Product options were restored. Images are being restored in the background.`});
    setImmediate(()=>{
      try{
        const uploadDir=path.join(DATA_DIR,"uploads");fs.mkdirSync(uploadDir,{recursive:true});
        // Remove files that belong to the previous catalog only after the database is already restored.
        // This keeps the restore request fast while the image set is rebuilt in the background.
        for(const name of fs.readdirSync(uploadDir)){
          const full=path.join(uploadDir,name);try{if(fs.statSync(full).isFile())fs.unlinkSync(full)}catch{}
        }
        let restoredFiles=0;
        for(const file of files){
          if(!file?.path||!file.path.startsWith("uploads/")||file.path.includes(".."))continue;
          const rel=file.path.slice("uploads/".length);if(!rel||rel.includes("/")||rel.includes("\\"))continue;
          const dest=path.join(uploadDir,rel);
          try{
            const expected=Number(file.size||0), existing=fs.existsSync(dest)?fs.statSync(dest).size:-1;
            if(existing===expected && expected>=0)continue;
            fs.writeFileSync(dest,Buffer.from(file.content||"","base64"));restoredFiles++;
          }catch{}
        }
        backupShopData("restore-images-complete");
        broadcastLive("refresh",{});
        console.log(`BACKGROUND RESTORE completed: ${restoredFiles} image files processed.`);
      }catch(e){console.error("Background image restore failed:",e.message)}
    });
  }catch(e){console.error("Backup restore failed:",e);res.status(500).json({error:"Restore failed. The backup format may not match this shop version."})}
});
app.get("/api/admin/stats",guard,(req,res)=>res.json({products:db.prepare("SELECT COUNT(*) c FROM products WHERE active=1").get().c,orders:db.prepare("SELECT COUNT(*) c FROM orders").get().c,customers:db.prepare("SELECT COUNT(*) c FROM (SELECT whatsapp FROM customer_accounts UNION SELECT whatsapp FROM orders WHERE whatsapp IS NOT NULL AND whatsapp!='')").get().c,pending:db.prepare("SELECT COUNT(*) c FROM orders WHERE payment_status='PENDING'").get().c,paid:db.prepare("SELECT COUNT(*) c FROM orders WHERE payment_status='PAID'").get().c,cancelled:db.prepare("SELECT COUNT(*) c FROM orders WHERE payment_status='CANCELLED' OR order_status='CANCELLED'").get().c,refunded:db.prepare("SELECT COUNT(*) c FROM orders WHERE payment_status='REFUNDED'").get().c,sales:db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE payment_status='PAID' AND order_status!='CANCELLED' AND date(created_at)=date('now','localtime')").get().s,liveViewers:liveViewerStats()}));
app.get("/api/admin/live-viewers",guard,(req,res)=>res.json(liveViewerStats()));
app.get("/api/admin/login-attempts",guard,(req,res)=>{const rows=db.prepare("SELECT id,portal,identifier,success,reason,created_at FROM login_attempts ORDER BY id DESC LIMIT 30").all();res.json(rows)});
app.post("/api/customers/register",(req,res)=>{
 const name=String(req.body?.name||req.body?.fullName||"").trim();
 const phone=String(req.body?.whatsapp||req.body?.phone||"").replace(/\D/g,"").replace(/^220/,"");
 const password=String(req.body?.password||"");
 if(!name||phone.length<6)return res.status(400).json({error:"Enter your name and valid WhatsApp number."});
 if(password.length<4)return res.status(400).json({error:"Customer password must be at least 4 characters."});
 const fullPhone="220"+phone;
 const hash=crypto.createHash("sha256").update(password).digest("hex");
 const existing=db.prepare("SELECT id,full_name,whatsapp,password_hash,status FROM customer_accounts WHERE whatsapp=?").get(fullPhone);
 if(existing){
   if(existing.status==='BLOCKED')return res.status(403).json({error:"This customer account is blocked. Please contact BASSE Admin."});
   db.prepare("UPDATE customer_accounts SET full_name=?,password_hash=? WHERE id=?").run(name,hash,existing.id);
   backupShopData("customer-registered");
   return res.json({ok:true,id:existing.id,full_name:name,whatsapp:fullPhone,status:existing.status||'ACTIVE'});
 }
 const x=db.prepare("INSERT INTO customer_accounts(full_name,whatsapp,password_hash,status) VALUES(?,?,?,?)").run(name,fullPhone,hash,"ACTIVE"); backupShopData("customer-registered");
 res.status(201).json({ok:true,id:Number(x.lastInsertRowid),full_name:name,whatsapp:fullPhone,status:"ACTIVE"});
});
app.post("/api/customers/login",(req,res)=>{
 const phone=String(req.body?.whatsapp||req.body?.phone||"").replace(/\D/g,"").replace(/^220/,"");
 const password=String(req.body?.password||"");
 if(phone.length<6||password.length<4){recordLoginAttempt('Customer',req.body?.whatsapp||req.body?.phone,false,'Missing/invalid login details');return res.status(400).json({error:"Enter your WhatsApp number and password."});}
 const fullPhone="220"+phone;
 const c=db.prepare("SELECT id,full_name,whatsapp,password_hash,status FROM customer_accounts WHERE whatsapp=?").get(fullPhone);
 if(!c){recordLoginAttempt('Customer',fullPhone,false,'Account not found');return res.status(401).json({error:"Customer account not found. You can create one or continue as a guest."});}
 if(c.status==='BLOCKED'){recordLoginAttempt('Customer',fullPhone,false,'Account blocked');return res.status(403).json({error:"This customer account is blocked. Please contact BASSE Admin."});}
 const hash=crypto.createHash("sha256").update(password).digest("hex");
 if(!c.password_hash||hash!==String(c.password_hash)){recordLoginAttempt('Customer',fullPhone,false,'Incorrect password');return res.status(401).json({error:"Incorrect customer password."});}
 recordLoginAttempt('Customer',fullPhone,true,'Login successful');
 res.json({ok:true,id:c.id,full_name:c.full_name,whatsapp:c.whatsapp,status:c.status||"ACTIVE"});
});

app.post("/api/orders",async(req,res)=>{
  let p=db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(req.body.productId);
  let q=Math.max(1,+req.body.quantity||1);
  if(!p)return res.status(404).json({error:"Product unavailable"});
  if(q>p.stock)return res.status(400).json({error:`Only ${p.stock} item${p.stock===1?"":"s"} available.`});
  let rawPhone=String(req.body.whatsapp||"").replace(/\D/g,"").replace(/^220/,"");
  if(rawPhone.length<6)return res.status(400).json({error:"Enter a valid WhatsApp number"});
  let id="BOS-"+crypto.randomBytes(4).toString("hex").toUpperCase();
  let phone="220"+rawPhone,total=p.price*q;
  const customerAccount=db.prepare("SELECT status FROM customer_accounts WHERE whatsapp=?").get(phone);
  if(customerAccount?.status==='BLOCKED')return res.status(403).json({error:"This customer account is blocked. Please contact BASSE Admin."});
  let vendorId=p.vendor_id||null, commission=Math.round(total*0.10), vendorEarnings=total-commission;
  const chosenOptions=orderOptionsLabel(req.body.options);
  const orderProductName=chosenOptions?p.name+" ("+chosenOptions+")":p.name;
  const customerLat=Number.isFinite(Number(req.body.customerLat))?Number(req.body.customerLat):null;
  const customerLng=Number.isFinite(Number(req.body.customerLng))?Number(req.body.customerLng):null;
  const customerAccuracy=Number.isFinite(Number(req.body.customerAccuracy))?Number(req.body.customerAccuracy):null;
  const reserveTx=db.transaction(()=>{
    const changed=db.prepare("UPDATE products SET stock=stock-? WHERE id=? AND active=1 AND stock>=?").run(q,p.id,q);
    if(!changed.changes)throw new Error("Not enough stock");
    db.prepare("INSERT INTO orders(id,product_id,product_name,quantity,customer_name,whatsapp,location,total,vendor_id,commission,vendor_earnings,stock_reserved,stock_released,customer_lat,customer_lng,customer_accuracy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id,p.id,orderProductName,q,String(req.body.name||"").trim(),phone,String(req.body.location||""),total,vendorId,commission,vendorEarnings,q,0,customerLat,customerLng,customerAccuracy);
  });
  try{reserveTx()}catch(e){return res.status(400).json({error:"Not enough stock. Please refresh and try again."})}
  backupShopData("order-created");
  broadcastLive("catalog",{productId:p.id,stockChanged:true});
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
          description:orderProductName+" x "+q+" — BASSE ONLINE SHOP",
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

// Gambia geographic sanity bounds. These are intentionally generous enough to cover
// Banjul/Kombo, Basse, Bansang, Fatoto and the rest of The Gambia while rejecting
// obvious provider/network GPS errors such as a 2,000+ km jump into another country.
const GAMBIA_GPS={minLat:12.90,maxLat:13.90,minLng:-17.20,maxLng:-13.40};
function validGambiaGps(lat,lng){return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=GAMBIA_GPS.minLat&&lat<=GAMBIA_GPS.maxLat&&lng>=GAMBIA_GPS.minLng&&lng<=GAMBIA_GPS.maxLng;}
function gpsDistanceKm(a,b,c,d){const R=6371,rad=x=>x*Math.PI/180,p1=rad(a),p2=rad(c),dp=rad(c-a),dl=rad(d-b),h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
// Remove obviously stale coordinates left by older tracking versions. This does not
// touch written delivery addresses, products, vendors, orders or payments.
try{
  db.prepare(`UPDATE orders SET customer_lat=NULL,customer_lng=NULL,customer_accuracy=NULL WHERE (customer_lat IS NOT NULL OR customer_lng IS NOT NULL) AND (customer_lat<? OR customer_lat>? OR customer_lng<? OR customer_lng>?)`).run(GAMBIA_GPS.minLat,GAMBIA_GPS.maxLat,GAMBIA_GPS.minLng,GAMBIA_GPS.maxLng);
  const bad=db.prepare(`SELECT d.id,d.lat,d.lng,o.customer_lat,o.customer_lng FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE d.lat IS NOT NULL AND d.lng IS NOT NULL AND o.customer_lat IS NOT NULL AND o.customer_lng IS NOT NULL`).all();
  const clear=db.transaction(()=>{for(const x of bad){if(gpsDistanceKm(Number(x.lat),Number(x.lng),Number(x.customer_lat),Number(x.customer_lng))>500)db.prepare('UPDATE deliveries SET lat=NULL,lng=NULL,accuracy=NULL,last_seen=NULL WHERE id=?').run(x.id);}}); clear();
}catch(e){console.warn('GPS stale-coordinate cleanup skipped:',e.message)}

app.get("/api/order/:id/tracking",(req,res)=>{
  const rawId=String(req.params.id||"").trim().toUpperCase().replace(/\s+/g,"");
  const o=db.prepare("SELECT id,product_name,quantity,customer_name,whatsapp,location,total,payment_status,order_status,created_at,customer_lat,customer_lng,customer_accuracy FROM orders WHERE UPPER(REPLACE(id,' ',''))=?").get(rawId);
  if(!o)return res.status(404).json({error:"Order not found. Check the order number and try again."});
  const normalizePhone=(value)=>{let n=String(value||"").replace(/\D/g,"");if(n.startsWith("220"))n=n.slice(3);return n.slice(-9)};
  const suppliedPhone=normalizePhone(req.query.phone);
  const orderPhone=normalizePhone(o.whatsapp);
  if(suppliedPhone && suppliedPhone!==orderPhone)return res.status(403).json({error:"The WhatsApp number does not match this order."});
  if(req.query.phone && !suppliedPhone)return res.status(403).json({error:"Enter the WhatsApp number used for this order."});
  const d=db.prepare(`
    SELECT d.*,dr.full_name AS driver_name,dr.whatsapp AS driver_whatsapp
    FROM deliveries d LEFT JOIN delivery_drivers dr ON dr.id=d.driver_id
    WHERE UPPER(REPLACE(d.order_id,' ',''))=?
  `).get(rawId);
  res.set("Cache-Control","no-store");
  res.json({order:o,delivery:d||null,trackingActive:String(d?.status||o.order_status)!=="DELIVERED"});
});
app.post("/api/admin/orders/:id/payment",guard,(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});if(o.payment_status==='REFUNDED'||o.payment_status==='CANCELLED')return res.status(400).json({error:'This payment is already closed.'});db.prepare("UPDATE orders SET payment_status='PAID',order_status='PROCESSING' WHERE id=?").run(req.params.id);backupShopData("payment-confirmed");broadcastLive("orders",{orderId:req.params.id});res.json({ok:true})});
app.post("/api/admin/orders/:id/cancel-payment",guard,(req,res)=>{
  const o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if(!o)return res.status(404).json({error:"Order not found"});
  if(o.payment_status==='PAID')return res.status(400).json({error:"A paid order cannot be cancelled. Use Refund instead."});
  const tx=db.transaction(()=>{
    if(Number(o.stock_reserved)>0&&!Number(o.stock_released)){db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(o.stock_reserved,o.product_id);}
    db.prepare("UPDATE orders SET payment_status='CANCELLED',order_status='CANCELLED',stock_released=CASE WHEN stock_reserved>0 THEN 1 ELSE stock_released END WHERE id=?").run(req.params.id);
  });
  tx();backupShopData("payment-cancelled");broadcastLive("orders",{orderId:req.params.id});res.json({ok:true});
});
app.post("/api/admin/orders/:id/refund",guard,(req,res)=>{
  const o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if(!o)return res.status(404).json({error:"Order not found"});
  if(o.payment_status!=='PAID')return res.status(400).json({error:"Only paid orders can be marked refunded."});
  const tx=db.transaction(()=>{
    if(Number(o.stock_reserved)>0&&!Number(o.stock_released)){db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(o.stock_reserved,o.product_id);}
    db.prepare("UPDATE orders SET payment_status='REFUNDED',order_status='REFUNDED',stock_released=CASE WHEN stock_reserved>0 THEN 1 ELSE stock_released END WHERE id=?").run(req.params.id);
  });
  tx();backupShopData("refund");broadcastLive("orders",{orderId:req.params.id});res.json({ok:true,notice:"Order marked refunded. Stock was returned to the product. Complete the actual money reversal in Waychit if required."});
});
app.post("/api/admin/orders/:id/reopen",guard,(req,res)=>{
  const o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if(!o)return res.status(404).json({error:"Order not found"});
  try{
    const tx=db.transaction(()=>{
      if(Number(o.stock_reserved)>0&&Number(o.stock_released)){
        const changed=db.prepare("UPDATE products SET stock=stock-? WHERE id=? AND active=1 AND stock>=?").run(o.stock_reserved,o.product_id,o.stock_reserved);
        if(!changed.changes)throw new Error("Not enough stock to reopen this order.");
      }
      db.prepare("UPDATE orders SET payment_status='PENDING',order_status='NEW',stock_released=0 WHERE id=?").run(req.params.id);
    });
    tx();backupShopData("order-reopen");broadcastLive("orders",{orderId:req.params.id});res.json({ok:true});
  }catch(e){res.status(400).json({error:e.message||"Could not reopen order."})}
});
function ensureDeliveryForReadyOrder(orderId){
  const o=db.prepare("SELECT id,payment_status,order_status FROM orders WHERE id=?").get(orderId);
  if(!o || o.payment_status!=="PAID" || o.order_status!=="READY") return false;
  const r=db.prepare("INSERT OR IGNORE INTO deliveries(order_id,driver_id,status) VALUES(?,NULL,'ASSIGNED')").run(orderId);
  return !!r.changes;
}
app.patch("/api/admin/orders/:id/status",guard,(req,res)=>{
  let allowed=['NEW','PROCESSING','READY','DELIVERED','CANCELLED','REFUNDED'];
  let status=String(req.body.status||'').toUpperCase();
  if(!allowed.includes(status))return res.status(400).json({error:'Invalid order status'});
  const o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if(!o)return res.status(404).json({error:'Order not found'});
  if(status==='READY' && o.payment_status!=='PAID')return res.status(400).json({error:'Only PAID orders can be marked READY for delivery.'});
  const statusTx=db.transaction(()=>{
    if((status==='CANCELLED'||status==='REFUNDED')&&Number(o.stock_reserved)>0&&!Number(o.stock_released)){
      db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(o.stock_reserved,o.product_id);
      db.prepare("UPDATE orders SET order_status=?,stock_released=1 WHERE id=?").run(status,req.params.id);
    }else{db.prepare("UPDATE orders SET order_status=? WHERE id=?").run(status,req.params.id)}
    if(status==='READY')ensureDeliveryForReadyOrder(req.params.id);
  });
  statusTx();
  backupShopData("order-status");broadcastLive("orders",{orderId:req.params.id});res.json({ok:true,deliveryCreated:status==='READY'});
});
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


app.get("/api/admin/customers",guard,(req,res)=>{
 const accounts=db.prepare( `SELECT c.id,c.full_name,c.whatsapp,c.status,c.created_at,(SELECT COUNT(*) FROM orders o WHERE o.whatsapp=c.whatsapp) order_count,(SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.whatsapp=c.whatsapp AND o.payment_status='PAID') total_spent,(SELECT MAX(o.created_at) FROM orders o WHERE o.whatsapp=c.whatsapp) last_order FROM customer_accounts c ORDER BY datetime(c.created_at) DESC`).all();
 const known=new Set(accounts.map(x=>x.whatsapp));
 const guests=db.prepare(`SELECT whatsapp,MAX(customer_name) customer_name,COUNT(*) order_count,COALESCE(SUM(CASE WHEN payment_status='PAID' THEN total ELSE 0 END),0) total_spent,MAX(created_at) last_order FROM orders WHERE whatsapp IS NOT NULL AND whatsapp!='' GROUP BY whatsapp ORDER BY last_order DESC`).all();
 for(const g of guests)if(!known.has(g.whatsapp))accounts.push({id:null,full_name:g.customer_name||'Guest customer',whatsapp:g.whatsapp,status:'GUEST',created_at:null,order_count:g.order_count,total_spent:g.total_spent,last_order:g.last_order});
 res.json(accounts);
});
app.patch("/api/admin/customers/:id/status",guard,(req,res)=>{const status=String(req.body?.status||'').toUpperCase();if(!['ACTIVE','BLOCKED'].includes(status))return res.status(400).json({error:'Invalid customer status'});const r=db.prepare("UPDATE customer_accounts SET status=? WHERE id=?").run(status,req.params.id);if(!r.changes)return res.status(404).json({error:'Customer account not found'});backupShopData("customer-status");res.json({ok:true,status});});
app.delete("/api/admin/customers/:id",guard,(req,res)=>{const r=db.prepare("DELETE FROM customer_accounts WHERE id=?").run(req.params.id);if(!r.changes)return res.status(404).json({error:'Customer account not found'});backupShopData("customer-deleted");res.json({ok:true});});


app.post("/api/driver/login",(req,res)=>{
  const phone=String(req.body.whatsapp||"").replace(/\D/g,"").replace(/^220/,"");
  const pin=String(req.body.pin||"");
  const d= db.prepare("SELECT * FROM delivery_drivers WHERE whatsapp=? AND status='ACTIVE'").get("220"+phone);
  if(!d){recordLoginAttempt('Driver',"220"+phone,false,'Account not found or blocked');return res.status(401).json({error:"Driver account not found or blocked."});}
  const hash=crypto.createHash("sha256").update(pin).digest("hex");
  if(hash!==d.pin_hash){recordLoginAttempt('Driver',d.whatsapp,false,'Incorrect PIN');return res.status(401).json({error:"Incorrect PIN."});}
  const t=crypto.randomBytes(32).toString("hex"),exp=Date.now()+30*24*60*60*1000;
  db.prepare("INSERT OR REPLACE INTO auth_sessions(token,type,vendor_id,expires_at) VALUES(?,?,?,?)").run(t,"driver",d.id,exp);
  recordLoginAttempt('Driver',d.whatsapp,true,'Login successful');
  res.json({token:t,expiresAt:exp,driver:{id:d.id,full_name:d.full_name,whatsapp:d.whatsapp}});
});
app.get("/api/driver/me",driverGuard,(req,res)=>{
  const d=db.prepare("SELECT id,full_name,whatsapp,status FROM delivery_drivers WHERE id=?").get(req.driverId);res.json(d);
});
app.get("/api/driver/deliveries",driverGuard,(req,res)=>{
  res.json(db.prepare(`
    SELECT d.*,o.product_name,o.quantity,o.customer_name,o.whatsapp,o.location,o.total,o.payment_status,o.order_status,o.customer_lat,o.customer_lng,o.customer_accuracy,
           v.business_name
    FROM deliveries d JOIN orders o ON o.id=d.order_id
    LEFT JOIN vendors v ON v.id=o.vendor_id
    WHERE d.driver_id=? ORDER BY datetime(d.created_at) DESC
  `).all(req.driverId));
});
app.patch("/api/driver/deliveries/:id/status",driverGuard,(req,res)=>{
  const status=String(req.body.status||"").toUpperCase();
  if(!["ASSIGNED","ACCEPTED","PICKED_UP","ON_THE_WAY","ARRIVED","DELIVERED"].includes(status))return res.status(400).json({error:"Invalid delivery status"});
  const d=db.prepare("SELECT * FROM deliveries WHERE id=? AND driver_id=?").get(req.params.id,req.driverId);
  if(!d)return res.status(404).json({error:"Delivery not assigned to you."});
  const now=new Date().toISOString();
  db.prepare("UPDATE deliveries SET status=?,started_at=CASE WHEN ?='ON_THE_WAY' AND started_at IS NULL THEN ? ELSE started_at END,arrived_at=CASE WHEN ?='ARRIVED' THEN ? ELSE arrived_at END,delivered_at=CASE WHEN ?='DELIVERED' THEN ? ELSE delivered_at END WHERE id=?")
    .run(status,status,now,status,now,status,now,d.id);
  db.prepare("UPDATE orders SET order_status=? WHERE id=?").run(status==="DELIVERED"?"DELIVERED":status==="PICKED_UP"||status==="ON_THE_WAY"||status==="ARRIVED"?"PROCESSING":"READY",d.order_id);
  backupShopData("driver-delivery-status");broadcastLive("orders",{orderId:d.order_id});res.json({ok:true});
});
app.post("/api/order/:id/customer-location",(req,res)=>{
  const rawId=String(req.params.id||"").trim().toUpperCase().replace(/\s+/g,"");
  const o=db.prepare("SELECT id,whatsapp,order_status FROM orders WHERE UPPER(REPLACE(id,' ',''))=?").get(rawId);
  if(!o)return res.status(404).json({error:"Order not found."});
  if(String(o.order_status||"").toUpperCase()==="DELIVERED")return res.status(409).json({error:"This order has already been delivered."});
  const normalizePhone=(value)=>{let n=String(value||"").replace(/\D/g,"");if(n.startsWith("220"))n=n.slice(3);return n.slice(-9)};
  if(normalizePhone(req.body.phone)!==normalizePhone(o.whatsapp))return res.status(403).json({error:"The WhatsApp number does not match this order."});
  const lat=Number(req.body.lat),lng=Number(req.body.lng),accuracy=Number(req.body.accuracy||0);
  if(!validGambiaGps(lat,lng))return res.status(422).json({error:"GPS location appears to be outside The Gambia. Enable Precise Location and try again."});
  if(accuracy>1500)return res.status(422).json({error:`GPS accuracy is too low (±${Math.round(accuracy)}m). Turn on Precise Location, move outdoors for a few seconds, and try again.`});
  db.prepare("UPDATE orders SET customer_lat=?,customer_lng=?,customer_accuracy=? WHERE id=?").run(lat,lng,accuracy,o.id);
  backupShopData("customer-gps-updated");
  broadcastLive("orders",{orderId:o.id,customerLocation:true});
  res.json({ok:true,customerLat:lat,customerLng:lng,accuracy});
});

app.post("/api/driver/deliveries/:id/location",driverGuard,(req,res)=>{
  const d=db.prepare("SELECT * FROM deliveries WHERE id=? AND driver_id=?").get(req.params.id,req.driverId);
  if(!d)return res.status(404).json({error:"Delivery not assigned to you."});
  const lat=Number(req.body.lat),lng=Number(req.body.lng),accuracy=Number(req.body.accuracy||0);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180)return res.status(400).json({error:"Invalid GPS coordinates."});
  if(!validGambiaGps(lat,lng))return res.status(422).json({error:"GPS location appears to be outside The Gambia. Enable Precise Location and try again."});
  if(accuracy>1500)return res.status(422).json({error:`GPS accuracy is too low (±${Math.round(accuracy)}m). Turn on Precise Location and try again.`});
  db.prepare("UPDATE deliveries SET lat=?,lng=?,accuracy=?,last_seen=? WHERE id=?").run(lat,lng,accuracy,new Date().toISOString(),d.id);
  const now=Date.now(), last=lastLocationBroadcast.get(String(d.order_id))||0;
  if(now-last>=2000){lastLocationBroadcast.set(String(d.order_id),now);broadcastLive("orders",{orderId:d.order_id,location:true});}
  res.json({ok:true});
});
app.post("/api/vendor/login",(req,res)=>{
 const phone=String(req.body.whatsapp||req.body.phone||"").replace(/\D/g,"").replace(/^220/,""),pin=String(req.body.pin||req.body.password||"");
 if(phone.length<6||!/^\d{4,5}$/.test(pin)){recordLoginAttempt('Vendor',req.body?.whatsapp||req.body?.phone,false,'Missing/invalid login details');return res.status(400).json({error:"Enter your phone number and 4 or 5 digit PIN."});}
 const v=db.prepare("SELECT * FROM vendors WHERE whatsapp=? AND status='APPROVED'").get("220"+phone);
 const ok=v && v.password_hash && crypto.createHash("sha256").update(pin).digest("hex")===String(v.password_hash);
 if(!ok){recordLoginAttempt('Vendor',"220"+phone,false,'Invalid phone/PIN or not approved');return res.status(401).json({error:"Invalid vendor phone/PIN, or the vendor has not been approved yet."});}
 const t=crypto.randomBytes(32).toString("hex"),exp=Date.now()+30*24*60*60*1000;
 db.prepare("INSERT OR REPLACE INTO auth_sessions(token,type,vendor_id,expires_at) VALUES(?,?,?,?)").run(t,"vendor",v.id,exp);
 recordLoginAttempt('Vendor',v.whatsapp,true,'Login successful');
 res.json({token:t,expiresAt:exp,vendor:{id:v.id,business_name:v.business_name,full_name:v.full_name,email:v.email||""}});
});
app.get("/api/vendor/me",vendorGuard,(req,res)=>{let v=db.prepare("SELECT id,full_name,business_name,whatsapp,location,category,status FROM vendors WHERE id=?").get(req.vendorId);res.json(v)});
app.get("/api/vendor/orders",vendorGuard,(req,res)=>res.json(db.prepare("SELECT * FROM orders WHERE vendor_id=? ORDER BY datetime(created_at) DESC").all(req.vendorId)));
app.get("/api/vendor/transactions",vendorGuard,(req,res)=>res.json(db.prepare("SELECT id,product_name,quantity,total,commission,vendor_earnings,payment_status,order_status,created_at FROM orders WHERE vendor_id=? ORDER BY datetime(created_at) DESC").all(req.vendorId)));
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
   let x=db.prepare("INSERT INTO products(name,category,price,stock,description,image,images,active,vendor_id,options_json) VALUES(?,?,?,?,?,?,?,?,?,?)").run(String(b.name).trim(),b.category,+b.price,+b.stock||0,b.description||"",img,JSON.stringify(imgs),0,req.vendorId,productOptionsFromBody(b));
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


try{db.prepare("ALTER TABLE products ADD COLUMN options_json TEXT DEFAULT '{}'").run()}catch{}
function productOptionsFromBody(b,existing=""){const o={};if(existing){try{const x=typeof existing==='string'?JSON.parse(existing):existing;Object.assign(o,x||{})}catch{}}[['option_colors','Colors'],['option_sizes','Sizes'],['option_phone_type','Phone Type / Brand'],['option_phone_model','Phone Model'],['option_storage','Storage / Variant'],['option_other','Other Options']].forEach(([k])=>{if(b&&Object.prototype.hasOwnProperty.call(b,k)){const v=String(b[k]||'').trim();if(v)o[k]=v;else delete o[k]}});if(b?.options_json){try{const x=typeof b.options_json==='string'?JSON.parse(b.options_json):b.options_json;Object.assign(o,x||{})}catch{}}return Object.keys(o).length?JSON.stringify(o):''}
function orderOptionsLabel(options){if(!Array.isArray(options))return '';return options.map(x=>String(x||'').trim()).filter(Boolean).join(' · ')}
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

app.get("/api/admin/drivers",guard,(req,res)=>{
  res.json(db.prepare("SELECT id,full_name,whatsapp,status,created_at FROM delivery_drivers ORDER BY id DESC").all());
});
app.post("/api/admin/drivers",guard,(req,res)=>{
  const name=String(req.body.full_name||"").trim(), phone=String(req.body.whatsapp||"").replace(/\D/g,""), pin=String(req.body.pin||"").trim();
  if(name.length<2||phone.length<6||!/^\d{4,6}$/.test(pin))return res.status(400).json({error:"Enter driver name, valid WhatsApp number and 4–6 digit PIN."});
  const hash=crypto.createHash("sha256").update(pin).digest("hex");
  try{
    const r=db.prepare("INSERT INTO delivery_drivers(full_name,whatsapp,pin_hash) VALUES(?,?,?)").run(name,"220"+phone.replace(/^220/,""),hash);
    backupShopData("driver-created");res.json({id:r.lastInsertRowid,full_name:name,whatsapp:"220"+phone.replace(/^220/,""),status:"ACTIVE"});
  }catch(e){res.status(400).json({error:"A driver with that WhatsApp number already exists."})}
});
app.patch("/api/admin/drivers/:id/status",guard,(req,res)=>{
  const status=String(req.body.status||"").toUpperCase();
  if(!["ACTIVE","BLOCKED"].includes(status))return res.status(400).json({error:"Invalid driver status"});
  db.prepare("UPDATE delivery_drivers SET status=? WHERE id=?").run(status,req.params.id);
  backupShopData("driver-status");res.json({ok:true});
});
app.get("/api/admin/deliveries",guard,(req,res)=>{
  // Self-heal READY paid orders created before the delivery workflow was enabled.
  const readyOrders=db.prepare("SELECT id FROM orders WHERE payment_status='PAID' AND order_status='READY'").all();
  const tx=db.transaction(rows=>{for(const row of rows)ensureDeliveryForReadyOrder(row.id)}); tx(readyOrders);
  res.json(db.prepare(`
    SELECT d.*,o.product_name,o.quantity,o.customer_name,o.whatsapp,o.location,o.total,o.payment_status,o.order_status,o.customer_lat,o.customer_lng,o.customer_accuracy,
           v.business_name,dr.full_name AS driver_name,dr.whatsapp AS driver_whatsapp
    FROM deliveries d
    JOIN orders o ON o.id=d.order_id
    LEFT JOIN vendors v ON v.id=o.vendor_id
    LEFT JOIN delivery_drivers dr ON dr.id=d.driver_id
    ORDER BY CASE WHEN d.status IN ('DELIVERED') THEN 1 ELSE 0 END, datetime(d.created_at) DESC
  `).all());
});
app.post("/api/admin/orders/:id/assign-driver",guard,(req,res)=>{
  const o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  const dr=db.prepare("SELECT id,full_name FROM delivery_drivers WHERE id=? AND status='ACTIVE'").get(req.body.driverId);
  if(!o)return res.status(404).json({error:"Order not found"});
  if(o.payment_status!=="PAID")return res.status(400).json({error:"Only PAID orders can be assigned for delivery."});
  if(!dr)return res.status(400).json({error:"Active driver not found"});
  db.prepare(`
    INSERT INTO deliveries(order_id,driver_id,status)
    VALUES(?,?, 'ASSIGNED')
    ON CONFLICT(order_id) DO UPDATE SET driver_id=excluded.driver_id,status='ASSIGNED',last_seen=NULL,started_at=NULL,arrived_at=NULL,delivered_at=NULL
  `).run(req.params.id,dr.id);
  db.prepare("UPDATE orders SET order_status='READY' WHERE id=?").run(req.params.id);
  backupShopData("driver-assigned");broadcastLive("orders",{orderId:req.params.id});res.json({ok:true,driver:dr});
});
app.patch("/api/admin/deliveries/:id/status",guard,(req,res)=>{
  const status=String(req.body.status||"").toUpperCase();
  if(!["ASSIGNED","ACCEPTED","PICKED_UP","ON_THE_WAY","ARRIVED","DELIVERED"].includes(status))return res.status(400).json({error:"Invalid delivery status"});
  const d=db.prepare("SELECT * FROM deliveries WHERE id=?").get(req.params.id);if(!d)return res.status(404).json({error:"Delivery not found"});
  const now=new Date().toISOString();
  db.prepare("UPDATE deliveries SET status=?,started_at=CASE WHEN ?='ON_THE_WAY' AND started_at IS NULL THEN ? ELSE started_at END,arrived_at=CASE WHEN ?='ARRIVED' THEN ? ELSE arrived_at END,delivered_at=CASE WHEN ?='DELIVERED' THEN ? ELSE delivered_at END WHERE id=?")
    .run(status,status,now,status,now,status,now,d.id);
  db.prepare("UPDATE orders SET order_status=? WHERE id=?").run(status==="DELIVERED"?"DELIVERED":status==="PICKED_UP"||status==="ON_THE_WAY"||status==="ARRIVED"?"PROCESSING":"READY",d.order_id);
  backupShopData("delivery-status");broadcastLive("orders",{orderId:d.order_id});res.json({ok:true});
});
app.get("/api/admin/vendor-stats",guard,(req,res)=>res.json({vendors:db.prepare("SELECT COUNT(*) c FROM vendors").get().c,pending:db.prepare("SELECT COUNT(*) c FROM vendors WHERE status='PENDING'").get().c,active:db.prepare("SELECT COUNT(*) c FROM vendors WHERE status='APPROVED'").get().c,commission:db.prepare("SELECT COALESCE(SUM(commission),0) s FROM orders WHERE payment_status='PAID'").get().s}));

setInterval(()=>{try{db.prepare("DELETE FROM auth_sessions WHERE expires_at<=?").run(Date.now())}catch{}},60*60*1000);
app.listen(PORT,"0.0.0.0",()=>console.log("BASSE ONLINE SHOP running on "+PORT));