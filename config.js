// config.js - Configuration file
require('dotenv').config();

module.exports = {
    // Discord OAuth2
    CLIENT_ID: process.env.CLIENT_ID,
    CLIENT_SECRET: process.env.CLIENT_SECRET,
    REDIRECT_URI: process.env.REDIRECT_URI,
    
    // Bot Token
    BOT_TOKEN: process.env.BOT_TOKEN,
    
    // Channel IDs
    LOGIN_LOG_CHANNEL: process.env.LOGIN_LOG_CHANNEL,
    ORDER_LOG_CHANNEL: process.env.ORDER_LOG_CHANNEL,
    PAYMENT_LOG_CHANNEL: process.env.PAYMENT_LOG_CHANNEL,
    DELIVERY_LOG_CHANNEL: process.env.DELIVERY_LOG_CHANNEL,
    ADMIN_LOG_CHANNEL: process.env.ADMIN_LOG_CHANNEL,
    
    // Auto Role ID
    AUTO_ROLE_ID: process.env.AUTO_ROLE_ID,
    
    // Admin Discord IDs (multiple admins supported)
    ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [],
    
    // Session
    SESSION_SECRET: process.env.SESSION_SECRET || 'moonlit-secret-key-change-this',
    
    // Server
    BASE_URL: process.env.BASE_URL || 'http://localhost:3000',
    
    // Currency
    CURRENCY: process.env.CURRENCY || '₹',
    
    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};
