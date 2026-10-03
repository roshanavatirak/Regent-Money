import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private restUrl: string | null = null;
  private restToken: string | null = null;

  // L1 In-Memory Cache (Protects the 500k monthly Upstash command quota)
  private readonly l1Cache = new Map<string, CacheEntry>();
  private readonly L1_TTL_MS = 10 * 1000; // 10 seconds

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.restUrl = this.configService.get<string>('UPSTASH_REDIS_REST_URL') || null;
    this.restToken = this.configService.get<string>('UPSTASH_REDIS_REST_TOKEN') || null;

    if (this.restUrl && this.restToken) {
      this.logger.log(`[RedisService] Initialized with Upstash REST URL: ${this.restUrl}`);
      // Asynchronously verify connectivity
      this.ping().then((ok) => {
        if (ok) {
          this.logger.log('✅ [RedisService] Connected to Upstash Redis successfully.');
        } else {
          this.logger.warn('⚠️ [RedisService] Upstash Redis ping did not succeed.');
        }
      });
    } else {
      this.logger.warn('[RedisService] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not configured.');
    }

    // Clean expired L1 entries every 60s
    setInterval(() => this.cleanupL1Cache(), 60 * 1000).unref();
  }

  private cleanupL1Cache() {
    const now = Date.now();
    for (const [key, entry] of this.l1Cache.entries()) {
      if (now > entry.expiresAt) {
        this.l1Cache.delete(key);
      }
    }
  }

  /**
   * Execute an arbitrary Redis command via the Upstash REST API.
   */
  async executeCommand(commandArray: any[]): Promise<any> {
    if (!this.restUrl || !this.restToken) return null;

    try {
      const response = await fetch(this.restUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.restToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commandArray),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.warn(`[RedisService] Upstash command failed (${response.status}): ${errText}`);
        return null;
      }

      const json = await response.json();
      if (json.error) {
        this.logger.warn(`[RedisService] Upstash error: ${json.error}`);
        return null;
      }

      return json.result;
    } catch (err: any) {
      this.logger.warn(`[RedisService] Network error executing command: ${err.message}`);
      return null;
    }
  }

  /**
   * Ping Upstash Redis.
   */
  async ping(): Promise<boolean> {
    const result = await this.executeCommand(['PING']);
    return result === 'PONG';
  }

  /**
   * Get cached string value.
   * Checks L1 in-memory cache first (0 Upstash commands), then falls back to Upstash L2.
   */
  async get(key: string): Promise<string | null> {
    const now = Date.now();

    // 1. Check L1 In-Memory
    const l1Entry = this.l1Cache.get(key);
    if (l1Entry) {
      if (now < l1Entry.expiresAt) {
        return l1Entry.value;
      }
      this.l1Cache.delete(key);
    }

    // 2. Check Upstash L2
    const remoteResult = await this.executeCommand(['GET', key]);
    if (typeof remoteResult === 'string') {
      // Warm L1 in-memory cache
      this.l1Cache.set(key, {
        value: remoteResult,
        expiresAt: now + this.L1_TTL_MS,
      });
      return remoteResult;
    }

    return null;
  }

  /**
   * Store cached value with TTL in seconds (defaults to 30s).
   */
  async set(key: string, value: string, ttlSeconds: number = 30): Promise<boolean> {
    const now = Date.now();

    // 1. Set L1 cache (bounded by min of L1 TTL and requested TTL)
    const l1TtlMs = Math.min(ttlSeconds * 1000, this.L1_TTL_MS);
    this.l1Cache.set(key, {
      value,
      expiresAt: now + l1TtlMs,
    });

    // 2. Set Upstash L2
    const result = await this.executeCommand(['SET', key, value, 'EX', ttlSeconds]);
    return result === 'OK';
  }

  /**
   * Invalidate/Delete cache key immediately from both L1 and Upstash L2.
   */
  async del(key: string): Promise<boolean> {
    // 1. Delete from L1 immediately
    this.l1Cache.delete(key);

    // 2. Delete from Upstash L2
    const result = await this.executeCommand(['DEL', key]);
    return result === 1 || result === 0;
  }
}
