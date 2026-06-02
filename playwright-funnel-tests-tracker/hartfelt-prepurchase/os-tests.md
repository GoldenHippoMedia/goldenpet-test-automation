# QA Test Tracker

---

## test-os.spec.ts

**Offer page:** `os251002a_lb_ap_cro`
**Options tested:** 6 combinations — OTP (1, 3, 6 bags) × SUB (1, 3, 6 bags)

---

### OS Page Validations

1. Savings badge matches calculated discount (standard vs offer price, floored % or $) — for all 6 options

**Example output:**
```
--- OTP - 1 Bag ---
  standard:   $29.99   offer: $19.99
  calc:        floor((29.99 - 19.99) / 29.99 × 100) = floor(33.37) = 33%
  displayed:  Save 33%

--- SUB - 3 Bags ---
  standard:   $74.99   offer: $44.99
  calc:        floor((74.99 - 44.99) / 74.99 × 100) = floor(40.01) = 40%
  displayed:  Save 40%
```

---

### Checkout Validations

1. Product name includes significant words from OS subtitle
2. Unit count matches the selected package
3. Sale price matches OS offer price
4. Subtotal matches OS offer price
5. Total = subtotal + sales tax + shipping
6. Shipping and tax rows are present
7. Savings element matches expected calculation *(skipped gracefully if element absent)*

**Example output:**
```
--- OTP - 1 Bag ---
  unit (offer page):  1 Unit
  offer → checkout:   $19.99 → sale $19.99
  shipping | tax:     FREE | $0.00
  total expected:     $19.99   actual: $19.99
  checkout page:
    product name:     Hartfelt Premium Dog Food 16oz
    unit count:       1
    price:            $19.99
    subtotal:         $19.99
    total:            $19.99
    savings:          (not present)
    uid (query):      abc123

--- SUB - 3 Bags ---
  unit (offer page):  3 Units
  offer → checkout:   $44.99 → sale $44.99
  shipping | tax:     FREE | $0.00
  total expected:     $44.99   actual: $44.99
  checkout page:
    product name:     Hartfelt Premium Dog Food 16oz
    unit count:       3
    price:            $44.99
    subtotal:         $44.99
    total:            $44.99
    savings:          SAVE $30 ❌
    uid (query):      def456
```

---

## TODO

---

## Needs Fixing
