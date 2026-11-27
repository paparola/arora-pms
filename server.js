const express=require('express'),Database=require('better-sqlite3'),crypto=require('crypto'),fs=require('fs'),path=require('path'),os=require('os');
const PORT=process.env.PORT||3000,DIR=process.env.DATA_DIR||path.join(__dirname,'data'),BK=path.join(DIR,'backups');
fs.mkdirSync(BK,{recursive:true});
const db=new Database(path.join(DIR,'arora.db'));db.pragma('journal_mode=WAL');
const TABLES=['clients','drawings','team'];
TABLES.forEach(t=>db.exec(`CREATE TABLE IF NOT EXISTS ${t}(id TEXT PRIMARY KEY,json TEXT NOT NULL)`));
db.exec('CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT)');
const meta=k=>(db.prepare('SELECT v FROM meta WHERE k=?').get(k)||{}).v,setMeta=(k,v)=>db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(k,v);
const all=t=>db.prepare(`SELECT json FROM ${t}`).all().map(r=>JSON.parse(r.json));
const hash=p=>{const s=crypto.randomBytes(16).toString('hex');return s+':'+crypto.scryptSync(p,s,32).toString('hex')};
const check=(p,h)=>{if(!h)return false;const [s,x]=h.split(':'),y=crypto.scryptSync(p,s,32),b=Buffer.from(x,'hex');return b.length==y.length&&crypto.timingSafeEqual(b,y)};
if(!meta('admin_u')){setMeta('admin_u','admin');setMeta('admin_h',hash(process.env.ADMIN_PASSWORD||'admin123'))}
// ---- backups (daily, last 30 kept) ----
const snap=name=>{const f=path.join(BK,`arora-${name}.db`);if(fs.existsSync(f))fs.unlinkSync(f);db.exec(`VACUUM INTO '${f.replace(/'/g,"''")}'`)};
const daily=()=>{try{const n=new Date().toISOString().slice(0,10);if(!fs.existsSync(path.join(BK,`arora-${n}.db`)))snap(n);
 fs.readdirSync(BK).filter(f=>/^arora-\d{4}-\d\d-\d\d\.db$/.test(f)).sort().slice(0,-30).forEach(f=>fs.unlinkSync(path.join(BK,f)))}catch(e){console.error('Backup failed',e.message)}};
daily();setInterval(daily,36e5);
// ---- auth ----
const S=new Map(),tries=new Map(),app=express();app.use(express.json({limit:'25mb'}));
const sid=req=>((req.headers.cookie||'').match(/(?:^|; )sid=([a-f0-9]+)/)||[])[1];
const auth=(req,res,next)=>{const s=S.get(sid(req));if(!s||s.exp<Date.now())return res.status(401).json({error:'login'});req.me=s;next()};
const admin=(req,res,next)=>req.me.role=='Admin'?next():res.status(403).json({error:'Admin only'});
app.post('/api/login',(req,res)=>{const t=tries.get(req.ip)||{n:0,t:Date.now()};if(Date.now()-t.t>9e5){t.n=0;t.t=Date.now()}if(t.n>=10)return res.status(429).json({error:'locked'});
 const u=String(req.body.u||'').toLowerCase(),p=String(req.body.p||'');let me=null;
 if(u==meta('admin_u')&&check(p,meta('admin_h')))me={name:'Administrator',role:'Admin'};
 else{const m=all('team').find(x=>x.u&&x.u.toLowerCase()==u);if(m&&check(p,m.ph))me={name:m.name,role:'Team'}}
 if(!me){t.n++;tries.set(req.ip,t);return res.status(401).json({error:'bad'})}
 const id=crypto.randomBytes(24).toString('hex');S.set(id,{...me,exp:Date.now()+432e5});
 res.setHeader('Set-Cookie',`sid=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`);res.json(me)});
app.post('/api/logout',(req,res)=>{S.delete(sid(req));res.setHeader('Set-Cookie','sid=; Path=/; Max-Age=0');res.json({ok:1})});
app.get('/api/me',auth,(req,res)=>res.json({name:req.me.name,role:req.me.role}));
// ---- data ----
app.get('/api/db',auth,(req,res)=>{const out={};TABLES.forEach(t=>out[t]=all(t));out.team=out.team.map(({ph,p,...x})=>x);
 if(!meta('seeded')&&req.me.role=='Admin'){out.fresh=TABLES.every(t=>!db.prepare(`SELECT 1 FROM ${t} LIMIT 1`).get());setMeta('seeded','1')}
 res.json(out)});
app.post('/api/sync',auth,(req,res)=>{const ops=Array.isArray(req.body.ops)?req.body.ops:[],A=req.me.role=='Admin';
 try{db.transaction(()=>{for(const o of ops){if(!TABLES.includes(o.c))continue;
  if(!A&&(o.c=='team'||(o.del&&o.c=='clients')))throw Object.assign(new Error('Not allowed'),{s:403});
  if(o.del){db.prepare(`DELETE FROM ${o.c} WHERE id=?`).run(String(o.id));if(o.c=='clients')db.prepare("DELETE FROM drawings WHERE json_extract(json,'$.pid')=?").run(String(o.id));continue}
  const r=o.r;if(!r||!r.id)continue;
  if(o.c=='team'){const prev=db.prepare('SELECT json FROM team WHERE id=?').get(r.id);r.ph=r.p?hash(String(r.p)):prev?JSON.parse(prev.json).ph:undefined;delete r.p}
  db.prepare(`INSERT OR REPLACE INTO ${o.c}(id,json) VALUES(?,?)`).run(String(r.id),JSON.stringify(r))}})();res.json({ok:1})}
 catch(e){res.status(e.s||400).json({error:e.message})}});
app.get('/api/backup',auth,admin,(req,res)=>{const out={};TABLES.forEach(t=>out[t]=all(t));res.setHeader('Content-Disposition',`attachment; filename="arora-backup-${new Date().toISOString().slice(0,10)}.json"`);res.json(out)});
app.post('/api/restore',auth,admin,(req,res)=>{const b=req.body;if(!TABLES.every(t=>Array.isArray(b[t])))return res.status(400).json({error:'bad'});
 snap('pre-restore-'+Date.now());
 db.transaction(()=>TABLES.forEach(t=>{db.exec(`DELETE FROM ${t}`);b[t].forEach(r=>{if(r&&r.id)db.prepare(`INSERT OR REPLACE INTO ${t}(id,json) VALUES(?,?)`).run(String(r.id),JSON.stringify(r))})}))();res.json({ok:1})});
app.post('/api/admin-password',auth,admin,(req,res)=>{const p=String(req.body.p||'');if(p.length<6)return res.status(400).json({error:'short'});setMeta('admin_h',hash(p));res.json({ok:1})});
app.use(express.static(path.join(__dirname,'public')));
app.listen(PORT,'0.0.0.0',()=>{console.log('\nARORA ARCHITECTURAL STUDIOS – Project Management System is running.\nOpen on this PC:  http://localhost:'+PORT);
 Object.values(os.networkInterfaces()).flat().filter(i=>i.family=='IPv4'&&!i.internal).forEach(i=>console.log('Other PCs open:   http://'+i.address+':'+PORT));console.log('')});
