import { Router, Response } from 'express';
import { body } from 'express-validator';
import { Transaction } from 'sequelize';
import { sequelize, Stock, Purchase, Sales } from '../models';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { handleValidationErrors } from '../middleware/validate';

const router = Router();

// Helper to compute holdings and average cost basis chronologically
export async function computeStockHoldings(stockId: string, userId: string, tx?: Transaction) {
  if (!userId) {
    throw new Error('computeStockHoldings requires a valid non-empty userId for secure scoping.');
  }

  const queryWhere: any = { stockId, userId };

  const purchases = await Purchase.findAll({
    where: queryWhere,
    order: [['purchaseDate', 'ASC'], ['createdAt', 'ASC']],
    transaction: tx,
  });

  const sales = await Sales.findAll({
    where: queryWhere,
    order: [['saleDate', 'ASC'], ['createdAt', 'ASC']],
    transaction: tx,
  });

  interface UnifiedTx {
    type: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    date: string;
    createdAt: Date;
  }

  const transactions: UnifiedTx[] = [
    ...purchases.map((p) => ({
      type: 'BUY' as const,
      quantity: Number(p.quantity),
      price: Number(p.purchasePrice),
      date: p.purchaseDate,
      createdAt: p.createdAt,
    })),
    ...sales.map((s) => ({
      type: 'SELL' as const,
      quantity: Number(s.quantity),
      price: Number(s.sellPrice),
      date: s.saleDate,
      createdAt: s.createdAt,
    })),
  ];

  // Chronological sort: by date first, and then by database creation order to maintain transaction sequence
  transactions.sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
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
    } else {
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
router.post(
  '/purchases',
  requireAuth,
  [
    body('stockId').isUUID().withMessage('Invalid Stock ID.'),
    body('quantity')
      .isFloat({ min: 0.0001 })
      .withMessage('Quantity must be at least 0.0001.'),
    body('purchasePrice')
      .isFloat({ min: 0.01 })
      .withMessage('Purchase price must be at least 0.01.'),
    body('purchaseDate')
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
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { stockId, quantity, purchasePrice, purchaseDate } = req.body;

      // Verify Stock counter ownership
      const stock = await Stock.findOne({
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
      const purchase = await Purchase.create({
        userId,
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
    } catch (error: any) {
      console.error('Error creating purchase:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to record purchase transaction.',
      });
    }
  }
);

// POST /api/transactions/sales -> Record a stock sale & calculate profitLoss [FR4]
router.post(
  '/sales',
  requireAuth,
  [
    body('stockId').isUUID().withMessage('Invalid Stock ID.'),
    body('quantity')
      .isFloat({ min: 0.0001 })
      .withMessage('Quantity must be at least 0.0001.'),
    body('sellPrice')
      .isFloat({ min: 0.01 })
      .withMessage('Selling price must be at least 0.01.'),
    body('saleDate')
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
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    const transaction = await sequelize.transaction();
    try {
      const userId = req.user!.id;
      const { stockId, quantity, sellPrice, saleDate } = req.body;
      const saleQty = Number(quantity);
      const sPrice = Number(sellPrice);

      // Verify Stock counter ownership and acquire an exclusive lock to avoid races
      const stock = await Stock.findOne({
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
      const holdings = await computeStockHoldings(stockId, userId, transaction);

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
      const newSale = await Sales.create(
        {
          userId,
          stockId,
          quantity: saleQty,
          sellPrice: sPrice,
          saleDate,
          profitLoss,
        },
        { transaction }
      );

      await transaction.commit();

      return res.status(201).json({
        success: true,
        message: 'Stock sale recorded successfully.',
        data: newSale,
      });
    } catch (error: any) {
      await transaction.rollback();
      console.error('Error creating sale:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to record sales transaction.',
      });
    }
  }
);

// GET /api/transactions/history -> View filtered, combined transaction ledger [FR5]
router.get(
  '/history',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { startDate, endDate } = req.query;

      // Fetch all stocks owned by this user
      const userStocks = await Stock.findAll({
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
      const purchases = await Purchase.findAll({
        where: { userId },
        include: [{ model: Stock, as: 'Stock', attributes: ['symbol', 'name'] }],
      });

      const sales = await Sales.findAll({
        where: { userId },
        include: [{ model: Stock, as: 'Stock', attributes: ['symbol', 'name'] }],
      });

      // Map purchases and sales into unified structures
      let combined: any[] = [
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
        combined = combined.filter((tx) => tx.date >= (startDate as string));
      }
      if (endDate) {
        combined = combined.filter((tx) => tx.date <= (endDate as string));
      }

      // Sort chronological descending (newest first)
      combined.sort((a, b) => {
        if (a.date < b.date) return 1;
        if (a.date > b.date) return -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return res.status(200).json({
        success: true,
        data: combined,
      });
    } catch (error: any) {
      console.error('Error fetching transaction ledger:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve chronological transaction history.',
      });
    }
  }
);

export default router;
