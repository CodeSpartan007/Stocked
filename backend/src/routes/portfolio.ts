import { Router, Response } from 'express';
import { Stock, DailyPrice, Sales } from '../models';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { computeStockHoldings } from './transactions';

const router = Router();

// GET /api/portfolio/summary -> Aggregate portfolio KPIs [FR5]
router.get(
  '/summary',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      // 1. Fetch all stock counters registered to the user
      const userStocks = await Stock.findAll({
        where: { userId },
      });
      const stockIds = userStocks.map((s) => s.id);

      let totalInvestedCapital = 0;
      let totalRealizedPL = 0;
      let totalUnrealizedPL = 0;
      let totalPortfolioValue = 0;

      // 2. Realized P&L: Sum of all stored profitLoss items from Sales
      const salesSum = await Sales.sum('profitLoss', {
        where: { userId },
      });
      totalRealizedPL = Number(salesSum || 0);

      // 3. Process remaining assets concurrently
      const activeHoldings: any[] = [];

      const holdingsAndPrices = await Promise.all(
        userStocks.map(async (stock) => {
          const holdings = await computeStockHoldings(stock.id, userId);
          if (holdings.remainingShares <= 0) return null;

          const latestPriceRecord = await DailyPrice.findOne({
            where: { stockId: stock.id, userId },
            order: [
              ['date', 'DESC'],
              ['createdAt', 'DESC'],
            ],
          });

          return { stock, holdings, latestPriceRecord };
        })
      );

      for (const item of holdingsAndPrices) {
        if (!item) continue;
        const { stock, holdings, latestPriceRecord } = item;

        // Fallback to average purchase price if no daily price feed exists
        const currentPrice = latestPriceRecord
          ? Number(latestPriceRecord.price)
          : holdings.averageCost;

        const remainingShares = holdings.remainingShares;
        const averageCost = holdings.averageCost;

        // Cost basis of remaining shares = remaining shares * average purchase cost
        const costBasisOfRemainingShares = remainingShares * averageCost;
        // Current Market Value = remaining shares * current price
        const currentMarketValue = remainingShares * currentPrice;
        // Unrealized P&L = Current Market Value - Cost Basis
        const unrealizedPL = currentMarketValue - costBasisOfRemainingShares;

        totalInvestedCapital += costBasisOfRemainingShares;
        totalUnrealizedPL += unrealizedPL;
        totalPortfolioValue += currentMarketValue;

        activeHoldings.push({
          id: stock.id,
          symbol: stock.symbol,
          name: stock.name,
          category: stock.category,
          remainingShares: Number(remainingShares.toFixed(4)),
          averageCost: Number(averageCost.toFixed(2)),
          currentPrice: Number(currentPrice.toFixed(2)),
          costBasis: Number(costBasisOfRemainingShares.toFixed(2)),
          marketValue: Number(currentMarketValue.toFixed(2)),
          unrealizedPL: Number(unrealizedPL.toFixed(2)),
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          totalPortfolioValue: Number(totalPortfolioValue.toFixed(2)),
          totalInvestedCapital: Number(totalInvestedCapital.toFixed(2)),
          realizedPL: Number(totalRealizedPL.toFixed(2)),
          unrealizedPL: Number(totalUnrealizedPL.toFixed(2)),
          holdings: activeHoldings,
        },
      });
    } catch (error: any) {
      console.error('Error computing portfolio summary:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve overall portfolio health metrics.',
      });
    }
  }
);

export default router;
