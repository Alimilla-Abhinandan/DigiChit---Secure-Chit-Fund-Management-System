import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authRoutes } from '@modules/auth/index.js';
import { kycRoutes } from '@modules/kyc/index.js';
import { adminRoutes } from '@modules/admin/index.js';
import { userRoutes, initInactivityCron } from '@modules/user/index.js';
import { organizerRoutes } from '@modules/organizer/index.js';
import { supportRoutes } from '@modules/support/index.js';
import { chitGroupRoutes } from '@modules/chit-group/index.js';
import { chitCycleRoutes } from '@modules/chit-cycle/index.js';
import { auctionRoutes } from '@modules/auction/index.js';
import { bidRoutes } from '@modules/bid/index.js';
import { installmentRoutes } from '@modules/installment/index.js';
import { chitMessageRoutes } from '@modules/chit-message/index.js';
import { membershipRoutes } from '@modules/membership/index.js';
import { transactionRoutes, initPaymentEventListeners } from '@modules/payment/index.js';
import { collectionRoutes } from '@modules/collection/index.js';
import { ledgerRoutes, initLedgerEventListeners } from '@modules/ledger/index.js';
import { statementRoutes } from '@modules/statement/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { globalErrorHandler } from '@shared/errors/GlobalErrorHandler.js';
import { apiRateLimiter } from '@shared/middleware/rateLimit.middleware.js';
import { AppError } from '@shared/errors/AppError.js';
import { config } from '@shared/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Initialize Cron Jobs & Domain Event Listeners
initInactivityCron();
initPaymentEventListeners();
initLedgerEventListeners();

// Security Middlewares
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
})); // Basic security headers with CORP allowed for static uploads
app.use(cors({
    origin: config.frontendUrl,
    credentials: true
}));

// Body limit to prevent DDoS and capture rawBody Buffer for webhook signature verification
app.use(express.json({
    limit: '10kb',
    verify: (req: any, _res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));


// Apply general API rate limiting
app.use('/api', apiRateLimiter);

// Silence favicon requests
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/organizer', organizerRoutes);
app.use('/api/contact', supportRoutes);
app.use('/api/chit-groups', chitGroupRoutes);
app.use('/api/chit-cycles', chitCycleRoutes);
app.use('/api/chit-cycles', collectionRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/installments', installmentRoutes);
app.use('/api/chit-messages', chitMessageRoutes);
app.use('/api/memberships', membershipRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/statements', statementRoutes);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ success: true, message: 'DigiChit API is running' });
});

// 404 handler - matches any request that hasn't been handled yet
app.use((req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404, 'ROUTE_NOT_FOUND'));
});

// Global Error Handler
app.use(globalErrorHandler);

export default app;
