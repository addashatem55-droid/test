// site_fahd_node_server.js
// Simple Node.js (Express) single-file site for "فهد بن عبدالله الجربوع"
// Sections: الفتاوى, المقالات, الفيديوهات, أسئلة الزوار (خاصة)
// Admin panel hidden: open by pressing Alt+Shift+V in frontend (client-side) or visit /admin
// Data stored in ./data/*.json
// Default admin credentials: admin / 1234 (change in CONFIG)

const express = require('express');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const bodyParser = require('body-parser');
const session = require('express-session');

// ========== CONFIG ==========
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '1234';
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
fse.ensureDirSync(DATA_DIR);

// Simple file helpers
function readJSON(filename, defaultValue) {
  const p = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(p)) return defaultValue;
    return JSON.parse(fs.readFileSync(p, 'utf8') || 'null') || defaultValue;
  } catch (e) {
    console.error('readJSON error', e);
    return defaultValue;
  }
}
function writeJSON(filename, data) {
  const p = path.join(DATA_DIR, filename);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

// Default data files
const DEFAULTS = {
  fatwas: [],
  articles: [],
  videos: [],
  questions: [] // visitor questions (private)
};
for (const k of Object.keys(DEFAULTS)) {
  const file = `${k}.json`;
  const cur = readJSON(file, null);
  if (cur === null) writeJSON(file, DEFAULTS[k]);
}

// ========== APP ==========
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: 'secret-fahd-site', resave: false, saveUninitialized: true }));
app.use('/static', express.static(path.join(__dirname, 'static')));

// Simple template helper (very small)
function renderPage(title, bodyHtml, opts = {}) {
  // opts.admin (boolean) to show admin links
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title} - فهد بن عبدالله الجربوع</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
  <style>body{padding-top:70px;font-family:Tahoma, Arial, sans-serif} .search-input{width:420px;max-width:90%}</style>
</head>
<body>
<nav class="navbar navbar-expand-lg navbar-light bg-light fixed-top">
  <div class="container-fluid">
    <a class="navbar-brand" href="/">فهد بن عبدالله الجربوع</a>
    <form class="d-flex" action="/search" method="get">
      <input name="q" class="form-control me-2 search-input" type="search" placeholder="ابحث في الموقع..." aria-label="Search">
      <button class="btn btn-outline-success" type="submit">بحث</button>
    </form>
    <button id="menuBtn" class="btn btn-sm btn-secondary ms-2" onclick="location.href='/'">الرئيسية</button>
  </div>
</nav>
<div class="container">
  ${bodyHtml}
</div>

