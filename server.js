// ---------------------
// server.js — Render Ready
// ---------------------

const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();

// ---------------------
// إعدادات Render (مهم جدًا)
// ---------------------
app.set("trust proxy", 1);

app.use(session({
    secret: "admin_panel_secure_key_2025",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,        // Render uses HTTPS
        sameSite: "none",    // Required for Render cookies
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 6
    }
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));


// ---------------------
// بيانات الموقع
// ---------------------
const DATA = {
    fatwas: "./data/fatwas.json",
    articles: "./data/articles.json",
    videos: "./data/videos.json",
    questions: "./data/questions.json"
};

function load(file) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
    return JSON.parse(fs.readFileSync(file));
}
function save(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}


// ---------------------
// إعداد الدخول
// ---------------------
const ADMIN_USER = "admin";
const ADMIN_PASS = "1234";

function requireAdmin(req, res, next) {
    if (!req.session.isAdmin) return res.redirect("/admin/login");
    next();
}


// ---------------------
// اختصار Alt+Shift+V
// ---------------------
app.get("/key", (req, res) => {
    res.send(`
<script>
document.addEventListener("keydown", e => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === "v") {
        window.location.href = "/admin";
    }
});
</script>
    `);
});


// ---------------------
// الواجهة الرئيسية
// ---------------------
app.get("/", (req, res) => {
    const fatwas = load(DATA.fatwas);
    const articles = load(DATA.articles);
    const videos = load(DATA.videos);

    res.send(`
<html>
<head>
<title>موقع فهد بن عبدالله الجربوع</title>
<meta charset="utf-8">
<style>
body{font-family:Tahoma;padding:20px;background:#fafafa}
.box{padding:15px;margin:10px;background:#fff;border-radius:10px;border:1px solid #ddd}
h2{margin-top:40px}
</style>
</head>
<body>

<h1>موقع فهد بن عبدالله الجربوع</h1>

<h2>الفتاوى</h2>
${fatwas.map(f=>`<div class="box"><b>${f.title}</b><br>${f.body}</div>`).join("")}

<h2>المقالات</h2>
${articles.map(a=>`<div class="box"><b>${a.title}</b><br>${a.body}</div>`).join("")}

<h2>الفيديوهات</h2>
${videos.map(v=>`<div class="box"><b>${v.title}</b><br><a href="${v.url}">رابط الفيديو</a></div>`).join("")}

<script src="/key"></script>

</body>
</html>
    `);
});


// ---------------------
// صفحة تسجيل الدخول
// ---------------------
app.get("/admin/login", (req, res) => {
    res.send(`
<html><head><meta charset="utf-8">
<style>
body{background:#f5f5f5;font-family:Tahoma;padding:40px}
form{width:300px;margin:auto;background:#fff;padding:20px;border-radius:10px}
input{width:100%;padding:10px;margin:10px 0}
button{padding:10px;width:100%;background:#333;color:#fff;border:0;border-radius:10px}
</style>
</head>
<body>

<form method="POST">
<h3>تسجيل الدخول</h3>
<input name="username" placeholder="اسم المستخدم">
<input name="password" type="password" placeholder="كلمة المرور">
<button>دخول</button>
</form>

</body></html>
    `);
});

app.post("/admin/login", (req, res) => {
    const { username, password } = req.body;

    if (username === ADMIN_USER && password === ADMIN_PASS) {
        req.session.isAdmin = true;
        return res.redirect("/admin");
    }
    res.send(`<meta charset="utf-8">خطأ في البيانات <a href="/admin/login">عودة</a>`);
});

app.get("/admin/logout", (req, res) => {
    req.session.isAdmin = false;
    res.redirect("/admin/login");
});


// ---------------------
// لوحة التحكم
// ---------------------
app.get("/admin", requireAdmin, (req, res) => {
    res.send(`
<html><head><meta charset="utf-8">
<style>
body{font-family:Tahoma;padding:20px;background:#fafafa}
a{display:block;margin:10px;padding:12px;background:#333;color:#fff;border-radius:8px;text-decoration:none}
</style>
</head>
<body>

<h2>لوحة التحكم</h2>

<a href="/admin/fatwas">إدارة الفتاوى</a>
<a href="/admin/articles">إدارة المقالات</a>
<a href="/admin/videos">إدارة الفيديوهات</a>
<a href="/admin/questions">أسئلة الزوار</a>
<a style="background:#900" href="/admin/logout">تسجيل خروج</a>

</body></html>
`);
});


