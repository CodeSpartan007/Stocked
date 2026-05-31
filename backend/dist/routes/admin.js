"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const models_1 = require("../models");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
// Protected strictly under requireAuth and requireRole(['admin'])
router.use(auth_1.requireAuth, (0, auth_1.requireRole)(['admin']));
// GET /api/admin/users -> List all system accounts with metadata metric summaries
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const { count, rows: users } = await models_1.User.findAndCountAll({
            attributes: ['id', 'email', 'role', 'createdAt'],
            order: [['createdAt', 'DESC']],
            limit,
            offset,
        });
        const usersWithMetadata = await Promise.all(users.map(async (user) => {
            // Query counts directly from database to avoid hydration leaks or group-by bugs
            const totalStocks = await models_1.Stock.count({ where: { userId: user.id } });
            const totalLogs = await models_1.ExportLogs.count({ where: { userId: user.id } });
            return {
                id: user.id,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt,
                metadata: {
                    totalStocks,
                    totalLogs,
                },
            };
        }));
        const totalPages = Math.ceil(count / limit);
        return res.status(200).json({
            success: true,
            data: {
                users: usersWithMetadata,
                pagination: {
                    totalItems: count,
                    totalPages,
                    currentPage: page,
                    limit,
                },
            },
        });
    }
    catch (error) {
        console.error('Failed to load user matrix for admins:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve administrative user accounts.',
        });
    }
});
// PUT /api/admin/users/:id/role -> Elevate or demote system accounts
router.put('/users/:id/role', [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid User ID format.'),
    (0, express_validator_1.body)('role')
        .trim()
        .isIn(['admin', 'user'])
        .withMessage('Role must be admin or user.'),
], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        // 1. Prevent self-demotion
        if (id === req.user.id && role !== 'admin') {
            return res.status(400).json({
                success: false,
                message: 'Security Guard: You are not allowed to demote your own active administrative session.',
            });
        }
        const targetUser = await models_1.User.findByPk(id);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'System account not found.',
            });
        }
        targetUser.role = role;
        await targetUser.save();
        console.log(`[Admin Panel] User ${targetUser.email} role updated to ${role} by administrator ${req.user.email}`);
        return res.status(200).json({
            success: true,
            message: `Account role updated to ${role} successfully.`,
            data: {
                id: targetUser.id,
                email: targetUser.email,
                role: targetUser.role,
            },
        });
    }
    catch (error) {
        console.error('Failed to modify user role:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update system account role.',
        });
    }
});
// DELETE /api/admin/users/:id -> Cascade delete specific user accounts
router.delete('/users/:id', [(0, express_validator_1.param)('id').isUUID().withMessage('Invalid User ID format.')], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const { id } = req.params;
        // 1. Prevent self-deletion
        if (id === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'Security Guard: You are not allowed to delete your own administrative session.',
            });
        }
        const targetUser = await models_1.User.findByPk(id);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'System account not found.',
            });
        }
        // SQLite foreign key cascade constraint (ON DELETE CASCADE) will automatically trigger
        // the synchronous deletion of all rows linking back to this User.id across all tables:
        // Stocks, PerformanceTargets, UserSettings, ExportLogs, Purchases, Sales, and DailyPrices.
        await targetUser.destroy();
        console.log(`[Admin Panel] Cascaded deletion triggered for user ${targetUser.email} by admin ${req.user.email}`);
        return res.status(200).json({
            success: true,
            message: `User account (${targetUser.email}) and all scoped data columns deleted successfully.`,
        });
    }
    catch (error) {
        console.error('Failed to complete cascaded user deletion:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete system account and child relation records.',
        });
    }
});
exports.default = router;
