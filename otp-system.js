// otp-system.js - OTP Verification System
const crypto = require('crypto');

class OTPSystem {
    constructor(db) {
        this.db = db;
        this.otpLength = 6;
        this.expiryMinutes = 5;
    }

    /**
     * Generate random OTP
     */
    generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    /**
     * Send OTP via SMS (mock implementation)
     * In production, integrate with actual SMS provider
     */
    async sendOTP(phone, otp) {
        try {
            // Log to console for development
            console.log(`📱 OTP for ${phone}: ${otp}`);
            
            // Store in database
            const expiresAt = new Date(Date.now() + this.expiryMinutes * 60 * 1000);
            this.db.prepare(`
                INSERT INTO otp_requests (phone, otp, expires_at, created_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `).run(phone, otp, expiresAt.toISOString());

            return {
                success: true,
                message: 'OTP sent successfully'
            };
        } catch (error) {
            console.error('OTP send error:', error);
            return {
                success: false,
                message: 'Failed to send OTP'
            };
        }
    }

    /**
     * Verify OTP
     */
    verifyOTP(phone, otp) {
        try {
            const record = this.db.prepare(`
                SELECT * FROM otp_requests 
                WHERE phone = ? AND otp = ? AND is_used = 0 
                AND expires_at > datetime('now')
                ORDER BY id DESC LIMIT 1
            `).get(phone, otp);

            if (!record) {
                return {
                    success: false,
                    message: 'Invalid or expired OTP'
                };
            }

            // Mark as used
            this.db.prepare(`
                UPDATE otp_requests SET is_used = 1 WHERE id = ?
            `).run(record.id);

            return {
                success: true,
                message: 'OTP verified successfully'
            };
        } catch (error) {
            console.error('OTP verify error:', error);
            return {
                success: false,
                message: 'Verification failed'
            };
        }
    }

    /**
     * Generate and send OTP
     */
    async requestOTP(phone) {
        // Validate Indian phone number
        if (!/^[6-9]\d{9}$/.test(phone)) {
            return {
                success: false,
                message: 'Invalid Indian phone number'
            };
        }

        // Check rate limiting (max 3 attempts per hour)
        const attempts = this.db.prepare(`
            SELECT COUNT(*) as count FROM otp_requests 
            WHERE phone = ? AND created_at > datetime('now', '-1 hour')
        `).get(phone);

        if (attempts.count >= 3) {
            return {
                success: false,
                message: 'Too many attempts. Please try again later.'
            };
        }

        const otp = this.generateOTP();
        return await this.sendOTP(phone, otp);
    }

    /**
     * Clean up expired OTPs
     */
    cleanupExpiredOTPs() {
        const result = this.db.prepare(`
            DELETE FROM otp_requests 
            WHERE expires_at < datetime('now') OR is_used = 1
        `).run();

        return result.changes;
    }
}

module.exports = OTPSystem;
