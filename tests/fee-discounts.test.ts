import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveReferralDiscount, ReferralDiscount } from '../lib/referralDiscounts'
import { allocateCredits } from '../lib/feeMath'

// Discounts used to come off one fee, so nothing could be applied to the wrong
// one. Now that they carry a fee_type, the rules worth protecting are:
//   - a promo only ever touches the fee it names
//   - a row written before fee_type existed is the RC annual membership
//   - only one promo comes off a fee, and it is the largest
//   - a first-invoice-only promo is skipped once that agent has used it
// If any of these fail, someone is being billed the wrong amount.

const discount = (over: Partial<ReferralDiscount>): ReferralDiscount => ({
  id: 'a',
  name: 'Promo',
  description: null,
  fee_type: 'rc_annual',
  first_invoice_only: false,
  audience: 'all',
  discount_type: 'amount',
  amount: 50,
  schedule_type: 'once',
  starts_on: null,
  ends_on: null,
  start_month: null,
  start_day: null,
  end_month: null,
  end_day: null,
  repeat_until: null,
  is_active: true,
  ...over,
})

test('a monthly-fee promo never comes off the annual membership', () => {
  const monthly = discount({ fee_type: 'crc_monthly', amount: 10 })
  assert.equal(resolveReferralDiscount([monthly], 'outside_only', 299, new Date(), 'rc_annual'), null)
  assert.equal(
    resolveReferralDiscount([monthly], 'outside_only', 50, new Date(), 'crc_monthly')?.amountOff,
    10
  )
})

test('a percent promo on the onboarding fee resolves to dollars', () => {
  const onboarding = discount({ fee_type: 'crc_onboarding', discount_type: 'percent', amount: 25 })
  const resolved = resolveReferralDiscount([onboarding], 'outside_only', 400, new Date(), 'crc_onboarding')
  assert.equal(resolved?.amountOff, 100)
  assert.equal(resolved?.finalPrice, 300)
})

test('the largest promo wins inside one fee type', () => {
  const small = discount({ id: 'x', amount: 20 })
  const large = discount({ id: 'y', amount: 60 })
  assert.equal(
    resolveReferralDiscount([small, large], 'outside_only', 299, new Date(), 'rc_annual')?.amountOff,
    60
  )
})

test('a promo never takes a fee below zero', () => {
  const huge = discount({ amount: 500 })
  assert.equal(
    resolveReferralDiscount([huge], 'outside_only', 299, new Date(), 'rc_annual')?.finalPrice,
    0
  )
})

test('a first-invoice-only promo is skipped for an agent who already used it', () => {
  const once = discount({ id: 'm2', fee_type: 'crc_monthly', amount: 25, first_invoice_only: true })
  assert.equal(
    resolveReferralDiscount([once], 'outside_only', 50, new Date(), 'crc_monthly', {
      excludeDiscountIds: new Set(['m2']),
    }),
    null
  )
  assert.equal(
    resolveReferralDiscount([once], 'outside_only', 50, new Date(), 'crc_monthly')?.amountOff,
    25
  )
})

test('a row written before fee_type existed is the annual membership', () => {
  const legacy = { ...discount({}), fee_type: undefined as unknown as ReferralDiscount['fee_type'] }
  assert.equal(
    resolveReferralDiscount([legacy], 'outside_only', 299, new Date(), 'rc_annual')?.amountOff,
    50
  )
  assert.equal(
    resolveReferralDiscount([legacy], 'outside_only', 50, new Date(), 'crc_monthly'),
    null
  )
})

// Credit arithmetic. A credit is money the brokerage already owes this agent,
// so the rules that matter are: never spend more than the charge, never spend
// more than the credit holds, and never drop the remainder on the floor.

test('a credit larger than the charge keeps its remainder for next time', () => {
  const plan = allocateCredits([{ id: 'c1', remaining: 120 }], 50)
  assert.equal(plan.creditApplied, 50)
  assert.equal(plan.amountDue, 0)
  assert.equal(plan.creditsUsed[0].remainingAfter, 70)
})

test('credits are spent oldest first and only as far as the charge', () => {
  const plan = allocateCredits(
    [{ id: 'old', remaining: 30 }, { id: 'new', remaining: 100 }],
    50
  )
  assert.equal(plan.creditApplied, 50)
  assert.equal(plan.amountDue, 0)
  assert.deepEqual(
    plan.creditsUsed.map(c => [c.id, c.spend, c.remainingAfter]),
    [['old', 30, 0], ['new', 20, 80]]
  )
})

test('credits smaller than the charge leave the rest to pay', () => {
  const plan = allocateCredits([{ id: 'c1', remaining: 20 }], 50)
  assert.equal(plan.creditApplied, 20)
  assert.equal(plan.amountDue, 30)
})

test('no credits means the full charge, and a zero charge spends nothing', () => {
  assert.equal(allocateCredits([], 50).amountDue, 50)
  const none = allocateCredits([{ id: 'c1', remaining: 100 }], 0)
  assert.equal(none.creditApplied, 0)
  assert.equal(none.creditsUsed.length, 0)
})

test('cents survive the arithmetic', () => {
  const plan = allocateCredits([{ id: 'c1', remaining: 13.33 }], 20.01)
  assert.equal(plan.creditApplied, 13.33)
  assert.equal(plan.amountDue, 6.68)
})
