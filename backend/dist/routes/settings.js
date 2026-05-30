"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const models_1 = require("../models");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const priceFeedService_1 = require("../services/priceFeedService");
const router = (0, express_1.Router)();
// GET /api/settings/feed -> Fetch active price feed configuration (with masked credentials)
router.get('/feed', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        let settings = await models_1.UserSetting.findByPk(userId);
        if (!settings) {
            // Default initial setting
            settings = await models_1.UserSetting.create({
                userId,
                provider: 'manual',
                apiKey: null,
                refreshInterval: 60,
            });
        }
        return res.status(200).json({
            success: true,
            data: {
                provider: settings.provider,
                apiKey: settings.apiKey ? '••••••••••••••••' : '',
                refreshInterval: settings.refreshInterval,
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
    (0, express_validator_1.body)('refreshInterval')
        .isInt({ min: 10, max: 86400 })
        .withMessage('Refresh interval must be an integer between 10 seconds and 24 hours.'),
], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const userId = req.user.id;
        const { provider, apiKey, refreshInterval } = req.body;
        // Ensure API key is provided if provider is alphavantage or polygon
        if (provider !== 'manual' && (!apiKey || apiKey.trim() === '')) {
            // If we already have a saved key, we can allow keeping it
            const existing = await models_1.UserSetting.findByPk(userId);
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
        const existing = await models_1.UserSetting.findByPk(userId);
        let updatedApiKey = apiKey;
        // If key is masked (e.g. dots or stars) and we have an existing setting, do not overwrite the real key
        if (apiKey && (apiKey.includes('•') || apiKey.includes('★') || apiKey.includes('*'))) {
            updatedApiKey = existing ? existing.apiKey : null;
        }
        const [settings] = await models_1.UserSetting.upsert({
            userId,
            provider,
            apiKey: updatedApiKey || null,
            refreshInterval,
        });
        console.log(`[SettingsRouter] Saved configurations for ${userId}. Provider: ${provider}, Interval: ${refreshInterval}s`);
        // Proactively restart poller if live sync is active
        if (provider !== 'manual' && updatedApiKey) {
            (0, priceFeedService_1.startPriceSyncPoller)(refreshInterval);
        }
        return res.status(200).json({
            success: true,
            message: 'Settings updated successfully.',
            data: {
                provider: settings.provider,
                apiKey: settings.apiKey ? '••••••••••••••••' : '',
                refreshInterval: settings.refreshInterval,
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
exports.default = router;
