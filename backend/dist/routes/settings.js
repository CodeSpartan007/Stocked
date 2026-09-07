"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const models_1 = require("../models");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const rateLimiter_1 = require("../middleware/rateLimiter");
const priceFeedService_1 = require("../services/priceFeedService");
const transactions_1 = require("./transactions");
const stocks_1 = require("./stocks");
const router = (0, express_1.Router)();
// GET /api/settings/feed -> Fetch active price feed configuration (with masked credentials)
router.get('/feed', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        let settings = await models_1.UserSetting.scope('withApiKey').findByPk(userId);
        if (!settings) {
            // Default initial setting
            await models_1.UserSetting.create({
                userId,
                provider: 'manual',
                apiKey: null,
                alphaVantageApiKey: null,
                polygonApiKey: null,
                autoSwitchOnRateLimit: true,
                refreshInterval: 60,
                costBasisMethod: 'average',
            });
            settings = await models_1.UserSetting.scope('withApiKey').findByPk(userId);
        }
        return res.status(200).json({
            success: true,
            data: {
                provider: settings.provider,
                apiKey: settings.apiKey ? '••••••••••••••••' : '',
                alphaVantageApiKey: settings.alphaVantageApiKey ? '••••••••••••••••' : '',
                polygonApiKey: settings.polygonApiKey ? '••••••••••••••••' : '',
                autoSwitchOnRateLimit: settings.autoSwitchOnRateLimit ?? true,
                refreshInterval: settings.refreshInterval,
                costBasisMethod: settings.costBasisMethod || 'average',
            },
        });
    }
    catch (error) {
        console.error('Error fetching settings:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve settings.',
        });
    }
});
// POST /api/settings/feed -> Save user-scoped price feed credentials & settings
router.post('/feed', auth_1.requireAuth, [
    (0, express_validator_1.body)('provider')
        .trim()
        .isIn(['alphavantage', 'polygon', 'manual'])
        .withMessage('Provider must be alphavantage, polygon, or manual.'),
    (0, express_validator_1.body)('apiKey')
        .optional({ nullable: true, checkFalsy: true })
        .trim(),
    (0, express_validator_1.body)('alphaVantageApiKey')
        .optional({ nullable: true })
        .isString(),
    (0, express_validator_1.body)('polygonApiKey')
        .optional({ nullable: true })
        .isString(),
    (0, express_validator_1.body)('autoSwitchOnRateLimit')
        .optional()
        .isBoolean()
        .withMessage('autoSwitchOnRateLimit must be a boolean.'),
    (0, express_validator_1.body)('refreshInterval')
        .isInt({ min: 10, max: 86400 })
        .withMessage('Refresh interval must be an integer between 10 seconds and 24 hours.'),
    (0, express_validator_1.body)('costBasisMethod')
        .optional()
        .trim()
        .isIn(['average', 'fifo'])
        .withMessage('costBasisMethod must be either average or fifo.'),
], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const userId = req.user.id;
        const { provider, apiKey, alphaVantageApiKey, polygonApiKey, autoSwitchOnRateLimit, refreshInterval, costBasisMethod, } = req.body;
        const existing = await models_1.UserSetting.scope('withApiKey').findByPk(userId);
        // Helper to process masked / omitted / blank values
        const resolveUpdatedKey = (newKey, existingKey) => {
            if (newKey === undefined || newKey === '••••••••••••••••') {
                return existingKey || null;
            }
            if (newKey === null || newKey.trim() === '') {
                return null;
            }
            return newKey.trim();
        };
        let updatedAlphaVantageApiKey = resolveUpdatedKey(alphaVantageApiKey, existing?.alphaVantageApiKey || (existing?.provider === 'alphavantage' ? existing?.apiKey : null));
        let updatedPolygonApiKey = resolveUpdatedKey(polygonApiKey, existing?.polygonApiKey || (existing?.provider === 'polygon' ? existing?.apiKey : null));
        // Backward compatibility: If legacy apiKey was provided but specific provider key was not
        if (apiKey !== undefined && apiKey !== '••••••••••••••••') {
            const trimmedLegacy = apiKey === null || apiKey.trim() === '' ? null : apiKey.trim();
            if (provider === 'alphavantage' && alphaVantageApiKey === undefined) {
                updatedAlphaVantageApiKey = trimmedLegacy;
            }
            else if (provider === 'polygon' && polygonApiKey === undefined) {
                updatedPolygonApiKey = trimmedLegacy;
            }
        }
        // Check key requirement for active primary provider
        const primaryKey = provider === 'alphavantage'
            ? updatedAlphaVantageApiKey
            : provider === 'polygon'
                ? updatedPolygonApiKey
                : null;
        if (provider !== 'manual' && !primaryKey) {
            return res.status(400).json({
                success: false,
                errors: [
                    {
                        field: provider === 'alphavantage' ? 'alphaVantageApiKey' : 'polygonApiKey',
                        message: `API Key is required when ${provider === 'alphavantage' ? 'Alpha Vantage' : 'Polygon.io'} is active.`,
                    },
                ],
            });
        }
        // Proactive connection test if a new key was entered for active provider
        let saveWarning = undefined;
        const isProviderChanged = !existing || existing.provider !== provider;
        const isAlphaVantageKeyChanged = alphaVantageApiKey !== undefined &&
            alphaVantageApiKey !== '••••••••••••••••' &&
            (!existing || existing.alphaVantageApiKey !== updatedAlphaVantageApiKey);
        const isPolygonKeyChanged = polygonApiKey !== undefined &&
            polygonApiKey !== '••••••••••••••••' &&
            (!existing || existing.polygonApiKey !== updatedPolygonApiKey);
        if (provider !== 'manual' &&
            primaryKey &&
            (isProviderChanged ||
                (provider === 'alphavantage' ? isAlphaVantageKeyChanged : isPolygonKeyChanged))) {
            try {
                if (provider === 'alphavantage') {
                    await (0, priceFeedService_1.fetchFromAlphaVantage)('AAPL', primaryKey);
                }
                else if (provider === 'polygon') {
                    await (0, priceFeedService_1.fetchFromPolygon)('AAPL', primaryKey);
                }
                (0, priceFeedService_1.clearCooldown)(userId, provider);
            }
            catch (testErr) {
                if ((0, priceFeedService_1.isRateLimitError)(testErr)) {
                    saveWarning = `Settings saved successfully, but the provider is currently rate limited: ${testErr.message}`;
                    console.warn(`[SettingsRouter] Saved configuration despite rate limit warning: ${testErr.message}`);
                }
                else {
                    console.warn(`[SettingsRouter] Proactive connection test failed: ${testErr.message}`);
                    return res.status(400).json({
                        success: false,
                        errors: [
                            {
                                field: provider === 'alphavantage' ? 'alphaVantageApiKey' : 'polygonApiKey',
                                message: `API Connection verification failed: ${testErr.message}`,
                            },
                        ],
                    });
                }
            }
        }
        const updatedCostBasisMethod = costBasisMethod || existing?.costBasisMethod || 'average';
        const updatedAutoSwitch = autoSwitchOnRateLimit !== undefined
            ? Boolean(autoSwitchOnRateLimit)
            : existing?.autoSwitchOnRateLimit ?? true;
        const [settings] = await models_1.UserSetting.upsert({
            userId,
            provider,
            apiKey: primaryKey,
            alphaVantageApiKey: updatedAlphaVantageApiKey,
            polygonApiKey: updatedPolygonApiKey,
            autoSwitchOnRateLimit: updatedAutoSwitch,
            refreshInterval,
            costBasisMethod: updatedCostBasisMethod,
        });
        // Recalculate historical sales if user changed cost-basis accounting methodology
        const previousMethod = existing?.costBasisMethod || 'average';
        if (previousMethod !== updatedCostBasisMethod) {
            await (0, transactions_1.recalculateAllUserSales)(userId, undefined, updatedCostBasisMethod);
        }
        console.log(`[SettingsRouter] Saved configurations for ${userId}. Provider: ${provider}, Interval: ${refreshInterval}s, Method: ${updatedCostBasisMethod}, AutoSwitch: ${updatedAutoSwitch}`);
        // Proactively restart poller if live sync is active
        if (process.env.NODE_ENV !== 'test' &&
            provider !== 'manual' &&
            (primaryKey || (updatedAutoSwitch && (updatedAlphaVantageApiKey || updatedPolygonApiKey)))) {
            (0, priceFeedService_1.startPriceSyncPoller)(userId, refreshInterval);
        }
        return res.status(200).json({
            success: true,
            message: saveWarning || 'Settings updated successfully.',
            data: {
                provider: settings.provider,
                apiKey: settings.apiKey ? '••••••••••••••••' : '',
                alphaVantageApiKey: settings.alphaVantageApiKey ? '••••••••••••••••' : '',
                polygonApiKey: settings.polygonApiKey ? '••••••••••••••••' : '',
                autoSwitchOnRateLimit: settings.autoSwitchOnRateLimit,
                refreshInterval: settings.refreshInterval,
                costBasisMethod: settings.costBasisMethod || 'average',
            },
        });
    }
    catch (error) {
        console.error('Error saving settings:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update settings configuration.',
        });
    }
});
// POST /api/settings/test-connection -> Verify API key connection before saving
router.post('/test-connection', auth_1.requireAuth, rateLimiter_1.apiTestRateLimiter, [
    (0, express_validator_1.body)('provider')
        .trim()
        .isIn(['alphavantage', 'polygon'])
        .withMessage('Provider must be alphavantage or polygon.'),
    (0, express_validator_1.body)('apiKey')
        .trim()
        .notEmpty()
        .withMessage('API Key is required to test connection.'),
], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const userId = req.user.id;
        const { provider, apiKey } = req.body;
        let keyToTest = apiKey;
        if (apiKey === '••••••••••••••••') {
            const existing = await models_1.UserSetting.scope('withApiKey').findByPk(userId);
            if (provider === 'alphavantage') {
                keyToTest = existing?.alphaVantageApiKey || (existing?.provider === 'alphavantage' ? existing?.apiKey : null);
            }
            else if (provider === 'polygon') {
                keyToTest = existing?.polygonApiKey || (existing?.provider === 'polygon' ? existing?.apiKey : null);
            }
            if (!keyToTest) {
                return res.status(400).json({
                    success: false,
                    message: `No existing API key found to test for ${provider === 'alphavantage' ? 'Alpha Vantage' : 'Polygon.io'}.`,
                });
            }
        }
        console.log(`[SettingsRouter] Testing connection for user ${userId} using ${provider}...`);
        if (provider === 'alphavantage') {
            await (0, priceFeedService_1.fetchFromAlphaVantage)('AAPL', keyToTest);
        }
        else if (provider === 'polygon') {
            await (0, priceFeedService_1.fetchFromPolygon)('AAPL', keyToTest);
        }
        else {
            throw new Error('Unsupported provider for testing.');
        }
        (0, priceFeedService_1.clearCooldown)(userId, provider);
        return res.status(200).json({
            success: true,
            message: `API Key is active and successfully connected to ${provider === 'alphavantage' ? 'Alpha Vantage' : 'Polygon.io'}.`,
        });
    }
    catch (error) {
        console.warn('API Connection test failed:', error.message);
        return res.status(400).json({
            success: false,
            message: error.message || 'API connection test failed.',
        });
    }
});
// GET /api/settings/status -> Retrieve the current connection/rate-limit status of the API feed
router.get('/status', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const status = await (0, priceFeedService_1.getOrUpdateApiStatus)(userId);
        return res.status(200).json({
            success: true,
            data: status,
        });
    }
    catch (error) {
        console.error('Error fetching API status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve API status.',
        });
    }
});
// GET /api/settings/price/:symbol -> Alias for ticker price query
router.get('/price/:symbol', auth_1.requireAuth, async (req, res) => {
    const userId = req.user.id;
    const { symbol } = req.params;
    return (0, stocks_1.handleTickerPriceQuery)(symbol, userId, res);
});
exports.default = router;
