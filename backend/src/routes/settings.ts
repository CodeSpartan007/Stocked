import { Router, Response } from 'express';
import { body } from 'express-validator';
import { UserSetting } from '../models';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { handleValidationErrors } from '../middleware/validate';
import { startPriceSyncPoller, fetchFromAlphaVantage, fetchFromPolygon, getOrUpdateApiStatus } from '../services/priceFeedService';

const router = Router();

// GET /api/settings/feed -> Fetch active price feed configuration (with masked credentials)
router.get('/feed', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    let settings = await UserSetting.scope('withApiKey').findByPk(userId);
    if (!settings) {
      // Default initial setting
      await UserSetting.create({
        userId,
        provider: 'manual',
        apiKey: null,
        refreshInterval: 60,
      });
      settings = await UserSetting.scope('withApiKey').findByPk(userId);
    }

    return res.status(200).json({
      success: true,
      data: {
        provider: settings!.provider,
        apiKey: settings!.apiKey ? '••••••••••••••••' : '',
        refreshInterval: settings!.refreshInterval,
      },
    });
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve settings.',
    });
  }
});

// POST /api/settings/feed -> Save user-scoped price feed credentials & settings
router.post(
  '/feed',
  requireAuth,
  [
    body('provider')
      .trim()
      .isIn(['alphavantage', 'polygon', 'manual'])
      .withMessage('Provider must be alphavantage, polygon, or manual.'),
    body('apiKey')
      .optional({ nullable: true, checkFalsy: true })
      .trim(),
    body('refreshInterval')
      .isInt({ min: 10, max: 86400 })
      .withMessage('Refresh interval must be an integer between 10 seconds and 24 hours.'),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { provider, apiKey, refreshInterval } = req.body;

      // Ensure API key is provided if provider is alphavantage or polygon
      if (provider !== 'manual' && (!apiKey || apiKey.trim() === '')) {
        // If we already have a saved key, we can allow keeping it
        const existing = await UserSetting.scope('withApiKey').findByPk(userId);
        if (!existing || !existing.apiKey) {
          return res.status(400).json({
            success: false,
            errors: [
              {
                field: 'apiKey',
                message: 'API Key is required when live provider is active.',
              },
            ],
          });
        }
      }

      const existing = await UserSetting.scope('withApiKey').findByPk(userId);
      let updatedApiKey = apiKey;

      const isMasked = apiKey === '••••••••••••••••';
      const isOmitted = apiKey === undefined;

      if (isMasked || isOmitted) {
        updatedApiKey = existing ? existing.apiKey : null;
      } else if (apiKey === '' || apiKey === null) {
        updatedApiKey = null;
      }

      // Test connection before saving if a live provider is selected and credentials/provider changed
      let saveWarning: string | undefined = undefined;
      const isProviderChanged = !existing || existing.provider !== provider;
      const isKeyChanged = !isMasked && !isOmitted && (!existing || existing.apiKey !== updatedApiKey);

      if (provider !== 'manual' && updatedApiKey && (isProviderChanged || isKeyChanged)) {
        try {
          if (provider === 'alphavantage') {
            await fetchFromAlphaVantage('AAPL', updatedApiKey);
          } else if (provider === 'polygon') {
            await fetchFromPolygon('AAPL', updatedApiKey);
          }
        } catch (testErr: any) {
          const errMsgLower = testErr.message.toLowerCase();
          const isRateLimit = 
            errMsgLower.includes('rate limit') || 
            errMsgLower.includes('thank you for visiting alpha vantage') || 
            errMsgLower.includes('429') ||
            errMsgLower.includes('standard api rate limit') ||
            errMsgLower.includes('call frequency') ||
            errMsgLower.includes('too many requests') ||
            errMsgLower.includes('maximum number of requests') ||
            errMsgLower.includes('request limit reached');

          if (isRateLimit) {
            saveWarning = `Settings saved successfully, but the provider is currently rate limited: ${testErr.message}`;
            console.warn(`[SettingsRouter] Saved configuration despite rate limit warning: ${testErr.message}`);
          } else {
            console.warn(`[SettingsRouter] Proactive connection test failed: ${testErr.message}`);
            return res.status(400).json({
              success: false,
              errors: [
                {
                  field: 'apiKey',
                  message: `API Connection verification failed: ${testErr.message}`,
                },
              ],
            });
          }
        }
      }

      const [settings] = await UserSetting.upsert({
        userId,
        provider,
        apiKey: updatedApiKey,
        refreshInterval,
      });

      console.log(`[SettingsRouter] Saved configurations for ${userId}. Provider: ${provider}, Interval: ${refreshInterval}s`);

      // Proactively restart poller if live sync is active
      if (provider !== 'manual' && updatedApiKey) {
        startPriceSyncPoller(userId, refreshInterval);
      }

      return res.status(200).json({
        success: true,
        message: saveWarning || 'Settings updated successfully.',
        data: {
          provider: settings.provider,
          apiKey: updatedApiKey ? '••••••••••••••••' : '',
          refreshInterval: settings.refreshInterval,
        },
      });
    } catch (error: any) {
      console.error('Error saving settings:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update settings configuration.',
      });
    }
  }
);

// POST /api/settings/test-connection -> Verify API key connection before saving
router.post(
  '/test-connection',
  requireAuth,
  [
    body('provider')
      .trim()
      .isIn(['alphavantage', 'polygon'])
      .withMessage('Provider must be alphavantage or polygon.'),
    body('apiKey')
      .trim()
      .notEmpty()
      .withMessage('API Key is required to test connection.'),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { provider, apiKey } = req.body;

      let keyToTest = apiKey;
      if (apiKey === '••••••••••••••••') {
        const existing = await UserSetting.scope('withApiKey').findByPk(userId);
        if (!existing || !existing.apiKey) {
          return res.status(400).json({
            success: false,
            message: 'No existing API key found to test.',
          });
        }
        keyToTest = existing.apiKey;
      }

      console.log(`[SettingsRouter] Testing connection for user ${userId} using ${provider}...`);
      
      // Test with a standard symbol AAPL
      if (provider === 'alphavantage') {
        await fetchFromAlphaVantage('AAPL', keyToTest);
      } else if (provider === 'polygon') {
        await fetchFromPolygon('AAPL', keyToTest);
      } else {
        throw new Error('Unsupported provider for testing.');
      }

      return res.status(200).json({
        success: true,
        message: `API Key is active and successfully connected to ${provider === 'alphavantage' ? 'Alpha Vantage' : 'Polygon.io'}.`,
      });
    } catch (error: any) {
      console.warn('API Connection test failed:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || 'API connection test failed.',
      });
    }
  }
);

// GET /api/settings/status -> Retrieve the current connection/rate-limit status of the API feed
router.get('/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const status = await getOrUpdateApiStatus(userId);
    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    console.error('Error fetching API status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve API status.',
    });
  }
});

export default router;
