// ============================================
// CENTRINSIC NPT SERVER - FULLY UPDATED
// Added: Keep-alive self-ping to prevent Render cold starts
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

// cloudinary
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ktt-news-secret-key-2024';

// GNEWS CONFIG
const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const GNEWS_BASE_URL = 'https://gnews.io/api/v4';

// ✅ Use 60 minutes cache to preserve daily quota (100 calls/day free tier)
const CACHE_DURATION = (parseInt(process.env.GNEWS_CACHE_MINUTES) || 60) * 60 * 1000;

// ✅ Manual articles = unlimited (0 = no limit)
// ✅ GNews = single request of 10 (free tier only returns 10 unique articles anyway)
const MANUAL_ARTICLES_LIMIT = 0;   // 0 = unlimited manual articles
const GNEWS_ARTICLES_LIMIT = 10;   // Free tier max = 10 per request
const MAX_GNEWS_PER_REQUEST = 10;  // Free tier limit per API call

// ============================================
// GNEWS CACHE SYSTEM
// ============================================
let gnewsCache = [];
let lastFetchTime = 0;
let cacheStatus = {
    lastSuccessfulFetch: null,
    lastError: null,
    totalFetches: 0,
    isStale: false
};

// ============================================
// DEBUG MODE
// ============================================
const DEBUG = true;

function log(...args) {
    if (DEBUG) console.log('[DEBUG]', ...args);
}

// ============================================
// GET LOCAL IP
// ============================================
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal && !name.includes('Virtual')) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const LOCAL_IP = getLocalIP();
console.log('📡 Local IP detected:', LOCAL_IP);

// ============================================
// MONGODB CONNECTION
// ============================================
const MONGODB_URI = process.env.MONGODB_URI;

console.log('🔌 Connecting to MongoDB...');

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB Connected SUCCESSFULLY');
        console.log('📊 Database:', mongoose.connection.name);
        console.log('📊 Host:', mongoose.connection.host);
    })
    .catch(err => {
        console.error('❌ MongoDB Connection FAILED:', err.message);
        process.exit(1);
    });

mongoose.connection.on('error', err => {
    console.error('❌ MongoDB Error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB Disconnected');
});

/* ========= CLOUDINARY CONFIG ========= */
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
        folder: "centrinsic-npt",
        format: "jpg",
        transformation: [{ width: 1000, crop: "limit", quality: "auto" }]
    })
});

const upload = multer({ storage });

