const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const Database = require('better-sqlite3');
const twilio = require('twilio');
const config = require('./config');

// Initialize bot
const bot = require('./bot');

const app = express();
const db = new Database('Imposter.db');

// Twilio client for SMS
const twilioClient = config.TWILIO_ACCOUNT_SID ? 
    twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN) : null;

// Store OTPs temporarily (in production, use Redis)
const otpStore = new Map();

// Create uploads directory
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only .png, .jpg and .jpeg format allowed!'));
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Database setup
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT,
        avatar TEXT,
        address TEXT,
        phone TEXT,
        fullName TEXT,
        pincode TEXT,
        isPhoneVerified INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        image TEXT,
        type TEXT DEFAULT 'both'
    );

    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        description TEXT,
        image TEXT,
        category_id INTEGER,
        category_slug TEXT,
        sport_type TEXT,
        dress_type TEXT,
        stock INTEGER DEFAULT 10,
        is_featured INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS cart (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        productId INTEGER NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (productId) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        productName TEXT NOT NULL,
        price INTEGER NOT NULL,
        proof TEXT,
        status TEXT DEFAULT 'pending',
        paymentMethod TEXT DEFAULT 'online',
        address TEXT,
        phone TEXT,
        fullName TEXT,
        pincode TEXT,
        isPhoneVerified INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS otp_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        otp TEXT NOT NULL,
        userId TEXT,
        expiresAt DATETIME,
        isUsed INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// Insert default categories
const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
if (categoryCount.count === 0) {
    const insertCategory = db.prepare('INSERT INTO categories (name, slug, image, type) VALUES (?, ?, ?, ?)');
    
    const categories = [
        // Sports Categories
        ['Cricket', 'cricket', '/images/cricket.jpg', 'sports'],
        ['Football', 'football', '/images/football.jpg', 'sports'],
        ['Cycling', 'cycling', '/images/cycling.jpg', 'sports'],
        ['Badminton', 'badminton', '/images/badminton.jpg', 'sports'],
        ['Basketball', 'basketball', '/images/basketball.jpg', 'sports'],
        ['Biker', 'biker', '/images/biker.jpg', 'sports'],
        ['Esports', 'esports', '/images/esports.jpg', 'sports'],
        ['Tennis', 'tennis', '/images/tennis.jpg', 'sports'],
        ['Running', 'running', '/images/running.jpg', 'sports'],
        ['Jacket', 'jacket', '/images/jacket.jpg', 'sports'],
        ['Gym', 'gym', '/images/gym.jpg', 'sports'],
        ['Kabaddi', 'kabaddi', '/images/kabaddi.jpg', 'sports'],
        
        // Dress Categories
        ['Wedding Collection', 'wedding', '/images/wedding.jpg', 'dress'],
        ['Fantasy Dresses', 'fantasy', '/images/fantasy.jpg', 'dress'],
        ['Couple Sets', 'couple', '/images/couple.jpg', 'dress'],
        ['Evening Gowns', 'evening', '/images/evening.jpg', 'dress'],
        ['Bridal', 'bridal', '/images/bridal.jpg', 'dress'],
        ['Engagement', 'engagement', '/images/engagement.jpg', 'dress']
    ];
    
    categories.forEach(c => {
        insertCategory.run(c[0], c[1], c[2], c[3]);
    });
}

// Insert sample products
const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get();
if (productCount.count === 0) {
    const insertProduct = db.prepare('INSERT INTO products (name, price, description, category_slug, sport_type, dress_type, is_featured, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    
    const products = [
        // Cricket
        ['Professional Cricket Jersey', 2499, 'Premium quality cricket jersey with moisture-wicking technology', 'cricket', 'cricket', null, 1, 25],
        ['Cricket Training Pants', 1899, 'Comfortable training pants for cricket practice', 'cricket', 'cricket', null, 0, 20],
        ['Team India Replica Jersey', 2999, 'Official replica jersey with custom name printing', 'cricket', 'cricket', null, 1, 15],
        
        // Football
        ['Elite Football Jersey', 2199, 'Breathable fabric for maximum performance', 'football', 'football', null, 1, 30],
        ['Football Shorts', 999, 'Lightweight shorts with elastic waistband', 'football', 'football', null, 0, 40],
        
        // Cycling
        ['Race Fit Cycling Jersey', 3499, 'Aerodynamic design for competitive cycling', 'cycling', 'cycling', null, 1, 12],
        ['Cycling Bib Shorts', 2799, 'Comfortable padded shorts for long rides', 'cycling', 'cycling', null, 0, 18],
        
        // Wedding Dresses
        ['Eternal Vow Wedding Gown', 54999, 'Handcrafted wedding gown with crystal details and flowing train', 'wedding', null, 'wedding', 1, 5],
        ['Moonlit Bride Dress', 45999, 'Romantic wedding dress with moon-inspired embroidery', 'wedding', null, 'wedding', 1, 3],
        
        // Fantasy Dresses
        ['Midnight Enchantment Gown', 24999, 'A flowing gown that shimmers like moonlight on water', 'fantasy', null, 'fantasy', 1, 10],
        ['Starlight Promise Dress', 34999, 'Hand-stitched with glowing particles like distant stars', 'fantasy', null, 'fantasy', 1, 8],
        
        // Couple Sets
        ['Moonlit Romance Couple Set', 39999, 'Matching couple outfits with ethereal glow elements', 'couple', null, 'couple', 1, 6]
    ];
    
    products.forEach(p => {
        insertProduct.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]);
    });
}

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

