import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../supabase";

/**
 * Extended Request type with user information
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: {
        id: string;
        email?: string;
      };
    }
  }
}

/**
 * Authentication middleware
 * Validates Supabase JWT token and attaches user to request
 */
export async function authenticateRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip auth for health check endpoints
  if (
    req.path === "/api/health" ||
    (req.path === "/api/session" && req.method === "GET")
  ) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const tokenFromQuery = typeof req.query.token === "string" ? req.query.token : undefined;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : tokenFromQuery;

  if (!token) {
    // If no auth header and Supabase is not configured, allow through (dev mode)
    if (!supabaseAdmin) {
      req.userId = "system";
      req.user = { id: "system" };
      return next();
    }

    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  }

  if (!supabaseAdmin) {
    // Fallback for development when Supabase is not configured
    req.userId = "system";
    req.user = { id: "system" };
    return next();
  }

  try {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid or expired token",
        },
      });
    }

    req.userId = user.id;
    req.user = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      error: {
        code: "AUTH_ERROR",
        message: "Authentication error",
      },
    });
  }
}

/**
 * Optional authentication middleware
 * Attaches user if token is present, but doesn't require it
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ") && supabaseAdmin) {
    const token = authHeader.substring(7);
    try {
      const {
        data: { user },
      } = await supabaseAdmin.auth.getUser(token);

      if (user) {
        req.userId = user.id;
        req.user = {
          id: user.id,
          email: user.email,
        };
      }
    } catch (error) {
      // Silently fail for optional auth
      console.warn("Optional auth failed:", error);
    }
  }

  // Default to system user if no auth
  if (!req.userId) {
    req.userId = "system";
    req.user = { id: "system" };
  }

  next();
}
