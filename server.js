// server.js
// النسخة النهائية الشاملة
// تشغيل: npm i express express-session fs-extra multer body-parser
// node server.js

const express = require("express");
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const session = require("express-session");
const multer = require('multer');
const bodyParser = require('body-parser');

const app = express();

// ======== CONFIG ========
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const KHUTBAHS_DIR = path.join(UPLOADS_DIR, 'khutbahs');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '1234';

// إنشاء المجلدات لو لم تكن موجودة
fse.ensureDirSync(DATA_DIR);
fse.ensureDirSync(UPLOADS_DIR);
fse.ensureDirSync(KHUTBAHS_DIR);

// ======== Middleware ========
app.use(session({
    secret: 'fahd_classic_secret',
    resave:false,
    saveUninitialized:true
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/static', express.static(path.join(__dirname,'public')));

// ======== Helpers ========
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
    fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), 'utf8');
  }catch(e){
    console.error('save error', e);
  }
}

// ensure files exist
['fatwas','articles','videos','khutbahs','questions'].forEach(k => {
  if(!fs.existsSync(filePath(k))) save(k, []);
});

// ======== Multer setup ========
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

// ======== Security ========
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.isAdmin) {
        return res.redirect("/admin/login");
    }
    next();
}

// ======== Small Helpers ========
function esc(s){
  if(s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

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
  }catch(e){ return ''; }
}

function generateShortId() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

// ======== Renderer ========
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
body{background:#fafafa;font-family:'Cairo', sans-serif;color:#222;}
.header{background:white;border-bottom:1px solid #eee;padding:18px 0;}
.logo-box{display:flex;align-items:center;gap:12px;text-decoration:none;color:#000;}
.logo-circle{width:55px;height:55px;border-radius:50%;background:linear-gradient(180deg,#d7b46a 0%,#b48b32 100%);display:flex;justify-content:center;align-items:center;font-weight:700;color:white;font-size:20px;box-shadow:0 3px 10px rgba(0,0,0,.08);}
.title-main{font-size:20px;font-weight:700;}
.title-sub{font-size:13px;color:#666;}
.nav-link-custom{padding:10px 14px;border-radius:8px;color:#444;text-decoration:none;font-weight:600;}
.nav-link-custom:hover{background:#f3efe7;}
.card-modern{background:white;border:1px solid #e6e6e6;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.03);}
.section-title{font-weight:700;border-right:4px solid #c7a562;padding-right:10px;margin-bottom:18px;}
footer{text-align:center;padding:30px 0 10px;color:#777;font-size:14px;}
.btn-gold{background:#b48b32;color:white;border:none;padding:8px 16px;border-radius:10px;}
.btn-gold:hover{background:#977126;}
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
        <a href="/ask-page" class="nav-link-custom">اسأل سؤال</a>
      </nav>
      ${adminBlock}
    </div>
  </div>
</header>
<div class="container">
  <div class="row">
    <div class="col-lg-8">${bodyHtml}</div>
    <div class="col-lg-4">
      <div class="card-modern">
        <h5 class="section-title">روابط سريعة</h5>
        <ul class="list-unstyled">
          <li class="mb-2"><a href="/fatwas">الفتاوى</a></li>
          <li class="mb-2"><a href="/articles">المقالات</a></li>
          <li class="mb-2"><a href="/videos">الفيديوهات</a></li>
          <li class="mb-2"><a href="/khutab">الخطب المفرغة</a></li>
          <li class="mb-2"><a href="/ask-page">اسأل سؤال</a></li>
        </ul>
      </div>
      <div class="card-modern">
        <h5 class="section-title">عن المنصة</h5>
        <p>منصة علمية موثوقة هدفها نشر الفتاوى والمقالات والخطب بالصوت والكتابة.</p>
      </div>
    </div>
  </div>
</div>
<footer>© ${new Date().getFullYear()} فهد بن عبدالله الجربوع — جميع الحقوق محفوظة</footer>
</body>
</html>
`;
}

// ======== Routes ========

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

// ======== Fatwas Routes ========
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

// ======== Articles Routes ========
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

// ======== Videos Routes ========
app.get('/videos', (req,res)=>{
  const items = load('videos');
  const body = `<div class="classic-card"><h3 class="section-title">الفيديوهات</h3>${items.map(i=>`<div class="mb-3"><h5>${esc(i.title)}</h5><p class="meta-muted">${esc(i.createdAt||'')}</p><p><a href="/videos/${i.id}" class="btn btn-outline-brown btn-sm">مشاهدة</a></p></div>`).join('')}</div>`;
  res.send(renderClassic('الفيديوهات', body));
});
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

// ======== Khutbahs Routes ========
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

// ======== Search ========
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

// ======== Ask Page ========
app.get('/ask-page', (req,res)=>{
  const form = `<div class="classic-card"><h3 class="section-title">أرسل سؤالك</h3>
    <form action="/ask" method="POST">
