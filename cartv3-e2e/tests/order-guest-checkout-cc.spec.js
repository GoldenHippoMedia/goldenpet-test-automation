const { test, expect } = require('../fixtures/brand');
const { CartPage } = require('../pages/cart.page');
const { CheckoutPage } = require('../pages/checkout.page');
const { OrderConfirmationPage } = require('../pages/order-confirmation.page');
const {
  assertOrderIdFormat,
  assertSnapshotsAgree,
  assertProductNamesMatch,
  assertMoneyMath,
  assertConfirmationMatchesSubmission,
  assertTaxApplied,
  assertShippingThreshold,
} = require('../helpers/order-validations');

// GI: "Order - Standard Product, Checkout using Credit Card (Guest)"
//
// Flow: Cart (logged out) → Checkout As Guest → fill address + CC → Submit Order
// Runs on UAT only — places a real Braintree sandbox order.

test.describe('Order - Guest Checkout with Credit Card', () => {
  // Set a generous timeout — upsell funnel can take 30-60s when rendered
  test.setTimeout(180000);

  test(
    'guest order: place CC order and validate data integrity across cart → checkout → confirmation',
    { tag: '@real-order' },
    async ({ page, brand }) => {
      const cartPage         = new CartPage(page, brand);
      const checkoutPage     = new CheckoutPage(page, brand);
      const confirmationPage = new OrderConfirmationPage(page, brand);

      // 1. Load cart with a logged-out standard product
      await cartPage.addProductByKey('loggedout_std_1');

      // 2. Snapshot cart state
      const cartSnap = await cartPage.getOrderSummary();
      expect(cartSnap.productName, 'cart should have a product name').toBeTruthy();
      expect(cartSnap.quantity, 'cart should have a quantity').toBeGreaterThan(0);
      expect(cartSnap.subtotal, 'cart should have a subtotal').toBeGreaterThan(0);

      // 3. Proceed as guest
      await cartPage.checkoutAsGuestButton.click();
      await checkoutPage.waitForCheckoutLoaded();
      await checkoutPage.switchToCreditCardForm();

      // 4. Fill Customer + Delivery + CC
      await checkoutPage.fillCustomerInfo({
        firstName: brand.testAddress.firstName,
        lastName:  brand.testAddress.lastName,
        email:     brand.testAddress.email,
        phone:     brand.testAddress.phone,
      });

      await checkoutPage.fillDeliveryAddress({
        firstName: brand.testAddress.firstName,
        lastName:  brand.testAddress.lastName,
        street:    brand.testAddress.address1,
        city:      brand.testAddress.city,
        state:     brand.testAddress.state,
        zip:       brand.testAddress.zip,
        phone:     brand.testAddress.phone,
      });

      // Give tax calculation a moment to run after address fill
      await page.waitForTimeout(2000);

      // 5. Snapshot checkout state (after address fill — tax should be calculated)
      const checkoutSnap = await checkoutPage.getOrderSummary();

      // Cart → checkout: subtotal must agree
      assertSnapshotsAgree(cartSnap, checkoutSnap, 'cart', 'checkout', ['subtotal']);

      // 6. Fill CC and submit
      await checkoutPage.fillCreditCard({
        number: brand.testCard.number,
        name:   `${brand.testAddress.firstName} ${brand.testAddress.lastName}`,
        expiry: brand.testCard.expiry,
        cvv:    brand.testCard.cvv,
      });
      await checkoutPage.submitOrder();

      // 7. Wait for /order-confirmation. Polls and declines upsells if they render.
      //    Handles intermittent UAT behaviour (sometimes the funnel renders, sometimes not).
      await checkoutPage.waitForOrderConfirmation();
      await confirmationPage.waitForConfirmationLoaded();

      // 8. Snapshot confirmation + customer/address
      const confirmSnap   = await confirmationPage.getOrderSummary();
      const customer      = await confirmationPage.getCustomerInfo();
      const shippingAddr  = await confirmationPage.getShippingAddress();
      const orderId       = await confirmationPage.getOrderId();

      console.log(`\n========================================`);
      console.log(`  ORDER PLACED: ${orderId}`);
      console.log(`  Total:        $${confirmSnap.total?.toFixed(2)}`);
      console.log(`  Payment:      Credit Card`);
      console.log(`  Variant:      loggedout_std_1 (${brand.testProducts.loggedout_std_1})`);
      console.log(`  Email:        ${brand.testAddress.email}`);
      console.log(`========================================\n`);

      test.info().annotations.push(
        { type: 'Order ID',        description: orderId },
        { type: 'Order Total',     description: `$${confirmSnap.total?.toFixed(2)}` },
        { type: 'Payment Method',  description: 'Credit Card' },
        { type: 'Product Variant', description: `loggedout_std_1 (${brand.testProducts.loggedout_std_1})` },
        { type: 'Customer Email',  description: brand.testAddress.email },
      );

      // 9. Validations

      // Order ID format
      assertOrderIdFormat(orderId);

      // Cart → confirmation: quantity and subtotal flow through (strict equality)
      assertSnapshotsAgree(
        cartSnap, confirmSnap, 'cart', 'confirmation',
        ['quantity', 'subtotal']
      );

      // Product name flows through (loose match — display copy differs by page)
      assertProductNamesMatch(
        cartSnap.productName, confirmSnap.productName, 'cart', 'confirmation'
      );

      // Checkout → confirmation: money math agrees
      assertSnapshotsAgree(
        checkoutSnap, confirmSnap, 'checkout', 'confirmation',
        ['subtotal', 'tax', 'shipping', 'total']
      );

      // Math sanity on confirmation
      assertMoneyMath(confirmSnap, 'confirmation');

      // Tax was applied (CA address)
      assertTaxApplied(confirmSnap);

      // Shipping threshold business rule
      assertShippingThreshold(confirmSnap, 'confirmation');

      // Customer/address round-trip
      assertConfirmationMatchesSubmission(
        { customer, shippingAddress: shippingAddr },
        brand.testAddress
      );
    }
  );
});
