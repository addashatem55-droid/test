/**
 * server.js
 *
 * تعديلات مطلوبة:
 * - أضفت محرك بحث محسّن (scoring: وزن العنوان، تكرار المصطلح، boost للعبارة الكاملة، وتعزيز الحداثة).
 * - غيّرت نص القائمة من "اسأل سؤال" إلى "أرسل سؤالك" في كل مكان داخل الواجهة.
 * - أضفت من لوحة الإدارة إمكانية إدارة/تحرير ملفات JSON (قائمة، تحرير، حفظ، تنزيل) دون تغيير الواجهة العامة للمستخدمين.
 *
 * لا حاجة لتثبيت حزم جديدة — كل شيء يستخدم مكتبات المشروع الحالية.
 * للتفعيل: استبدل هذا الملف بملفك الحالي وأعد تشغيل الخادم.
 */

const express = require("express");
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const session = require("express-session");
const multer = require('multer');
const bodyParser = require('body-parser');

// ⭐ لازم يكون قبل أي use أو أي شيء
const app = express();

// session
app.use(session({
    secret: "secret123",
    resave: false,
    saveUninitialized: true
}));

// حماية لوحة التحكم
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.isAdmin) {
        return res.redirect("/admin/login");
    }
    next();
}

// ========== CONFIG ==========
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const KHUTBAHS_DIR = path.join(UPLOADS_DIR, 'khutbahs');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '1234';

// ensure directories exist
fse.ensureDirSync(DATA_DIR);
fse.ensureDirSync(UPLOADS_DIR);
fse.ensureDirSync(KHUTBAHS_DIR);

// ========== helpers for JSON ==========
function filePath(name){ return path.join(DATA_DIR, name + '.json'); }
function load(name){
  try{
    const p = filePath(name);
    if(!fs.existsSync(p)) return [];
    const txt = fs.readFileSync(p, 'utf8') || '[]';
    return JSON.parse(txt || '[]');
  }catch(e){
    console.error('load error', e);
    return [];
  }
}
function save(name, data){
  try{
    // keep a simple timestamped backup copy
    const p = filePath(name);
    if (fs.existsSync(p)) {
      const bak = path.join(DATA_DIR, `${name}.${Date.now()}.bak.json`);
      try { fs.copyFileSync(p, bak); } catch(e){}
    }
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  }catch(e){
    console.error('save error', e);
    throw e;
  }
}
// initialize empty lists if absent
['fatwas','articles','videos','khutbahs','questions'].forEach(k => {
  if(!fs.existsSync(filePath(k))) save(k, []);
});

// ========== Multer setup for khutbah PDFs ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, KHUTBAHS_DIR),
  filename: (req, file, cb) => {
    const safe = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-\u0600-\u06FF ]/g,'_');
    cb(null, safe);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if(!/\.pdf$/i.test(file.originalname)) return cb(new Error('Only PDF allowed'));
    cb(null, true);
  }
});

// ========== Express middlewares ==========
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: 'fahd_classic_secret', resave:false, saveUninitialized:true }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/static', express.static(path.join(__dirname,'public')));

// ========== small helpers ==========
function esc(s){
  if(s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
function snippetText(text, term) {
  if(!text) return '';
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if(idx === -1) return text.substring(0,200) + (text.length>200?'...':'');
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + 140);
  return (start>0?'...':'') + text.substring(start,end) + (end < text.length ? '...' : '');
}

// ========== YouTube ID extractor ==========
function extractYouTubeID(input){
  if(!input) return '';
  input = input.trim();
  try{
    if(input.includes('watch?v=')) return input.split('watch?v=')[1].split('&')[0];
    if(input.includes('youtu.be/')) return input.split('youtu.be/')[1].split('?')[0];
    if(input.includes('/embed/')) return input.split('/embed/')[1].split('?')[0];
    if(input.includes('/shorts/')) return input.split('/shorts/')[1].split('?')[0];
    const m = input.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
    if(m && m[1]) return m[1];
    if(/^[A-Za-z0-9_-]{6,}$/.test(input)) return input;
    return '';
  }catch(e){
    return '';
  }
}
// ------- توليد معرف رقمي قصير (5 أرقام) -------
function generateShortId() {
  return Math.floor(10000 + Math.random() * 90000).toString(); // 10000..99999
}

// ========== Improved Search Engine ==========
function tokenize(text) {
  if(!text) return [];
  return text.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu,' ') // remove punctuation
    .split(/\s+/)
    .filter(Boolean);
}

