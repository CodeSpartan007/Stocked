import { DailyPrice } from '../models/DailyPrice';

/**
 * Recalculates the change and changePercent columns for all price records
 * of a specific stock owned by a user relative to the first (oldest) log.
 */
export async function recalculateStockPriceHistory(stockId: string, userId: string): Promise<void> {
  const prices = await DailyPrice.findAll({
    where: { stockId, userId },
    order: [['date', 'ASC']],
  });

  if (prices.length === 0) return;

  const firstPrice = Number(prices[0].price);

  for (let i = 0; i < prices.length; i++) {
    const current = prices[i];
    const pCurrent = Number(current.price);
    const change = pCurrent - firstPrice;
    const changePercent = firstPrice !== 0 ? (change / firstPrice) * 100 : 0.00;

    current.change = Number(change.toFixed(2));
    current.changePercent = Number(changePercent.toFixed(2));
    await current.save();
  }
}
