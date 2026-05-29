"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const requireAuth = (req, res, next) => {
    // Inject mock session user for Phase 1 Migration Safety
    req.user = {
        id: 'mock-user-123',
        email: 'user@stocked.com',
        role: 'user',
    };
    next();
};
exports.requireAuth = requireAuth;
