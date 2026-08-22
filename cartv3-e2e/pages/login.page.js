const { BasePage } = require('./base.page');

class LoginPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    // --- Locators ---
    this.emailInput = page.locator('gh-input.email-input input');
    this.passwordInput = page.locator('gh-input.password-input input');
    this.submitButton = page.locator('[data-qa="login-btn"]');
    this.forgotPasswordLink = page.locator('.login__forgotPassword');
    this.errorToastMessage = page.locator('[data-qa="toast-message"]');
  }

  // --- Actions ---

  async goto() {
    await this.navigate('login');
  }

  /**
   * Fill credentials and submit. Waits for redirect to /my-account.
   * Use loginAndWait() if you need a custom redirect URL (e.g. /cart).
   */
  async login(email, password) {
    await this.loginAndWait(email, password, /my-account/);
  }

  /**
   * Observed login-form state. Lengths only — never log credential values.
   * A length of -1 means the read itself failed (detached node / strict-mode violation),
   * which is a different problem from the form being cleared.
   */
  async readFormState() {
    const [email, pass, disabled] = await Promise.all([
      this.emailInput.inputValue().catch(() => null),
      this.passwordInput.inputValue().catch(() => null),
      this.submitButton.isDisabled().catch(() => null),
    ]);
    return {
      emailLen: email === null ? -1 : email.length,
      passLen: pass === null ? -1 : pass.length,
      submitDisabled: disabled,
    };
  }

  /**
   * Fill the credentials, refilling if the form ate them.
   *
   * The Angular login form can still be hydrating / re-mounting when we start typing,
   * which WIPES the entered values. The submit button then stays disabled forever and
   * the spec dies with a bare 90s timeout sitting on /login with two empty inputs
   * (drmarty prod 2026-08-19, auth-empty-cart-login-redirect).
   *
   * Recovery is deliberately BEST-EFFORT: after the last attempt we fall through and let
   * the caller submit anyway, so a false "didn't stick" reading can't turn a passing login
   * into a failing one. Never `throw` from here — this is on the critical path of nearly
   * every logged-in spec.
   *
   * Scope note: this only guarantees the values were present WHEN READ. The form can still
   * re-mount afterwards, during the click — see `submitAndWait()`, which owns that race.
   * Do not add button-enabled polling here; the enable check belongs next to the click so
   * the two can be retried together.
   */
  async fillCredentials(email, password) {
    const user = email || this.brand.email;
    const pass = password || this.brand.password;
    const ATTEMPTS = 3;

    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      await this.emailInput.waitFor({ state: 'visible' });

      // pressSequentially, NOT fill(). fill() sets the value and dispatches one `input`
      // event, which the `gh-input` custom-element wrapper can miss — Angular's value
      // accessor never runs, so the form model stays invalid and `login-btn` stays DISABLED
      // even though inputValue() reads the text back correctly. Exact symptom seen on
      // drmarty prod 2026-08-19: `email chars=22, password chars=10, submit disabled=true`
      // with NO .invalid-message anywhere. Same class as the documented Braintree fix
      // ("Submit Order stays disabled after CC fill → Braintree needs keydown"); real
      // keystrokes guarantee the accessor fires. Costs ~0.5s per login.
      await this.emailInput.fill('');
      await this.emailInput.pressSequentially(user, { delay: 15 });
      await this.emailInput.press('Tab');
      await this.passwordInput.fill('');
      await this.passwordInput.pressSequentially(pass, { delay: 15 });
      await this.passwordInput.press('Tab');

      // Let a pending re-mount surface before reading the form back.
      await this.page.waitForTimeout(500);
      const state = await this.readFormState();
      if (state.emailLen === user.length && state.passLen === pass.length) return;

      console.log(
        `[login] typed credentials did not read back (attempt ${attempt}/${ATTEMPTS}) — ` +
        `email chars=${state.emailLen}/${user.length}, password chars=${state.passLen}/${pass.length}, ` +
        `submit disabled=${state.submitDisabled} — refilling`
      );
      await this.page.waitForTimeout(1000);
    }

    console.log(
      `[login] credentials still did not read back after ${ATTEMPTS} attempts — submitting ` +
      `anyway. If login fails from here, the form genuinely never accepted the credentials.`
    );
  }

  /** Poll until the submit button is enabled. Returns false on timeout (never throws). */
  async _waitForSubmitEnabled(timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await this.submitButton.isEnabled().catch(() => false)) return true;
      await this.page.waitForTimeout(200);
    }
    return false;
  }

  /** True while the browser is still sitting on a login page. */
  _onLoginPage() {
    return /\/login/.test(this.page.url());
  }

  /**
   * Fill credentials and submit, then wait for a custom URL pattern.
   * Use this when login redirects somewhere other than /my-account
   * (e.g. logging in from the cart page redirects back to /cart).
   *
   * fill → enable-check → click → navigate is retried AS ONE UNIT, because the Angular form
   * can re-mount in the gap between any two of those steps. Observed on badlands UAT
   * 2026-08-19: the values read back fine, then the form re-mounted DURING the click
   * (`element was detached from the DOM, retrying`), leaving a permanently disabled button
   * that `click()`'s auto-wait chewed on for the entire 90s test timeout.
   *
   * Two properties this must keep:
   *   - **Every wait is BOUNDED.** A never-enabling button must fail here in seconds with a
   *     diagnostic, not silently consume the test's whole budget inside click().
   *   - **Retry ONLY while still on /login.** If we've navigated away the login worked, so
   *     we must not loop and try to re-fill a form that no longer exists. This is what keeps
   *     the retry from being able to break a login that already succeeded.
   */
  async loginAndWait(email, password, urlPattern, { attempts = 3 } = {}) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      // Never re-fill a form we've already navigated away from — fillCredentials would sit
      // waiting 30s for an input that no longer exists. If we're off /login, we're done.
      if (attempt > 1 && !this._onLoginPage()) {
        await this.page.waitForURL(urlPattern, { timeout: 15000, waitUntil: 'commit' });
        return;
      }
      await this.fillCredentials(email, password);

      if (await this._waitForSubmitEnabled()) {
        try {
          await this.submitButton.click({ timeout: 10000 });
          // waitUntil: 'commit' — Angular SPA routes (e.g. /my-account) don't reliably fire
          // the 'load' event, so the default wait can time out even after the redirect has
          // already happened (gotcha #9). 'commit' resolves once navigation commits (URL +
          // auth cookie set); callers do their own element-level readiness wait afterward.
          await this.page.waitForURL(urlPattern, { timeout: 15000, waitUntil: 'commit' });
          return;
        } catch (e) {
          // Left /login but not to the expected URL → the login itself worked; surface the
          // URL mismatch to the caller rather than re-filling a form that's gone.
          if (!this._onLoginPage()) throw e;
        }
      }

      const state = await this.readFormState();
      console.log(
        `[login] submit did not go through (attempt ${attempt}/${attempts}) — ` +
        `email chars=${state.emailLen}, password chars=${state.passLen}, ` +
        `submit disabled=${state.submitDisabled}, url=${this.page.url()} — retrying`
      );
      await this.page.waitForTimeout(1000);
    }

    const final = await this.readFormState();
    const credentialsPresent =
      final.emailLen > 0 && final.passLen > 0 && final.submitDisabled === true;

    throw new Error(
      `Login never submitted after ${attempts} attempts (still on ${this.page.url()}). ` +
      `Last form state: email chars=${final.emailLen}, password chars=${final.passLen}, ` +
      `submit disabled=${final.submitDisabled}.\n` +
      (credentialsPresent
        // Two earlier versions of this message guessed a cause and were both wrong (a form
        // re-mount, then Turnstile). State the evidence, name the ONE cause that is actually
        // consistent with it, and say what has been ruled out. Turnstile does NOT gate this
        // button — live-probed on both prod brands, no widget and no token exist; see
        // CLAUDE.md section C.
        ? 'Credentials were PRESENT and submit stayed DISABLED with no .invalid-message. That ' +
          "means the DOM inputs hold text but Angular's form model never saw it — the " +
          "`gh-input` value accessor did not run. This is what pressSequentially() (used " +
          'above) exists to prevent, so if you are seeing this, check whether something ' +
          'reverted it to fill(). NOT Turnstile and NOT a DevOps/Cloudflare issue: verified ' +
          'on both prod brands that no Turnstile widget or token exists on /login and the ' +
          'button is gated by client-side validation only.'
        : 'Credentials did NOT read back — the Angular form is re-mounting and wiping the ' +
          'typed values before submit can be clicked.')
    );
  }
}

module.exports = { LoginPage };
