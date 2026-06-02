const { test, expect } = require('../fixtures/brand');
const { CartPage } = require('../pages/cart.page');

// GI: "Cart - Add Product, Change Quantity, Remove Product from Cart (Mike)"
// Adds a product, verifies qty/price, changes qty up and down, removes item.

test.describe('Cart - Add Product, Change Quantity, Remove Product', () => {
  test('quantity changes update prices and product can be removed', async ({ page, brand }) => {
    const cartPage = new CartPage(page, brand);

    // Add a standard product (>=$50 for free shipping)
    await cartPage.addProductByKey('loggedout_std_2');

    // Verify product name is not empty
    await expect(cartPage.productName.first()).not.toHaveText('');

    // Verify initial quantity is 1
    const initialQty = await cartPage.getQuantity();
    expect(initialQty).toBe(1);

    // Capture initial prices
    const initialItemTotal = await cartPage.getItemTotalPrice();
    const initialSubtotal = await cartPage.getSubtotalPrice();
    expect(initialItemTotal).toBeGreaterThan(0);

    // --- Increase quantity to 2 ---
    await cartPage.increaseQuantity();

    const updatedQty = await cartPage.getQuantity();
    expect(updatedQty).toBe(2);

    const updatedItemTotal = await cartPage.getItemTotalPrice();
    expect(updatedItemTotal).toBeCloseTo(initialItemTotal * 2, 1);

    const updatedSubtotal = await cartPage.getSubtotalPrice();
    expect(updatedSubtotal).toBeCloseTo(initialSubtotal * 2, 1);

    // --- Decrease quantity back to 1 ---
    await cartPage.decreaseQuantity();

    const restoredQty = await cartPage.getQuantity();
    expect(restoredQty).toBe(1);

    const restoredItemTotal = await cartPage.getItemTotalPrice();
    expect(restoredItemTotal).toBeCloseTo(initialItemTotal, 1);

    // --- Remove product ---
    await cartPage.removeFirstProduct();

    // Verify cart is empty
    const isEmpty = await cartPage.isCartEmpty();
    expect(isEmpty).toBe(true);
  });
});