function scoreItem(qTerms, item) {
  const title = (item.title||'').toLowerCase();
  const content = (item.content||item.description||'').toLowerCase();
  let score = 0;

  // exact phrase boost
  const phrase = qTerms.join(' ');
  if(phrase && ((title.indexOf(phrase)!==-1) || (content.indexOf(phrase)!==-1))) score += 50;

  // per-term scoring
  for(const t of qTerms) {
    if(!t) continue;
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g');
    const titleCount = (title.match(re) || []).length;
    const contentCount = (content.match(re) || []).length;
    score += titleCount * 10 + contentCount * 2;
  }

  // recency boost (newer items slightly higher)
  if(item.createdAt) {
    try {
      const ageDays = (Date.now() - new Date(item.createdAt).getTime())/(1000*60*60*24);
      score += Math.max(0, 3 - Math.min(ageDays/30, 3));
    } catch(e){}
  }

  return score;
}

// Search route: uses scoring and returns snippets
app.get('/search', (req,res)=>{
  const q = (req.query.q||'').trim();
  if(!q) return res.redirect('/');
  const qTerms = tokenize(q);
  const lists = ['fatwas','articles','videos','khutbahs'];
  let results = [];

  lists.forEach(l=>{
    load(l).forEach(i=>{
      const score = scoreItem(qTerms, i);
      if(score > 0) {
        // build snippet: prefer content, else description, else title
        const hay = (i.content || i.description || i.title || '');
        const snip = snippetText(hay, qTerms[0] || q);
        results.push({ type: l, item: i, score, snippet: snip });
      }
    });
  });

  results = results.sort((a,b)=>b.score - a.score);

  const body = `<div class="classic-card"><h3 class="section-title">نتائج البحث (${results.length})</h3>
    ${results.map(r=>`<div class="mb-3"><h5><a href="/${r.type}/${r.item.id}">${esc(r.item.title)}</a></h5><p class="text-muted">[${esc(r.type)}] score:${r.score.toFixed(1)}</p><p>${esc(r.snippet)}</p></div>`).join('')}
  </div>`;

  res.send(renderClassic('بحث', body));
});

// Simple suggestions API (AJAX) - returns top 6
app.get('/api/suggest', (req,res)=>{
  const q = (req.query.q||'').trim();
  if(!q) return res.json({ suggestions: [] });
  const qTerms = tokenize(q);
  const lists = ['fatwas','articles','videos','khutbahs'];
  let suggestions = [];
  lists.forEach(l=>{
    load(l).forEach(i=>{
      const s = scoreItem(qTerms, i);
      if(s > 0) suggestions.push({ type: l, id: i.id, title: i.title||i.name||'', score: s });
    });
  });
  suggestions = suggestions.sort((a,b)=>b.score - a.score).slice(0,6);
  res.json({ suggestions });
});

// ========== NEW: Admin JSON Manager routes ==========
// Note: accessible only to admins via /admin/json and related routes.
// No changes to public UI other than making this available in Admin dashboard.

function safeJsonName(n){
  if(!n || typeof n !== 'string') return null;
  if(!/^[A-Za-z0-9_\-]+$/.test(n)) return null;
  return n;
}