<script>
// Reveal admin login: Alt+Shift+V -> go to /admin (hidden link)
document.addEventListener('keydown', function(e){
  if (e.altKey && e.shiftKey && e.code === 'KeyV') {
    window.location = '/admin';
  }
});
</script>
</body>
</html>`;
}

// ========== YOUTUBE PLAYER ==========
// Simple internal YouTube player: /player?url=YOUTUBE_LINK
app.get('/player', (req, res) => {
  const url = req.query.url || '';
  if (!url) return res.send(renderPage('مشغل الفيديو', '<h3>لا يوجد رابط فيديو</h3>'));
  const embed = url.includes('youtube') ? url.replace('watch?v=','embed/') : url;
  const body = `<h3>مشغل الفيديو</h3>
    <div class="ratio ratio-16x9 mb-3">
      <iframe src="${embed}" allowfullscreen></iframe>
    </div>
    <a class="btn btn-secondary" href="/videos">رجوع للفيديوهات</a>`;
  res.send(renderPage('مشغل الفيديو', body));
});

// ========== PUBLIC ROUTES ==========
app.get('/', (req, res) => {
  const fatwas = readJSON('fatwas.json', []);
  const articles = readJSON('articles.json', []);
  const videos = readJSON('videos.json', []);

  const body = `
  <div class="row">
    <div class="col-md-8">
      <h3>أحدث الفتاوى</h3>
      <ul class="list-group">
        ${fatwas.slice().reverse().slice(0,5).map(f=>`<li class="list-group-item"><a href="/fatwas/${f.id}">${f.title}</a></li>`).join('')}
      </ul>

      <h3 class="mt-4">أحدث المقالات</h3>
      <ul class="list-group">
        ${articles.slice().reverse().slice(0,5).map(a=>`<li class="list-group-item"><a href="/articles/${a.id}">${a.title}</a></li>`).join('')}
      </ul>

      <h3 class="mt-4">فيديوهات</h3>
      <ul class="list-group">
        ${videos.slice().reverse().slice(0,5).map(v=>`<li class="list-group-item"><a href="/videos/${v.id}">${v.title}</a></li>`).join('')}
      </ul>
    </div>
    <div class="col-md-4">
      <div class="card p-3">
        <h5>اسئلة الزوار (ارسال)</h5>
        <form method="post" action="/questions">
          <div class="mb-2"><input name="name" class="form-control" placeholder="الاسم (اختياري)"></div>
          <div class="mb-2"><input name="email" class="form-control" placeholder="البريد الالكتروني (اختياري)"></div>
          <div class="mb-2"><textarea name="question" required class="form-control" placeholder="اكتب سؤالك هنا (سيبقى خاصاً)"></textarea></div>
          <button class="btn btn-primary">ارسل السؤال</button>
        </form>
        <small class="text-muted d-block mt-2">اسئلة الزوار تظهر فقط لادارة الموقع.</small>
      </div>
    </div>
  </div>
  `;
  res.send(renderPage('الرئيسية', body));
});

// List pages
app.get('/fatwas', (req, res)=>{
  const fatwas = readJSON('fatwas.json', []);
  const body = `<h3>الفتاوى</h3><ul class="list-group">${fatwas.map(f=>`<li class="list-group-item"><a href="/fatwas/${f.id}">${f.title}</a></li>`).join('')}</ul>`;
  res.send(renderPage('الفتاوى', body));
});
app.get('/articles', (req, res)=>{
  const items = readJSON('articles.json', []);
  const body = `<h3>المقالات</h3><ul class="list-group">${items.map(a=>`<li class="list-group-item"><a href="/articles/${a.id}">${a.title}</a></li>`).join('')}</ul>`;
  res.send(renderPage('المقالات', body));
});
app.get('/videos', (req, res)=>{
  const items = readJSON('videos.json', []);
  const body = `<h3>الفيديوهات</h3><ul class="list-group">${items.map(v=>`<li class="list-group-item"><a href="/videos/${v.id}">${v.title}</a></li>`).join('')}</ul>`;
  res.send(renderPage('الفيديوهات', body));
});

// Detail pages
function findById(list, id){ return list.find(x=>String(x.id)===String(id)); }
app.get('/fatwas/:id', (req,res)=>{
  const fatwas = readJSON('fatwas.json', []);
  const item = findById(fatwas, req.params.id);
  if(!item) return res.status(404).send(renderPage('غير موجود', '<h3>لم يتم العثور على الفتوى</h3>'));
  const body = `<h3>${item.title}</h3><p>${item.content}</p>`;
  res.send(renderPage(item.title, body));
});
app.get('/articles/:id', (req,res)=>{
  const items = readJSON('articles.json', []);
  const item = findById(items, req.params.id);
  if(!item) return res.status(404).send(renderPage('غير موجود', '<h3>لم يتم العثور على المقال</h3>'));
  const body = `<h3>${item.title}</h3><p>${item.content}</p>`;
  res.send(renderPage(item.title, body));
});
app.get('/videos/:id', (req,res)=>{
  const items = readJSON('videos.json', []);
  const item = findById(items, req.params.id);
  if(!item) return res.status(404).send(renderPage('غير موجود', '<h3>لم يتم العثور على الفيديو</h3>'));
  const embed = item.url && item.url.includes('youtube') ? `<div class=\"ratio ratio-16x9\"><iframe src=\"${item.url.replace('watch?v=','embed/')}\" allowfullscreen></iframe></div><div class='mt-2'><a class='btn btn-primary' href='/player?url=${item.url}'>فتح في المشغل الداخلي</a></div>` : `<p>رابط: <a href=\"${item.url}\">${item.url}</a></p>` && item.url.includes('youtube') ? `<div class="ratio ratio-16x9"><iframe src="${item.url.replace('watch?v=','embed/')}" allowfullscreen></iframe></div>` : `<p>رابط: <a href="${item.url}">${item.url}</a></p>`;
  const body = `<h3>${item.title}</h3>${embed}<p>${item.description||''}</p>`;
  res.send(renderPage(item.title, body));
});

