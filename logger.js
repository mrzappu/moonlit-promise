const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const customFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `[${timestamp}] ${level.toUpperCase()}: ${message} ${metaStr}`;
    })
);

const jsonFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

const loggers = {
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

const Logger = {
    info: (message, meta = {}) => loggers.app.info(message, meta),
    warn: (message, meta = {}) => loggers.app.warn(message, meta),
    debug: (message, meta = {}) => loggers.app.debug(message, meta),
    
    login: (userId, username, ip, meta = {}) => {
        loggers.login.info(`Login: ${username} (${userId}) from ${ip}`, meta);
    },
    
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
    
    adminAction: (adminId, adminName, action, details, meta = {}) => {
        loggers.admin.info(`ADMIN ACTION: ${adminName} (${adminId}) | ${action} | ${JSON.stringify(details)}`, {
            adminId,
            adminName,
            action,
            details,
            ...meta
        });
    },
    
    error: (message, error, meta = {}) => {
        loggers.error.error(message, {
            error: error.message,
            stack: error.stack,
            ...meta
        });
    },
    
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
