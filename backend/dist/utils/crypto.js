"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = 'aes-256-cbc';
const SECRET = process.env.ENCRYPTION_SECRET || 'stocked_secure_default_secret_32b'; // 32 characters or derivation secret
/**
 * Encrypt a plain text string into a formatted iv:ciphertext block.
 */
function encrypt(text) {
    if (!text)
        return null;
    try {
        const iv = crypto_1.default.randomBytes(16);
        // Ensure the key is exactly 32 bytes derived from our secret
        const key = crypto_1.default.scryptSync(SECRET, 'stocked_salt', 32);
        const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    }
    catch (error) {
        console.error('[CryptoUtil] Encryption failed:', error);
        return null;
    }
}
/**
 * Decrypt an iv:ciphertext block back into a plain text string.
 */
function decrypt(encryptedText) {
    if (!encryptedText)
        return null;
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 2) {
            // If it doesn't contain a colon, it might be unencrypted legacy data or malformed
            return encryptedText;
        }
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const key = crypto_1.default.scryptSync(SECRET, 'stocked_salt', 32);
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (error) {
        console.error('[CryptoUtil] Decryption failed:', error);
        return null;
    }
}
