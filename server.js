// ============================================
// CENTRINSIC NPT SERVER — FULLY UPDATED
// WITH: 8-DAY RSS QUEUE SYSTEM + AUTO-PUBLISH
// WITH: PASSWORD OR OTP ADMIN AUTH
// WITH: FREE RSS FEEDS FOR AI-D (35/day × 8 days)
// ============================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const os = require('os');
const axios = require('axios');
const crypto = require('crypto');
const Parser = require('rss-parser');

const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ktt-news-secret-key-2024';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// RSS Parser instance
const rssParser = new Parser({
    timeout: 10000,
    headers: { 'User-Agent': 'CentrinsicNPT/1.0' }
});

// GNEWS
const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const GNEWS_BASE_URL = 'https://gnews.io/api/v4';
const CACHE_DURATION = (parseInt(process.env.GNEWS_CACHE_MINUTES) || 60) * 60 * 1000;
const MANUAL_ARTICLES_LIMIT = 0;
const GNEWS_ARTICLES_LIMIT = 10;
const MAX_GNEWS_PER_REQUEST = 10;

let gnewsCache = [];
let lastFetchTime = 0;
let cacheStatus = { lastSuccessfulFetch: null, lastError: null, totalFetches: 0, isStale: false };
const DEBUG = true;
function log(...args) { if (DEBUG) console.log('[DEBUG]', ...args); }

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal && !name.includes('Virtual')) return iface.address;
        }
    }
    return 'localhost';
}
const LOCAL_IP = getLocalIP();
console.log('📡 Local IP:', LOCAL_IP);

// ============================================
// MONGODB
// ============================================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => { console.error('❌ MongoDB Failed:', err.message); process.exit(1); });

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
        folder: "centrinsic-npt", format: "jpg",
        transformation: [{ width: 1000, crop: "limit", quality: "auto" }]
    })
});
const upload = multer({ storage });

// ============================================
// BREVO OTP
// ============================================
const brevo = require('@getbrevo/brevo');
const emailApi = new brevo.TransactionalEmailsApi();
emailApi.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

async function sendOTPEmail(toEmail, otp) {
    try {
        const sendSmtpEmail = new brevo.SendSmtpEmail();
        sendSmtpEmail.sender = { email: "centrinsicnpt@gmail.com", name: "Centrinsic NPT" };
        sendSmtpEmail.to = [{ email: toEmail }];
        sendSmtpEmail.subject = "Your Centrinsic NPT Login Code";
        sendSmtpEmail.htmlContent = `
            <div style="font-family:Arial;padding:20px">
                <h2>Centrinsic NPT Verification</h2>
                <p>Your OTP:</p>
                <h1 style="letter-spacing:6px">${otp}</h1>
                <p>Expires in 5 minutes</p>
            </div>`;
        await emailApi.sendTransacEmail(sendSmtpEmail);
        console.log("✅ OTP SENT:", toEmail);
        return true;
    } catch (error) {
        console.error("❌ BREVO ERROR:", error.response?.text || error.message);
        return false;
    }
}

// ============================================
// SCHEMAS
// ============================================
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true, required: true },
    password: String,
    created_at: { type: Date, default: Date.now }
});

const articleSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    image: String,
    source: { type: String, default: 'Centrinsic NPT' },
    category: { type: String, default: 'General' },
    originalLink: { type: String, default: '' },
    isManual: { type: Boolean, default: true },
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    expiresAt: { type: Date },
    author_id: mongoose.Schema.Types.ObjectId,
    author_name: String
}, { timestamps: true });

// UPCOMING / QUEUED ARTICLES (For 8-Day Auto-Upload)
const upcomingArticleSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    image: String,
    source: { type: String, default: 'Centrinsic NPT' },
    category: { type: String, default: 'General' },
    originalLink: { type: String, default: '' },
    isManual: { type: Boolean, default: true },
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    expiresAt: { type: Date },
    author_id: mongoose.Schema.Types.ObjectId,
    author_name: String,
    targetDate: { type: Date, required: true },
    dayLabel: { type: String },
    isRSS: { type: Boolean, default: false }
}, { timestamps: true });

const bookmarkSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    article_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Article' },
    created_at: { type: Date, default: Date.now }
});

const userEmailSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    device: String,
    created_at: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Article = mongoose.model('Article', articleSchema);
const UpcomingArticle = mongoose.model('UpcomingArticle', upcomingArticleSchema);
const Bookmark = mongoose.model('Bookmark', bookmarkSchema);
const UserEmail = mongoose.model('UserEmail', userEmailSchema);

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-admin-password'],
    credentials: true
}));

app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, x-admin-password');
        return res.sendStatus(204);
    }
    next();
});

app.use((req, res, next) => {
    const type = req.headers['content-type'] || '';
    if (type.includes('multipart/form-data')) return next();
    express.json({ limit: '10mb' })(req, res, next);
});

app.use((req, res, next) => {
    const type = req.headers['content-type'] || '';
    if (type.includes('multipart/form-data')) return next();
    express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
});

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
    next();
});

app.use(express.static(path.join(__dirname, 'front-end')));

// ============================================
// AUTH MIDDLEWARES
// ============================================

