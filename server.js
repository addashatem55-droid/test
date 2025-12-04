/**
 * server.js
 * "توسّع كامل" — ملف واحد متكامل يدعم:
 * - واجهة كلاسيكية (نجدي) محسّنة مع شريط بحث ذكي (AJAX suggestions + صفحة نتائج)
 * - واجهة إدارة (جلسات) لحفظ/تحرير المحتوى وملفات PDF
 * - تخزين اختياري في Supabase (أسئلة + ملفات الخطبة + تخزين احتياطي)
 * - محرك بحث محسّن محلي + تكامل بحث في Supabase عند التوفر
 * - مدير JSON مدمج، نسخ احتياطية، وفحص صحة JSON قبل الحفظ
 * - حماية أساسية: helmet, rate limiting, validation, sanitization
 *
 * تثبيت الحزم:
 * npm i express express-session fs-extra multer body-parser @supabase/supabase-js helmet express-rate-limit sanitize-html
 *
 * المتغيرات البيئية المقترحة:
 * PORT, ADMIN_USER, ADMIN_PASS,
 * SUPABASE_URL, SUPABASE_KEY, SUPABASE_BUCKET (لرفع الخطب),
 * USE_PERSISTENT_DISK (true/false) و PERSISTENT_DATA_PATH (مثل /mnt/storage) - اختياري للـ PaaS
 *
 * ملاحظات Supabase:
 * - أنشئ جدول (إذا رغبت) اسمه "questions" أو دع الكود يخزن محليًا في data/questions.json.
 * - لإنشاء جداول/عمليات بحث متقدمة في Supabase، أنشئ دوال Postgres/Fts حسب حاجتك.
 *
 * تشغيل:
 * node server.js
 *
 * الملف طويل لكن شامل — اقرأ التعليقات حول إعداد Supabase وطرق الاسترجاع.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const session = require('express-session');
const multer = require('multer');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');

let useSupabase = false;
let supabase = null;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || ''; // bucket for khutbah PDFs

if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    useSupabase = true;
    console.log('Supabase enabled');
  } catch (e) {
    console.warn('Could not init Supabase client. Make sure @supabase/supabase-js is installed.', e);
    useSupabase = false;
  }
}

const app = express();

// Basic security & rate limiting
app.use(helmet());
app.set('trust proxy', 1);
const limiter = rateLimit({ windowMs: 10 * 1000, max: 20 }); // brief limit for sensitive endpoints
app.use(limiter);

// CONFIG
const PORT = process.env.PORT || 3000;
const USE_PERSISTENT_DISK = (process.env.USE_PERSISTENT_DISK || 'false').toLowerCase() === 'true';
const PERSISTENT_DATA_PATH = process.env.PERSISTENT_DATA_PATH || '';
const BASE_DATA_DIR = USE_PERSISTENT_DISK && PERSISTENT_DATA_PATH ? path.join(PERSISTENT_DATA_PATH, 'data') : path.join(__dirname, 'data');

const DATA_DIR = BASE_DATA_DIR;
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const KHUTBAHS_DIR = path.join(UPLOADS_DIR, 'khutbahs');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '1234';

// ensure dirs
fse.ensureDirSync(DATA_DIR);
fse.ensureDirSync(UPLOADS_DIR);
fse.ensureDirSync(KHUTBAHS_DIR);
fse.ensureDirSync(BACKUPS_DIR);

// Session
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'fahd_classic_secret_v2',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // set true if using HTTPS
}));

app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/static', express.static(path.join(__dirname, 'public')));

// Helpers
function esc(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9.\-\u0600-\u06FF _]/g, '_');
}

// JSON helpers (local storage fallback)
function filePath(name) { return path.join(DATA_DIR, name + '.json'); }
function load(name) {
  try {
    const p = filePath(name);
    if (!fs.existsSync(p)) return [];
    const txt = fs.readFileSync(p, 'utf8') || '[]';
    return JSON.parse(txt || '[]');
  } catch (e) {
    console.error('load error', e);
    return [];
  }
}
function save(name, data) {
  try {
    const p = filePath(name);
    if (fs.existsSync(p)) {
      const bak = path.join(BACKUPS_DIR, `${name}-${Date.now()}.json`);
      try { fs.copyFileSync(p, bak); } catch (e) { /* ignore */ }
    }
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('save error', e);
    throw e;
  }
}
['fatwas','articles','videos','khutbahs','questions'].forEach(k => { if(!fs.existsSync(filePath(k))) save(k, []); });