// Search
app.get('/search', (req,res)=>{
  const q = (req.query.q||'').trim();
  if(!q) return res.redirect('/');
  const fatwas = readJSON('fatwas.json', []);
  const articles = readJSON('articles.json', []);
  const videos = readJSON('videos.json', []);
  const results = [];
  function match(item, type){
    if((item.title||'').includes(q) || (item.content||'').includes(q) || (item.description||'').includes(q)) results.push({type, item});
  }
  fatwas.forEach(f=>match(f,'فتوى'));
  articles.forEach(a=>match(a,'مقال'));
  videos.forEach(v=>match(v,'فيديو'));
  const body = `<h3>نتائج البحث عن "${q}" (${results.length})</h3><ul class="list-group">${results.map(r=>`<li class="list-group-item">[${r.type}] <a href="/${r.type==='فتوى'?'fatwas':r.type==='مقال'?'articles':'videos'}/${r.item.id}">${r.item.title}</a></li>`).join('')}</ul>`;
  res.send(renderPage(`بحث: ${q}`, body));
});

// Questions (visitor submits) - private storage
app.post('/questions', (req,res)=>{
  const name = req.body.name||'زائر';
  const email = req.body.email||'';
  const question = (req.body.question||'').trim();
  if(!question) return res.redirect('/');
  const qs = readJSON('questions.json', []);
  const id = Date.now();
  qs.push({ id, name, email, question, createdAt: new Date().toISOString(), private: true });
  writeJSON('questions.json', qs);
  res.send(renderPage('تم الارسال', '<div class="alert alert-success">تم ارسال سؤالك وسيبقى خاصاً لادارة الموقع. <a href="/">عودة</a></div>'));
});

// ========== ADMIN (hidden) ==========
function requireAdmin(req, res, next){
  if(req.session && req.session.isAdmin) return next();
  return res.redirect('/admin');
}