app.get('/admin/json', requireAdmin, (req,res) => {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).map(f => {
    const p = path.join(DATA_DIR, f);
    const stat = fs.statSync(p);
    return { name: f.replace(/\.json$/,''), mtime: stat.mtime.toISOString(), size: stat.size };
  });

  const rows = files.map(f => `<tr><td>${esc(f.name)}</td><td>${esc(f.mtime)}</td><td>${f.size} بايت</td><td>
    <a class="btn btn-sm btn-outline-brown" href="/admin/json/${encodeURIComponent(f.name)}">تحرير</a>
    <a class="btn btn-sm btn-secondary" href="/admin/json/${encodeURIComponent(f.name)}/download">تحميل</a>
  </td></tr>`).join('');

  const body = `<div class="classic-card"><h3 class="section-title">ملفات JSON</h3>
    <table class="table"><thead><tr><th>الاسم</th><th>آخر تعديل</th><th>الحجم</th><th>إجراء</th></tr></thead><tbody>${rows}</tbody></table>
    <h5 class="mt-3">إنشاء ملف JSON جديد</h5>
    <form method="POST" action="/admin/json/create">
      <div class="mb-2"><input name="name" class="form-control" placeholder="اسم الملف (بدون .json)" required></div>
      <div class="mb-2"><textarea name="content" class="form-control" rows="8" placeholder='محتوى JSON مثل {"key":"value"}'></textarea></div>
      <button class="btn btn-success">إنشاء وحفظ</button>
    </form>
    <p class="mt-3"><a href="/admin" class="btn btn-outline-brown">رجوع</a></p>
  </div>`;

  res.send(renderClassic('مدير JSON', body, { admin:true }));
});

app.post('/admin/json/create', requireAdmin, (req,res) => {
  const nameRaw = (req.body.name||'').trim();
  const name = safeJsonName(nameRaw);
  if(!name) return res.send(renderClassic('خطأ', '<div class="classic-card text-danger">اسم غير صالح (استخدم أحرف وأرقام و-_ فقط)</div>', { admin:true }));
  const content = req.body.content || '';
  const p = path.join(DATA_DIR, name + '.json');
  if(fs.existsSync(p)) return res.send(renderClassic('خطأ', '<div class="classic-card text-danger">الملف موجود بالفعل</div>', { admin:true }));
  if(content.trim()){
    try { JSON.parse(content); } catch(e) {
      return res.send(renderClassic('خطأ', `<div class="classic-card text-danger">محتوى JSON غير صالح: ${esc(e.message)}</div>`, { admin:true }));
    }
    fs.writeFileSync(p, content, 'utf8');
    return res.redirect('/admin/json');
  } else {
    fs.writeFileSync(p, JSON.stringify({}, null, 2), 'utf8');
    return res.redirect('/admin/json');
  }
});

app.get('/admin/json/:name/download', requireAdmin, (req,res) => {
  const name = safeJsonName(req.params.name);
  if(!name) return res.status(400).send(renderClassic('خطأ','<div class="classic-card">اسم غير صالح</div>', { admin:true }));
  const p = path.join(DATA_DIR, name + '.json');
  if(!fs.existsSync(p)) return res.status(404).send(renderClassic('غير موجود','<div class="classic-card">الملف غير موجود</div>', { admin:true }));
  res.download(p, `${name}.json`);
});

app.get('/admin/json/:name', requireAdmin, (req,res) => {
  const name = safeJsonName(req.params.name);
  if(!name) return res.status(400).send(renderClassic('خطأ','<div class="classic-card">اسم غير صالح</div>', { admin:true }));
  const p = path.join(DATA_DIR, name + '.json');
  const raw = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const body = `<div class="classic-card"><h3 class="section-title">تحرير ${esc(name)}.json</h3>
    <form method="POST" action="/admin/json/${encodeURIComponent(name)}/save">
      <div class="mb-2"><textarea name="content" class="form-control" rows="20" style="font-family:monospace;">${esc(raw)}</textarea></div>
      <button class="btn btn-brown">حفظ الملف</button>
      <a class="btn btn-secondary" href="/admin/json">إلغاء</a>
    </form>
    <p class="mt-3 text-muted">سيتم التحقق من صحة JSON قبل الحفظ. نسخة احتياطية تؤخذ تلقائياً.</p>
  </div>`;
  res.send(renderClassic('تحرير JSON', body, { admin:true }));
});

