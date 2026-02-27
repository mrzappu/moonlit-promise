const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const Database = require('better-sqlite3');
const cron = require('node-cron');
const config = require('./config');
const Logger = require('./logger');
const DiscordLogger = require('./bot');

const app = express();
const db = new Database('Imposter.db');

// ==================== DIRECTORY CREATION ====================
const uploadDir = path.join(__dirname, 'public', 'uploads');
const sliderDir = path.join(__dirname, 'public', 'slider');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('✅ Uploads directory created');
}

if (!fs.existsSync(sliderDir)) {
    fs.mkdirSync(sliderDir, { recursive: true });
    console.log('✅ Slider directory created');
}

// ==================== FILE UPLOAD CONFIGURATION ====================
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
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only images allowed!'));
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

console.log('✅ Multer file upload configured');

// ==================== DATABASE SETUP ====================
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
        totalOrders INTEGER DEFAULT 0,
        lastLogin DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        description TEXT,
        image TEXT,
        category TEXT,
        stock INTEGER DEFAULT 10,
        soldCount INTEGER DEFAULT 0,
        isPublic INTEGER DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        icon TEXT,
        displayOrder INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cart (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        productId INTEGER NOT NULL,
        quantity INTEGER DEFAULT 1,
        addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (productId) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderNumber TEXT UNIQUE NOT NULL,
        userId TEXT NOT NULL,
        items TEXT NOT NULL,
        totalAmount INTEGER NOT NULL,
        paymentMethod TEXT DEFAULT 'cod',
        paymentStatus TEXT DEFAULT 'pending',
        orderStatus TEXT DEFAULT 'pending',
        address TEXT,
        phone TEXT,
        fullName TEXT,
        pincode TEXT,
        trackingQR TEXT,
        qrCodePath TEXT,
        deliveryTracking TEXT,
        courierName TEXT,
        estimatedDelivery DATE,
        deliveredAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderId INTEGER,
        orderNumber TEXT,
        status TEXT,
        notes TEXT,
        changedBy TEXT,
        changedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (orderId) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderNumber TEXT NOT NULL,
        amount INTEGER NOT NULL,
        method TEXT,
        status TEXT,
        transactionId TEXT,
        utrNumber TEXT,
        paymentData TEXT,
        verifiedBy TEXT,
        verifiedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS delivery_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderNumber TEXT NOT NULL,
        status TEXT,
        location TEXT,
        notes TEXT,
        updatedBy TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS login_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT,
        username TEXT,
        ip TEXT,
        userAgent TEXT,
        success INTEGER DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        adminId TEXT,
        adminName TEXT,
        action TEXT,
        details TEXT,
        targetUser TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
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
    const insertCategory = db.prepare('INSERT INTO categories (name, slug, icon, displayOrder) VALUES (?, ?, ?, ?)');
    
    const categories = [
        ['Cricket', 'cricket', '🏏', 1],
        ['Football', 'football', '⚽', 2],
        ['Cycling', 'cycling', '🚴', 3],
        ['Badminton', 'badminton', '🏸', 4],
        ['Basketball', 'basketball', '🏀', 5],
        ['Biker', 'biker', '🏍️', 6],
        ['Esports', 'esports', '🎮', 7],
        ['Tennis', 'tennis', '🎾', 8],
        ['Running', 'running', '🏃', 9],
        ['Jacket', 'jacket', '🧥', 10],
        ['Gym', 'gym', '💪', 11],
        ['Kabaddi', 'kabaddi', '🤼', 12],
        ['Wedding', 'wedding', '👰', 13],
        ['Fantasy', 'fantasy', '🧚', 14],
        ['Couple', 'couple', '💑', 15],
        ['Evening', 'evening', '🌙', 16],
        ['Bridal', 'bridal', '💍', 17],
        ['Engagement', 'engagement', '💎', 18]
    ];
    
    categories.forEach(c => insertCategory.run(c[0], c[1], c[2], c[3]));
    
    Logger.info('Categories inserted', { count: categories.length });
}

