const express=require("express"),Database=require("better-sqlite3"),multer=require("multer"),compression=require("compression"),path=require("path"),crypto=require("crypto"),fs=require("fs");
const QRCode=require("qrcode");
const app=express(),PORT=process.env.PORT||3000,ROOT=__dirname,DATA_DIR=process.env.DATA_DIR||path.join(ROOT,"data");
app.use(compression({threshold:1024}));
const PUBLIC_BASE_URL=(process.env.PUBLIC_BASE_URL||"https://basseonlineshop.com").replace(/\/$/,"");
const STATIC_WAYCHIT_URL=process.env.WAYCHIT_STATIC_URL||"https://app.waychit.com/pm/?param1=%7B%22type%22%3A%22staticPaymentRequest%22%2C%22merchantAccountId%22%3A%226a8b03204ad0d928fc3a529c%22%7D";
const SHOP_WHATSAPP=String(process.env.BASSE_MARKET_WHATSAPP||"2206963349").replace(/\D/g,"");fs.mkdirSync(DATA_DIR,{recursive:true});fs.mkdirSync(path.join(DATA_DIR,"uploads"),{recursive:true});
app.use(express.json({limit:"100mb",verify:(req,res,buf)=>{if(req.originalUrl==="/api/waychit/webhook")req.rawBody=buf.toString("utf8")}}));
app.use("/uploads",express.static(path.join(DATA_DIR,"uploads"),{maxAge:"7d",immutable:false}));
app.use("/downloads",express.static(path.join(ROOT,"../downloads"),{fallthrough:true,maxAge:"1d"}));
app.get("/scanner",(req,res)=>res.sendFile(path.join(ROOT,"../marketplace/scanner.html")));
app.get("/download",(req,res)=>{
  res.sendFile(path.join(ROOT,"../marketplace/download.html"));
});
// Waychit return endpoint: Waychit redirects the customer's browser here after hosted payment.
// Serve the marketplace shell so marketplace/app.js can read ?payment=success&order=...
// and poll the server until the signed webhook marks the order PAID.
app.get("/payment-return",(req,res)=>{
  res.sendFile(path.join(ROOT,"../marketplace/index.html"));
});
// SEO: public marketplace pages, sitemap and robots are served explicitly so they
// are never swallowed by the static SPA fallback. Product/store pages contain real
// server-rendered text so Google can discover and understand the marketplace even
// though the shopping UI itself is JavaScript-driven.
function xmlEscape(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&apos;")}
function slugPart(v){return encodeURIComponent(String(v||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""))}
function seoPage({title,description,canonical,heading,bodyHtml}){
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${xmlEscape(title)}</title><meta name="description" content="${xmlEscape(description)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${xmlEscape(canonical)}"><meta property="og:type" content="website"><meta property="og:title" content="${xmlEscape(title)}"><meta property="og:description" content="${xmlEscape(description)}"><meta property="og:url" content="${xmlEscape(canonical)}"><meta name="theme-color" content="#071a4a"><style>body{margin:0;background:#f6f8fc;color:#101827;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}.wrap{max-width:900px;margin:0 auto;padding:28px 18px 80px}.brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none;color:#071a4a;font-weight:950}.brand img{width:48px;height:48px;border-radius:14px;object-fit:cover}.card{margin-top:24px;background:#fff;border:1px solid #e4e9f1;border-radius:24px;padding:28px;box-shadow:0 12px 40px #071a4a12}h1{font-size:32px;margin:0 0 12px;color:#071a4a}h2{color:#071a4a}p{line-height:1.6;color:#5e6878}.price{font-size:26px;font-weight:950;color:#1748a8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.item{display:block;padding:16px;border:1px solid #e5e9f0;border-radius:16px;text-decoration:none;color:inherit}.item b{display:block;margin-bottom:6px}.back{display:inline-block;margin-top:20px;padding:12px 16px;border-radius:12px;background:#071a4a;color:#fff;text-decoration:none;font-weight:850}@media(max-width:520px){h1{font-size:26px}.card{padding:20px}}</style></head><body><main class="wrap"><a class="brand" href="/"><img src="/basse-marketplace-logo.jpg" alt="BASSE ONLINE SHOP"><span>BASSE ONLINE SHOP</span></a><section class="card"><h1>${heading}</h1>${bodyHtml}<a class="back" href="/">← Shop BASSE ONLINE SHOP</a></section></main></body></html>`
}
app.get("/product/:id",(req,res)=>{
  const p=db.prepare("SELECT id,name,category,price,stock,description,image,vendor_id FROM products WHERE id=? AND active=1").get(req.params.id);
  if(!p)return res.status(404).send("<!doctype html><title>Product not found | BASSE ONLINE SHOP</title><h1>Product not found</h1><p><a href="/">Return to BASSE ONLINE SHOP</a></p>");
  const canonical=`${PUBLIC_BASE_URL}/product/${p.id}`;
  const desc=String(p.description||`Shop ${p.name} in ${p.category||"the marketplace"} on BASSE ONLINE SHOP in The Gambia.`).slice(0,155);
  const image=p.image?`<img src="${xmlEscape(p.image)}" alt="${xmlEscape(p.name)}" style="width:100%;max-height:420px;object-fit:contain;border-radius:18px;background:#f4f6fa;margin:10px 0 18px">`:"";
  const body=`${image}<p><strong>Category:</strong> ${xmlEscape(p.category||"General")}</p><p>${xmlEscape(p.description||`Shop ${p.name} online through BASSE ONLINE SHOP, a marketplace serving Basse and surrounding areas in The Gambia.`)}</p><div class="price">D${Number(p.price||0).toLocaleString()}</div><p>${Number(p.stock||0)>0?"Available to order online.":"Currently out of stock."}</p>`;
  res.status(200).set("Cache-Control","public, max-age=300").send(seoPage({title:`${p.name} | BASSE ONLINE SHOP`,description:desc,canonical,heading:xmlEscape(p.name),bodyHtml:body}));
});
app.get("/store/:id",(req,res)=>{
  const v=db.prepare("SELECT id,business_name,full_name,category,description,location,logo_url FROM vendors WHERE id=? AND status='APPROVED'").get(req.params.id);
  if(!v)return res.status(404).send("<!doctype html><title>Store not found | BASSE ONLINE SHOP</title><h1>Store not found</h1><p><a href="/">Return to BASSE ONLINE SHOP</a></p>");
  const products=db.prepare("SELECT id,name,category,price,description,image FROM products WHERE vendor_id=? AND active=1 ORDER BY id DESC").all(v.id);
  const canonical=`${PUBLIC_BASE_URL}/store/${v.id}`;
  const title=`${v.business_name} | BASSE ONLINE SHOP`;
  const description=String(v.description||`Shop products from ${v.business_name} on BASSE ONLINE SHOP in ${v.location||"The Gambia"}.`).slice(0,155);
  const cards=products.map(x=>`<a class="item" href="/product/${x.id}"><b>${xmlEscape(x.name)}</b><span>${xmlEscape(x.category||"")}</span><div class="price" style="font-size:19px;margin-top:8px">D${Number(x.price||0).toLocaleString()}</div></a>`).join("");
  const logo=v.logo_url?`<p><img src="${xmlEscape(v.logo_url)}" alt="${xmlEscape(v.business_name)} logo" style="width:100px;height:100px;object-fit:contain;background:#fff;border:1px solid #e5e9f0;border-radius:18px;padding:8px"></p>`:"";
  const body=`${logo}<p><strong>Store:</strong> ${xmlEscape(v.business_name)}</p><p><strong>Category:</strong> ${xmlEscape(v.category||"Marketplace seller")}</p><p><strong>Location:</strong> ${xmlEscape(v.location||"The Gambia")}</p><p>${xmlEscape(v.description||`Shop ${v.business_name} products through BASSE ONLINE SHOP.`)}</p><h2>Products from this store</h2><div class="grid">${cards||"<p>No products are currently listed.</p>"}</div>`;
  res.status(200).set("Cache-Control","public, max-age=300").send(seoPage({title,description,canonical,heading:xmlEscape(v.business_name),bodyHtml:body}));
});
app.get("/sitemap.xml",(req,res)=>{
  const products=db.prepare("SELECT id,created_at FROM products WHERE active=1 ORDER BY id DESC").all();
  const stores=db.prepare("SELECT id,created_at FROM vendors WHERE status='APPROVED' ORDER BY id DESC").all();
  const urls=[
    `<url><loc>${xmlEscape(PUBLIC_BASE_URL)}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${xmlEscape(PUBLIC_BASE_URL)}/download</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`,
    ...stores.map(x=>`<url><loc>${xmlEscape(PUBLIC_BASE_URL)}/store/${x.id}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`),
    ...products.map(x=>`<url><loc>${xmlEscape(PUBLIC_BASE_URL)}/product/${x.id}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`)
  ];
  res.status(200).set("Content-Type","application/xml; charset=utf-8").set("Cache-Control","public, max-age=3600").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`);
});
app.get("/robots.txt",(req,res)=>{res.type("text/plain");res.sendFile(path.join(ROOT,"../marketplace/robots.txt"));});
app.get("/api/health",(req,res)=>{
  const productCount=Number(db.prepare("SELECT COUNT(*) c FROM products").get().c);
  res.json({ok:true,productCount,dataDir:DATA_DIR,persistentDataDir:DATA_DIR});
});
app.use("/admin",express.static(path.join(ROOT,"../admin"),{maxAge:0}));app.use("/vendor",express.static(path.join(ROOT,"../vendor"),{maxAge:0}));app.use("/driver",express.static(path.join(ROOT,"../driver"),{maxAge:0}));
app.use("/",express.static(path.join(ROOT,"../marketplace"),{maxAge:0}));
const DB_PATH=path.join(DATA_DIR,"basse-shop.db"),BACKUP_PATH=path.join(DATA_DIR,"catalog-backup.json"),PREV_BACKUP_PATH=path.join(DATA_DIR,"catalog-backup.previous.json");
const db=new Database(DB_PATH);db.pragma("journal_mode=WAL");db.pragma("synchronous=FULL");db.pragma("busy_timeout=5000");
db.exec(`CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,category TEXT,price INTEGER,stock INTEGER,description TEXT,image TEXT,active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP,options_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,product_id INTEGER,product_name TEXT,quantity INTEGER,customer_name TEXT,whatsapp TEXT,location TEXT,total INTEGER,payment_status TEXT DEFAULT 'PENDING',order_status TEXT DEFAULT 'NEW',waychit_request_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,vendor_id INTEGER DEFAULT NULL,commission INTEGER DEFAULT 0,vendor_earnings INTEGER DEFAULT 0,stock_reserved INTEGER DEFAULT 0,stock_released INTEGER DEFAULT 0,payment_group_id TEXT DEFAULT NULL);
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

try{db.exec(`CREATE TABLE IF NOT EXISTS digital_services(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '', plan_name TEXT NOT NULL, duration TEXT DEFAULT '', price INTEGER NOT NULL DEFAULT 0, supplier_cost INTEGER NOT NULL DEFAULT 0, active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS digital_orders(id TEXT PRIMARY KEY, service_id INTEGER, service_name TEXT NOT NULL, plan_name TEXT NOT NULL, duration TEXT DEFAULT '', customer_name TEXT NOT NULL, customer_whatsapp TEXT NOT NULL, customer_email TEXT DEFAULT '', customer_account_email TEXT DEFAULT '', total INTEGER NOT NULL DEFAULT 0, supplier_cost INTEGER NOT NULL DEFAULT 0, payment_status TEXT DEFAULT 'PENDING', order_status TEXT DEFAULT 'NEW', fulfillment_notes TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);`)}catch(e){console.error('Digital services schema:',e.message)}
try{db.prepare("ALTER TABLE vendors ADD COLUMN logo_url TEXT DEFAULT ''").run()}catch{}
db.exec(`CREATE TABLE IF NOT EXISTS chat_conversations(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 customer_id INTEGER,
 customer_name TEXT NOT NULL,
 customer_whatsapp TEXT DEFAULT '',
 vendor_id INTEGER,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_customer_admin ON chat_conversations(customer_whatsapp) WHERE vendor_id IS NULL AND customer_whatsapp<>'';
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_customer_vendor ON chat_conversations(customer_whatsapp,vendor_id) WHERE vendor_id IS NOT NULL AND customer_whatsapp<>'';
CREATE TABLE IF NOT EXISTS chat_messages(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 conversation_id INTEGER NOT NULL,
 sender_type TEXT NOT NULL,
 sender_id INTEGER,
 sender_name TEXT DEFAULT '',
 message TEXT NOT NULL,
 product_id INTEGER,
 read_at TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id,id);
CREATE TABLE IF NOT EXISTS order_notifications(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 recipient_type TEXT NOT NULL,
 recipient_phone TEXT DEFAULT '',
 order_id TEXT,
 title TEXT NOT NULL,
 message TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_notifications_recipient ON order_notifications(recipient_type,recipient_phone,read_at,id);
`);
// BulkGate SMS delivery log prevents duplicate transactional messages on webhook retries.
try{db.exec(`CREATE TABLE IF NOT EXISTS sms_send_log(
 event_key TEXT PRIMARY KEY, order_id TEXT, recipient TEXT, message_type TEXT, status TEXT NOT NULL DEFAULT 'PENDING', provider_sms_id TEXT, error_code TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, sent_at TEXT
); CREATE INDEX IF NOT EXISTS idx_sms_send_log_created ON sms_send_log(created_at,status);`)}catch(e){console.error("SMS log setup failed:",e.message)}
// Short-lived customer registration OTPs. Store only a hash of the code.
try{db.exec(`CREATE TABLE IF NOT EXISTS customer_registration_otps(
 whatsapp TEXT PRIMARY KEY, full_name TEXT NOT NULL, password_hash TEXT NOT NULL,
 otp_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 last_sent_at INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`)}catch(e){console.error("Customer OTP table setup failed:",e.message)}
try{db.exec(`CREATE TABLE IF NOT EXISTS vendor_application_otps(
 whatsapp TEXT PRIMARY KEY, payload_json TEXT NOT NULL, otp_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 last_sent_at INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`)}catch(e){console.error("Vendor OTP table setup failed:",e.message)}

function cleanupExpiredChatMessages(){
  try{
    db.prepare("DELETE FROM chat_messages WHERE datetime(created_at) < datetime('now','-72 hours')").run();
    db.prepare("DELETE FROM chat_conversations WHERE datetime(updated_at) < datetime('now','-72 hours') AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id=chat_conversations.id)").run();
  }catch(e){console.error('Chat cleanup failed:',e.message)}
}
cleanupExpiredChatMessages();
setInterval(cleanupExpiredChatMessages,60*60*1000);
try{db.exec(`CREATE TABLE IF NOT EXISTS login_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,portal TEXT NOT NULL,identifier TEXT NOT NULL,success INTEGER DEFAULT 0,reason TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP); CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);`)}catch(e){console.error('Login log setup failed:',e.message)}
try{db.exec("ALTER TABLE products ADD COLUMN images TEXT DEFAULT ''")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN customer_lat REAL")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN customer_lng REAL")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN customer_accuracy REAL")}catch(e){}
const BACKUP_TABLES=["products","orders","vendors","vendor_products","customer_accounts","payout_requests","vendor_submission_keys","delivery_drivers","deliveries","chat_conversations","chat_messages","order_notifications","digital_services","digital_orders","business_partners","service_bookings","events","event_ticket_types","event_tickets","event_scanners","event_organizer_access"];
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
      order_notifications:["id","recipient_type","recipient_phone","order_id","title","message","created_at","read_at"],
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
try{db.exec("ALTER TABLE orders ADD COLUMN payment_group_id TEXT DEFAULT NULL")}catch(e){}
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
app.post('/api/admin/event-flyer', guard, upload.single('flyer'), (req,res)=>{
  if(!req.file)return res.status(400).json({error:'Choose a flyer image first.'});
  if(!/^image\/(jpeg|png|webp|gif)$/.test(req.file.mimetype)) { try{fs.unlinkSync(req.file.path)}catch{}; return res.status(400).json({error:'Flyer must be JPG, PNG, WEBP or GIF.'}); }
  res.status(201).json({ok:true,url:'/uploads/'+req.file.filename});
});
function vendorGuard(req,res,next){const s=getSession(req);if(!s||s.type!=="vendor")return res.status(401).json({error:"Vendor login required"});req.vendorId=s.vendor_id;req.sessionToken=s.token;next()}
function driverGuard(req,res,next){const s=getSession(req);if(!s||s.type!=="driver")return res.status(401).json({error:"Driver login required"});req.driverId=s.vendor_id;req.sessionToken=s.token;next()}
app.post("/api/auth/logout",(req,res)=>{const token=(req.headers.authorization||"").replace("Bearer ","").trim();if(token)db.prepare("DELETE FROM auth_sessions WHERE token=?").run(token);res.json({ok:true});});

app.get("/api/stores",(req,res)=>{
  const stores=db.prepare(`
    SELECT v.id,v.business_name,v.full_name,v.category,v.description,v.location,v.logo_url,v.created_at,
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
  const v=db.prepare("SELECT id,business_name,full_name,category,description,location,logo_url,created_at FROM vendors WHERE id=? AND status='APPROVED'").get(req.params.id);
  if(!v)return res.status(404).json({error:"Store not found"});
  const products=db.prepare("SELECT * FROM products WHERE vendor_id=? AND active=1 ORDER BY id DESC").all(req.params.id);
  res.json({...v,products});
});


// Digital services are separate from physical inventory and never alter product stock.
app.get("/api/digital-services",(req,res)=>res.json(db.prepare("SELECT id,name,description,plan_name,duration,price FROM digital_services WHERE active=1 ORDER BY id").all()));
app.post("/api/digital-orders",(req,res)=>{
  const b=req.body||{},service=db.prepare("SELECT * FROM digital_services WHERE id=? AND active=1").get(Number(b.service_id));
  if(!service)return res.status(400).json({error:"This digital plan is unavailable."});
  const customer_name=String(b.customer_name||"").trim(),customer_whatsapp=String(b.customer_whatsapp||"").replace(/[^0-9+]/g,""),customer_account_email=String(b.customer_account_email||"").trim();
  if(customer_name.length<2||customer_whatsapp.replace(/\D/g,"").length<7||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_account_email))return res.status(400).json({error:"Enter your name, WhatsApp number and the email for your own Netflix account."});
  const id="DIG-"+Date.now().toString(36).toUpperCase()+"-"+crypto.randomBytes(2).toString("hex").toUpperCase();
  db.prepare("INSERT INTO digital_orders(id,service_id,service_name,plan_name,duration,customer_name,customer_whatsapp,customer_email,customer_account_email,total,supplier_cost) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id,service.id,service.name,service.plan_name,service.duration,customer_name,customer_whatsapp,String(b.customer_email||"").trim(),customer_account_email,service.price,service.supplier_cost);
  res.status(201).json({ok:true,id,total:service.price,payment_status:"PENDING",message:"Order created. Complete payment using the shop's displayed payment instructions, then wait for BASSE to verify it. Do not send your Netflix password."});
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

app.post("/api/admin/sms/test",guard,async(req,res)=>{
  const number=String(req.body?.number||"").replace(/[^0-9+]/g,"");
  if(!/^\+?220[0-9]{7,9}$/.test(number))return res.status(400).json({error:"Enter a Gambian number in international format, e.g. +220XXXXXXXX."});
  if(String(process.env.BULKGATE_SMS_ENABLED||"false").toLowerCase()!=="true")return res.status(409).json({error:"SMS is disabled. Set BULKGATE_SMS_ENABLED=true in Render only when ready to send a paid test SMS."});
  try{const result=await sendBulkGateSms(number,"BASSE ONLINE SHOP test: SMS integration is connected.",{eventKey:"admin-test:"+crypto.createHash("sha256").update(number+":"+Date.now()).digest("hex"),orderId:null,messageType:"test"});if(!result.ok)return res.status(502).json({error:"BulkGate did not accept the test SMS. Check server logs and API settings."});res.json({ok:true,status:"accepted",smsId:result.smsId||null});}
  catch(e){console.error("[bulkgate-test]",e.message);res.status(502).json({error:"SMS test failed. Check BulkGate credentials and account balance."})}
});

app.get("/api/admin/order-notifications",guard,(req,res)=>{
  const rows=db.prepare("SELECT * FROM order_notifications WHERE recipient_type='admin' ORDER BY id DESC LIMIT 100").all();
  const unread=db.prepare("SELECT COUNT(*) c FROM order_notifications WHERE recipient_type='admin' AND read_at IS NULL").get().c;
  res.json({notifications:rows,unread});
});
app.post("/api/admin/order-notifications/read",guard,(req,res)=>{
  db.prepare("UPDATE order_notifications SET read_at=CURRENT_TIMESTAMP WHERE recipient_type='admin' AND read_at IS NULL").run();
  res.json({ok:true});
});
app.get("/api/customer/order-notifications",(req,res)=>{
  const phone=String(req.query.phone||"").replace(/\D/g,"").replace(/^220/,"");
  if(phone.length<6)return res.status(400).json({error:"Valid customer phone required."});
  const full="220"+phone;
  const rows=db.prepare("SELECT * FROM order_notifications WHERE recipient_type='customer' AND recipient_phone=? ORDER BY id DESC LIMIT 50").all(full);
  const unread=db.prepare("SELECT COUNT(*) c FROM order_notifications WHERE recipient_type='customer' AND recipient_phone=? AND read_at IS NULL").get(full).c;
  res.json({notifications:rows,unread});
});
app.post("/api/customer/order-notifications/read",(req,res)=>{
  const phone=String(req.body?.phone||"").replace(/\D/g,"").replace(/^220/,"");
  if(phone.length<6)return res.status(400).json({error:"Valid customer phone required."});
  db.prepare("UPDATE order_notifications SET read_at=CURRENT_TIMESTAMP WHERE recipient_type='customer' AND recipient_phone=? AND read_at IS NULL").run("220"+phone);
  res.json({ok:true});
});

app.get("/api/admin/digital-services",guard,(req,res)=>res.json(db.prepare("SELECT * FROM digital_services ORDER BY id DESC").all()));
app.post("/api/admin/digital-services",guard,(req,res)=>{
 const b=req.body||{},name=String(b.name||"").trim(),plan=String(b.plan_name||"").trim(),price=Number(b.price),cost=Number(b.supplier_cost||0);
 if(!name||!plan||!Number.isFinite(price)||price<1||!Number.isFinite(cost)||cost<0)return res.status(400).json({error:"Enter a service, plan and valid prices."});
 const info=db.prepare("INSERT INTO digital_services(name,description,plan_name,duration,price,supplier_cost) VALUES(?,?,?,?,?,?)").run(name,String(b.description||""),plan,String(b.duration||""),Math.round(price),Math.round(cost));
 res.status(201).json(db.prepare("SELECT * FROM digital_services WHERE id=?").get(info.lastInsertRowid));
});
app.put("/api/admin/digital-services/:id",guard,(req,res)=>{
 const old=db.prepare("SELECT * FROM digital_services WHERE id=?").get(Number(req.params.id));if(!old)return res.status(404).json({error:"Plan not found"});
 const b=req.body||{},price=b.price===undefined?old.price:Number(b.price),cost=b.supplier_cost===undefined?old.supplier_cost:Number(b.supplier_cost);
 if(price<1||cost<0||!Number.isFinite(price)||!Number.isFinite(cost))return res.status(400).json({error:"Invalid price or supplier cost."});
 db.prepare("UPDATE digital_services SET name=?,description=?,plan_name=?,duration=?,price=?,supplier_cost=?,active=? WHERE id=?").run(String(b.name??old.name),String(b.description??old.description),String(b.plan_name??old.plan_name),String(b.duration??old.duration),Math.round(price),Math.round(cost),b.active===undefined?old.active:(b.active?1:0),old.id);
 res.json({ok:true});
});
app.get("/api/admin/digital-orders",guard,(req,res)=>res.json(db.prepare("SELECT * FROM digital_orders ORDER BY datetime(created_at) DESC").all()));
app.patch("/api/admin/digital-orders/:id",guard,(req,res)=>{
 const row=db.prepare("SELECT * FROM digital_orders WHERE id=?").get(req.params.id);if(!row)return res.status(404).json({error:"Digital order not found"});
 const action=String((req.body||{}).action||"");
 if(action==="paid")db.prepare("UPDATE digital_orders SET payment_status='PAID',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
 else if(action==="processing")db.prepare("UPDATE digital_orders SET order_status='PROCESSING',updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status='PAID'").run(row.id);
 else if(action==="completed")db.prepare("UPDATE digital_orders SET order_status='COMPLETED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status='PAID'").run(row.id);
 else return res.status(400).json({error:"Unsupported action."});
 res.json({ok:true});
});
app.get("/api/admin/orders",guard,(req,res)=>res.json(db.prepare(`SELECT o.*,p.image AS product_image,p.images AS product_images,v.business_name AS vendor_business_name,v.whatsapp AS vendor_whatsapp FROM orders o LEFT JOIN products p ON p.id=o.product_id LEFT JOIN vendors v ON v.id=o.vendor_id ORDER BY datetime(o.created_at) DESC`).all()));
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
      order_notifications:["id","recipient_type","recipient_phone","order_id","title","message","created_at","read_at"],
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
    // Never reintroduce stale GPS coordinates from an older backup. Product/order data
    // stays intact; only invalid live-location fields are cleared.
    for(const row of (data.tables.orders||[])){
      if((row.customer_lat!=null||row.customer_lng!=null) && !validGambiaGps(Number(row.customer_lat),Number(row.customer_lng)))
        db.prepare('UPDATE orders SET customer_lat=NULL,customer_lng=NULL,customer_accuracy=NULL WHERE id=?').run(row.id);
    }
    for(const row of (data.tables.deliveries||[])){
      if((row.lat!=null||row.lng!=null) && !validGambiaGps(Number(row.lat),Number(row.lng)))
        db.prepare('UPDATE deliveries SET lat=NULL,lng=NULL,accuracy=NULL,last_seen=NULL WHERE id=?').run(row.id);
    }
    // Restore uploaded images before exposing the restored catalog. The old background
    // copy caused the browser to request new product records while their image files were
    // still missing, which produced the visible image blinking. Files are written atomically.
    const productCount=(data.tables.products||[]).length, orderCount=(data.tables.orders||[]).length, vendorCount=(data.tables.vendors||[]).length, driverCount=(data.tables.delivery_drivers||[]).length, deliveryCount=(data.tables.deliveries||[]).length;
    const files=Array.isArray(data.files)?data.files:[];
    const uploadDir=path.join(DATA_DIR,"uploads");fs.mkdirSync(uploadDir,{recursive:true});
    let restoredFiles=0;
    for(const file of files){
      if(!file?.path||!file.path.startsWith("uploads/")||file.path.includes(".."))continue;
      const rel=file.path.slice("uploads/".length);if(!rel||rel.includes("/")||rel.includes("\\"))continue;
      const dest=path.join(uploadDir,rel),tmp=dest+".restore-"+crypto.randomBytes(4).toString("hex");
      try{
        const expected=Number(file.size||0),existing=fs.existsSync(dest)?fs.statSync(dest).size:-1;
        if(existing===expected && expected>=0)continue;
        fs.writeFileSync(tmp,Buffer.from(file.content||"","base64"));
        fs.renameSync(tmp,dest);restoredFiles++;
      }catch(e){try{fs.unlinkSync(tmp)}catch{}}
    }
    // Do NOT rebuild the full base64 backup here. That duplicates every uploaded image
    // in memory/JSON and was the main reason manual restore felt slow. The restored
    // database and files are already in place; the next explicit SAVE SHOP NOW can
    // create a fresh backup when desired.
    broadcastLive("refresh",{});
    res.json({ok:true,message:`Restore complete: ${productCount} products, ${orderCount} orders, ${vendorCount} vendors, ${driverCount} drivers and ${deliveryCount} deliveries. Product options and images are restored and ready.` ,restoredFiles});
  }catch(e){console.error("Backup restore failed:",e);res.status(500).json({error:"Restore failed. The backup format may not match this shop version."})}
});
app.get("/api/admin/stats",guard,(req,res)=>res.json({products:db.prepare("SELECT COUNT(*) c FROM products WHERE active=1").get().c,orders:db.prepare("SELECT COUNT(*) c FROM orders").get().c,customers:db.prepare("SELECT COUNT(*) c FROM (SELECT whatsapp FROM customer_accounts UNION SELECT whatsapp FROM orders WHERE whatsapp IS NOT NULL AND whatsapp!='')").get().c,pending:db.prepare("SELECT COUNT(*) c FROM orders WHERE payment_status='PENDING'").get().c,paid:db.prepare("SELECT COUNT(*) c FROM orders WHERE payment_status='PAID'").get().c,cancelled:db.prepare("SELECT COUNT(*) c FROM orders WHERE payment_status='CANCELLED' OR order_status='CANCELLED'").get().c,refunded:db.prepare("SELECT COUNT(*) c FROM orders WHERE payment_status='REFUNDED'").get().c,sales:db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE payment_status='PAID' AND order_status!='CANCELLED' AND date(created_at)=date('now','localtime')").get().s,liveViewers:liveViewerStats()}));
app.get("/api/admin/live-viewers",guard,(req,res)=>res.json(liveViewerStats()));
app.get("/api/admin/login-attempts",guard,(req,res)=>{const rows=db.prepare("SELECT id,portal,identifier,success,reason,created_at FROM login_attempts ORDER BY id DESC LIMIT 30").all();res.json(rows)});
app.post("/api/customers/register",async(req,res)=>{
 const name=String(req.body?.name||req.body?.fullName||"").trim().slice(0,120);
 const phone=String(req.body?.whatsapp||req.body?.phone||"").replace(/\D/g,"").replace(/^220/,"");
 const password=String(req.body?.password||"");
 if(!name||phone.length<6)return res.status(400).json({error:"Enter your name and valid WhatsApp number."});
 if(password.length<4)return res.status(400).json({error:"Password must be at least 4 characters."});
 if(String(process.env.BULKGATE_SMS_ENABLED||"false").toLowerCase()!=="true")return res.status(503).json({error:"SMS verification is temporarily unavailable. Please try again later or contact BASSE Admin."});
 const fullPhone="220"+phone;
 const existing=db.prepare("SELECT id,status FROM customer_accounts WHERE whatsapp=?").get(fullPhone);
 if(existing?.status==="BLOCKED")return res.status(403).json({error:"This customer account is blocked. Please contact BASSE Admin."});
 const now=Date.now();
 const previous=db.prepare("SELECT last_sent_at FROM customer_registration_otps WHERE whatsapp=?").get(fullPhone);
 if(previous&&now-Number(previous.last_sent_at)<60_000)return res.status(429).json({error:"Please wait 60 seconds before requesting another verification code."});
 const recent=Number(db.prepare("SELECT COUNT(*) c FROM sms_send_log WHERE recipient=? AND message_type='customer-otp' AND created_at >= datetime('now','-1 hour')").get(fullPhone).c||0);
 if(recent>=3)return res.status(429).json({error:"Too many verification codes requested. Please try again in an hour."});
 const code=String(crypto.randomInt(100000,1000000));
 const otpHash=crypto.createHash("sha256").update(fullPhone+"|"+code+"|"+String(process.env.CUSTOMER_OTP_SECRET||process.env.BULKGATE_APPLICATION_TOKEN||"basse-otp")).digest("hex");
 db.prepare(`INSERT INTO customer_registration_otps(whatsapp,full_name,password_hash,otp_hash,expires_at,attempts,last_sent_at)
 VALUES(?,?,?,?,?,0,?) ON CONFLICT(whatsapp) DO UPDATE SET full_name=excluded.full_name,password_hash=excluded.password_hash,otp_hash=excluded.otp_hash,expires_at=excluded.expires_at,attempts=0,last_sent_at=excluded.last_sent_at`).run(fullPhone,name,crypto.createHash("sha256").update(password).digest("hex"),otpHash,now+5*60_000,now);
 try{
   const eventKey="customer-otp:"+crypto.createHash("sha256").update(fullPhone+"|"+String(now)).digest("hex");
   const result=await sendBulkGateSms(fullPhone,`BASSE ONLINE SHOP verification code: ${code}. Expires in 5 minutes. Do not share this code.`,{eventKey,orderId:null,messageType:"customer-otp"});
   if(!result.ok){db.prepare("DELETE FROM customer_registration_otps WHERE whatsapp=?").run(fullPhone);return res.status(502).json({error:"We couldn't send your verification code. Please try again shortly."});}
   res.json({ok:true,otpRequired:true,phone:fullPhone,message:"Verification code sent by SMS. It expires in 5 minutes."});
 }catch(e){db.prepare("DELETE FROM customer_registration_otps WHERE whatsapp=?").run(fullPhone);console.error("[customer-otp-send]",e.message);res.status(502).json({error:"We couldn't send your verification code. Please check your number and try again."});}
});
app.post("/api/customers/register/verify",(req,res)=>{
 const phone=String(req.body?.whatsapp||req.body?.phone||"").replace(/\D/g,"").replace(/^220/,"");
 const code=String(req.body?.code||"").replace(/\D/g,"");
 if(phone.length<6||!/^\d{6}$/.test(code))return res.status(400).json({error:"Enter the 6-digit verification code sent to your phone."});
 const fullPhone="220"+phone;
 const pending=db.prepare("SELECT * FROM customer_registration_otps WHERE whatsapp=?").get(fullPhone);
 if(!pending)return res.status(400).json({error:"No active verification code found. Please create your account again."});
 if(Number(pending.expires_at)<Date.now()){db.prepare("DELETE FROM customer_registration_otps WHERE whatsapp=?").run(fullPhone);return res.status(400).json({error:"That code has expired. Please request a new one."});}
 if(Number(pending.attempts)>=5){db.prepare("DELETE FROM customer_registration_otps WHERE whatsapp=?").run(fullPhone);return res.status(429).json({error:"Too many incorrect attempts. Please request a new code."});}
 const expected=crypto.createHash("sha256").update(fullPhone+"|"+code+"|"+String(process.env.CUSTOMER_OTP_SECRET||process.env.BULKGATE_APPLICATION_TOKEN||"basse-otp")).digest("hex");
 if(expected!==pending.otp_hash){db.prepare("UPDATE customer_registration_otps SET attempts=attempts+1 WHERE whatsapp=?").run(fullPhone);return res.status(400).json({error:"Incorrect verification code. Please check the SMS and try again."});}
 const existing=db.prepare("SELECT id,status FROM customer_accounts WHERE whatsapp=?").get(fullPhone);
 if(existing?.status==="BLOCKED"){db.prepare("DELETE FROM customer_registration_otps WHERE whatsapp=?").run(fullPhone);return res.status(403).json({error:"This customer account is blocked. Please contact BASSE Admin."});}
 let customerId;
 if(existing){db.prepare("UPDATE customer_accounts SET full_name=?,password_hash=? WHERE id=?").run(pending.full_name,pending.password_hash,existing.id);customerId=existing.id;}
 else {const x=db.prepare("INSERT INTO customer_accounts(full_name,whatsapp,password_hash,status) VALUES(?,?,?,?)").run(pending.full_name,fullPhone,pending.password_hash,"ACTIVE");customerId=Number(x.lastInsertRowid);}
 db.prepare("DELETE FROM customer_registration_otps WHERE whatsapp=?").run(fullPhone);
 backupShopData("customer-registered");
 const c=db.prepare("SELECT id,full_name,whatsapp,status FROM customer_accounts WHERE id=?").get(customerId);
 res.status(existing?200:201).json({ok:true,id:c.id,full_name:c.full_name,whatsapp:c.whatsapp,status:c.status||"ACTIVE"});
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

app.post("/api/chat/conversations",(req,res)=>{
  cleanupExpiredChatMessages();
  const customerId=req.body?.customerId?Number(req.body.customerId):null;
  const customerName=String(req.body?.customerName||"Guest Customer").trim().slice(0,120)||"Guest Customer";
  const customerWhatsapp=String(req.body?.customerWhatsapp||"").replace(/\D/g,"").replace(/^220/,"").slice(0,15);
  const vendorId=req.body?.vendorId?Number(req.body.vendorId):null;
  if(vendorId){const v=db.prepare("SELECT id,business_name FROM vendors WHERE id=? AND status='APPROVED'").get(vendorId);if(!v)return res.status(404).json({error:"Vendor not found or not approved."});}
  let c=vendorId?db.prepare("SELECT * FROM chat_conversations WHERE customer_whatsapp=? AND vendor_id=?").get("220"+customerWhatsapp,vendorId):db.prepare("SELECT * FROM chat_conversations WHERE customer_whatsapp=? AND vendor_id IS NULL").get("220"+customerWhatsapp);
  if(!c){
    const x=db.prepare("INSERT INTO chat_conversations(customer_id,customer_name,customer_whatsapp,vendor_id) VALUES(?,?,?,?)").run(customerId,customerName,customerWhatsapp?"220"+customerWhatsapp:"",vendorId);
    c=db.prepare("SELECT * FROM chat_conversations WHERE id=?").get(x.lastInsertRowid);
    const v=vendorId?db.prepare("SELECT business_name FROM vendors WHERE id=?").get(vendorId):null;
    const welcome=vendorId
      ? `Hello 👋 Welcome to ${v?.business_name||"this store"}. Thanks for contacting us. How can we help you with a product today?`
      : "Hello 👋 Welcome to BASSE ONLINE SHOP! How can we help you today? You can ask about products, prices, orders, payments, delivery, or anything else.";
    const senderName=vendorId?(v?.business_name||"Vendor"):"BASSE Support";
    db.prepare("INSERT INTO chat_messages(conversation_id,sender_type,sender_id,sender_name,message) VALUES(?,?,?,?,?)").run(c.id,vendorId?"vendor":"admin",vendorId||null,senderName,welcome);
    db.prepare("UPDATE chat_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(c.id);
    c=db.prepare("SELECT * FROM chat_conversations WHERE id=?").get(c.id);
    backupShopData("chat-welcome");
  } else db.prepare("UPDATE chat_conversations SET customer_id=COALESCE(?,customer_id),customer_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(customerId,customerName,c.id);
  res.json({ok:true,conversation:c});
});
app.get("/api/chat/messages/:id",(req,res)=>{
  cleanupExpiredChatMessages();const c=db.prepare("SELECT * FROM chat_conversations WHERE id=?").get(req.params.id);if(!c)return res.status(404).json({error:"Conversation not found"});const messages=db.prepare("SELECT * FROM chat_messages WHERE conversation_id=? ORDER BY id ASC LIMIT 300").all(c.id);res.json({conversation:c,messages});});
app.post("/api/chat/messages/:id",(req,res)=>{
  cleanupExpiredChatMessages();const c=db.prepare("SELECT * FROM chat_conversations WHERE id=?").get(req.params.id);if(!c)return res.status(404).json({error:"Conversation not found"});const type=String(req.body?.senderType||"");if(!["customer","admin","vendor"].includes(type))return res.status(400).json({error:"Invalid sender."});const message=String(req.body?.message||"").trim().slice(0,2000);if(!message)return res.status(400).json({error:"Message cannot be empty."});if(type==="admin"){const s=getSession(req);if(!s||s.type!=="admin")return res.status(401).json({error:"Admin login required"});}if(type==="vendor"){const s=getSession(req);if(!s||s.type!=="vendor"||Number(c.vendor_id)!==Number(s.vendor_id))return res.status(401).json({error:"Vendor login required"});}const productId=req.body?.productId?Number(req.body.productId):null;const x=db.prepare("INSERT INTO chat_messages(conversation_id,sender_type,sender_id,sender_name,message,product_id) VALUES(?,?,?,?,?,?)").run(c.id,type,type==="vendor"?getSession(req)?.vendor_id:null,String(req.body?.senderName||type).slice(0,120),message,productId);db.prepare("UPDATE chat_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(c.id);backupShopData("chat-message");res.json({ok:true,message:db.prepare("SELECT * FROM chat_messages WHERE id=?").get(x.lastInsertRowid)});});
app.post("/api/chat/messages/:id/read",(req,res)=>{
  cleanupExpiredChatMessages();
  const raw=String(req.body?.customerWhatsapp||"").replace(/\D/g,"").replace(/^220/,"");
  const phone="220"+raw;
  const c=db.prepare("SELECT id FROM chat_conversations WHERE id=? AND customer_whatsapp=?").get(req.params.id,phone);
  if(!c)return res.status(404).json({error:"Conversation not found"});
  db.prepare("UPDATE chat_messages SET read_at=CURRENT_TIMESTAMP WHERE conversation_id=? AND sender_type IN ('admin','vendor') AND read_at IS NULL").run(c.id);
  res.json({ok:true});
});
app.get("/api/admin/chat/conversations",guard,(req,res)=>{
  cleanupExpiredChatMessages();res.json(db.prepare(`SELECT c.*,v.business_name AS vendor_name,(SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id=c.id AND m.sender_type='customer' AND m.read_at IS NULL) unread,(SELECT message FROM chat_messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) last_message FROM chat_conversations c LEFT JOIN vendors v ON v.id=c.vendor_id ORDER BY datetime(c.updated_at) DESC`).all())});
app.post("/api/admin/chat/messages/:id/read",guard,(req,res)=>{
  cleanupExpiredChatMessages();db.prepare("UPDATE chat_messages SET read_at=CURRENT_TIMESTAMP WHERE conversation_id=? AND sender_type='customer'").run(req.params.id);res.json({ok:true})});
app.get("/api/vendor/chat/conversations",vendorGuard,(req,res)=>{
  cleanupExpiredChatMessages();res.json(db.prepare(`SELECT c.*,v.business_name AS vendor_name,(SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id=c.id AND m.sender_type='customer' AND m.read_at IS NULL) unread,(SELECT message FROM chat_messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) last_message FROM chat_conversations c LEFT JOIN vendors v ON v.id=c.vendor_id WHERE c.vendor_id=? ORDER BY datetime(c.updated_at) DESC`).all(req.vendorId))});
app.post("/api/vendor/chat/messages/:id/read",vendorGuard,(req,res)=>{
  cleanupExpiredChatMessages();const c=db.prepare("SELECT id FROM chat_conversations WHERE id=? AND vendor_id=?").get(req.params.id,req.vendorId);if(!c)return res.status(404).json({error:"Conversation not found"});db.prepare("UPDATE chat_messages SET read_at=CURRENT_TIMESTAMP WHERE conversation_id=? AND sender_type='customer'").run(c.id);res.json({ok:true})});
app.post("/api/orders/cart",async(req,res)=>{
  const items=Array.isArray(req.body?.items)?req.body.items:[];
  if(!items.length)return res.status(400).json({error:"Your cart is empty."});
  const name=String(req.body.name||"").trim();
  const rawPhone=String(req.body.whatsapp||"").replace(/\D/g,"").replace(/^220/,"");
  if(!name)return res.status(400).json({error:"Please enter your full name."});
  if(rawPhone.length<6)return res.status(400).json({error:"Enter a valid WhatsApp number"});
  const phone="220"+rawPhone;
  const customerAccount=db.prepare("SELECT status FROM customer_accounts WHERE whatsapp=?").get(phone);
  if(customerAccount?.status==='BLOCKED')return res.status(403).json({error:"This customer account is blocked. Please contact BASSE Admin."});
  const groupId="BOSG-"+crypto.randomBytes(4).toString("hex").toUpperCase();
  const created=[];
  try{
    const tx=db.transaction(()=>{
      for(const item of items){
        const p=db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(item.productId);
        const q=Math.max(1,Math.floor(Number(item.quantity)||1));
        if(!p)throw new Error("One of the products is no longer available.");
        if(q>p.stock)throw new Error(`${p.name}: only ${p.stock} item${p.stock===1?'':'s'} available.`);
        const total=p.price*q;
        const id="BOS-"+crypto.randomBytes(4).toString("hex").toUpperCase();
        const commission=Math.round(total*0.10),vendorEarnings=total-commission,vendorId=p.vendor_id||null;
        const chosenOptions=orderOptionsLabel(item.options);
        const orderProductName=chosenOptions?p.name+" ("+chosenOptions+")":p.name;
        const changed=db.prepare("UPDATE products SET stock=stock-? WHERE id=? AND active=1 AND stock>=?").run(q,p.id,q);
        if(!changed.changes)throw new Error(`${p.name}: not enough stock.`);
        db.prepare("INSERT INTO orders(id,product_id,product_name,quantity,customer_name,whatsapp,location,total,vendor_id,commission,vendor_earnings,stock_reserved,stock_released,customer_lat,customer_lng,customer_accuracy,payment_group_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(id,p.id,orderProductName,q,name,phone,String(req.body.location||""),total,vendorId,commission,vendorEarnings,q,0,Number.isFinite(Number(req.body.customerLat))?Number(req.body.customerLat):null,Number.isFinite(Number(req.body.customerLng))?Number(req.body.customerLng):null,Number.isFinite(Number(req.body.customerAccuracy))?Number(req.body.customerAccuracy):null,groupId);
        created.push({id,product_id:p.id,product_name:orderProductName,quantity:q,total,vendor_id:vendorId});
      }
    });
    tx();
  }catch(e){return res.status(400).json({error:e.message||"Could not create the cart order."})}
  backupShopData("cart-order-created");
  const customerOrderPhone=phone;
  created.forEach(o=>{const fullOrder=db.prepare("SELECT * FROM orders WHERE id=?").get(o.id);notifyNewOrder(fullOrder);notifyCustomerOrder(fullOrder,"🛍️ ORDER RECEIVED",`Your order #${o.id} has been received. We will update you when it is confirmed.`);broadcastLive("catalog",{productId:o.product_id,stockChanged:true});});
  broadcastLive("notifications",{orderGroupId:groupId});
  broadcastLive("orders",{orderGroupId:groupId});
  const grandTotal=created.reduce((a,o)=>a+Number(o.total||0),0);
  let paymentUrl="",paymentError="";
  if(process.env.WAYCHIT_API_KEY){
    try{
      const r=await fetch("https://api.waychit.com/v1/payment-requests",{method:"POST",headers:{"Authorization":"Bearer "+process.env.WAYCHIT_API_KEY,"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({amount:grandTotal,description:`BASSE ONLINE SHOP cart (${created.length} items)`,clientReference:groupId,successRedirectUrl:PUBLIC_BASE_URL+"/payment-return?payment=success&order="+encodeURIComponent(created[0].id)+"&group="+encodeURIComponent(groupId),failureRedirectUrl:PUBLIC_BASE_URL+"/payment-return?payment=failed&order="+encodeURIComponent(created[0].id)+"&group="+encodeURIComponent(groupId)})});
      const body=await r.text();let d={};try{d=JSON.parse(body)}catch{}
      console.log("Waychit cart payment request:",r.status,body.slice(0,1200));
      if(r.ok&&d.paymentRequest?.waychitLaunchUrl){paymentUrl=d.paymentRequest.waychitLaunchUrl;db.prepare("UPDATE orders SET waychit_request_id=? WHERE payment_group_id=?").run(d.paymentRequest.id,groupId)}else paymentError=d.error?.message||d.message||"Waychit payment could not be created.";
    }catch(e){paymentError=e.message||"Waychit is unavailable."}
  }else paymentError="Waychit API is not configured.";
  res.json({ok:true,paymentUrl,paymentMode:paymentUrl?"dynamic":"fallback",paymentError,order:created[0],orders:created,groupId,total:grandTotal,whatsappSupport:process.env.WHATSAPP_SUPPORT||""});
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
  const createdOrder=db.prepare("SELECT * FROM orders WHERE id=?").get(id);
  notifyNewOrder(createdOrder);
  notifyCustomerOrder(createdOrder,"🛍️ ORDER RECEIVED",`Your order #${id} has been received. We will update you when it is confirmed.`);
  broadcastLive("catalog",{productId:p.id,stockChanged:true});
  broadcastLive("notifications",{orderId:id});
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

// The Gambia geographic polygon.  A simple rectangular bbox is not enough because
// Senegal surrounds The Gambia on three sides; old/stale GPS readings inside Senegal
// can otherwise pass the check. Coordinates are [longitude, latitude] and are based
// on the country polygon published in the countries GeoJSON dataset.
const GAMBIA_POLYGON=[
  [-16.841525,13.151394],[-16.713729,13.594959],[-15.624596,13.623587],
  [-15.398770,13.860369],[-15.081735,13.876492],[-14.687031,13.630357],
  [-14.376714,13.625680],[-14.046992,13.794068],[-13.791500,13.424000],
  [-13.800000,13.360000],[-13.900000,13.300000],[-14.277702,13.280585],
  [-14.712197,13.298207],[-15.141163,13.509512],[-15.511813,13.278570],
  [-15.691001,13.270353],[-15.931296,13.130284]
];
const GAMBIA_GPS={minLat:13.02,maxLat:13.90,minLng:-16.90,maxLng:-13.70};
function pointInGambia(lat,lng){
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<GAMBIA_GPS.minLat||lat>GAMBIA_GPS.maxLat||lng<GAMBIA_GPS.minLng||lng>GAMBIA_GPS.maxLng)return false;
  let inside=false;
  for(let i=0,j=GAMBIA_POLYGON.length-1;i<GAMBIA_POLYGON.length;j=i++){
    const xi=GAMBIA_POLYGON[i][0],yi=GAMBIA_POLYGON[i][1],xj=GAMBIA_POLYGON[j][0],yj=GAMBIA_POLYGON[j][1];
    const intersect=((yi>lat)!=(yj>lat)) && (lng < (xj-xi)*(lat-yi)/(yj-yi)+xi);
    if(intersect)inside=!inside;
  }
  return inside;
}
function validGambiaGps(lat,lng){return pointInGambia(Number(lat),Number(lng));}
function gpsDistanceKm(a,b,c,d){const R=6371,rad=x=>x*Math.PI/180,p1=rad(a),p2=rad(c),dp=rad(c-a),dl=rad(d-b),h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
// Remove obviously stale coordinates left by older tracking versions. This does not
// touch written delivery addresses, products, vendors, orders or payments.
try{
  // Remove GPS coordinates that are outside the actual country polygon. This runs on
  // startup so coordinates restored by an older backup cannot appear on a live map.
  const ordersWithGps=db.prepare(`SELECT id,customer_lat,customer_lng FROM orders WHERE customer_lat IS NOT NULL OR customer_lng IS NOT NULL`).all();
  const clearOrder=db.prepare('UPDATE orders SET customer_lat=NULL,customer_lng=NULL,customer_accuracy=NULL WHERE id=?');
  for(const x of ordersWithGps){if(!validGambiaGps(Number(x.customer_lat),Number(x.customer_lng)))clearOrder.run(x.id);}
  const deliveriesWithGps=db.prepare(`SELECT id,lat,lng FROM deliveries WHERE lat IS NOT NULL OR lng IS NOT NULL`).all();
  const clearDelivery=db.prepare('UPDATE deliveries SET lat=NULL,lng=NULL,accuracy=NULL,last_seen=NULL WHERE id=?');
  for(const x of deliveriesWithGps){if(!validGambiaGps(Number(x.lat),Number(x.lng)))clearDelivery.run(x.id);}
  const bad=db.prepare(`SELECT d.id,d.lat,d.lng,o.customer_lat,o.customer_lng FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE d.lat IS NOT NULL AND d.lng IS NOT NULL AND o.customer_lat IS NOT NULL AND o.customer_lng IS NOT NULL`).all();
  for(const x of bad){if(gpsDistanceKm(Number(x.lat),Number(x.lng),Number(x.customer_lat),Number(x.customer_lng))>500)clearDelivery.run(x.id);}
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
  // Do not expose invalid/stale coordinates to any client. The map should either show
  // real Gambia GPS or explicitly wait for a fresh GPS reading.
  const safeOrder={...o};
  if(!validGambiaGps(Number(safeOrder.customer_lat),Number(safeOrder.customer_lng))){safeOrder.customer_lat=null;safeOrder.customer_lng=null;safeOrder.customer_accuracy=null;}
  let safeDelivery=d?{...d}:null;
  if(safeDelivery && !validGambiaGps(Number(safeDelivery.lat),Number(safeDelivery.lng))){safeDelivery.lat=null;safeDelivery.lng=null;safeDelivery.accuracy=null;safeDelivery.last_seen=null;}
  res.set("Cache-Control","no-store");
  res.json({order:safeOrder,delivery:safeDelivery,trackingActive:String(safeDelivery?.status||o.order_status)!=="DELIVERED"});
});
app.post("/api/admin/orders/:id/payment",guard,(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});if(o.payment_status==='REFUNDED'||o.payment_status==='CANCELLED')return res.status(400).json({error:'This payment is already closed.'});db.prepare("UPDATE orders SET payment_status='PAID',order_status='PROCESSING' WHERE id=?").run(req.params.id);const updatedOrder=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);notifyCustomerOrder(updatedOrder,"💳 PAYMENT CONFIRMED",`Payment for order #${updatedOrder.id} is confirmed. Your order is now being processed.`);backupShopData("payment-confirmed");broadcastLive("orders",{orderId:req.params.id});broadcastLive("notifications",{orderId:req.params.id});res.json({ok:true})});
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
  const updatedOrder=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  const statusLabels={NEW:"Order received",PROCESSING:"Order is being processed",READY:"Order is ready for delivery",DELIVERED:"Order delivered",CANCELLED:"Order cancelled",REFUNDED:"Order refunded"};
  notifyCustomerOrder(updatedOrder,`📦 ${statusLabels[status]||"Order updated"}`,`Your order #${updatedOrder.id} is now ${String(status).replaceAll("_"," ").toLowerCase()}.`);
  backupShopData("order-status");broadcastLive("orders",{orderId:req.params.id});broadcastLive("notifications",{orderId:req.params.id});res.json({ok:true,deliveryCreated:status==='READY'});
});
app.get("/api/payment-config",(req,res)=>res.json({configured:!!process.env.WAYCHIT_API_KEY,publicBaseUrl:PUBLIC_BASE_URL,staticFallback:true,returnUrl:PUBLIC_BASE_URL+"/payment-return",automaticReturnSupported:!!process.env.WAYCHIT_API_KEY}));
app.post("/api/waychit/webhook",(req,res)=>{
  // Never trust a browser return URL for payment. Only a valid, recent provider signature
  // is allowed to activate tickets or orders.
  const sig=req.headers["waychit-signature"], secret=process.env.WAYCHIT_WEBHOOK_SECRET, raw=req.rawBody||"";
  if(!sig||!secret||!raw)return res.status(400).send("Webhook not configured");
  try{
    const parts=String(sig).split(","), t=parts.find(x=>x.trim().startsWith("t="))?.trim().split("=")[1], sigs=parts.filter(x=>x.trim().startsWith("v1=")).map(x=>x.trim().split("=")[1]);
    if(!t||!sigs.length||!Number.isFinite(Number(t))||Math.abs(Date.now()/1000-Number(t))>300)return res.status(400).send("Invalid signature");
    const expected=crypto.createHmac("sha256",secret).update(`${t}.${raw}`).digest("hex");
    const valid=sigs.some(candidate=>{try{return crypto.timingSafeEqual(Buffer.from(candidate,'hex'),Buffer.from(expected,'hex'))}catch{return false}});
    if(!valid)return res.status(400).send("Invalid signature");
    const e=JSON.parse(raw), data=e.data||e.payload||e;
    const type=String(e.type||e.event||data.type||'').toLowerCase();
    const completed=/completed|succeeded|successful|paid/.test(type);
    if(completed){
      const pr=e.paymentRequest||data.paymentRequest||data.payment_request||{};
      const ps=e.paymentSession||data.paymentSession||data.payment_session||{};
      const ref=pr.clientReference||pr.client_reference||ps.clientReference||ps.client_reference||data.clientReference||data.client_reference||e.clientReference||e.client_reference||'';
      const requestId=pr.id||ps.id||data.paymentRequestId||data.payment_request_id||'';
      let ticket=null;
      if(String(ref).startsWith('TICKET:')) ticket=db.prepare("SELECT * FROM event_tickets WHERE id=?").get(String(ref).slice(7));
      if(!ticket&&requestId)ticket=db.prepare("SELECT * FROM event_tickets WHERE waychit_request_id=?").get(String(requestId));
      if(ticket){
        const changed=db.prepare("UPDATE event_tickets SET payment_status='PAID',ticket_status=CASE WHEN ticket_status='PENDING_PAYMENT' THEN 'VALID' ELSE ticket_status END WHERE (id=? OR waychit_request_id=?) AND payment_status!='PAID'").run(ticket.id, ticket.waychit_request_id || '');
        if(changed.changes){backupShopData("ticket-waychit-payment");broadcastLive("tickets",{ticketId:ticket.id,eventId:ticket.event_id,paymentStatus:'PAID'});broadcastLive("notifications",{type:'ticket-payment',ticketId:ticket.id,eventId:ticket.event_id});}
      }else if(ref&&!String(ref).startsWith('TICKET:')){
        const group=db.prepare("SELECT payment_group_id FROM orders WHERE id=?").get(ref)?.payment_group_id;
        if(group)db.prepare("UPDATE orders SET payment_status='PAID',order_status='PROCESSING' WHERE payment_group_id=? AND payment_status!='REFUNDED'").run(group);
        else db.prepare("UPDATE orders SET payment_status='PAID',order_status='PROCESSING' WHERE id=? AND payment_status!='REFUNDED'").run(ref);
        const paidOrders=group?db.prepare("SELECT * FROM orders WHERE payment_group_id=?").all(group):db.prepare("SELECT * FROM orders WHERE id=?").all(ref);
        for(const po of paidOrders)notifyCustomerOrder(po,"💳 PAYMENT CONFIRMED",`Payment for order #${po.id} is confirmed. Your order is now being processed.`);
        backupShopData("webhook-payment");broadcastLive("orders",{orderId:ref,orderGroupId:group||null});broadcastLive("notifications",{orderId:ref,orderGroupId:group||null});
      }
    }
    // Acknowledge validly signed non-completion events too, so the provider does not retry forever.
    res.sendStatus(200);
  }catch(err){console.error('[waychit-webhook] Processing failed:',err.message);res.status(400).send("Bad webhook")}
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
  const newOrderStatus=status==="DELIVERED"?"DELIVERED":status==="PICKED_UP"||status==="ON_THE_WAY"||status==="ARRIVED"?"PROCESSING":"READY";
  db.prepare("UPDATE orders SET order_status=? WHERE id=?").run(newOrderStatus,d.order_id);
  const driverOrder=db.prepare("SELECT * FROM orders WHERE id=?").get(d.order_id);
  const deliveryLabels={ASSIGNED:"Driver assigned",PICKED_UP:"Order picked up",ON_THE_WAY:"Driver is on the way",ARRIVED:"Driver has arrived",DELIVERED:"Order delivered"};
  notifyCustomerOrder(driverOrder,`🚚 ${deliveryLabels[status]||"Delivery updated"}`,`Your order #${driverOrder.id}: ${deliveryLabels[status]||String(status).replaceAll("_"," ")}.`);
  backupShopData("driver-delivery-status");broadcastLive("orders",{orderId:d.order_id});broadcastLive("notifications",{orderId:d.order_id});res.json({ok:true});
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
  // GPS changes are live state, not catalog data. Do not rebuild the large base64 backup
  // on every location update; doing so can stall the shop and make images blink.
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
app.get("/api/vendor/me",vendorGuard,(req,res)=>{let v=db.prepare("SELECT id,full_name,business_name,whatsapp,location,category,status,logo_url FROM vendors WHERE id=?").get(req.vendorId);res.json(v)});
app.post("/api/vendor/store-logo",vendorGuard,upload.single("logo"),(req,res)=>{
  if(!req.file)return res.status(400).json({error:"Choose a store logo image first."});
  const logoUrl="/uploads/"+req.file.filename;
  db.prepare("UPDATE vendors SET logo_url=? WHERE id=?").run(logoUrl,req.vendorId);
  backupShopData("vendor-store-logo");
  broadcastLive("vendors",{vendorId:req.vendorId,logoUpdated:true});
  res.json({ok:true,logo_url:logoUrl,message:"Store logo saved and published."});
});
app.get("/api/vendor/orders",vendorGuard,(req,res)=>res.json(db.prepare(`SELECT o.*,p.image AS product_image,p.images AS product_images FROM orders o LEFT JOIN products p ON p.id=o.product_id WHERE o.vendor_id=? ORDER BY datetime(o.created_at) DESC`).all(req.vendorId)));
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
app.post("/api/vendors/apply",async(req,res)=>{
  const b=req.body||{},pin=String(b.password||"");
  const phone=String(b.whatsapp||"").replace(/\D/g,"").replace(/^220/,"");
  const fullName=String(b.fullName||"").trim().slice(0,120),businessName=String(b.businessName||"").trim().slice(0,120);
  if(!fullName||!businessName||phone.length<6)return res.status(400).json({error:"Please complete your name, business name and WhatsApp number."});
  if(!/^\d{4,5}$/.test(pin))return res.status(400).json({error:"Vendor PIN must be exactly 4 or 5 digits."});
  if(String(process.env.BULKGATE_SMS_ENABLED||"false").toLowerCase()!=="true")return res.status(503).json({error:"SMS verification is unavailable. Please try again later."});
  const fullPhone="220"+phone;
  const existing=db.prepare("SELECT id,status FROM vendors WHERE whatsapp=? AND status!='REJECTED'").get(fullPhone);
  if(existing)return res.status(409).json({error:`A vendor application already exists for this number (${existing.status}). Wait for Admin approval or ask Admin to reopen it.`,id:existing.id,status:existing.status});
  const now=Date.now(),prev=db.prepare("SELECT last_sent_at FROM vendor_application_otps WHERE whatsapp=?").get(fullPhone);
  if(prev&&now-Number(prev.last_sent_at)<60_000)return res.status(429).json({error:"Please wait 60 seconds before requesting another code."});
  const recent=Number(db.prepare("SELECT COUNT(*) c FROM sms_send_log WHERE recipient=? AND message_type='vendor-otp' AND created_at >= datetime('now','-1 hour')").get(fullPhone).c||0);
  if(recent>=3)return res.status(429).json({error:"Too many codes requested. Please try again in an hour."});
  const payload={fullName,businessName,whatsapp:fullPhone,location:String(b.location||"").slice(0,160),category:String(b.category||"").slice(0,100),description:String(b.description||"").slice(0,1000),password:pin};
  const code=String(crypto.randomInt(100000,1000000));
  const otpHash=crypto.createHash("sha256").update(fullPhone+"|"+code+"|"+String(process.env.CUSTOMER_OTP_SECRET||process.env.BULKGATE_APPLICATION_TOKEN||"basse-otp")).digest("hex");
  db.prepare(`INSERT INTO vendor_application_otps(whatsapp,payload_json,otp_hash,expires_at,attempts,last_sent_at) VALUES(?,?,?,?,0,?)
    ON CONFLICT(whatsapp) DO UPDATE SET payload_json=excluded.payload_json,otp_hash=excluded.otp_hash,expires_at=excluded.expires_at,attempts=0,last_sent_at=excluded.last_sent_at`).run(fullPhone,JSON.stringify(payload),otpHash,now+5*60_000,now);
  try{
    const eventKey="vendor-otp:"+crypto.createHash("sha256").update(fullPhone+"|"+String(now)).digest("hex");
    const result=await sendBulkGateSms(fullPhone,`BASSE MARKET vendor application verification code: ${code}. Expires in 5 minutes. Do not share this code.`,{eventKey,orderId:null,messageType:"vendor-otp"});
    if(!result.ok){db.prepare("DELETE FROM vendor_application_otps WHERE whatsapp=?").run(fullPhone);return res.status(502).json({error:"We couldn't send your verification code. Please try again."});}
    res.json({ok:true,otpRequired:true,phone:fullPhone,message:"Verification code sent by SMS."});
  }catch(e){db.prepare("DELETE FROM vendor_application_otps WHERE whatsapp=?").run(fullPhone);console.error("[vendor-otp-send]",e.message);res.status(502).json({error:"We couldn't send your verification code. Please try again."});}
});
app.post("/api/vendors/apply/verify",(req,res)=>{
  const phone=String(req.body?.whatsapp||"").replace(/\D/g,"").replace(/^220/,""),code=String(req.body?.code||"").replace(/\D/g,"");
  if(phone.length<6||!/^\d{6}$/.test(code))return res.status(400).json({error:"Enter the 6-digit verification code sent to your phone."});
  const fullPhone="220"+phone,pending=db.prepare("SELECT * FROM vendor_application_otps WHERE whatsapp=?").get(fullPhone);
  if(!pending)return res.status(400).json({error:"No active code found. Please submit the vendor application again."});
  if(Number(pending.expires_at)<Date.now()){db.prepare("DELETE FROM vendor_application_otps WHERE whatsapp=?").run(fullPhone);return res.status(400).json({error:"That code expired. Please start again."});}
  if(Number(pending.attempts)>=5){db.prepare("DELETE FROM vendor_application_otps WHERE whatsapp=?").run(fullPhone);return res.status(429).json({error:"Too many incorrect attempts. Please start again."});}
  const expected=crypto.createHash("sha256").update(fullPhone+"|"+code+"|"+String(process.env.CUSTOMER_OTP_SECRET||process.env.BULKGATE_APPLICATION_TOKEN||"basse-otp")).digest("hex");
  if(expected!==pending.otp_hash){db.prepare("UPDATE vendor_application_otps SET attempts=attempts+1 WHERE whatsapp=?").run(fullPhone);return res.status(400).json({error:"Incorrect verification code."});}
  const b=JSON.parse(pending.payload_json);
  const existing=db.prepare("SELECT id,status FROM vendors WHERE whatsapp=? AND status!='REJECTED'").get(fullPhone);
  if(existing){db.prepare("DELETE FROM vendor_application_otps WHERE whatsapp=?").run(fullPhone);return res.status(409).json({error:`A vendor application already exists (${existing.status}).`});}
  const x=db.prepare("INSERT INTO vendors(full_name,business_name,whatsapp,email,email_verified,location,category,description,password_hash,status) VALUES(?,?,?,?,?,?,?,?,?,'PENDING')")
    .run(b.fullName,b.businessName,fullPhone,"",0,b.location,b.category,b.description,hashPin(b.password));
  db.prepare("DELETE FROM vendor_application_otps WHERE whatsapp=?").run(fullPhone);
  backupShopData("vendor-application");broadcastLive("vendors",{vendorId:Number(x.lastInsertRowid)});
  const adminNumber=String(process.env.BASSE_ADMIN_SMS_NUMBER||"").trim();
  if(adminNumber){const msg=`New vendor application #${x.lastInsertRowid}: ${b.businessName} (${b.fullName}) is awaiting approval.`;const eventKey=crypto.createHash("sha256").update("admin-vendor-application|"+String(x.lastInsertRowid)).digest("hex");void sendBulkGateSms(adminNumber,msg,{eventKey,orderId:null,messageType:"admin-vendor-application"}).catch(e=>console.error("[vendor-admin-sms]",e.message));}
  res.status(201).json({ok:true,id:Number(x.lastInsertRowid),status:"PENDING",fullName:b.fullName,businessName:b.businessName,phone,message:"Phone verified. Application submitted for Admin approval."});
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


// BASSE services, partner applications, bookings and event ticketing.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS business_partners(
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_name TEXT NOT NULL, business_name TEXT NOT NULL,
      whatsapp TEXT NOT NULL, email TEXT DEFAULT '', business_type TEXT NOT NULL,
      location TEXT DEFAULT '', description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'PENDING',
      admin_note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS service_bookings(
      id TEXT PRIMARY KEY, partner_id INTEGER, service_type TEXT NOT NULL, customer_name TEXT NOT NULL,
      customer_whatsapp TEXT NOT NULL, requested_date TEXT DEFAULT '', requested_time TEXT DEFAULT '',
      details TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'PENDING', quoted_price INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS events(
      id TEXT PRIMARY KEY, organizer_partner_id INTEGER, title TEXT NOT NULL, description TEXT DEFAULT '',
      venue TEXT NOT NULL, event_date TEXT NOT NULL, event_time TEXT DEFAULT '', flyer_url TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS event_ticket_types(
      id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, name TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 0, quantity INTEGER NOT NULL DEFAULT 0, sold INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS event_tickets(
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, ticket_type_id INTEGER NOT NULL, ticket_code TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL, customer_whatsapp TEXT NOT NULL, payment_status TEXT NOT NULL DEFAULT 'PENDING',
      ticket_status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT', checked_in_at TEXT DEFAULT NULL,
      checked_in_by TEXT DEFAULT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS event_scanners(
      id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, staff_name TEXT NOT NULL,
      scanner_token_hash TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS event_organizer_access(
      id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, organizer_name TEXT NOT NULL,
      access_token_hash TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_event_tickets_event ON event_tickets(event_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON service_bookings(status);
  `);
} catch(e) { console.error('BASSE services schema setup failed:', e.message); }

// Backward-compatible event category migration for existing SQLite databases.
try { db.exec("ALTER TABLE events ADD COLUMN category TEXT NOT NULL DEFAULT 'Music'"); } catch(e) { if(!/duplicate column/i.test(String(e.message))) console.warn('Event category migration:',e.message); }
try { db.exec("ALTER TABLE event_tickets ADD COLUMN waychit_request_id TEXT DEFAULT NULL"); } catch(e) { if(!/duplicate column/i.test(String(e.message))) console.warn('Ticket payment migration:',e.message); }
function serviceId(prefix) { return prefix + '_' + crypto.randomBytes(12).toString('hex'); }
function cleanText(v, max=300) { return String(v ?? '').trim().slice(0,max); }
app.post('/api/partners/apply', (req,res) => {
  const b=req.body||{}, name=cleanText(b.userName,100), business=cleanText(b.businessName,120),
    phone=cleanText(b.whatsapp,30), type=cleanText(b.businessType,40);
  if(!name||!business||phone.replace(/\D/g,'').length<6||!['PRODUCT_VENDOR','SALON_BARBER','TAILOR','EVENT_ORGANIZER','OTHER_SERVICE'].includes(type))
    return res.status(400).json({error:'Enter your name, business name, valid WhatsApp number and a supported business type.'});
  const r=db.prepare(`INSERT INTO business_partners(user_name,business_name,whatsapp,email,business_type,location,description)
    VALUES(?,?,?,?,?,?,?)`).run(name,business,phone,cleanText(b.email,150),type,cleanText(b.location,120),cleanText(b.description,1000));
  backupShopData('partner-application');
  res.status(201).json({ok:true,id:r.lastInsertRowid,status:'PENDING',message:'Application submitted for admin review.'});
});
app.get('/api/partners/status', (req,res) => {
  const phone=cleanText(req.query.whatsapp,30);
  if(!phone)return res.status(400).json({error:'WhatsApp number is required.'});
  res.json(db.prepare('SELECT id,business_name,business_type,status,admin_note,created_at FROM business_partners WHERE whatsapp=? ORDER BY id DESC').all(phone));
});
app.get('/api/admin/partners', guard, (req,res) => res.json(db.prepare('SELECT * FROM business_partners ORDER BY id DESC').all()));
app.patch('/api/admin/partners/:id', guard, (req,res) => {
  const status=cleanText(req.body.status,20).toUpperCase();
  if(!['APPROVED','REJECTED','NEEDS_INFO','SUSPENDED'].includes(status))return res.status(400).json({error:'Invalid partner status.'});
  const r=db.prepare('UPDATE business_partners SET status=?,admin_note=? WHERE id=?').run(status,cleanText(req.body.adminNote,1000),req.params.id);
  if(!r.changes)return res.status(404).json({error:'Partner application not found.'});
  backupShopData('partner-status');res.json({ok:true,status});
});
app.get('/api/services/events', (req,res) => {
  const rows=db.prepare(`SELECT e.*,p.business_name AS organizer FROM events e LEFT JOIN business_partners p ON p.id=e.organizer_partner_id
    WHERE e.status='APPROVED' ORDER BY e.event_date,e.event_time`).all();
  res.json(rows.map(e=>({...e,ticketTypes:db.prepare('SELECT id,name,price,quantity,sold FROM event_ticket_types WHERE event_id=? AND active=1').all(e.id)})));
});
app.post('/api/services/bookings', (req,res) => {
  const b=req.body||{}, type=cleanText(b.serviceType,40), name=cleanText(b.customerName,100), phone=cleanText(b.customerWhatsapp,30);
  if(!['SALON_BARBER','TAILOR','OTHER_SERVICE'].includes(type)||!name||phone.replace(/\D/g,'').length<6)
    return res.status(400).json({error:'Complete your name, WhatsApp number and service type.'});
  const partnerId=Number(b.partnerId)||null;
  if(partnerId&&!db.prepare("SELECT id FROM business_partners WHERE id=? AND status='APPROVED'").get(partnerId))return res.status(400).json({error:'That business is not approved.'});
  const id=serviceId('BOOK');
  db.prepare(`INSERT INTO service_bookings(id,partner_id,service_type,customer_name,customer_whatsapp,requested_date,requested_time,details)
    VALUES(?,?,?,?,?,?,?,?)`).run(id,partnerId,type,name,phone,cleanText(b.date,20),cleanText(b.time,20),cleanText(b.details,2000));
  backupShopData('service-booking');
  res.status(201).json({ok:true,id,status:'PENDING',message:'Booking/request submitted. The business will confirm availability and price.'});
});
app.get('/api/admin/service-bookings', guard, (req,res)=>res.json(db.prepare(`SELECT b.*,p.business_name FROM service_bookings b LEFT JOIN business_partners p ON p.id=b.partner_id ORDER BY b.created_at DESC`).all()));
app.patch('/api/admin/service-bookings/:id', guard, (req,res)=>{
  const status=cleanText(req.body.status,20).toUpperCase(), price=Number(req.body.quotedPrice)||0;
  if(!['CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED','PENDING'].includes(status)||price<0)return res.status(400).json({error:'Invalid booking status or quote.'});
  const r=db.prepare("UPDATE service_bookings SET status=?,quoted_price=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status,Math.round(price),req.params.id);
  if(!r.changes)return res.status(404).json({error:'Booking not found.'});
  backupShopData('booking-status');res.json({ok:true,status});
});
app.post('/api/organizer/events', (req,res)=>{
  const b=req.body||{}, partnerId=Number(b.partnerId), title=cleanText(b.title,160), venue=cleanText(b.venue,200), date=cleanText(b.date,20);
  const partner=db.prepare("SELECT id FROM business_partners WHERE id=? AND business_type='EVENT_ORGANIZER' AND status='APPROVED'").get(partnerId);
  if(!partner)return res.status(403).json({error:'An approved event-organizer partner account is required.'});
  if(!title||!venue||!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({error:'Event title, venue and valid date are required.'});
  if(!Array.isArray(b.ticketTypes)||!b.ticketTypes.length||b.ticketTypes.length>10)return res.status(400).json({error:'Add between 1 and 10 ticket types.'});
  for(const t of b.ticketTypes)if(!cleanText(t.name,60)||!Number.isInteger(Number(t.price))||Number(t.price)<0||!Number.isInteger(Number(t.quantity))||Number(t.quantity)<1)return res.status(400).json({error:'Each ticket type needs a name, non-negative Dalasi price and positive quantity.'});
  const id=serviceId('EVT'), tx=db.transaction(()=>{
    db.prepare('INSERT INTO events(id,organizer_partner_id,title,description,venue,event_date,event_time,flyer_url) VALUES(?,?,?,?,?,?,?,?)')
      .run(id,partnerId,title,cleanText(b.description,2000),venue,date,cleanText(b.time,20),cleanText(b.flyerUrl,500));
    const ins=db.prepare('INSERT INTO event_ticket_types(event_id,name,price,quantity) VALUES(?,?,?,?)');
    for(const t of b.ticketTypes)ins.run(id,cleanText(t.name,60),Number(t.price),Number(t.quantity));
  });tx();
  backupShopData('event-created');res.status(201).json({ok:true,id,status:'PENDING',message:'Event submitted for admin approval before ticket sales open.'});
});
app.post('/api/admin/events/create', guard, (req,res)=>{
  const b=req.body||{}, title=cleanText(b.title,160), venue=cleanText(b.venue,200), date=cleanText(b.date,20);
  const category=cleanText(b.category,40);
  const allowed=['Music','Football','Community Event','Gym','Trade','Other'];
  if(!title||!venue||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!allowed.includes(category))return res.status(400).json({error:'Enter event title, category, venue and a valid date.'});
  if(!Array.isArray(b.ticketTypes)||!b.ticketTypes.length||b.ticketTypes.length>12)return res.status(400).json({error:'Add between 1 and 12 ticket types.'});
  for(const t of b.ticketTypes)if(!cleanText(t.name,60)||!Number.isInteger(Number(t.price))||Number(t.price)<0||!Number.isInteger(Number(t.quantity))||Number(t.quantity)<1)return res.status(400).json({error:'Each ticket type needs a name, non-negative Dalasi price and positive quantity.'});
  const id=serviceId('EVT'), status=b.publish===false?'PENDING':'APPROVED';
  try {
    const tx=db.transaction(()=>{
      db.prepare('INSERT INTO events(id,organizer_partner_id,title,description,venue,event_date,event_time,flyer_url,status,category) VALUES(?,NULL,?,?,?,?,?,?,?,?)')
        .run(id,title,cleanText(b.description,2000),venue,date,cleanText(b.time,20),cleanText(b.flyerUrl,500),status,category);
      const ins=db.prepare('INSERT INTO event_ticket_types(event_id,name,price,quantity) VALUES(?,?,?,?)');
      for(const t of b.ticketTypes)ins.run(id,cleanText(t.name,60),Number(t.price),Number(t.quantity));
    });
    tx();backupShopData('admin-event-created');
    broadcastLive('events',{eventId:id,created:true});
    broadcastLive('notifications',{type:'event-created',eventId:id,title});
    res.status(201).json({ok:true,id,status,message:status==='APPROVED'?'Event published and visible to customers.':'Event saved as pending approval.'});
  } catch(err) {
    console.error('[event-create] Failed to save event and ticket types:',err);
    res.status(500).json({error:'The event could not be saved. Check the server log for [event-create], then retry. Your form should keep its entries.'});
  }
});
app.get('/api/admin/events', guard, (req,res)=>{const rows=db.prepare(`SELECT e.*,p.business_name AS organizer FROM events e LEFT JOIN business_partners p ON p.id=e.organizer_partner_id ORDER BY e.created_at DESC`).all();res.json(rows.map(e=>({...e,ticketTypes:db.prepare('SELECT id,name,price,quantity,sold FROM event_ticket_types WHERE event_id=? ORDER BY id').all(e.id)})));});
app.patch('/api/admin/events/:id', guard, (req,res)=>{
  const b=req.body||{}, title=cleanText(b.title,160), venue=cleanText(b.venue,200), date=cleanText(b.date,20), category=cleanText(b.category,40);
  const allowed=['Music','Football','Community Event','Gym','Trade','Other'];
  if(!title||!venue||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!allowed.includes(category))return res.status(400).json({error:'Enter event title, category, venue and a valid date.'});
  const r=db.prepare('UPDATE events SET title=?,description=?,venue=?,event_date=?,event_time=?,flyer_url=?,category=? WHERE id=?').run(title,cleanText(b.description,2000),venue,date,cleanText(b.time,20),cleanText(b.flyerUrl,500),category,req.params.id);
  if(!r.changes)return res.status(404).json({error:'Event not found.'});
  backupShopData('event-details-updated');broadcastLive('events',{eventId:req.params.id,updated:true});res.json({ok:true,message:'Event details saved.'});
});
app.post('/api/admin/events/:id/ticket-types', guard, (req,res)=>{
  const event=db.prepare('SELECT id FROM events WHERE id=?').get(req.params.id), b=req.body||{}, name=cleanText(b.name,60), price=Number(b.price), quantity=Number(b.quantity);
  const count=db.prepare('SELECT COUNT(*) AS n FROM event_ticket_types WHERE event_id=? AND active=1').get(req.params.id).n;
  if(!event)return res.status(404).json({error:'Event not found.'});
  if(count>=12)return res.status(400).json({error:'This event already has the maximum of 12 ticket types.'});
  if(!name||!Number.isInteger(price)||price<0||!Number.isInteger(quantity)||quantity<1)return res.status(400).json({error:'Enter a ticket name, price in Dalasi and quantity.'});
  const info=db.prepare('INSERT INTO event_ticket_types(event_id,name,price,quantity) VALUES(?,?,?,?)').run(req.params.id,name,price,quantity);backupShopData('event-ticket-type-added');res.status(201).json({ok:true,id:info.lastInsertRowid,message:'Ticket type added.'});
});
app.delete('/api/admin/events/:id', guard, (req,res)=>{
  const event=db.prepare('SELECT id FROM events WHERE id=?').get(req.params.id);
  if(!event)return res.status(404).json({error:'Event not found.'});
  try{
    const tx=db.transaction(()=>{
      db.prepare('DELETE FROM event_scanners WHERE event_id=?').run(event.id);
      db.prepare('DELETE FROM event_tickets WHERE event_id=?').run(event.id);
      db.prepare('DELETE FROM event_ticket_types WHERE event_id=?').run(event.id);
      db.prepare('DELETE FROM events WHERE id=?').run(event.id);
    });
    tx();backupShopData('event-deleted');broadcastLive('events',{eventId:event.id,deleted:true});
    res.json({ok:true,message:'Event and its ticket records deleted.'});
  }catch(e){console.error('Event deletion failed:',e);res.status(500).json({error:'Could not delete event. Check whether related records prevent deletion.'});}
});
app.patch('/api/admin/events/:id/status', guard, (req,res)=>{
  const status=cleanText(req.body.status,20).toUpperCase();
  if(!['APPROVED','REJECTED','CANCELLED'].includes(status))return res.status(400).json({error:'Invalid event status.'});
  const r=db.prepare('UPDATE events SET status=? WHERE id=?').run(status,req.params.id);
  if(!r.changes)return res.status(404).json({error:'Event not found.'});
  backupShopData('event-status');res.json({ok:true,status});
});
app.post('/api/events/:eventId/organizer-access', guard, (req,res)=>{
  const event=db.prepare('SELECT id,title FROM events WHERE id=?').get(req.params.eventId);
  const name=cleanText(req.body.organizerName,100);
  if(!event||!name)return res.status(400).json({error:'Choose an event and enter the organizer name.'});
  const token=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO event_organizer_access(event_id,organizer_name,access_token_hash) VALUES(?,?,?)').run(event.id,name,hash);
  backupShopData('organizer-access-created');res.status(201).json({ok:true,eventId:event.id,eventTitle:event.title,organizerName:name,token,url:'/organizer.html',message:'Share this private organizer access token securely. It is shown only once.'});
});
app.get('/api/organizer/dashboard',(req,res)=>{
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  if(token.length<32)return res.status(401).json({error:'Organizer access token required.'});
  const hash=crypto.createHash('sha256').update(token).digest('hex');
  const access=db.prepare('SELECT * FROM event_organizer_access WHERE access_token_hash=? AND active=1').get(hash);
  if(!access)return res.status(401).json({error:'Organizer access token is invalid or disabled.'});
  const event=db.prepare('SELECT id,title,category,venue,event_date,event_time,status FROM events WHERE id=?').get(access.event_id);
  const totals=db.prepare(`SELECT COUNT(*) generated,SUM(CASE WHEN payment_status='PAID' THEN 1 ELSE 0 END) paid,
    SUM(CASE WHEN ticket_status='USED' THEN 1 ELSE 0 END) checkedIn,SUM(CASE WHEN payment_status='PENDING' THEN 1 ELSE 0 END) pending
    FROM event_tickets WHERE event_id=?`).get(access.event_id);
  const ticketTypes=db.prepare(`SELECT tt.id,tt.name,tt.price,tt.quantity,tt.sold,
    SUM(CASE WHEN t.payment_status='PAID' THEN 1 ELSE 0 END) paid,
    SUM(CASE WHEN t.ticket_status='USED' THEN 1 ELSE 0 END) checkedIn
    FROM event_ticket_types tt LEFT JOIN event_tickets t ON t.ticket_type_id=tt.id WHERE tt.event_id=? GROUP BY tt.id`).all(access.event_id);
  res.json({event,totals,ticketTypes,organizerName:access.organizer_name});
});
app.post('/api/events/:eventId/tickets', async (req,res)=>{
  const b=req.body||{}, event=db.prepare("SELECT id FROM events WHERE id=? AND status='APPROVED'").get(req.params.eventId),
    type=db.prepare('SELECT * FROM event_ticket_types WHERE id=? AND event_id=? AND active=1').get(Number(b.ticketTypeId),req.params.eventId),
    name=cleanText(b.customerName,100), phone=cleanText(b.customerWhatsapp,30), qty=Number(b.quantity||1);
  if(!event||!type)return res.status(404).json({error:'Approved event or ticket type not found.'});
  if(!name||phone.replace(/\D/g,'').length<6||!Number.isInteger(qty)||qty<1||qty>10)return res.status(400).json({error:'Enter customer details and a quantity from 1 to 10.'});
  const reserve=db.transaction(()=>{
    const fresh=db.prepare('SELECT * FROM event_ticket_types WHERE id=? AND event_id=? AND active=1').get(type.id,req.params.eventId);
    if(!fresh||fresh.quantity-fresh.sold<qty)throw new Error('Not enough tickets remain for this ticket type.');
    const ids=[], ins=db.prepare(`INSERT INTO event_tickets(id,event_id,ticket_type_id,ticket_code,customer_name,customer_whatsapp)
      VALUES(?,?,?,?,?,?)`);
    for(let i=0;i<qty;i++){const id=serviceId('TKT'), code=crypto.randomBytes(24).toString('hex');ins.run(id,event.id,type.id,code,name,phone);ids.push({id,code});}
    db.prepare('UPDATE event_ticket_types SET sold=sold+? WHERE id=?').run(qty,type.id);
    return ids;
  });
  try{
    const tickets=reserve();backupShopData('ticket-reserved');
    let paymentUrl='',paymentError='';
    if(Number(type.price)>0 && process.env.WAYCHIT_API_KEY){
      try{
        const r=await fetch('https://api.waychit.com/v1/payment-requests',{method:'POST',headers:{Authorization:'Bearer '+process.env.WAYCHIT_API_KEY,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({amount:Number(type.price)*qty,description:`${qty} × ${type.name} ticket — ${req.params.eventId}`,clientReference:'TICKET:'+tickets[0].id,successRedirectUrl:PUBLIC_BASE_URL+'/services.html?payment=success&ticket='+encodeURIComponent(tickets[0].code),failureRedirectUrl:PUBLIC_BASE_URL+'/services.html?payment=failed&ticket='+encodeURIComponent(tickets[0].code)})});
        const body=await r.text();let d={};try{d=JSON.parse(body)}catch{}
        if(r.ok&&d.paymentRequest?.waychitLaunchUrl){paymentUrl=d.paymentRequest.waychitLaunchUrl;db.prepare('UPDATE event_tickets SET waychit_request_id=? WHERE id IN ('+tickets.map(()=>'?').join(',')+')').run(d.paymentRequest.id,...tickets.map(t=>t.id))}else paymentError=d.error?.message||d.message||'Waychit could not create a ticket payment.';
      }catch(e){paymentError='Waychit is temporarily unavailable.'}
    }else if(Number(type.price)>0)paymentError='Waychit API is not configured for direct ticket payments.';
    backupShopData('ticket-payment-request');broadcastLive('tickets',{eventId:event.id,ticketIds:tickets.map(t=>t.id)});broadcastLive('notifications',{type:'ticket-reservation',eventId:event.id,ticketIds:tickets.map(t=>t.id)});
    res.status(201).json({ok:true,tickets,status:'PENDING_PAYMENT',paymentUrl,paymentError,total:Number(type.price)*qty,message:paymentUrl?'Reservation created. Continue to Waychit to pay; your ticket activates after payment confirmation.':'Reservation created, but direct online payment is not available until Waychit is configured. The ticket is not valid for entry until payment is verified.'});
  }
  catch(e){res.status(409).json({error:e.message||'Could not reserve tickets.'})}
});
// Server-side QR generation avoids reliance on browser CDNs or third-party QR image services.
app.post('/api/tickets/qr', async (req,res)=>{
  const code=cleanText(req.body?.code,100);
  if(!code)return res.status(400).json({error:'Ticket code is required.'});
  try{
    const dataUrl=await QRCode.toDataURL(code,{width:320,margin:2,errorCorrectionLevel:'M',type:'image/png'});
    res.set('Cache-Control','no-store');
    res.json({ok:true,dataUrl});
  }catch(e){
    console.error('Ticket QR generation failed:',e.message);
    res.status(500).json({error:'The server could not generate this ticket QR code.'});
  }
});
app.get('/api/tickets/status/:code',(req,res)=>{
  const t=db.prepare(`SELECT t.id,t.ticket_code,t.payment_status,t.ticket_status,t.checked_in_at,e.title AS event_title,tt.name AS ticket_type,tt.price FROM event_tickets t JOIN events e ON e.id=t.event_id JOIN event_ticket_types tt ON tt.id=t.ticket_type_id WHERE t.ticket_code=?`).get(cleanText(req.params.code,100));
  if(!t)return res.status(404).json({error:'Ticket not found.'});
  res.json({ticket:{code:t.ticket_code,status:t.ticket_status,paymentStatus:t.payment_status,eventTitle:t.event_title,ticketType:t.ticket_type,price:t.price,checkedInAt:t.checked_in_at}});
});
app.get('/api/admin/events/summary', guard, (req,res)=>{
  const events=db.prepare(`SELECT e.id,e.title,e.category,e.status,e.event_date,e.venue,
    COUNT(t.id) AS tickets_generated,
    SUM(CASE WHEN t.payment_status='PAID' THEN 1 ELSE 0 END) AS tickets_paid,
    SUM(CASE WHEN t.ticket_status='USED' THEN 1 ELSE 0 END) AS tickets_checked_in,
    SUM(CASE WHEN t.payment_status='PENDING' THEN 1 ELSE 0 END) AS tickets_pending
    FROM events e LEFT JOIN event_tickets t ON t.event_id=e.id
    GROUP BY e.id ORDER BY e.event_date DESC`).all();
  res.json({totals:{events:events.length,published:events.filter(e=>e.status==='APPROVED').length,generated:events.reduce((n,e)=>n+Number(e.tickets_generated||0),0),paid:events.reduce((n,e)=>n+Number(e.tickets_paid||0),0),checkedIn:events.reduce((n,e)=>n+Number(e.tickets_checked_in||0),0)},events});
});
app.post('/api/admin/events/:eventId/physical-tickets', guard, async (req,res)=>{
  const event=db.prepare('SELECT id,title,status FROM events WHERE id=?').get(req.params.eventId);
  const typeId=Number(req.body.ticketTypeId), qty=Number(req.body.quantity);
  if(!event)return res.status(404).json({error:'Event not found.'});
  if(!Number.isInteger(qty)||qty<1||qty>300)return res.status(400).json({error:'Generate between 1 and 300 tickets per print batch.'});
  const type=db.prepare('SELECT * FROM event_ticket_types WHERE id=? AND event_id=? AND active=1').get(typeId,event.id);
  if(!type)return res.status(404).json({error:'Choose a valid ticket type for this event.'});
  try{
    // Build unique codes and QR images first; do not reserve inventory unless every QR succeeds.
    const prepared=await Promise.all(Array.from({length:qty},async()=>{const id=serviceId('TKT'),code=crypto.randomBytes(24).toString('hex');return {id,code,eventTitle:event.title,ticketType:type.name,price:type.price,status:'VALID',paymentStatus:'PAID',ticketSource:'PHYSICAL',qrDataUrl:await QRCode.toDataURL(code,{width:320,margin:2,errorCorrectionLevel:'M',type:'image/png'})}}));
    const tx=db.transaction(()=>{const fresh=db.prepare('SELECT * FROM event_ticket_types WHERE id=? AND event_id=? AND active=1').get(type.id,event.id);if(!fresh||fresh.quantity-fresh.sold<qty)throw new Error('Not enough ticket inventory remains for this ticket type. Increase the ticket quantity first.');const ins=db.prepare(`INSERT INTO event_tickets(id,event_id,ticket_type_id,ticket_code,customer_name,customer_whatsapp,payment_status,ticket_status) VALUES(?,?,?,?,?,?,?,?)`);for(const t of prepared)ins.run(t.id,event.id,type.id,t.code,'Physical ticket batch','','PAID','VALID');db.prepare('UPDATE event_ticket_types SET sold=sold+? WHERE id=?').run(qty,type.id);});
    tx();backupShopData('physical-ticket-batch');
    res.status(201).json({ok:true,event:event.title,ticketType:type.name,tickets:prepared,message:'Physical ticket batch generated. All physical tickets are marked SOLD/PAID and VALID automatically.'});
  }catch(e){console.error('Physical ticket batch generation failed:',e.message);res.status(409).json({error:e.message||'Could not generate physical tickets.'});}
});
app.get('/api/admin/tickets', guard, (req,res)=>{
  const eventId=cleanText(req.query.eventId,100);
  const rows=eventId
    ? db.prepare(`SELECT t.*,e.title AS event_title,tt.name AS ticket_type,tt.price FROM event_tickets t JOIN events e ON e.id=t.event_id JOIN event_ticket_types tt ON tt.id=t.ticket_type_id WHERE t.event_id=? ORDER BY t.created_at DESC`).all(eventId)
    : db.prepare(`SELECT t.*,e.title AS event_title,tt.name AS ticket_type,tt.price FROM event_tickets t JOIN events e ON e.id=t.event_id JOIN event_ticket_types tt ON tt.id=t.ticket_type_id ORDER BY t.created_at DESC LIMIT 500`).all();
  res.json(rows);
});
app.post('/api/admin/tickets/:id/verify-payment', guard, (req,res)=>{
  const tx=db.transaction(()=>{
    const t=db.prepare('SELECT * FROM event_tickets WHERE id=?').get(req.params.id);
    if(!t)throw new Error('Ticket not found.');
    if(t.payment_status==='PAID')return t;
    if(t.ticket_status!=='PENDING_PAYMENT')throw new Error('Ticket is not awaiting payment verification.');
    db.prepare("UPDATE event_tickets SET payment_status='PAID',ticket_status='VALID' WHERE id=?").run(t.id);
    return db.prepare('SELECT * FROM event_tickets WHERE id=?').get(t.id);
  });
  try{const t=tx();backupShopData('ticket-payment-verified');res.json({ok:true,ticket:t})}catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/events/:eventId/scanner-access', guard, (req,res)=>{
  const event=db.prepare('SELECT id FROM events WHERE id=?').get(req.params.eventId);
  const name=cleanText(req.body.staffName,100);
  if(!event||!name)return res.status(400).json({error:'Choose an event and enter scanner staff name.'});
  let token=null,hash='';for(let attempt=0;attempt<30;attempt++){const candidate=String(crypto.randomInt(10000000,100000000));const candidateHash=crypto.createHash('sha256').update(candidate).digest('hex');if(!db.prepare('SELECT 1 FROM event_scanners WHERE scanner_token_hash=?').get(candidateHash)){token=candidate;hash=candidateHash;break;}}if(!token)return res.status(500).json({error:'Could not create a unique scanner code. Please try again.'});
  db.prepare('INSERT INTO event_scanners(event_id,staff_name,scanner_token_hash) VALUES(?,?,?)').run(event.id,name,hash);
  backupShopData('scanner-created');res.status(201).json({ok:true,staffName:name,token,eventId:event.id,message:'Copy this scanner token to the staff device securely. It is shown only once.'});
});
app.post('/api/events/scan', (req,res)=>{
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  if(!/^\d{8}$/.test(token))return res.status(401).json({error:'Enter the 8-digit scanner access code.'});
  const hash=crypto.createHash('sha256').update(token).digest('hex');
  const scanner=db.prepare('SELECT * FROM event_scanners WHERE scanner_token_hash=? AND active=1').get(hash);
  if(!scanner)return res.status(401).json({error:'Scanner access is invalid or disabled.'});
  const code=cleanText(req.body.ticketCode,100);
  if(!code)return res.status(400).json({error:'Ticket QR code is missing.'});
  const tx=db.transaction(()=>{
    const t=db.prepare('SELECT * FROM event_tickets WHERE ticket_code=? AND event_id=?').get(code,scanner.event_id);
    if(!t)return {ok:false,reason:'INVALID',message:'INVALID TICKET — this QR is not for this event.',eventTitle:null,ticketType:null};
    if(t.ticket_status==='USED'){const info=db.prepare('SELECT e.title AS eventTitle,tt.name AS ticketType,tt.price FROM events e JOIN event_ticket_types tt ON tt.event_id=e.id JOIN event_tickets t ON t.ticket_type_id=tt.id WHERE t.id=?').get(t.id);return {ok:false,reason:'ALREADY_SCANNED',message:'ALREADY SCANNED — this ticket has already been used.',ticketId:t.id,eventId:t.event_id,...info,paymentStatus:t.payment_status,entryStatus:t.ticket_status};}
    if(t.payment_status!=='PAID'||t.ticket_status!=='VALID'){const info=db.prepare('SELECT e.title AS eventTitle,tt.name AS ticketType,tt.price FROM events e JOIN event_ticket_types tt ON tt.event_id=e.id JOIN event_tickets t ON t.ticket_type_id=tt.id WHERE t.id=?').get(t.id);return {ok:false,reason:'NOT_PAID',message:'PAYMENT NOT APPROVED — do not allow entry.',ticketId:t.id,eventId:t.event_id,...info,paymentStatus:t.payment_status,entryStatus:t.ticket_status};}
    const changed=db.prepare("UPDATE event_tickets SET ticket_status='USED',checked_in_at=CURRENT_TIMESTAMP,checked_in_by=? WHERE id=? AND ticket_status='VALID' AND payment_status='PAID'").run(scanner.staff_name,t.id);
    if(!changed.changes)return {ok:false,reason:'ALREADY_USED',message:'ALREADY SCANNED — this ticket has already been used.',ticketId:t.id,eventId:t.event_id};
    const info=db.prepare('SELECT e.title AS eventTitle,tt.name AS ticketType,tt.price FROM events e JOIN event_ticket_types tt ON tt.event_id=e.id JOIN event_tickets t ON t.ticket_type_id=tt.id WHERE t.id=?').get(t.id);return {ok:true,reason:'VALID',message:'VALID TICKET — ENTRY ALLOWED',ticketId:t.id,eventId:t.event_id,...info,paymentStatus:'PAID',entryStatus:'USED',checkedInAt:new Date().toISOString(),checkedInBy:scanner.staff_name};
  });
  const result=tx();if(result.ok){backupShopData('ticket-check-in');broadcastLive('tickets',{type:'ticket-check-in',ticketId:result.ticketId,eventId:result.eventId,ticketType:result.ticketType,eventTitle:result.eventTitle});broadcastLive('notifications',{type:'ticket-check-in',ticketId:result.ticketId,eventId:result.eventId});}res.status(result.ok?200:409).json(result);
});
app.get('/api/events/:eventId/attendance', guard, (req,res)=>{
  const event=db.prepare('SELECT id,title FROM events WHERE id=?').get(req.params.eventId);
  if(!event)return res.status(404).json({error:'Event not found.'});
  const totals=db.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN payment_status='PAID' THEN 1 ELSE 0 END) paid,
    SUM(CASE WHEN ticket_status='USED' THEN 1 ELSE 0 END) checkedIn FROM event_tickets WHERE event_id=?`).get(event.id);
  res.json({event,totals,ticketTypes:db.prepare('SELECT id,name,price,quantity,sold FROM event_ticket_types WHERE event_id=?').all(event.id)});
});

setInterval(()=>{try{db.prepare("DELETE FROM auth_sessions WHERE expires_at<=?").run(Date.now())}catch{}},60*60*1000);
app.listen(PORT,"0.0.0.0",()=>console.log("BASSE ONLINE SHOP running on "+PORT))
function addOrderNotification(recipientType, phone, orderId, title, message){
  try{db.prepare("INSERT INTO order_notifications(recipient_type,recipient_phone,order_id,title,message) VALUES(?,?,?,?,?)").run(recipientType,String(phone||""),orderId||null,title,message)}
  catch(e){console.error("Order notification failed:",e.message)}
}
function notifyNewOrder(order){
  if(!order)return;
  const adminMessage=`New BASSE ONLINE SHOP order #${order.id}: ${order.customer_name||"Customer"} ordered ${order.product_name} x ${order.quantity} for D${Number(order.total||0).toLocaleString()}.`;
  addOrderNotification("admin","",order.id,"🛍️ NEW ORDER",`${order.customer_name||"Customer"} (+${order.whatsapp||""}) placed ${order.product_name} × ${order.quantity} for D${Number(order.total||0).toLocaleString()}.`);
  // Optional admin SMS alert for new orders. Configure BASSE_ADMIN_SMS_NUMBER in Render.
  const adminNumber=String(process.env.BASSE_ADMIN_SMS_NUMBER||"").trim();
  if(adminNumber){
    const eventKey=crypto.createHash("sha256").update(["admin-new-order",String(order.id)].join("|")).digest("hex");
    void sendBulkGateSms(adminNumber,adminMessage,{eventKey,orderId:String(order.id),messageType:"admin-new-order"})
      .catch(e=>console.error("[bulkgate-admin-order-sms]",e.message));
  }
}
function notifyCustomerOrder(order,title,message){
  if(!order?.whatsapp)return;
  addOrderNotification("customer",order.whatsapp,order.id,title,message);
  // SMS is additive: existing in-app/WhatsApp notification behavior remains unchanged.
  // Only short transactional notifications are sent; marketing SMS must use a separate compliant flow.
  const msg=String(message||title||"").replace(/[🛍️💳📦🚚]/gu,"").trim().slice(0,300);
  const type=/PAYMENT CONFIRMED/i.test(title)?"payment":/ORDER RECEIVED/i.test(title)?"new-order":/REFUND/i.test(title)?"refund":/CANCEL/i.test(title)?"cancellation":/DELIVERY|delivered|Driver|picked up|on the way|ready for delivery/i.test(title+" "+message)?"delivery":"order-update";
  const eventKey=crypto.createHash("sha256").update([String(order.id),type,String(title||""),String(message||"")].join("|" )).digest("hex");
  void sendBulkGateSms(order.whatsapp,msg,{eventKey,orderId:String(order.id),messageType:type}).catch(e=>console.error("[bulkgate-sms]",e.message));
}

async function sendBulkGateSms(rawNumber,text,meta={}){
  if(String(process.env.BULKGATE_SMS_ENABLED||"false").toLowerCase()!=="true")return {ok:false,disabled:true};
  const applicationId=String(process.env.BULKGATE_APPLICATION_ID||"").trim();
  const applicationToken=String(process.env.BULKGATE_APPLICATION_TOKEN||"").trim();
  if(!applicationId||!applicationToken)throw new Error("BulkGate credentials are not configured");
  const number=String(rawNumber||"").replace(/[^0-9]/g,"");
  if(!/^220[0-9]{7,9}$/.test(number))throw new Error("Recipient is not a valid stored Gambian phone number");
  const dailyLimit=Math.max(1,Math.min(100,Number(process.env.BULKGATE_SMS_DAILY_LIMIT)||5));
  const sentToday=Number(db.prepare("SELECT COUNT(*) c FROM sms_send_log WHERE status='ACCEPTED' AND date(created_at)=date('now')").get().c||0);
  if(sentToday>=dailyLimit)throw new Error("Daily BASSE SMS safety limit reached");
  const eventKey=String(meta.eventKey||crypto.createHash("sha256").update(number+"|"+text).digest("hex"));
  const prior=db.prepare("SELECT status,provider_sms_id FROM sms_send_log WHERE event_key=?").get(eventKey);
  if(prior?.status==="ACCEPTED"||prior?.status==="SENDING")return {ok:true,duplicate:true,smsId:prior.provider_sms_id||null};
  if(prior)db.prepare("UPDATE sms_send_log SET status='SENDING',error_code=NULL WHERE event_key=?").run(eventKey);
  else db.prepare("INSERT INTO sms_send_log(event_key,order_id,recipient,message_type,status) VALUES(?,?,?,?, 'SENDING')").run(eventKey,meta.orderId||null,number,meta.messageType||"notification");
  try{
    const response=await fetch("https://portal.bulkgate.com/api/1.0/simple/transactional",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({application_id:applicationId,application_token:applicationToken,number,text:String(text||"").slice(0,300),...(process.env.BULKGATE_SENDER_ID?{sender_id:String(process.env.BULKGATE_SENDER_ID).trim()}:{}),...(process.env.BULKGATE_SENDER_ID_VALUE?{sender_id_value:String(process.env.BULKGATE_SENDER_ID_VALUE).trim()}:{}),duplicates_check:"on",tag:"basse-"+String(meta.messageType||"notification").slice(0,24)}) ,signal:AbortSignal.timeout(12000)});
    const body=await response.json().catch(()=>({}));
    if(!response.ok||body?.data?.status!=="accepted"){const code=String(body?.type||body?.error||response.status).slice(0,100);db.prepare("UPDATE sms_send_log SET status='FAILED',error_code=? WHERE event_key=?").run(code,eventKey);console.error("[bulkgate-sms] Provider rejected SMS",response.status,code);return {ok:false,status:response.status};}
    const smsId=String(body.data.sms_id||"");db.prepare("UPDATE sms_send_log SET status='ACCEPTED',provider_sms_id=?,sent_at=CURRENT_TIMESTAMP WHERE event_key=?").run(smsId,eventKey);return {ok:true,smsId};
  }catch(e){db.prepare("UPDATE sms_send_log SET status='FAILED',error_code=? WHERE event_key=?").run(String(e.name||"request_error").slice(0,100),eventKey);throw e;}
}
;