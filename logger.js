// logger.js - Winston logging system with file rotation
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Create logs directory if not exists
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for readable logs
const customFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `[${timestamp}] ${level.toUpperCase()}: ${message} ${metaStr}`;
    })
);

// JSON format for machine parsing
const jsonFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

// Create separate loggers for different purposes
const loggers = {
    // Main application logger
    app: winston.createLogger({
        level: process.env.LOG_LEVEL || 'info',
        format: customFormat,
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    customFormat
                )
            }),
            new DailyRotateFile({
                filename: path.join(logDir, 'app-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '14d',
                format: jsonFormat
            })
        ]
    }),

    // Login logs
    login: winston.createLogger({
        level: 'info',
        format: customFormat,
        transports: [
            new DailyRotateFile({
                filename: path.join(logDir, 'login-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '10m',
                maxFiles: '30d'
            })
        ]
    }),

    // Order logs
    order: winston.createLogger({
        level: 'info',
        format: customFormat,
        transports: [
            new DailyRotateFile({
                filename: path.join(logDir, 'orders-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '10m',
                maxFiles: '30d'
            })
        ]
    }),

    // Payment logs
    payment: winston.createLogger({
        level: 'info',
        format: customFormat,
        transports: [
            new DailyRotateFile({
                filename: path.join(logDir, 'payments-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '10m',
                maxFiles: '30d'
            })
        ]
    }),

    // Delivery logs
    delivery: winston.createLogger({
        level: 'info',
        format: customFormat,
        transports: [
            new DailyRotateFile({
                filename: path.join(logDir, 'deliveries-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '10m',
                maxFiles: '30d'
            })
        ]
    }),

    // Admin action logs
    admin: winston.createLogger({
        level: 'info',
        format: customFormat,
        transports: [
            new DailyRotateFile({
                filename: path.join(logDir, 'admin-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '10m',
                maxFiles: '30d'
            })
        ]
    }),

    // Error logs
    error: winston.createLogger({
        level: 'error',
        format: customFormat,
        transports: [
            new DailyRotateFile({
                filename: path.join(logDir, 'errors-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '60d'
            }),
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    customFormat
                )
            })
        ]
    })
};

// Helper functions for consistent logging
const Logger = {
    // App logs
    info: (message, meta = {}) => loggers.app.info(message, meta),
    warn: (message, meta = {}) => loggers.app.warn(message, meta),
    debug: (message, meta = {}) => loggers.app.debug(message, meta),
    
    // Login logs
    login: (userId, username, ip, meta = {}) => {
        loggers.login.info(`Login: ${username} (${userId}) from ${ip}`, meta);
    },
    
    // Order logs
    orderCreated: (orderNumber, userId, amount, items, meta = {}) => {
        loggers.order.info(`ORDER CREATED: ${orderNumber} | User: ${userId} | Amount: ₹${amount} | Items: ${items.length}`, {
            orderNumber,
            userId,
            amount,
            itemCount: items.length,
            ...meta
        });
    },
    
    orderStatusChanged: (orderNumber, oldStatus, newStatus, userId, meta = {}) => {
        loggers.order.info(`ORDER STATUS: ${orderNumber} | ${oldStatus} → ${newStatus} | By: ${userId}`, {
            orderNumber,
            oldStatus,
            newStatus,
            userId,
            ...meta
        });
    },
    
    // Payment logs
    paymentInitiated: (orderNumber, amount, method, userId, meta = {}) => {
        loggers.payment.info(`PAYMENT INITIATED: ${orderNumber} | ₹${amount} | ${method} | User: ${userId}`, {
            orderNumber,
            amount,
            method,
            userId,
            ...meta
        });
    },
    
    paymentCompleted: (orderNumber, amount, method, transactionId, userId, meta = {}) => {
        loggers.payment.info(`PAYMENT COMPLETED: ${orderNumber} | ₹${amount} | ${method} | TXN: ${transactionId}`, {
            orderNumber,
            amount,
            method,
            transactionId,
            userId,
            ...meta
        });
    },
    
    paymentFailed: (orderNumber, amount, method, reason, userId, meta = {}) => {
        loggers.payment.error(`PAYMENT FAILED: ${orderNumber} | ₹${amount} | ${method} | Reason: ${reason}`, {
            orderNumber,
            amount,
            method,
            reason,
            userId,
            ...meta
        });
    },
    
    // Delivery logs
    deliveryInitiated: (orderNumber, address, userId, meta = {}) => {
        loggers.delivery.info(`DELIVERY INITIATED: ${orderNumber} | To: ${address.city || 'N/A'} | User: ${userId}`, {
            orderNumber,
            address,
            userId,
            ...meta
        });
    },
    
    deliveryOutForDelivery: (orderNumber, courier, trackingId, meta = {}) => {
        loggers.delivery.info(`OUT FOR DELIVERY: ${orderNumber} | Courier: ${courier} | Tracking: ${trackingId}`, {
            orderNumber,
            courier,
            trackingId,
            ...meta
        });
    },
    
    deliveryDelivered: (orderNumber, recipient, time, meta = {}) => {
        loggers.delivery.info(`DELIVERED: ${orderNumber} | To: ${recipient} | Time: ${time}`, {
            orderNumber,
            recipient,
            time,
            ...meta
        });
    },
    
    deliveryFailed: (orderNumber, reason, meta = {}) => {
        loggers.delivery.error(`DELIVERY FAILED: ${orderNumber} | Reason: ${reason}`, {
            orderNumber,
            reason,
            ...meta
        });
    },
    
    // Admin logs
    adminAction: (adminId, adminName, action, details, meta = {}) => {
        loggers.admin.info(`ADMIN ACTION: ${adminName} (${adminId}) | ${action} | ${JSON.stringify(details)}`, {
            adminId,
            adminName,
            action,
            details,
            ...meta
        });
    },
    
    // Error logs
    error: (message, error, meta = {}) => {
        loggers.error.error(message, {
            error: error.message,
            stack: error.stack,
            ...meta
        });
    },
    
    // Get recent logs (for admin panel)
    getRecentLogs: (type = 'app', lines = 100) => {
        const logFile = path.join(logDir, `${type}-${new Date().toISOString().split('T')[0]}.log`);
        try {
            if (!fs.existsSync(logFile)) return [];
            const data = fs.readFileSync(logFile, 'utf8');
            return data.split('\n').filter(l => l.trim()).slice(-lines);
        } catch (error) {
            return [];
        }
    }
};

module.exports = Logger;
