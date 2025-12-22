Robot
Hey addashatem55, Quick input needed :

تفضل! هذا هو الكود الكامل المدموج في ملف واحد (928 سطر).
📋 ملخص سريع:
🎨 التعديلات الرئيسية في CSS (من السطر 272-350):

/* الدائرة الذهبية - مكبرة */
.logo-circle { 
  width: 80px;      /* كانت 50px */
  height: 80px;
  font-size: 36px;  /* كانت 20px */
}

/* اسم فهد بن عبدالله الجربوع - مكبر */
.title-main { 
  font-size: 28px;  /* كانت 18px */
}

/* النص الفرعي - مكبر */
.title-sub { 
  font-size: 16px;  /* كانت 12px */
}

/* روابط القائمة - مكبرة */
.nav-link-custom { 
  font-size: 17px;
  padding: 14px 18px;  /* كانت 10px 14px */
}

🚀 للتشغيل:

    احفظ الكود في ملف اسمه server.js
    ثبت الحزم المطلوبة:

npm install express express-session fs-extra multer body-parser helmet express-rate-limit sanitize-html

    شغل التطبيق:

node server.js

    افتح المتصفح:

http://localhost:3001

🔐 بيانات الدخول للإدارة:

    Username: admin
    Password: 1234

الكود جاهز للاستخدام مباشرة! 🎉
Dec 22, 09:51 PM

ما عطيطني الكود كامل
Dec 22, 09:55 PM
Robot
Hey addashatem55, Quick input needed :
Ask QuestionAgent will continue working after your reply

حاضر! سأعطيك الكود الكامل هنا:

