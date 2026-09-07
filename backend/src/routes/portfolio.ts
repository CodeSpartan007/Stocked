import { Router, Response } from 'express';
import { Stock, DailyPrice, Sales } from '../models';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { computeStockHoldings } from './transactions';
import { getUserCurrencyContext, convertPrice } from '../services/currencyService';

const router = Router();

// GET /api/portfolio/summary -> Aggregate portfolio KPIs [FR5]
router.get(
  '/summary',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { baseCurrency, exchangeRate } = await getUserCurrencyContext(userId);

      // 1. Fetch all stock counters registered to the user
      const userStocks = await Stock.findAll({
        where: { userId },
      });

      let totalInvestedCapital = 0;
      let totalRealizedPL = 0;
      let totalUnrealizedPL = 0;
      let totalPortfolioValue = 0;

      // 2. Multi-Currency Realized P&L: Fetch all user sales joined with Stock, convert by stock currency
      const userSales = await Sales.findAll({
        where: { userId },
        include: [{ model: Stock, as: 'Stock', attributes: ['currency'] }],
      });
      totalRealizedPL = userSales.reduce((sum, s) => {
        const stockCurrency = (s.Stock?.currency as 'USD' | 'KES') || 'USD';
        return sum + convertPrice(Number(s.profitLoss), stockCurrency, baseCurrency, exchangeRate);
      }, 0);

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

        const stockCurrency = (stock.currency as 'USD' | 'KES') || 'USD';

        // Native prices
        const nativeCurrentPrice = latestPriceRecord
          ? Number(latestPriceRecord.price)
          : holdings.averageCost;
        const nativeRemainingShares = holdings.remainingShares;
        const nativeAverageCost = holdings.averageCost;
        const nativeCostBasis = nativeRemainingShares * nativeAverageCost;
        const nativeMarketValue = nativeRemainingShares * nativeCurrentPrice;
        const nativeUnrealizedPL = nativeMarketValue - nativeCostBasis;

        // Converted prices in user's baseCurrency
        const averageCost = convertPrice(nativeAverageCost, stockCurrency, baseCurrency, exchangeRate);
        const currentPrice = convertPrice(nativeCurrentPrice, stockCurrency, baseCurrency, exchangeRate);
        const costBasis = convertPrice(nativeCostBasis, stockCurrency, baseCurrency, exchangeRate);
        const marketValue = convertPrice(nativeMarketValue, stockCurrency, baseCurrency, exchangeRate);
        const unrealizedPL = marketValue - costBasis;

        totalInvestedCapital += costBasis;
        totalUnrealizedPL += unrealizedPL;
        totalPortfolioValue += marketValue;

        activeHoldings.push({
          id: stock.id,
          symbol: stock.symbol,
          name: stock.name,
          category: stock.category,
          currency: baseCurrency,
          nativeCurrency: stockCurrency,
          remainingShares: Number(nativeRemainingShares.toFixed(4)),
          averageCost: Number(averageCost.toFixed(2)),
          currentPrice: Number(currentPrice.toFixed(2)),
          costBasis: Number(costBasis.toFixed(2)),
          marketValue: Number(marketValue.toFixed(2)),
          unrealizedPL: Number(unrealizedPL.toFixed(2)),
          nativeAverageCost: Number(nativeAverageCost.toFixed(2)),
          nativeCurrentPrice: Number(nativeCurrentPrice.toFixed(2)),
          nativeCostBasis: Number(nativeCostBasis.toFixed(2)),
          nativeMarketValue: Number(nativeMarketValue.toFixed(2)),
          nativeUnrealizedPL: Number(nativeUnrealizedPL.toFixed(2)),
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
          currency: baseCurrency,
          exchangeRate,
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
