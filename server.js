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
const { GoogleGenerativeAI } = require('@google/generative-ai');

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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_DELAY_MS = parseInt(process.env.GEMINI_DELAY_MS) || 4000; // 4s default for free tier (15 RPM)
let isPublishing = false; // Lock to prevent concurrent publish runs
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
    author_name: String,
    summary: { type: String, default: '' },
    isRSS: { type: Boolean, default: false }  // true = auto-fetched from RSS, forces AI-D tab
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
    summary: { type: String, default: '' },
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
    const seenLinks = new Set();
    let dupesSkipped = 0;
    let imagesFixed = 0;

    for (const feed of RSS_FEEDS) {
        if (allArticles.length >= targetCount) break;
        try {
            const feedData = await rssParser.parseURL(feed.url);
            const items = feedData.items.slice(0, 7); // Fetch a few extra to allow for dupes

            for (const item of items) {
                if (allArticles.length >= targetCount) break;

                const link = item.link || item.guid || '';
                if (seenLinks.has(link)) { dupesSkipped++; continue; }
                seenLinks.add(link);

                let content = item.content || item.contentSnippet || item.summary || item.description || 'No content available';
                content = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                if (content.length < 100) content = item.title + '. ' + content;
                if (content.length > 1200) content = content.substring(0, 1200) + '...';

                // Better image extraction
                let imageUrl = extractImageFromRSS(item);
                if (!imageUrl && link) {
                    imageUrl = await fetchOGImage(link);
                    if (imageUrl) imagesFixed++;
                }
                if (!imageUrl) {
                    imageUrl = getFallbackImage(feed.category);
                }

                allArticles.push({
                    title: item.title || 'Untitled',
                    content: content,
                    source: feed.name,
                    category: feed.category,
                    image: imageUrl,
                    originalLink: link,
                    isRSS: true
                });
            }
        } catch (err) {
            errors.push(`${feed.name}: ${err.message}`);
        }
    }

    console.log(`📡 RSS fetched: ${allArticles.length} articles (${errors.length} errors, ${dupesSkipped} feed-dupes skipped, ${imagesFixed} images from OG tags)`);
    if (errors.length > 0) console.log('   Errors:', errors.slice(0, 3).join(', '));
    return allArticles;
}

