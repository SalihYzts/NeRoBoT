// Idle buckets are swept out after this long so a long-running bot talking
// to many distinct users doesn't accumulate one entry per userId forever.
const IDLE_BUCKET_TTL_MS = 24 * 60 * 60 * 1000;
// Sweep is O(n) over all buckets, so it only runs every Nth call rather than
// on every message.
const SWEEP_INTERVAL_CALLS = 500;

// Per-profile rate limiter. Wrapped in a factory so each profile has its
// own buckets — otherwise the same raw userId string messaging two of
// your bot numbers would share (and drain) one throttle across both.
export function createRateLimiter(store) {
    const { state } = store;

    // buckets[userId] = { tokens: number, lastRefill: timestamp }
    const buckets = {};

    // Tracks when the last rate-limit warning was sent per user
    // so we don't spam them with warnings every single dropped message
    const lastWarnedAt = {};

    let callsSinceSweep = 0;
    function sweepIdleBuckets(now) {
        for (const userId in buckets) {
            if (now - buckets[userId].lastRefill >= IDLE_BUCKET_TTL_MS) {
                delete buckets[userId];
                delete lastWarnedAt[userId];
            }
        }
    }

    /**
     * Check if a user is allowed to send a message.
     * Uses a token bucket algorithm:
     *   - Each user starts with `rateLimitMaxTokens` tokens
     *   - Tokens refill at a rate of 1 per `rateLimitRefillMs` ms
     *   - Each message costs 1 token
     *   - If no tokens left → rate limited
     *
     * @param {string} userId
     * @returns {{ allowed: boolean, shouldWarn: boolean }}
     */
    function checkRateLimit(userId) {
        if (!state.rateLimitEnabled) return { allowed: true, shouldWarn: false };

        const now = Date.now();
        const { rateLimitMaxTokens, rateLimitRefillMs, rateLimitWarnCooldown } = state;

        if (++callsSinceSweep >= SWEEP_INTERVAL_CALLS) {
            callsSinceSweep = 0;
            sweepIdleBuckets(now);
        }

        // Init bucket for new user
        if (!buckets[userId]) {
            buckets[userId] = { tokens: rateLimitMaxTokens, lastRefill: now };
        }

        const bucket = buckets[userId];

        // Refill tokens based on elapsed time
        const elapsed = now - bucket.lastRefill;
        const refillAmount = Math.floor(elapsed / rateLimitRefillMs);
        if (refillAmount > 0) {
            bucket.tokens = Math.min(rateLimitMaxTokens, bucket.tokens + refillAmount);
            bucket.lastRefill = now;
        }

        // Check if user has a token to spend
        if (bucket.tokens > 0) {
            bucket.tokens--;
            return { allowed: true, shouldWarn: false };
        }

        // Rate limited — check if we should warn them
        const lastWarn = lastWarnedAt[userId] || 0;
        const shouldWarn = (now - lastWarn) >= rateLimitWarnCooldown;

        if (shouldWarn) {
            lastWarnedAt[userId] = now;
        }

        return { allowed: false, shouldWarn };
    }

    /**
     * Reset the bucket for a specific user (e.g. after !clear)
     */
    function resetRateLimitBucket(userId) {
        delete buckets[userId];
        delete lastWarnedAt[userId];
    }

    /**
     * Reset all buckets
     */
    function resetAllRateLimitBuckets() {
        for (const key in buckets) delete buckets[key];
        for (const key in lastWarnedAt) delete lastWarnedAt[key];
    }

    return { checkRateLimit, resetRateLimitBucket, resetAllRateLimitBuckets };
}
