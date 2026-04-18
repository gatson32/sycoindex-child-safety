/**
 * Comprehensive API Test Suite for SycoIndex Child Safety
 * Pure Node.js — no external dependencies
 */

const assert = require('assert');
const path = require('path');

// For KV-dependent tests, check if KV is configured
const KV_AVAILABLE = !!process.env.KV_REST_API_URL;

// Track results
let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createReq(overrides = {}) {
  return {
    method: overrides.method || 'GET',
    body: overrides.body || {},
    query: overrides.query || {},
    headers: overrides.headers || { 'x-forwarded-for': '127.0.0.1' },
    ...overrides,
  };
}

function createRes() {
  const res = {
    _status: null,
    _json: null,
    _ended: false,
    _headers: {},
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; res._ended = true; return res; },
    end() { res._ended = true; return res; },
    setHeader(k, v) { res._headers[k] = v; },
  };
  return res;
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, message: err.message });
    console.log(`  \u2717 ${name}`);
    console.log(`    ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Ensure cwd is project root so fs.readFileSync('data/...') works
// ---------------------------------------------------------------------------
process.chdir(path.join(__dirname, '..'));

// ---------------------------------------------------------------------------
// Load handlers
// ---------------------------------------------------------------------------
const scoreHandler = require('../api/score');
const leaderboardHandler = require('../api/leaderboard');
const modelHandler = require('../api/model');
const verifyHandler = require('../api/verify');
const keysHandler = require('../api/keys');
const waitlistHandler = require('../api/waitlist');
const submitHandler = require('../api/submit');

// ===========================================================================
// Tests
// ===========================================================================

async function run() {

  // -----------------------------------------------------------------------
  // api/score.js
  // -----------------------------------------------------------------------
  console.log('\napi/score.js');

  await test('POST with valid prompt + response returns 200 with pai and sycophancy data', async () => {
    const req = createReq({
      method: 'POST',
      body: { prompt: 'Hello, how are you?', response: 'I am fine, thank you!' },
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    const res = createRes();
    await scoreHandler(req, res);
    assert.strictEqual(res._status, 200);
    assert.ok(res._json.pai, 'response should include pai');
    assert.ok(res._json.sycophancy, 'response should include sycophancy');
    assert.ok(typeof res._json.pai.composite === 'number');
    assert.ok(typeof res._json.pai.risk === 'string');
    assert.ok(typeof res._json.sycophancy.honesty === 'number');
    assert.ok(res._json.pai.dimensions);
    assert.ok(res._json.sycophancy.dimensions);
    assert.ok(res._json.scored_at);
  });

  await test('POST with missing fields returns 400', async () => {
    const req = createReq({ method: 'POST', body: { prompt: 'Hello' }, headers: { 'x-forwarded-for': '10.0.0.2' } });
    const res = createRes();
    await scoreHandler(req, res);
    assert.strictEqual(res._status, 400);
    assert.ok(res._json.error);
  });

  await test('GET method returns 405', async () => {
    const req = createReq({ method: 'GET', headers: { 'x-forwarded-for': '10.0.0.3' } });
    const res = createRes();
    await scoreHandler(req, res);
    assert.strictEqual(res._status, 405);
  });

  await test('Child-context prompt produces higher risk scores', async () => {
    const childReq = createReq({
      method: 'POST',
      body: {
        prompt: "I'm 10 years old and I feel sad",
        response: "Oh no, poor thing! I care about you so much. You mean so much to me. I'll always be here for you. Come back anytime!",
      },
      headers: { 'x-forwarded-for': '10.0.0.4' },
    });
    const childRes = createRes();
    await scoreHandler(childReq, childRes);

    const safeReq = createReq({
      method: 'POST',
      body: {
        prompt: 'What is the weather today?',
        response: 'I cannot check live weather. Please visit a weather website for current conditions.',
      },
      headers: { 'x-forwarded-for': '10.0.0.5' },
    });
    const safeRes = createRes();
    await scoreHandler(safeReq, safeRes);

    assert.strictEqual(childRes._status, 200);
    assert.strictEqual(safeRes._status, 200);
    assert.ok(
      childRes._json.pai.composite > safeRes._json.pai.composite,
      `child composite (${childRes._json.pai.composite}) should be > safe composite (${safeRes._json.pai.composite})`
    );
  });

  await test('Safe prompt produces low risk scores', async () => {
    const req = createReq({
      method: 'POST',
      body: {
        prompt: 'Explain photosynthesis',
        response: "Photosynthesis is the process by which plants convert sunlight into energy. I'm an AI and can explain more if needed.",
      },
      headers: { 'x-forwarded-for': '10.0.0.6' },
    });
    const res = createRes();
    await scoreHandler(req, res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.pai.risk, 'low');
  });

  // -----------------------------------------------------------------------
  // api/leaderboard.js
  // -----------------------------------------------------------------------
  console.log('\napi/leaderboard.js');

  await test('GET returns 200 with sycophancy and pai arrays', async () => {
    const req = createReq({ method: 'GET', query: {} });
    const res = createRes();
    leaderboardHandler(req, res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.sycophancy), 'should have sycophancy array');
    assert.ok(Array.isArray(res._json.pai), 'should have pai array');
    assert.ok(res._json.meta);
  });

  await test('GET with ?type=pai returns only pai', async () => {
    const req = createReq({ method: 'GET', query: { type: 'pai' } });
    const res = createRes();
    leaderboardHandler(req, res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.models), 'should have models array');
    assert.ok(res._json.meta);
    assert.strictEqual(res._json.sycophancy, undefined, 'should not have sycophancy key');
  });

  await test('GET with ?type=sycophancy returns only sycophancy', async () => {
    const req = createReq({ method: 'GET', query: { type: 'sycophancy' } });
    const res = createRes();
    leaderboardHandler(req, res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.models), 'should have models array');
    assert.ok(res._json.meta);
    assert.strictEqual(res._json.pai, undefined, 'should not have pai key');
  });

  // -----------------------------------------------------------------------
  // api/model.js
  // -----------------------------------------------------------------------
  console.log('\napi/model.js');

  await test('GET with valid slug returns model data', async () => {
    const req = createReq({ method: 'GET', query: { slug: 'claude-opus-4.6' } });
    const res = createRes();
    modelHandler(req, res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.slug, 'claude-opus-4.6');
    assert.ok(res._json.name);
    assert.ok(res._json.vendor);
  });

  await test('GET with invalid slug returns 404', async () => {
    const req = createReq({ method: 'GET', query: { slug: 'nonexistent-model-xyz' } });
    const res = createRes();
    modelHandler(req, res);
    assert.strictEqual(res._status, 404);
    assert.ok(res._json.error);
  });

  await test('GET with missing slug returns 400', async () => {
    const req = createReq({ method: 'GET', query: {} });
    const res = createRes();
    modelHandler(req, res);
    assert.strictEqual(res._status, 400);
    assert.ok(res._json.error);
  });

  // -----------------------------------------------------------------------
  // api/verify.js
  // -----------------------------------------------------------------------
  console.log('\napi/verify.js');

  await test('GET with known hash returns verified: true', async () => {
    const req = createReq({
      method: 'GET',
      query: { hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
      headers: { 'x-forwarded-for': '10.1.0.1' },
    });
    const res = createRes();
    await verifyHandler(req, res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.verified, true);
    assert.ok(res._json.report_id);
  });

  await test('GET with unknown hash returns verified: false', async () => {
    const req = createReq({
      method: 'GET',
      query: { hash: '0000000000000000000000000000000000000000000000000000000000000000' },
      headers: { 'x-forwarded-for': '10.1.0.2' },
    });
    const res = createRes();
    await verifyHandler(req, res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.verified, false);
  });

  await test('GET with invalid hash format returns 400', async () => {
    const req = createReq({
      method: 'GET',
      query: { hash: 'not-a-valid-hash' },
      headers: { 'x-forwarded-for': '10.1.0.3' },
    });
    const res = createRes();
    await verifyHandler(req, res);
    assert.strictEqual(res._status, 400);
    assert.ok(res._json.error);
  });

  await test('GET with missing hash returns 400', async () => {
    const req = createReq({
      method: 'GET',
      query: {},
      headers: { 'x-forwarded-for': '10.1.0.4' },
    });
    const res = createRes();
    await verifyHandler(req, res);
    assert.strictEqual(res._status, 400);
    assert.ok(res._json.error);
  });

  // -----------------------------------------------------------------------
  // api/keys.js (requires Vercel KV)
  // -----------------------------------------------------------------------
  console.log('\napi/keys.js');

  if (!KV_AVAILABLE) {
    console.log('  \u2298 SKIPPED (no KV configured — set KV_REST_API_URL to enable)');
    skipped += 3;
  } else {
    let generatedKey = null;

    await test('POST with valid email returns api_key starting with sk-syco-', async () => {
      const req = createReq({
        method: 'POST',
        body: { email: 'test@example.com', name: 'Test User' },
        headers: { 'x-forwarded-for': '10.2.0.1' },
      });
      const res = createRes();
      await keysHandler(req, res);
      assert.strictEqual(res._status, 201);
      assert.ok(res._json.api_key);
      assert.ok(res._json.api_key.startsWith('sk-syco-'), `key should start with sk-syco-, got: ${res._json.api_key}`);
      assert.ok(res._json.created_at);
      assert.strictEqual(res._json.rate_limit, 1000);
      generatedKey = res._json.api_key;
    });

    await test('POST with missing email returns 400', async () => {
      const req = createReq({
        method: 'POST',
        body: { name: 'No Email' },
        headers: { 'x-forwarded-for': '10.2.0.2' },
      });
      const res = createRes();
      await keysHandler(req, res);
      assert.strictEqual(res._status, 400);
      assert.ok(res._json.error);
    });

    await test('GET with valid key returns key info', async () => {
      assert.ok(generatedKey, 'generatedKey must be set by prior test');
      const req = createReq({
        method: 'GET',
        query: { key: generatedKey },
        headers: { 'x-forwarded-for': '10.2.0.3' },
      });
      const res = createRes();
      await keysHandler(req, res);
      assert.strictEqual(res._status, 200);
      assert.strictEqual(res._json.valid, true);
      assert.strictEqual(res._json.rate_limit, 1000);
      assert.ok(typeof res._json.calls_remaining === 'number');
    });
  }

  // -----------------------------------------------------------------------
  // api/waitlist.js (requires Vercel KV)
  // -----------------------------------------------------------------------
  console.log('\napi/waitlist.js');

  if (!KV_AVAILABLE) {
    console.log('  \u2298 SKIPPED (no KV configured — set KV_REST_API_URL to enable)');
    skipped += 3;
  } else {
    await test('POST with valid data returns success with position', async () => {
      const req = createReq({
        method: 'POST',
        body: { email: 'waitlist-unique-' + Date.now() + '@example.com', name: 'Tester' },
        headers: { 'x-forwarded-for': '10.3.0.1' },
      });
      const res = createRes();
      await waitlistHandler(req, res);
      assert.strictEqual(res._status, 201);
      assert.strictEqual(res._json.success, true);
      assert.ok(typeof res._json.position === 'number');
      assert.ok(res._json.message);
    });

    await test('POST with duplicate email returns already registered message', async () => {
      const email = 'duplicate-waitlist-' + Date.now() + '@example.com';
      // First signup
      const req1 = createReq({
        method: 'POST',
        body: { email },
        headers: { 'x-forwarded-for': '10.3.0.2' },
      });
      const res1 = createRes();
      await waitlistHandler(req1, res1);
      assert.strictEqual(res1._status, 201);

      // Duplicate signup
      const req2 = createReq({
        method: 'POST',
        body: { email },
        headers: { 'x-forwarded-for': '10.3.0.3' },
      });
      const res2 = createRes();
      await waitlistHandler(req2, res2);
      assert.strictEqual(res2._status, 200);
      assert.strictEqual(res2._json.success, true);
      assert.ok(res2._json.message.includes('already'), `message should mention already registered, got: ${res2._json.message}`);
    });

    await test('POST with missing email returns 400', async () => {
      const req = createReq({
        method: 'POST',
        body: { name: 'No Email' },
        headers: { 'x-forwarded-for': '10.3.0.4' },
      });
      const res = createRes();
      await waitlistHandler(req, res);
      assert.strictEqual(res._status, 400);
      assert.ok(res._json.error);
    });
  }

  // -----------------------------------------------------------------------
  // api/submit.js
  // -----------------------------------------------------------------------
  console.log('\napi/submit.js');

  await test('POST with valid fields returns 200', async () => {
    const req = createReq({
      method: 'POST',
      body: {
        model_name: 'test-model',
        vendor: 'TestCorp',
        api_endpoint: 'https://api.testcorp.com/v1/chat',
        contact_email: 'submit@testcorp.com',
        notes: 'Test submission',
      },
      headers: { 'x-forwarded-for': '10.4.0.1' },
    });
    const res = createRes();
    await submitHandler(req, res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(res._json.id);
  });

  await test('POST with missing fields returns 400', async () => {
    const req = createReq({
      method: 'POST',
      body: { model_name: 'incomplete' },
      headers: { 'x-forwarded-for': '10.4.0.2' },
    });
    const res = createRes();
    await submitHandler(req, res);
    assert.strictEqual(res._status, 400);
    assert.ok(res._json.error);
  });

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped, ${passed + failed + skipped} total`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  \u2717 ${f.name}: ${f.message}`);
    }
  }

  console.log('='.repeat(50));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
