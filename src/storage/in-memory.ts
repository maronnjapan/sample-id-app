import { Redis, SetCommandOptions } from "@upstash/redis";

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export const InMemoryDB = {
    async get(key: string): Promise<string | null> {
        return await redis.get(key)
    },
    async set(key: string, value: string, opts?: SetCommandOptions): Promise<void> {

        await redis.set(key, value, { ex: 60 * 5 });

    },
    async del(key: string): Promise<void> {
        await redis.del(key);
    },
    async exists(key: string): Promise<boolean> {
        const result = await redis.exists(key);
        return result > 0;
    }
};