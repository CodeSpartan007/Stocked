"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
if (!process.env.JWT_SECRET) {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing or empty. Server cannot start securely.');
}
const JWT_SECRET = process.env.JWT_SECRET;
const requireAuth = (req, res, next) => {
    let token;
    // 1. Try to extract from Bearer authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }
    // 2. Try to extract from cookies if not found in header
    if (!token && req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access Denied. Authentication token not found. Please log in.',
        });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role,
        };
        return next();
    }
    catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Access Denied. Authentication token is invalid or expired.',
        });
    }
};
exports.requireAuth = requireAuth;
/**
 * Strict Role-Based Access Control (RBAC) middleware
 * Intercepts unauthorized calls early and returns a 403 Forbidden status
 */
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized. Authentication required.',
            });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden. You do not possess the required privilege level to perform this action.',
            });
        }
        return next();
    };
};
exports.requireRole = requireRole;
