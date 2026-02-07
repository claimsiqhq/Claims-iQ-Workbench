import type { Request, Response, NextFunction } from "express";
import { Pool } from "pg";

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
const usePostgresStore = process.env.RATE_LIMIT_STORE === "postgres" && !!process.env.DATABASE_URL;
const postgresPool = usePostgresStore ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

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

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const store = getStore(windowMs);
    const now = Date.now();
    
    // Cleanup old entries periodically
    if (Math.random() < 0.01) {
      cleanupStore(store, windowMs);
    }

    // Use IP address or user ID as key
    const key = req.userId || req.ip || "anonymous";
    const record = store[key];

    if (postgresPool) {
      try {
        const client = await postgresPool.connect();
        try {
          await client.query("BEGIN");
          const { rows } = await client.query(
            "SELECT count, reset_time FROM rate_limits WHERE key = $1 FOR UPDATE",
            [key]
          );
          const resetTime = rows[0]?.reset_time as number | undefined;
          const count = rows[0]?.count as number | undefined;

          if (!resetTime || resetTime < now) {
            await client.query(
              "INSERT INTO rate_limits (key, count, reset_time) VALUES ($1, $2, $3)\n               ON CONFLICT (key) DO UPDATE SET count = EXCLUDED.count, reset_time = EXCLUDED.reset_time",
              [key, 1, now + windowMs]
            );
          } else if (count !== undefined && count >= max) {
            const retryAfter = Math.ceil((resetTime - now) / 1000);
            await client.query("COMMIT");
            res.setHeader("Retry-After", retryAfter.toString());
            res.status(429).json({
              error: {
                code: "RATE_LIMIT_EXCEEDED",
                message,
                retryAfter,
              },
            });
            return;
          } else {
            await client.query(
              "UPDATE rate_limits SET count = count + 1 WHERE key = $1",
              [key]
            );
          }

          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }

        if (skipSuccessfulRequests) {
          res.on("finish", () => {
            if (res.statusCode < 400) {
              postgresPool
                .query("UPDATE rate_limits SET count = GREATEST(count - 1, 0) WHERE key = $1", [key])
                .catch(() => undefined);
            }
          });
        }

        return next();
      } catch (error) {
        console.error("Rate limiter postgres store error:", error);
        return next();
      }
    }

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
