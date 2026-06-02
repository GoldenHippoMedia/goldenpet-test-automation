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
    this.storeLocatorLink  = page.locator(`a.header__nav__link[href="${brand.storeLocatorUrl}"]:visible`);

    // --- Logged-out / Logged-in state indicators ---
    this.loginLink  = page.locator('a[href="/login"]:visible').first();
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
