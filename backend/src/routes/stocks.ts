import { Router, Response } from 'express';
import { body, param } from 'express-validator';
import { Op } from 'sequelize';
import { Stock, DailyPrice } from '../models';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { handleValidationErrors } from '../middleware/validate';
import { getLivePriceForStock } from '../services/priceFeedService';

/**
 * Zero-dependency concurrency-limiting runner that executes items using Promise.allSettled
 */
async function limitConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let index = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      try {
        const value = await fn(items[i]);
        results[i] = { status: 'fulfilled', value };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  });

  await Promise.all(workers);
  return results;
}

const router = Router();

// GET /api/stocks/live-prices -> View live price metadata for active tickers (with concurrency limit)
router.get('/live-prices', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Fetch all stock counters registered for this user
    const stocks = await Stock.findAll({
      where: { userId },
      order: [['symbol', 'ASC']],
    });

    // Bound external API requests to a max concurrency of 3, utilizing allSettled to prevent partial failures from rejecting the whole response
    const settledResults = await limitConcurrency(stocks, 3, (stock) =>
      getLivePriceForStock(stock, userId)
    );

    const livePrices = settledResults
      .map((result, idx) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          console.error(`[StocksRouter Alert] Live price fetch failed for stock ${stocks[idx].symbol}:`, result.reason);
          return null;
        }
      })
      .filter((price): price is NonNullable<typeof price> => price !== null);

    return res.status(200).json({
      success: true,
      data: livePrices,
    });
  } catch (error: any) {
    console.error('Error fetching live stock prices:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve live prices.',
    });
  }
});

// GET /api/stocks -> View all registered stocks with aggregated summary data
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Fetch all stocks for the authenticated user
    const stocks = await Stock.findAll({
      where: { userId },
      order: [['symbol', 'ASC']],
    });

    const stocksWithSummaries = await Promise.all(
      stocks.map(async (stock) => {
        // Fetch all prices for this stock to aggregate metrics
        const prices = await DailyPrice.findAll({
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
            source: prices[0]?.source === 'api' ? 'live' : 'manual fallback',
            lastUpdated: prices[0]?.updatedAt ? prices[0].updatedAt.toISOString() : null,
          },
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: stocksWithSummaries,
    });
  } catch (error: any) {
    console.error('Error fetching stocks:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve stocks.',
    });
  }
});

// POST /api/stocks -> Create a new stock counter
router.post(
  '/',
  requireAuth,
  [
    body('name').trim().notEmpty().withMessage('Stock name is required.'),
    body('symbol')
      .trim()
      .notEmpty()
      .withMessage('Symbol is required.')
      .isAlphanumeric()
      .withMessage('Symbol must be alphanumeric.')
      .toUpperCase(),
    body('description').optional().trim(),
    body('category').optional().trim(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { name, symbol, description, category } = req.body;

      // Check symbol uniqueness for this specific user
      const existingStock = await Stock.findOne({
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

      const newStock = await Stock.create({
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
    } catch (error: any) {
      console.error('Error creating stock:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to register stock counter.',
      });
    }
  }
);

// PUT /api/stocks/:id -> Edit an existing stock counter's details
router.put(
  '/:id',
  requireAuth,
  [
    param('id').isUUID().withMessage('Invalid Stock ID.'),
    body('name').trim().notEmpty().withMessage('Stock name is required.'),
    body('symbol')
      .trim()
      .notEmpty()
      .withMessage('Symbol is required.')
      .isAlphanumeric()
      .withMessage('Symbol must be alphanumeric.')
      .toUpperCase(),
    body('description').optional().trim(),
    body('category').optional().trim(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { name, symbol, description, category } = req.body;

      // Find the stock
      const stock = await Stock.findOne({
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
        const existingStock = await Stock.findOne({
          where: {
            userId,
            symbol,
            id: { [Op.ne]: id },
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
    } catch (error: any) {
      console.error('Error updating stock:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update stock counter.',
      });
    }
  }
);

// DELETE /api/stocks/:id -> Delete stock and cascade records
router.delete(
  '/:id',
  requireAuth,
  [param('id').isUUID().withMessage('Invalid Stock ID.')],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const stock = await Stock.findOne({
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
    } catch (error: any) {
      console.error('Error deleting stock:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete stock counter.',
      });
    }
  }
);

export default router;
