import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

/**
 * Request ID middleware - adds unique request ID to each request
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.headers["x-request-id"] as string || uuidv4();
  req.headers["x-request-id"] = requestId;
  res.setHeader("X-Request-ID", requestId);
  
  // Attach to request object for logging
  (req as any).requestId = requestId;
  
  next();
}

/**
 * Structured logging middleware
 */
export function loggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  const requestId = (req as any).requestId || uuidv4();
  const userId = (req as any).userId || "anonymous";
  
  // Log request
  console.log(JSON.stringify({
    level: "info",
    requestId,
    userId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    timestamp: new Date().toISOString(),
    type: "request_start",
  }));
  
  // Log response when finished
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 400 ? "error" : "info";
    
    console.log(JSON.stringify({
      level: logLevel,
      requestId,
      userId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      timestamp: new Date().toISOString(),
      type: "request_end",
    }));
  });
  
  next();
}