// ---------------------
// إدارة الفتاوى
// ---------------------
app.get("/admin/fatwas", requireAdmin, (req, res) => {
    const list = load(DATA.fatwas);

    res.send(`
<meta charset="utf-8">
<h2>الفتاوى</h2>
${list.map(x=>`<div><b>${x.title}</b> — <a href="/admin/fatwas/delete/${x.id}">حذف</a></div>`).join("")}
<br>
<form method="POST">
<input name="title" placeholder="العنوان">
<textarea name="body" placeholder="النص"></textarea>
<button>إضافة</button>
</form>
`);
});

app.post("/admin/fatwas", requireAdmin, (req, res) => {
    const list = load(DATA.fatwas);
    list.push({ id: Date.now(), title: req.body.title, body: req.body.body });
    save(DATA.fatwas, list);
    res.redirect("/admin/fatwas");
});

app.get("/admin/fatwas/delete/:id", requireAdmin, (req, res) => {
    let list = load(DATA.fatwas);
    list = list.filter(x => x.id != req.params.id);
    save(DATA.fatwas, list);
    res.redirect("/admin/fatwas");
});


// ---------------------
// إدارة المقالات
// ---------------------
app.get("/admin/articles", requireAdmin, (req, res) => {
    const list = load(DATA.articles);

    res.send(`
<meta charset="utf-8">
<h2>المقالات</h2>
${list.map(x=>`<div><b>${x.title}</b> — <a href="/admin/articles/delete/${x.id}">حذف</a></div>`).join("")}
<br>
<form method="POST">
<input name="title" placeholder="العنوان">
<textarea name="body" placeholder="النص"></textarea>
<button>إضافة</button>
</form>
`);
});

app.post("/admin/articles", requireAdmin, (req, res) => {
    const list = load(DATA.articles);
    list.push({ id: Date.now(), title: req.body.title, body: req.body.body });
    save(DATA.articles, list);
    res.redirect("/admin/articles");
});

app.get("/admin/articles/delete/:id", requireAdmin, (req, res) => {
    let list = load(DATA.articles);
    list = list.filter(x => x.id != req.params.id);
    save(DATA.articles, list);
    res.redirect("/admin/articles");
});


// ---------------------
// إدارة الفيديوهات
// ---------------------
app.get("/admin/videos", requireAdmin, (req, res) => {
    const list = load(DATA.videos);

    res.send(`
<meta charset="utf-8">
<h2>الفيديوهات</h2>
${list.map(x=>`<div><b>${x.title}</b> — <a href="${x.url}">مشاهدة</a> — <a href="/admin/videos/delete/${x.id}">حذف</a></div>`).join("")}
<br>
<form method="POST">
<input name="title" placeholder="العنوان">
<input name="url" placeholder="رابط الفيديو">
<button>إضافة</button>
</form>
`);
});

app.post("/admin/videos", requireAdmin, (req, res) => {
    const list = load(DATA.videos);
    list.push({ id: Date.now(), title: req.body.title, url: req.body.url });
    save(DATA.videos, list);
    res.redirect("/admin/videos");
});

app.get("/admin/videos/delete/:id", requireAdmin, (req, res) => {
    let list = load(DATA.videos);
    list = list.filter(x => x.id != req.params.id);
    save(DATA.videos, list);
    res.redirect("/admin/videos");
});


// ---------------------
// إدارة الأسئلة
// ---------------------
app.get("/admin/questions", requireAdmin, (req, res) => {
    const list = load(DATA.questions);
    res.send(`
<meta charset="utf-8">
<h2>أسئلة الزوار</h2>
${list.map(q=>`
<div style="padding:10px;border:1px solid #ccc;margin:10px">
<b>${q.name}</b><br>
${q.question}<br>
<a href="/admin/questions/delete/${q.id}">حذف</a>
</div>
`).join("")}
`);
});

app.get("/admin/questions/delete/:id", requireAdmin, (req, res) => {
    let list = load(DATA.questions);
    list = list.filter(x => x.id != req.params.id);
    save(DATA.questions, list);
    res.redirect("/admin/questions");
});


// ---------------------
// تشغيل السيرفر
// ---------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("RUN ON PORT", PORT));
