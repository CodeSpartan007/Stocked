import rateLimit from 'express-rate-limit';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  message: { success: false, message: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiTestRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 test requests per minute
  message: { success: false, message: 'Rate limit exceeded for connection verification. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});
