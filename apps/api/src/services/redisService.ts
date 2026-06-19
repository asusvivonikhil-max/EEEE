import Redis from 'ioredis';
import { config } from '../config/env';

interface IRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<any>;
  del(key: string): Promise<number>;
}

class MockRedisClient implements IRedisClient {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string): Promise<any> {
    this.store.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const exists = this.store.has(key);
    if (exists) {
      this.store.delete(key);
      return 1;
    }
    return 0;
  }
}

class RedisService implements IRedisClient {
  private client: IRedisClient;

  constructor() {
    this.client = new MockRedisClient();
  }

  setClient(client: IRedisClient) {
    this.client = client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string): Promise<any> {
    return this.client.set(key, value);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }
}

export const redis = new RedisService();

if (config.db.redisUri) {
  try {
    console.log('🔌 Connecting to Redis instance...');
    const realRedis = new Redis(config.db.redisUri, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });

    realRedis.on('connect', () => {
      console.log('✅ Successfully connected to Upstash Cloud Redis!');
      redis.setClient(realRedis);
    });

    realRedis.on('error', (err) => {
      console.warn('⚠️ Redis Error event. Operating on local memory store.', err.message);
    });
  } catch (err: any) {
    console.warn('⚠️ Failed to initialize Redis client. Falling back to Mock in-memory store.', err.message);
  }
} else {
  console.log('ℹ️ No REDIS_URI provided. Using Mock in-memory store for Caching.');
}
