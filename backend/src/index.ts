import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initDb } from './models';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import stockRouter from './routes/stocks';
import priceRouter from './routes/prices';
import transactionRouter from './routes/transactions';
import portfolioRouter from './routes/portfolio';
import analyticsRouter from './routes/analytics';
import settingsRouter from './routes/settings';
import exportRouter from './routes/exports';
import { initializeAllPollers } from './services/priceFeedService';

const app = express();
const PORT = process.env.PORT || 5001;

// CORS setup
app.use(
  cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
);

// Middleware
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/stocks', stockRouter);
app.use('/api/prices', priceRouter);
app.use('/api/transactions', transactionRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/exports', exportRouter);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Stocked backend is running.' });
});

// Start Server
async function startServer() {
  try {
    // Sync DB and Seed Mock Data
    await initDb();

    // Initialize active user synchronization timers on system startup
    await initializeAllPollers();

    app.listen(PORT, () => {
      console.log(`========================================`);
      console.log(`🚀 STOCKED BACKEND SERVER RUNNING`);
      console.log(`📶 Local API: http://localhost:${PORT}`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
      console.log(`========================================`);
    });
  } catch (error) {
    console.error('Fatal error starting Stocked backend server:', error);
    process.exit(1);
  }
}

startServer();
