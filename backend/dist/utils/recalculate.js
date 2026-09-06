"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recalculateStockPriceHistory = recalculateStockPriceHistory;
const DailyPrice_1 = require("../models/DailyPrice");
/**
 * Recalculates the day-over-day change and changePercent columns for all price records
 * of a specific stock owned by a user relative to the immediately preceding chronologically sorted price record.
 * [FR2, FR7]
 */
async function recalculateStockPriceHistory(stockId, userId) {
    const prices = await DailyPrice_1.DailyPrice.findAll({
        where: { stockId, userId },
        order: [['date', 'ASC'], ['createdAt', 'ASC']],
    });
    if (prices.length === 0)
        return;
    for (let i = 0; i < prices.length; i++) {
        const current = prices[i];
        const pCurrent = Number(current.price);
        if (i === 0) {
            current.change = 0.00;
            current.changePercent = 0.00;
        }
        else {
            const prevPrice = Number(prices[i - 1].price);
            const change = pCurrent - prevPrice;
            const changePercent = prevPrice > 0 ? (change / prevPrice) * 100 : 0.00;
            current.change = Number(change.toFixed(2));
            current.changePercent = Number(changePercent.toFixed(2));
        }
        await current.save();
    }
}
