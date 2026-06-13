const { BasePage } = require('./base.page');

class MyAccountPage extends BasePage {
  constructor(page, brand) {
    super(page, brand);

    // --- Main Account Page headings ---
    this.accountHeading = page.locator('text=Account Management');
    this.recentOrders   = page.locator('text=My Recent Orders');

    // --- Account Management section body links ---
    this.orderHistoryLink         = page.getByRole('link', { name: /^order history$/i });
    this.managePetProfileLink     = page.getByRole('link', { name: /manage pet profile/i });
    this.managePasswordLink       = page.getByRole('link', { name: /manage password/i });
    this.editSubscriptionsLink    = page.getByRole('link', { name: /edit subscriptions/i });
    this.managePaymentMethodsLink = page.getByRole('link', { name: /manage payment methods/i });
    this.updateProfileLink        = page.getByRole('link', { name: /update profile and shipping address/i });

    // --- My Recent Orders section ---
    // Order ID renders as a <button> (not an <a>) on prod; accept either so the
    // clickable order link resolves on both envs.
    this.firstOrderLink        = page.locator('a, button').filter({ hasText: /ORD-\d+/ }).first();
    this.reorderViewDetailsBtn = page.locator('a, button').filter({ hasText: /reorder and view order details/i }).first();

    // --- My Subscriptions section ---
    this.firstSubscriptionLink  = page.locator('a, button').filter({ hasText: /SSC-/ }).first();
    this.manageSubscriptionsBtn = page.locator('a, button').filter({ hasText: /manage subscriptions/i }).first();
  }

  async goto() {
    await this.navigate('account');
  }
}

module.exports = { MyAccountPage };