// Insert sample products
const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get();
if (productCount.count === 0) {
    const insertProduct = db.prepare('INSERT INTO products (name, price, description, category, stock) VALUES (?, ?, ?, ?, ?)');
    
    const products = [
        ['Moonlit Wedding Gown', 54999, 'Handcrafted wedding gown with crystal details', 'Wedding', 5],
        ['Fantasy Princess Dress', 34999, 'Magical dress with glowing particles', 'Fantasy', 10],
        ['Couple Romance Set', 39999, 'Matching his & hers fantasy outfits', 'Couple', 8],
        ['Evening Star Gown', 29999, 'Elegant evening wear with shimmer', 'Evening', 15],
        ['Bridal Dream Collection', 45999, 'Complete bridal set with accessories', 'Bridal', 3],
        ['Engagement Special', 32999, 'Perfect dress for engagement ceremony', 'Engagement', 12],
        ['Cricket Jersey Pro', 2499, 'Premium quality cricket jersey', 'Cricket', 25],
        ['Football Elite', 2199, 'Breathable football jersey', 'Football', 30],
        ['Cycling Race Fit', 3499, 'Aerodynamic cycling jersey', 'Cycling', 20],
        ['Running Pro Vest', 1899, 'Lightweight running vest', 'Running', 40],
        ['Gym Warrior Tee', 1299, 'Comfortable gym t-shirt', 'Gym', 50],
        ['Kabaddi Champion', 2299, 'Professional kabaddi jersey', 'Kabaddi', 15],
        ['Tennis Pro', 2799, 'Professional tennis attire', 'Tennis', 20],
        ['Basketball Jersey', 2599, 'Team basketball jersey', 'Basketball', 25],
        ['Biker Jacket', 8999, 'Premium leather biker jacket', 'Biker', 10],
        ['Esports Jersey', 1999, 'Gaming jersey with custom print', 'Esports', 30]
    ];
    
    products.forEach(p => insertProduct.run(p[0], p[1], p[2], p[3], p[4]));
    
    Logger.info('Sample products inserted', { count: products.length });
}

// ==================== MIDDLEWARE ====================
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true
    }
}));

app.set('view engine', 'ejs');

// Request logger
app.use((req, res, next) => {
    Logger.debug(`${req.method} ${req.url}`, { 
        ip: req.ip,
        user: req.session.user?.id || 'guest'
    });
    next();
});

// ==================== HELPER FUNCTIONS ====================
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const generateOrderNumber = () => 'MP' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000);

const isAuthenticated = (req, res, next) => {
    if (req.session.user) next();
    else res.redirect('/');
};

const isAdmin = (req, res, next) => {
    if (req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id)) {
        next();
    } else {
        res.status(403).send('Access denied. You are not an admin.');
    }
};

