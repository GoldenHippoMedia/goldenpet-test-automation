/**
 * Pet Profile API helpers.
 *
 * The /pets UI is backed by three endpoints (discovered live via DOM/network audit):
 *   POST  /account-service/proxy/pets/profile/{accountId}    — create
 *   PUT   /account-service/proxy/pets/profile/{petId}        — edit OR soft-delete ({active:false})
 *   GET   /account-service/proxy/pets/all/{accountId}        — list
 *
 * AUTH NOTE — why these helpers take `page`, not `request`:
 *   Cloudflare bot protection on uat-int / prod blocks Playwright's APIRequestContext
 *   (`page.request`) — different TLS/HTTP fingerprint than the real browser. The UI
 *   passes Cloudflare on login; the request context does NOT. To inherit that trusted
 *   session, we run fetch() inside the page via page.evaluate() so the call comes from
 *   the same browser tab that already passed the challenge. Cookies, headers, TLS
 *   fingerprint — all match.
 *
 * accountId: per-user Salesforce ID (format 001*). Read from brand.testAccountId.
 *
 * SOFT-DELETE WARNING: removeProfile() does PUT {active:false}, not a real DELETE.
 * Records persist in the DB; the list page just filters by active. This mirrors
 * production behavior — these helpers intentionally match what the UI does.
 */

const DEFAULT_PROFILE = {
  profileType: 'Dog',
  sex: 'Male',
  breed: 'Mixed',
  birthday: '2011-01-01',
  weight: { current: 20, ideal: null, category: null },
  healthConditions: [],
};

/**
 * Internal: run fetch() inside the page context (bypasses Cloudflare bot challenge
 * that blocks page.request). Returns { status, body }.
 *
 * The /account-service/proxy/* endpoints require headers normally added by an
 * Angular HttpClient interceptor (verified live):
 *   x-csrf-token  ← value of the `gh-token` cookie
 *   x-sid         ← value of the `SessionId` cookie
 *   x-locale      ← "US"
 *   x-language    ← "en"
 * Without them, POST/PUT return 419. We read the cookies inside page context and
 * attach the same headers, mirroring what the UI does on every request.
 */
async function _fetchInPage(page, { url, method = 'GET', body = null } = {}) {
  return page.evaluate(async ({ url, method, body }) => {
    const readCookie = (name) => {
      const match = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
      return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
    };
    const ghToken  = readCookie('gh-token');
    const sid      = readCookie('SessionId');
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'x-locale': 'US',
      'x-language': 'en',
    };
    if (ghToken) headers['x-csrf-token'] = ghToken;
    if (sid)     headers['x-sid']        = sid;

    const opts = { method, credentials: 'include', headers };
    if (body != null) opts.body = JSON.stringify(body);
    const resp = await fetch(url, opts);
    return { status: resp.status, body: await resp.text() };
  }, { url, method, body });
}

/**
 * Create a pet profile via the API.
 * @returns {Promise<{id: string, name: string, [key: string]: any}>}
 */
async function createPetProfile(page, { baseUrl, accountId, name, overrides = {} } = {}) {
  if (!accountId) throw new Error('createPetProfile: accountId is required');
  if (!name)      throw new Error('createPetProfile: name is required');

  const payload = { ...DEFAULT_PROFILE, ...overrides, name };
  const result = await _fetchInPage(page, {
    url: `${baseUrl}/account-service/proxy/pets/profile/${accountId}`,
    method: 'POST',
    body: payload,
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`createPetProfile failed: ${result.status} ${result.body.substring(0, 300)}`);
  }
  return JSON.parse(result.body);
}

/**
 * Soft-delete a pet profile via the API (PUT {id, active:false}).
 * Non-throwing — afterEach teardown shouldn't mask the underlying test failure.
 */
async function removePetProfile(page, { baseUrl, petId } = {}) {
  if (!petId) return;
  try {
    const result = await _fetchInPage(page, {
      url: `${baseUrl}/account-service/proxy/pets/profile/${petId}`,
      method: 'PUT',
      body: { id: petId, active: false },
    });
    if (result.status < 200 || result.status >= 300) {
      console.warn(`removePetProfile cleanup: PUT ${petId} returned ${result.status}`);
    }
  } catch (e) {
    console.warn(`removePetProfile cleanup error for ${petId}:`, e.message);
  }
}

/**
 * GET the list of active pet profiles for an account.
 */
async function listPetProfiles(page, { baseUrl, accountId } = {}) {
  const result = await _fetchInPage(page, {
    url: `${baseUrl}/account-service/proxy/pets/all/${accountId}`,
    method: 'GET',
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`listPetProfiles failed: ${result.status} ${result.body.substring(0, 300)}`);
  }
  return JSON.parse(result.body);
}

/**
 * Generate a unique pet name so re-runs don't collide on the shared test account.
 * Format: PetProfile-<timestamp>-<rand> (timestamp helps spot stragglers in the DB).
 */
function uniquePetName(prefix = 'PetProfile') {
  const stamp = Date.now().toString(36);
  const rand  = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${stamp}-${rand}`;
}

module.exports = {
  createPetProfile,
  removePetProfile,
  listPetProfiles,
  uniquePetName,
};