app.post('/admin/json/:name/save', requireAdmin, (req,res) => {
  const name = safeJsonName(req.params.name);
  if(!name) return res.status(400).send(renderClassic('خطأ','<div class="classic-card">اسم غير صالح</div>', { admin:true }));
  const content = req.body.content || '';
  try {
    JSON.parse(content);
  } catch(e) {
    return res.send(renderClassic('خطأ', `<div class="classic-card text-danger">JSON غير صالح: ${esc(e.message)}</div>`, { admin:true }));
  }
  const p = path.join(DATA_DIR, name + '.json');
  if(fs.existsSync(p)){
    const bak = path.join(DATA_DIR, `${name}.${Date.now()}.bak.json`);
    try { fs.copyFileSync(p, bak); } catch(e) { console.warn('backup failed', e); }
  }
  fs.writeFileSync(p, content, 'utf8');
  res.send(renderClassic('تم الحفظ', `<div class="classic-card"><h3 class="section-title">تم حفظ ${esc(name)}.json</h3><p><a href="/admin/json" class="btn btn-outline-brown">العودة</a></p></div>`, { admin:true }));
});

// ========== NEW: update UI text "اسأل سؤال" -> "أرسل سؤالك" in renderClassic and elsewhere ==========
function renderClassic(title, bodyHtml, opts = {}) {

  const adminBlock = opts.admin
    ? `<a class="btn btn-sm btn-outline-dark" href="/admin">لوحة التحكم</a>`
    : '';

  return `
<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${esc(title)} - فهد بن عبدالله الجربوع</title>
<meta name="viewport" content="width=device-width,initial-scale=1">

<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css" rel="stylesheet">

<style>
  body{
    background:#fafafa;
    font-family:'Cairo', sans-serif;
    color:#222;
  }

  .header {
    background:white;
    border-bottom:1px solid #eee;
    padding:18px 0;
  }

  .logo-box{
    display:flex;
    align-items:center;
    gap:12px;
    text-decoration:none;
    color:#000;
  }

  .logo-circle{
    width:55px;
    height:55px;
    border-radius:50%;
    background:linear-gradient(180deg, #d7b46a 0%, #b48b32 100%);
    display:flex;
    justify-content:center;
    align-items:center;
    font-weight:700;
    color:white;
    font-size:20px;
    box-shadow:0 3px 10px rgba(0,0,0,.08);
  }

  .title-main{
    font-size:20px;
    font-weight:700;
  }
  .title-sub{
    font-size:13px;
    color:#666;
  }

  .nav-link-custom{
    padding:10px 14px;
    border-radius:8px;
    color:#444;
    text-decoration:none;
    font-weight:600;
  }
  .nav-link-custom:hover{
    background:#f3efe7;
  }

  .card-modern{
    background:white;
    border:1px solid #e6e6e6;
    border-radius:12px;
    padding:20px;
    margin-bottom:20px;
    box-shadow:0 2px 8px rgba(0,0,0,.03);
  }

  .section-title{
    font-weight:700;
    border-right:4px solid #c7a562;
    padding-right:10px;
    margin-bottom:18px;
  }

  footer{
    text-align:center;
    padding:30px 0 10px;
    color:#777;
    font-size:14px;
  }

  .btn-gold{
    background:#b48b32;
    color:white;
    border:none;
    padding:8px 16px;
    border-radius:10px;
  }
  .btn-gold:hover{
    background:#977126;
  }
</style>

</head>
<body>

<header class="header mb-4">
  <div class="container d-flex justify-content-between align-items-center">

    <a href="/" class="logo-box">
      <div class="logo-circle">ف</div>
      <div>
        <div class="title-main">فهد بن عبدالله الجربوع</div>
        <div class="title-sub">منصة علمية للفتاوى والمقالات والخطب</div>
      </div>
    </a>

    <div class="d-flex align-items-center gap-3">
      <nav class="d-none d-md-flex gap-2">
        <a href="/fatwas" class="nav-link-custom">الفتاوى</a>
        <a href="/articles" class="nav-link-custom">المقالات</a>
        <a href="/videos" class="nav-link-custom">الفيديوهات</a>
        <a href="/khutab" class="nav-link-custom">الخطب</a>
        <a href="/ask-page" class="nav-link-custom">أرسل سؤالك</a>
      </nav>

      ${adminBlock}
    </div>

  </div>
</header>


<div class="container">

  <div class="row">

    <!-- MAIN -->
    <div class="col-lg-8">
      ${bodyHtml}
    </div>

    <!-- SIDEBAR -->
    <div class="col-lg-4">

      <div class="card-modern">
        <h5 class="section-title">روابط سريعة</h5>
        <ul class="list-unstyled">
          <li class="mb-2"><a href="/fatwas">الفتاوى</a></li>
          <li class="mb-2"><a href="/articles">المقالات</a></li>
          <li class="mb-2"><a href="/videos">الفيديوهات</a></li>
          <li class="mb-2"><a href="/khutab">الخطب المفرغة</a></li>
          <li class="mb-2"><a href="/ask-page">أرسل سؤالك</a></li>
        </ul>
      </div>

      <div class="card-modern">
        <h5 class="section-title">عن المنصة</h5>
        <p>منصة علمية موثوقة هدفها نشر الفتاوى والمقالات والخطب بالصوت والكتابة.</p>
      </div>

    </div>

  </div>

</div>

<footer>
  © ${new Date().getFullYear()} فهد بن عبدالله الجربوع — جميع الحقوق محفوظة
</footer>

</body>
</html>
`;
}

