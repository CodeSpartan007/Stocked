import { DailyPrice } from '../models/DailyPrice';

/**
 * Recalculates the day-over-day change and changePercent columns for all price records
 * of a specific stock owned by a user, ordered chronologically.
 */
export async function recalculateStockPriceHistory(stockId: string, userId: string): Promise<void> {
  const prices = await DailyPrice.findAll({
    where: { stockId, userId },
    order: [['date', 'ASC']],
  });

  for (let i = 0; i < prices.length; i++) {
    const current = prices[i];
    if (i === 0) {
      current.change = 0.00;
      current.changePercent = 0.00;
    } else {
      const prev = prices[i - 1];
      const pCurrent = Number(current.price);
      const pPrev = Number(prev.price);
      const change = pCurrent - pPrev;
      const changePercent = pPrev !== 0 ? (change / pPrev) * 100 : 0.00;

      current.change = Number(change.toFixed(2));
      current.changePercent = Number(changePercent.toFixed(2));
    }
    await current.save();
  }
}
