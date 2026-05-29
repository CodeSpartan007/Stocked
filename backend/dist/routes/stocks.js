"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
// GET /api/stocks -> View all registered stocks with aggregated summary data
router.get('/', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        // Fetch all stocks for the authenticated user
        const stocks = await models_1.Stock.findAll({
            where: { userId },
            order: [['symbol', 'ASC']],
        });
        const stocksWithSummaries = await Promise.all(stocks.map(async (stock) => {
            // Fetch all prices for this stock to aggregate metrics
            const prices = await models_1.DailyPrice.findAll({
                where: { stockId: stock.id },
                order: [['date', 'DESC']],
            });
            const totalRecords = prices.length;
            let latestPrice = 0;
            let latestPriceDate = '';
            let averagePrice = 0;
            let highestPrice = 0;
            let lowestPrice = 0;
            let priceChange = 0;
            let priceChangePercent = 0;
            if (totalRecords > 0) {
                latestPrice = Number(prices[0].price);
                latestPriceDate = prices[0].date;
                const numericPrices = prices.map((p) => Number(p.price));
                const sum = numericPrices.reduce((acc, curr) => acc + curr, 0);
                averagePrice = sum / totalRecords;
                highestPrice = Math.max(...numericPrices);
                lowestPrice = Math.min(...numericPrices);
                if (totalRecords > 1) {
                    const previousPrice = Number(prices[1].price);
                    priceChange = latestPrice - previousPrice;
                    priceChangePercent = (priceChange / previousPrice) * 100;
                }
            }
            return {
                id: stock.id,
                name: stock.name,
                symbol: stock.symbol,
                description: stock.description,
                category: stock.category,
                createdAt: stock.createdAt,
                updatedAt: stock.updatedAt,
                summary: {
                    totalPriceRecords: totalRecords,
                    latestPrice: Number(latestPrice.toFixed(2)),
                    latestPriceDate,
                    averagePrice: Number(averagePrice.toFixed(2)),
                    highestPrice: Number(highestPrice.toFixed(2)),
                    lowestPrice: Number(lowestPrice.toFixed(2)),
                    priceChange: Number(priceChange.toFixed(2)),
                    priceChangePercent: Number(priceChangePercent.toFixed(2)),
                },
            };
        }));
        return res.status(200).json({
            success: true,
            data: stocksWithSummaries,
        });
    }
    catch (error) {
        console.error('Error fetching stocks:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve stocks.',
        });
    }
});
// POST /api/stocks -> Create a new stock counter
router.post('/', auth_1.requireAuth, [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Stock name is required.'),
    (0, express_validator_1.body)('symbol')
        .trim()
        .notEmpty()
        .withMessage('Symbol is required.')
        .isAlphanumeric()
        .withMessage('Symbol must be alphanumeric.')
        .toUpperCase(),
    (0, express_validator_1.body)('description').optional().trim(),
    (0, express_validator_1.body)('category').optional().trim(),
], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, symbol, description, category } = req.body;
        // Check symbol uniqueness for this specific user
        const existingStock = await models_1.Stock.findOne({
            where: {
                userId,
                symbol,
            },
        });
        if (existingStock) {
            return res.status(400).json({
                success: false,
                errors: [
                    {
                        field: 'symbol',
                        message: `You have already registered a stock counter with symbol "${symbol}".`,
                    },
                ],
            });
        }
        const newStock = await models_1.Stock.create({
            userId,
            name,
            symbol,
            description: description || null,
            category: category || 'Other',
        });
        return res.status(201).json({
            success: true,
            message: 'Stock counter registered successfully.',
            data: {
                id: newStock.id,
                name: newStock.name,
                symbol: newStock.symbol,
                description: newStock.description,
                category: newStock.category,
            },
        });
    }
    catch (error) {
        console.error('Error creating stock:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to register stock counter.',
        });
    }
});
// PUT /api/stocks/:id -> Edit an existing stock counter's details
router.put('/:id', auth_1.requireAuth, [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid Stock ID.'),
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Stock name is required.'),
    (0, express_validator_1.body)('symbol')
        .trim()
        .notEmpty()
        .withMessage('Symbol is required.')
        .isAlphanumeric()
        .withMessage('Symbol must be alphanumeric.')
        .toUpperCase(),
    (0, express_validator_1.body)('description').optional().trim(),
    (0, express_validator_1.body)('category').optional().trim(),
], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { name, symbol, description, category } = req.body;
        // Find the stock
        const stock = await models_1.Stock.findOne({
            where: { id, userId },
        });
        if (!stock) {
            return res.status(404).json({
                success: false,
                message: 'Stock counter not found.',
            });
        }
        // Check if symbol uniqueness is violated (if symbol has changed)
        if (symbol !== stock.symbol) {
            const existingStock = await models_1.Stock.findOne({
                where: {
                    userId,
                    symbol,
                    id: { [sequelize_1.Op.ne]: id },
                },
            });
            if (existingStock) {
                return res.status(400).json({
                    success: false,
                    errors: [
                        {
                            field: 'symbol',
                            message: `You have already registered a stock counter with symbol "${symbol}".`,
                        },
                    ],
                });
            }
        }
        // Update fields
        stock.name = name;
        stock.symbol = symbol;
        stock.description = description || null;
        stock.category = category || 'Other';
        await stock.save();
        return res.status(200).json({
            success: true,
            message: 'Stock counter updated successfully.',
            data: {
                id: stock.id,
                name: stock.name,
                symbol: stock.symbol,
                description: stock.description,
                category: stock.category,
            },
        });
    }
    catch (error) {
        console.error('Error updating stock:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update stock counter.',
        });
    }
});
// DELETE /api/stocks/:id -> Delete stock and cascade records
router.delete('/:id', auth_1.requireAuth, [(0, express_validator_1.param)('id').isUUID().withMessage('Invalid Stock ID.')], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const stock = await models_1.Stock.findOne({
            where: { id, userId },
        });
        if (!stock) {
            return res.status(404).json({
                success: false,
                message: 'Stock counter not found or unauthorized.',
            });
        }
        // Delete the stock. SQLite foreign key constraints (ON DELETE CASCADE)
        // will cascadingly remove all DailyPrice entries associated with this stockId.
        await stock.destroy();
        return res.status(200).json({
            success: true,
            message: 'Stock counter and all associated price records deleted successfully.',
        });
    }
    catch (error) {
        console.error('Error deleting stock:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete stock counter.',
        });
    }
});
exports.default = router;