/**
 * server.js
 *
 * - Supabase removed entirely.
 * - aws-sdk and multer-s3 removed.
 * - Local disk uploads removed.
 * - Khutbah (PDF) uploads are stored in-memory (base64) inside the khutbahs JSON records.
 *   This avoids using S3, local disk, or Supabase. (Be aware: storing large files in JSON uses memory/disk in your repo.)
 * - Viewing a khutbah streams the PDF from the stored base64.
 *
 * Improvements / fixes applied:

minimal).
 * - Defensive checks & clearer admin messages when collections are empty.
 * - Small code cleanups and more robust error logging.
 * - Enhanced RTL support with better styling
 * - ENHANCED SIZES: Larger logo, name, subtitle, and navigation menu items
 *
 * Note: keep monitoring data growth when storing base64 PDFs inside the JSON files.
 *
 * Install recommended deps:
 * npm install express express-session fs-extra multer body-parser helmet express-rate-limit sanitize-html
 *
 * Run:
 * node server.js
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const session = require('express-session');
const multer = require('multer');
const bodyParser = require('body-parser');

// Optional safe requires
let helmetPkg = null;
try { helmetPkg = require('helmet'); } catch (e) { console.warn('Optional: helmet not installed'); }

let rateLimitPkg = null;
try { rateLimitPkg = require('express-rate-limit'); } catch (e) { console.warn('Optional: express-rate-limit not installed'); }

let sanitizeHtmlPkg = null;
try { sanitizeHtmlPkg = require('sanitize-html'); } catch (e) {
  console.warn('Optional: sanitize-html not installed — using fallback sanitizer');
  sanitizeHtmlPkg = null;
}
function sanitizeHtmlSafe(input) {
  if (input === undefined || input === null) return '';
  if (sanitizeHtmlPkg) {
    try {
      // Allow a small safe subset for content formatting
      return sanitizeHtmlPkg(String(input), {
        allowedTags: ['b','i','strong','em','u','p','br','ul','ol','li','a','h3','h4','h5','blockquote','pre'],
        allowedAttributes: {
          a: ['href','target','rel']
        },
        transformTags: {
          'a': function(tagName, attribs) {
            // enforce safe attributes
            const href = attribs.href || '';
            return {
              tagName: 'a',
              attribs: {
                href: href,
                target: '_blank',
                rel: 'noopener noreferrer'
              }
            };
          }
        }
      });
    } catch (e) { console.warn('sanitize-html failed — fallback'); }
  }
  return String(input).replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const app = express();

// Security & rate limiting (if available)
if (helmetPkg) {
  try { app.use(helmetPkg()); } catch (e) { console.warn('helmet() failed', e && e.message ? e.message : e); }
}
app.set('trust proxy', 1);
if (rateLimitPkg) {
  try { app.use(rateLimitPkg({ windowMs: 10 * 1000, max: 30 })); } catch (e) { console.warn('rateLimit failed', e && e.message ? e.message : e); }
}

// CONFIG
const PORT = process.env.PORT || 3001;
const USE_PERSISTENT_DISK = (process.env.USE_PERSISTENT_DISK || 'false').toLowerCase() === 'true';
const PERSISTENT_DATA_PATH = process.env.PERSISTENT_DATA_PATH || '';
const BASE_DATA_DIR = USE_PERSISTENT_DISK && PERSISTENT_DATA_PATH ? path.join(PERSISTENT_DATA_PATH, 'data') : path.join(__dirname, 'data');

const DATA_DIR = BASE_DATA_DIR;
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '1234';

// ensure folders
fse.ensureDirSync(DATA_DIR);
fse.ensureDirSync(BACKUPS_DIR);

// Session + body parsing
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'fahd_classic_secret_final',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: (process.env.NODE_ENV === 'production'),
    sameSite: 'lax'
  }
}));

app.use('/static', express.static(path.join(__dirname, 'public')));

// Helpers (kept names as original)
function esc(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function safeFilename(name) {
  return String(name || '').replace(/[^a-zA-Z0-9.\-\u0600-\u06FF _]/g, '_');
}
function filePath(name) { return path.join(DATA_DIR, name + '.json'); }
function load(name) {
  try {
    const p = filePath(name);
    if (!fs.existsSync(p)) return [];
    const txt = fs.readFileSync(p, 'utf8') || '[]';
    return JSON.parse(txt || '[]');
  } catch (e) {
    console.error('load error', e && e.message ? e.message : e);
    return [];
  }
}
function save(name, data) {
  try {
    const p = filePath(name);
    if (fs.existsSync(p)) {
      const bak = path.join(BACKUPS_DIR, `${name}-${Date.now()}.json`);
      try { fs.copyFileSync(p, bak); } catch (e) {}
    }
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('save error', e && e.message ? e.message : e);
    throw e;
  }
}
['fatwas','articles','videos','khutbahs','questions'].forEach(k => { if(!fs.existsSync(filePath(k))) save(k, []); });

// Multer setup — MEMORY ONLY (no disk, no S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/\.pdf$/i.test(file.originalname)) return cb(new Error('Only PDF allowed'));
    cb(null, true);
  }
});
console.log('Using memory storage for uploads (no S3, no local disk). Uploaded PDFs are stored as base64 inside khutbahs JSON.');

// YouTube extractor + shortId
function extractYouTubeID(input) {
  if (!input) return '';
  input = input.trim();
  try {
    if (input.includes('watch?v=')) return input.split('watch?v=')[1].split('&')[0];
    if (input.includes('youtu.be/')) return input.split('youtu.be/')[1].split('?')[0];
    if (input.includes('/embed/')) return input.split('/embed/')[1].split('?')[0];
    if (input.includes('/shorts/')) return input.split('/shorts/')[1].split('?')[0];
    if (/^[A-Za-z0-9_-]{6,}$/.test(input)) return input;
    return '';
  } catch (e) { return ''; }
}
function generateShortId() { return Math.floor(10000 + Math.random() * 90000).toString(); }

// Search scoring (same as original)
function scoreItem(qTerms, item) {
  const title = (item.title||'').toLowerCase();
  const content = (item.content||item.description||'').toLowerCase();
  let score = 0;
  for (const t of qTerms) {
    if (!t) continue;
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g');
    const tCountTitle = (title.match(re) || []).length;
    const tCountContent = (content.match(re) || []).length;
    score += tCountTitle * 8 + tCountContent * 2;
  }
  const phrase = qTerms.join(' ');
  if (phrase && ((title.indexOf(phrase) !== -1) || (content.indexOf(phrase) !== -1))) score += 20;
  if (item.createdAt) {
    try {
      const ageDays = (Date.now() - new Date(item.createdAt).getTime()) / (1000*60*60*24);
      score += Math.max(0, 3 - Math.min(ageDays/30, 3));
    } catch (e) {}
  }
  return score;
}

// Allowed admin-managed collections
const MANAGED_TYPES = ['fatwas','articles','videos','khutbahs'];

// --- API: search + suggest ---
app.get('/api/search', async (req,res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ results: [] });
  const qTerms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const tables = ['fatwas','articles','videos','khutbahs'];
  let results = [];

  try {
    for (const t of tables) {
      const items = load(t) || [];
      items.forEach(item => {
        const s = scoreItem(qTerms, item);
        if (s > 0) results.push({ type: t, item, score: s });
      });
    }
  } catch (e) {
    console.error('local search error', e && e.message ? e.message : e);
  }

  results = results.sort((a,b) => b.score - a.score).slice(0,200);
  const out = results.map(r => ({
    type: r.type,
    id: r.item.id,
    title: r.item.title || r.item.name || '',
    snippet: (r.item.content || r.item.description || '').substring(0,240),
    score: r.score
  }));
  res.json({ results: out });
});

app.get('/api/suggest', async (req,res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ suggestions: [] });
  const qTerms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const tables = ['fatwas','articles','videos','khutbahs'];
  let suggestions = [];
  for (const t of tables) {
    const items = load(t) || [];
    items.forEach(item => {
      const s = scoreItem(qTerms, item);
      if (s > 0) suggestions.push({ type: t, id: item.id, title: item.title || item.name || '', score: s });
    });
  }
  suggestions = suggestions.sort((a,b) => b.score - a.score).slice(0,8);
  res.json({ suggestions });
});

// --- Renderer (enhanced RTL with LARGER SIZES) ---
function renderClassic(title, bodyHtml, opts = {}) {
  const adminBlock = opts.admin ? `<a class="btn btn-sm btn-outline-dark" href="/admin">لوحة التحكم</a>` : '';
  const qVal = esc(opts.q || '');
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${esc(title)} - فهد بن عبدالله الجربوع</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.rtl.min.css" rel="stylesheet">
<style>
  * { direction: rtl; }
  body{ background:#fafafa; font-family:'Cairo',sans-serif; color:#222; direction: rtl; text-align: right; }
  .header{ background:white; border-bottom:1px solid #eee; padding:16px 0; }
  .header .container { display:flex; align-items:center; justify-content:space-between; flex-direction:row; gap:18px; }
  .logo-box{ display:flex; align-items:center; gap:16px; text-decoration:none; color:#000; flex-direction:row; }
  
  /* تكبير الدائرة الذهبية */
  .logo-circle{ 
    width:80px; 
    height:80px; 
    border-radius:50%; 
    background:linear-gradient(180deg,#d7b46a 0%,#b48b32 100%); 
    display:flex; 
    justify-content:center; 
    align-items:center; 
    color:white; 
    font-weight:700; 
    font-size:36px; 
    box-shadow:0 4px 14px rgba(0,0,0,.1); 
  }
  
  /* تكبير اسم فهد بن عبدالله الجربوع */
  .title-main{ 
    font-size:28px; 
    font-weight:700; 
    color:#111; 
    line-height:1.2; 
    text-align:right; 
  }
  
  /* تكبير النص الفرعي */
  .title-sub{ 
    font-size:16px; 
    color:#8b8b8b; 
    margin-top:4px; 
    text-align:right; 
  }
  
  /* تكبير روابط القائمة */
  .nav-link-custom{ 
    padding:14px 18px; 
    border-radius:10px; 
    color:#666; 
    text-decoration:none; 
    font-weight:600; 
    font-size:17px;
    transition: all 0.3s ease;
  }
  .nav-link-custom:hover{ 
    background:#f7f6f3; 
    color:#444; 
    transform: translateY(-2px);
  }
  
  .card-modern{ background:white; border:1px solid #e6e6e6; border-radius:12px; padding:20px; margin-bottom:20px; box-shadow:0 2px 8px rgba(0,0,0,.03); }
  .classic-card{ background:white; border:1px solid #e6e6e6; border-radius:12px; padding:20px; margin-bottom:20px; box-shadow:0 2px 8px rgba(0,0,0,.03); }
  .section-title{ font-weight:700; border-right:4px solid #c7a562; padding-right:10px; margin-bottom:18px; text-align:right; }
  footer{ text-align:center; padding:30px 0 10px; color:#777; font-size:14px; }
  .btn-gold{ background:#b48b32; color:white; border:none; padding:8px 16px; border-radius:10px; }
  .btn-gold:hover{ background:#977126; }
  .btn-brown, .btn-outline-brown { color: #5a3f1a; border-color: #c7a562; }
  .btn-brown { background: #f5efe6; border-radius:6px; }
  .search-suggestions{ position:absolute; z-index:1200; width:100%; background:white; border:1px solid #eee; border-radius:6px; max-height:320px; overflow:auto; box-shadow:0 6px 18px rgba(0,0,0,.08); text-align:right;}
  .search-input { min-width: 320px; max-width: 520px; text-align:right; direction:rtl; font-size:15px; padding:10px 14px; }
  .ratio-vid { position:relative; width:100%; padding-bottom:56.25%; }
  .ratio-vid iframe { position:absolute; top:0; right:0; width:100%; height:100%; }
  .meta-muted { color:#8b8b8b; font-size:13px; }
  .form-control { text-align:right; direction:rtl; }
  table { direction:rtl; text-align:right; }
  table th, table td { text-align:right; }
  
  /* Responsive adjustments */
  @media (max-width: 768px) {
    .logo-circle { width:65px; height:65px; font-size:28px; }
    .title-main { font-size:22px; }
    .title-sub { font-size:13px; }
    .nav-link-custom { font-size:15px; padding:12px 14px; }
  }
</style>
</head>
<body>
<header class="header mb-3">
  <div class="container">
    <a href="/" class="logo-box" aria-label="الصفحة الرئيسية">
      <div class="logo-circle">ف</div>
      <div>
        <div class="title-main">فهد بن عبدالله الجربوع</div>
        <div class="title-sub">منصة علمية للفتاوى والمقالات والخطب</div>
      </div>
    </a>

    <div style="display:flex; align-items:center; gap:10px; width:100%; justify-content:flex-start;">
      <div style="position:relative; width:100%; max-width:520px;">
        <form id="searchForm" action="/search" method="GET">
          <input id="searchInput" name="q" class="form-control search-input" type="search" placeholder="ابحث هنا عن الفتاوى، المقالات، الفيديوهات أو الخطب..." autocomplete="off" value="${qVal}" />
        </form>
        <div id="suggestions" class="search-suggestions" style="display:none;"></div>
      </div>

      <nav class="d-none d-md-flex gap-2">
        <a href="/fatwas" class="nav-link-custom">الفتاوى</a>
        <a href="/articles" class="nav-link-custom">المقالات</a>
        <a href="/videos" class="nav-link-custom">الفيديوهات</a>
        <a href="/khutbahs" class="nav-link-custom">الخطب</a>
        <a href="/ask-page" class="nav-link-custom">أرسل سؤالك</a>
      </nav>

      ${adminBlock}
    </div>
  </div>
</header>

<div class="container">
  <div class="row">
    <div class="col-lg-8">
      ${bodyHtml}
    </div>
    <div class="col-lg-4">
      <div class="card-modern">
        <h5 class="section-title">روابط سريعة</h5>
        <ul class="list-unstyled">
          <li class="mb-2"><a href="/fatwas">الفتاوى</a></li>
          <li class="mb-2"><a href="/articles">المقالات</a></li>
          <li class="mb-2"><a href="/videos">الفيديوهات</a></li>
          <li class="mb-2"><a href="/khutbahs">الخطب المفرغة (PDF)</a></li>
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

<footer>© ${new Date().getFullYear()} فهد بن عبدالله الجربوع — جميع الحقوق محفوظة</footer>

<script>
  const input = document.getElementById('searchInput');
  const suggestionsBox = document.getElementById('suggestions');
  let timer = null;
  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (timer) clearTimeout(timer);
    if (!q) { suggestionsBox.style.display='none'; suggestionsBox.innerHTML=''; return; }
    timer = setTimeout(() => {
      fetch('/api/suggest?q=' + encodeURIComponent(q))
        .then(r=>r.json())
        .then(data => {
          const s = data.suggestions || [];
          if (!s.length) { suggestionsBox.style.display='none'; suggestionsBox.innerHTML=''; return; }
          suggestionsBox.innerHTML = s.map(it => \`<div style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;"><a href="/\${it.type}/\${it.id}" style="text-decoration:none;color:#222;"><strong>[\${it.type}]</strong> \${it.title}</a></div>\`).join('');
          suggestionsBox.style.display = 'block';
        }).catch(()=>{ suggestionsBox.style.display='none'; });
    }, 220);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#suggestions') && !e.target.closest('#searchInput')) {
      suggestionsBox.style.display = 'none';
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('searchForm').submit();
  });
</script>
</body>
</html>`;
}

// --- Public routes: home, lists, details ---

app.get('/', (req,res) => {
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
app.get('/fatwas', (req,res) => {
  const items = load('fatwas');
  const body = `<div class="classic-card"><h3 class="section-title">الفتاوى</h3>${items.length ? items.map(i=>`<article class="mb-3"><h5><a href="/fatwas/${i.id}">${esc(i.title)}</a></h5><p class="meta-muted">${esc(i.createdAt||'')}</p></article>`).join('') : '<p>لا توجد فتاوى حتى الآن.</p>'}</div>`;
  res.send(renderClassic('الفتاوى', body));
});
app.get('/fatwas/:id', (req,res) => {
  const item = load('fatwas').find(x=>String(x.id)===String(req.params.id));
  if (!item) return res.send(renderClassic('غير موجود','<div class="classic-card">الفتوى غير موجودة</div>'));
  res.send(renderClassic(item.title, `<div class="classic-card"><h3>${esc(item.title)}</h3><p class="meta-muted">${esc(item.createdAt||'')}</p><div>${sanitizeHtmlSafe(item.content||'')}</div></div>`));
});

// Articles
app.get('/articles', (req,res) => {
  const items = load('articles');
  const body = `<div class="classic-card"><h3 class="section-title">المقالات</h3>${items.length ? items.map(i=>`<article class="mb-3"><h5><a href="/articles/${i.id}">${esc(i.title)}</a></h5><p class="meta-muted">${esc(i.createdAt||'')}</p></article>`).join('') : '<p>لا توجد مقالات حتى الآن.</p>'}</div>`;
  res.send(renderClassic('المقالات', body));
});
app.get('/articles/:id', (req,res) => {
  const item = load('articles').find(x=>String(x.id)===String(req.params.id));
  if (!item) return res.send(renderClassic('غير موجود','<div class="classic-card">المقال غير موجود</div>'));
  res.send(renderClassic(item.title, `<div class="classic-card"><h3>${esc(item.title)}</h3><p class="meta-muted">${esc(item.createdAt||'')}</p><div>${sanitizeHtmlSafe(item.content||'')}</div></div>`));
});

// Videos
app.get('/videos', (req,res) => {
  const items = load('videos');
  const body = `<div class="classic-card"><h3 class="section-title">الفيديوهات</h3>${items.length ? items.map(i=>`<div class="mb-3"><h5>${esc(i.title)}</h5><p class="meta-muted">${esc(i.createdAt||'')}</p><p><a href="/videos/${i.id}" class="btn btn-outline-brown btn-sm">مشاهدة</a></p></div>`).join('') : '<p>لا توجد فيديوهات حتى الآن.</p>'}</div>`;
  res.send(renderClassic('الفيديوهات', body));
});
app.get('/videos/:id', (req,res) => {
  const item = load('videos').find(x=>String(x.id)===String(req.params.id));
  if (!item) return res.send(renderClassic('غير موجود','<div class="classic-card">الفيديو غير موجود</div>'));
  let youtubeId = item.youtubeId || extractYouTubeID(item.url || '');
  if (!youtubeId && item.url) youtubeId = extractYouTubeID(item.url || '');
  if (!youtubeId) {
    const body = `<div class="classic-card"><h3>${esc(item.title)}</h3><p>الرابط: <a href="${esc(item.url)}">${esc(item.url)}</a></p><p class="meta-muted">${esc(item.description||'')}</p></div>`;
    return res.send(renderClassic(item.title, body));
  }
  const iframeSrc = `https://www.youtube.com/embed/${youtubeId}`;
  const body = `<div class="classic-card"><h3>${esc(item.title)}</h3><p class="meta-muted">${esc(item.createdAt||'')}</p><div class="ratio-vid"><iframe src="${esc(iframeSrc)}" allowfullscreen style="border:0;"></iframe></div><p class="mt-2">${esc(item.description||item.content||'')}</p></div>`;
  res.send(renderClassic(item.title, body));
});

// Khutbahs list (canonical) and alias
app.get('/khutbahs', (req,res) => {
  const items = load('khutbahs');
  const body = `<div class="classic-card"><h3 class="section-title">الخطب المفرغة (PDF)</h3>${items.length ? items.map(i=>`<div class="mb-3"><h5>${esc(i.title)}</h5><p><a href="/khutbahs/${i.id}" class="btn btn-outline-brown btn-sm">عرض / تحميل PDF</a></p></div>`).join('') : '<p>لا توجد خطب حتى الآن.</p>'}</div>`;
  res.send(renderClassic('الخطب المفرغة', body));
});
// legacy alias kept
app.get('/khutab', (req, res) => res.redirect(301, '/khutbahs'));

// View khutbah detail and embed PDF if stored as base64
app.get('/khutbahs/:id', async (req,res) => {
  const item = load('khutbahs').find(x=>String(x.id)===String(req.params.id));
  if (!item) return res.send(renderClassic('غير موجود','<div class="classic-card">الخطبة غير موجود</div>'));
  let content = `<div>${sanitizeHtmlSafe(item.content||'')}</div>`;
  if (item.fileData) {
    // Serve via embed referencing /khutbahs/:id/pdf
    content = `<embed src="/khutbahs/${item.id}/pdf" type="application/pdf" width="100%" height="600px"/>`;
  } else if (item.file) {
    // backward compatibility if old records had file path (but we removed local disk uploads)
    content = `<div>ملف موجود: ${esc(item.file)}</div>`;
  }
  res.send(renderClassic(item.title, `<div class="classic-card"><h3>${esc(item.title)}</h3><p class="meta-muted">${esc(item.createdAt||'')}</p>${content}</div>`));
});

// Stream PDF from stored base64
app.get('/khutbahs/:id/pdf', (req,res) => {
  const item = load('khutbahs').find(x=>String(x.id)===String(req.params.id));
  if (!item) return res.status(404).send('Not found');
  if (!item.fileData) return res.status(404).send('PDF not available');
  try {
    const buf = Buffer.from(item.fileData, 'base64');
    res.setHeader('Content-Type', item.fileMime || 'application/pdf');
    const safeName = safeFilename(item.fileName || `khutbah-${item.id}.pdf`);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(safeName))}"`);
    res.setHeader('Content-Length', String(buf.length));
    return res.send(buf);
  } catch (e) {
    console.error('pdf stream error', e);
    return res.status(500).send('Failed to serve PDF');
  }
});

// Search page (server-rendered)
app.get('/search', async (req,res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.redirect('/');
  try {
    const qTerms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const tables = ['fatwas','articles','videos','khutbahs'];
    let results = [];
    for (const t of tables) {
      const items = load(t) || [];
      items.forEach(item => {
        const s = scoreItem(qTerms, item);
        if (s > 0) results.push({ type: t, item, score: s });
      });
    }
    results = results.sort((a,b) => b.score - a.score).slice(0,200);
    const body = `<div class="classic-card"><h3 class="section-title">نتائج البحث (${results.length})</h3>
      <ul class="list-unstyled">${results.map(r=>`<li class="mb-2"><a href="/${r.type}/${r.item.id}">[${esc(r.type)}] ${esc(r.item.title)}</a> <small class="text-muted">score:${(r.score||0).toFixed(1)}</small></li>`).join('')}</ul>
    </div>`;
    res.send(renderClassic('بحث', body, { q }));
  } catch (e) {
    console.error('search page error', e && e.message ? e.message : e);
    res.send(renderClassic('خطأ', '<div class="classic-card text-danger">حدث خطأ أثناء البحث</div>'));
  }
});

// Ask (questions)
app.get('/ask-page', (req,res) => {
  const form = `<div class="classic-card"><h3 class="section-title">أرسل سؤالك</h3>
    <form action="/ask" method="POST">
      <div class="mb-2"><label>الاسم</label><input name="name" class="form-control" required></div>
      <div class="mb-2"><label>البريد الإلكتروني</label><input name="email" type="email" class="form-control" required></div>
      <div class="mb-2"><label>السؤال</label><textarea name="question" class="form-control" rows="6" required></textarea></div>
      <button class="btn btn-brown">أرسل سؤالك</button>
    </form></div>`;
  res.send(renderClassic('أرسل سؤالك', form));
});

app.post('/ask', async (req,res) => {
  const name = sanitizeHtmlSafe((req.body.name||'').trim());
  const email = sanitizeHtmlSafe((req.body.email||'').trim());
  const question = sanitizeHtmlSafe((req.body.question||'').trim());
  if (!name || !email || !question) {
    return res.send(renderClassic('خطأ', '<div class="classic-card text-danger">الرجاء تعبئة جميع الحقول</div>'));
  }
  const qs = load('questions') || [];
  let shortId = generateShortId();
  while (qs.find(q => String(q.shortId) === String(shortId))) shortId = generateShortId();
  const id = Date.now();
  const item = { id, shortId, name, email, question, answer:'', status:'new', createdAt: new Date().toISOString() };
  qs.push(item);
  save('questions', qs);
  const fullLink = `${req.protocol}://${req.get('host')}/question/${shortId}`;
  const body = `<div class="classic-card"><h3 class="section-title">تم استلام سؤالك</h3>
    <p>شكراً لك — تم استلام السؤال. يمكنك متابعة الإجابة عبر الرابط التالي:</p>
    <div style="background:#f8f8f8;padding:12px;border-radius:8px;word-break:break-all;">
      <a href="${fullLink}">${fullLink}</a>
    </div>
    <p class="mt-3"><a href="/" class="btn btn-gold">العودة للرئيسية</a></p>
  </div>`;
  res.send(renderClassic('تم الاستلام', body));
});

app.get('/question/:shortId', (req,res) => {
  const shortId = String(req.params.shortId || '');
  const qs = load('questions') || [];
  const q = qs.find(x => String(x.shortId) === shortId);
  if (!q) return res.status(404).send(renderClassic('غير موجود', '<div class="classic-card">السؤال غير موجود</div>'));
  const answerBlock = q.answer && q.answer.trim() ? `<h5>الجواب:</h5><div class="card-modern" style="white-space:pre-wrap;">${esc(q.answer)}</div>` : `<p style="color:gray;">لم يتم الرد بعد — راجع هذا الرابط لاحقًا.</p>`;
  const body = `<div class="classic-card"><h3 class="section-title">سؤالك</h3><p><strong>من:</strong> ${esc(q.name)}</p><div class="card-modern" style="white-space:pre-wrap;">${esc(q.question)}</div><div class="mt-3">${answerBlock}</div></div>`;
  res.send(renderClassic('عرض السؤال', body));
});

// --- Admin: auth, dashboard, manage pages, uploads, JSON manager ---
function requireAdmin(req,res,next) {
  if (!req.session || !req.session.isAdmin) return res.redirect('/admin/login');
  next();
}
app.get('/admin/login', (req,res) => {
  const form = `<div class="classic-card"><h3 class="section-title">دخول المدير</h3>
    <form method="POST" action="/admin/login">
      <div class="mb-2"><input name="user" class="form-control" placeholder="اسم المستخدم" required></div>
      <div class="mb-2"><input name="pass" type="password" class="form-control" placeholder="كلمة السر" required></div>
      <button class="btn btn-brown">دخول</button>
    </form></div>`;
  res.send(renderClassic('دخول الادمن', form));
});
app.post('/admin/login', (req,res) => {
  const u = (req.body.user||'').trim();
  const p = (req.body.pass||'').trim();
  if (u === ADMIN_USER && p === ADMIN_PASS) { req.session.isAdmin = true; return res.redirect('/admin'); }
  res.send(renderClassic('خطأ', '<div class="classic-card text-danger">بيانات الدخول خاطئة</div>'));
});
app.get('/admin/logout', (req,res) => { req.session.isAdmin = false; res.redirect('/admin/login'); });

app.get('/admin', requireAdmin, (req,res) => {
  const fatwas = load('fatwas'), articles = load('articles'), videos = load('videos'), khutbahs = load('khutbahs'), questions = load('questions');
  const body = `<div class="classic-card"><h3 class="section-title">لوحة التحكم</h3>
    <div class="row">
      <div class="col-md-2"><div class="card p-3"><h6>الفتاوى</h6><p class="h4">${fatwas.length}</p><a class="btn btn-sm btn-outline-brown" href="/admin/manage/fatwas">إدارة</a></div></div>
      <div class="col-md-2"><div class="card p-3"><h6>المقالات</h6><p class="h4">${articles.length}</p><a class="btn btn-sm btn-outline-brown" href="/admin/manage/articles">إدارة</a></div></div>
      <div class="col-md-2"><div class="card p-3"><h6>الفيديوهات</h6><p class="h4">${videos.length}</p><a class="btn btn-sm btn-outline-brown" href="/admin/manage/videos">إدارة</a></div></div>
      <div class="col-md-2"><div class="card p-3"><h6>الخطب</h6><p class="h4">${khutbahs.length}</p><a class="btn btn-sm btn-outline-brown" href="/admin/manage/khutbahs">إدارة</a></div></div>
      <div class="col-md-2"><div class="card p-3"><h6>الأسئلة</h6><p class="h4">${questions.length}</p><a class="btn btn-sm btn-danger" href="/admin/questions">عرض</a></div></div>
    </div></div>`;
  res.send(renderClassic('لوحة الادمن', body, { admin:true }));
});

app.get('/admin/manage/:type', requireAdmin, (req,res) => {
  const type = req.params.type;
  if (!MANAGED_TYPES.includes(type)) return res.status(404).send(renderClassic('خطأ','<div class="classic-card">نوع غير معروف</div>', { admin:true }));
  const items = load(type) || [];
  let addFields = '';
  if (type === 'videos') addFields = `<div class="mb-2"><label>رابط يوتيوب أو ID</label><input name="url" class="form-control" placeholder="https://www.youtube.com/watch?v=... أو ID"></div>`;
  if (type === 'khutbahs') addFields = `<div class="mb-2"><label>رفع ملف PDF</label><input type="file" name="file" accept="application/pdf" class="form-control"></div>`;
  const rows = items.length ? items.map(i=>`<tr><td>${i.id}</td><td>${esc(i.title||i.name||'')}</td><td>${esc(i.createdAt||'')}</td><td>
    <form method="post" action="/admin/delete/${type}/${i.id}" onsubmit="return confirm('حذف؟')" style="display:inline;"><button class="btn btn-sm btn-danger">حذف</button></form>
  </td></tr>`).join('') : `<tr><td colspan="4">لا توجد عناصر حتى الآن.</td></tr>`;
  const addForm = (type !== 'questions') ? `<h5 class="mt-3">إضافة جديد</h5>
    <form method="post" action="/admin/add/${type}" ${type==='khutbahs'?'enctype="multipart/form-data"':''}>
      <div class="mb-2"><input name="title" class="form-control" placeholder="العنوان" required></div>
      <div class="mb-2"><textarea name="content" class="form-control" placeholder="المحتوى / الوصف"></textarea></div>
      ${addFields}
      <button class="btn btn-success">إضافة</button>
    </form>` : '';
  const body = `<div class="classic-card"><h3>إدارة ${esc(type)}</h3>
    <table class="table"><thead><tr><th>ID</th><th>العنوان</th><th>تاريخ</th><th>إجراء</th></tr></thead><tbody>${rows}</tbody></table>
    ${addForm}
    <p><a href="/admin" class="btn btn-outline-brown">رجوع</a></p></div>`;
  res.send(renderClassic('ادارة '+type, body, { admin:true }));
});

// handle add khutbah (with file) — store file as base64 inside JSON
app.post('/admin/add/khutbahs', requireAdmin, upload.single('file'), async (req,res) => {
  try {
    const list = load('khutbahs') || [];
    const id = Date.now();
    let fileData = '';
    let fileName = '';
    let fileMime = '';

    if (req.file && req.file.buffer) {
      fileData = req.file.buffer.toString('base64');
      fileName = req.file.originalname || (`khutbah-${id}.pdf`);
      fileMime = req.file.mimetype || 'application/pdf';
    }

    const obj = {
      id,
      title: sanitizeHtmlSafe(req.body.title||''),
      content: sanitizeHtmlSafe(req.body.content||''),
      fileData,        // base64 string (may be empty)
      fileName,
      fileMime,
      createdAt: new Date().toISOString()
    };
    list.push(obj);
    save('khutbahs', list);
    res.redirect('/admin/manage/khutbahs');
  } catch (e) {
    console.error('add khutbah error', e && e.message ? e.message : e);
    res.status(500).send(renderClassic('خطأ','<div class="classic-card text-danger">فشل رفع الخطبة</div>', { admin:true }));
  }
});

// generic add (videos, fatwas, articles)
app.post('/admin/add/:type', requireAdmin, (req,res) => {
  const type = req.params.type;
  if (!MANAGED_TYPES.includes(type) || type === 'khutbahs' || type === 'questions') return res.status(400).send('غير مسموح');
  const list = load(type) || [];
  const id = Date.now();
  const item = { id, title: sanitizeHtmlSafe(req.body.title||''), content: sanitizeHtmlSafe(req.body.content||''), createdAt: new Date().toISOString() };
  if (type === 'videos') {
    const url = (req.body.url||'').trim();
    const youtubeId = extractYouTubeID(url);
    item.url = url;
    if (youtubeId) item.youtubeId = youtubeId;
  }
  list.push(item);
  save(type, list);
  res.redirect('/admin/manage/' + type);
});

app.post('/admin/delete/:type/:id', requireAdmin, (req,res) => {
  const type = req.params.type;
  if (!MANAGED_TYPES.includes(type)) return res.status(400).send('غير مسموح');
  let list = load(type) || [];
  list = list.filter(i => String(i.id) !== String(req.params.id));
  save(type, list);
  res.redirect('/admin/manage/' + type);
});

// Admin questions listing and management
app.get('/admin/questions', requireAdmin, (req,res) => {
  const qs = load('questions') || [];
  const rows = qs.map(q=>`<tr><td>${q.id}</td><td>${esc(q.name)}</td><td>${esc(q.email)}</td><td>${esc((q.question||'').substring(0,80))}...</td><td>${esc(q.createdAt||'')}</td><td><a class="btn btn-sm btn-primary" href="/admin/question/${q.id}">عرض</a></td></tr>`).join('') || `<tr><td colspan="6">لا توجد أسئلة</td></tr>`;
  const body = `<div class="classic-card"><h3 class="section-title">أسئلة الزوار</h3><table class="table"><thead><tr><th>ID</th><th>الاسم</th><th>البريد</th><th>مقتطف</th><th>التاريخ</th><th>عرض</th></tr></thead><tbody>${rows}</tbody></table><p><a href="/admin" class="btn btn-outline-brown">رجوع</a></p></div>`;
  res.send(renderClassic('اسئلة الزوار', body, { admin:true }));
});

app.get('/admin/question/:id', requireAdmin, (req,res) => {
  const qs = load('questions') || [];
  const q = qs.find(x=>String(x.id)===String(req.params.id));
  if (!q) return res.send(renderClassic('خطأ','<div class="classic-card">السؤال غير موجود</div>', { admin:true }));
  const replyBlock = q.answer ? `<h5>الرد:</h5><div class="p-2" style="background:#e9ffe9;white-space:pre-wrap;">${esc(q.answer)}</div>` : '';
  const body = `<div class="classic-card"><h4 class="section-title">عرض السؤال</h4>
    <p><strong>الاسم:</strong> ${esc(q.name)}<br><strong>البريد:</strong> ${esc(q.email)}<br><strong>التاريخ:</strong> ${esc(q.createdAt)}</p>
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

app.get('/admin/question/:id/reply', requireAdmin, (req,res) => {
  const qs = load('questions') || [];
  const q = qs.find(x=>String(x.id)===String(req.params.id));
  if (!q) return res.send(renderClassic('خطأ','<div class="classic-card">السؤال غير موجود</div>', { admin:true }));
  const body = `<div class="classic-card"><h4 class="section-title">الرد على السؤال</h4>
    <form method="POST" action="/admin/question/${q.id}/reply">
      <div class="mb-2"><textarea name="answer" class="form-control" rows="6">${esc(q.answer||'')}</textarea></div>
      <button class="btn btn-brown">حفظ الرد</button>
      <a class="btn btn-secondary" href="/admin/question/${q.id}">إلغاء</a>
    </form></div>`;
  res.send(renderClassic('رد على السؤال', body, { admin:true }));
});

app.post('/admin/question/:id/reply', requireAdmin, (req,res) => {
  const qs = load('questions') || [];
  const idx = qs.findIndex(x=>String(x.id)===String(req.params.id));
  if (idx === -1) return res.send(renderClassic('خطأ','<div class="classic-card">السؤال غير موجود</div>', { admin:true }));
  qs[idx].answer = sanitizeHtmlSafe(req.body.answer || '');
  qs[idx].answeredAt = new Date().toISOString();
  qs[idx].status = 'answered';
  save('questions', qs);
  res.redirect('/admin/question/' + req.params.id);
});

app.get('/admin/question/:id/delete', requireAdmin, (req,res) => {
  let qs = load('questions') || [];
  qs = qs.filter(x => String(x.id) !== String(req.params.id));
  save('questions', qs);
  res.redirect('/admin/questions');
});

app.get('/admin/question/:id/tofatwa', requireAdmin, (req,res) => {
  const qs = load('questions') || [];
  const q = qs.find(x=>String(x.id)===String(req.params.id));
  if (!q) return res.send(renderClassic('خطأ','<div class="classic-card">السؤال غير موجود</div>', { admin:true }));
  const fatwas = load('fatwas') || [];
  fatwas.push({ id: Date.now(), title: `سؤال من: ${q.name}`, content: `${q.question}\n\n---\nالجواب:\n${q.answer||'لم يتم الرد بعد'}`, createdAt: new Date().toISOString() });
  save('fatwas', fatwas);
  res.redirect('/admin/manage/fatwas');
});

// JSON manager
function safeJsonFilename(name) {
  if (!name || typeof name !== 'string') return null;
  if (!/^[A-Za-z0-9_\-]+$/.test(name)) return null;
  return name;
}

app.get('/admin/json', requireAdmin, (req,res) => {
  const files = fs.readdirSync(DATA_DIR).filter(f=>f.endsWith('.json')).map(f=>{
    const p = path.join(DATA_DIR,f);
    const stat = fs.statSync(p);
    return { name: f.replace(/\.json$/,''), mtime: stat.mtime.toISOString(), size: stat.size };
  });
  const rows = files.map(f => `<tr><td>${esc(f.name)}</td><td>${esc(f.mtime)}</td><td>${f.size} بايت</td><td>
    <a class="btn btn-sm btn-outline-brown" href="/admin/json/${encodeURIComponent(f.name)}">تحرير</a>
    <a class="btn btn-sm btn-secondary" href="/admin/json/${encodeURIComponent(f.name)}/download">تحميل</a>
    </td></tr>`).join('') || '<tr><td colspan="4">لا توجد ملفات JSON</td></tr>';
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

app.get('/admin/json/:name/download', requireAdmin, (req,res) => {
  const name = safeJsonFilename(req.params.name);
  if (!name) return res.status(400).send(renderClassic('خطأ','<div class="classic-card">اسم غير صالح</div>', { admin:true }));
  const p = path.join(DATA_DIR, name + '.json');
  if (!fs.existsSync(p)) return res.status(404).send(renderClassic('غير موجود','<div class="classic-card">الملف غير موجود</div>', { admin:true }));
  res.download(p, `${name}.json`);
});

app.get('/admin/json/:name', requireAdmin, (req,res) => {
  const name = safeJsonFilename(req.params.name);
  if (!name) return res.status(400).send(renderClassic('خطأ','<div class="classic-card">اسم غير صالح</div>', { admin:true }));
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
  const name = safeJsonFilename(req.params.name);
  if (!name) return res.status(400).send(renderClassic('خطأ','<div class="classic-card">اسم غير صالح</div>', { admin:true }));
  const content = req.body.content || '';
  try { JSON.parse(content); } catch (e) {
    const body = `<div class="classic-card"><h3 class="section-title">خطأ في JSON</h3><p class="text-danger">تعذر حفظ الملف — JSON غير صالح: ${esc(e.message)}</p><p><a href="/admin/json/${encodeURIComponent(name)}" class="btn btn-secondary">العودة والتصحيح</a></p></div>`;
    return res.send(renderClassic('خطأ في JSON', body, { admin:true }));
  }
  try {
    const p = path.join(DATA_DIR, name + '.json');
    if (fs.existsSync(p)) { const bak = path.join(BACKUPS_DIR, `${name}-${Date.now()}.json`); fs.copyFileSync(p, bak); }
    fs.writeFileSync(path.join(DATA_DIR, name + '.json'), content, 'utf8');
    res.send(renderClassic('تم الحفظ', `<div class="classic-card"><h3 class="section-title">تم الحفظ</h3><p>تم حفظ ${esc(name)}.json بنجاح.</p><p><a href="/admin/json" class="btn btn-outline-brown">العودة</a></p></div>`, { admin:true }));
  } catch (e) {
    console.error('save json error', e && e.message ? e.message : e);
    res.status(500).send(renderClassic('خطأ','<div class="classic-card text-danger">فشل الحفظ</div>', { admin:true }));
  }
});

app.post('/admin/json/create', requireAdmin, (req,res) => {
  const name = safeJsonFilename((req.body.name||'').trim());
  const content = req.body.content || '';
  if (!name) return res.status(400).send(renderClassic('خطأ','<div class="classic-card">اسم ملف غير صالح، استخدم أحرف وأرقام و-_ فقط</div>', { admin:true }));
  const p = path.join(DATA_DIR, name + '.json');
  if (fs.existsSync(p)) return res.send(renderClassic('خطأ','<div class="classic-card text-danger">الملف موجود بالفعل</div>', { admin:true }));
  if (content.trim()) {
    try { JSON.parse(content); } catch (e) { return res.send(renderClassic('خطأ','<div class="classic-card text-danger">محتوى JSON غير صالح: '+esc(e.message)+'</div>', { admin:true })); }
    fs.writeFileSync(p, content, 'utf8');
    res.redirect('/admin/json');
  } else {
    fs.writeFileSync(p, JSON.stringify({}, null, 2), 'utf8');
    res.redirect('/admin/json');
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).send(renderClassic('غير موجود', '<div class="classic-card">الصفحة غير موجودة</div>'));
});

// error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  try {
    res.status(500).send(renderClassic('خطأ', '<div class="classic-card text-danger">حدث خطأ في الخادم. الرجاء المحاولة لاحقًا.</div>'));
  } catch (e) {
    res.status(500).send('Server error');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Admin credentials: ${ADMIN_USER} / ${ADMIN_PASS}`);
  console.log(`Data dir: ${DATA_DIR} (persistent disk: ${USE_PERSISTENT_DISK})`);
});