// Multer setup: use memory storage if Supabase storage will be used, else disk storage
let upload;
if (useSupabase && SUPABASE_BUCKET) {
  upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 }});
} else {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, KHUTBAHS_DIR),
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + safeFilename(file.originalname));
    }
  });
  upload = multer({ storage, limits: { fileSize: 80 * 1024 * 1024 }});
}

// YouTube extractor
function extractYouTubeID(input) {
  if(!input) return '';
  input = input.trim();
  try {
    if(input.includes('watch?v=')) return input.split('watch?v=')[1].split('&')[0];
    if(input.includes('youtu.be/')) return input.split('youtu.be/')[1].split('?')[0];
    if(input.includes('/embed/')) return input.split('/embed/')[1].split('?')[0];
    if(input.includes('/shorts/')) return input.split('/shorts/')[1].split('?')[0];
    if(/^[A-Za-z0-9_-]{6,}$/.test(input)) return input;
    return '';
  } catch(e) { return ''; }
}
function generateShortId() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

// Lightweight scoring search (local) — improved weighting, phrase boost, recency.
function scoreItem(qTerms, item) {
  const title = (item.title||'').toLowerCase();
  const content = (item.content||item.description||'').toLowerCase();
  let score = 0;
  for (const t of qTerms) {
    if(!t) continue;
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g');
    const tCountTitle = (title.match(re) || []).length;
    const tCountContent = (content.match(re) || []).length;
    score += tCountTitle * 8 + tCountContent * 2;
  }
  // phrase boost if all terms together appear
  const phrase = qTerms.join(' ');
  if (phrase && ((title.indexOf(phrase) !== -1) || (content.indexOf(phrase) !== -1))) score += 20;
  // recency boost
  if (item.createdAt) {
    try {
      const ageDays = (Date.now() - new Date(item.createdAt).getTime()) / (1000*60*60*24);
      score += Math.max(0, 3 - Math.min(ageDays/30, 3));
    } catch(e){}
  }
  return score;
}

// Search endpoints — JSON API used by AJAX suggestion & results page
// /api/search?q=...
app.get('/api/search', async (req,res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ results: [] });
  const qTerms = q.toLowerCase().split(/\s+/).filter(Boolean);

  const tables = ['fatwas','articles','videos','khutbahs'];
  let results = [];

  // First: if Supabase available, attempt to query there (simple ilike)
  if (useSupabase) {
    try {
      for (const t of tables) {
        // attempt to fetch matches via ilike on title/content
        const filter = `%${q}%`;
        // supabase supports or() with filter string; we'll fetch up to 50 items per table
        const { data, error } = await supabase
          .from(t)
          .select('*')
          .or(`title.ilike.${filter},content.ilike.${filter}`)
          .limit(80);
        if (error) {
          console.warn('Supabase search error', t, error);
        } else if (data && data.length) {
          data.forEach(item => {
            const score = scoreItem(qTerms, item);
            results.push({ type: t, item, score });
          });
        }
      }
    } catch (e) {
      console.warn('Supabase search exception', e);
    }
  }

  // Fallback / augment with local JSON search
  try {
    for (const t of tables) {
      const items = load(t) || [];
      items.forEach(item => {
        const s = scoreItem(qTerms, item);
        if (s > 0) results.push({ type: t, item, score: s });
      });
    }
  } catch (e) {
    console.error('local search error', e);
  }

  // merge and sort by score
  results = results.sort((a,b)=>b.score - a.score).slice(0,200);

  // format minimal response
  const out = results.map(r => ({
    type: r.type,
    id: r.item.id,
    title: r.item.title || r.item.name || '',
    snippet: (r.item.content || r.item.description || '').substring(0,240),
    score: r.score
  }));
  res.json({ results: out });
});

// Suggest endpoint for instant suggestions (top 6)
app.get('/api/suggest', async (req,res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ suggestions: [] });
  const { results } = await new Promise((resolve) => {
    req.query.q = q; // reuse api above by calling internal handler would complicate, so call logic similar:
    // quick local-only suggestions for snappy UX
    const qTerms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const tables = ['fatwas','articles','videos','khutbahs'];
    let resl = [];
    for (const t of tables) {
      const items = load(t) || [];
      items.forEach(item => {
        const s = scoreItem(qTerms, item);
        if (s > 0) resl.push({ type: t, id: item.id, title: item.title || item.name || '', score: s });
      });
    }
    resl = resl.sort((a,b)=>b.score - a.score).slice(0,8);
    resolve({ results: resl });
  });
  res.json({ suggestions: results });
});

