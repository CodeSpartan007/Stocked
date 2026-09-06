"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEncryptionSecret = getEncryptionSecret;
exports.encrypt = encrypt;
exports.decrypt = decrypt;
const crypto_1 = __importDefault(require("crypto"));
const assert_1 = __importDefault(require("assert"));
const ALGORITHM = 'aes-256-cbc';
/**
 * Validates and retrieves the encryption secret from the environment.
 * Throws a fatal error if ENCRYPTION_SECRET is missing, empty, or shorter than 32 characters.
 */
function getEncryptionSecret() {
    const secret = process.env.ENCRYPTION_SECRET;
    if (!secret || !secret.trim()) {
        throw new Error('FATAL SECURITY ERROR: ENCRYPTION_SECRET environment variable is missing or empty. Cryptographic operations cannot proceed.');
    }
    if (secret.length < 32) {
        throw new Error('FATAL SECURITY ERROR: ENCRYPTION_SECRET must be at least 32 characters long.');
    }
    return secret;
}
/**
 * Encrypt a plain text string into a formatted iv:ciphertext block.
 * Derives a dynamic key using per-user salt (or master salt fallback) and asserts key & IV lengths.
 */
function encrypt(text, userId) {
    if (!text)
        return null;
    const secret = getEncryptionSecret();
    try {
        const iv = crypto_1.default.randomBytes(16);
        assert_1.default.strictEqual(iv.length, 16, 'Assertion failed: IV length must be exactly 16 bytes');
        // Dynamic per-user salt derivation
        const salt = userId || 'stocked_master_salt';
        const key = crypto_1.default.scryptSync(secret, salt, 32);
        assert_1.default.strictEqual(key.length, 32, 'Assertion failed: Derived key length must be exactly 32 bytes');
        const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    }
    catch (error) {
        if (error?.message?.startsWith('FATAL SECURITY ERROR')) {
            throw error;
        }
        console.error('[CryptoUtil] Encryption failed:', error);
        return null;
    }
}
/**
 * Decrypt an iv:ciphertext block back into a plain text string.
 * Supports backward compatibility with prior master salt and legacy salt.
 */
function decrypt(encryptedText, userId) {
    if (!encryptedText)
        return null;
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 2) {
            // If it doesn't contain a colon, it might be unencrypted legacy data or malformed
            return encryptedText;
        }
        const iv = Buffer.from(parts[0], 'hex');
        assert_1.default.strictEqual(iv.length, 16, 'Assertion failed: IV length must be exactly 16 bytes');
        const encrypted = parts[1];
        const secret = getEncryptionSecret();
        const salt = userId || 'stocked_master_salt';
        const key = crypto_1.default.scryptSync(secret, salt, 32);
        assert_1.default.strictEqual(key.length, 32, 'Assertion failed: Derived key length must be exactly 32 bytes');
        const tryDecrypt = (derivedKey) => {
            try {
                const decipher = crypto_1.default.createDecipheriv(ALGORITHM, derivedKey, iv);
                let decrypted = decipher.update(encrypted, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                if (decrypted.includes('\uFFFD')) {
                    return null;
                }
                return decrypted;
            }
            catch {
                return null;
            }
        };
        let result = tryDecrypt(key);
        if (result !== null) {
            return result;
        }
        // Fallback 1: If per-user salt was used, try 'stocked_master_salt'
        if (userId) {
            const masterKey = crypto_1.default.scryptSync(secret, 'stocked_master_salt', 32);
            assert_1.default.strictEqual(masterKey.length, 32, 'Assertion failed: Derived key length must be exactly 32 bytes');
            result = tryDecrypt(masterKey);
            if (result !== null) {
                return result;
            }
        }
        // Fallback 2: Legacy salt 'stocked_salt' for backwards compatibility
        const legacyKey = crypto_1.default.scryptSync(secret, 'stocked_salt', 32);
        assert_1.default.strictEqual(legacyKey.length, 32, 'Assertion failed: Derived key length must be exactly 32 bytes');
        result = tryDecrypt(legacyKey);
        if (result !== null) {
            return result;
        }
        console.warn('[CryptoUtil] Decryption failed: Invalid decryption key or secret mismatch. Returning null.');
        return null;
    }
    catch (error) {
        if (error?.message?.startsWith('FATAL SECURITY ERROR')) {
            throw error;
        }
        console.error('[CryptoUtil] Decryption failed:', error);
        return null;
    }
}
