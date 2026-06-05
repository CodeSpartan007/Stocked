"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const models_1 = require("./models");
const auth_1 = __importDefault(require("./routes/auth"));
const admin_1 = __importDefault(require("./routes/admin"));
const stocks_1 = __importDefault(require("./routes/stocks"));
const prices_1 = __importDefault(require("./routes/prices"));
const transactions_1 = __importDefault(require("./routes/transactions"));
const portfolio_1 = __importDefault(require("./routes/portfolio"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const settings_1 = __importDefault(require("./routes/settings"));
const exports_1 = __importDefault(require("./routes/exports"));
const priceFeedService_1 = require("./services/priceFeedService");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5001;
// CORS setup
app.use((0, cors_1.default)({
    origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
        : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
}));
// Middleware
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// Routes
app.use('/api/auth', auth_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/stocks', stocks_1.default);
app.use('/api/prices', prices_1.default);
app.use('/api/transactions', transactions_1.default);
app.use('/api/portfolio', portfolio_1.default);
app.use('/api/analytics', analytics_1.default);
app.use('/api/settings', settings_1.default);
app.use('/api/exports', exports_1.default);
// Root Route
app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Welcome to the Stocked API. The backend service is running successfully.',
        healthCheck: '/health'
    });
});
// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Stocked backend is running.' });
});
// Start Server
async function startServer() {
    try {
        // Sync DB and Seed Mock Data
        await (0, models_1.initDb)();
        // Initialize active user synchronization timers on system startup
        await (0, priceFeedService_1.initializeAllPollers)();
        app.listen(PORT, () => {
            console.log(`========================================`);
            console.log(`🚀 STOCKED BACKEND SERVER RUNNING`);
            console.log(`📶 Local API: http://localhost:${PORT}`);
            console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
            console.log(`========================================`);
        });
    }
    catch (error) {
        console.error('Fatal error starting Stocked backend server:', error);
        process.exit(1);
    }
}
startServer();
