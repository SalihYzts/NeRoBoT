import { state } from './config.js';

// ============================
// Per-user token bucket state
// ============================
// buckets[userId] = { tokens: number, lastRefill: timestamp }
const buckets = {};

// Tracks when the last rate-limit warning was sent per user
// so we don't spam them with warnings every single dropped message
const lastWarnedAt = {};

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
export function checkRateLimit(userId) {
    if (!state.rateLimitEnabled) return { allowed: true, shouldWarn: false };

    const now = Date.now();
    const { rateLimitMaxTokens, rateLimitRefillMs, rateLimitWarnCooldown } = state;

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
export function resetRateLimitBucket(userId) {
    delete buckets[userId];
    delete lastWarnedAt[userId];
}

/**
 * Reset all buckets
 */
export function resetAllRateLimitBuckets() {
    for (const key in buckets) delete buckets[key];
    for (const key in lastWarnedAt) delete lastWarnedAt[key];
}