require('dotenv').config();

module.exports = {
    CLIENT_ID: process.env.CLIENT_ID,
    CLIENT_SECRET: process.env.CLIENT_SECRET,
    REDIRECT_URI: process.env.REDIRECT_URI,
    BOT_TOKEN: process.env.BOT_TOKEN,
    LOGIN_LOG_CHANNEL: process.env.LOGIN_LOG_CHANNEL,
    ORDER_LOG_CHANNEL: process.env.ORDER_LOG_CHANNEL,
    PAYMENT_LOG_CHANNEL: process.env.PAYMENT_LOG_CHANNEL,
    DELIVERY_LOG_CHANNEL: process.env.DELIVERY_LOG_CHANNEL,
    ADMIN_LOG_CHANNEL: process.env.ADMIN_LOG_CHANNEL,
    AUTO_ROLE_ID: process.env.AUTO_ROLE_ID,
    ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [],
    SESSION_SECRET: process.env.SESSION_SECRET || 'moonlit-secret-key',
    BASE_URL: process.env.BASE_URL || 'http://localhost:3000',
    CURRENCY: process.env.CURRENCY || '₹',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};
