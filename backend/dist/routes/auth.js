"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const models_1 = require("../models");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
const JWT_SECRET = (() => {
    if (!process.env.JWT_SECRET) {
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
            return 'dev-only-predictable-secret-key-fallback';
        }
        throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing or empty. Server cannot start securely in production.');
    }
    return process.env.JWT_SECRET;
})();
// POST /api/auth/register -> Standard user signup endpoint
router.post('/register', [
    (0, express_validator_1.body)('email')
        .trim()
        .notEmpty().withMessage('Email address is required.')
        .isEmail().withMessage('Please input a valid email address.')
        .normalizeEmail(),
    (0, express_validator_1.body)('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter.')
        .matches(/[0-9]/).withMessage('Password must contain at least one numeric digit.')
        .matches(/[@$!%*?&#]/).withMessage('Password must contain at least one special character (@, $, !, %, *, ?, &, #).'),
], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const { email, password } = req.body;
        // Check if user already exists
        const existingUser = await models_1.User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                errors: [
                    {
                        field: 'email',
                        message: 'This email is already registered to another system account.',
                    },
                ],
            });
        }
        // Hash password using bcrypt with 12 rounds
        const passwordHash = await bcrypt_1.default.hash(password, 12);
        // Create new standard user and their default setting configurations atomically inside a transaction
        const tx = await models_1.sequelize.transaction();
        let newUser;
        try {
            newUser = await models_1.User.create({
                email,
                passwordHash,
                role: 'user',
            }, { transaction: tx });
            await models_1.UserSetting.create({
                userId: newUser.id,
                provider: 'manual',
                apiKey: null,
                refreshInterval: 60,
            }, { transaction: tx });
            await tx.commit();
        }
        catch (err) {
            await tx.rollback();
            throw err;
        }
        // Sign JWT
        const token = jsonwebtoken_1.default.sign({ id: newUser.id, email: newUser.email, role: newUser.role }, JWT_SECRET, { expiresIn: '24h' });
        // Set cookie containing the token
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
        });
        return res.status(201).json({
            success: true,
            message: 'Account registered successfully.',
            user: {
                id: newUser.id,
                email: newUser.email,
                role: newUser.role,
            },
        });
    }
    catch (error) {
        console.error('Registration failure:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to complete registration process.',
        });
    }
});
// POST /api/auth/login -> Standard authentication login endpoint
router.post('/login', [
    (0, express_validator_1.body)('email')
        .trim()
        .notEmpty().withMessage('Email address is required.')
        .isEmail().withMessage('Please input a valid email address.')
        .normalizeEmail(),
    (0, express_validator_1.body)('password').notEmpty().withMessage('Password is required.'),
], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const { email, password } = req.body;
        // Find user
        const user = await models_1.User.findOne({ where: { email } });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email address or password credentials.',
            });
        }
        // Verify password
        const isPasswordValid = await bcrypt_1.default.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email address or password credentials.',
            });
        }
        // Sign JWT
        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        // Set cookie containing the token
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
        });
        return res.status(200).json({
            success: true,
            message: 'Logged in successfully.',
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
            },
        });
    }
    catch (error) {
        console.error('Login failure:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to complete authentication.',
        });
    }
});
// POST /api/auth/logout -> Clear secure authentication cookie structure
router.post('/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    });
    return res.status(200).json({
        success: true,
        message: 'User session logged out successfully.',
    });
});
// GET /api/auth/me -> Session state hydrator endpoint
router.get('/me', auth_1.requireAuth, (req, res) => {
    return res.status(200).json({
        success: true,
        user: {
            id: req.user.id,
            email: req.user.email,
            role: req.user.role,
        },
    });
});
exports.default = router;