// ============================================
// BREVO OTP MAILER
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
            </div>
        `;
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

const User     = mongoose.model('User', userSchema);
const Article  = mongoose.model('Article', articleSchema);
const Bookmark = mongoose.model('Bookmark', bookmarkSchema);
const UserEmail = mongoose.model('UserEmail', userEmailSchema);

// ============================================
// MIDDLEWARE SETUP
// ============================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true
}));

app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
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
// AUTH MIDDLEWARE
// ============================================
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId   = decoded.userId;
        req.userName = decoded.name;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// ============================================
// GNEWS FETCH - SINGLE REQUEST ONLY
// Free tier = 100 calls/day, only 10 unique articles per call
// ============================================
async function fetchGNewsArticles(targetLimit = GNEWS_ARTICLES_LIMIT) {
    const now = Date.now();

    // Return cached if still fresh
    if (gnewsCache.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
        const ageMinutes = Math.round((now - lastFetchTime) / 60000);
        console.log(`📦 Using cached GNews (${ageMinutes}m old), ${gnewsCache.length} articles`);
        cacheStatus.isStale = false;
        return gnewsCache.slice(0, targetLimit);
    }

    if (!GNEWS_API_KEY) {
        console.log('⚠️ GNEWS_API_KEY not set, skipping GNews fetch');
        cacheStatus.lastError = 'API key not configured';
        return gnewsCache.length > 0 ? gnewsCache.slice(0, targetLimit) : [];
    }

    try {
        console.log(`🌐 Fetching GNews articles (single request)...`);

        const response = await axios.get(`${GNEWS_BASE_URL}/top-headlines`, {
            params: {
                token: GNEWS_API_KEY,
                lang: 'en',
                country: 'us',
                max: MAX_GNEWS_PER_REQUEST
            },
            timeout: 10000
        });

        const articles = (response.data?.articles || []).map((article, index) => ({
            _id: `gnews_${Date.now()}_${index}`,
            title: article.title,
            content: article.content || article.description || 'No content available',
            description: article.description,
            image: article.image || null,
            url: article.url,
            source: article.source?.name || 'GNews',
            category: 'General',
            publishedAt: article.publishedAt,
            createdAt: article.publishedAt,
            isManual: false,
            originalLink: article.url,
            fetchedAt: new Date().toISOString()
        }));

        gnewsCache = articles;
        lastFetchTime = now;
        cacheStatus.lastSuccessfulFetch = new Date().toISOString();
        cacheStatus.totalFetches++;
        cacheStatus.lastError = null;
        cacheStatus.isStale = false;

        console.log(`✅ GNews fetch complete: ${articles.length} articles cached`);
        return articles.slice(0, targetLimit);

    } catch (error) {
        console.error('❌ GNews fetch error:', error.message);

        if (error.response) {
            console.error('Response status:', error.response.status);
            if (error.response.status === 403) {
                cacheStatus.lastError = 'Daily quota exceeded (403)';
            } else if (error.response.status === 429) {
                cacheStatus.lastError = 'Rate limited (429)';
            } else {
                cacheStatus.lastError = `HTTP ${error.response.status}`;
            }
        } else {
            cacheStatus.lastError = error.message;
        }

        cacheStatus.isStale = true;

        if (gnewsCache.length > 0) {
            console.log('📦 Serving stale cache due to error');
            return gnewsCache.slice(0, targetLimit);
        }
        return [];
    }
}

// ============================================
// API ROUTES
// ============================================

// ✅ HEALTH CHECK — used by keep-alive ping
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
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

// ============================================
// GET ARTICLES — MANUAL AND GNEWS ARE 100% INDEPENDENT
// ============================================
app.get('/api/articles', async (req, res) => {
    try {
        console.log('\n📊 === FETCHING ARTICLES ===');

        let manualQuery = Article.find({
            status: 'published',
            $or: [
                { expiresAt: { $gt: new Date() } },
                { expiresAt: { $exists: false } }
            ]
        }).sort({ createdAt: -1 });

        if (MANUAL_ARTICLES_LIMIT > 0) {
            manualQuery = manualQuery.limit(MANUAL_ARTICLES_LIMIT);
        }

        const manualArticlesFromDB = await manualQuery;
        console.log(`✅ Manual articles from DB: ${manualArticlesFromDB.length}`);

        const formattedManual = manualArticlesFromDB.map(article => ({
            _id: article._id.toString(),
            title: article.title,
            content: article.content,
            image: article.image,
            source: article.source || 'Centrinsic NPT',
            category: article.category || 'General',
            originalLink: article.originalLink || '',
            createdAt: article.createdAt,
            updatedAt: article.updatedAt,
            isManual: true,
            author_name: article.author_name
        }));

        const gnewsArticles = await fetchGNewsArticles(GNEWS_ARTICLES_LIMIT);
        console.log(`✅ GNews articles: ${gnewsArticles.length}`);

        const allArticles = [...formattedManual, ...gnewsArticles];

        console.log(`📊 TOTAL: ${formattedManual.length} manual + ${gnewsArticles.length} GNews = ${allArticles.length} articles`);
        console.log('=== END FETCHING ===\n');

        const lastUpdated   = cacheStatus.lastSuccessfulFetch || new Date().toISOString();
        const cacheAgeMinutes = lastFetchTime ? Math.round((Date.now() - lastFetchTime) / 60000) : 0;

        res.json({
            success: true,
            articles: allArticles,
            meta: {
                total: allArticles.length,
                manualCount: formattedManual.length,
                gnewsCount: gnewsArticles.length,
                lastUpdated,
                cacheAgeMinutes,
                isCached: cacheAgeMinutes < (CACHE_DURATION / 60000)
            }
        });

    } catch (err) {
        console.error('❌ Get articles error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// FORCE REFRESH GNEWS (ADMIN)
// ============================================
app.post('/api/admin/refresh-gnews', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (user.email !== "dheerajexperiment8@gmail.com") {
            return res.status(403).json({ error: "Admin only" });
        }
        lastFetchTime = 0;
        gnewsCache    = [];
        const fresh   = await fetchGNewsArticles(GNEWS_ARTICLES_LIMIT);
        res.json({ success: true, count: fresh.length, lastUpdated: cacheStatus.lastSuccessfulFetch, message: 'Cache refreshed successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/admin/cache-status', async (req, res) => {
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

// ============================================
// OTP MEMORY STORAGE
// ============================================
const otpStore = new Map();

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Clean expired OTPs every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [email, data] of otpStore.entries()) {
        if (data.expiresAt < now) {
            otpStore.delete(email);
            console.log("Expired OTP removed:", email);
        }
    }
}, 5 * 60 * 1000);

// ============================================
// OTP AUTH ENDPOINTS
// ============================================
app.post('/api/auth/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, message: 'Valid email required' });
    }
    try {
        const otp       = generateOTP();
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
    if (!email || !otp) {
        return res.status(400).json({ success: false, message: 'Email and OTP required' });
    }
    try {
        const stored = otpStore.get(email);
        if (!stored) return res.status(400).json({ success: false, message: 'OTP expired or not requested' });
        if (stored.expiresAt < Date.now()) {
            otpStore.delete(email);
            return res.status(400).json({ success: false, message: 'OTP expired' });
        }
        if (stored.otp !== otp) return res.status(400).json({ success: false, message: 'Invalid OTP' });

        otpStore.delete(email);

        let user      = await User.findOne({ email: email.toLowerCase().trim() });
        let isNewUser = false;

        if (!user) {
            const userName        = email.split('@')[0];
            const randomPassword  = Math.random().toString(36).slice(-8);
            const hashedPassword  = await bcrypt.hash(randomPassword, 10);
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
    if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, message: 'Invalid email' });
    }
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(500).json({ success: false, message: 'Database not connected' });
        }
        const cleanEmail   = email.toLowerCase().trim();
        const userName     = name || cleanEmail.split('@')[0];
        const userPassword = password || Math.random().toString(36).slice(-8);

        await UserEmail.findOneAndUpdate(
            { email: cleanEmail },
            { email: cleanEmail, device: req.headers['user-agent'] || 'unknown', created_at: new Date() },
            { upsert: true, new: true }
        );

        let user      = await User.findOne({ email: cleanEmail });
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
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'Email already exists' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword });
        await user.save();
        const token = jwt.sign({ userId: user._id, name }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, name, email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'User not found' });
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });
        const token = jwt.sign({ userId: user._id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// CREATE MANUAL ARTICLE
// ============================================
app.post('/api/articles', authMiddleware, upload.single('image'), async (req, res) => {
    const { title, content, source, category, originalLink, expiresAt } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    try {
        const imageUrl = req.file ? req.file.path : '';
        const article  = await Article.create({
            title, content,
            image: imageUrl,
            source: source || 'Centrinsic NPT',
            category: category || 'General',
            originalLink: originalLink || req.body['original link'] || '',
            isManual: true,
            status: 'published',
            expiresAt: expiresAt ? new Date(expiresAt) : undefined,
            author_id: req.userId,
            author_name: req.userName || 'Anonymous'
        });
        res.json({ success: true, articleId: article._id, image: imageUrl, article });
    } catch (err) {
        console.error('Create article error:', err);
        res.status(500).json({ error: 'Upload failed', details: err.message });
    }
});

// ============================================
// UPDATE ARTICLE
// ============================================
app.put('/api/articles/:id', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        const { title, content, source, category, originalLink, status, expiresAt } = req.body;
        const article = await Article.findById(req.params.id);
        if (!article) return res.status(404).json({ error: 'Article not found' });
        if (article.author_id.toString() !== req.userId) return res.status(403).json({ error: 'Not authorized' });

        article.title       = title       || article.title;
        article.content     = content     || article.content;
        article.source      = source      || article.source;
        article.category    = category    || article.category;
        article.originalLink = originalLink || req.body['original link'] || article.originalLink;
        article.status      = status      || article.status;
        article.expiresAt   = expiresAt   ? new Date(expiresAt) : article.expiresAt;
        if (req.file) article.image = req.file.path;

        await article.save();
        res.json({ success: true, article });
    } catch (err) {
        console.error('Update article error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// DELETE ARTICLE + CLOUDINARY IMAGE
// ============================================
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
                    afterUpload     = afterUpload.replace(/^v\d+\//, '');
                    const publicId  = afterUpload.replace(/\.[^/.]+$/, '');
                    await cloudinary.uploader.destroy(publicId);
                    console.log('🗑 Cloudinary image deleted:', publicId);
                }
            } catch (err) {
                console.log('Cloudinary delete failed:', err?.message || err);
            }
        }

        await Article.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Article + image deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// BOOKMARKS
// ============================================
app.get('/api/bookmarks', authMiddleware, async (req, res) => {
    try {
        const bookmarks = await Bookmark.find({ user_id: req.userId }).populate('article_id').sort({ created_at: -1 });
        res.json(bookmarks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// ADMIN ROUTES
// ============================================
app.delete('/api/admin/delete-all-news', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user || user.email !== "dheerajexperiment8@gmail.com") {
            return res.status(403).json({ error: "Only admin allowed" });
        }

        const articles = await Article.find();
        for (const article of articles) {
            if (article.image && article.image.includes('cloudinary')) {
                try {
                    const uploadIndex = article.image.indexOf('/upload/');
                    if (uploadIndex !== -1) {
                        let afterUpload = article.image.substring(uploadIndex + 8);
                        afterUpload     = afterUpload.replace(/^v\d+\//, '');
                        const publicId  = afterUpload.replace(/\.[^/.]+$/, '');
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

app.get('/api/admin/articles', authMiddleware, async (req, res) => {
    try {
        const articles = await Article.find().sort({ createdAt: -1 });
        res.json({ success: true, count: articles.length, articles });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// DEBUG ROUTES
// ============================================
if (DEBUG) {
    app.get('/api/debug/db-status', async (req, res) => {
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
                    users:      await User.countDocuments(),
                    useremails: await UserEmail.countDocuments(),
                    articles:   await Article.countDocuments(),
                    bookmarks:  await Bookmark.countDocuments()
                }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/debug/list-users', async (req, res) => {
        try {
            const users  = await User.find().select('-password');
            const emails = await UserEmail.find();
            res.json({ usersCollection: users, userEmailsCollection: emails, totalUsers: users.length, totalEmails: emails.length });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/admin', (req, res) => {
        const cacheAge = lastFetchTime ? Math.round((Date.now() - lastFetchTime) / 60000) : 'Never';
        res.send(`
            <!DOCTYPE html><html><head><title>Centrinsic Admin</title>
            <style>
                body{font-family:Arial;padding:20px;background:#f5f5f5}
                .card{background:white;padding:20px;margin:10px 0;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)}
                button{padding:10px 20px;margin:5px;cursor:pointer;background:#007aff;color:white;border:none;border-radius:5px}
                button:hover{background:#0056b3}
                .info-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}
            </style></head><body>
            <h1>📊 Centrinsic Admin Dashboard</h1>
            <div class="card">
                <h3>Cache Status</h3>
                <div class="info-row"><span>Last Updated:</span><strong>${cacheStatus.lastSuccessfulFetch || 'Never'}</strong></div>
                <div class="info-row"><span>Cache Age:</span><strong>${cacheAge} minutes</strong></div>
                <div class="info-row"><span>Articles Cached:</span><strong>${gnewsCache.length}</strong></div>
                <div class="info-row"><span>Cache Duration:</span><strong>${CACHE_DURATION / 60000} minutes</strong></div>
                <div class="info-row"><span>Status:</span><strong style="color:${cacheStatus.isStale ? '#f44336' : '#4CAF50'}">${cacheStatus.isStale ? '⚠️ Stale' : '✅ Fresh'}</strong></div>
                <br><button onclick="fetch('/api/admin/refresh-gnews',{method:'POST'}).then(()=>location.reload())">🔄 Force Refresh GNews</button>
            </div>
            <div class="card">
                <h3>Quick Actions</h3>
                <button onclick="location.href='/api/debug/db-status'">Check DB Status</button>
                <button onclick="location.href='/api/debug/list-users'">List All Users</button>
                <button onclick="location.href='/api/admin/articles'">List Manual Articles</button>
                <button onclick="location.href='/api/articles'">View Combined Feed</button>
                <button onclick="location.href='/api/admin/cache-status'">Cache Details</button>
            </div>
            <div class="card">
                <h3>News Sources</h3>
                <p>✅ GNews API: ${GNEWS_API_KEY ? 'Configured' : 'Not Configured'}</p>
                <p>✅ Manual Articles: MongoDB (Unlimited)</p>
                <p>📦 Cache Duration: ${CACHE_DURATION / 60000} minutes</p>
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
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found', path: req.path });
    }
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
// DAILY AUTO-DELETE MANUAL NEWS AT 11:57 PM IST
// ============================================
const DELETE_HOUR     = 23;
const DELETE_MINUTE   = 57;
const DELETE_TIMEZONE = process.env.DELETE_TIMEZONE || 'Asia/Kolkata';

