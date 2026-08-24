const express=require("express"),Database=require("better-sqlite3"),multer=require("multer"),path=require("path"),crypto=require("crypto"),fs=require("fs");
const app=express(),PORT=process.env.PORT||3000,ROOT=__dirname,DATA_DIR=process.env.DATA_DIR||path.join(ROOT,"data");
const PUBLIC_BASE_URL=(process.env.PUBLIC_BASE_URL||"https://basse-online-shop.onrender.com").replace(/\/$/,"");
const STATIC_WAYCHIT_URL=process.env.WAYCHIT_STATIC_URL||"https://app.waychit.com/pm/?param1=%7B%22type%22%3A%22staticPaymentRequest%22%2C%22merchantAccountId%22%3A%226a8b03204ad0d928fc3a529c%22%7D";
const SHOP_WHATSAPP=String(process.env.WHATSAPP_SUPPORT||"2206963349").replace(/\D/g,"");fs.mkdirSync(DATA_DIR,{recursive:true});fs.mkdirSync(path.join(DATA_DIR,"uploads"),{recursive:true});
app.use(express.json({limit:"2mb",verify:(req,res,buf)=>{if(req.originalUrl==="/api/waychit/webhook")req.rawBody=buf.toString("utf8")}}));
app.use("/uploads",express.static(path.join(DATA_DIR,"uploads")));
app.use("/admin",express.static(path.join(ROOT,"../admin")));app.use("/vendor",express.static(path.join(ROOT,"../vendor")));
app.use("/",express.static(path.join(ROOT,"../marketplace")));
const db=new Database(path.join(DATA_DIR,"basse-shop.db"));db.pragma("journal_mode=WAL");
db.exec(`CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,category TEXT,price INTEGER,stock INTEGER,description TEXT,image TEXT,active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,product_id INTEGER,product_name TEXT,quantity INTEGER,customer_name TEXT,whatsapp TEXT,location TEXT,total INTEGER,payment_status TEXT DEFAULT 'PENDING',order_status TEXT DEFAULT 'NEW',waychit_request_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,vendor_id INTEGER DEFAULT NULL,commission INTEGER DEFAULT 0,vendor_earnings INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS vendors(id INTEGER PRIMARY KEY AUTOINCREMENT,full_name TEXT,business_name TEXT,whatsapp TEXT,location TEXT,category TEXT,description TEXT,password_hash TEXT,status TEXT DEFAULT 'PENDING',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS vendor_products(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER,vendor_id INTEGER,status TEXT DEFAULT 'PENDING',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS customer_accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,full_name TEXT,whatsapp TEXT UNIQUE,password_hash TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payout_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,vendor_id INTEGER,amount INTEGER,status TEXT DEFAULT 'PENDING',created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
try{db.exec("ALTER TABLE products ADD COLUMN images TEXT DEFAULT ''")}catch(e){}
try{db.exec("ALTER TABLE products ADD COLUMN vendor_id INTEGER DEFAULT NULL")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN vendor_id INTEGER DEFAULT NULL")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN commission INTEGER DEFAULT 0")}catch(e){}
try{db.exec("ALTER TABLE orders ADD COLUMN vendor_earnings INTEGER DEFAULT 0")}catch(e){}
if(!db.prepare("SELECT COUNT(*) c FROM products").get().c){let q=db.prepare("INSERT INTO products(name,category,price,stock,description,image) VALUES(?,?,?,?,?,?)");[
["Premium Blue Hoodie","Fashion",850,15,"Comfortable everyday hoodie.","https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?auto=format&fit=crop&w=900&q=80"],
["Wireless Headphones","Electronics",1500,10,"Clear wireless sound.","https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80"],
["Smartphone 128GB","Phones",3290,8,"Modern 128GB smartphone.","https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=80"],
["Beauty Care Set","Beauty",450,20,"Everyday beauty care bundle.","https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=80"],
["Leather Handbag","Accessories",1200,12,"Elegant everyday handbag.","https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=80"],
["Smart Watch Pro","Electronics",2200,9,"Smart everyday watch.","https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80"]].forEach(x=>q.run(...x))}
const upload=multer({storage:multer.diskStorage({destination:path.join(DATA_DIR,"uploads"),filename:(r,f,cb)=>cb(null,crypto.randomBytes(8).toString("hex")+path.extname(f.originalname))}),limits:{fileSize:6e6}});
const sessions=new Map();function guard(req,res,next){if(!sessions.has((req.headers.authorization||"").replace("Bearer ","")))return res.status(401).json({error:"Admin login required"});next()}
function vendorGuard(req,res,next){let t=(req.headers.authorization||"").replace("Bearer ",""),s=sessions.get(t);if(!s||s.type!=="vendor")return res.status(401).json({error:"Vendor login required"});req.vendorId=s.vendorId;next()}
app.get("/api/products",(req,res)=>{let p=db.prepare("SELECT * FROM products WHERE active=1 ORDER BY id DESC").all(),c=req.query.category||"All",q=(req.query.q||"").toLowerCase();if(c!=="All")p=p.filter(x=>x.category===c);if(q)p=p.filter(x=>(x.name+" "+x.category+" "+x.description).toLowerCase().includes(q));res.json(p)});
app.get("/api/products/:id",(req,res)=>{let p=db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(req.params.id);p?res.json(p):res.status(404).json({error:"Product not found"})});
app.post("/api/admin/login",(req,res)=>{if(req.body.email===process.env.ADMIN_EMAIL&&req.body.password===process.env.ADMIN_PASSWORD){let t=crypto.randomBytes(32).toString("hex");sessions.set(t,{expires:Date.now()+432e5,type:"admin"});res.json({token:t})}else res.status(401).json({error:"Invalid admin login"})});
app.get("/api/admin/products",guard,(req,res)=>res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all()));
app.post("/api/admin/products",guard,upload.array("images",8),(req,res)=>{let b=req.body,files=req.files||[],fileImgs=files.map(f=>"/uploads/"+f.filename),img=fileImgs[0]||b.imageUrl||"",imgs=JSON.stringify(fileImgs.length?fileImgs:(b.images?String(b.images).split(",").map(x=>x.trim()).filter(Boolean):[]));
let x=db.prepare("INSERT INTO products(name,category,price,stock,description,image,images,vendor_id) VALUES(?,?,?,?,?,?,?,?)").run(b.name,b.category,+b.price,+b.stock||0,b.description||"",img,imgs,b.vendorId?+b.vendorId:null);res.json(db.prepare("SELECT * FROM products WHERE id=?").get(x.lastInsertRowid))});
app.put("/api/admin/products/:id",guard,upload.array("images",8),(req,res)=>{let p=db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id);if(!p)return res.status(404).json({error:"Product not found"});let b=req.body,files=req.files||[],fileImgs=files.map(f=>"/uploads/"+f.filename),img=fileImgs[0]||b.imageUrl||p.image,oldImgs=p.images||"[]",imgs=fileImgs.length?JSON.stringify(fileImgs):(b.images?JSON.stringify(String(b.images).split(",").map(x=>x.trim()).filter(Boolean)):oldImgs);db.prepare("UPDATE products SET name=?,category=?,price=?,stock=?,description=?,image=?,images=?,vendor_id=? WHERE id=?").run(b.name,b.category,+b.price,+b.stock,b.description||"",img,imgs,b.vendorId?+b.vendorId:p.vendor_id||null,p.id);res.json(db.prepare("SELECT * FROM products WHERE id=?").get(p.id))});
app.delete("/api/admin/products/:id",guard,(req,res)=>{db.prepare("UPDATE products SET active=0 WHERE id=?").run(req.params.id);res.json({ok:true})});
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
app.post("/api/admin/orders/:id/payment",guard,(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});if(o.payment_status==='REFUNDED'||o.payment_status==='CANCELLED')return res.status(400).json({error:'This payment is already closed.'});db.prepare("UPDATE orders SET payment_status='PAID',order_status='PROCESSING' WHERE id=?").run(req.params.id);res.json({ok:true})});
app.post("/api/admin/orders/:id/cancel-payment",guard,(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});if(o.payment_status==='PAID')return res.status(400).json({error:'A paid order cannot be cancelled. Use Refund instead.'});db.prepare("UPDATE orders SET payment_status='CANCELLED',order_status='CANCELLED' WHERE id=?").run(req.params.id);res.json({ok:true})});
app.post("/api/admin/orders/:id/refund",guard,(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});if(o.payment_status!=='PAID')return res.status(400).json({error:'Only paid orders can be marked refunded.'});db.prepare("UPDATE orders SET payment_status='REFUNDED',order_status='REFUNDED' WHERE id=?").run(req.params.id);res.json({ok:true,notice:'Order marked refunded. Complete the actual money reversal in Waychit if required.'})});
app.post("/api/admin/orders/:id/reopen",guard,(req,res)=>{let o=db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});db.prepare("UPDATE orders SET payment_status='PENDING',order_status='NEW' WHERE id=?").run(req.params.id);res.json({ok:true})});
app.patch("/api/admin/orders/:id/status",guard,(req,res)=>{let allowed=['NEW','PROCESSING','READY','DELIVERED','CANCELLED','REFUNDED'];let status=String(req.body.status||'').toUpperCase();if(!allowed.includes(status))return res.status(400).json({error:'Invalid order status'});db.prepare("UPDATE orders SET order_status=? WHERE id=?").run(status,req.params.id);res.json({ok:true})});
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
      db.prepare("UPDATE orders SET payment_status='PAID',order_status='PROCESSING' WHERE id=? AND payment_status!='REFUNDED'").run(ref);
    }
    res.sendStatus(200);
  }catch(e){res.status(400).send("Bad webhook")}
});


app.post("/api/vendor/login",(req,res)=>{
 const phone=String(req.body.whatsapp||"").replace(/\D/g,"").replace(/^220/,""),pin=String(req.body.pin||"");
 const v=db.prepare("SELECT * FROM vendors WHERE whatsapp=? AND status='APPROVED'").get("220"+phone);
 if(!v||crypto.createHash("sha256").update(pin).digest("hex")!==v.password_hash)return res.status(401).json({error:"Invalid vendor login or account not approved."});
 const t=crypto.randomBytes(32).toString("hex");sessions.set(t,{expires:Date.now()+432e5,type:"vendor",vendorId:v.id});res.json({token:t,vendor:{id:v.id,business_name:v.business_name,full_name:v.full_name}});
});
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
 res.json({ok:true,id:x.lastInsertRowid,status:"PENDING"});
});
app.get("/api/vendor/products",vendorGuard,(req,res)=>res.json(db.prepare("SELECT p.*,COALESCE(vp.status,'APPROVED') approval_status FROM products p LEFT JOIN vendor_products vp ON vp.product_id=p.id WHERE p.vendor_id=? ORDER BY p.id DESC").all(req.vendorId)));

// Vendor applications: public application, admin approval, isolated vendor data
app.post("/api/vendors/apply",(req,res)=>{
  const b=req.body||{};
  if(!String(b.fullName||"").trim()||!String(b.businessName||"").trim()||String(b.whatsapp||"").replace(/\D/g,"").length<6)return res.status(400).json({error:"Please complete your name, business name and WhatsApp number."});
  const phone=String(b.whatsapp).replace(/\D/g,"").replace(/^220/,"");
  const exists=db.prepare("SELECT id FROM vendors WHERE whatsapp=? AND status!='REJECTED'").get("220"+phone);
  if(exists)return res.status(409).json({error:"A vendor application already exists for this number."});
  const x=db.prepare("INSERT INTO vendors(full_name,business_name,whatsapp,location,category,description,password_hash) VALUES(?,?,?,?,?,?,?)").run(String(b.fullName).trim(),String(b.businessName).trim(),"220"+phone,String(b.location||""),String(b.category||""),String(b.description||""),crypto.createHash("sha256").update(String(b.password||"")).digest("hex"));
  res.json({ok:true,id:x.lastInsertRowid,message:"Application submitted. Wait for admin approval."});
});
app.get("/api/admin/vendors",guard,(req,res)=>res.json(db.prepare("SELECT * FROM vendors ORDER BY datetime(created_at) DESC").all()));
app.post("/api/admin/vendors/:id/approve",guard,(req,res)=>{db.prepare("UPDATE vendors SET status='APPROVED' WHERE id=?").run(req.params.id);res.json({ok:true})});
app.post("/api/admin/vendors/:id/reject",guard,(req,res)=>{db.prepare("UPDATE vendors SET status='REJECTED' WHERE id=?").run(req.params.id);res.json({ok:true})});
app.post("/api/admin/vendors/:id/suspend",guard,(req,res)=>{db.prepare("UPDATE vendors SET status='SUSPENDED' WHERE id=?").run(req.params.id);res.json({ok:true})});
app.get("/api/vendor/:id/products",(req,res)=>{let v=db.prepare("SELECT id FROM vendors WHERE id=? AND status='APPROVED'").get(req.params.id);if(!v)return res.status(403).json({error:"Vendor not approved"});res.json(db.prepare("SELECT * FROM products WHERE vendor_id=? ORDER BY id DESC").all(v.id))});
app.post("/api/admin/products/:id/approve",guard,(req,res)=>{db.prepare("UPDATE products SET active=1 WHERE id=?").run(req.params.id);db.prepare("UPDATE vendor_products SET status='APPROVED' WHERE product_id=?").run(req.params.id);res.json({ok:true})});
app.post("/api/admin/products/:id/reject",guard,(req,res)=>{db.prepare("UPDATE products SET active=0 WHERE id=?").run(req.params.id);db.prepare("UPDATE vendor_products SET status='REJECTED' WHERE product_id=?").run(req.params.id);res.json({ok:true})});
app.get("/api/admin/vendor-stats",guard,(req,res)=>res.json({vendors:db.prepare("SELECT COUNT(*) c FROM vendors").get().c,pending:db.prepare("SELECT COUNT(*) c FROM vendors WHERE status='PENDING'").get().c,active:db.prepare("SELECT COUNT(*) c FROM vendors WHERE status='APPROVED'").get().c,commission:db.prepare("SELECT COALESCE(SUM(commission),0) s FROM orders WHERE payment_status='PAID'").get().s}));

app.listen(PORT,"0.0.0.0",()=>console.log("BASSE ONLINE SHOP running on "+PORT));