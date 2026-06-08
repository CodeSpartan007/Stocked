"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const recalculate_1 = require("../utils/recalculate");
const router = (0, express_1.Router)();
// GET /api/prices/:stockId -> Fetch historical prices for a stock with pagination
router.get('/:stockId', auth_1.requireAuth, [
    (0, express_validator_1.param)('stockId').isUUID().withMessage('Invalid Stock ID.'),
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be an integer between 1 and 100.'),
], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const userId = req.user.id;
        const { stockId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        // Ensure the stock exists and belongs to the authenticated user
        const stock = await models_1.Stock.findOne({
            where: { id: stockId, userId },
        });
        if (!stock) {
            return res.status(404).json({
                success: false,
                message: 'Stock not found or unauthorized.',
            });
        }
        // Fetch prices with pagination
        const { count, rows } = await models_1.DailyPrice.findAndCountAll({
            where: { stockId, userId },
            order: [['date', 'DESC']],
            limit,
            offset,
        });
        const totalPages = Math.ceil(count / limit);
        return res.status(200).json({
            success: true,
            data: {
                prices: rows,
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
        console.error('Error fetching prices:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve price history.',
        });
    }
});
// POST /api/prices -> Record a new daily price log
router.post('/', auth_1.requireAuth, [
    (0, express_validator_1.body)('stockId').isUUID().withMessage('Invalid Stock ID.'),
    (0, express_validator_1.body)('date').isDate().withMessage('Invalid date format. Use YYYY-MM-DD.'),
    (0, express_validator_1.body)('price').isFloat({ min: 0.01 }).withMessage('Price must be greater than 0.'),
    (0, express_validator_1.body)('volume').isInt({ min: 0 }).withMessage('Volume must be a non-negative integer.'),
], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const userId = req.user.id;
        const { stockId, date, price, volume } = req.body;
        // Ensure the stock exists and belongs to the authenticated user
        const stock = await models_1.Stock.findOne({
            where: { id: stockId, userId },
        });
        if (!stock) {
            return res.status(404).json({
                success: false,
                errors: [
                    {
                        field: 'stockId',
                        message: 'Associated stock not found or unauthorized.',
                    },
                ],
            });
        }
        // Check if price record for this stock and date already exists
        const existingPrice = await models_1.DailyPrice.findOne({
            where: { stockId, date, userId },
        });
        if (existingPrice) {
            return res.status(400).json({
                success: false,
                errors: [
                    {
                        field: 'date',
                        message: `A price record already exists for this stock on ${date}.`,
                    },
                ],
            });
        }
        // Create new price log (default source is manual, as required)
        const newPrice = await models_1.DailyPrice.create({
            userId,
            stockId,
            date,
            price,
            volume,
            source: 'manual',
        });
        await (0, recalculate_1.recalculateStockPriceHistory)(stockId, userId);
        const updatedPrice = await models_1.DailyPrice.findByPk(newPrice.id);
        return res.status(201).json({
            success: true,
            message: 'Price record logged successfully.',
            data: updatedPrice || newPrice,
        });
    }
    catch (error) {
        console.error('Error creating price record:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to record price details.',
        });
    }
});
// PUT /api/prices/:id -> Update an incorrect price entry
router.put('/:id', auth_1.requireAuth, [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid price record ID.'),
    (0, express_validator_1.body)('price').isFloat({ min: 0.01 }).withMessage('Price must be greater than 0.'),
    (0, express_validator_1.body)('volume').isInt({ min: 0 }).withMessage('Volume must be a non-negative integer.'),
    (0, express_validator_1.body)('date').isDate().withMessage('Invalid date format. Use YYYY-MM-DD.'),
], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { price, volume, date } = req.body;
        // Find the price entry
        const priceEntry = await models_1.DailyPrice.findOne({
            where: { id, userId },
        });
        if (!priceEntry) {
            return res.status(404).json({
                success: false,
                message: 'Price record not found or unauthorized.',
            });
        }
        // Check if updating date creates a duplicate (stockId, date)
        if (date !== priceEntry.date) {
            const duplicateEntry = await models_1.DailyPrice.findOne({
                where: {
                    stockId: priceEntry.stockId,
                    date,
                    userId,
                    id: { [sequelize_1.Op.ne]: id },
                },
            });
            if (duplicateEntry) {
                return res.status(400).json({
                    success: false,
                    errors: [
                        {
                            field: 'date',
                            message: `A price record already exists for this stock on ${date}.`,
                        },
                    ],
                });
            }
        }
        // Update the entry
        priceEntry.price = price;
        priceEntry.volume = volume;
        priceEntry.date = date;
        await priceEntry.save();
        await (0, recalculate_1.recalculateStockPriceHistory)(priceEntry.stockId, userId);
        const updatedPrice = await models_1.DailyPrice.findByPk(priceEntry.id);
        return res.status(200).json({
            success: true,
            message: 'Price record updated successfully.',
            data: updatedPrice || priceEntry,
        });
    }
    catch (error) {
        console.error('Error updating price entry:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update price details.',
        });
    }
});
// DELETE /api/prices/:id -> Delete an incorrect price entry
router.delete('/:id', auth_1.requireAuth, [(0, express_validator_1.param)('id').isUUID().withMessage('Invalid price record ID.')], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const priceEntry = await models_1.DailyPrice.findOne({
            where: { id, userId },
        });
        if (!priceEntry) {
            return res.status(404).json({
                success: false,
                message: 'Price record not found or unauthorized.',
            });
        }
        await priceEntry.destroy();
        await (0, recalculate_1.recalculateStockPriceHistory)(priceEntry.stockId, userId);
        return res.status(200).json({
            success: true,
            message: 'Price record deleted successfully.',
        });
    }
    catch (error) {
        console.error('Error deleting price entry:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete price entry.',
        });
    }
});
exports.default = router;
