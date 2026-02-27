const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const Database = require('better-sqlite3');
const config = require('./config');

// Initialize bot
const bot = require('./bot');

const app = express();
const db = new Database('Imposter.db');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
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
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        description TEXT,
        image TEXT,
        category TEXT DEFAULT 'dress',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
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
        price REAL NOT NULL,
        proof TEXT,
        status TEXT DEFAULT 'pending',
        address TEXT,
        phone TEXT,
        fullName TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
    );
`);

// Insert sample products if none exist
const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get();
if (productCount.count === 0) {
    const insertProduct = db.prepare('INSERT INTO products (name, price, description, category) VALUES (?, ?, ?, ?)');
    
    const products = [
        ['Midnight Enchantment Gown', 299.99, 'A flowing gown that shimmers like moonlight on water, perfect for romantic evenings.', 'dress'],
        ['Starlight Promise Dress', 399.99, 'Hand-stitched with glowing particles that catch the light like distant stars.', 'dress'],
        ['Eternal Vow Collection', 599.99, 'Complete bridal set with flowing train and crystal details.', 'wedding'],
        ['Firefly Evening Gown', 349.99, 'Pastel purple and pink design with magical floating fabric effects.', 'dress'],
        ['Moonlit Romance Set', 449.99, 'Matching couple outfits with ethereal glow-in-the-dark elements.', 'couple'],
        ['Fantasy Dream Dress', 279.99, 'Storybook-inspired design with soft, dreamy layers and magical dust sparkles.', 'fantasy']
    ];
    
    products.forEach(p => {
        insertProduct.run(p[0], p[1], p[2], p[3]);
    });
}

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: config.SESSION_SECRET || 'moonlit-promise-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

app.set('view engine', 'ejs');

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/');
    }
};

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.id === config.ADMIN_ID) {
        next();
    } else {
        res.status(403).send('Access denied');
    }
};

// Routes
app.get('/', (req, res) => {
    const featuredProducts = db.prepare('SELECT * FROM products ORDER BY id DESC LIMIT 4').all();
    res.render('index', { user: req.session.user, products: featuredProducts });
});

app.get('/about', (req, res) => {
    res.render('about', { user: req.session.user });
});

app.get('/terms', (req, res) => {
    res.render('terms', { user: req.session.user });
});

// Discord OAuth2 login
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
        // Exchange code for token
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
        
        // Save or update user in database
        const stmt = db.prepare('INSERT OR REPLACE INTO users (id, username, avatar, createdAt) VALUES (?, ?, ?, COALESCE((SELECT createdAt FROM users WHERE id = ?), CURRENT_TIMESTAMP))');
        stmt.run(userData.id, userData.username, userData.avatar, userData.id);
        
        // Store user in session
        req.session.user = {
            id: userData.id,
            username: userData.username,
            avatar: userData.avatar
        };
        
        // Send login log to Discord
        bot.sendLoginLog(userData);
        
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

// Shop routes
app.get('/shop', (req, res) => {
    const category = req.query.category || 'all';
    let products;
    
    if (category === 'all') {
        products = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
    } else {
        products = db.prepare('SELECT * FROM products WHERE category = ? ORDER BY id DESC').all(category);
    }
    
    res.render('shop', { user: req.session.user, products, selectedCategory: category });
});

app.get('/product/:id', (req, res) => {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) {
        return res.redirect('/shop');
    }
    res.render('product', { user: req.session.user, product });
});

// Cart routes
app.get('/cart', isAuthenticated, (req, res) => {
    const cartItems = db.prepare(`
        SELECT c.id as cartId, p.* FROM cart c
        JOIN products p ON c.productId = p.id
        WHERE c.userId = ?
    `).all(req.session.user.id);
    
    const total = cartItems.reduce((sum, item) => sum + item.price, 0);
    
    res.render('cart', { user: req.session.user, cartItems, total });
});

app.post('/cart/add/:productId', isAuthenticated, (req, res) => {
    const productId = req.params.productId;
    const userId = req.session.user.id;
    
    // Check if already in cart
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

// Checkout and payment
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
    
    res.render('pay', { 
        user: req.session.user, 
        cartItems, 
        total,
        qrImage: '/qr.png'
    });
});

app.post('/checkout/submit', isAuthenticated, upload.single('proof'), (req, res) => {
    const { address, phone, fullName } = req.body;
    const proofFile = req.file;
    
    if (!address || !phone || !fullName || !proofFile) {
        return res.status(400).send('All fields including payment proof are required');
    }
    
    const userId = req.session.user.id;
    
    // Update user with address info
    db.prepare('UPDATE users SET address = ?, phone = ?, fullName = ? WHERE id = ?')
        .run(address, phone, fullName, userId);
    
    // Get cart items
    const cartItems = db.prepare(`
        SELECT p.* FROM cart c
        JOIN products p ON c.productId = p.id
        WHERE c.userId = ?
    `).all(userId);
    
    // Create orders
    const insertOrder = db.prepare('INSERT INTO orders (userId, productName, price, proof, status, address, phone, fullName) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    
    cartItems.forEach(item => {
        insertOrder.run(userId, item.name, item.price, proofFile.filename, 'pending', address, phone, fullName);
    });
    
    // Clear cart
    db.prepare('DELETE FROM cart WHERE userId = ?').run(userId);
    
    // Send payment log to Discord
    bot.sendPaymentLog(req.session.user, cartItems, proofFile.filename, address, phone, fullName);
    
    res.redirect('/history');
});

// Order history
app.get('/history', isAuthenticated, (req, res) => {
    const orders = db.prepare('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC').all(req.session.user.id);
    res.render('history', { user: req.session.user, orders });
});

// Admin routes
app.get('/admin', isAdmin, (req, res) => {
    const users = db.prepare('SELECT * FROM users ORDER BY createdAt DESC').all();
    const orders = db.prepare(`
        SELECT o.*, u.username FROM orders o
        JOIN users u ON o.userId = u.id
        ORDER BY o.createdAt DESC
    `).all();
    
    res.render('admin', { user: req.session.user, users, orders });
});

app.post('/admin/order/approve/:orderId', isAdmin, (req, res) => {
    const orderId = req.params.orderId;
    
    // Get order details
    const order = db.prepare(`
        SELECT o.*, u.username, u.id as userId FROM orders o
        JOIN users u ON o.userId = u.id
        WHERE o.id = ?
    `).get(orderId);
    
    if (order) {
        // Update order status
        db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('approved', orderId);
        
        // Give Discord role
        bot.giveRole(order.userId, order.username);
        
        // Send approval log
        bot.sendApprovalLog(order);
    }
    
    res.redirect('/admin');
});

app.post('/admin/order/reject/:orderId', isAdmin, (req, res) => {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('rejected', req.params.orderId);
    res.redirect('/admin');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Moonlit Promise server running on port ${PORT}`);
    console.log(`✨ Welcome to the magical world of Moonlit Promise ✨`);
});
