"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeStockHoldings = computeStockHoldings;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const models_1 = require("../models");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
// Helper to compute holdings and average cost basis chronologically
async function computeStockHoldings(stockId, tx) {
    const purchases = await models_1.Purchase.findAll({
        where: { stockId },
        order: [['purchaseDate', 'ASC'], ['createdAt', 'ASC']],
        transaction: tx,
    });
    const sales = await models_1.Sales.findAll({
        where: { stockId },
        order: [['saleDate', 'ASC'], ['createdAt', 'ASC']],
        transaction: tx,
    });
    const transactions = [
        ...purchases.map((p) => ({
            type: 'BUY',
            quantity: Number(p.quantity),
            price: Number(p.purchasePrice),
            date: p.purchaseDate,
            createdAt: p.createdAt,
        })),
        ...sales.map((s) => ({
            type: 'SELL',
            quantity: Number(s.quantity),
            price: Number(s.sellPrice),
            date: s.saleDate,
            createdAt: s.createdAt,
        })),
    ];
    // Chronological sort: by date first, and then by database creation order to maintain transaction sequence
    transactions.sort((a, b) => {
        if (a.date < b.date)
            return -1;
        if (a.date > b.date)
            return 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    let remainingShares = 0;
    let totalCostBasis = 0;
    let averageCost = 0;
    for (const tx of transactions) {
        if (tx.type === 'BUY') {
            remainingShares += tx.quantity;
            totalCostBasis += tx.quantity * tx.price;
            averageCost = remainingShares > 0 ? totalCostBasis / remainingShares : 0;
        }
        else {
            // For sales, compute average cost before deducting, then reduce holdings proportionally
            averageCost = remainingShares > 0 ? totalCostBasis / remainingShares : 0;
            remainingShares -= tx.quantity;
            totalCostBasis = remainingShares * averageCost;
        }
    }
    return {
        remainingShares: Number(remainingShares.toFixed(4)),
        averageCost: Number(averageCost.toFixed(4)),
        totalCostBasis: Number(totalCostBasis.toFixed(2)),
    };
}
// POST /api/transactions/purchases -> Record a stock purchase [FR3]
router.post('/purchases', auth_1.requireAuth, [
    (0, express_validator_1.body)('stockId').isUUID().withMessage('Invalid Stock ID.'),
    (0, express_validator_1.body)('quantity')
        .isFloat({ min: 0.0001 })
        .withMessage('Quantity must be at least 0.0001.'),
    (0, express_validator_1.body)('purchasePrice')
        .isFloat({ min: 0.01 })
        .withMessage('Purchase price must be at least 0.01.'),
    (0, express_validator_1.body)('purchaseDate')
        .matches(/^\d{4}-\d{2}-\d{2}$/)
        .withMessage('Purchase date must be in YYYY-MM-DD format.')
        .custom((value) => {
        const inputDate = new Date(value);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (inputDate > today) {
            throw new Error('Purchase date cannot be in the future.');
        }
        return true;
    }),
], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const userId = req.user.id;
        const { stockId, quantity, purchasePrice, purchaseDate } = req.body;
        // Verify Stock counter ownership
        const stock = await models_1.Stock.findOne({
            where: { id: stockId, userId },
        });
        if (!stock) {
            return res.status(404).json({
                success: false,
                errors: [
                    {
                        field: 'stockId',
                        message: 'Stock counter not found or unauthorized.',
                    },
                ],
            });
        }
        // Record the purchase
        const purchase = await models_1.Purchase.create({
            stockId,
            quantity: Number(quantity),
            purchasePrice: Number(purchasePrice),
            purchaseDate,
        });
        return res.status(201).json({
            success: true,
            message: 'Stock purchase recorded successfully.',
            data: purchase,
        });
    }
    catch (error) {
        console.error('Error creating purchase:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to record purchase transaction.',
        });
    }
});
// POST /api/transactions/sales -> Record a stock sale & calculate profitLoss [FR4]
router.post('/sales', auth_1.requireAuth, [
    (0, express_validator_1.body)('stockId').isUUID().withMessage('Invalid Stock ID.'),
    (0, express_validator_1.body)('quantity')
        .isFloat({ min: 0.0001 })
        .withMessage('Quantity must be at least 0.0001.'),
    (0, express_validator_1.body)('sellPrice')
        .isFloat({ min: 0.01 })
        .withMessage('Selling price must be at least 0.01.'),
    (0, express_validator_1.body)('saleDate')
        .matches(/^\d{4}-\d{2}-\d{2}$/)
        .withMessage('Sale date must be in YYYY-MM-DD format.')
        .custom((value) => {
        const inputDate = new Date(value);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (inputDate > today) {
            throw new Error('Sale date cannot be in the future.');
        }
        return true;
    }),
], validate_1.handleValidationErrors, async (req, res) => {
    const transaction = await models_1.sequelize.transaction();
    try {
        const userId = req.user.id;
        const { stockId, quantity, sellPrice, saleDate } = req.body;
        const saleQty = Number(quantity);
        const sPrice = Number(sellPrice);
        // Verify Stock counter ownership and acquire an exclusive lock to avoid races
        const stock = await models_1.Stock.findOne({
            where: { id: stockId, userId },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!stock) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                errors: [
                    {
                        field: 'stockId',
                        message: 'Stock counter not found or unauthorized.',
                    },
                ],
            });
        }
        // Calculate total available holdings (Purchased - Sold) inside transaction context
        const holdings = await computeStockHoldings(stockId, transaction);
        // Short-Selling check
        if (saleQty > holdings.remainingShares) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                errors: [
                    {
                        field: 'quantity',
                        message: `Holdings validation failed. Requested sale quantity (${saleQty}) exceeds currently available holdings (${holdings.remainingShares} shares).`,
                    },
                ],
            });
        }
        // Profit/Loss calculation using Average Cost Basis
        // Formula: profitLoss = quantity * (sellPrice - AverageCost)
        const profitLoss = Number((saleQty * (sPrice - holdings.averageCost)).toFixed(2));
        // Persist the Sales transaction inside DB
        const newSale = await models_1.Sales.create({
            stockId,
            quantity: saleQty,
            sellPrice: sPrice,
            saleDate,
            profitLoss,
        }, { transaction });
        await transaction.commit();
        return res.status(201).json({
            success: true,
            message: 'Stock sale recorded successfully.',
            data: newSale,
        });
    }
    catch (error) {
        await transaction.rollback();
        console.error('Error creating sale:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to record sales transaction.',
        });
    }
});
// GET /api/transactions/history -> View filtered, combined transaction ledger [FR5]
router.get('/history', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate } = req.query;
        // Fetch all stocks owned by this user
        const userStocks = await models_1.Stock.findAll({
            where: { userId },
        });
        const stockIds = userStocks.map((s) => s.id);
        if (stockIds.length === 0) {
            return res.status(200).json({
                success: true,
                data: [],
            });
        }
        // Fetch all purchases and sales associated with user's stocks
        const purchases = await models_1.Purchase.findAll({
            where: { stockId: stockIds },
            include: [{ model: models_1.Stock, as: 'Stock', attributes: ['symbol', 'name'] }],
        });
        const sales = await models_1.Sales.findAll({
            where: { stockId: stockIds },
            include: [{ model: models_1.Stock, as: 'Stock', attributes: ['symbol', 'name'] }],
        });
        // Map purchases and sales into unified structures
        let combined = [
            ...purchases.map((p) => ({
                id: p.id,
                type: 'BUY',
                stockId: p.stockId,
                symbol: p.Stock?.symbol || 'UNKNOWN',
                name: p.Stock?.name || 'Unknown',
                quantity: Number(p.quantity),
                price: Number(p.purchasePrice),
                date: p.purchaseDate,
                profitLoss: null,
                createdAt: p.createdAt,
            })),
            ...sales.map((s) => ({
                id: s.id,
                type: 'SELL',
                stockId: s.stockId,
                symbol: s.Stock?.symbol || 'UNKNOWN',
                name: s.Stock?.name || 'Unknown',
                quantity: Number(s.quantity),
                price: Number(s.sellPrice),
                date: s.saleDate,
                profitLoss: Number(s.profitLoss),
                createdAt: s.createdAt,
            })),
        ];
        // Filter by date range if provided
        if (startDate) {
            combined = combined.filter((tx) => tx.date >= startDate);
        }
        if (endDate) {
            combined = combined.filter((tx) => tx.date <= endDate);
        }
        // Sort chronological descending (newest first)
        combined.sort((a, b) => {
            if (a.date < b.date)
                return 1;
            if (a.date > b.date)
                return -1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        return res.status(200).json({
            success: true,
            data: combined,
        });
    }
    catch (error) {
        console.error('Error fetching transaction ledger:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve chronological transaction history.',
        });
    }
});
exports.default = router;
