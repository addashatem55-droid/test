// server.js
// النسخة المحسنة بتصميم كلاسيكي نجدي هادئ
// تشغيل: npm i express express-session fs-extra multer helmet
// node server.js

const express = require("express");
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const session = require("express-session");
const multer = require('multer');
const helmet = require('helmet');

// ⭐ لازم يكون قبل أي use أو أي شيء
const app = express();

// ========== CONFIG ==========
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const KHUTBAHS_DIR = path.join(UPLOADS_DIR, 'khutbahs');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '1234';
const SESSION_SECRET = process.env.SESSION_SECRET || 'fahd_classic_secret';

// ensure directories exist
fse.ensureDirSync(DATA_DIR);
fse.ensureDirSync(UPLOADS_DIR);
fse.ensureDirSync(KHUTBAHS_DIR);

// ========== middlewares ==========
app.use(helmet());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: (process.env.NODE_ENV === 'production'),
    httpOnly: true
  }
}));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/static', express.static(path.join(__dirname,'public')));

// حماية لوحة التحكم
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.isAdmin) {
        return res.redirect("/admin/login");
    }
    next();
}

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
    fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), 'utf8');
  }catch(e){
    console.error('save error', e);
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if(!/\.pdf$/i.test(file.originalname)) return cb(new Error('Only PDF allowed'));
    cb(null, true);
  }
});

// ========== small helpers ==========
function esc(s){
  if(s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

// safe join to prevent path traversal when deleting files
function safeJoin(base, target) {
  const resolved = path.resolve(base, target);
  if (resolved.indexOf(path.resolve(base)) !== 0) throw new Error('Invalid path');
  return resolved;
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

  /* added consistent button styles used in templates */
  .btn-brown{
    background:#8a5b2b;
    color:white;
    border:none;
  }
  .btn-outline-brown{
    border:1px solid #8a5b2b;
    color:#8a5b2b;
    background:transparent;
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
        <a href="/ask-page" class="nav-link-custom">اسأل سؤال</a>
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

<footer>
  © ${new Date().getFullYear()} فهد بن عبدالله الجربوع — جميع الحقوق محفوظة
</footer>

</body>
</html>
`;
}


// ========== Public Routes ==========

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
  const fileUrl = item.file ? `/uploads/${item.file}` : '';
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

// Ask (questions)
app.get('/ask-page', (req,res)=>{
  const form = `<div class="classic-card"><h3 class="section-title">أرسل سؤالك</h3>
    <form action="/ask" method="POST">
      <div class="mb-2"><label>الاسم</label><input name="name" class="form-control" required></div>
      <div class="mb-2"><label>البريد الإلكتروني</label><input name="email" type="email" class="form-control" required></div>
      <div class="mb-2"><label>السؤال</label><textarea name="question" class="form-control" rows="6" required></textarea></div>
      <button class="btn btn-brown">إرسال السؤال</button>
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

  const id = Date.now(); // id داخلي (timestamp)
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

  // رابط المتابعة الكامل
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
    <div class="card-modern" style="white-space:pre`*

