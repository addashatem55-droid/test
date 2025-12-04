// server.js
// النسخة المحسنة بتصميم كلاسيكي نجدي هادئ
// يحتوي على جميع الميزات السابقة + مدير JSON مدمج في لوحة التحكم
// تشغيل: npm i express express-session fs-extra multer body-parser
// node server.js

const express = require("express");
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const session = require("express-session");
const multer = require('multer');
const bodyParser = require('body-parser');

// ⭐ لازم يكون قبل أي use أو أي شيء
const app = express();

// ========== CONFIG ==========
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const KHUTBAHS_DIR = path.join(UPLOADS_DIR, 'khutbahs');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '1234';

// ensure directories exist
fse.ensureDirSync(DATA_DIR);
fse.ensureDirSync(UPLOADS_DIR);
fse.ensureDirSync(KHUTBAHS_DIR);
fse.ensureDirSync(BACKUPS_DIR);

// ========== helpers for JSON ==========
function filePath(name){ return path.join(DATA_DIR, name + '.json'); }
function safeName(name){
  // allow only simple filenames (no slashes, only alnum, - and _)
  if(!name || typeof name !== 'string') return null;
  if(!/^[A-Za-z0-9_\-]+$/.test(name)) return null;
  return name;
}
function listJsonFiles(){
  try{
    return fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const p = path.join(DATA_DIR, f);
        const stat = fs.statSync(p);
        return { name: f.replace(/\.json$/,'') , filename: f, mtime: stat.mtime.toISOString(), size: stat.size };
      });
  }catch(e){
    return [];
  }
}
function load(name){
  try{
    const safe = safeName(name);
    if(!safe) return [];
    const p = filePath(safe);
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
    const safe = safeName(name);
    if(!safe) throw new Error('Invalid name');
    const p = filePath(safe);
    // backup previous version
    if(fs.existsSync(p)){
      const bakName = `${safe}-${Date.now()}.json`;
      const bakPath = path.join(BACKUPS_DIR, bakName);
      fs.copyFileSync(p, bakPath);
    }
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  }catch(e){
    console.error('save error', e);
    throw e;
  }
}
function readRawJson(name){
  try{
    const safe = safeName(name);
    if(!safe) throw new Error('Invalid name');
    const p = filePath(safe);
    if(!fs.existsSync(p)) return '';
    return fs.readFileSync(p, 'utf8');
  }catch(e){
    console.error('readRawJson error', e);
    return '';
  }
}
function writeRawJson(name, text){
  try{
    const safe = safeName(name);
    if(!safe) throw new Error('Invalid name');
    const p = filePath(safe);
    // backup previous version
    if(fs.existsSync(p)){
      const bakName = `${safe}-${Date.now()}.json`;
      const bakPath = path.join(BACKUPS_DIR, bakName);
      fs.copyFileSync(p, bakPath);
    }
    fs.writeFileSync(p, text, 'utf8');
  }catch(e){
    console.error('writeRawJson error', e);
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

// ========== NEW: Classic Najdi Design renderer ==========
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

  .btn-brown, .btn-outline-brown {
    color: #5a3f1a;
    border-color: #c7a562;
  }
  .btn-brown { background: #f5efe6; border-radius:6px; }
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
        <a href="/ask-page" class="nav-link-custom">أرسل سؤال</a>
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
          <li class="mb-2"><a href="/ask-page">أرسل سؤال</a></li>
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


// ========== Public Routes (unchanged logic, with small label fixes) ==========

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

// Fatwas
app.get('/fatwas', (req,res)=>{
  const items = load('fatwas');
  const body = `<div class="classic-card"><h3 class="section-title">الفتاوى</h3>${items.map(i=>`<article class="mb-3"><h5><a href="/fatwas/${i.id}">${esc(i.title)}</a></h5><p class="meta-muted">${esc(i.createdAt||'')}</p></article>`).join('')}</div>`;
  res.send(renderClassic('الفتاوى', body));
});
app.get('/fatwas/:id', (req,res)=>{
  const item = load('fatwas').find(x=>String(x.id)===String(req.params.id));
  if(!item) return res.send(renderClassic('غير موجود','<div class="classic-card">الفتوى غير موجودة</div>'));
  res.send(renderClassic(item.title, `<div class="classic-card"><h3>${esc(item.title)}</h3><p class="meta-muted">${esc(item.createdAt||'')}</p><div>${esc(item.content)}</div></div>`));
});

// Articles
app.get('/articles', (req,res)=>{
  const items = load('articles');
  const body = `<div class="classic-card"><h3 class="section-title">المقالات</h3>${items.map(i=>`<article class="mb-3"><h5><a href="/articles/${i.id}">${esc(i.title)}</a></h5><p class="meta-muted">${esc(i.createdAt||'')}</p></article>`).join('')}</div>`;
  res.send(renderClassic('المقالات', body));
});
app.get('/articles/:id', (req,res)=>{
  const item = load('articles').find(x=>String(x.id)===String(req.params.id));
  if(!item) return res.send(renderClassic('غير موجود','<div class="classic-card">المقال غير موجود</div>'));
  res.send(renderClassic(item.title, `<div class="classic-card"><h3>${esc(item.title)}</h3><p class="meta-muted">${esc(item.createdAt||'')}</p><div>${esc(item.content)}</div></div>`));
});

// Videos list
app.get('/videos', (req,res)=>{
  const items = load('videos');
  const body = `<div class="classic-card"><h3 class="section-title">الفيديوهات</h3>${items.map(i=>`<div class="mb-3"><h5>${esc(i.title)}</h5><p class="meta-muted">${esc(i.createdAt||'')}</p><p><a href="/videos/${i.id}" class="btn btn-outline-brown btn-sm">مشاهدة</a></p></div>`).join('')}</div>`;
  res.send(renderClassic('الفيديوهات', body));
});

// Video detail with robust YouTube embed support
app.get('/videos/:id', (req,res)=>{
  const item = load('videos').find(x=>String(x.id)===String(req.params.id));
  if(!item) return res.send(renderClassic('غير موجود','<div class="classic-card">الفيديو غير موجود</div>'));

  let youtubeId = item.youtubeId || extractYouTubeID(item.url || '');
  if(!youtubeId && item.url) youtubeId = extractYouTubeID(item.url || '');

  if(!youtubeId){
    const body = `<div class="classic-card"><h3>${esc(item.title)}</h3><p>الرابط: <a href="${esc(item.url)}">${esc(item.url)}</a></p><p class="meta-muted">${esc(item.description||'')}</p></div>`;
    return res.send(renderClassic(item.title, body));
  }

  const iframeSrc = `https://www.youtube.com/embed/${youtubeId}`;
  const body = `<div class="classic-card"><h3>${esc(item.title)}</h3><p class="meta-muted">${esc(item.createdAt||'')}</p><div class="ratio ratio-16x9 ratio-vid"><iframe src="${esc(iframeSrc)}" allowfullscreen style="border:0;"></iframe></div><p class="mt-2">${esc(item.description||item.content||'')}</p></div>`;
  res.send(renderClassic(item.title, body));
});

// Khutbahs (PDF)
app.get('/khutab', (req,res)=>{
  const items = load('khutbahs');
  const body = `<div class="classic-card"><h3 class="section-title">الخطب المفرغة (PDF)</h3>${items.map(i=>`<div class="mb-3"><h5>${esc(i.title)}</h5><p><a href="/khutbahs/${i.id}" class="btn btn-outline-brown btn-sm">عرض / تحميل PDF</a></p></div>`).join('')}</div>`;
  res.send(renderClassic('الخطب المفرغة', body));
});
app.get('/khutbahs/:id', (req,res)=>{
  const item = load('khutbahs').find(x=>String(x.id)===String(req.params.id));
  if(!item) return res.send(renderClassic('غير موجود','<div class="classic-card">الخطبة غير موجودة</div>'));
  const fileUrl = item.file ? `/uploads/khutbahs/${path.basename(item.file)}` : '';
  const content = fileUrl ? `<embed src="${fileUrl}" type="application/pdf" width="100%" height="600px"/>` : `<div>${esc(item.content||'')}</div>`;
  res.send(renderClassic(item.title, `<div class="classic-card"><h3>${esc(item.title)}</h3><p class="meta-muted">${esc(item.createdAt||'')}</p>${content}</div>`));
});

// Search
app.get('/search', (req,res)=>{
  const q = (req.query.q||'').trim();
  if(!q) return res.redirect('/');
  const lists = ['fatwas','articles','videos','khutbahs'];
  const results = [];
  lists.forEach(l=>{
    load(l).forEach(i=>{
      const hay = (i.title||'') + ' ' + (i.content||i.description||'');
      if(hay.toLowerCase().includes(q.toLowerCase())) results.push({type:l, item: i});
    });
  });
  const body = `<div class="classic-card"><h3 class="section-title">نتائج البحث (${results.length})</h3><ul class="list-unstyled">${results.map(r=>`<li class="mb-1"><a href="/${r.type}/${r.item.id}">[${esc(r.type)}] ${esc(r.item.title)}</a></li>`).join('')}</ul></div>`;
  res.send(renderClassic('بحث', body));
});

// Ask (questions) - label changed to "أرسل سؤال"
app.get('/ask-page', (req,res)=>{
  const form = `<div class="classic-card"><h3 class="section-title">أرسل سؤالك</h3>
    <form action="/ask" method="POST">
      <div class="mb-2"><label>الاسم</label><input name="name" class="form-control" required></div>
      <div class="mb-2"><label>البريد الإلكتروني</label><input name="email" type="email" class="form-control" required></div>
      <div class="mb-2"><label>السؤال</label><textarea name="question" class="form-control" rows="6" required></textarea></div>
      <button class="btn btn-brown">أرسل سؤال</button>
    </form></div>`;
  res.send(renderClassic('أرسل سؤال', form));
});
app.post('/ask', (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim();
  const question = (req.body.question || '').trim();

  if (!name || !email || !question) {
    return res.send(renderClassic('خطأ', '<div class="classic-card text-danger">الرجاء تعبئة جميع الحقول</div>'));
  }

  // load existing questions (array)
  const qs = load('questions') || [];

  // توليد shortId و ضمان عدم التكرار
  let shortId = generateShortId();
  while (qs.find(q => String(q.shortId) === String(shortId))) {
    shortId = generateShortId();
  }

  const id = Date.now(); // id داخلي (timestamp) - يبقى كما في نظامك
  const item = {
    id,
    shortId,        // الحقل الجديد
    name,
    email,
    question,
    answer: '',
    status: 'new',
    createdAt: new Date().toISOString()
  };

  qs.push(item);
  save('questions', qs);

  // رابط المتابعة الكامل لمنصة الـ Render أو محلي
  const fullLink = `${req.protocol}://${req.get('host')}/question/${shortId}`;

  const body = `<div class="classic-card">
    <h3 class="section-title">تم استلام سؤالك</h3>
    <p>شكراً لك — تم استلام السؤال. يمكنك متابعة الإجابة عبر الرابط التالي:</p>
    <div style="background:#f8f8f8;padding:12px;border-radius:8px;word-break:break-all;">
      <a href="${fullLink}">${fullLink}</a>
    </div>
    <p class="mt-3"><a href="/" class="btn btn-gold">العودة للرئيسية</a></p>
  </div>`;

  res.send(renderClassic('تم الاستلام', body));
});
// صفحة عرض السؤال للزائر برابط قصير
app.get('/question/:shortId', (req, res) => {
  const shortId = String(req.params.shortId || '');
  const qs = load('questions') || [];
  const q = qs.find(x => String(x.shortId) === shortId);
  if(!q) {
    return res.status(404).send(renderClassic('غير موجود', '<div class="classic-card">السؤال غير موجود</div>'));
  }

  const answerBlock = q.answer && q.answer.trim()
    ? `<h5>الجواب:</h5><div class="card-modern" style="white-space:pre-wrap;">${esc(q.answer)}</div>`
    : `<p style="color:gray;">لم يتم الرد بعد — راجع هذا الرابط لاحقًا.</p>`;

  const body = `<div class="classic-card">
    <h3 class="section-title">سؤالك</h3>
    <p><strong>من:</strong> ${esc(q.name)}</p>
    <div class="card-modern" style="white-space:pre-wrap;">${esc(q.question)}</div>
    <div class="mt-3">${answerBlock}</div>
  </div>`;

  res.send(renderClassic('عرض السؤال', body));
});

// ========== Admin Helpers and Middleware ==========
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.isAdmin) {
        return res.redirect("/admin/login");
    }
    next();
}

// ========== Admin Routes (with JSON manager) ==========
app.get('/admin/login', (req,res)=>{
  const form = `<div class="classic-card"><h3 class="section-title">دخول المدير</h3>
    <form method="POST" action="/admin/login">
      <div class="mb-2"><input name="user" class="form-control" placeholder="اسم المستخدم" required></div>
      <div class="mb-2"><input name="pass" type="password" class="form-control" placeholder="كلمة السر" required></div>
      <button class="btn btn-brown">دخول</button>
    </form></div>`;
  res.send(renderClassic('دخول الادمن', form));
});
app.post('/admin/login', (req,res)=>{
  const u = (req.body.user||'').trim(), p = (req.body.pass||'').trim();
  if(u === ADMIN_USER && p === ADMIN_PASS){ req.session.isAdmin = true;return res.redirect('/admin'); }
  res.send(renderClassic('خطأ','<div class="classic-card text-danger">بيانات الدخول خاطئة</div>'));
});
app.get('/admin/logout', (req,res)=>{ req.session.isAdmin = false; res.redirect('/admin/login'); });

// admin dashboard
app.get('/admin', requireAdmin, (req,res)=>{
  const fatwas = load('fatwas'), articles = load('articles'), videos = load('videos'), khutbahs = load('khutbahs'), questions = load('questions');
  const jsonFiles = listJsonFiles();
  const body = `<div class="classic-card"><h3 class="section-title">لوحة التحكم</h3>
    <div class="row">
      <div class="col-md-2"><div class="card p-3"><h6>الفتاوى</h6><p class="h4">${fatwas.length}</p><a class="btn btn-sm btn-outline-brown" href="/admin/manage/fatwas">إدارة</a></div></div>
      <div class="col-md-2"><div class="card p-3"><h6>المقالات</h6><p class="h4">${articles.length}</p><a class="btn btn-sm btn-outline-brown" href="/admin/manage/articles">إدارة</a></div></div>
      <div class="col-md-2"><div class="card p-3"><h6>الفيديوهات</h6><p class="h4">${videos.length}</p><a class="btn btn-sm btn-outline-brown" href="/admin/manage/videos">إدارة</a></div></div>
      <div class="col-md-2"><div class="card p-3"><h6>الخطب</h6><p class="h4">${khutbahs.length}</p><a class="btn btn-sm btn-outline-brown" href="/admin/manage/khutbahs">إدارة</a></div></div>
      <div class="col-md-2"><div class="card p-3"><h6>الأسئلة</h6><p class="h4">${questions.length}</p><a class="btn btn-sm btn-danger" href="/admin/questions">عرض</a></div></div>
      <div class="col-md-2"><div class="card p-3"><h6>ملفات JSON</h6><p class="h4">${jsonFiles.length}</p><a class="btn btn-sm btn-outline-brown" href="/admin/json">تحرير</a></div></div>
    </div></div>`;
  res.send(renderClassic('لوحة الادمن', body, { admin:true }));
});

// generic manage page
app.get('/admin/manage/:type', requireAdmin, (req,res)=>{
  const type = req.params.type;
  const items = load(type) || [];
  let addFields = '';
  if(type === 'videos') addFields = `<div class="mb-2"><label>رابط يوتيوب أو ID</label><input name="url" class="form-control" placeholder="https://www.youtube.com/watch?v=... أو ID"></div>`;
  if(type === 'khutbahs') addFields = `<div class="mb-2"><label>رفع ملف PDF</label><input type="file" name="file" accept="application/pdf" class="form-control"></div>`;
  const rows = items.map(i=>`<tr><td>${i.id}</td><td>${esc(i.title||i.name||'')}</td><td>${esc(i.createdAt||'')}</td><td>
    <form method="post" action="/admin/delete/${type}/${i.id}" onsubmit="return confirm('حذف؟')"><button class="btn btn-sm btn-danger">حذف</button></form>
  </td></tr>`).join('');
  const addForm = (type !== 'questions') ? `<h5 class="mt-3">إضافة جديد</h5>
    <form method="post" action="/admin/add/${type}" ${type==='khutbahs'?'enctype="multipart/form-data"':''}>
      <div class="mb-2"><input name="title" class="form-control" placeholder="العنوان" required></div>
      <div class="mb-2"><textarea name="content" class="form-control" placeholder="المحتوى / الوصف"></textarea></div>
      ${addFields}
      <button class="btn btn-success">إضافة</button>
    </form>` : '';
  const body = `<h3>إدارة ${esc(type)}</h3>
    <table class="table"><thead><tr><th>ID</th><th>العنوان</th><th>تاريخ</th><th>إجراء</th></tr></thead><tbody>${rows}</tbody></table>
    ${addForm}
    <p><a href="/admin" class="btn btn-outline-brown">رجوع</a></p>`;
  res.send(renderClassic('ادارة '+type, body, { admin:true }));
});

// handle add khutbah (with file)
app.post('/admin/add/khutbahs', requireAdmin, upload.single('file'), (req,res)=>{
  const list = load('khutbahs') || [];
  const id = Date.now();
  list.push({ id, title: req.body.title, content: req.body.content||'', file: req.file ? path.join('khutbahs', path.basename(req.file.path)) : '', createdAt: new Date().toISOString() });
  save('khutbahs', list);
  res.redirect('/admin/manage/khutbahs');
});

// handle add generic (videos processing improved)
app.post('/admin/add/:type', requireAdmin, (req,res)=>{
  const type = req.params.type;
  if(type === 'questions') return res.status(400).send('غير مسموح');
  const list = load(type) || [];
  const id = Date.now();
  let item = { id, title: req.body.title, content: req.body.content||'', createdAt: new Date().toISOString() };

  if(type === 'videos'){
    const url = (req.body.url||'').trim();
    const youtubeId = extractYouTubeID(url);
    item.url = url;
    if(youtubeId) item.youtubeId = youtubeId;
  }

  list.push(item);
  save(type, list);
  res.redirect('/admin/manage/'+type);
});

app.post('/admin/delete/:type/:id', requireAdmin, (req,res)=>{
  const type = req.params.type;
  let list = load(type) || [];
  list = list.filter(i => String(i.id) !== String(req.params.id));
  save(type, list);
  res.redirect('/admin/manage/'+type);
});

// admin questions list
app.get('/admin/questions', requireAdmin, (req,res)=>{
  const qs = load('questions') || [];
  const rows = qs.map(q=>`<tr><td>${q.id}</td><td>${esc(q.name)}</td><td>${esc(q.email)}</td><td>${esc((q.question||'').substring(0,80))}...</td><td>${esc(q.createdAt||'')}</td><td><a class="btn btn-sm btn-primary" href="/admin/question/${q.id}">عرض</a></td></tr>`).join('');
  const body = `<div class="classic-card"><h3 class="section-title">أسئلة الزوار</h3><table class="table"><thead><tr><th>ID</th><th>الاسم</th><th>البريد</th><th>مقتطف</th><th>التاريخ</th><th>عرض</th></tr></thead><tbody>${rows}</tbody></table><p><a href="/admin" class="btn btn-outline-brown">رجوع</a></p></div>`;
  res.send(renderClassic('اسئلة الزوار', body, { admin:true }));
});

// detailed question view with options
app.get('/admin/question/:id', requireAdmin, (req,res)=>{
  const qs = load('questions') || [];
  const q = qs.find(x => String(x.id) === String(req.params.id));
  if(!q) return res.send(renderClassic('خطأ','<div class="classic-card">السؤال غير موجود</div>', { admin:true }));
  const replyBlock = q.answer ? `<h5>الرد:</h5><div class="p-2" style="background:#e9ffe9;white-space:pre-wrap;">${esc(q.answer)}</div>` : '';
  const body = `<div class="classic-card"><h4 class="section-title">عرض السؤال</h4>
    <p><strong>الاسم:</strong
> ${esc(q.name)}<br><strong>البريد:</strong> ${esc(q.email)}<br><strong>التاريخ:</strong> ${esc(q.createdAt)}</p> 
<p><strong>رابط المتابعة:</strong> <a href="/question/${q.shortId}">/question/${q.shortId}</a></p>

    <h5>السؤال:</h5><div class="p-2" style="background:#f8f8f0;white-space:pre-wrap;">${esc(q.question)}</div>
    ${replyBlock}
    <div class="mt-3">
      <a class="btn btn-success" href="/admin/question/${q.id}/reply">رد</a>
      <a class="btn btn-primary" href="/admin/question/${q.id}/tofatwa">تحويل إلى فتوى</a>
      <a class="btn btn-danger" href="/admin/question/${q.id}/delete" onclick="return confirm('حذف؟')">حذف</a>
      <a class="btn btn-secondary" href="/admin/questions">رجوع</a>
    </div>
  </div>`;
  res.send(renderClassic('عرض السؤال', body, { admin:true }));
});

app.get('/admin/question/:id/reply', requireAdmin, (req,res)=>{
  const qs = load('questions') || [];
  const q = qs.find(x => String(x.id) === String(req.params.id));
  if(!q) return res.send(renderClassic('خطأ','<div class="classic-card">السؤال غير موجود</div>', { admin:true }));
  const body = `<div class="classic-card"><h4 class="section-title">الرد على السؤال</h4>
    <form method="POST" action="/admin/question/${q.id}/reply">
      <div class="mb-2"><textarea name="answer" class="form-control" rows="6">${esc(q.answer||'')}</textarea></div>
      <button class="btn btn-brown">حفظ الرد</button>
      <a class="btn btn-secondary" href="/admin/question/${q.id}">إلغاء</a>
    </form></div>`;
  res.send(renderClassic('رد على السؤال', body, { admin:true }));
});

app.post('/admin/question/:id/reply', requireAdmin, (req,res)=>{
  const qs = load('questions') || [];
  const idx = qs.findIndex(x => String(x.id) === String(req.params.id));
  if(idx === -1) return res.send(renderClassic('خطأ','<div class="classic-card">السؤال غير موجود</div>', { admin:true }));
  qs[idx].answer = req.body.answer || '';
  qs[idx].answeredAt = new Date().toISOString();
  qs[idx].status = 'answered';
  save('questions', qs);
  res.redirect('/admin/question/' + req.params.id);
});

app.get('/admin/question/:id/delete', requireAdmin, (req,res)=>{
  let qs = load('questions') || [];
  qs = qs.filter(x => String(x.id) !== String(req.params.id));
  save('questions', qs);
  res.redirect('/admin/questions');
});

app.get('/admin/question/:id/tofatwa', requireAdmin, (req,res)=>{
  const qs = load('questions') || [];
  const q = qs.find(x => String(x.id) === String(req.params.id));
  if(!q) return res.send(renderClassic('خطأ','<div class="classic-card">السؤال غير موجود</div>', { admin:true }));
  const fatwas = load('fatwas') || [];
  fatwas.push({ id: Date.now(), title: `سؤال من: ${q.name}`, content: `${q.question}\n\n---\nالجواب:\n${q.answer||'لم يتم الرد بعد'}`, createdAt: new Date().toISOString() });
  save('fatwas', fatwas);
  res.redirect('/admin/manage/fatwas');
});

// ========== JSON Files Manager (Admin) ==========

// list JSON files
app.get('/admin/json', requireAdmin, (req, res) => {
  const files = listJsonFiles();
  const rows = files.map(f => `<tr><td>${esc(f.name)}</td><td>${esc(f.mtime)}</td><td>${f.size} بايت</td><td>
    <a class="btn btn-sm btn-outline-brown" href="/admin/json/${encodeURIComponent(f.name)}">تحرير</a>
    <a class="btn btn-sm btn-secondary" href="/admin/json/${encodeURIComponent(f.name)}/download">تحميل</a>
    </td></tr>`).join('');
  const body = `<div class="classic-card"><h3 class="section-title">ملفات JSON في ${esc(DATA_DIR)}</h3>
    <table class="table"><thead><tr><th>الاسم</th><th>آخر تعديل</th><th>الحجم</th><th>إجراء</th></tr></thead><tbody>${rows}</tbody></table>

    <h5 class="mt-3">إنشاء ملف JSON جديد</h5>
    <form method="POST" action="/admin/json/create">
      <div class="mb-2"><input name="name" class="form-control" placeholder="اسم الملف (بدون .json)" required></div>
      <div class="mb-2"><textarea name="content" class="form-control" rows="8" placeholder='محتوى JSON مثل {"key":"value"}'></textarea></div>
      <button class="btn btn-success">إنشاء وحفظ</button>
    </form>

    <p class="mt-3"><a href="/admin" class="btn btn-outline-brown">رجوع</a></p>
  </div>`;
  res.send(renderClassic('مدير ملفات JSON', body, { admin:true }));
});

// download raw json
app.get('/admin/json/:name/download', requireAdmin, (req, res) => {
  const name = safeName(req.params.name);
  if(!name) return res.status(400).send(renderClassic('خطأ','<div class="classic-card">اسم غير صالح</div>', { admin:true }));
  const p = filePath(name);
  if(!fs.existsSync(p)) return res.status(404).send(renderClassic('غير موجود','<div class="classic-card">الملف غير موجود</div>', { admin:true }));
  res.download(p, `${name}.json`);
});

// view/edit a json file (raw)
app.get('/admin/json/:name', requireAdmin, (req, res) => {
  const name = safeName(req.params.name);
  if(!name) return res.status(400).send(renderClassic('خطأ','<div class="classic-card">اسم غير صالح</div>', { admin:true }));
  const raw = readRawJson(name);
  const body = `<div class="classic-card"><h3 class="section-title">تحرير ${esc(name)}.json</h3>
    <form method="POST" action="/admin/json/${encodeURIComponent(name)}/save">
      <div class="mb-2"><textarea name="content" class="form-control" rows="20" style="font-family:monospace;">${esc(raw)}</textarea></div>
      <button class="btn btn-brown">حفظ الملف</button>
      <a class="btn btn-secondary" href="/admin/json">إلغاء</a>
    </form>

    <p class="mt-3 text-muted">سيتم التحقق من صحة JSON قبل الحفظ. قبل أي تغيير، يتم أخذ نسخة احتياطية تلقائياً في مجلد backups.</p>
  </div>`;
  res.send(renderClassic('تحرير JSON', body, { admin:true }));
});

// save json file (validate JSON, backup previous)
app.post('/admin/json/:name/save', requireAdmin, (req, res) => {
  const name = safeName(req.params.name);
  if(!name) return res.status(400).send(renderClassic('خطأ','<div class="classic-card">اسم غير صالح</div>', { admin:true }));

  const content = req.body.content || '';
  // validate JSON
  try{
    JSON.parse(content);
  }catch(e){
    const body = `<div class="classic-card"><h3 class="section-title">خطأ في JSON</h3>
      <p class="text-danger">تعذر حفظ الملف — JSON غير صالح:</p>
      <pre style="background:#fff6f6;padding:12px;border-radius:8px;color:#a33;">${esc(e.message)}</pre>
      <p><a href="/admin/json/${encodeURIComponent(name)}" class="btn btn-secondary">العودة والتصحيح</a></p>
    </div>`;
    return res.send(renderClassic('خطأ في JSON', body, { admin:true }));
  }

  try{
    writeRawJson(name, content);
    const body = `<div class="classic-card"><h3 class="section-title">تم الحفظ</h3>
      <p>تم حفظ <strong>${esc(name)}.json</strong> بنجاح. تم أخذ نسخة احتياطية من النسخة السابقة.</p>
      <p><a href="/admin/json" class="btn btn-outline-brown">العودة لقائمة الملفات</a></p>
    </div>`;
    return res.send(renderClassic('تم الحفظ', body, { admin:true }));
  }catch(e){
    return res.send(renderClassic('خطأ','<div class="classic-card text-danger">خطأ عند الحفظ</div>', { admin:true }));
  }
});

// create new json
app.post('/admin/json/create', requireAdmin, (req, res) => {
  const name = safeName((req.body.name||'').trim());
  const content = req.body.content || '';
  if(!name) return res.status(400).send(renderClassic('خطأ','<div class="classic-card">اسم ملف غير صالح، استخدم أحرف وأرقام و-_ فقط</div>', { admin:true }));
  const p = filePath(name);
  if(fs.existsSync(p)) return res.send(renderClassic('خطأ','<div class="classic-card text-danger">الملف موجود بالفعل</div>', { admin:true }));
  // validate JSON if provided, otherwise create empty object
  if(content.trim()){
    try{ JSON.parse(content); } catch(e){
      return res.send(renderClassic('خطأ','<div class="classic-card text-danger">محتوى JSON غير صالح: '+esc(e.message)+'</div>', { admin:true }));
    }
    try{
      writeRawJson(name, content);
      return res.redirect('/admin/json');
    }catch(e){
      return res.send(renderClassic('خطأ','<div class="classic-card text-danger">فشل إنشاء الملف</div>', { admin:true }));
    }
  }else{
    try{
      save(name, {}); // empty object
      return res.redirect('/admin/json');
    }catch(e){
      return res.send(renderClassic('خطأ','<div class="classic-card text-danger">فشل إنشاء الملف</div>', { admin:true }));
    }
  }
});

// ========== Start server ==========
app.listen(PORT, ()=> {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Admin credentials: ${ADMIN_USER} / ${ADMIN_PASS}`);
});
