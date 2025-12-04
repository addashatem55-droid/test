// server.js
// النسخة المحسنة بتصميم كلاسيكي نجدي هادئ
// يحتوي على جميع الميزات السابقة + تصميم واجهة محسن
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
  return String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
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
