import type { Request, Response, NextFunction } from "express";

interface PerformanceMetrics {
  requestCount: number;
  errorCount: number;
  avgResponseTime: number;
  requestsPerEndpoint: Map<string, number>;
  responseTimesByEndpoint: Map<string, number[]>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    requestCount: 0,
    errorCount: 0,
    avgResponseTime: 0,
    requestsPerEndpoint: new Map(),
    responseTimesByEndpoint: new Map(),
  };

  private responseTimes: number[] = [];
  private readonly maxSamples = 1000;

  recordRequest(endpoint: string, duration: number, isError: boolean) {
    this.metrics.requestCount++;
    
    if (isError) {
      this.metrics.errorCount++;
    }

    this.responseTimes.push(duration);
    if (this.responseTimes.length > this.maxSamples) {
      this.responseTimes.shift();
    }
    
    this.metrics.avgResponseTime = 
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;

    const endpointCount = this.metrics.requestsPerEndpoint.get(endpoint) || 0;
    this.metrics.requestsPerEndpoint.set(endpoint, endpointCount + 1);

    const endpointTimes = this.metrics.responseTimesByEndpoint.get(endpoint) || [];
    endpointTimes.push(duration);
    if (endpointTimes.length > 100) {
      endpointTimes.shift();
    }
    this.metrics.responseTimesByEndpoint.set(endpoint, endpointTimes);
  }

  getMetrics() {
    const endpointStats: Record<string, { count: number; avgTime: number }> = {};
    
    for (const [endpoint, count] of this.metrics.requestsPerEndpoint) {
      const times = this.metrics.responseTimesByEndpoint.get(endpoint) || [];
      const avgTime = times.length > 0 
        ? times.reduce((a, b) => a + b, 0) / times.length 
        : 0;
      endpointStats[endpoint] = { count, avgTime };
    }

    return {
      totalRequests: this.metrics.requestCount,
      totalErrors: this.metrics.errorCount,
      errorRate: this.metrics.requestCount > 0 
        ? (this.metrics.errorCount / this.metrics.requestCount) * 100 
        : 0,
      avgResponseTime: this.metrics.avgResponseTime,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      endpointStats,
    };
  }

  reset() {
    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      avgResponseTime: 0,
      requestsPerEndpoint: new Map(),
      responseTimesByEndpoint: new Map(),
    };
    this.responseTimes = [];
  }
}

export const performanceMonitor = new PerformanceMonitor();

export function performanceMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    const isError = res.statusCode >= 400;
    const endpoint = `${req.method} ${req.route?.path || req.path}`;
    
    performanceMonitor.recordRequest(endpoint, duration, isError);
  });
  
  next();
}