let autoDeleteLog = {
    lastRun: null,
    lastDeletedCount: 0,
    lastError: null,
    totalRuns: 0
};

async function deleteAllManualNews() {
    console.log('\n🗑️  ========== AUTO-DELETE STARTED ==========');
    console.log(`   Time: ${new Date().toISOString()}`);
    try {
        if (mongoose.connection.readyState !== 1) {
            console.log('❌ MongoDB not connected - skipping auto-delete');
            autoDeleteLog.lastError = 'MongoDB not connected';
            return;
        }

        const articles = await Article.find({ isManual: true });
        console.log(`   Found ${articles.length} manual articles to delete`);

        if (articles.length === 0) {
            console.log('   ℹ️  Nothing to delete');
            autoDeleteLog.lastRun          = new Date().toISOString();
            autoDeleteLog.lastDeletedCount = 0;
            autoDeleteLog.totalRuns++;
            return;
        }

        let imageDeletedCount = 0;
        for (const article of articles) {
            if (article.image && article.image.includes('cloudinary')) {
                try {
                    const uploadIndex = article.image.indexOf('/upload/');
                    if (uploadIndex === -1) continue;
                    let afterUpload   = article.image.substring(uploadIndex + 8);
                    afterUpload       = afterUpload.replace(/^v\d+\//, '');
                    const publicId    = afterUpload.replace(/\.[^/.]+$/, '');
                    const result      = await cloudinary.uploader.destroy(publicId);
                    if (result.result === 'ok') {
                        imageDeletedCount++;
                        console.log(`   ✅ Image deleted: ${publicId}`);
                    }
                } catch (imgErr) {
                    console.log(`   ⚠️  Image delete failed for ${article._id}:`, imgErr?.message || imgErr);
                }
            }
        }

        const result = await Article.deleteMany({ isManual: true });
        await Bookmark.deleteMany({});

        autoDeleteLog.lastRun          = new Date().toISOString();
        autoDeleteLog.lastDeletedCount = result.deletedCount;
        autoDeleteLog.lastError        = null;
        autoDeleteLog.totalRuns++;

        console.log(`   ✅ Deleted ${result.deletedCount} articles`);
        console.log(`   🖼️  Deleted ${imageDeletedCount} Cloudinary images`);
        console.log('🗑️  ========== AUTO-DELETE COMPLETE ==========\n');

    } catch (err) {
        console.error('❌ Auto-delete error:', err.message);
        autoDeleteLog.lastError = err.message;
    }
}

function scheduleAutoDelete() {
    setInterval(() => {
        const now       = new Date();
        const localTime = new Intl.DateTimeFormat('en-US', {
            timeZone: DELETE_TIMEZONE,
            hour: 'numeric', minute: 'numeric', hour12: false
        }).format(now);

        const [hour, minute] = localTime.split(':').map(Number);

        if (hour === DELETE_HOUR && minute === DELETE_MINUTE) {
            const todayKey   = now.toISOString().split('T')[0];
            const lastRunDate = autoDeleteLog.lastRun
                ? new Date(autoDeleteLog.lastRun).toISOString().split('T')[0]
                : null;
            if (lastRunDate === todayKey) return;
            console.log(`⏰ Auto-delete triggered at ${DELETE_HOUR}:${String(DELETE_MINUTE).padStart(2,'0')} (${DELETE_TIMEZONE})`);
            deleteAllManualNews();
        }
    }, 60 * 1000);

    console.log(`⏰ Auto-delete scheduled: daily at ${DELETE_HOUR}:${String(DELETE_MINUTE).padStart(2,'0')} ${DELETE_TIMEZONE}`);
}

scheduleAutoDelete();

app.get('/api/admin/auto-delete-status', async (req, res) => {
    const now       = new Date();
    const localTime = new Intl.DateTimeFormat('en-US', {
        timeZone: DELETE_TIMEZONE,
        hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(now);

    res.json({
        autoDelete: {
            scheduledTime:    `${DELETE_HOUR}:${String(DELETE_MINUTE).padStart(2,'0')} ${DELETE_TIMEZONE}`,
            currentTimeInZone: localTime,
            lastRun:           autoDeleteLog.lastRun,
            lastDeletedCount:  autoDeleteLog.lastDeletedCount,
            lastError:         autoDeleteLog.lastError,
            totalRuns:         autoDeleteLog.totalRuns
        }
    });
});

app.post('/api/admin/trigger-auto-delete', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (user.email !== "dheerajexperiment8@gmail.com") {
            return res.status(403).json({ error: "Admin only" });
        }
        console.log('🔧 Manual trigger of auto-delete by admin');
        await deleteAllManualNews();
        res.json({ success: true, message: 'Auto-delete triggered manually', deletedCount: autoDeleteLog.lastDeletedCount, lastRun: autoDeleteLog.lastRun });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// ✅ KEEP-ALIVE SELF PING
// Prevents Render free tier from sleeping
// Pings /api/health every 14 minutes
// ============================================
const RENDER_URL = process.env.RENDER_URL || 'https://centrinsicnpt.com';

let keepAliveLog = {
    totalPings: 0,
    lastPing: null,
    lastError: null
};

// Wait 30 seconds after startup before starting pings
setTimeout(() => {
    setInterval(async () => {
        try {
            const response = await axios.get(`${RENDER_URL}/api/health`, { timeout: 10000 });
            keepAliveLog.totalPings++;
            keepAliveLog.lastPing  = new Date().toISOString();
            keepAliveLog.lastError = null;
            console.log(`💓 Keep-alive ping #${keepAliveLog.totalPings} — server awake ✅ [${keepAliveLog.lastPing}]`);
        } catch (err) {
            keepAliveLog.lastError = err.message;
            console.log(`💔 Keep-alive ping failed: ${err.message}`);
        }
    }, 14 * 60 * 1000); // every 14 minutes

    console.log('💓 Keep-alive ping started — pinging every 14 minutes');
}, 30 * 1000);

// Endpoint to check keep-alive status
app.get('/api/admin/keep-alive-status', (req, res) => {
    res.json({
        keepAlive: {
            enabled:     true,
            intervalMin: 14,
            pingUrl:     `${RENDER_URL}/api/health`,
            totalPings:  keepAliveLog.totalPings,
            lastPing:    keepAliveLog.lastPing,
            lastError:   keepAliveLog.lastError
        }
    });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 CENTRINSIC NPT SERVER STARTED');
    console.log('========================================');
    console.log(`Port:             ${PORT}`);
    console.log(`GNews API:        ${GNEWS_API_KEY ? '✅ Configured' : '❌ Not Configured'}`);
    console.log(`Manual Articles:  ♾️  Unlimited`);
    console.log(`GNews Articles:   ${GNEWS_ARTICLES_LIMIT} per fetch`);
    console.log(`Cache Duration:   ${CACHE_DURATION / 60000} minutes`);
    console.log(`Auto-delete:      Daily at ${DELETE_HOUR}:${String(DELETE_MINUTE).padStart(2,'0')} ${DELETE_TIMEZONE}`);
    console.log(`Keep-alive:       ✅ Pinging every 14 minutes`);
    console.log('========================================');
});