// Standard OTP/JWT middleware
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.userName = decoded.name;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Admin password check (standalone) — FIXED
const checkAdminPassword = (passwordInput) => {
    if (!ADMIN_PASSWORD || !passwordInput) return false;
    try {
        const input = String(passwordInput).trim();
        const expected = String(ADMIN_PASSWORD).trim();
        
        // Use timing-safe comparison with direct string match first
        if (input.length !== expected.length) return false;
        
        const provided = crypto.createHash('sha256').update(Buffer.from(input)).digest();
        const expectedHash = crypto.createHash('sha256').update(Buffer.from(expected)).digest();
        return crypto.timingSafeEqual(provided, expectedHash);
    } catch (e) { 
        console.error('Admin password check error:', e.message);
        return false; 
    }
};

// COMBINED: Password OR OTP
const adminAuthMiddleware = async (req, res, next) => {
    const adminPassword = req.headers['x-admin-password'] || req.query.admin_password;

    // Debug log
    if (adminPassword) {
        console.log('🔐 Admin password attempt received');
        console.log('   ADMIN_PASSWORD env exists:', !!ADMIN_PASSWORD);
        console.log('   Check result:', checkAdminPassword(adminPassword));
    }



    if (adminPassword && checkAdminPassword(adminPassword)) {
        const adminUser = await User.findOne({ email: "centrinsicnpt@gmail.com" });
        req.userId = adminUser ? adminUser._id.toString() : null;
        req.userName = adminUser ? adminUser.name : 'Admin';
        req.isAdminPassword = true;
        return next();
    }

    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({
                error: 'Admin access denied. Provide either: (1) x-admin-password header / admin_password query param, or (2) valid OTP Bearer token.'
            });
        }
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (!user || user.email !== "centrinsicnpt@gmail.com") {
            return res.status(403).json({ error: 'Only admin allowed via OTP' });
        }
        req.userId = decoded.userId;
        req.userName = decoded.name;
        req.isAdminPassword = false;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired token. Use admin password or login with OTP.' });
    }
};

// ============================================
// RSS FEEDS CONFIGURATION (FREE — NO API KEY)
// ============================================
const RSS_FEEDS = [
    { name: 'BBC News', url: 'http://feeds.bbci.co.uk/news/rss.xml', category: 'World' },
    { name: 'BBC World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', category: 'World' },
    { name: 'Reuters', url: 'http://feeds.reuters.com/reuters/topNews', category: 'World' },
    { name: 'Reuters World', url: 'http://feeds.reuters.com/reuters/worldNews', category: 'World' },
    { name: 'Times of India', url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', category: 'India' },
    { name: 'TOI India', url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms', category: 'India' },
    { name: 'The Hindu', url: 'https://www.thehindu.com/news/national/?service=rss', category: 'India' },
    { name: 'Hindu Business', url: 'https://www.thehindu.com/business/?service=rss', category: 'Business' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'Technology' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'Technology' },
    { name: 'ESPN', url: 'https://www.espn.com/espn/rss/news', category: 'Sports' },
    { name: 'ESPN Cricket', url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml', category: 'Sports' },
    { name: 'CNN', url: 'http://rss.cnn.com/rss/edition.rss', category: 'World' },
    { name: 'CNN Tech', url: 'http://rss.cnn.com/rss/edition_technology.rss', category: 'Technology' },
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'World' },
    { name: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml', category: 'World' },
    { name: 'NPR Tech', url: 'https://feeds.npr.org/1019/rss.xml', category: 'Technology' },
    { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', category: 'Science' },
    { name: 'Space.com', url: 'https://www.space.com/feeds/all', category: 'Science' },
    { name: 'Entertainment Weekly', url: 'https://feeds.ew.com/entertainment/all', category: 'Entertainment' }
];

// Fetch RSS articles
async function fetchRSSArticles(targetCount = 35) {
    const allArticles = [];
    const errors = [];

    for (const feed of RSS_FEEDS) {
        if (allArticles.length >= targetCount) break;
        try {
            const feedData = await rssParser.parseURL(feed.url);
            const items = feedData.items.slice(0, 5);

            for (const item of items) {
                if (allArticles.length >= targetCount) break;

                let content = item.content || item.contentSnippet || item.summary || item.description || 'No content available';
                content = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                if (content.length < 100) content = item.title + '. ' + content;
                if (content.length > 1200) content = content.substring(0, 1200) + '...';

                let imageUrl = null;
                if (item.enclosure && item.enclosure.url) imageUrl = item.enclosure.url;
                else if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) imageUrl = item['media:content'].$.url;
                else if (item['media:thumbnail'] && item['media:thumbnail'].$ && item['media:thumbnail'].$.url) imageUrl = item['media:thumbnail'].$.url;

                allArticles.push({
                    title: item.title || 'Untitled',
                    content: content,
                    source: feed.name,
                    category: feed.category,
                    image: imageUrl,
                    originalLink: item.link || item.guid || '',
                    isRSS: true
                });
            }
        } catch (err) {
            errors.push(`${feed.name}: ${err.message}`);
        }
    }

    console.log(`📡 RSS fetched: ${allArticles.length} articles (${errors.length} errors)`);
    if (errors.length > 0) console.log('   Errors:', errors.slice(0, 3).join(', '));
    return allArticles;
}

// Queue RSS articles for 8 days (35 per day)
async function queueRSSFor8Days() {
    const now = new Date();
    const perDay = 35;
    const days = 8;

    console.log(`\n📅 Queueing RSS articles for ${days} days (${perDay}/day)...`);

    for (let day = 0; day < days; day++) {
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + day + 1);
        targetDate.setHours(0, 0, 0, 0);

        const articles = await fetchRSSArticles(perDay);
        if (articles.length === 0) {
            console.log(`   Day ${day + 1}: No articles fetched`);
            continue;
        }

        for (const article of articles) {
            await UpcomingArticle.create({
                title: article.title,
                content: article.content,
                image: article.image,
                source: article.source,
                category: article.category,
                originalLink: article.originalLink,
                isManual: true,
                status: 'published',
                targetDate: targetDate,
                dayLabel: `Day ${day + 1}`,
                isRSS: true,
                author_name: 'RSS Auto-Fetch'
            });
        }

        console.log(`   ✅ Day ${day + 1} (${targetDate.toDateString()}): ${articles.length} articles queued`);
        await new Promise(r => setTimeout(r, 1500));
    }

    console.log('🎉 All 8 days queued!\n');
}

// ============================================
// GNEWS FETCH
// ============================================
async function fetchGNewsArticles(targetLimit = GNEWS_ARTICLES_LIMIT) {
    const now = Date.now();
    if (gnewsCache.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
        const age = Math.round((now - lastFetchTime) / 60000);
        console.log(`📦 Cached GNews (${age}m old), ${gnewsCache.length} articles`);
        cacheStatus.isStale = false;
        return gnewsCache.slice(0, targetLimit);
    }
    if (!GNEWS_API_KEY) {
        cacheStatus.lastError = 'API key not configured';
        return gnewsCache.length > 0 ? gnewsCache.slice(0, targetLimit) : [];
    }
    try {
        console.log('🌐 Fetching GNews...');
        const response = await axios.get(`${GNEWS_BASE_URL}/top-headlines`, {
            params: { token: GNEWS_API_KEY, lang: 'en', country: 'us', max: MAX_GNEWS_PER_REQUEST },
            timeout: 10000
        });
        const articles = (response.data?.articles || []).map((a, i) => ({
            _id: `gnews_${Date.now()}_${i}`,
            title: a.title,
            content: a.content || a.description || 'No content available',
            description: a.description,
            image: a.image || null,
            url: a.url,
            source: a.source?.name || 'GNews',
            category: 'General',
            publishedAt: a.publishedAt,
            createdAt: a.publishedAt,
            isManual: false,
            originalLink: a.url,
            fetchedAt: new Date().toISOString()
        }));
        gnewsCache = articles;
        lastFetchTime = now;
        cacheStatus = { lastSuccessfulFetch: new Date().toISOString(), lastError: null, totalFetches: cacheStatus.totalFetches + 1, isStale: false };
        console.log(`✅ GNews fetched: ${articles.length} articles`);
        return articles.slice(0, targetLimit);
    } catch (error) {
        console.error('❌ GNews error:', error.message);
        cacheStatus.lastError = error.response?.status ? `HTTP ${error.response.status}` : error.message;
        cacheStatus.isStale = true;
        return gnewsCache.length > 0 ? gnewsCache.slice(0, targetLimit) : [];
    }
}

// ============================================
// ROUTES
// ============================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK', timestamp: new Date().toISOString(),
        dbConnected: mongoose.connection.readyState === 1,
        gnewsConfigured: !!GNEWS_API_KEY,
        cache: {
            lastFetch: cacheStatus.lastSuccessfulFetch,
            articlesCached: gnewsCache.length,
            isStale: cacheStatus.isStale,
            cacheDurationMinutes: CACHE_DURATION / 60000
        }
    });
});