app.set('view engine', 'ejs');

// Helper functions
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTP = async (phone, otp) => {
    if (!twilioClient) {
        console.log(`[MOCK SMS] OTP ${otp} sent to ${phone}`);
        return true;
    }
    
    try {
        await twilioClient.messages.create({
            body: `Your Moonlit Promise verification OTP is: ${otp}. Valid for 10 minutes.`,
            from: config.TWILIO_PHONE_NUMBER,
            to: phone
        });
        return true;
    } catch (error) {
        console.error('Twilio error:', error);
        return false;
    }
};

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/');
    }
};

// Check if user is admin
const isAdmin = (req, res, next) => {
    if (req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id)) {
        next();
    } else {
        res.status(403).send('Access denied');
    }
};

// ==================== MAIN ROUTES ====================

app.get('/', (req, res) => {
    const featuredProducts = db.prepare('SELECT * FROM products WHERE is_featured = 1 ORDER BY id DESC LIMIT 8').all();
    const sportsCategories = db.prepare('SELECT * FROM categories WHERE type IN ("sports", "both") ORDER BY name').all();
    const dressCategories = db.prepare('SELECT * FROM categories WHERE type IN ("dress", "both") ORDER BY name').all();
    const isUserAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    
    res.render('index', { 
        user: req.session.user, 
        products: featuredProducts,
        sportsCategories,
        dressCategories,
        isAdmin: isUserAdmin,
        currency: config.CURRENCY
    });
});

app.get('/about', (req, res) => {
    const isUserAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    res.render('about', { 
        user: req.session.user,
        isAdmin: isUserAdmin,
        currency: config.CURRENCY
    });
});

app.get('/terms', (req, res) => {
    const isUserAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    res.render('terms', { 
        user: req.session.user,
        isAdmin: isUserAdmin,
        currency: config.CURRENCY
    });
});

// ==================== DISCORD AUTH ====================