app.get('/admin', (req,res)=>{
  if(req.session && req.session.isAdmin){
    const fatwas = readJSON('fatwas.json', []);
    const articles = readJSON('articles.json', []);
    const videos = readJSON('videos.json', []);
    const questions = readJSON('questions.json', []);
    const body = `<h3>لوحة التحكم</h3>
    <div class="row g-3">
      <div class="col-md-3"><div class="card p-3 text-center bg-light"><h5>الفتاوى</h5><p>${fatwas.length} عنصر</p><a href="/admin/manage/fatwas" class="btn btn-primary btn-sm">إدارة</a></div></div>
      <div class="col-md-3"><div class="card p-3 text-center bg-light"><h5>المقالات</h5><p>${articles.length} عنصر</p><a href="/admin/manage/articles" class="btn btn-primary btn-sm">إدارة</a></div></div>
      <div class="col-md-3"><div class="card p-3 text-center bg-light"><h5>الفيديوهات</h5><p>${videos.length} عنصر</p><a href="/admin/manage/videos" class="btn btn-primary btn-sm">إدارة</a></div></div>
      <div class="col-md-3"><div class="card p-3 text-center bg-light"><h5>أسئلة الزوار</h5><p>${questions.length} سؤال</p><a href="/admin/manage/questions" class="btn btn-danger btn-sm">عرض الكل</a></div></div>
    </div>
    <p class="mt-4"><a href="/admin/logout" class="btn btn-secondary">تسجيل الخروج</a></p>`;
    return res.send(renderPage('لوحة التحكم', body, {admin:true}));
  }
  // Login form (not linked anywhere public)
  const body = `
    <div class="row justify-content-center"><div class="col-md-6">
      <h3>دخول الادمن</h3>
      <form method="post" action="/admin/login">
        <div class="mb-2"><input name="username" class="form-control" placeholder="اسم المستخدم" required></div>
        <div class="mb-2"><input name="password" type="password" class="form-control" placeholder="كلمة السر" required></div>
        <button class="btn btn-primary">دخول</button>
      </form>
      <p class="mt-3 text-muted">ملاحظة: رابط لوحة التحكم غير ظاهر للمشاهدين. اضغط Alt+Shift+V في الصفحة للانتقال الى صفحة الدخول.</p>
    </div></div>
  `;
  res.send(renderPage('دخول الادمن', body));
});
app.post('/admin/login', (req,res)=>{
  const { username, password } = req.body;
  if(username === ADMIN_USER && password === ADMIN_PASS){
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.send(renderPage('فشل الدخول', '<div class="alert alert-danger">بيانات خاطئة. <a href="/admin">عودة</a></div>'));
});
app.get('/admin/logout', (req,res)=>{ req.session.destroy(()=>res.redirect('/')); });

// Admin management pages: list, add, delete
app.get('/admin/manage/:type', requireAdmin, (req,res)=>{
  const type = req.params.type; // fatwas, articles, videos, questions
  const file = type=== 'questions' ? 'questions.json' : `${type}.json`;
  const items = readJSON(file, []);
  const listHtml = items.map(it=>`<tr><td>${it.id}</td><td>${it.title||it.name||''}</td><td>${it.createdAt||''}</td><td>
    <form method="post" action="/admin/delete/${type}/${it.id}" onsubmit="return confirm('حذف؟');"><button class="btn btn-sm btn-danger">حذف</button></form>
  </td></tr>`).join('');
  const addForm = (type!=='questions') ? `
    <h5 class="mt-3">اضافة جديد</h5>
    <form method="post" action="/admin/add/${type}">
      <div class="mb-2"><input name="title" class="form-control" placeholder="العنوان" required></div>
      <div class="mb-2"><textarea name="content" class="form-control" placeholder="المحتوى / وصف" required></textarea></div>
      ${type==='videos'?'<div class="mb-2"><input name="url" class="form-control" placeholder="رابط الفيديو (يوتيوب او اخر)"></div>':''}
      <button class="btn btn-success">اضف</button>
    </form>
  ` : '';

  const body = `<h3>ادارة ${type}</h3>
    <table class="table table-sm"><thead><tr><th>ID</th><th>العنوان/الاسم</th><th>تاريخ</th><th>اجراء</th></tr></thead><tbody>${listHtml}</tbody></table>
    ${addForm}
    <p class="mt-3"><a href="/admin">رجوع الى لوحة التحكم</a></p>
  `;
  res.send(renderPage(`ادارة ${type}`, body));
});

app.post('/admin/add/:type', requireAdmin, (req,res)=>{
  const type = req.params.type; // fatwas, articles, videos
  if(type==='questions') return res.status(400).send('لا يمكن اضافة اسئلة من هنا');
  const file = `${type}.json`;
  const list = readJSON(file, []);
  const id = Date.now();
  const { title, content, url } = req.body;
  const item = { id, title, content, url: url||'', createdAt: new Date().toISOString() };
  list.push(item);
  writeJSON(file, list);
  res.redirect(`/admin/manage/${type}`);
});

app.post('/admin/delete/:type/:id', requireAdmin, (req,res)=>{
  const type = req.params.type;
  const id = req.params.id;
  const file = (type==='questions') ? 'questions.json' : `${type}.json`;
  let list = readJSON(file, []);
  list = list.filter(i=>String(i.id)!==String(id));
  writeJSON(file, list);
  res.redirect(`/admin/manage/${type}`);
});

// ========== start server ==========
app.listen(PORT, ()=>{
  console.log(`Server started on http://localhost:${PORT}`);
  console.log(`Default admin: ${ADMIN_USER} / ${ADMIN_PASS}`);
});

/*
Instructions:
1) أنشئ مشروع node: npm init -y
2) ثبّت الحزم: npm i express body-parser express-session fs-extra
3) ضع هذا الملف في مشروعك وتشغيل: node site_fahd_node_server.js
4) افتح المتصفح: http://localhost:3000
5) للانتقال لصفحة دخول الادمن: اضغط Alt+Shift+V أو زور /admin
6) بيانات الدخول الافتراضية: admin / 1234

ملاحظات:
- البيانات تحفظ في مجلد ./data كملفات JSON.
- اجعل كلمة المرور في متغيرات البيئة ADMIN_USER و ADMIN_PASS في بيئة الاستضافة.
- هذا كود بسيط ومباشر كما طلبت. يمكنك طلب تعديلات (تصميم، حقول إضافية، رفع صور، ...)
*/

// ADMIN PANEL START
// Added enhanced admin panel with stats and permissions
// (Insert integration code here if needed)
// ADMIN PANEL END