// ==================== DISCORD AUTH ====================
app.get('/auth/discord', (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${config.CLIENT_ID}&redirect_uri=${encodeURIComponent(config.REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(url);
});

app.get('/auth/discord/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/');
    
    try {
        const tokenRes = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: config.CLIENT_ID,
                client_secret: config.CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: config.REDIRECT_URI,
                scope: 'identify'
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );
        
        const userRes = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }
        });
        
        const userData = userRes.data;
        
        db.prepare(`
            INSERT OR REPLACE INTO users (id, username, avatar, lastLogin, createdAt) 
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, COALESCE((SELECT createdAt FROM users WHERE id = ?), CURRENT_TIMESTAMP))
        `).run(userData.id, userData.username, userData.avatar, userData.id);
        
        req.session.user = {
            id: userData.id,
            username: userData.username,
            avatar: userData.avatar
        };
        
        db.prepare('INSERT INTO login_logs (userId, username, ip, userAgent) VALUES (?, ?, ?, ?)')
            .run(userData.id, userData.username, req.ip, req.get('User-Agent') || 'Unknown');
        
        if (DiscordLogger.sendLoginLog) {
            await DiscordLogger.sendLoginLog(userData, req.ip);
        }
        
        Logger.login(userData.id, userData.username, req.ip);
        
        res.redirect('/');
        
    } catch (error) {
        Logger.error('Discord auth error', error);
        res.redirect('/');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ==================== PUBLIC PAGES ====================
app.get('/', (req, res) => {
    const products = db.prepare('SELECT * FROM products WHERE isPublic = 1 ORDER BY id DESC LIMIT 8').all();
    const categories = db.prepare('SELECT * FROM categories ORDER BY displayOrder').all();
    const isAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    
    res.render('index', { 
        user: req.session.user, 
        products,
        categories,
        isAdmin,
        currency: config.CURRENCY || '₹'
    });
});

app.get('/shop', (req, res) => {
    const { category } = req.query;
    let query = 'SELECT * FROM products WHERE isPublic = 1';
    const params = [];
    
    if (category) {
        query += ' AND category = ?';
        params.push(category);
    }
    
    query += ' ORDER BY id DESC';
    
    const products = db.prepare(query).all(params);
    const categories = db.prepare('SELECT DISTINCT category FROM products WHERE isPublic = 1').all();
    const isAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    
    res.render('shop', { 
        user: req.session.user, 
        products,
        categories,
        selectedCategory: category || 'all',
        isAdmin,
        currency: config.CURRENCY || '₹'
    });
});

app.get('/product/:id', (req, res) => {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND isPublic = 1').get(req.params.id);
    if (!product) return res.redirect('/shop');
    
    const isAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    res.render('product', { 
        user: req.session.user, 
        product,
        isAdmin,
        currency: config.CURRENCY || '₹'
    });
});

app.get('/category/:slug', (req, res) => {
    const { slug } = req.params;
    const category = db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
    
    if (!category) return res.redirect('/shop');
    
    const products = db.prepare('SELECT * FROM products WHERE category = ? AND isPublic = 1 ORDER BY id DESC').all(category.name);
    const isAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    
    res.render('category', {
        user: req.session.user,
        products,
        category,
        isAdmin,
        currency: config.CURRENCY || '₹'
    });
});

app.get('/about', (req, res) => {
    const isAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    res.render('about', { user: req.session.user, isAdmin });
});

app.get('/terms', (req, res) => {
    const isAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    res.render('terms', { user: req.session.user, isAdmin });
});

// ==================== CART ====================
app.get('/cart', isAuthenticated, (req, res) => {
    const cartItems = db.prepare(`
        SELECT c.id as cartId, p.*, c.quantity FROM cart c
        JOIN products p ON c.productId = p.id
        WHERE c.userId = ?
    `).all(req.session.user.id);
    
    const total = cartItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
    const isAdmin = config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    
    res.render('cart', { 
        user: req.session.user, 
        cartItems, 
        total,
        isAdmin,
        currency: config.CURRENCY || '₹'
    });
});

app.post('/cart/add/:productId', isAuthenticated, (req, res) => {
    const productId = req.params.productId;
    const userId = req.session.user.id;
    
    const existing = db.prepare('SELECT * FROM cart WHERE userId = ? AND productId = ?').get(userId, productId);
    
    if (existing) {
        db.prepare('UPDATE cart SET quantity = quantity + 1 WHERE id = ?').run(existing.id);
    } else {
        db.prepare('INSERT INTO cart (userId, productId, quantity) VALUES (?, ?, 1)').run(userId, productId);
    }
    
    res.redirect('/cart');
});

app.post('/cart/update/:cartId', isAuthenticated, (req, res) => {
    const { quantity } = req.body;
    db.prepare('UPDATE cart SET quantity = ? WHERE id = ? AND userId = ?').run(quantity, req.params.cartId, req.session.user.id);
    res.redirect('/cart');
});

app.post('/cart/remove/:cartId', isAuthenticated, (req, res) => {
    db.prepare('DELETE FROM cart WHERE id = ? AND userId = ?').run(req.params.cartId, req.session.user.id);
    res.redirect('/cart');
});

// ==================== OTP SYSTEM ====================
app.post('/api/send-otp', isAuthenticated, (req, res) => {
    const { phone } = req.body;
    
    if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
        return res.status(400).json({ success: false, message: 'Invalid phone number' });
    }
    
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    
    db.prepare('INSERT INTO otp_requests (phone, otp, userId, expiresAt) VALUES (?, ?, ?, ?)')
        .run(phone, otp, req.session.user.id, expiresAt.toISOString());
    
    console.log(`📱 OTP for ${phone}: ${otp}`);
    Logger.info(`OTP sent to ${phone}`, { userId: req.session.user.id });
    
    res.json({ success: true, message: 'OTP sent successfully' });
});

