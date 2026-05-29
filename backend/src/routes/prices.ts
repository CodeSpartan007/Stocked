import { Router, Response } from 'express';
import { body, param, query } from 'express-validator';
import { Op } from 'sequelize';
import { Stock, DailyPrice } from '../models';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { handleValidationErrors } from '../middleware/validate';

const router = Router();

// GET /api/prices/:stockId -> Fetch historical prices for a stock with pagination
router.get(
  '/:stockId',
  requireAuth,
  [
    param('stockId').isUUID().withMessage('Invalid Stock ID.'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be an integer between 1 and 100.'),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { stockId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      // Ensure the stock exists and belongs to the authenticated user
      const stock = await Stock.findOne({
        where: { id: stockId, userId },
      });

      if (!stock) {
        return res.status(404).json({
          success: false,
          message: 'Stock not found or unauthorized.',
        });
      }

      // Fetch prices with pagination
      const { count, rows } = await DailyPrice.findAndCountAll({
        where: { stockId },
        order: [['date', 'DESC']],
        limit,
        offset,
      });

      const totalPages = Math.ceil(count / limit);

      return res.status(200).json({
        success: true,
        data: {
          prices: rows,
          pagination: {
            totalItems: count,
            totalPages,
            currentPage: page,
            limit,
          },
        },
      });
    } catch (error: any) {
      console.error('Error fetching prices:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve price history.',
      });
    }
  }
);

// POST /api/prices -> Record a new daily price log
router.post(
  '/',
  requireAuth,
  [
    body('stockId').isUUID().withMessage('Invalid Stock ID.'),
    body('date').isDate().withMessage('Invalid date format. Use YYYY-MM-DD.'),
    body('price').isFloat({ min: 0.01 }).withMessage('Price must be greater than 0.'),
    body('volume').isInt({ min: 0 }).withMessage('Volume must be a non-negative integer.'),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { stockId, date, price, volume } = req.body;

      // Ensure the stock exists and belongs to the authenticated user
      const stock = await Stock.findOne({
        where: { id: stockId, userId },
      });

      if (!stock) {
        return res.status(404).json({
          success: false,
          errors: [
            {
              field: 'stockId',
              message: 'Associated stock not found or unauthorized.',
            },
          ],
        });
      }

      // Check if price record for this stock and date already exists
      const existingPrice = await DailyPrice.findOne({
        where: { stockId, date },
      });

      if (existingPrice) {
        return res.status(400).json({
          success: false,
          errors: [
            {
              field: 'date',
              message: `A price record already exists for this stock on ${date}.`,
            },
          ],
        });
      }

      // Create new price log (default source is manual, as required)
      const newPrice = await DailyPrice.create({
        stockId,
        date,
        price,
        volume,
        source: 'manual',
      });

      return res.status(201).json({
        success: true,
        message: 'Price record logged successfully.',
        data: newPrice,
      });
    } catch (error: any) {
      console.error('Error creating price record:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to record price details.',
      });
    }
  }
);

// PUT /api/prices/:id -> Update an incorrect price entry
router.put(
  '/:id',
  requireAuth,
  [
    param('id').isUUID().withMessage('Invalid price record ID.'),
    body('price').isFloat({ min: 0.01 }).withMessage('Price must be greater than 0.'),
    body('volume').isInt({ min: 0 }).withMessage('Volume must be a non-negative integer.'),
    body('date').isDate().withMessage('Invalid date format. Use YYYY-MM-DD.'),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { price, volume, date } = req.body;

      // Find the price entry
      const priceEntry = await DailyPrice.findByPk(id);
      if (!priceEntry) {
        return res.status(404).json({
          success: false,
          message: 'Price record not found.',
        });
      }

      // Ensure the associated stock belongs to the current user
      const stock = await Stock.findOne({
        where: { id: priceEntry.stockId, userId },
      });

      if (!stock) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized. You do not own this stock.',
        });
      }

      // Check if updating date creates a duplicate (stockId, date)
      if (date !== priceEntry.date) {
        const duplicateEntry = await DailyPrice.findOne({
          where: {
            stockId: priceEntry.stockId,
            date,
            id: { [Op.ne]: id },
          },
        });

        if (duplicateEntry) {
          return res.status(400).json({
            success: false,
            errors: [
              {
                field: 'date',
                message: `A price record already exists for this stock on ${date}.`,
              },
            ],
          });
        }
      }

      // Update the entry
      priceEntry.price = price;
      priceEntry.volume = volume;
      priceEntry.date = date;
      await priceEntry.save();

      return res.status(200).json({
        success: true,
        message: 'Price record updated successfully.',
        data: priceEntry,
      });
    } catch (error: any) {
      console.error('Error updating price entry:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update price details.',
      });
    }
  }
);

// DELETE /api/prices/:id -> Delete an incorrect price entry
router.delete(
  '/:id',
  requireAuth,
  [param('id').isUUID().withMessage('Invalid price record ID.')],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const priceEntry = await DailyPrice.findByPk(id);
      if (!priceEntry) {
        return res.status(404).json({
          success: false,
          message: 'Price record not found.',
        });
      }

      // Ensure the associated stock belongs to the current user
      const stock = await Stock.findOne({
        where: { id: priceEntry.stockId, userId },
      });

      if (!stock) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized. You do not own this stock.',
        });
      }

      await priceEntry.destroy();

      return res.status(200).json({
        success: true,
        message: 'Price record deleted successfully.',
      });
    } catch (error: any) {
      console.error('Error deleting price entry:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete price entry.',
      });
    }
  }
);

export default router;
