// ============================================
// KTT NEWS SERVER - FIXED FOR RENDER.COM
// ============================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const os = require('os');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ktt-news-secret-key-2024';

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

// ============================================
// EMAIL SETUP (Gmail SMTP)
// ============================================
// ============================================
// EMAIL SETUP (RENDER SAFE SMTP)
// ============================================

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000
});

const otpStore = new Map();

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOTPEmail(toEmail, otp) {
    const mailOptions = {
        from: `"KTT News" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: 'Your KTT News Login Code',
        html: `
        <div style="font-family: Arial; padding:20px">
            <h2>KTT News Verification</h2>
            <p>Your OTP:</p>
            <h1 style="letter-spacing:6px">${otp}</h1>
            <p>Expires in 5 minutes</p>
        </div>`
    };

    try {
        await Promise.race([
            transporter.sendMail(mailOptions),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("SMTP Timeout")), 15000)
            )
        ]);

        console.log("✅ OTP sent:", toEmail);
        return true;

    } catch (error) {
        console.error("❌ OTP EMAIL ERROR:", error.message);
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
    author_id: mongoose.Schema.Types.ObjectId,
    author_name: String,
    created_at: { type: Date, default: Date.now }
});

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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
    next();
});

app.use('/uploads', express.static('uploads'));

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads', { recursive: true });
}

app.use(express.static(path.join(__dirname, 'front-end')));

// ============================================
// MULTER SETUP
// ============================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images allowed'), false);
        }
    }
});

// ============================================
// AUTH MIDDLEWARE
// ============================================
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    
    if (!token) {
        return res.status(401).json({ error: 'Token format invalid' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error('JWT Verify Error:', err.message);
            return res.status(401).json({ error: 'Invalid token' });
        }
        req.userId = decoded.userId;
        req.userName = decoded.name;
        next();
    });
};

// ============================================
// API ROUTES
// ============================================

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        dbConnected: mongoose.connection.readyState === 1
    });
});

app.get('/api/articles', async (req, res) => {
    try {
        const articles = await Article.find().sort({ created_at: -1 });
        res.json(articles);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/articles/:id', async (req, res) => {
    try {
        const article = await Article.findById(req.params.id);
        if (!article) return res.status(404).json({ error: 'Article not found' });
        res.json(article);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// OTP AUTH ENDPOINTS
// ============================================

app.post('/api/auth/send-otp', async (req, res) => {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, message: 'Valid email required' });
    }
    
    try {
        const otp = generateOTP();
        const expiresAt = Date.now() + (5 * 60 * 1000);
        
        otpStore.set(email, { otp, expiresAt });
        
        const sent = await sendOTPEmail(email, otp);
        
        if (!sent) {
            return res.status(500).json({ success: false, message: 'Failed to send email' });
        }
        
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
        
        if (!stored) {
            return res.status(400).json({ success: false, message: 'OTP expired or not requested' });
        }
        
        if (stored.expiresAt < Date.now()) {
            otpStore.delete(email);
            return res.status(400).json({ success: false, message: 'OTP expired' });
        }
        
        if (stored.otp !== otp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }
        
        otpStore.delete(email);
        
        let user = await User.findOne({ email: email.toLowerCase().trim() });
        let isNewUser = false;
        
        if (!user) {
            const userName = email.split('@')[0];
            const randomPassword = Math.random().toString(36).slice(-8);
            const hashedPassword = await bcrypt.hash(randomPassword, 10);
            
            user = new User({
                name: userName,
                email: email.toLowerCase().trim(),
                password: hashedPassword,
                created_at: new Date()
            });
            await user.save();
            isNewUser = true;
        }
        
        await UserEmail.findOneAndUpdate(
            { email: user.email },
            { 
                email: user.email, 
                device: req.headers['user-agent'] || 'unknown',
                created_at: new Date()
            },
            { upsert: true, new: true }
        );
        
        const token = jwt.sign({ userId: user._id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            },
            isNewUser: isNewUser
        });
        
    } catch (err) {
        console.error('Verify OTP error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/save-email', async (req, res) => {
    console.log('\n========== SAVE EMAIL REQUEST ==========');
    console.log('Body:', req.body);
    
    const { email, name, password } = req.body;
    
    if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, message: 'Invalid email' });
    }
    
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(500).json({ success: false, message: 'Database not connected' });
        }
        
        const cleanEmail = email.toLowerCase().trim();
        const userName = name || cleanEmail.split('@')[0];
        const userPassword = password || Math.random().toString(36).slice(-8);
        
        await UserEmail.findOneAndUpdate(
            { email: cleanEmail },
            { 
                email: cleanEmail, 
                device: req.headers['user-agent'] || 'unknown',
                created_at: new Date()
            },
            { upsert: true, new: true }
        );
        
        let user = await User.findOne({ email: cleanEmail });
        let isNewUser = false;
        
        if (!user) {
            const hashedPassword = await bcrypt.hash(userPassword, 10);
            user = new User({
                name: userName,
                email: cleanEmail,
                password: hashedPassword,
                created_at: new Date()
            });
            await user.save();
            isNewUser = true;
        }
        
        const token = jwt.sign({ userId: user._id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        
        console.log('✅ User saved:', user._id);
        console.log('========== END REQUEST ==========\n');
        
        res.json({ 
            success: true, 
            message: 'Email saved',
            email: cleanEmail,
            isNew: isNewUser,
            userId: user._id,
            token: token
        });
        
    } catch (err) {
        console.error('❌ SAVE EMAIL ERROR:', err);
        res.status(500).json({ success: false, message: 'Database error', error: err.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists' });
        }

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

app.post('/api/news-test', upload.single('image'), async (req, res) => {
    console.log('📸 News Test Upload:', req.body);
    console.log('📁 File:', req.file);
    
    const { title, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: 'Title and content required' });
    }

    const imagePath = req.file ? '/uploads/' + req.file.filename : (req.body.image || '');
    
    try {
        const article = new Article({
            title,
            content,
            image: imagePath,
            author_id: null,
            author_name: 'Test User (No Auth)'
        });
        await article.save();
        
        res.json({ 
            success: true, 
            articleId: article._id, 
            message: 'Article saved via /api/news-test (NO AUTH)',
            fileInfo: req.file ? {
                originalname: req.file.originalname,
                filename: req.file.filename,
                size: req.file.size
            } : null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/articles', authMiddleware, upload.single('image'), async (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });

    const imagePath = req.file ? '/uploads/' + req.file.filename : (req.body.image || '');
    
    try {
        const article = new Article({
            title,
            content,
            image: imagePath,
            author_id: req.userId,
            author_name: req.userName || 'Anonymous'
        });
        await article.save();
        
        res.json({ success: true, articleId: article._id, message: 'Article saved' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/news', authMiddleware, upload.single('image'), async (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });

    const imagePath = req.file ? '/uploads/' + req.file.filename : (req.body.image || '');
    
    try {
        const article = new Article({
            title,
            content,
            image: imagePath,
            author_id: req.userId,
            author_name: req.userName || 'Anonymous'
        });
        await article.save();
        
        res.json({ success: true, articleId: article._id, message: 'Article saved via /api/news' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/bookmarks', authMiddleware, async (req, res) => {
    try {
        const bookmarks = await Bookmark.find({ user_id: req.userId })
            .populate('article_id')
            .sort({ created_at: -1 });
        res.json(bookmarks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/bookmarks', authMiddleware, async (req, res) => {
    try {
        const { articleId } = req.body;
        const bookmark = new Bookmark({
            user_id: req.userId,
            article_id: articleId
        });
        await bookmark.save();
        res.json({ success: true, message: 'Bookmark added' });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: 'Already bookmarked' });
        }
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

if (DEBUG) {
    app.get('/api/debug/db-status', async (req, res) => {
        try {
            const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
            res.json({
                mongoConnection: states[mongoose.connection.readyState] || 'unknown',
                databaseName: mongoose.connection.name,
                collections: {
                    users: await User.countDocuments(),
                    useremails: await UserEmail.countDocuments(),
                    articles: await Article.countDocuments(),
                    bookmarks: await Bookmark.countDocuments()
                }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/debug/list-users', async (req, res) => {
        try {
            const users = await User.find().select('-password');
            const emails = await UserEmail.find();
            res.json({
                usersCollection: users,
                userEmailsCollection: emails,
                totalUsers: users.length,
                totalEmails: emails.length
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/admin', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>KTT Admin</title>
                <style>
                    body { font-family: Arial; padding: 20px; background: #f5f5f5; }
                    .card { background: white; padding: 20px; margin: 10px 0; border-radius: 8px; }
                    button { padding: 10px 20px; margin: 5px; cursor: pointer; background: #007aff; color: white; border: none; border-radius: 5px; }
                </style>
            </head>
            <body>
                <h1>📊 KTT Admin</h1>
                <div class="card">
                    <button onclick="location.href='/api/debug/db-status'">Check DB Status</button>
                    <button onclick="location.href='/api/debug/list-users'">List All Users</button>
                </div>
            </body>
            </html>
        `);
    });
}

app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found', path: req.path });
    }
    res.sendFile(path.join(__dirname, 'front-end', 'index.html'), (err) => {
        if (err) {
            console.error('Error serving index.html:', err);
            res.status(500).send('Error loading application');
        }
    });
});

app.use((err, req, res, next) => {
    console.error('Error:', err);
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: 'File upload error: ' + err.message });
    }
    res.status(500).json({ error: err.message || 'Internal server error' });
});

// ============================================
// START SERVER - FIXED FOR RENDER (No '0.0.0.0')
// ============================================
app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 SERVER STARTED WITH GMAIL OTP');
    console.log('========================================');
    console.log(`Port:     ${PORT}`);
    console.log('========================================');
    console.log('📧 Email OTP endpoints:');
    console.log(`   POST /api/auth/send-otp`);
    console.log(`   POST /api/auth/verify-otp`);
    console.log('========================================');
    console.log('🧪 TEST endpoint (no auth):');
    console.log(`   POST /api/news-test`);
    console.log('========================================');
});