app.post('/api/verify-otp', isAuthenticated, (req, res) => {
    const { phone, otp } = req.body;
    
    const record = db.prepare(`
        SELECT * FROM otp_requests 
        WHERE phone = ? AND otp = ? AND userId = ? AND isUsed = 0 AND expiresAt > datetime('now')
        ORDER BY id DESC LIMIT 1
    `).get(phone, otp, req.session.user.id);
    
    if (!record) {
        return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }
    
    db.prepare('UPDATE otp_requests SET isUsed = 1 WHERE id = ?').run(record.id);
    db.prepare('UPDATE users SET phone = ?, isPhoneVerified = 1 WHERE id = ?').run(phone, req.session.user.id);
    
    req.session.phoneVerified = true;
    req.session.verifiedPhone = phone;
    
    Logger.info(`Phone verified: ${phone}`, { userId: req.session.user.id });
    
    res.json({ success: true, message: 'Phone verified successfully' });
});

// ==================== CHECKOUT & ORDER ====================
app.get('/checkout', isAuthenticated, (req, res) => {
    const cartItems = db.prepare(`
        SELECT c.id as cartId, p.*, c.quantity FROM cart c
        JOIN products p ON c.productId = p.id
        WHERE c.userId = ?
    `).all(req.session.user.id);
    
    if (cartItems.length === 0) return res.redirect('/shop');
    
    const total = cartItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
    const userInfo = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
    const isAdmin = config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    
    res.render('checkout', { 
        user: req.session.user, 
        cartItems, 
        total,
        userInfo,
        isAdmin,
        currency: config.CURRENCY || '₹'
    });
});

