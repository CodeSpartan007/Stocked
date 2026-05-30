"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const models_1 = require("./models");
const stocks_1 = __importDefault(require("./routes/stocks"));
const prices_1 = __importDefault(require("./routes/prices"));
const transactions_1 = __importDefault(require("./routes/transactions"));
const portfolio_1 = __importDefault(require("./routes/portfolio"));
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5001;
// CORS setup
app.use((0, cors_1.default)({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
}));
// Body Parser
app.use(express_1.default.json());
// Routes
app.use('/api/stocks', stocks_1.default);
app.use('/api/prices', prices_1.default);
app.use('/api/transactions', transactions_1.default);
app.use('/api/portfolio', portfolio_1.default);
// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Stocked backend is running.' });
});
// Start Server
async function startServer() {
    try {
        // Sync DB and Seed Mock Data
        await (0, models_1.initDb)();
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
