# CMBX Trade Confirmation — Reference Guide

## 1. What is CMBX?

CMBX is a series of synthetic indices referencing commercial mortgage-backed securities (CMBS). Each series references 25 CMBS deals of a specific vintage. Each tranche of the index (AAA, AS, AA, A, BBB-, BB) trades as a standardized Credit Default Swap (CDS) contract.

---

## 2. Series Maturity Dates

| Series | Maturity Date     |
|--------|-------------------|
| 6      | May 11, 2063      |
| 7      | January 17, 2047  |
| 8      | October 17, 2057  |
| 9      | September 17, 2058|
| 10     | November 17, 2059 |
| 11     | November 18, 2054 |
| 12     | August 17, 2061   |
| 13     | December 16, 2072 |
| 14     | December 16, 2072 |
| 15     | November 18, 2064 |
| 16     | April 17, 2065    |
| 17     | December 15, 2056 |
| 18     | December 18, 2057 |
| 19     | December 17, 2058 |
| 20     | January 17, 2073  |

---

## 3. Tranche Coupons (Fixed Running Spread)

| Tranche | Coupon  |
|---------|---------|
| AAA     | 50 bps  |
| AS      | 100 bps |
| AA      | 150 bps |
| A       | 200 bps |
| BBB-    | 300 bps |
| BB      | 500 bps |

---

## 4. Trade Mechanics — Protection Buyer vs. Seller

### Protection Buyer (Seller of Risk — SHORT Credit)
- **Going short** the CMBX index; benefits if credit deteriorates
- **Pays** the fixed running coupon (e.g., 300 bps/yr for BBB-)
- **Receives** the upfront present value when the price is below 100
- In confirmations: labeled **"Protection Buyer (Seller of Risk)"**

### Protection Seller (Buyer of Risk — LONG Credit)
- **Going long** the CMBX index; benefits if credit improves
- **Receives** the fixed running coupon (e.g., 300 bps/yr for BBB-)
- **Pays** the upfront present value when the price is below 100
- In confirmations: labeled **"Protection Seller (Buyer of Risk)"**

### How HIT and LIFT Map to Protection Buyer / Seller

| Action | Active Dealer | Passive Dealer |
|--------|---------------|----------------|
| **HIT** (sells at bid) | **Protection Buyer** (Seller of Risk) | **Protection Seller** (Buyer of Risk) |
| **LIFT** (buys at ask) | **Protection Seller** (Buyer of Risk) | **Protection Buyer** (Seller of Risk) |

*Example: MS hits Citi's bid → MS is Protection Buyer (Seller of Risk); Citi is Protection Seller (Buyer of Risk).*

---

## 5. Upfront Payment (Present Value)

CMBX trades at a fixed coupon. When the market price differs from par (100), an upfront payment settles the difference in NPV.

### Formula

```
PV = (100 − Price) / 100 × Notional
```

| Scenario       | PV Sign | Who Pays Upfront         | Who Receives Upfront     |
|----------------|---------|--------------------------|--------------------------|
| Price < 100    | Positive| Protection Seller (Buyer of Risk) | Protection Buyer (Seller of Risk) |
| Price = 100    | Zero    | Neither                  | Neither                  |
| Price > 100    | Negative| Protection Buyer (Seller of Risk) | Protection Seller (Buyer of Risk) |

### Example

> BBB-.19 trades at **70.50**, notional **$5,000,000**
>
> PV = (100.00 − 70.50) / 100 × $5,000,000 = **$1,475,000**
>
> Protection Seller pays $1,475,000 to Protection Buyer at settlement.

---

## 6. Price Format

- **Always express the trade price in decimal format** (e.g., `70.50`, not `70-16` in 32nds)
- The present value (PV) is the only upfront figure shown on confirms — do not show raw spread

---

## 7. Confirm Document Layout

```
────────────────────────────────────────────────────────────────────────
                        CMBX TRADE CONFIRMATION
                          Trade Date: [date]
                          CROSSPOINT CAPITAL
────────────────────────────────────────────────────────────────────────

Reference: CMBX.NA.BBB-.19          Maturity: December 17, 2058

PARTIES
  Protection Buyer (Seller of Risk — Short Credit):
    Morgan Stanley Co. International PLC
    Pays: 300 bps/yr running coupon
    Receives: upfront PV

  Protection Seller (Buyer of Risk — Long Credit):
    Citigroup Global Markets Inc.
    Receives: 300 bps/yr running coupon
    Pays: upfront PV

TRADE TERMS
  Index:               CMBX.NA.BBB-.19
  Trade Type:          Credit Default Swap (CDS) — ISDA Standard Terms
  Notional Amount:     $5,000,000
  Trade Price:         70.50
  Coupon (Running):    300 bps per annum (3.00% / year)
  Maturity Date:       December 17, 2058
  Effective Date:      May 20, 2026  (T+0)
  Settlement Date:     May 23, 2026  (T+3 business days)

UPFRONT PAYMENT (PRESENT VALUE)
  PV Amount:           $1,475,000
  Calculation:         (100.00 − 70.50) / 100 × $5,000,000
  Payable by:          Citigroup Global Markets Inc.  (Protection Seller)
  Payable to:          Morgan Stanley Co. International PLC  (Protection Buyer)

FACILITATION FEE
  Charged by:          Crosspoint Capital
  Amount:              $625

────────────────────────────────────────────────────────────────────────
This document confirms the terms agreed between the parties above for the
CMBX.NA.BBB-.19 trade executed on May 20, 2026. Effective date is T+0.
Settlement date is T+3 business days (May 23, 2026). All terms are subject
to the ISDA Master Agreement and related Schedule executed between the parties.
────────────────────────────────────────────────────────────────────────
```

---

## 8. What Crosspoint Capital's Role Is

Crosspoint facilitates the trade between Protection Buyer and Protection Seller. The facilitation fee is charged per million notional:

| Tranche | Fee per $1MM notional |
|---------|-----------------------|
| AAA     | $75                   |
| AS      | $115                  |
| AA      | $115                  |
| A       | $115                  |
| BBB-    | $125                  |
| BB      | $125                  |

---

## 9. Settlement

- **Effective Date:** T+0 (trade date — the contract is live immediately)
- **Settlement Date:** T+3 business days (upfront PV and facilitation fee are paid on settlement date)
- Running coupon accrues from the effective date (T+0)
