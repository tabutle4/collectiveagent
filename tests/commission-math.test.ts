import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeCommission } from '../lib/transactions/math'

// The canonical formula. If any of these fail, someone changed the math that
// pays agents. Do NOT "fix the test" - fix the code, or escalate to Tara.
//   amount_1099 = agent_gross + btsa - processing - coaching - other_fees - rebate + credits
//   agent_net   = amount_1099 - debts

test('canonical formula: full example', () => {
  const r = computeCommission({
    agent_gross: 10000,
    btsa_amount: 500,
    processing_fee: 150,
    coaching_fee: 500,
    other_fees: 200,
    rebate_amount: 100,
    credits_applied: 0,
    debts_deducted: 300,
  })
  assert.equal(r.amount_1099, 9550)
  assert.equal(r.agent_net, 9250)
})

test('credits ADD to 1099 (fee-waiver tax treatment)', () => {
  const r = computeCommission({ agent_gross: 1000, processing_fee: 150, credits_applied: 50 })
  assert.equal(r.amount_1099, 900)
  assert.equal(r.agent_net, 900)
})

test('debts reduce net only, never 1099', () => {
  const r = computeCommission({ agent_gross: 5000, debts_deducted: 1200 })
  assert.equal(r.amount_1099, 5000)
  assert.equal(r.agent_net, 3800)
})

test('null / undefined / empty-string inputs are zero, not NaN', () => {
  const r = computeCommission({
    agent_gross: null,
    btsa_amount: undefined,
    processing_fee: '',
    coaching_fee: null,
  })
  assert.equal(r.amount_1099, 0)
  assert.equal(r.agent_net, 0)
})

test('string amounts parse like the database returns them', () => {
  const r = computeCommission({ agent_gross: '2500.50', processing_fee: '150.00' })
  assert.equal(r.amount_1099, 2350.5)
})

test('results are rounded to cents', () => {
  const r = computeCommission({ agent_gross: 100.005, processing_fee: 0.001 })
  assert.equal(r.amount_1099, Math.round((100.005 - 0.001) * 100) / 100)
  assert.equal(r.amount_1099, r.agent_net)
})

test('referral-fee policy: fees in other_fees reduce BOTH 1099 and net', () => {
  // The compliance form writes internal/external/brokerage referral fees into
  // other_fees. The referring agent must not be taxed on money they passed on.
  const withFee = computeCommission({ agent_gross: 8500, other_fees: 500 })
  const without = computeCommission({ agent_gross: 8500 })
  assert.equal(without.amount_1099 - withFee.amount_1099, 500)
  assert.equal(without.agent_net - withFee.agent_net, 500)
})