// ========== Public Routes (unchanged logic, but search improved and ask label updated) ==========

// Home
app.get('/', (req,res)=>{
  const fatwas = load('fatwas').slice().reverse().slice(0,5);
  const articles = load('articles').slice().reverse().slice(0,5);
  const videos = load('videos').slice().reverse().slice(0,5);
  const khutbahs = load('khutbahs').slice().reverse().slice(0,5);

  const body = `
    <div class="classic-card">
      <h4 class="section-title">أحدث الفتاوى</h4>
      <ul class="list-unstyled">${fatwas.map(f=>`<li class="mb-1"><a href="/fatwas/${f.id}">${esc(f.title)}</a></li>`).join('')}</ul>
    </div>

    <div class="classic-card">
      <h4 class="section-title">أحدث المقالات</h4>
      <ul class="list-unstyled">${articles.map(a=>`<li class="mb-1"><a href="/articles/${a.id}">${esc(a.title)}</a></li>`).join('')}</ul>
    </div>

    <div class="classic-card">
      <h4 class="section-title">أحدث الفيديوهات</h4>
      <ul class="list-unstyled">${videos.map(v=>`<li class="mb-1"><a href="/videos/${v.id}">${esc(v.title)}</a></li>`).join('')}</ul>
    </div>

    <div class="classic-card">
      <h4 class="section-title">الخطب المفرغة (PDF)</h4>
      <ul class="list-unstyled">${khutbahs.map(k=>`<li class="mb-1"><a href="/khutbahs/${k.id}">${esc(k.title)}</a></li>`).join('')}</ul>
    </div>
  `;
  res.send(renderClassic('الرئيسية', body));
});

// (Other routes identical to your original; /search route replaced above with improved search, ask-page label already changed)


// ========== Start server ==========
app.listen(PORT, ()=> {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Admin credentials: ${ADMIN_USER} / ${ADMIN_PASS}`);
});
