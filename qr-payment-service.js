// qr-payment-service.js - QR Code Payment Handler
const QRCode = require('qrcode');

class QRPaymentService {
    constructor(db) {
        this.db = db;
        this.upiId = process.env.UPI_ID || 'payments@moonlitpromise';
        this.merchantName = process.env.MERCHANT_NAME || 'Moonlit Promise';
    }

    /**
     * Generate UPI payment link
     */
    generateUPILink(orderId, amount, customerName = '') {
        const note = `ORDER${orderId}`;
        return `upi://pay?pa=${this.upiId}&pn=${this.merchantName}&am=${amount}&tn=${note}&cu=INR`;
    }

    /**
     * Generate QR code for payment
     */
    async generateQR(orderId, amount, customerName = '') {
        try {
            const upiLink = this.generateUPILink(orderId, amount, customerName);
            const qrBase64 = await QRCode.toDataURL(upiLink, {
                errorCorrectionLevel: 'H',
                margin: 2,
                width: 300,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });

            // Save to database
            this.db.prepare(`
                INSERT INTO qr_payments (order_id, amount, upi_link, qr_code, status, created_at)
                VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
            `).run(orderId, amount, upiLink, qrBase64);

            return {
                success: true,
                upiLink,
                qrBase64,
                orderId,
                amount
            };
        } catch (error) {
            console.error('QR Generation Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Verify payment by UTR number
     */
    verifyPayment(utrNumber, amount, orderId) {
        try {
            // Validate UTR format (12 digits)
            if (!/^\d{12}$/.test(utrNumber)) {
                return {
                    success: false,
                    message: 'Invalid UTR number format'
                };
            }

            // Check if already verified
            const existing = this.db.prepare(`
                SELECT * FROM qr_payments WHERE utr_number = ?
            `).get(utrNumber);

            if (existing) {
                return {
                    success: false,
                    message: 'UTR number already used'
                };
            }

            // Update payment status
            this.db.prepare(`
                UPDATE qr_payments 
                SET status = 'verified', 
                    utr_number = ?, 
                    verified_at = CURRENT_TIMESTAMP 
                WHERE order_id = ? AND status = 'pending'
            `).run(utrNumber, orderId);

            // Update order status
            this.db.prepare(`
                UPDATE orders 
                SET payment_status = 'completed', 
                    order_status = 'processing' 
                WHERE orderNumber = ?
            `).run(orderId);

            return {
                success: true,
                message: 'Payment verified successfully',
                utrNumber,
                orderId
            };
        } catch (error) {
            console.error('Payment Verification Error:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Get payment status
     */
    getPaymentStatus(orderId) {
        const payment = this.db.prepare(`
            SELECT * FROM qr_payments WHERE order_id = ?
        `).get(orderId);

        if (!payment) {
            return {
                success: false,
                message: 'Payment not found'
            };
        }

        return {
            success: true,
            status: payment.status,
            verified: payment.status === 'verified',
            amount: payment.amount,
            utrNumber: payment.utr_number,
            verifiedAt: payment.verified_at
        };
    }

    /**
     * Get all pending payments
     */
    getPendingPayments() {
        return this.db.prepare(`
            SELECT * FROM qr_payments 
            WHERE status = 'pending' 
            ORDER BY created_at DESC
        `).all();
    }

    /**
     * Cleanup old pending payments
     */
    cleanupOldPayments(hours = 24) {
        const result = this.db.prepare(`
            DELETE FROM qr_payments 
            WHERE status = 'pending' 
            AND created_at < datetime('now', '-? hours')
        `).run(hours);

        return result.changes;
    }
}

module.exports = QRPaymentService;