app.get('/auth/discord', (req, res) => {
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${config.CLIENT_ID}&redirect_uri=${encodeURIComponent(config.REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(discordAuthUrl);
});

app.get('/auth/discord/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.redirect('/');
    }
    
    try {
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: config.CLIENT_ID,
                client_secret: config.CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: config.REDIRECT_URI,
                scope: 'identify'
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );
        
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` }
        });
        
        const userData = userResponse.data;
        
        // Save or update user
        const stmt = db.prepare('INSERT OR REPLACE INTO users (id, username, avatar, createdAt) VALUES (?, ?, ?, COALESCE((SELECT createdAt FROM users WHERE id = ?), CURRENT_TIMESTAMP))');
        stmt.run(userData.id, userData.username, userData.avatar, userData.id);
        
        req.session.user = {
            id: userData.id,
            username: userData.username,
            avatar: userData.avatar
        };
        
        // Send login log
        if (bot.sendLoginLog) bot.sendLoginLog(userData);
        
        res.redirect('/');
    } catch (error) {
        console.error('Auth error:', error);
        res.redirect('/');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ==================== SHOP & CATEGORY ROUTES ====================

app.get('/shop', (req, res) => {
    const { category, type } = req.query;
    
    let query = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_slug = c.slug WHERE 1=1';
    const params = [];
    
    if (category) {
        query += ' AND p.category_slug = ?';
        params.push(category);
    }
    
    if (type === 'sports') {
        query += ' AND p.sport_type IS NOT NULL';
    } else if (type === 'dress') {
        query += ' AND p.dress_type IS NOT NULL';
    }
    
    query += ' ORDER BY p.id DESC';
    
    const products = db.prepare(query).all(params);
    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
    const isUserAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    
    res.render('shop', { 
        user: req.session.user, 
        products,
        categories,
        selectedCategory: category || 'all',
        selectedType: type || 'all',
        isAdmin: isUserAdmin,
        currency: config.CURRENCY
    });
});

app.get('/category/:slug', (req, res) => {
    const { slug } = req.params;
    
    const category = db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
    if (!category) {
        return res.redirect('/shop');
    }
    
    let products;
    if (category.type === 'sports') {
        products = db.prepare('SELECT * FROM products WHERE sport_type = ? ORDER BY id DESC').all(slug);
    } else if (category.type === 'dress') {
        products = db.prepare('SELECT * FROM products WHERE dress_type = ? ORDER BY id DESC').all(slug);
    } else {
        products = db.prepare('SELECT * FROM products WHERE category_slug = ? ORDER BY id DESC').all(slug);
    }
    
    const isUserAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    
    res.render('category', { 
        user: req.session.user, 
        products,
        category,
        isAdmin: isUserAdmin,
        currency: config.CURRENCY
    });
});

app.get('/sport/:sport', (req, res) => {
    const { sport } = req.params;
    
    const validSports = ['cricket', 'football', 'cycling', 'badminton', 'basketball', 'biker', 'esports', 'tennis', 'running', 'jacket', 'gym', 'kabaddi'];
    
    if (!validSports.includes(sport)) {
        return res.redirect('/shop');
    }
    
    const products = db.prepare('SELECT * FROM products WHERE sport_type = ? ORDER BY id DESC').all(sport);
    const isUserAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    
    res.render('sport-category', { 
        user: req.session.user, 
        products,
        sport: sport.charAt(0).toUpperCase() + sport.slice(1),
        isAdmin: isUserAdmin,
        currency: config.CURRENCY
    });
});

app.get('/dress/:type', (req, res) => {
    const { type } = req.params;
    
    const validDressTypes = ['wedding', 'fantasy', 'couple', 'evening', 'bridal', 'engagement'];
    
    if (!validDressTypes.includes(type)) {
        return res.redirect('/shop');
    }
    
    const products = db.prepare('SELECT * FROM products WHERE dress_type = ? ORDER BY id DESC').all(type);
    const isUserAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    
    let displayName = '';
    switch(type) {
        case 'wedding': displayName = 'Wedding Collection'; break;
        case 'fantasy': displayName = 'Fantasy Dresses'; break;
        case 'couple': displayName = 'Couple Sets'; break;
        case 'evening': displayName = 'Evening Gowns'; break;
        case 'bridal': displayName = 'Bridal Collection'; break;
        case 'engagement': displayName = 'Engagement Wear'; break;
        default: displayName = type;
    }
    
    res.render('dress-category', { 
        user: req.session.user, 
        products,
        dressType: displayName,
        type: type,
        isAdmin: isUserAdmin,
        currency: config.CURRENCY
    });
});

app.get('/product/:id', (req, res) => {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) {
        return res.redirect('/shop');
    }
    const isUserAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    res.render('product', { 
        user: req.session.user, 
        product,
        isAdmin: isUserAdmin,
        currency: config.CURRENCY
    });
});

// ==================== CART ROUTES ====================

app.get('/cart', isAuthenticated, (req, res) => {
    const cartItems = db.prepare(`
        SELECT c.id as cartId, p.* FROM cart c
        JOIN products p ON c.productId = p.id
        WHERE c.userId = ?
    `).all(req.session.user.id);
    
    const total = cartItems.reduce((sum, item) => sum + item.price, 0);
    const isUserAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    
    res.render('cart', { 
        user: req.session.user, 
        cartItems, 
        total,
        isAdmin: isUserAdmin,
        currency: config.CURRENCY
    });
});

app.post('/cart/add/:productId', isAuthenticated, (req, res) => {
    const productId = req.params.productId;
    const userId = req.session.user.id;
    
    const existing = db.prepare('SELECT * FROM cart WHERE userId = ? AND productId = ?').get(userId, productId);
    
    if (!existing) {
        db.prepare('INSERT INTO cart (userId, productId) VALUES (?, ?)').run(userId, productId);
    }
    
    res.redirect('/cart');
});

app.post('/cart/remove/:cartId', isAuthenticated, (req, res) => {
    db.prepare('DELETE FROM cart WHERE id = ? AND userId = ?').run(req.params.cartId, req.session.user.id);
    res.redirect('/cart');
});

// ==================== CHECKOUT WITH COD + OTP ====================

app.get('/checkout', isAuthenticated, (req, res) => {
    const cartItems = db.prepare(`
        SELECT c.id as cartId, p.* FROM cart c
        JOIN products p ON c.productId = p.id
        WHERE c.userId = ?
    `).all(req.session.user.id);
    
    if (cartItems.length === 0) {
        return res.redirect('/shop');
    }
    
    const total = cartItems.reduce((sum, item) => sum + item.price, 0);
    const isUserAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    const userInfo = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
    
    res.render('checkout', { 
        user: req.session.user, 
        cartItems, 
        total,
        userInfo,
        isAdmin: isUserAdmin,
        qrImage: '/qr.png',
        currency: config.CURRENCY,
        twilioConfigured: !!config.TWILIO_ACCOUNT_SID
    });
});

// Send OTP for COD verification
app.post('/api/send-otp', isAuthenticated, async (req, res) => {
    const { phone } = req.body;
    
    if (!phone) {
        return res.status(400).json({ success: false, message: 'Phone number required' });
    }
    
    // Validate Indian phone number (10 digits)
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
        return res.status(400).json({ success: false, message: 'Invalid Indian phone number' });
    }
    
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Store OTP in database
    db.prepare('INSERT INTO otp_requests (phone, otp, userId, expiresAt) VALUES (?, ?, ?, ?)')
        .run(phone, otp, req.session.user.id, expiresAt.toISOString());
    
    // Send OTP via SMS
    const sent = await sendOTP('+91' + phone, otp);
    
    if (sent) {
        // Store in memory for quick access (optional)
        otpStore.set(`${req.session.user.id}_${phone}`, {
            otp,
            expires: expiresAt
        });
        
        res.json({ success: true, message: 'OTP sent successfully' });
    } else {
        res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }
});

// Verify OTP
app.post('/api/verify-otp', isAuthenticated, (req, res) => {
    const { phone, otp } = req.body;
    
    if (!phone || !otp) {
        return res.status(400).json({ success: false, message: 'Phone and OTP required' });
    }
    
    // Check in database
    const otpRecord = db.prepare(`
        SELECT * FROM otp_requests 
        WHERE phone = ? AND otp = ? AND userId = ? AND isUsed = 0 AND expiresAt > datetime('now')
        ORDER BY id DESC LIMIT 1
    `).get(phone, otp, req.session.user.id);
    
    if (otpRecord) {
        // Mark as used
        db.prepare('UPDATE otp_requests SET isUsed = 1 WHERE id = ?').run(otpRecord.id);
        
        // Update user's phone verification status
        db.prepare('UPDATE users SET phone = ?, isPhoneVerified = 1 WHERE id = ?').run(phone, req.session.user.id);
        
        // Store in session that phone is verified
        req.session.phoneVerified = true;
        req.session.verifiedPhone = phone;
        
        res.json({ success: true, message: 'OTP verified successfully' });
    } else {
        res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }
});

// Submit COD order
app.post('/checkout/cod-submit', isAuthenticated, (req, res) => {
    const { address, fullName, pincode } = req.body;
    const phone = req.session.verifiedPhone;
    
    if (!address || !fullName || !pincode) {
        return res.status(400).send('All fields are required');
    }
    
    if (!phone || !req.session.phoneVerified) {
        return res.redirect('/checkout?error=phone-not-verified');
    }
    
    const userId = req.session.user.id;
    
    // Update user info
    db.prepare('UPDATE users SET address = ?, fullName = ?, pincode = ?, phone = ?, isPhoneVerified = 1 WHERE id = ?')
        .run(address, fullName, pincode, phone, userId);
    
    // Get cart items
    const cartItems = db.prepare(`
        SELECT p.* FROM cart c
        JOIN products p ON c.productId = p.id
        WHERE c.userId = ?
    `).all(userId);
    
    // Create orders
    const insertOrder = db.prepare('INSERT INTO orders (userId, productName, price, status, paymentMethod, address, phone, fullName, pincode, isPhoneVerified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    
    cartItems.forEach(item => {
        insertOrder.run(userId, item.name, item.price, 'pending', 'cod', address, phone, fullName, pincode, 1);
    });
    
    // Clear cart
    db.prepare('DELETE FROM cart WHERE userId = ?').run(userId);
    
    // Send notification to Discord (COD order)
    if (bot.sendCODOrderLog) {
        bot.sendCODOrderLog(req.session.user, cartItems, address, phone, fullName, pincode);
    }
    
    // Clear session verification
    delete req.session.phoneVerified;
    delete req.session.verifiedPhone;
    
    res.redirect('/history?order=placed');
});

// Online payment checkout
app.post('/checkout/online-submit', isAuthenticated, upload.single('proof'), (req, res) => {
    const { address, phone, fullName, pincode } = req.body;
    const proofFile = req.file;
    
    if (!address || !phone || !fullName || !pincode || !proofFile) {
        return res.status(400).send('All fields including payment proof are required');
    }
    
    const userId = req.session.user.id;
    
    // Update user
    db.prepare('UPDATE users SET address = ?, phone = ?, fullName = ?, pincode = ? WHERE id = ?')
        .run(address, phone, fullName, pincode, userId);
    
    // Get cart items
    const cartItems = db.prepare(`
        SELECT p.* FROM cart c
        JOIN products p ON c.productId = p.id
        WHERE c.userId = ?
    `).all(userId);
    
    // Create orders
    const insertOrder = db.prepare('INSERT INTO orders (userId, productName, price, proof, status, paymentMethod, address, phone, fullName, pincode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    
    cartItems.forEach(item => {
        insertOrder.run(userId, item.name, item.price, proofFile.filename, 'pending', 'online', address, phone, fullName, pincode);
    });
    
    // Clear cart
    db.prepare('DELETE FROM cart WHERE userId = ?').run(userId);
    
    // Send payment log to Discord
    if (bot.sendPaymentLog) {
        bot.sendPaymentLog(req.session.user, cartItems, proofFile.filename, address, phone, fullName, pincode);
    }
    
    res.redirect('/history');
});

// ==================== ORDER HISTORY ====================

app.get('/history', isAuthenticated, (req, res) => {
    const orders = db.prepare('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC').all(req.session.user.id);
    const isUserAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    
    res.render('history', { 
        user: req.session.user, 
        orders,
        isAdmin: isUserAdmin,
        currency: config.CURRENCY
    });
});

// ==================== ADMIN ROUTES ====================

app.get('/admin', isAdmin, (req, res) => {
    const users = db.prepare('SELECT * FROM users ORDER BY createdAt DESC').all();
    const orders = db.prepare(`
        SELECT o.*, u.username FROM orders o
        JOIN users u ON o.userId = u.id
        ORDER BY o.createdAt DESC
    `).all();
    const products = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
    
    res.render('admin', { 
        user: req.session.user, 
        users, 
        orders,
        products,
        categories,
        isAdmin: true,
        currency: config.CURRENCY
    });
});

// Order approval/rejection
app.post('/admin/order/approve/:orderId', isAdmin, (req, res) => {
    const orderId = req.params.orderId;
    
    const order = db.prepare(`
        SELECT o.*, u.username, u.id as userId FROM orders o
        JOIN users u ON o.userId = u.id
        WHERE o.id = ?
    `).get(orderId);
    
    if (order) {
        db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('approved', orderId);
        if (bot.giveRole) bot.giveRole(order.userId, order.username);
        if (bot.sendApprovalLog) bot.sendApprovalLog(order);
    }
    
    res.redirect('/admin');
});

app.post('/admin/order/reject/:orderId', isAdmin, (req, res) => {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('rejected', req.params.orderId);
    res.redirect('/admin');
});

// Product management
app.get('/admin/product/new', isAdmin, (req, res) => {
    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
    res.render('product-form', { 
        user: req.session.user, 
        product: null,
        categories,
        isAdmin: true,
        currency: config.CURRENCY
    });
});

app.get('/admin/product/edit/:id', isAdmin, (req, res) => {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
    res.render('product-form', { 
        user: req.session.user, 
        product,
        categories,
        isAdmin: true,
        currency: config.CURRENCY
    });
});

app.post('/admin/product/create', isAdmin, upload.single('productImage'), (req, res) => {
    const { name, price, description, category_slug, sport_type, dress_type, is_featured, stock } = req.body;
    const imageFile = req.file;
    
    if (!name || !price || !description) {
        return res.status(400).send('Required fields missing');
    }
    
    const imageName = imageFile ? imageFile.filename : null;
    
    db.prepare('INSERT INTO products (name, price, description, category_slug, sport_type, dress_type, is_featured, stock, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(name, parseInt(price), description, category_slug || null, sport_type || null, dress_type || null, parseInt(is_featured || 0), parseInt(stock || 10), imageName);
    
    res.redirect('/admin');
});

app.post('/admin/product/update/:id', isAdmin, upload.single('productImage'), (req, res) => {
    const { name, price, description, category_slug, sport_type, dress_type, is_featured, stock } = req.body;
    const productId = req.params.id;
    const imageFile = req.file;
    
    if (!name || !price || !description) {
        return res.status(400).send('Required fields missing');
    }
    
    if (imageFile) {
        db.prepare('UPDATE products SET name = ?, price = ?, description = ?, category_slug = ?, sport_type = ?, dress_type = ?, is_featured = ?, stock = ?, image = ? WHERE id = ?')
            .run(name, parseInt(price), description, category_slug || null, sport_type || null, dress_type || null, parseInt(is_featured || 0), parseInt(stock || 10), imageFile.filename, productId);
    } else {
        db.prepare('UPDATE products SET name = ?, price = ?, description = ?, category_slug = ?, sport_type = ?, dress_type = ?, is_featured = ?, stock = ? WHERE id = ?')
            .run(name, parseInt(price), description, category_slug || null, sport_type || null, dress_type || null, parseInt(is_featured || 0), parseInt(stock || 10), productId);
    }
    
    res.redirect('/admin');
});

app.post('/admin/product/delete/:id', isAdmin, (req, res) => {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.redirect('/admin');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✨ Moonlit Promise server running on port ${PORT} ✨`);
    console.log(`🏏 Sports categories loaded`);
    console.log(`👗 Dress categories loaded`);
    console.log(`💳 COD + OTP verification enabled`);
    console.log(`👑 Admins: ${config.ADMIN_IDS.join(', ')}`);
});
