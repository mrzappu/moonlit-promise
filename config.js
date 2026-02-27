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
    PAYMENT_LOG_CHANNEL: process.env.PAYMENT_LOG_CHANNEL,
    APPROVED_LOG_CHANNEL: process.env.APPROVED_LOG_CHANNEL,
    
    // Auto Role ID
    AUTO_ROLE_ID: process.env.AUTO_ROLE_ID,
    
    // Admin Discord ID (for admin panel access)
    ADMIN_ID: process.env.ADMIN_ID,
    
    // Session Secret
    SESSION_SECRET: process.env.SESSION_SECRET,
    
    // Server URL
    BASE_URL: process.env.BASE_URL || 'http://localhost:3000'
};
