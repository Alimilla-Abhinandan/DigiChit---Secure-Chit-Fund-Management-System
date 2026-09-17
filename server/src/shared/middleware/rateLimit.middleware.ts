import rateLimit from 'express-rate-limit';
import { AppError } from '../errors/AppError.js';

export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    handler: (req, res, next) => {
        next(new AppError('Too many attempts from this IP, please try again after 15 minutes', 429, 'RATE_LIMIT_EXCEEDED'));
    },
    standardHeaders: true, 
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
});

export const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    handler: (req, res, next) => {
        next(new AppError('Too many requests from this IP, please try again later', 429, 'API_RATE_LIMIT_EXCEEDED'));
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
});
