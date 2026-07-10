export interface RateLimiter {
  isRateLimited(key: string, limit: number, windowMs: number): Promise<boolean>;
}

export class InMemoryRateLimiter implements RateLimiter {
  private tracker = new Map<string, { count: number; expiresAt: number }>();

  async isRateLimited(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const entry = this.tracker.get(key);

    if (!entry || now > entry.expiresAt) {
      this.tracker.set(key, { count: 1, expiresAt: now + windowMs });
      return false;
    }

    if (entry.count >= limit) {
      return true;
    }

    entry.count += 1;
    return false;
  }
}

const localRateLimiter = new InMemoryRateLimiter();

export const rateLimiter: RateLimiter = {
  async isRateLimited(key: string, limit: number, windowMs: number): Promise<boolean> {
    // Encapsulated behind a reusable interface.
    // In local development, it runs the in-memory limiter.
    // In production, this can be swapped with Redis / Upstash without changing caller code.
    return localRateLimiter.isRateLimited(key, limit, windowMs);
  }
};
