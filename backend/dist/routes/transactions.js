"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeChronologicalHoldings = computeChronologicalHoldings;
exports.validateTimelineBalance = validateTimelineBalance;
exports.recalculateStockSales = recalculateStockSales;
exports.recalculateAllUserSales = recalculateAllUserSales;
exports.computeStockHoldings = computeStockHoldings;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const currencyService_1 = require("../services/currencyService");
const nseScraperService_1 = require("../services/nseScraperService");
const router = (0, express_1.Router)();
/**
 * Computes holdings and cost basis chronologically up to an optional asOfDate.
 * Supports both Average Cost Basis and FIFO (First-In, First-Out) cost basis methods.
 * If asOfDate is provided, only purchases and sales on or before asOfDate are evaluated.
 * Also supports excluding a specific transaction id (useful when editing/updating an existing transaction).
 */
async function computeChronologicalHoldings(stockId, userId, asOfDate, excludeTxIdOrMethod, tx, forcedMethod) {
    if (!userId) {
        throw new Error('computeChronologicalHoldings requires a valid non-empty userId for secure scoping.');
    }
    let costBasisMethod = forcedMethod;
    let excludeTxId = undefined;
    if (excludeTxIdOrMethod === 'average' || excludeTxIdOrMethod === 'fifo') {
        costBasisMethod = excludeTxIdOrMethod;
    }
    else {
        excludeTxId = excludeTxIdOrMethod;
    }
    if (!costBasisMethod) {
        const userSetting = await models_1.UserSetting.findByPk(userId, { transaction: tx });
        costBasisMethod = userSetting?.costBasisMethod === 'fifo' ? 'fifo' : 'average';
    }
    const purchases = await models_1.Purchase.findAll({
        where: { stockId, userId, ...(excludeTxId ? { id: { [sequelize_1.Op.ne]: excludeTxId } } : {}) },
        order: [['purchaseDate', 'ASC'], ['createdAt', 'ASC']],
        transaction: tx,
    });
    const sales = await models_1.Sales.findAll({
        where: { stockId, userId, ...(excludeTxId ? { id: { [sequelize_1.Op.ne]: excludeTxId } } : {}) },
        order: [['saleDate', 'ASC'], ['createdAt', 'ASC']],
        transaction: tx,
    });
    const timeline = [
        ...purchases.map((p) => ({
            type: 'BUY',
            quantity: Number(p.quantity),
            price: Number(p.purchasePrice),
            date: p.purchaseDate,
            id: p.id,
            createdAt: p.createdAt,
        })),
        ...sales.map((s) => ({
            type: 'SELL',
            quantity: Number(s.quantity),
            price: Number(s.sellPrice),
            date: s.saleDate,
            id: s.id,
            createdAt: s.createdAt,
        })),
    ];
    // Chronological sort: by date first (BUY before SELL on same date), then createdAt
    timeline.sort((a, b) => {
        if (a.date !== b.date)
            return a.date.localeCompare(b.date);
        if (a.type !== b.type)
            return a.type === 'BUY' ? -1 : 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    if (costBasisMethod === 'fifo') {
        const lots = [];
        for (const item of timeline) {
            if (asOfDate && item.date > asOfDate)
                break;
            if (item.type === 'BUY') {
                lots.push({ quantity: item.quantity, price: item.price });
            }
            else {
                let needed = item.quantity;
                while (needed > 0 && lots.length > 0) {
                    const lot = lots[0];
                    if (lot.quantity <= needed + 1e-9) {
                        needed -= lot.quantity;
                        lots.shift();
                    }
                    else {
                        lot.quantity -= needed;
                        needed = 0;
                    }
                }
            }
        }
        const remainingShares = Number(lots.reduce((acc, l) => acc + l.quantity, 0).toFixed(4));
        const totalCostBasis = Number(lots.reduce((acc, l) => acc + l.quantity * l.price, 0).toFixed(2));
        const averageCost = remainingShares > 0 ? Number((totalCostBasis / remainingShares).toFixed(4)) : 0;
        const computeSaleProfit = (quantity, sellPrice) => {
            let needed = quantity;
            let saleCost = 0;
            for (const lot of lots) {
                if (needed <= 0)
                    break;
                const take = Math.min(lot.quantity, needed);
                saleCost += take * lot.price;
                needed -= take;
            }
            return {
                costBasis: Number(saleCost.toFixed(2)),
                profitLoss: Number(((quantity * sellPrice) - saleCost).toFixed(2)),
            };
        };
        return {
            remainingShares,
            averageCost,
            totalCostBasis,
            costBasisMethod: 'fifo',
            computeSaleProfit,
        };
    }
    else {
        let remainingShares = 0;
        let totalCostBasis = 0;
        let averageCost = 0;
        for (const item of timeline) {
            if (asOfDate && item.date > asOfDate)
                break;
            if (item.type === 'BUY') {
                remainingShares += item.quantity;
                totalCostBasis += item.quantity * item.price;
                averageCost = remainingShares > 0 ? totalCostBasis / remainingShares : 0;
            }
            else {
                averageCost = remainingShares > 0 ? totalCostBasis / remainingShares : 0;
                remainingShares -= item.quantity;
                totalCostBasis = remainingShares * averageCost;
            }
        }
        const finalRemainingShares = Number(remainingShares.toFixed(4));
        const finalAverageCost = finalRemainingShares > 0 ? Number(averageCost.toFixed(4)) : 0;
        const finalTotalCostBasis = finalRemainingShares > 0 ? Number(totalCostBasis.toFixed(2)) : 0;
        const computeSaleProfit = (quantity, sellPrice) => {
            const costBasis = Number((quantity * finalAverageCost).toFixed(2));
            const profitLoss = Number((quantity * (sellPrice - finalAverageCost)).toFixed(2));
            return {
                costBasis,
                profitLoss,
            };
        };
        return {
            remainingShares: finalRemainingShares,
            averageCost: finalAverageCost,
            totalCostBasis: finalTotalCostBasis,
            costBasisMethod: 'average',
            computeSaleProfit,
        };
    }
}
/**
 * Validates that running inventory remains non-negative across every point in the timeline.
 */
function validateTimelineBalance(purchases, sales) {
    const timeline = [
        ...purchases.map((p) => ({ type: 'BUY', quantity: Number(p.quantity), date: p.date, createdAt: p.createdAt })),
        ...sales.map((s) => ({ type: 'SELL', quantity: Number(s.quantity), date: s.date, createdAt: s.createdAt })),
    ];
    timeline.sort((a, b) => {
        if (a.date !== b.date)
            return a.date.localeCompare(b.date);
        if (a.type !== b.type)
            return a.type === 'BUY' ? -1 : 1;
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime;
    });
    let runningShares = 0;
    for (const item of timeline) {
        if (item.type === 'BUY') {
            runningShares += item.quantity;
        }
        else {
            runningShares -= item.quantity;
        }
        // Epsilon threshold to guard against floating-point approximation errors
        if (runningShares < -0.00001) {
            return {
                valid: false,
                errorDate: item.date,
                balance: Number(runningShares.toFixed(4)),
            };
        }
    }
    return { valid: true };
}
/**
 * Recalculates profit/loss for all sales of a given stock chronologically.
 * Supports both 'average' cost basis and 'fifo' cost basis according to user preferences.
 */
async function recalculateStockSales(stockId, userId, tx, forcedMethod) {
    let costBasisMethod = forcedMethod;
    if (!costBasisMethod) {
        const userSetting = await models_1.UserSetting.findByPk(userId, { transaction: tx });
        costBasisMethod = userSetting?.costBasisMethod === 'fifo' ? 'fifo' : 'average';
    }
    const purchases = await models_1.Purchase.findAll({
        where: { stockId, userId },
        order: [['purchaseDate', 'ASC'], ['createdAt', 'ASC']],
        transaction: tx,
    });
    const sales = await models_1.Sales.findAll({
        where: { stockId, userId },
        order: [['saleDate', 'ASC'], ['createdAt', 'ASC']],
        transaction: tx,
    });
    if (sales.length === 0)
        return;
    const timeline = [
        ...purchases.map((p) => ({
            type: 'BUY',
            quantity: Number(p.quantity),
            price: Number(p.purchasePrice),
            date: p.purchaseDate,
            id: p.id,
            createdAt: p.createdAt,
        })),
        ...sales.map((s) => ({
            type: 'SELL',
            quantity: Number(s.quantity),
            price: Number(s.sellPrice),
            date: s.saleDate,
            id: s.id,
            createdAt: s.createdAt,
        })),
    ];
    timeline.sort((a, b) => {
        if (a.date !== b.date)
            return a.date.localeCompare(b.date);
        if (a.type !== b.type)
            return a.type === 'BUY' ? -1 : 1;
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime;
    });
    if (costBasisMethod === 'average') {
        let remainingShares = 0;
        let totalCostBasis = 0;
        let averageCost = 0;
        for (const item of timeline) {
            if (item.type === 'BUY') {
                remainingShares += item.quantity;
                totalCostBasis += item.quantity * item.price;
                averageCost = remainingShares > 0 ? totalCostBasis / remainingShares : 0;
            }
            else {
                averageCost = remainingShares > 0 ? totalCostBasis / remainingShares : 0;
                const roundedAvgCost = Number(averageCost.toFixed(4));
                const profitLoss = Number((item.quantity * (item.price - roundedAvgCost)).toFixed(2));
                await models_1.Sales.update({ profitLoss }, { where: { id: item.id }, transaction: tx });
                remainingShares -= item.quantity;
                totalCostBasis = remainingShares * averageCost;
            }
        }
    }
    else {
        const lots = [];
        for (const item of timeline) {
            if (item.type === 'BUY') {
                lots.push({ quantity: item.quantity, price: item.price });
            }
            else {
                let needed = item.quantity;
                let costOfSoldLots = 0;
                while (needed > 0 && lots.length > 0) {
                    const lot = lots[0];
                    if (lot.quantity <= needed + 1e-9) {
                        costOfSoldLots += lot.quantity * lot.price;
                        needed -= lot.quantity;
                        lots.shift();
                    }
                    else {
                        costOfSoldLots += needed * lot.price;
                        lot.quantity -= needed;
                        needed = 0;
                    }
                }
                const profitLoss = Number(((item.quantity * item.price) - costOfSoldLots).toFixed(2));
                await models_1.Sales.update({ profitLoss }, { where: { id: item.id }, transaction: tx });
            }
        }
    }
}
/**
 * Recalculates profit/loss across all stocks for a specific user.
 */
async function recalculateAllUserSales(userId, tx, forcedMethod) {
    const stocks = await models_1.Stock.findAll({ where: { userId }, transaction: tx });
    for (const stock of stocks) {
        await recalculateStockSales(stock.id, userId, tx, forcedMethod);
    }
}
// Backward-compatible alias for existing modules
async function computeStockHoldings(stockId, userId, tx) {
    return computeChronologicalHoldings(stockId, userId, undefined, undefined, tx);
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
            userId,
            stockId,
            quantity: Number(quantity),
            purchasePrice: Number(purchasePrice),
            purchaseDate,
        });
        // Recalculate any subsequent sales that may have occurred after this purchase date
        await recalculateStockSales(stockId, userId);
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
        // Constraint 1: Sale date must not predate the earliest purchase for this stock.
        // This prevents orphaned sales that corrupt the analytics P&L timeline.
        const earliestPurchase = await models_1.Purchase.findOne({
            where: { stockId, userId },
            order: [['purchaseDate', 'ASC'], ['createdAt', 'ASC']],
            transaction,
        });
        if (!earliestPurchase) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                errors: [
                    {
                        field: 'stockId',
                        message: 'You cannot record a sale because you have no purchase history for this stock. Please add a buy transaction first.',
                    },
                ],
            });
        }
        if (saleDate < earliestPurchase.purchaseDate) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                errors: [
                    {
                        field: 'saleDate',
                        message: `Sale date (${saleDate}) cannot be earlier than your first recorded purchase of this stock (${earliestPurchase.purchaseDate}). You can only sell shares you have previously bought.`,
                    },
                ],
            });
        }
        // Constraint 2: Calculate holdings as of the sale date and check for sufficient shares.
        // We compute holdings only from purchases and sales occurring on or before saleDate.
        const holdings = await computeChronologicalHoldings(stockId, userId, saleDate, undefined, transaction);
        // Point-in-time Short-Selling check [FR4.3]
        if (saleQty > holdings.remainingShares) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                errors: [
                    {
                        field: 'quantity',
                        message: `Not enough shares to sell on ${saleDate}. You held ${holdings.remainingShares} shares as of this date, but you are trying to sell ${saleQty} shares.`,
                    },
                ],
            });
        }
        // Constraint 3: Subsequent balance non-negativity check across entire timeline
        // Verify that injecting this sale does not cause any subsequent existing sale to become overdrawn.
        const allPurchases = await models_1.Purchase.findAll({
            where: { stockId, userId },
            transaction,
        });
        const allSales = await models_1.Sales.findAll({
            where: { stockId, userId },
            transaction,
        });
        const timelineCheck = validateTimelineBalance(allPurchases.map((p) => ({ quantity: Number(p.quantity), date: p.purchaseDate, createdAt: p.createdAt })), [
            ...allSales.map((s) => ({ quantity: Number(s.quantity), date: s.saleDate, createdAt: s.createdAt })),
            { quantity: saleQty, date: saleDate, createdAt: new Date() },
        ]);
        if (!timelineCheck.valid) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                errors: [
                    {
                        field: 'quantity',
                        message: `Recording this sale would cause your share balance to drop to ${timelineCheck.balance} shares on ${timelineCheck.errorDate} due to subsequent transactions.`,
                    },
                ],
            });
        }
        // Profit/Loss calculation using Chronological Cost Basis as of saleDate (FIFO or Average) [FR4.2]
        const saleEvaluation = holdings.computeSaleProfit(saleQty, sPrice);
        const profitLoss = saleEvaluation.profitLoss;
        // Persist the Sales transaction inside DB
        const newSale = await models_1.Sales.create({
            userId,
            stockId,
            quantity: saleQty,
            sellPrice: sPrice,
            saleDate,
            profitLoss,
        }, { transaction });
        // Recalculate profit/loss for all sales of this stock to ensure subsequent sales reflect this new sale
        await recalculateStockSales(stockId, userId, transaction);
        await transaction.commit();
        await newSale.reload();
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
// PUT /api/transactions/purchases/:id -> Update purchase transaction [FR3]
router.put('/purchases/:id', auth_1.requireAuth, [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid Purchase ID.'),
    (0, express_validator_1.body)('quantity')
        .optional()
        .isFloat({ min: 0.0001 })
        .withMessage('Quantity must be at least 0.0001.'),
    (0, express_validator_1.body)('purchasePrice')
        .optional()
        .isFloat({ min: 0.01 })
        .withMessage('Purchase price must be at least 0.01.'),
    (0, express_validator_1.body)('purchaseDate')
        .optional()
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
    const dbTransaction = await models_1.sequelize.transaction();
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { quantity, purchasePrice, purchaseDate } = req.body;
        const purchase = await models_1.Purchase.findOne({
            where: { id, userId },
            transaction: dbTransaction,
            lock: dbTransaction.LOCK.UPDATE,
        });
        if (!purchase) {
            await dbTransaction.rollback();
            return res.status(404).json({
                success: false,
                errors: [{ field: 'id', message: 'Purchase transaction not found or unauthorized.' }],
            });
        }
        const updatedQty = quantity !== undefined ? Number(quantity) : Number(purchase.quantity);
        const updatedPrice = purchasePrice !== undefined ? Number(purchasePrice) : Number(purchase.purchasePrice);
        const updatedDate = purchaseDate !== undefined ? purchaseDate : purchase.purchaseDate;
        // Inventory validation: Ensure updating this purchase doesn't break timeline balance
        const otherPurchases = await models_1.Purchase.findAll({
            where: { stockId: purchase.stockId, userId, id: { [sequelize_1.Op.ne]: id } },
            transaction: dbTransaction,
        });
        const allSales = await models_1.Sales.findAll({
            where: { stockId: purchase.stockId, userId },
            transaction: dbTransaction,
        });
        const timelineCheck = validateTimelineBalance([
            ...otherPurchases.map((p) => ({ quantity: Number(p.quantity), date: p.purchaseDate, createdAt: p.createdAt })),
            { quantity: updatedQty, date: updatedDate, createdAt: purchase.createdAt },
        ], allSales.map((s) => ({ quantity: Number(s.quantity), date: s.saleDate, createdAt: s.createdAt })));
        if (!timelineCheck.valid) {
            await dbTransaction.rollback();
            return res.status(400).json({
                success: false,
                errors: [
                    {
                        field: 'quantity',
                        message: `Updating this purchase would cause your share balance to drop to ${timelineCheck.balance} shares on ${timelineCheck.errorDate} due to subsequent sales transactions.`,
                    },
                ],
            });
        }
        purchase.quantity = updatedQty;
        purchase.purchasePrice = updatedPrice;
        purchase.purchaseDate = updatedDate;
        await purchase.save({ transaction: dbTransaction });
        // Recalculate profit/loss for all sales of this stock
        await recalculateStockSales(purchase.stockId, userId, dbTransaction);
        await dbTransaction.commit();
        await purchase.reload();
        return res.status(200).json({
            success: true,
            message: 'Stock purchase updated successfully.',
            data: purchase,
        });
    }
    catch (error) {
        await dbTransaction.rollback();
        console.error('Error updating purchase:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update purchase transaction.',
        });
    }
});
// DELETE /api/transactions/purchases/:id -> Delete purchase transaction [FR3]
router.delete('/purchases/:id', auth_1.requireAuth, [(0, express_validator_1.param)('id').isUUID().withMessage('Invalid Purchase ID.')], validate_1.handleValidationErrors, async (req, res) => {
    const dbTransaction = await models_1.sequelize.transaction();
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const purchase = await models_1.Purchase.findOne({
            where: { id, userId },
            transaction: dbTransaction,
            lock: dbTransaction.LOCK.UPDATE,
        });
        if (!purchase) {
            await dbTransaction.rollback();
            return res.status(404).json({
                success: false,
                errors: [{ field: 'id', message: 'Purchase transaction not found or unauthorized.' }],
            });
        }
        // Check if deletion would cause any subsequent sale to have negative inventory
        const remainingPurchases = await models_1.Purchase.findAll({
            where: { stockId: purchase.stockId, userId, id: { [sequelize_1.Op.ne]: id } },
            transaction: dbTransaction,
        });
        const allSales = await models_1.Sales.findAll({
            where: { stockId: purchase.stockId, userId },
            transaction: dbTransaction,
        });
        const timelineCheck = validateTimelineBalance(remainingPurchases.map((p) => ({ quantity: Number(p.quantity), date: p.purchaseDate, createdAt: p.createdAt })), allSales.map((s) => ({ quantity: Number(s.quantity), date: s.saleDate, createdAt: s.createdAt })));
        if (!timelineCheck.valid) {
            await dbTransaction.rollback();
            return res.status(400).json({
                success: false,
                errors: [
                    {
                        field: 'quantity',
                        message: `Deleting this purchase would cause your share balance to drop to ${timelineCheck.balance} shares on ${timelineCheck.errorDate} due to subsequent sales transactions.`,
                    },
                ],
            });
        }
        const stockId = purchase.stockId;
        await purchase.destroy({ transaction: dbTransaction });
        // Recalculate profit/loss for remaining sales
        await recalculateStockSales(stockId, userId, dbTransaction);
        await dbTransaction.commit();
        return res.status(200).json({
            success: true,
            message: 'Stock purchase deleted successfully.',
        });
    }
    catch (error) {
        await dbTransaction.rollback();
        console.error('Error deleting purchase:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete purchase transaction.',
        });
    }
});
// PUT /api/transactions/sales/:id -> Update sales transaction & recalculate P&L [FR4]
router.put('/sales/:id', auth_1.requireAuth, [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid Sale ID.'),
    (0, express_validator_1.body)('quantity')
        .optional()
        .isFloat({ min: 0.0001 })
        .withMessage('Quantity must be at least 0.0001.'),
    (0, express_validator_1.body)('sellPrice')
        .optional()
        .isFloat({ min: 0.01 })
        .withMessage('Selling price must be at least 0.01.'),
    (0, express_validator_1.body)('saleDate')
        .optional()
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
    const dbTransaction = await models_1.sequelize.transaction();
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { quantity, sellPrice, saleDate } = req.body;
        const sale = await models_1.Sales.findOne({
            where: { id, userId },
            transaction: dbTransaction,
            lock: dbTransaction.LOCK.UPDATE,
        });
        if (!sale) {
            await dbTransaction.rollback();
            return res.status(404).json({
                success: false,
                errors: [{ field: 'id', message: 'Sale transaction not found or unauthorized.' }],
            });
        }
        const updatedQty = quantity !== undefined ? Number(quantity) : Number(sale.quantity);
        const updatedPrice = sellPrice !== undefined ? Number(sellPrice) : Number(sale.sellPrice);
        const updatedDate = saleDate !== undefined ? saleDate : sale.saleDate;
        // Ensure sale date does not predate earliest purchase
        const earliestPurchase = await models_1.Purchase.findOne({
            where: { stockId: sale.stockId, userId },
            order: [['purchaseDate', 'ASC'], ['createdAt', 'ASC']],
            transaction: dbTransaction,
        });
        if (!earliestPurchase || updatedDate < earliestPurchase.purchaseDate) {
            await dbTransaction.rollback();
            return res.status(400).json({
                success: false,
                errors: [
                    {
                        field: 'saleDate',
                        message: `Sale date cannot be earlier than your first recorded purchase of this stock (${earliestPurchase?.purchaseDate}).`,
                    },
                ],
            });
        }
        // Validate timeline balance with updated sale
        const allPurchases = await models_1.Purchase.findAll({
            where: { stockId: sale.stockId, userId },
            transaction: dbTransaction,
        });
        const otherSales = await models_1.Sales.findAll({
            where: { stockId: sale.stockId, userId, id: { [sequelize_1.Op.ne]: id } },
            transaction: dbTransaction,
        });
        const timelineCheck = validateTimelineBalance(allPurchases.map((p) => ({ quantity: Number(p.quantity), date: p.purchaseDate, createdAt: p.createdAt })), [
            ...otherSales.map((s) => ({ quantity: Number(s.quantity), date: s.saleDate, createdAt: s.createdAt })),
            { quantity: updatedQty, date: updatedDate, createdAt: sale.createdAt },
        ]);
        if (!timelineCheck.valid) {
            await dbTransaction.rollback();
            return res.status(400).json({
                success: false,
                errors: [
                    {
                        field: 'quantity',
                        message: `Updating this sale would cause your share balance to drop to ${timelineCheck.balance} shares on ${timelineCheck.errorDate}.`,
                    },
                ],
            });
        }
        sale.quantity = updatedQty;
        sale.sellPrice = updatedPrice;
        sale.saleDate = updatedDate;
        await sale.save({ transaction: dbTransaction });
        // Recalculate P&L for all sales of this stock
        await recalculateStockSales(sale.stockId, userId, dbTransaction);
        await dbTransaction.commit();
        await sale.reload();
        return res.status(200).json({
            success: true,
            message: 'Stock sale updated successfully.',
            data: sale,
        });
    }
    catch (error) {
        await dbTransaction.rollback();
        console.error('Error updating sale:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update sales transaction.',
        });
    }
});
// DELETE /api/transactions/sales/:id -> Delete sales transaction & restore shares [FR4]
router.delete('/sales/:id', auth_1.requireAuth, [(0, express_validator_1.param)('id').isUUID().withMessage('Invalid Sale ID.')], validate_1.handleValidationErrors, async (req, res) => {
    const dbTransaction = await models_1.sequelize.transaction();
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const sale = await models_1.Sales.findOne({
            where: { id, userId },
            transaction: dbTransaction,
            lock: dbTransaction.LOCK.UPDATE,
        });
        if (!sale) {
            await dbTransaction.rollback();
            return res.status(404).json({
                success: false,
                errors: [{ field: 'id', message: 'Sale transaction not found or unauthorized.' }],
            });
        }
        const stockId = sale.stockId;
        await sale.destroy({ transaction: dbTransaction });
        // Recalculate P&L for remaining sales of this stock
        await recalculateStockSales(stockId, userId, dbTransaction);
        await dbTransaction.commit();
        return res.status(200).json({
            success: true,
            message: 'Stock sale deleted successfully.',
        });
    }
    catch (error) {
        await dbTransaction.rollback();
        console.error('Error deleting sale:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete sales transaction.',
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
        const { baseCurrency, exchangeRate } = await (0, currencyService_1.getUserCurrencyContext)(userId);
        // Fetch all purchases and sales associated with user's stocks
        const purchases = await models_1.Purchase.findAll({
            where: { userId },
            include: [{ model: models_1.Stock, as: 'Stock', attributes: ['symbol', 'name', 'currency'] }],
        });
        const sales = await models_1.Sales.findAll({
            where: { userId },
            include: [{ model: models_1.Stock, as: 'Stock', attributes: ['symbol', 'name', 'currency'] }],
        });
        // Map purchases and sales into unified structures
        let combined = [
            ...purchases.map((p) => {
                const stockCurrency = p.Stock && (0, nseScraperService_1.isNseSymbol)(p.Stock.symbol) && p.Stock.symbol.toUpperCase() !== 'TRFC'
                    ? 'KES'
                    : (p.Stock?.currency || 'USD');
                const nativePrice = Number(p.purchasePrice);
                const convertedPrice = Number((0, currencyService_1.convertPrice)(nativePrice, stockCurrency, baseCurrency, exchangeRate).toFixed(2));
                return {
                    id: p.id,
                    type: 'BUY',
                    stockId: p.stockId,
                    symbol: p.Stock?.symbol || 'UNKNOWN',
                    name: p.Stock?.name || 'Unknown',
                    quantity: Number(p.quantity),
                    price: nativePrice,
                    nativePrice,
                    convertedPrice,
                    currency: stockCurrency,
                    baseCurrency,
                    date: p.purchaseDate,
                    profitLoss: null,
                    nativeProfitLoss: null,
                    convertedProfitLoss: null,
                    createdAt: p.createdAt,
                };
            }),
            ...sales.map((s) => {
                const stockCurrency = s.Stock && (0, nseScraperService_1.isNseSymbol)(s.Stock.symbol) && s.Stock.symbol.toUpperCase() !== 'TRFC'
                    ? 'KES'
                    : (s.Stock?.currency || 'USD');
                const nativePrice = Number(s.sellPrice);
                const convertedPrice = Number((0, currencyService_1.convertPrice)(nativePrice, stockCurrency, baseCurrency, exchangeRate).toFixed(2));
                const nativeProfitLoss = Number(s.profitLoss);
                const convertedProfitLoss = Number((0, currencyService_1.convertPrice)(nativeProfitLoss, stockCurrency, baseCurrency, exchangeRate).toFixed(2));
                return {
                    id: s.id,
                    type: 'SELL',
                    stockId: s.stockId,
                    symbol: s.Stock?.symbol || 'UNKNOWN',
                    name: s.Stock?.name || 'Unknown',
                    quantity: Number(s.quantity),
                    price: nativePrice,
                    nativePrice,
                    convertedPrice,
                    currency: stockCurrency,
                    baseCurrency,
                    date: s.saleDate,
                    profitLoss: nativeProfitLoss,
                    nativeProfitLoss,
                    convertedProfitLoss,
                    createdAt: s.createdAt,
                };
            }),
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
