import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  check(key: string, maxRequests: number, windowMs: number, message: string): void {
    const now = Date.now();
    const cutoff = now - windowMs;
    const recent = (this.hits.get(key) || []).filter((ts) => ts > cutoff);
    if (recent.length >= maxRequests) {
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.hits.set(key, recent);

    if (this.hits.size > 5000) {
      for (const [k, timestamps] of this.hits.entries()) {
        if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= cutoff) {
          this.hits.delete(k);
        }
      }
    }
  }
}

export function extractClientIp(req: Request): string {
  return (req.ip || req.socket?.remoteAddress || 'unknown').trim();
}
