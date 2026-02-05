import type { Request, Response, NextFunction } from "express";

/**
 * Simple in-memory rate limiter
 * For production, use redis-based rate limiting (e.g., express-rate-limit with Redis store)
 */
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const stores: Map<string, RateLimitStore> = new Map();

function getStore(windowMs: number): RateLimitStore {
  const key = `window-${windowMs}`;
  if (!stores.has(key)) {
    stores.set(key, {});
  }
  return stores.get(key)!;
}

function cleanupStore(store: RateLimitStore, windowMs: number): void {
  const now = Date.now();
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  }
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
}) {
  const { windowMs, max, message = "Too many requests, please try again later", skipSuccessfulRequests = false } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const store = getStore(windowMs);
    const now = Date.now();
    
    // Cleanup old entries periodically
    if (Math.random() < 0.01) {
      cleanupStore(store, windowMs);
    }

    // Use IP address or user ID as key
    const key = req.userId || req.ip || "anonymous";
    const record = store[key];

    if (!record || record.resetTime < now) {
      // Create new record
      store[key] = {
        count: 1,
        resetTime: now + windowMs,
      };
      return next();
    }

    if (record.count >= max) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader("Retry-After", retryAfter.toString());
      return res.status(429).json({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message,
          retryAfter,
        },
      });
    }

    record.count++;

    // Track response status if needed
    if (skipSuccessfulRequests) {
      const originalSend = res.send;
      res.send = function (body) {
        if (res.statusCode < 400) {
          record.count = Math.max(0, record.count - 1);
        }
        return originalSend.call(this, body);
      };
    }

    next();
  };
}

// Pre-configured rate limiters
export const uploadLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 uploads per window
  message: "Too many uploads, please try again later",
});

export const auditLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 audit logs per minute
  message: "Too many audit log requests",
});

export const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute
  message: "Too many API requests, please try again later",
});

export const validationLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 validations per minute
  message: "Too many validation requests, please try again later",
});