// Renderer: includes AJAX search box (top) and admin link if logged in.
// The search box will call /api/suggest for suggestions and /search for full results page.
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
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css" rel="stylesheet">
<style>
  body{ background:#fafafa; font-family:'Cairo',sans-serif; color:#222; }
  .header{ background:white; border-bottom:1px solid #eee; padding:18px 0; }
  .logo-box{ display:flex; align-items:center; gap:12px; text-decoration:none; color:#000; }
  .logo-circle{ width:55px; height:55px; border-radius:50%; background:linear-gradient(180deg,#d7b46a 0%,#b48b32 100%); display:flex; justify-content:center; align-items:center; color:white; font-weight:700; font-size:20px; box-shadow:0 3px 10px rgba(0,0,0,.08); }
  .nav-link-custom{ padding:10px 14px; border-radius:8px; color:#444; text-decoration:none; font-weight:600; }
  .nav-link-custom:hover{ background:#f3efe7; }
  .card-modern{ background:white; border:1px solid #e6e6e6; border-radius:12px; padding:20px; margin-bottom:20px; box-shadow:0 2px 8px rgba(0,0,0,.03); }
  .section-title{ font-weight:700; border-right:4px solid #c7a562; padding-right:10px; margin-bottom:18px; }
  footer{ text-align:center; padding:30px 0 10px; color:#777; font-size:14px; }
  .btn-gold{ background:#b48b32; color:white; border:none; padding:8px 16px; border-radius:10px; }
  .btn-gold:hover{ background:#977126; }
  .search-suggestions{ position:absolute; z-index:1200; width:100%; background:white; border:1px solid #eee; border-radius:6px; max-height:320px; overflow:auto; box-shadow:0 6px 18px rgba(0,0,0,.08);}
  .search-input { min-width: 320px; max-width: 520px; }
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
    <div style="position:relative; width:100%; max-width:760px; display:flex; justify-content:flex-end; align-items:center; gap:12px;">
      <div style="flex:1; display:flex; justify-content:center;">
        <div style="width:100%; max-width:520px; position:relative;">
          <form id="searchForm" action="/search" method="GET" onsubmit="return true;">
            <input id="searchInput" name="q" class="form-control search-input" type="search" placeholder="ابحث هنا عن الفتاوى، المقالات، الفيديوهات أو الخطب..." autocomplete="off" value="${qVal}" />
          </form>
          <div id="suggestions" class="search-suggestions" style="display:none;"></div>
        </div>
      </div>
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

<footer>© ${new Date().getFullYear()} فهد بن عبدالله الجربوع — جميع الحقوق محفوظة</footer>

<script>
  // AJAX suggestions
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
          suggestionsBox.innerHTML = s.map(it => \`<div style="padding:10px 12px;border-bottom:1px solid #f0f0f0;"><a href="/\${it.type}/\${it.id}" style="text-decoration:none;color:#222;"><strong>[\${it.type}]</strong> \${it.title}</a></div>\`).join('');
          suggestionsBox.style.display = 'block';
        }).catch(()=>{ suggestionsBox.style.display='none'; });
    }, 220);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#suggestions') && !e.target.closest('#searchInput')) {
      suggestionsBox.style.display = 'none';
    }
  });
  // Allow Enter to submit
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('searchForm').submit();
    }
  });
</script>
</body>
</html>`;
}

// Public routes (home, lists, details) — same logic, with small label changes
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

// Lists & details (fatwas/articles/videos/khutbahs)
app.get('/fatwas', (req,res)=> {
  const items = load('fatwas');
  const body = `<div class="classic-card"><h3 class="section-title">الفتاوى</h3>${items.map(i=>`<article class="mb-3"><h5><a href="/fatwas/${i.id}">${esc(i.title)}</a></h5><p class="meta-muted">${esc(i.createdAt||'')}</p></article>`).join('')}</div>`;
  res.send(renderClassic('الفتاوى', body));
});
app.get('/fatwas/:id', (req,res)=> {
  const item = load('fatwas').find(x=>String(x.id)===String(req.params.id));
  if(!item) return res.send(renderClassic('غير موجود','<div class="classic-card">الفتوى غير موجودة</div>'));
  res.send(renderClassic(item.title, `<div class="classic-card"><h3>${esc(item.title)}</h3><p class="meta-muted">${esc(item.createdAt||'')}</p><div>${sanitizeHtml(item.content||'')}</div></div>`));
});

app.get('/articles', (req,res)=> {
  const items = load('articles');
  const body = `<div class="classic-card"><h3 class="section-title">المقالات</h3>${items.map(i=>`<article class="mb-3"><h5><a href="/articles/${i.id}">${esc(i.title)}</a></h5><p class="meta-muted">${esc(i.createdAt||'')}</p></article>`).join('')}</div>`;
  res.send(renderClassic('المقالات', body));
});
app.get('/articles/:id', (req,res)=> {
  const item = load('articles').find(x=>String(x.id)===String(req.params.id));
  if(!item) return res.send(renderClassic('غير موجود','<div class="classic-card">المقال غير موجود</div>'));
  res.send(renderClassic(item.title, `<div class="classic-card"><h3>${esc(item.title)}</h3><p class="meta-muted">${esc(item.createdAt||'')}</p><div>${sanitizeHtml(item.content||'')}</div></div>`));
});

app.get('/videos', (req,res)=> {
  const items = load('videos');
  const body = `<div class="classic-card"><h3 class="section-title">الفيديوهات</h3>${items.map(i=>`<div class="mb-3"><h5>${esc(i.title)}</h5><p class="meta-muted">${esc(i.createdAt||'')}</p><p><a href="/videos/${i.id}" class="btn btn-outline-brown btn-sm">مشاهدة</a></p></div>`).join('')}</div>`;
  res.send(renderClassic('الفيديوهات', body));
});
app.get('/videos/:id', (req,res)=> {
  const item = load('videos').find(x=>String(x.id)===String(req.params.id));
  if(!item) return res.send(renderClassic('غير موجود','<div class="classic-card">الفيديو غير موجود</div>'));
  let youtubeId = item.youtubeId || extractYouTubeID(item.url||'');
  if(!youtubeId && item.url) youtubeId = extractYouTubeID(item.url||'');
  if(!youtubeId) {
    const body = `<div class="classic-card"><h3>${esc(item.title)}</h3><p>الرابط: <a href="${esc(item.url)}">${esc(item.url)}</a></p><p class="meta-muted">${esc(item.description||'')}</p></div>`;
    return res.send(renderClassic(item.title, body));
  }
  const iframeSrc = `https://www.youtube.com/embed/${youtubeId}`;
  const body = `<div class="classic-card"><h3>${esc(item.title)}</h3><p class="meta-muted">${esc(item.createdAt||'')}</p><div class="ratio ratio-16x9 ratio-vid"><iframe src="${esc(iframeSrc)}" allowfullscreen style="border:0;"></iframe></div><p class="mt-2">${esc(item.description||item.content||'')}</p></div>`;
  res.send(renderClassic(item.title, body));
});

app.get('/khutab', (req,res)=> {
  const items = load('khutbahs');
  const body = `<div class="classic-card"><h3 class="section-title">الخطب المفرغة (PDF)</h3>${items.map(i=>`<div class="mb-3"><h5>${esc(i.title)}</h5><p><a href="/khutbahs/${i.id}" class="btn btn-outline-brown btn-sm">عرض / تحميل PDF</a></p></div>`).join('')}</div>`;
  res.send(renderClassic('الخطب المفرغة', body));
});
app.get('/khutbahs/:id', async (req,res)=> {
  const item = load('khutbahs').find(x=>String(x.id)===String(req.params.id));
  if(!item) return res.send(renderClassic('غير موجود','<div class="classic-card">الخطبة غير موجود</div>'));
  let content = `<div>${sanitizeHtml(item.content||'')}</div>`;
  if (item.fileSupabaseKey && useSupabase && SUPABASE_BUCKET) {
    // get public URL from Supabase storage
    try {
      const { publicURL } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(item.fileSupabaseKey);
      content = `<embed src="${esc(publicURL)}" type="application/pdf" width="100%" height="600px"/>`;
    } catch (e) {
      content = `<div>تعذر الحصول على الملف من التخزين.</div>`;
    }
  } else if (item.file) {
    const fileUrl = `/uploads/khutbahs/${path.basename(item.file)}`;
    content = `<embed src="${fileUrl}" type="application/pdf" width="100%" height="600px"/>`;
  }
  res.send(renderClassic(item.title, `<div class="classic-card"><h3>${esc(item.title)}</h3><p class="meta-muted">${esc(item.createdAt||'')}</p>${content}</div>`));
});

// Search results page (server-rendered)
app.get('/search', async (req,res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.redirect('/');
  // reuse api search
  try {
    const url = '/api/search?q=' + encodeURIComponent(q);
    // call internal handler by direct function rather than HTTP; simpler: call supabase/local search here
    const searchRes = await new Promise((resolve) => {
      // minimal imitation of /api/search logic:
      const qTerms = q.toLowerCase().split(/\s+/).filter(Boolean);
      const tables = ['fatwas','articles','videos','khutbahs'];
      let results = [];
      // try supabase first
      (async () => {
        if (useSupabase) {
          try {
            for (const t of tables) {
              const filter = `%${q}%`;
              const { data, error } = await supabase.from(t).select('*').or(`title.ilike.${filter},content.ilike.${filter}`).limit(80);
              if (!error && data && data.length) {
                data.forEach(item => { results.push({ type: t, item, score: scoreItem(qTerms, item) }); });
              }
            }
          } catch (e) { /* ignore */ }
        }
        // local augmentation
        for (const t of tables) {
          const items = load(t) || [];
          items.forEach(item => {
            const s = scoreItem(qTerms, item);
            if (s > 0) results.push({ type: t, item, score: s });
          });
        }
        results = results.sort((a,b)=>b.score - a.score).slice(0,200);
        resolve(results);
      })();
    });

    const body = `<div class="classic-card"><h3 class="section-title">نتائج البحث (${searchRes.length})</h3>
      <ul class="list-unstyled">${searchRes.map(r=>`<li class="mb-2"><a href="/${r.type}/${r.item.id}">[${esc(r.type)}] ${esc(r.item.title)}</a> <small class="text-muted">score:${(r.score||0).toFixed(1)}</small></li>`).join('')}</ul>
    </div>`;
    res.send(renderClassic('بحث', body, { q }));
  } catch (e) {
    console.error('search page error', e);
    res.send(renderClassic('خطأ', '<div class="classic-card text-danger">حدث خطأ أثناء البحث</div>'));
  }
});

// Ask page and handling (label changed to "أرسل سؤالك")
app.get('/ask-page', (req,res)=> {
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
  const name = sanitizeHtml((req.body.name||'').trim());
  const email = sanitizeHtml((req.body.email||'').trim());
  const question = sanitizeHtml((req.body.question||'').trim());
  if (!name || !email || !question) {
    return res.send(renderClassic('خطأ', '<div class="classic-card text-danger">الرجاء تعبئة جميع الحقول</div>'));
  }

  // create item
  const qs = load('questions') || [];
  let shortId = generateShortId();
  while (qs.find(q => String(q.shortId) === String(shortId))) shortId = generateShortId();

  const id = Date.now();
  const item = { id, shortId, name, email, question, answer:'', status:'new', createdAt: new Date().toISOString() };

  // try supabase insert if available
  if (useSupabase) {
    try {
      const { data, error } = await supabase.from('questions').insert([item]);
      if (error) console.warn('Supabase questions insert failed', error);
    } catch (e) {
      console.warn('Supabase insert exception', e);
    }
  }

  // always save local copy as fallback
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

app.get('/question/:shortId', (req,res)=> {
  const shortId = String(req.params.shortId || '');
  const qs = load('questions') || [];
  const q = qs.find(x => String(x.shortId) === shortId);
  if (!q) return res.status(404).send(renderClassic('غير موجود', '<div class="classic-card">السؤال غير موجود</div>'));
  const answerBlock = q.answer && q.answer.trim() ? `<h5>الجواب:</h5><div class="card-modern" style="white-space:pre-wrap;">${esc(q.answer)}</div>` : `<p style="color:gray;">لم يتم الرد بعد — راجع هذا الرابط لاحقًا.</p>`;
  const body = `<div class="classic-card"><h3 class="section-title">سؤالك</h3><p><strong>من:</strong> ${esc(q.name)}</p><div class="card-modern" style="white-space:pre-wrap;">${esc(q.question)}</div><div class="mt-3">${answerBlock}</div></div>`;
  res.send(renderClassic('عرض السؤال', body));
});

// Admin auth & middleware
function requireAdmin(req,res,next) {
  if (!req.session || !req.session.isAdmin) return res.redirect('/admin/login');
  next();
}
app.get('/admin/login', (req,res)=> {
  const form = `<div class="classic-card"><h3 class="section-title">دخول المدير</h3>
    <form method="POST" action="/admin/login">
      <div class="mb-2"><input name="user" class="form-control" placeholder="اسم المستخدم" required></div>
      <div class="mb-2"><input name="pass" type="password" class="form-control" placeholder="كلمة السر" required></div>
      <button class="btn btn-brown">دخول</button>
    </form></div>`;
  res.send(renderClassic('دخول الادمن', form));
});
app.post('/admin/login', (req,res)=> {
  const u = (req.body.user||'').trim();
  const p = (req.body.pass||'').trim();
  if (u === ADMIN_USER && p === ADMIN_PASS) { req.session.isAdmin = true; return res.redirect('/admin'); }
  res.send(renderClassic('خطأ', '<div class="classic-card text-danger">بيانات الدخول خاطئة</div>'));
});
app.get('/admin/logout', (req,res)=> { req.session.isAdmin = false; res.redirect('/admin/login'); });

// Admin dashboard + management (JSON manager + file upload to Supabase)
app.get('/admin', requireAdmin, (req,res)=> {
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

// Generic manage page and add/delete handlers
app.get('/admin/manage/:type', requireAdmin, (req,res)=> {
  const type = req.params.type;
  const items = load(type) || [];
  let addFields = '';
  if (type === 'videos') addFields = `<div class="mb-2"><label>رابط يوتيوب أو ID</label><input name="url" class="form-control" placeholder="https://www.youtube.com/watch?v=... أو ID"></div>`;
  if (type === 'khutbahs') addFields = `<div class="mb-2"><label>رفع ملف PDF</label><input type="file" name="file" accept="application/pdf" class="form-control"></div>`;
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

// Add khutbah: supports Supabase storage upload when configured, otherwise local disk
app.post('/admin/add/khutbahs', requireAdmin, upload.single('file'), async (req,res) => {
  try {
    const list = load('khutbahs') || [];
    const id = Date.now();
    let fileLocal = '';
    let fileSupabaseKey = '';

    if (req.file) {
      // if Supabase configured and we used memoryStorage, req.file.buffer exists
      if (useSupabase && SUPABASE_BUCKET && req.file.buffer) {
        const filename = `${Date.now()}-${safeFilename(req.file.originalname)}`;
        const key = `khutbahs/${filename}`;
        try {
          const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).upload(key, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
          if (error) {
            console.warn('Supabase upload error', error);
            // fallback: save to disk if possible
            const diskPath = path.join(KHUTBAHS_DIR, filename);
            fs.writeFileSync(diskPath, req.file.buffer);
            fileLocal = path.join('khutbahs', filename);
          } else {
            fileSupabaseKey = key;
          }
        } catch (e) {
          console.warn('Exception uploading to supabase', e);
          // fallback to disk
          const filename = `${Date.now()}-${safeFilename(req.file.originalname)}`;
          const diskPath = path.join(KHUTBAHS_DIR, filename);
          fs.writeFileSync(diskPath, req.file.buffer);
          fileLocal = path.join('khutbahs', filename);
        }
      } else if (req.file.path) {
        fileLocal = path.join('khutbahs', path.basename(req.file.path));
      }
    }

    const obj = { id, title: sanitizeHtml(req.body.title||''), content: sanitizeHtml(req.body.content||''), file: fileLocal, fileSupabaseKey, createdAt: new Date().toISOString() };
    list.push(obj);
    save('khutbahs', list);

    // optionally insert into Supabase table 'khutbahs' for indexing (if exists)
    if (useSupabase) {
      try {
        await supabase.from('khutbahs').insert([{ id: obj.id, title: obj.title, content: obj.content, file_key: obj.fileSupabaseKey || obj.file }]);
      } catch (e) { /* ignore */ }
    }

    res.redirect('/admin/manage/khutbahs');
  } catch (e) {
    console.error('add khutbah error', e);
    res.status(500).send(renderClassic('خطأ','<div class="classic-card text-danger">فشل رفع الخطبة</div>', { admin:true }));
  }
});

// Add generic (videos processing)
app.post('/admin/add/:type', requireAdmin, (req,res) => {
  const type = req.params.type;
  if (type === 'questions') return res.status(400).send('غير مسموح');
  const list = load(type) || [];
  const id = Date.now();
  const item = { id, title: sanitizeHtml(req.body.title||''), content: sanitizeHtml(req.body.content||''), createdAt: new Date().toISOString() };
  if (type === 'videos') {
    const url = (req.body.url||'').trim();
    const youtubeId = extractYouTubeID(url);
    item.url = url;
    if (youtubeId) item.youtubeId = youtubeId;
  }
  list.push(item);
  save(type, list);
  // optionally insert into Supabase table for indexing
  if (useSupabase) {
    const insertDoc = async () => {
      try { await supabase.from(type).insert([item]); } catch (e) { /* ignore */ }
    };
    insertDoc();
  }
  res.redirect('/admin/manage/' + type);
});

app.post('/admin/delete/:type/:id', requireAdmin, (req,res) => {
  const type = req.params.type;
  let list = load(type) || [];
  list = list.filter(i => String(i.id) !== String(req.params.id));
  save(type, list);
  res.redirect('/admin/manage/'+type);
});

// Admin questions list & operations (reply/delete/convert to fatwa)
app.get('/admin/questions', requireAdmin, (req,res)=> {
  const qs = load('questions') || [];
  const rows = qs.map(q=>`<tr><td>${q.id}</td><td>${esc(q.name)}</td><td>${esc(q.email)}</td><td>${esc((q.question||'').substring(0,80))}...</td><td>${esc(q.createdAt||'')}</td><td><a class="btn btn-sm btn-primary" href="/admin/question/${q.id}">عرض</a></td></tr>`).join('');
  const body = `<div class="classic-card"><h3 class="section-title">أسئلة الزوار</h3><table class="table"><thead><tr><th>ID</th><th>الاسم</th><th>البريد</th><th>مقتطف</th><th>التاريخ</th><th>عرض</th></tr></thead><tbody>${rows}</tbody></table><p><a href="/admin" class="btn btn-outline-brown">رجوع</a></p></div>`;
  res.send(renderClassic('اسئلة الزوار', body, { admin:true }));
});

app.get('/admin/question/:id', requireAdmin, (req,res)=> {
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

app.get('/admin/question/:id/reply', requireAdmin, (req,res)=> {
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

app.post('/admin/question/:id/reply', requireAdmin, (req,res)=> {
  const qs = load('questions') || [];
  const idx = qs.findIndex(x=>String(x.id)===String(req.params.id));
  if (idx === -1) return res.send(renderClassic('خطأ','<div class="classic-card">السؤال غير موجود</div>', { admin:true }));
  qs[idx].answer = sanitizeHtml(req.body.answer || '');
  qs[idx].answeredAt = new Date().toISOString();
  qs[idx].status = 'answered';
  save('questions', qs);
  // update in supabase if possible
  if (useSupabase) {
    (async ()=> {
      try { await supabase.from('questions').update({ answer: qs[idx].answer, status: 'answered', answeredAt: qs[idx].answeredAt }).eq('id', qs[idx].id); } catch(e) {}
    })();
  }
  res.redirect('/admin/question/' + req.params.id);
});

app.get('/admin/question/:id/delete', requireAdmin, (req,res)=> {
  let qs = load('questions') || [];
  qs = qs.filter(x => String(x.id) !== String(req.params.id));
  save('questions', qs);
  if (useSupabase) {
    (async ()=> {
      try { await supabase.from('questions').delete().eq('id', Number(req.params.id)); } catch(e) {}
    })();
  }
  res.redirect('/admin/questions');
});

app.get('/admin/question/:id/tofatwa', requireAdmin, (req,res)=> {
  const qs = load('questions') || [];
  const q = qs.find(x=>String(x.id)===String(req.params.id));
  if (!q) return res.send(renderClassic('خطأ','<div class="classic-card">السؤال غير موجود</div>', { admin:true }));
  const fatwas = load('fatwas') || [];
  fatwas.push({ id: Date.now(), title: `سؤال من: ${q.name}`, content: `${q.question}\n\n---\nالجواب:\n${q.answer||'لم يتم الرد بعد'}`, createdAt: new Date().toISOString() });
  save('fatwas', fatwas);
  // optionally insert into supabase 'fatwas' table
  if (useSupabase) {
    (async ()=> {
      try { await supabase.from('fatwas').insert([{ id: fatwas[fatwas.length-1].id, title: fatwas[fatwas.length-1].title, content: fatwas[fatfas.length-1].content }]); } catch(e){/*ignore*/ }
    })();
  }
  res.redirect('/admin/manage/fatwas');
});

// JSON manager (list, edit, create, download) - for advanced control
function safeJsonFilename(name) {
  if(!name || typeof name !== 'string') return null;
  if(!/^[A-Za-z0-9_\-]+$/.test(name)) return null;
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

app.get('/admin/json/:name/download', requireAdmin, (req,res)=>{
  const name = safeJsonFilename(req.params.name);
  if (!name) return res.status(400).send(renderClassic('خطأ','<div class="classic-card">اسم غير صالح</div>', { admin:true }));
  const p = path.join(DATA_DIR, name + '.json');
  if (!fs.existsSync(p)) return res.status(404).send(renderClassic('غير موجود','<div class="classic-card">الملف غير موجود</div>', { admin:true }));
  res.download(p, `${name}.json`);
});

app.get('/admin/json/:name', requireAdmin, (req,res)=>{
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

app.post('/admin/json/:name/save', requireAdmin, (req,res)=>{
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
    console.error('save json error', e);
    res.status(500).send(renderClassic('خطأ','<div class="classic-card text-danger">فشل الحفظ</div>', { admin:true }));
  }
});

app.post('/admin/json/create', requireAdmin, (req,res)=>{
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

// Start server
app.listen(PORT, ()=> {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Admin credentials: ${ADMIN_USER} / ${ADMIN_PASS}`);
  console.log(`Data dir: ${DATA_DIR} (persistent disk: ${USE_PERSISTENT_DISK})`);
  if (useSupabase) console.log(`Supabase enabled. Bucket: ${SUPABASE_BUCKET || '(not set)'}`);
});

/**
 * README - خطوات تفعيل Supabase بشكل كامل (مقترح)
 *
 * 1) إنشاء مشروع Supabase ونسخ SUPABASE_URL و SUPABASE_KEY إلى متغيرات بيئتك.
 * 2) أنشئ Bucket (مثل 'public' أو 'khutbahs') في Storage، واجعل السياسات مناسبة:
 *    - إن أردت روابط عامة للـ PDFs، اجعل الـ bucket عام أو استخدم CDN.
 *    - إن أردت خصوصية، استخدم signed URLs عبر supabase.storage.from(bucket).createSignedUrl(key, expiry).
 * 3) (اختياري) أنشئ جداول Postgres: fatwas, articles, videos, khutbahs, questions
 *    كل جدول يمكن أن يحوي الأعمدة: id (bigint), title (text), content (text), createdAt (timestamp), file_key (text)
 *    مثال SQL سريع لإنشاء جدول الأسئلة:
 *      create table questions (id bigint primary key, shortId text, name text, email text, question text, answer text, status text, createdAt timestamptz);
 * 4) بعد التفعيل، عمليات الرفع في لوحة الإدارة ستقوم بتحميل الملفات إلى Storage وحفظ مفتاحها في khutbahs JSON.
 *
 * ملاحظات استرجاع الملفات المفقودة على Render/HEROKU:
 * - إن لم تكن تستخدم Supabase أو قرص دائم، فإن الملفات التي رفعت إلى نظام ملفات الحاوية قد تُمحى عند إعادة النشر.
 * - الحل: استخدم Supabase Storage أو قرص دائم من مزود الاستضافة.
 *
 * إن كنت تريد:
 * - ربط البحث بقوة أكبر (فهرسة كاملة + فهرس Postgres tsvector أو ElasticSearch)، أقدر أضيف Migration SQL وWebhook وRPC لعمل بحث FTS.
 * - واجهة إدارة أكثر تفاعلية (SPA React/Vue) مع API مؤمن عبر JWT — أقدر أعدّلك ذلك.
 *
 * أخبرني أي نقطة تحب أطبقها الآن:
 * - إعداد تام للـ Supabase (أعدّل الكود لإجراء تحقق/توقيع وتحميل مباشر مع روابط موقعة)؟ أم
 * - إضافة فهرسة FTS في Postgres (أرسل لي صلاحيات/SQL لأقوم بعمل الدوال)؟ أم
 * - بناء واجهة إدارة React منفصلة للـ admin؟ أم
 * - أعدّ نسخة مصغرة ومُجربة محلياً أولاً ثم ننتقل للإنتاج؟
 */