app.post('/checkout/place-order', isAuthenticated, async (req, res) => {
    const { address, fullName, pincode, phone, paymentMethod } = req.body;
    
    if (!address || !fullName || !pincode || !phone) {
        return res.status(400).send('All fields are required');
    }
    
    const userId = req.session.user.id;
    
    const cartItems = db.prepare(`
        SELECT p.*, c.quantity FROM cart c
        JOIN products p ON c.productId = p.id
        WHERE c.userId = ?
    `).all(userId);
    
    if (cartItems.length === 0) return res.redirect('/shop');
    
    const total = cartItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
    const orderNumber = generateOrderNumber();
    
    const itemsJson = JSON.stringify(cartItems);
    const orderId = db.prepare(`
        INSERT INTO orders (
            orderNumber, userId, items, totalAmount, paymentMethod, 
            paymentStatus, orderStatus, address, phone, fullName, pincode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        orderNumber, userId, itemsJson, total, paymentMethod || 'cod',
        'pending', 'pending', address, phone, fullName, pincode
    ).lastInsertRowid;
    
    db.prepare(`
        INSERT INTO order_status_history (orderId, orderNumber, status, notes, changedBy)
        VALUES (?, ?, ?, ?, ?)
    `).run(orderId, orderNumber, 'pending', 'Order placed', userId);
    
    db.prepare('UPDATE users SET address = ?, fullName = ?, pincode = ?, phone = ?, totalOrders = totalOrders + 1 WHERE id = ?')
        .run(address, fullName, pincode, phone, userId);
    
    cartItems.forEach(item => {
        db.prepare('UPDATE products SET soldCount = soldCount + ? WHERE id = ?').run(item.quantity || 1, item.id);
    });
    
    db.prepare('DELETE FROM cart WHERE userId = ?').run(userId);
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const order = db.prepare('SELECT * FROM orders WHERE orderNumber = ?').get(orderNumber);
    
    if (DiscordLogger.sendOrderLog) {
        await DiscordLogger.sendOrderLog(order, user, cartItems);
    }
    if (DiscordLogger.sendAddressConfirmationLog) {
        await DiscordLogger.sendAddressConfirmationLog(order, user);
    }
    
    db.prepare(`
        INSERT INTO payments (orderNumber, amount, method, status)
        VALUES (?, ?, ?, ?)
    `).run(orderNumber, total, paymentMethod || 'cod', 'pending');
    
    if (DiscordLogger.sendPaymentLog) {
        await DiscordLogger.sendPaymentLog(order, user, { 
            status: 'pending',
            method: paymentMethod || 'cod'
        });
    }
    
    Logger.orderCreated(orderNumber, userId, total, cartItems);
    
    res.redirect(`/order-confirmation/${orderNumber}`);
});

app.get('/order-confirmation/:orderNumber', isAuthenticated, (req, res) => {
    const { orderNumber } = req.params;
    const order = db.prepare('SELECT * FROM orders WHERE orderNumber = ? AND userId = ?').get(orderNumber, req.session.user.id);
    
    if (!order) return res.redirect('/history');
    
    const items = JSON.parse(order.items);
    const isAdmin = config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    
    res.render('order-confirmation', { 
        user: req.session.user, 
        order,
        items,
        isAdmin,
        currency: config.CURRENCY || '₹'
    });
});

// ==================== ORDER HISTORY ====================
app.get('/history', isAuthenticated, (req, res) => {
    const orders = db.prepare(`
        SELECT * FROM orders 
        WHERE userId = ? 
        ORDER BY createdAt DESC
    `).all(req.session.user.id);
    
    const ordersWithItems = orders.map(order => ({
        ...order,
        items: JSON.parse(order.items || '[]')
    }));
    
    const isAdmin = config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    
    res.render('history', { 
        user: req.session.user, 
        orders: ordersWithItems,
        isAdmin,
        currency: config.CURRENCY || '₹'
    });
});

app.get('/track/:orderNumber', (req, res) => {
    const { orderNumber } = req.params;
    const order = db.prepare('SELECT * FROM orders WHERE orderNumber = ?').get(orderNumber);
    
    if (!order) return res.redirect('/');
    
    const items = JSON.parse(order.items || '[]');
    const statusHistory = db.prepare(`
        SELECT * FROM order_status_history 
        WHERE orderNumber = ? 
        ORDER BY changedAt DESC
    `).all(orderNumber);
    
    const deliveryLogs = db.prepare(`
        SELECT * FROM delivery_logs 
        WHERE orderNumber = ? 
        ORDER BY createdAt DESC
    `).all(orderNumber);
    
    const user = order.userId ? db.prepare('SELECT * FROM users WHERE id = ?').get(order.userId) : null;
    const isAdmin = req.session.user && config.ADMIN_IDS && config.ADMIN_IDS.includes(req.session.user.id);
    
    res.render('order-tracking', { 
        user: req.session.user,
        order,
        items,
        statusHistory,
        deliveryLogs,
        isAdmin,
        currency: config.CURRENCY || '₹'
    });
});

// ==================== ADMIN ROUTES ====================
app.get('/admin', isAdmin, (req, res) => {
    const users = db.prepare('SELECT * FROM users ORDER BY createdAt DESC').all();
    const orders = db.prepare('SELECT * FROM orders ORDER BY createdAt DESC LIMIT 50').all();
    const products = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
    const categories = db.prepare('SELECT * FROM categories ORDER BY displayOrder').all();
    
    const ordersWithItems = orders.map(order => ({
        ...order,
        items: JSON.parse(order.items || '[]')
    }));
    
    const stats = {
        totalUsers: users.length,
        totalOrders: db.prepare('SELECT COUNT(*) as count FROM orders').get().count,
        totalRevenue: db.prepare('SELECT SUM(totalAmount) as total FROM orders WHERE paymentStatus = "completed"').get().total || 0,
        pendingOrders: db.prepare('SELECT COUNT(*) as count FROM orders WHERE orderStatus = "pending"').get().count,
        codOrders: db.prepare('SELECT COUNT(*) as count FROM orders WHERE paymentMethod = "cod"').get().count,
        totalProducts: products.length
    };
    
    const recentLogs = {
        login: Logger.getRecentLogs ? Logger.getRecentLogs('login', 20) : [],
        orders: Logger.getRecentLogs ? Logger.getRecentLogs('orders', 20) : [],
        payments: Logger.getRecentLogs ? Logger.getRecentLogs('payments', 20) : [],
        deliveries: Logger.getRecentLogs ? Logger.getRecentLogs('deliveries', 20) : []
    };
    
    res.render('admin', { 
        user: req.session.user, 
        users, 
        orders: ordersWithItems,
        products,
        categories,
        stats,
        recentLogs,
        isAdmin: true,
        currency: config.CURRENCY || '₹'
    });
});

// Order management
app.post('/admin/order/update/:orderId', isAdmin, async (req, res) => {
    const { orderId } = req.params;
    const { orderStatus, paymentStatus, trackingId, courier, notes } = req.body;
    
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) return res.redirect('/admin');
    
    const oldStatus = order.orderStatus;
    
    db.prepare(`
        UPDATE orders 
        SET orderStatus = ?, paymentStatus = ?, deliveryTracking = ?, courierName = ?
        WHERE id = ?
    `).run(orderStatus || order.orderStatus, paymentStatus || order.paymentStatus, trackingId, courier, orderId);
    
    db.prepare(`
        INSERT INTO order_status_history (orderId, orderNumber, status, notes, changedBy)
        VALUES (?, ?, ?, ?, ?)
    `).run(orderId, order.orderNumber, orderStatus || order.orderStatus, notes || 'Status updated', req.session.user.id);
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(order.userId);
    
    if (DiscordLogger.sendDeliveryLog && (orderStatus === 'shipped' || orderStatus === 'out_for_delivery' || orderStatus === 'delivered')) {
        await DiscordLogger.sendDeliveryLog(order, user, {
            status: orderStatus,
            trackingId,
            courier,
            notes
        });
    }
    
    db.prepare(`
        INSERT INTO admin_logs (adminId, adminName, action, details, targetUser)
        VALUES (?, ?, ?, ?, ?)
    `).run(req.session.user.id, req.session.user.username, 'Update Order', 
        `Order ${order.orderNumber}: ${oldStatus} → ${orderStatus}`, order.userId);
    
    if (DiscordLogger.sendAdminLog) {
        await DiscordLogger.sendAdminLog(
            req.session.user, 
            'Update Order', 
            `Order ${order.orderNumber}: ${oldStatus} → ${orderStatus}`,
            user
        );
    }
    
    Logger.orderStatusChanged(order.orderNumber, oldStatus, orderStatus, req.session.user.id);
    
    res.redirect('/admin');
});

// Payment verification
app.post('/admin/order/verify-payment/:orderId', isAdmin, async (req, res) => {
    const { orderId } = req.params;
    const { transactionId, utrNumber } = req.body;
    
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    
    db.prepare('UPDATE orders SET paymentStatus = "completed" WHERE id = ?').run(orderId);
    db.prepare('UPDATE payments SET status = "completed", transactionId = ?, utrNumber = ?, verifiedBy = ?, verifiedAt = CURRENT_TIMESTAMP WHERE orderNumber = ?')
        .run(transactionId, utrNumber, req.session.user.id, order.orderNumber);
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(order.userId);
    
    if (DiscordLogger.sendPaymentLog) {
        await DiscordLogger.sendPaymentLog(order, user, {
            status: 'completed',
            transactionId,
            utrNumber
        });
    }
    
    Logger.paymentCompleted(order.orderNumber, order.totalAmount, order.paymentMethod, transactionId || utrNumber, order.userId);
    
    res.redirect('/admin');
});

// Delivery confirmation
app.post('/admin/order/delivered/:orderId', isAdmin, async (req, res) => {
    const { orderId } = req.params;
    
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    
    db.prepare(`
        UPDATE orders 
        SET orderStatus = 'delivered', deliveredAt = CURRENT_TIMESTAMP 
        WHERE id = ?
    `).run(orderId);
    
    db.prepare(`
        INSERT INTO delivery_logs (orderNumber, status, notes, updatedBy)
        VALUES (?, ?, ?, ?)
    `).run(order.orderNumber, 'delivered', 'Order delivered successfully', req.session.user.id);
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(order.userId);
    
    if (DiscordLogger.sendDeliveryLog) {
        await DiscordLogger.sendDeliveryLog(order, user, {
            status: 'delivered',
            deliveredAt: new Date().toLocaleString('en-IN')
        });
    }
    
    if (user.totalOrders === 1 && config.AUTO_ROLE_ID) {
        // Auto-role logic would go here
    }
    
    Logger.deliveryDelivered(order.orderNumber, order.fullName, new Date().toISOString());
    
    res.redirect('/admin');
});

// ==================== PRODUCT MANAGEMENT ====================
app.get('/admin/product/new', isAdmin, (req, res) => {
    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
    res.render('product-form', { 
        user: req.session.user, 
        product: null,
        categories,
        isAdmin: true,
        currency: config.CURRENCY || '₹'
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
        currency: config.CURRENCY || '₹'
    });
});

app.post('/admin/product/create', isAdmin, upload.single('productImage'), (req, res) => {
    try {
        const { name, price, description, category, stock } = req.body;
        const imageFile = req.file;
        
        if (!name || !price || !description) {
            return res.status(400).send('Required fields missing');
        }
        
        const imageName = imageFile ? imageFile.filename : null;
        
        db.prepare('INSERT INTO products (name, price, description, category, stock, image) VALUES (?, ?, ?, ?, ?, ?)')
            .run(name, parseInt(price), description, category, parseInt(stock || 10), imageName);
        
        Logger.adminAction(req.session.user.id, req.session.user.username, 'Create Product', { name, price, category });
        
        res.redirect('/admin');
    } catch (error) {
        Logger.error('Product creation error', error);
        res.status(500).send('Error creating product');
    }
});

app.post('/admin/product/update/:id', isAdmin, upload.single('productImage'), (req, res) => {
    try {
        const { name, price, description, category, stock } = req.body;
        const productId = req.params.id;
        const imageFile = req.file;
        
        if (imageFile) {
            db.prepare('UPDATE products SET name = ?, price = ?, description = ?, category = ?, stock = ?, image = ? WHERE id = ?')
                .run(name, parseInt(price), description, category, parseInt(stock || 10), imageFile.filename, productId);
        } else {
            db.prepare('UPDATE products SET name = ?, price = ?, description = ?, category = ?, stock = ? WHERE id = ?')
                .run(name, parseInt(price), description, category, parseInt(stock || 10), productId);
        }
        
        Logger.adminAction(req.session.user.id, req.session.user.username, 'Update Product', { productId, name });
        
        res.redirect('/admin');
    } catch (error) {
        Logger.error('Product update error', error);
        res.status(500).send('Error updating product');
    }
});

app.post('/admin/product/delete/:id', isAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
        res.redirect('/admin');
    } catch (error) {
        Logger.error('Product delete error', error);
        res.status(500).send('Error deleting product');
    }
});

// Category management
app.post('/admin/category/add', isAdmin, (req, res) => {
    const { name, slug, icon } = req.body;
    
    try {
        db.prepare('INSERT INTO categories (name, slug, icon) VALUES (?, ?, ?)').run(name, slug, icon);
        res.redirect('/admin');
    } catch (error) {
        res.status(500).send('Error adding category');
    }
});

// ==================== LOGS API ====================
app.get('/admin/logs/:type', isAdmin, (req, res) => {
    const { type } = req.params;
    const lines = parseInt(req.query.lines) || 100;
    
    const logs = Logger.getRecentLogs ? Logger.getRecentLogs(type, lines) : [];
    res.json({ success: true, logs });
});

// ==================== CLEANUP JOBS ====================
cron.schedule('0 * * * *', () => {
    try {
        const result = db.prepare('DELETE FROM otp_requests WHERE expiresAt < datetime("now") OR isUsed = 1').run();
        if (result.changes > 0) {
            Logger.info(`Cleaned up ${result.changes} expired OTPs`);
        }
    } catch (error) {
        Logger.error('OTP cleanup error', error);
    }
});

cron.schedule('0 0 * * *', () => {
    try {
        const stats = {
            users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
            orders: db.prepare('SELECT COUNT(*) as count FROM orders').get().count,
            revenue: db.prepare('SELECT SUM(totalAmount) as total FROM orders WHERE paymentStatus = "completed"').get().total || 0,
            pendingOrders: db.prepare('SELECT COUNT(*) as count FROM orders WHERE orderStatus = "pending"').get().count
        };
        
        Logger.info('Daily stats', stats);
    } catch (error) {
        Logger.error('Stats logging error', error);
    }
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
    Logger.error('Unhandled error', err, { url: req.url, method: req.method });
    res.status(500).send('Something went wrong!');
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    Logger.error('Uncaught Exception', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
    Logger.error('Unhandled Rejection', reason, { promise });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('\n');
    console.log('✨'.repeat(50));
    console.log('✨           MOONLIT PROMISE - DM3 STYLE READY           ✨');
    console.log('✨'.repeat(50));
    console.log(`\n📡 Server running on port ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`📁 Uploads directory: ${uploadDir}`);
    console.log(`👑 Admins: ${config.ADMIN_IDS.length > 0 ? config.ADMIN_IDS.join(', ') : 'None set'}`);
    console.log(`💰 Currency: ${config.CURRENCY}`);
    console.log(`📝 Logging: Enabled\n`);
    
    Logger.info('Server started', { 
        port: PORT, 
        env: process.env.NODE_ENV || 'development',
        admins: config.ADMIN_IDS
    });
});
