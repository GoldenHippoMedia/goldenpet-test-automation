const { BasePage } = require('./base.page');

class HeaderPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    // --- Logo (dynamic per brand) ---
    this.logo     = page.locator(`a[href="/"] img[alt="${brand.logoAltText}"]:visible`).first();
    this.logoLink = page.locator('a[href="/"]:visible').first();

    // --- Cart (a[href="/cart"] on CMS pages, div.cart on Angular app pages) ---
    this.cartLink = page.locator('a[href="/cart"]:visible, div.cart:visible').first();

    // --- Nav Links (`:visible` ensures we target the desktop nav, not the hidden mobile nav) ---
    this.shopLink          = page.locator('a.header__nav__link[href="/products"]:visible');
    this.subscribeLink     = page.locator('a.header__nav__link[href="/subscribe-save"]:visible');
    this.reviewsLink       = page.locator('a.header__nav__link[href="/reviews"]:visible');
    this.faqLink           = page.locator('a.header__nav__link[href="/faq-bridge"]:visible');
    this.contactLink       = page.locator('a.header__nav__link[href="/contact"]:visible');
    // Located by TEXT, not by href. The old locator selected on `href="<expected>"` and
    // header.spec.js then asserted that same href — a tautology that could only pass or
    // report "element(s) not found". So when DMP prod moved Store Locator off the
    // store.<domain> subdomain onto a first-party /store-locator path, it surfaced as an
    // href MISMATCH on a link it had in fact failed to find (2026-08-19). Find the link by
    // identity; let the spec assert the destination against brand.storeLocatorUrlPattern.
    // (`:has-text()` is case-insensitive, so it matches "STORE LOCATOR" too.)
    this.storeLocatorLink  = page.locator('a.header__nav__link:has-text("Store Locator"):visible');

    // --- Logged-out / Logged-in state indicators ---
    // Some brands' header link uses a trailing slash (Badlands: /login/), others don't
    // (DMP: /login) — match both so the login-entry specs are brand-portable.
    this.loginLink  = page.locator('a[href="/login"]:visible, a[href="/login/"]:visible').first();
    this.hiGreeting = page.locator('p:has-text("Hi,"):visible').first();

    // --- Account Dropdown Trigger ---
    this.accountTrigger    = page.locator('li.cursor-pointer:has(.header__account__dropdown):visible');

    // --- Account Dropdown Items (text-based, scoped to visible dropdown) ---
    this.accountDropdown         = page.locator('.header__account__dropdown:visible');
    this.accountMainLink         = page.locator('.header__account__dropdown:visible li').filter({ hasText: 'My Account Main' });
    this.petProfileLink          = page.locator('.header__account__dropdown:visible li').filter({ hasText: 'Pet Profile' });
    this.profileSettingsLink     = page.locator('.header__account__dropdown:visible li').filter({ hasText: 'Profile and Settings' });
    this.ordersLink              = page.locator('.header__account__dropdown:visible li').filter({ hasText: 'Orders' });
    this.subscriptionsLink       = page.locator('.header__account__dropdown:visible li').filter({ hasText: 'Subscriptions' });
    this.contactUsLink           = page.locator('.header__account__dropdown:visible li').filter({ hasText: 'Contact Us' });
    this.logoutLink              = page.locator('.header__account__dropdown:visible li').filter({ hasText: /log.?out/i }).first();
  }

  async openAccountDropdown() {
    await this.accountTrigger.click();
    await this.accountDropdown.waitFor({ state: 'visible' });
  }

  async logout() {
    await this.openAccountDropdown();
    await this.logoutLink.click();
    await this.page.waitForLoadState('domcontentloaded');
  }
}

module.exports = { HeaderPage };