app.get('/api/articles', async (req, res) => {
    try {
        let manualQuery = Article.find({
            status: 'published',
            $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: { $exists: false } }]
        }).sort({ createdAt: -1 });
        if (MANUAL_ARTICLES_LIMIT > 0) manualQuery = manualQuery.limit(MANUAL_ARTICLES_LIMIT);

        const manualArticles = await manualQuery;
        const formattedManual = manualArticles.map(a => ({
            _id: a._id.toString(), title: a.title, content: a.content, image: a.image,
            source: a.source || 'Centrinsic NPT', category: a.category || 'General',
            originalLink: a.originalLink || '', createdAt: a.createdAt, updatedAt: a.updatedAt,
            isManual: true, author_name: a.author_name
        }));

        const gnews = await fetchGNewsArticles(GNEWS_ARTICLES_LIMIT);
        const all = [...formattedManual, ...gnews];
        const lastUpdated = cacheStatus.lastSuccessfulFetch || new Date().toISOString();
        const cacheAge = lastFetchTime ? Math.round((Date.now() - lastFetchTime) / 60000) : 0;

        res.json({
            success: true, articles: all,
            meta: {
                total: all.length, manualCount: formattedManual.length, gnewsCount: gnews.length,
                lastUpdated, cacheAgeMinutes: cacheAge,
                isCached: cacheAge < (CACHE_DURATION / 60000)
            }
        });
    } catch (err) {
        console.error('❌ Get articles error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// ADMIN ROUTES — Password OR OTP
// ============================================

app.post('/api/admin/refresh-gnews', adminAuthMiddleware, async (req, res) => {
    try {
        lastFetchTime = 0; gnewsCache = [];
        const fresh = await fetchGNewsArticles(GNEWS_ARTICLES_LIMIT);
        res.json({ success: true, count: fresh.length, lastUpdated: cacheStatus.lastSuccessfulFetch, message: 'Cache refreshed' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/admin/cache-status', adminAuthMiddleware, async (req, res) => {
    res.json({
        cacheStatus,
        lastFetchTime: lastFetchTime ? new Date(lastFetchTime).toISOString() : null,
        cacheDurationMinutes: CACHE_DURATION / 60000,
        articlesInCache: gnewsCache.length,
        gnewsConfigured: !!GNEWS_API_KEY,
        limits: {
            manualLimit: MANUAL_ARTICLES_LIMIT === 0 ? 'Unlimited' : MANUAL_ARTICLES_LIMIT,
            gnewsTarget: GNEWS_ARTICLES_LIMIT,
            gnewsPerRequest: MAX_GNEWS_PER_REQUEST
        }
    });
});

app.delete('/api/admin/delete-all-news', adminAuthMiddleware, async (req, res) => {
    try {
        const articles = await Article.find();
        for (const article of articles) {
            if (article.image && article.image.includes('cloudinary')) {
                try {
                    const uploadIndex = article.image.indexOf('/upload/');
                    if (uploadIndex !== -1) {
                        let afterUpload = article.image.substring(uploadIndex + 8);
                        afterUpload = afterUpload.replace(/^v\d+\//, '');
                        const publicId = afterUpload.replace(/\.[^/.]+$/, '');
                        await cloudinary.uploader.destroy(publicId);
                    }
                } catch (err) {
                    console.log('Image delete failed:', err?.message || err);
                }
            }
        }
        await Article.deleteMany({});
        await Bookmark.deleteMany({});
        res.json({ success: true, message: "All manual news deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/articles', adminAuthMiddleware, async (req, res) => {
    try {
        const articles = await Article.find().sort({ createdAt: -1 });
        res.json({ success: true, count: articles.length, articles });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── 8-DAY RSS QUEUE SYSTEM ──

// Trigger RSS fetch for 8 days
app.post('/api/admin/fetch-rss-8days', adminAuthMiddleware, async (req, res) => {
    try {
        const existing = await UpcomingArticle.countDocuments();
        if (existing > 100) {
            return res.json({ 
                success: true, 
                message: 'Already queued', 
                totalQueued: existing,
                daysQueued: Math.ceil(existing / 35)
            });
        }

        await queueRSSFor8Days();

        const total = await UpcomingArticle.countDocuments();
        res.json({ 
            success: true, 
            totalQueued: total,
            daysQueued: 8,
            message: 'RSS articles queued successfully'
        });
    } catch (err) {
        console.error('RSS 8-day fetch error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// View queue
app.get('/api/admin/queue', adminAuthMiddleware, async (req, res) => {
    try {
        const queue = await UpcomingArticle.find().sort({ targetDate: 1, createdAt: -1 });
        res.json({ success: true, count: queue.length, queue });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Queue upload (manual)
app.post('/api/admin/queue-article', adminAuthMiddleware, upload.single('image'), async (req, res) => {
    const { title, content, source, category, originalLink, expiresAt, targetDate, dayLabel } = req.body;
    if (!title || !content || !targetDate) {
        return res.status(400).json({ error: 'Title, content, and targetDate required' });
    }
    try {
        const imageUrl = req.file ? req.file.path : '';
        const article = await UpcomingArticle.create({
            title, content, image: imageUrl,
            source: source || 'Centrinsic NPT',
            category: category || 'General',
            originalLink: originalLink || req.body['original link'] || '',
            isManual: true, status: 'published',
            expiresAt: expiresAt ? new Date(expiresAt) : undefined,
            author_id: req.userId,
            author_name: req.userName || 'Admin',
            targetDate: new Date(targetDate),
            dayLabel: dayLabel || ''
        });
        res.json({ success: true, queuedArticleId: article._id, image: imageUrl, article });
    } catch (err) {
        console.error('Queue upload error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete from queue
app.delete('/api/admin/queue/:id', adminAuthMiddleware, async (req, res) => {
    try {
        const q = await UpcomingArticle.findById(req.params.id);
        if (!q) return res.status(404).json({ error: 'Not found' });
        if (q.image && q.image.includes('cloudinary')) {
            try {
                const idx = q.image.indexOf('/upload/');
                if (idx !== -1) {
                    let after = q.image.substring(idx + 8).replace(/^v\d+\//, '');
                    const publicId = after.replace(/\.[^/.]+$/, '');
                    await cloudinary.uploader.destroy(publicId);
                }
            } catch (e) {}
        }
        await UpcomingArticle.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Removed from queue' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// OTP ENDPOINTS
// ============================================
const otpStore = new Map();
function generateOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }

setInterval(() => {
    const now = Date.now();
    for (const [email, data] of otpStore.entries()) {
        if (data.expiresAt < now) { otpStore.delete(email); console.log("Expired OTP removed:", email); }
    }
}, 5 * 60 * 1000);

app.post('/api/auth/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ success: false, message: 'Valid email required' });
    try {
        const otp = generateOTP();
        const expiresAt = Date.now() + (5 * 60 * 1000);
        otpStore.set(email, { otp, expiresAt });
        const sent = await sendOTPEmail(email, otp);
        if (!sent) return res.status(500).json({ success: false, message: 'Failed to send email' });
        res.json({ success: true, message: 'OTP sent successfully' });
    } catch (err) {
        console.error('Send OTP error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/auth/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP required' });
    try {
        const stored = otpStore.get(email);
        if (!stored) return res.status(400).json({ success: false, message: 'OTP expired or not requested' });
        if (stored.expiresAt < Date.now()) { otpStore.delete(email); return res.status(400).json({ success: false, message: 'OTP expired' }); }
        if (stored.otp !== otp) return res.status(400).json({ success: false, message: 'Invalid OTP' });
        otpStore.delete(email);

        let user = await User.findOne({ email: email.toLowerCase().trim() });
        let isNewUser = false;
        if (!user) {
            const userName = email.split('@')[0];
            const randomPassword = Math.random().toString(36).slice(-8);
            const hashedPassword = await bcrypt.hash(randomPassword, 10);
            user = new User({ name: userName, email: email.toLowerCase().trim(), password: hashedPassword, created_at: new Date() });
            await user.save();
            isNewUser = true;
        }
        await UserEmail.findOneAndUpdate(
            { email: user.email },
            { email: user.email, device: req.headers['user-agent'] || 'unknown', created_at: new Date() },
            { upsert: true, new: true }
        );
        const token = jwt.sign({ userId: user._id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, message: 'Login successful', token, user: { id: user._id, name: user.name, email: user.email }, isNewUser });
    } catch (err) {
        console.error('Verify OTP error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/save-email', async (req, res) => {
    const { email, name, password } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ success: false, message: 'Invalid email' });
    try {
        if (mongoose.connection.readyState !== 1) return res.status(500).json({ success: false, message: 'Database not connected' });
        const cleanEmail = email.toLowerCase().trim();
        const userName = name || cleanEmail.split('@')[0];
        const userPassword = password || Math.random().toString(36).slice(-8);

        await UserEmail.findOneAndUpdate(
            { email: cleanEmail },
            { email: cleanEmail, device: req.headers['user-agent'] || 'unknown', created_at: new Date() },
            { upsert: true, new: true }
        );
        let user = await User.findOne({ email: cleanEmail });
        let isNewUser = false;
        if (!user) {
            const hashedPassword = await bcrypt.hash(userPassword, 10);
            user = new User({ name: userName, email: cleanEmail, password: hashedPassword, created_at: new Date() });
            await user.save();
            isNewUser = true;
        }
        const token = jwt.sign({ userId: user._id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, message: 'Email saved', email: cleanEmail, isNew: isNewUser, userId: user._id, token });
    } catch (err) {
        console.error('❌ SAVE EMAIL ERROR:', err);
        res.status(500).json({ success: false, message: 'Database error', error: err.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    try {
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: 'Email already exists' });
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashed });
        await user.save();
        const token = jwt.sign({ userId: user._id, name }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, name, email } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'User not found' });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: 'Invalid password' });
        const token = jwt.sign({ userId: user._id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// ARTICLES (USER)
// ============================================
app.post('/api/articles', authMiddleware, upload.single('image'), async (req, res) => {
    const { title, content, source, category, originalLink, expiresAt } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    try {
        const imageUrl = req.file ? req.file.path : '';
        const article = await Article.create({
            title, content, image: imageUrl,
            source: source || 'Centrinsic NPT', category: category || 'General',
            originalLink: originalLink || req.body['original link'] || '',
            isManual: true, status: 'published',
            expiresAt: expiresAt ? new Date(expiresAt) : undefined,
            author_id: req.userId, author_name: req.userName || 'Anonymous'
        });
        res.json({ success: true, articleId: article._id, image: imageUrl, article });
    } catch (err) {
        console.error('Create article error:', err);
        res.status(500).json({ error: 'Upload failed', details: err.message });
    }
});

app.put('/api/articles/:id', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        const { title, content, source, category, originalLink, status, expiresAt } = req.body;
        const article = await Article.findById(req.params.id);
        if (!article) return res.status(404).json({ error: 'Article not found' });
        if (article.author_id.toString() !== req.userId) return res.status(403).json({ error: 'Not authorized' });
        article.title = title || article.title;
        article.content = content || article.content;
        article.source = source || article.source;
        article.category = category || article.category;
        article.originalLink = originalLink || req.body['original link'] || article.originalLink;
        article.status = status || article.status;
        article.expiresAt = expiresAt ? new Date(expiresAt) : article.expiresAt;
        if (req.file) article.image = req.file.path;
        await article.save();
        res.json({ success: true, article });
    } catch (err) {
        console.error('Update article error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/articles/:id', authMiddleware, async (req, res) => {
    try {
        const article = await Article.findById(req.params.id);
        if (!article) return res.status(404).json({ error: 'Article not found' });
        if (article.author_id.toString() !== req.userId) return res.status(403).json({ error: 'Not allowed' });
        if (article.image && article.image.includes('cloudinary')) {
            try {
                const uploadIndex = article.image.indexOf('/upload/');
                if (uploadIndex !== -1) {
                    let afterUpload = article.image.substring(uploadIndex + 8);
                    afterUpload = afterUpload.replace(/^v\d+\//, '');
                    const publicId = afterUpload.replace(/\.[^/.]+$/, '');
                    await cloudinary.uploader.destroy(publicId);
                    console.log('🗑 Cloudinary image deleted:', publicId);
                }
            } catch (err) { console.log('Cloudinary delete failed:', err?.message || err); }
        }
        await Article.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Article + image deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// BOOKMARKS
// ============================================
app.get('/api/bookmarks', authMiddleware, async (req, res) => {
    try {
        const bookmarks = await Bookmark.find({ user_id: req.userId }).populate('article_id').sort({ created_at: -1 });
        res.json(bookmarks);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/bookmarks', authMiddleware, async (req, res) => {
    try {
        const { articleId } = req.body;
        const bookmark = new Bookmark({ user_id: req.userId, article_id: articleId });
        await bookmark.save();
        res.json({ success: true, message: 'Bookmark added' });
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ error: 'Already bookmarked' });
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/user-emails', async (req, res) => {
    try {
        const emails = await UserEmail.find().sort({ created_at: -1 });
        res.json({ success: true, count: emails.length, emails });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// DEBUG ROUTES — Password OR OTP
// ============================================
if (DEBUG) {
    app.get('/api/debug/db-status', adminAuthMiddleware, async (req, res) => {
        try {
            const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
            res.json({
                mongoConnection: states[mongoose.connection.readyState] || 'unknown',
                databaseName: mongoose.connection.name,
                gnewsConfigured: !!GNEWS_API_KEY,
                cache: {
                    lastFetch: cacheStatus.lastSuccessfulFetch,
                    articlesCached: gnewsCache.length,
                    isStale: cacheStatus.isStale,
                    cacheDurationMinutes: CACHE_DURATION / 60000
                },
                collections: {
                    users: await User.countDocuments(),
                    useremails: await UserEmail.countDocuments(),
                    articles: await Article.countDocuments(),
                    upcomingarticles: await UpcomingArticle.countDocuments(),
                    bookmarks: await Bookmark.countDocuments()
                }
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.get('/api/debug/list-users', adminAuthMiddleware, async (req, res) => {
        try {
            const users = await User.find().select('-password');
            const emails = await UserEmail.find();
            res.json({ usersCollection: users, userEmailsCollection: emails, totalUsers: users.length, totalEmails: emails.length });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.get('/admin', adminAuthMiddleware, (req, res) => {
        const cacheAge = lastFetchTime ? Math.round((Date.now() - lastFetchTime) / 60000) : 'Never';
        const pw = req.query.admin_password ? `?admin_password=${encodeURIComponent(req.query.admin_password)}` : '';
        const pwHeader = req.query.admin_password || '';
        res.send(`
            <!DOCTYPE html><html><head><title>Centrinsic Admin</title>
            <style>
                body{font-family:Arial;padding:20px;background:#f5f5f5}
                .card{background:white;padding:20px;margin:10px 0;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)}
                button{padding:10px 20px;margin:5px;cursor:pointer;background:#007aff;color:white;border:none;border-radius:5px}
                button:hover{background:#0056b3}
                .info-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}
                .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold}
                .badge-green{background:#4CAF50;color:white}
            </style></head><body>
            <h1>📊 Centrinsic Admin Dashboard</h1>
            <div class="card">
                <h3>🔐 Auth Status</h3>
                <div class="info-row"><span>Access Method:</span><strong class="badge badge-green">${req.isAdminPassword ? 'Admin Password' : 'OTP (JWT)'}</strong></div>
            </div>
            <div class="card">
                <h3>Cache Status</h3>
                <div class="info-row"><span>Last Updated:</span><strong>${cacheStatus.lastSuccessfulFetch || 'Never'}</strong></div>
                <div class="info-row"><span>Cache Age:</span><strong>${cacheAge} minutes</strong></div>
                <div class="info-row"><span>Articles Cached:</span><strong>${gnewsCache.length}</strong></div>
                <div class="info-row"><span>Cache Duration:</span><strong>${CACHE_DURATION / 60000} minutes</strong></div>
                <div class="info-row"><span>Status:</span><strong style="color:${cacheStatus.isStale ? '#f44336' : '#4CAF50'}">${cacheStatus.isStale ? '⚠️ Stale' : '✅ Fresh'}</strong></div>
                <br><button onclick="fetch('/api/admin/refresh-gnews${pw}',{method:'POST',headers:{'x-admin-password':'${pwHeader}'}}).then(()=>location.reload())">🔄 Force Refresh GNews</button>
            </div>
            <div class="card">
                <h3>8-Day Queue System</h3>
                <button onclick="fetch('/api/admin/fetch-rss-8days${pw}',{method:'POST',headers:{'x-admin-password':'${pwHeader}'}}).then(r=>r.json()).then(d=>alert(d.message||d.error)).catch(e=>alert(e.message))">📡 Fetch & Queue 8 Days RSS</button>
                <button onclick="location.href='/api/admin/queue${pw}'">📅 View Queue</button>
                <button onclick="location.href='/api/admin/auto-delete-status${pw}'">⏰ Auto-Delete Status</button>
            </div>
            <div class="card">
                <h3>Quick Actions</h3>
                <button onclick="location.href='/api/debug/db-status${pw}'">Check DB Status</button>
                <button onclick="location.href='/api/debug/list-users${pw}'">List All Users</button>
                <button onclick="location.href='/api/admin/articles${pw}'">List Manual Articles</button>
                <button onclick="location.href='/api/articles'">View Combined Feed</button>
                <button onclick="location.href='/api/admin/cache-status${pw}'">Cache Details</button>
                <button onclick="location.href='/api/admin/keep-alive-status${pw}'">Keep-Alive Status</button>
            </div>
            <div class="card">
                <h3>News Sources</h3>
                <p>✅ GNews API: ${GNEWS_API_KEY ? 'Configured' : 'Not Configured'}</p>
                <p>✅ RSS Feeds: 20 free sources (no API key)</p>
                <p>✅ Manual Articles: MongoDB (Unlimited)</p>
                <p>📦 Cache Duration: ${CACHE_DURATION / 60000} min</p>
                <p>🔁 GNews: Single request per cache window</p>
            </div>
            </body></html>
        `);
    });
}

// ============================================
// ERROR HANDLING
// ============================================
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API endpoint not found', path: req.path });
    res.sendFile(path.join(__dirname, 'front-end', 'index.html'), (err) => {
        if (err) { console.error('Error serving index.html:', err); res.status(500).send('Error loading application'); }
    });
});

app.use((err, req, res, next) => {
    console.error('Error:', err);
    if (err instanceof multer.MulterError) return res.status(400).json({ error: 'File upload error: ' + err.message });
    res.status(500).json({ error: err.message || 'Internal server error' });
});

// ============================================
// AUTO-DELETE AT 11:57 PM IST + AUTO-PUBLISH WITH DELAY
// ============================================
const DELETE_HOUR = 23, DELETE_MINUTE = 57;
const DELETE_TIMEZONE = process.env.DELETE_TIMEZONE || 'Asia/Kolkata';
// ⏰ DELAY before publishing next day's news (in minutes)
// Set to 30 = 12:27 AM, 60 = 12:57 AM, 90 = 1:27 AM
const PUBLISH_DELAY_MINUTES = parseInt(process.env.PUBLISH_DELAY_MINUTES) || 33;  // default: 33 min (12:30 AM)
let autoDeleteLog = { lastRun: null, lastDeletedCount: 0, lastError: null, totalRuns: 0 };
let publishScheduleLog = { nextPublishTime: null, lastPublishTime: null, lastPublishedCount: 0 };

// ============================================
// CHANGE #1: FIXED publishQueuedArticles — Publishes articles for TODAY
// ============================================
async function publishQueuedArticles() {
    const now = new Date();
    // Get TODAY's date (articles scheduled for today should publish today)
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    console.log(`📅 Publishing queued articles for ${today.toDateString()}`);
    
    const queued = await UpcomingArticle.find({
        targetDate: { $gte: today, $lte: endOfToday },
        status: 'published'
    });

    if (queued.length === 0) {
        console.log('   No queued articles for today');
        publishScheduleLog.lastPublishTime = new Date().toISOString();
        publishScheduleLog.lastPublishedCount = 0;
        return;
    }

    for (const q of queued) {
        await Article.create({
            title: q.title,
            content: q.content,
            image: q.image,
            source: q.source,
            category: q.category,
            originalLink: q.originalLink,
            isManual: true,
            status: 'published',
            expiresAt: q.expiresAt,
            author_id: q.author_id,
            author_name: q.author_name || 'RSS Auto-Fetch'
        });
    }
    
    // Delete published articles from queue
    await UpcomingArticle.deleteMany({ 
        targetDate: { $gte: today, $lte: endOfToday } 
    });
    
    publishScheduleLog.lastPublishTime = new Date().toISOString();
    publishScheduleLog.lastPublishedCount = queued.length;
    console.log(`   ✅ Published ${queued.length} articles for ${today.toDateString()}`);
}

async function schedulePublishAfterDelay() {
    const delayMs = PUBLISH_DELAY_MINUTES * 60 * 1000;
    const publishTime = new Date(Date.now() + delayMs);
    publishScheduleLog.nextPublishTime = publishTime.toISOString();

    console.log(`⏳ Auto-publish scheduled for ${publishTime.toLocaleTimeString('en-US', { timeZone: DELETE_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: true })} (${PUBLISH_DELAY_MINUTES} min delay)`);

    setTimeout(async () => {
        console.log('🚀 Running scheduled auto-publish...');
        await publishQueuedArticles();
        publishScheduleLog.nextPublishTime = null;
    }, delayMs);
}

async function deleteAllManualNews() {
    console.log('\n🗑️ ========== AUTO-DELETE STARTED ==========');
    try {
        if (mongoose.connection.readyState !== 1) {
            autoDeleteLog.lastError = 'MongoDB not connected';
            return;
        }
        const articles = await Article.find({ isManual: true });
        console.log(`   Found ${articles.length} manual articles`);
        if (articles.length > 0) {
            let imgCount = 0;
            for (const a of articles) {
                if (a.image && a.image.includes('cloudinary')) {
                    try {
                        const idx = a.image.indexOf('/upload/');
                        if (idx !== -1) {
                            let after = a.image.substring(idx + 8).replace(/^v\d+\//, '');
                            const publicId = after.replace(/\.[^/.]+$/, '');
                            const r = await cloudinary.uploader.destroy(publicId);
                            if (r.result === 'ok') { imgCount++; console.log(`   ✅ Image deleted: ${publicId}`); }
                        }
                    } catch (e) { console.log(`   ⚠️ Image delete failed:`, e?.message); }
                }
            }
            const result = await Article.deleteMany({ isManual: true });
            await Bookmark.deleteMany({});
            autoDeleteLog = {
                lastRun: new Date().toISOString(),
                lastDeletedCount: result.deletedCount,
                lastError: null,
                totalRuns: autoDeleteLog.totalRuns + 1
            };
            console.log(`   ✅ Deleted ${result.deletedCount} articles, ${imgCount} images`);
        } else {
            autoDeleteLog.lastRun = new Date().toISOString();
            autoDeleteLog.lastDeletedCount = 0;
            autoDeleteLog.totalRuns++;
        }

        // 🔥 SCHEDULE AUTO-PUBLISH with configurable delay
        await schedulePublishAfterDelay();

    } catch (err) {
        console.error('❌ Auto-delete error:', err.message);
        autoDeleteLog.lastError = err.message;
    }
}

setInterval(() => {
    const now = new Date();
    const local = new Intl.DateTimeFormat('en-US', { timeZone: DELETE_TIMEZONE, hour: 'numeric', minute: 'numeric', hour12: false }).format(now);
    const [h, m] = local.split(':').map(Number);
    if (h === DELETE_HOUR && m === DELETE_MINUTE) {
        const today = now.toISOString().split('T')[0];
        const last = autoDeleteLog.lastRun ? new Date(autoDeleteLog.lastRun).toISOString().split('T')[0] : null;
        if (last === today) return;
        console.log(`⏰ Auto-delete triggered at ${DELETE_HOUR}:${String(DELETE_MINUTE).padStart(2, '0')} ${DELETE_TIMEZONE}`);
        deleteAllManualNews();
    }
}, 60 * 1000);

app.get('/api/admin/auto-delete-status', adminAuthMiddleware, async (req, res) => {
    const now = new Date();
    const localTime = new Intl.DateTimeFormat('en-US', {
        timeZone: DELETE_TIMEZONE, hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(now);
    res.json({
        autoDelete: {
            scheduledTime: `${DELETE_HOUR}:${String(DELETE_MINUTE).padStart(2, '0')} ${DELETE_TIMEZONE}`,
            currentTimeInZone: localTime,
            lastRun: autoDeleteLog.lastRun, lastDeletedCount: autoDeleteLog.lastDeletedCount,
            lastError: autoDeleteLog.lastError, totalRuns: autoDeleteLog.totalRuns
        },
        autoPublish: {
            delayMinutes: PUBLISH_DELAY_MINUTES,
            nextPublishTime: publishScheduleLog.nextPublishTime,
            lastPublishTime: publishScheduleLog.lastPublishTime,
            lastPublishedCount: publishScheduleLog.lastPublishedCount,
            estimatedPublishTime: `${DELETE_HOUR}:${String(DELETE_MINUTE + PUBLISH_DELAY_MINUTES).padStart(2, '0')} ${DELETE_TIMEZONE}`
        }
    });
});

app.post('/api/admin/trigger-auto-delete', adminAuthMiddleware, async (req, res) => {
    try {
        console.log('🔧 Manual auto-delete triggered');
        await deleteAllManualNews();
        res.json({ success: true, message: 'Auto-delete triggered', deletedCount: autoDeleteLog.lastDeletedCount, lastRun: autoDeleteLog.lastRun });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================
// KEEP-ALIVE
// ============================================
const RENDER_URL = process.env.RENDER_URL || 'https://centrinsicnpt.com';
let keepAliveLog = { totalPings: 0, lastPing: null, lastError: null };

setTimeout(() => {
    setInterval(async () => {
        try {
            await axios.get(`${RENDER_URL}/api/health`, { timeout: 10000 });
            keepAliveLog = { totalPings: keepAliveLog.totalPings + 1, lastPing: new Date().toISOString(), lastError: null };
            console.log(`💓 Keep-alive #${keepAliveLog.totalPings} ✅`);
        } catch (err) { keepAliveLog.lastError = err.message; console.log(`💔 Keep-alive failed: ${err.message}`); }
    }, 14 * 60 * 1000);
    console.log('💓 Keep-alive started (14 min interval)');
}, 30 * 1000);

app.get('/api/admin/keep-alive-status', adminAuthMiddleware, (req, res) => {
    res.json({
        keepAlive: {
            enabled: true, intervalMin: 14, pingUrl: `${RENDER_URL}/api/health`,
            totalPings: keepAliveLog.totalPings, lastPing: keepAliveLog.lastPing, lastError: keepAliveLog.lastError
        }
    });
});

// ============================================
// CHANGE #2: AUTO-REFILL QUEUE WHEN LOW (Camp Mode)
// Runs every 6 hours to check if queue needs refilling
// ============================================
async function checkAndRefillQueue() {
    try {
        const count = await UpcomingArticle.countDocuments();
        console.log(`📊 Queue check: ${count} articles remaining`);
        
        if (count < 100) {  // Less than ~3 days worth left
            console.log(`🚨 Queue low! Auto-refilling 8 days...`);
            await queueRSSFor8Days();
            const newCount = await UpcomingArticle.countDocuments();
            console.log(`✅ Queue refilled! Now ${newCount} articles`);
        } else {
            console.log(`✅ Queue healthy, no action needed`);
        }
    } catch (err) {
        console.error('❌ Auto-refill error:', err.message);
    }
}

// ============================================
// START
// ============================================
app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 CENTRINSIC NPT SERVER STARTED');
    console.log(`Port:             ${PORT}`);
    console.log(`GNews API:        ${GNEWS_API_KEY ? '✅' : '❌'}`);
    console.log(`RSS Feeds:        ✅ 20 free sources`);
    console.log(`Manual Articles:  ♾️  Unlimited`);
    console.log(`GNews Articles:   ${GNEWS_ARTICLES_LIMIT} per fetch`);
    console.log(`Cache Duration:   ${CACHE_DURATION / 60000} min`);
    console.log(`Auto-delete:      ${DELETE_HOUR}:${String(DELETE_MINUTE).padStart(2, '0')} ${DELETE_TIMEZONE}`);
    console.log(`Auto-publish:     ✅ After delete (${PUBLISH_DELAY_MINUTES} min delay)`);
    console.log(`Keep-alive:       ✅ 14 min`);
    console.log(`Admin Password:   ${ADMIN_PASSWORD ? '✅ Configured' : '❌ NOT SET — add ADMIN_PASSWORD to .env!'}`);
    console.log(`Auto-refill:      ✅ Every 6 hours if queue < 100`);
    console.log('========================================');
    
    // Start auto-refill checks
    setTimeout(checkAndRefillQueue, 10000); // First check after 10 seconds
    setInterval(checkAndRefillQueue, 6 * 60 * 60 * 1000); // Then every 6 hours
});