// Queue RSS articles for 8 days (35 per day)
async function queueRSSFor8Days() {
    const perDay = 35;
    const days = 8;

    // Use IST date as base so Day 1 = tomorrow in India time
    const istDateStr = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    const [m, d, y] = istDateStr.split('/');
    const baseDate = new Date(parseInt(y), parseInt(m)-1, parseInt(d));

    console.log(`\n📅 Queueing RSS articles for ${days} days (${perDay}/day)...`);
    console.log(`   Base date (IST): ${baseDate.toDateString()}`);
    console.log(`🤖 Gemini AI rewrite: ${GEMINI_API_KEY ? '✅ Enabled' : '❌ Disabled (add GEMINI_API_KEY to .env)'}`);

    for (let day = 0; day < days; day++) {
        const targetDate = new Date(baseDate);
        targetDate.setDate(targetDate.getDate() + day + 1);
        targetDate.setHours(0, 0, 0, 0);

        const articles = await fetchRSSArticles(perDay);
        if (articles.length === 0) {
            console.log(`   Day ${day + 1}: No articles fetched`);
            continue;
        }

        let queuedCount = 0;
        let skippedCount = 0;
        for (let i = 0; i < articles.length; i++) {
            const article = articles[i];

            // DUPLICATE CHECK
            const isDup = await isDuplicateArticle(article.title, article.originalLink);
            if (isDup) {
                skippedCount++;
                console.log(`   ⏭️ Skipped duplicate: ${article.title.substring(0, 50)}...`);
                continue;
            }

            // AI Rewrite to ~170 words
            let finalContent = article.content;
            const originalLength = article.content?.length || 0;

            if (GEMINI_API_KEY && geminiModel) {
                try {
                    finalContent = await rewriteSummaryWithGemini(article.title, article.content);
                    const newLength = finalContent?.length || 0;
                    const wordCount = finalContent?.split(/\s+/)?.filter(w => w.length > 0)?.length || 0;
                    console.log(`   🤖 [${i + 1}/${articles.length}] AI summary: ${wordCount} words, ${newLength} chars | ${article.title.substring(0, 40)}...`);
                    // Rate limit safety
                    if (i < articles.length - 1) await new Promise(r => setTimeout(r, GEMINI_DELAY_MS));
                } catch (e) {
                    console.log(`   ⚠️ AI rewrite failed for: ${article.title.substring(0, 50)} — using original (${originalLength} chars)`);
                }
            } else {
                console.log(`   ⏭️ No Gemini key, using original content (${originalLength} chars)`);
            }

            await UpcomingArticle.create({
                title: article.title,
                content: finalContent,
                summary: finalContent,
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
            queuedCount++;
        }

        console.log(`   ✅ Day ${day + 1} (${targetDate.toDateString()}): ${queuedCount} articles queued (${skippedCount} duplicates skipped)`);


        await new Promise(r => setTimeout(r, 1500));
    }

    console.log('🎉 All 8 days queued!\n');
}


// ============================================
// GEMINI AI SUMMARY REWRITE (~170 WORDS)
// ============================================
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const geminiModel = genAI ? genAI.getGenerativeModel({ model: 'gemini-3.5-flash' }) : null;

async function rewriteSummaryWithGemini(title, content) {
    if (!geminiModel) {
        console.log('   ⚠️ Gemini model not initialized — check GEMINI_API_KEY');
        return content;
    }

    try {
        const prompt = `Rewrite the following news article into a professional, factual summary of exactly 150-170 words. Preserve all key facts, names, dates, and important quotes. Use clear journalistic language. Do not add opinions or information not in the original text. Output plain text only — no markdown, no headers, no bullet points.

TITLE: ${title}

ARTICLE: ${content.substring(0, 4000)}

SUMMARY:`;

        // Correct API format for @google/generative-ai package
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        let summary = response.text().trim();

        // Word count enforcement — hard cap at ~170 words
        const words = summary.split(/\s+/).filter(w => w.length > 0);
        if (words.length > 175) {
            summary = words.slice(0, 170).join(' ') + '...';
        }

        console.log(`   ✅ Gemini returned ${words.length} words`);
        return summary;
    } catch (err) {
        console.error('❌ Gemini rewrite error:', err.message);
        if (err.message?.includes('API key')) console.error('   → Check your GEMINI_API_KEY in .env');
        if (err.message?.includes('quota')) console.error('   → Rate limit exceeded, try again later');
        return content;
    }
}

// ============================================
// DUPLICATE FILTER & BETTER IMAGE EXTRACTION
// ============================================

const CATEGORY_FALLBACK_IMAGES = {
    'World': 'https://images.unsplash.com/photo-1523995462485-3a17e36c6c80?w=800&q=80',
    'India': 'https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=800&q=80',
    'Technology': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80',
    'Sports': 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=80',
    'Business': 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80',
    'Science': 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80',
    'Entertainment': 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80',
    'General': 'https://images.unsplash.com/photo-1504711434969-e33886168db5?w=800&q=80'
};

function normalizeTitle(title) {
    if (!title) return '';
    return title.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function titleSimilarity(a, b) {
    const wordsA = new Set(normalizeTitle(a).split(' ').filter(w => w.length > 2));
    const wordsB = new Set(normalizeTitle(b).split(' ').filter(w => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    const intersection = [...wordsA].filter(x => wordsB.has(x));
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.length / union.size;
}

async function isDuplicateArticle(title, originalLink) {
    if (!title || title.length < 10) return true; // Too short = likely invalid

    // 1. Exact URL match
    if (originalLink) {
        const existingUrl = await UpcomingArticle.findOne({ originalLink })
                         || await Article.findOne({ originalLink });
        if (existingUrl) return true;
    }

    // 2. Exact title match
    const existingTitle = await UpcomingArticle.findOne({ title })
                       || await Article.findOne({ title });
    if (existingTitle) return true;

    // 3. Fuzzy title match in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentUpcoming = await UpcomingArticle.find({ createdAt: { $gte: thirtyDaysAgo } }).select('title');
    const recentArticles = await Article.find({ createdAt: { $gte: thirtyDaysAgo } }).select('title');
    const allTitles = [...recentUpcoming, ...recentArticles].map(a => a.title);

    for (const existing of allTitles) {
        if (titleSimilarity(title, existing) > 0.82) return true;
    }

    return false;
}

function extractImageFromRSS(item) {
    // 1. Standard enclosure
    if (item.enclosure?.url) return item.enclosure.url;
    if (item.enclosure?.['@url']) return item.enclosure['@url'];

    // 2. media:content (various formats)
    let mediaContent = item['media:content'];
    if (!mediaContent && item['media:group']) {
        mediaContent = item['media:group']['media:content'];
    }
    if (mediaContent) {
        const contents = Array.isArray(mediaContent) ? mediaContent : [mediaContent];
        for (const m of contents) {
            const url = m?.$?.url || m?.url || m?.['@url'] || m?.$?.['@url'];
            if (url && !url.includes('tracking') && !url.includes('pixel') && !url.includes('1x1')) {
                return url;
            }
        }
    }

    // 3. media:thumbnail
    let thumb = item['media:thumbnail'];
    if (!thumb && item['media:group']) {
        thumb = item['media:group']['media:thumbnail'];
    }
    if (thumb) {
        const thumbs = Array.isArray(thumb) ? thumb : [thumb];
        for (const t of thumbs) {
            const url = t?.$?.url || t?.url || t?.['@url'];
            if (url) return url;
        }
    }

    // 4. itunes:image
    if (item['itunes:image']?.href) return item['itunes:image'].href;
    if (item['itunes:image']?.$?.href) return item['itunes:image'].$.href;

    // 5. Extract from HTML content (content:encoded, description, content, summary)
    const htmlContent = item['content:encoded'] || item.content || item.description || item.summary || '';
    const imgMatch = htmlContent.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
    if (imgMatch) return imgMatch[1];

    // 6. Broader regex for raw image URLs in text
    const broadMatch = htmlContent.match(/https?:\/\/[^\s"<>]+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s"<>]*)?/i);
    if (broadMatch) return broadMatch[0];

    // 7. Image in CDATA or other fields
    if (item.image?.url) return item.image.url;

    return null;
}

async function fetchOGImage(url) {
    if (!url) return null;
    try {
        const response = await axios.get(url, {
            timeout: 8000,
            maxRedirects: 5,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CentrinsicBot/1.0)' }
        });
        const html = response.data;
        // og:image
        let ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                   || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        // twitter:image
        if (!ogMatch) {
            ogMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
                     || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
        }
        if (ogMatch) {
            let imgUrl = ogMatch[1].trim();
            if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
            if (imgUrl.startsWith('/')) {
                const base = new URL(url);
                imgUrl = `${base.protocol}//${base.host}${imgUrl}`;
            }
            return imgUrl;
        }
        return null;
    } catch (e) {
        return null;
    }
}

function getFallbackImage(category) {
    return CATEGORY_FALLBACK_IMAGES[category] || CATEGORY_FALLBACK_IMAGES['General'];
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
    if (isPublishing) {
        console.log('⏳ Publish already in progress, skipping');
        return;
    }
    isPublishing = true;

    try {
    const now = new Date();

    // Find the EARLIEST targetDate in the queue (timezone-agnostic)
    const earliest = await UpcomingArticle.findOne().sort({ targetDate: 1 }).select('targetDate');
    if (!earliest) {
        console.log('📅 No queued articles found in UpcomingArticle collection');
        publishScheduleLog.lastPublishTime = new Date().toISOString();
        publishScheduleLog.lastPublishedCount = 0;
        return;
    }

    // Normalize to midnight→end-of-day for that targetDate
    const targetDay = new Date(earliest.targetDate);
    targetDay.setHours(0, 0, 0, 0);
    const endOfTargetDay = new Date(targetDay);
    endOfTargetDay.setHours(23, 59, 59, 999);

    console.log(`📅 Publishing queued articles for targetDate: ${targetDay.toDateString()}`);
    console.log(`   Query range: ${targetDay.toISOString()} → ${endOfTargetDay.toISOString()}`);

    const queued = await UpcomingArticle.find({
        targetDate: { $gte: targetDay, $lte: endOfTargetDay },
        status: 'published'
    });

    console.log(`   Found ${queued.length} articles matching targetDate range`);

    if (queued.length === 0) {
        console.log('   ⚠️ No articles matched — checking earliest articles as fallback...');
        // Fallback: publish ONLY the earliest 35 articles (one day max)
        const allQueued = await UpcomingArticle.find({ status: 'published' }).sort({ targetDate: 1 }).limit(35);
        if (allQueued.length === 0) {
            console.log('   ❌ Queue is completely empty');
            publishScheduleLog.lastPublishTime = new Date().toISOString();
            publishScheduleLog.lastPublishedCount = 0;
            return;
        }
        console.log(`   🔄 Fallback: publishing ${allQueued.length} earliest articles from queue`);
        for (const q of allQueued) {
            await Article.create({
                title: q.title,
                content: q.content,
                summary: q.summary || q.content,
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
        // Only delete the specific articles we published
        await UpcomingArticle.deleteMany({ _id: { $in: allQueued.map(q => q._id) } });
        publishScheduleLog.lastPublishTime = new Date().toISOString();
        publishScheduleLog.lastPublishedCount = allQueued.length;
        console.log(`   ✅ Fallback published ${allQueued.length} articles`);
        return;
    }

    for (const q of queued) {
        await Article.create({
            title: q.title,
            content: q.content,
            summary: q.summary || q.content,
            image: q.image,
            source: q.source,
            category: q.category,
            originalLink: q.originalLink,
            isManual: true,
            status: 'published',
            expiresAt: q.expiresAt,
            author_id: q.author_id,
            author_name: q.author_name || 'RSS Auto-Fetch',
            isRSS: q.isRSS || false
        });
    }

    // Delete published articles from queue
    await UpcomingArticle.deleteMany({ 
        targetDate: { $gte: targetDay, $lte: endOfTargetDay } 
    });

    publishScheduleLog.lastPublishTime = new Date().toISOString();
    publishScheduleLog.lastPublishedCount = queued.length;
    console.log(`   ✅ Published ${queued.length} articles for ${targetDay.toDateString()}`);
    } finally {
        isPublishing = false;
    }
}

async function schedulePublishAfterDelay() {
    const delayMs = PUBLISH_DELAY_MINUTES * 60 * 1000;
    const publishTime = new Date(Date.now() + delayMs);
    publishScheduleLog.nextPublishTime = publishTime.toISOString();

    console.log(`⏳ Auto-publish scheduled for ${publishTime.toLocaleTimeString('en-US', { timeZone: DELETE_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: true })} (${PUBLISH_DELAY_MINUTES} min delay)`);

    setTimeout(async () => {
        console.log('🚀 Running scheduled auto-publish (setTimeout)...');
        await publishQueuedArticles();
        publishScheduleLog.nextPublishTime = null;
    }, delayMs);
}

// ============================================
// ROBUST PUBLISH CHECK — survives server restarts
// ============================================
async function checkAndPublishPending() {
    if (isPublishing) {
        console.log('⏳ Publish already in progress, skipping check');
        return;
    }
    try {
        // Count manual articles currently live
        const liveCount = await Article.countDocuments({ isManual: true });
        // Count queued articles
        const queuedCount = await UpcomingArticle.countDocuments();

        console.log(`🔍 Publish check: ${liveCount} live manual articles, ${queuedCount} queued`);

        // ONLY publish if NO live articles exist (fresh start / after delete)
        // This prevents double-publishing when articles already exist
        if (liveCount === 0 && queuedCount > 0) {
            console.log('🚨 No live articles found but queue has articles — running catch-up publish!');
            await publishQueuedArticles();
        } else if (liveCount > 0) {
            console.log(`✅ ${liveCount} live articles already present — skipping catch-up`);
        }

        // REMOVED: The hoursSinceLast catch-up was causing multiple days to publish
        // The auto-delete at 23:57 IST + 33min delay is the ONLY scheduled publish trigger
    } catch (err) {
        console.error('❌ checkAndPublishPending error:', err.message);
    }
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
        // Use IST date for comparison, not UTC date
        const todayIST = new Intl.DateTimeFormat('en-US', { timeZone: DELETE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
        const lastIST = autoDeleteLog.lastRun 
            ? new Intl.DateTimeFormat('en-US', { timeZone: DELETE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(autoDeleteLog.lastRun))
            : null;
        if (lastIST === todayIST) {
            console.log(`⏰ Already ran today (${todayIST}), skipping`);
            return;
        }
        console.log(`⏰ Auto-delete triggered at ${DELETE_HOUR}:${String(DELETE_MINUTE).padStart(2, '0')} ${DELETE_TIMEZONE} | Today: ${todayIST} | Last: ${lastIST || 'never'}`);
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

app.post('/api/admin/trigger-publish', adminAuthMiddleware, async (req, res) => {
    try {
        console.log('🔧 Manual publish triggered');
        await publishQueuedArticles();
        res.json({ 
            success: true, 
            message: 'Publish triggered', 
            lastPublishTime: publishScheduleLog.lastPublishTime,
            lastPublishedCount: publishScheduleLog.lastPublishedCount
        });
    } catch (err) { 
        res.status(500).json({ success: false, error: err.message }); 
    }
});

// RESTORE missing days — publish specific day(s) back to live articles
app.post('/api/admin/restore-day', adminAuthMiddleware, async (req, res) => {
    try {
        const { dayOffset } = req.body; // 0 = today, 1 = tomorrow, etc. Or use 'all' for all remaining

        if (dayOffset === 'all') {
            // Publish ALL remaining queued articles (emergency restore)
            const allQueued = await UpcomingArticle.find({ status: 'published' }).sort({ targetDate: 1 });
            if (allQueued.length === 0) {
                return res.json({ success: true, message: 'No queued articles to restore' });
            }
            for (const q of allQueued) {
                await Article.create({
                    title: q.title,
                    content: q.content,
                    summary: q.summary || q.content,
                    image: q.image,
                    source: q.source,
                    category: q.category,
                    originalLink: q.originalLink,
                    isManual: true,
                    status: 'published',
                    expiresAt: q.expiresAt,
                    author_id: q.author_id,
                    author_name: q.author_name || 'RSS Auto-Fetch',
                    isRSS: q.isRSS || false
                });
            }
            await UpcomingArticle.deleteMany({ _id: { $in: allQueued.map(q => q._id) } });
            return res.json({ 
                success: true, 
                message: `Restored ${allQueued.length} articles`,
                restoredCount: allQueued.length
            });
        }

        // Restore specific day by offset
        const targetDay = new Date();
        targetDay.setHours(0, 0, 0, 0);
        targetDay.setDate(targetDay.getDate() + (dayOffset || 0));
        const endOfDay = new Date(targetDay);
        endOfDay.setHours(23, 59, 59, 999);

        const toRestore = await UpcomingArticle.find({
            targetDate: { $gte: targetDay, $lte: endOfDay },
            status: 'published'
        });

        if (toRestore.length === 0) {
            return res.json({ success: true, message: `No articles found for day offset ${dayOffset}` });
        }

        for (const q of toRestore) {
            await Article.create({
                title: q.title,
                content: q.content,
                summary: q.summary || q.content,
                image: q.image,
                source: q.source,
                category: q.category,
                originalLink: q.originalLink,
                isManual: true,
                status: 'published',
                expiresAt: q.expiresAt,
                author_id: q.author_id,
                author_name: q.author_name || 'RSS Auto-Fetch',
                isRSS: q.isRSS || false
            });
        }
        await UpcomingArticle.deleteMany({ _id: { $in: toRestore.map(q => q._id) } });

        res.json({ 
            success: true, 
            message: `Restored ${toRestore.length} articles for ${targetDay.toDateString()}`,
            restoredCount: toRestore.length,
            dayOffset: dayOffset
        });
    } catch (err) { 
        res.status(500).json({ success: false, error: err.message }); 
    }
});

app.get('/api/admin/publish-status', adminAuthMiddleware, async (req, res) => {
    try {
        const liveCount = await Article.countDocuments({ isManual: true });
        const queuedCount = await UpcomingArticle.countDocuments();
        const earliest = await UpcomingArticle.findOne().sort({ targetDate: 1 }).select('targetDate dayLabel');

        // Get day-by-day breakdown
        const dayBreakdown = await UpcomingArticle.aggregate([
            { $match: { status: 'published' } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$targetDate' } }, count: { $sum: 1 }, dayLabel: { $first: '$dayLabel' } } },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            liveManualArticles: liveCount,
            queuedArticles: queuedCount,
            earliestTargetDate: earliest ? { date: earliest.targetDate, dayLabel: earliest.dayLabel } : null,
            dayBreakdown: dayBreakdown,
            lastPublish: publishScheduleLog,
            autoDelete: autoDeleteLog,
            todayIST: new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' })
        });
    } catch (err) { 
        res.status(500).json({ success: false, error: err.message }); 
    }
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
app.listen(PORT, async () => {
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
    console.log(`Gemini AI:        ${GEMINI_API_KEY ? '✅' : '❌'} ${GEMINI_API_KEY ? '(~170 words summary)' : '(add GEMINI_API_KEY to .env)'}`);
    console.log(`Gemini Delay:     ${GEMINI_DELAY_MS}ms (${(GEMINI_DELAY_MS/1000).toFixed(1)}s) between articles`);
    console.log(`Gemini Key Length: ${GEMINI_API_KEY ? GEMINI_API_KEY.length : 0} chars`);
    console.log(`Duplicate Filter: ✅ URL + fuzzy title match (30-day window)`);
    console.log(`Image Extraction: ✅ RSS → OG tags → Category fallback`);
    console.log(`Robust Publish:   ✅ Startup check + 30-min interval`);
    console.log('========================================');

    // Wait for MongoDB to be ready, then run startup publish check
    setTimeout(async () => {
        await checkAndPublishPending();
    }, 5000);

    // EMERGENCY RESTORE: If queue has articles but live articles exist,
    // restore missing days automatically (prevents data loss on redeploy)
    setTimeout(async () => {
        try {
            const liveCount = await Article.countDocuments({ isManual: true });
            const queuedCount = await UpcomingArticle.countDocuments();

            // If we have live articles AND queued articles, check if we need to restore
            if (liveCount > 0 && queuedCount > 0) {
                const earliestQueued = await UpcomingArticle.findOne().sort({ targetDate: 1 });
                const latestLive = await Article.findOne({ isManual: true }).sort({ createdAt: -1 });

                if (earliestQueued && latestLive) {
                    const queuedDate = new Date(earliestQueued.targetDate).toDateString();
                    const liveDate = latestLive.createdAt ? new Date(latestLive.createdAt).toDateString() : 'unknown';

                    console.log(`🔄 Restore check: Live=${liveCount}, Queued=${queuedCount}`);
                    console.log(`   Earliest queued: ${queuedDate} | Latest live: ${liveDate}`);

                    // If queue has articles for dates that should have been published, restore them
                    const daysBehind = Math.floor((Date.now() - new Date(earliestQueued.targetDate).getTime()) / (1000 * 60 * 60 * 24));
                    if (daysBehind >= 0) {
                        console.log(`⚠️ Queue is ${daysBehind} days behind — articles may need restoration`);
                        console.log(`   Use POST /api/admin/restore-day with {"dayOffset":"all"} to restore all`);
                    }
                }
            }
        } catch (e) {
            console.error('Restore check error:', e.message);
        }
    }, 10000);

    // Test Gemini on startup
    if (GEMINI_API_KEY && geminiModel) {
        setTimeout(async () => {
            try {
                const testResult = await geminiModel.generateContent('Say "Gemini is working" in 5 words or less.');
                const testText = (await testResult.response.text()).trim();
                console.log(`🤖 Gemini test: ${testText}`);
            } catch (e) {
                console.error('🤖 Gemini test FAILED:', e.message);
                console.error('   → Model may be deprecated. Current working model: gemini-3.5-flash');
                console.error('   → Check your GEMINI_API_KEY at https://aistudio.google.com/app/apikey');
            }
        }, 8000);
    } else {
        console.log('🤖 Gemini: No API key or model not initialized');
    }

    // Run publish check every 30 minutes (catches missed publishes)
    setInterval(checkAndPublishPending, 30 * 60 * 1000);

    // Start auto-refill checks
    setTimeout(checkAndRefillQueue, 10000); // First check after 10 seconds
    setInterval(checkAndRefillQueue, 6 * 60 * 60 * 1000); // Then every 6 hours
});