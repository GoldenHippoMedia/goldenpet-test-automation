/**
 * Subscription API helpers.
 *
 * Backs the backend / round-trip assertions in the subscription specs. The
 * subscription editor (/subscription-edit) reads the account's subs from:
 *   GET /account-service/proxy/subscriptions/{accountId}   — all subs for the account
 *
 * (discovered live via the Performance API during the 2026-06-17 DOM audit — same
 * account-service/proxy + account-id shape as the Pets API.)
 *
 * AUTH NOTE — why these helpers take `page`, not `request` (identical to
 * helpers/pet-profile-api.js): Cloudflare bot protection blocks Playwright's
 * APIRequestContext (different TLS/HTTP fingerprint). Running fetch() inside the page
 * via page.evaluate() inherits the browser's already-trusted session (cookies, headers,
 * TLS), so the call passes Cloudflare. The /account-service/proxy/* endpoints also need
 * the Angular interceptor headers (x-csrf-token ← gh-token cookie, x-sid ← SessionId
 * cookie, x-locale, x-language) or they 419 — replayed here from page-context cookies.
 *
 * accountId: per-user Salesforce ID (format 001*). Read from brand.testAccountId.
 *
 * SHAPE NOTE: the write endpoints (skip / ship / update / cancel) and the subscription
 * record's exact field names are logged on first run (see logSubscriptionShape + the
 * page object's waitForSubscriptionWrite). The specs assert what the audit pinned for
 * certain — the write call returns 2xx, and active-list membership round-trips — and
 * tighten field-level backend asserts once the shape is confirmed.
 */

/**
 * Internal: run fetch() inside the page context (bypasses the Cloudflare bot challenge
 * that blocks page.request). Returns { status, body }.
 */
async function _fetchInPage(page, { url, method = 'GET', body = null } = {}) {
  return page.evaluate(async ({ url, method, body }) => {
    const readCookie = (name) => {
      const match = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(name + '='));
      return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
    };
    const ghToken = readCookie('gh-token');
    const sid = readCookie('SessionId');
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'x-locale': 'US',
      'x-language': 'en',
    };
    if (ghToken) headers['x-csrf-token'] = ghToken;
    if (sid) headers['x-sid'] = sid;

    const opts = { method, credentials: 'include', headers };
    if (body != null) opts.body = JSON.stringify(body);
    const resp = await fetch(url, opts);
    return { status: resp.status, body: await resp.text() };
  }, { url, method, body });
}

/**
 * GET all subscriptions for an account. Returns the parsed JSON (array, or an object
 * with a list field — normalized to an array by `subscriptionList`).
 */
async function fetchSubscriptions(page, { baseUrl, accountId } = {}) {
  if (!accountId) throw new Error('fetchSubscriptions: accountId is required');
  const result = await _fetchInPage(page, {
    url: `${baseUrl}/account-service/proxy/subscriptions/${accountId}`,
    method: 'GET',
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`fetchSubscriptions failed: ${result.status} ${result.body.substring(0, 300)}`);
  }
  return JSON.parse(result.body);
}

/**
 * Normalize the subscriptions GET payload to a flat array of records, regardless of
 * whether the API returns a bare array or wraps it (e.g. { subscriptions: [...] },
 * { data: [...] }, { results: [...] }). Defensive until the shape is pinned on first run.
 */
function subscriptionList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['subscriptions', 'data', 'results', 'items', 'records', 'content']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  // Fallback: first array-valued property.
  const arr = Object.values(payload).find((v) => Array.isArray(v));
  return arr || [];
}

/** Deep-search a record for the first value whose key matches `keyRx`. */
function findField(record, keyRx) {
  if (!record || typeof record !== 'object') return undefined;
  for (const [k, v] of Object.entries(record)) {
    if (keyRx.test(k) && (typeof v === 'string' || typeof v === 'number')) return v;
  }
  for (const v of Object.values(record)) {
    if (v && typeof v === 'object') {
      const hit = findField(v, keyRx);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

/** Find one subscription record in the payload by SSC number (e.g. "SSC-00035526"). */
function findBySsc(payload, ssc) {
  if (!ssc) return undefined;
  return subscriptionList(payload).find((r) => JSON.stringify(r).includes(ssc));
}

/** Find one subscription record by its Salesforce id (e.g. "a0WQL000009C76z2AC"). */
function findBySfId(payload, sfId) {
  if (!sfId) return undefined;
  return subscriptionList(payload).find((r) => JSON.stringify(r).includes(sfId));
}

/** True if a sub matching ssc/sfId is present in the ACTIVE list returned by the GET. */
function isPresent(payload, { ssc = null, sfId = null } = {}) {
  if (ssc) return !!findBySsc(payload, ssc);
  if (sfId) return !!findBySfId(payload, sfId);
  return false;
}

/**
 * One-time diagnostic: logs the subscriptions payload shape (top-level keys + the keys
 * of the first record) so the exact field names (nextOrderDate / quantity / active /
 * status …) can be pinned and the field-level backend asserts tightened. Called by the
 * specs on first run; safe to leave in (cheap, log-only).
 */
function logSubscriptionShape(payload, label = 'subscriptions') {
  try {
    const list = subscriptionList(payload);
    const top = Array.isArray(payload) ? '[array]' : Object.keys(payload || {}).join(', ');
    const first = list[0] ? Object.keys(list[0]).join(', ') : '(none)';
    console.log(`[subscription-api] ${label}: count=${list.length} topKeys=[${top}] recordKeys=[${first}]`);
  } catch (e) {
    console.log(`[subscription-api] logSubscriptionShape error: ${e.message}`);
  }
}

module.exports = {
  fetchSubscriptions,
  subscriptionList,
  findField,
  findBySsc,
  findBySfId,
  isPresent,
  logSubscriptionShape,
};
