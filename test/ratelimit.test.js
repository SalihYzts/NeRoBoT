// Token-bucket hız sınırlayıcı — saati elle ilerleterek (Date.now taklidi)
// gerçek beklemeden test edilir.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/ratelimit.js';

const realNow = Date.now;
let clock = 0;
afterEach(() => { Date.now = realNow; });

function limiter(overrides = {}) {
    clock = 1_000_000;
    Date.now = () => clock;
    const state = {
        rateLimitEnabled: true, rateLimitMaxTokens: 2, rateLimitRefillMs: 10_000,
        rateLimitWarnCooldown: 0, ...overrides,
    };
    return { state, rl: createRateLimiter({ state }) };
}

describe('ratelimit', () => {
    test('kısmi aralık kaybolmaz — yapılandırılan hızda dolar', async () => {
        const { rl } = limiter({ rateLimitMaxTokens: 3 });
        for (let i = 0; i < 3; i++) assert.equal((await rl.checkRateLimit('u')).allowed, true);
        assert.equal((await rl.checkRateLimit('u')).allowed, false);
        clock += 15_000; // 1.5 aralık → 1 jeton, 0.5 aralık birikmiş kalmalı
        assert.equal((await rl.checkRateLimit('u')).allowed, true);
        assert.equal((await rl.checkRateLimit('u')).allowed, false);
        clock += 5_000;  // biriken 0.5 + 0.5 = tam bir aralık daha
        assert.equal((await rl.checkRateLimit('u')).allowed, true);
    });

    test('üst sınır düşürülünce eski fazlalık kullanılamaz', async () => {
        const { state, rl } = limiter({ rateLimitMaxTokens: 5 });
        await rl.checkRateLimit('u');           // kova 5 ile açıldı, 4 kaldı
        state.rateLimitMaxTokens = 1;
        assert.equal((await rl.checkRateLimit('u')).allowed, true);
        assert.equal((await rl.checkRateLimit('u')).allowed, false);
    });

    test('kapalıyken her şey geçer', async () => {
        const { rl } = limiter({ rateLimitEnabled: false, rateLimitMaxTokens: 0 });
        assert.equal((await rl.checkRateLimit('u')).allowed, true);
    });
});
