import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCustomPlanSplit } from '../lib/transactions/customPlanParser'

// Custom plan strings are the fallback when users.commission_plan matches no
// commission_plans row. If parsing breaks, those agents silently fall to the
// 85/15 default - a real payout change.

test('standard custom sale plan', () => {
  assert.deepEqual(parseCustomPlanSplit('Custom - 80/20 Cap'), { agentPct: 80, firmPct: 20 })
})

test('custom lease plan', () => {
  assert.deepEqual(parseCustomPlanSplit('Custom Lease 90/10'), { agentPct: 90, firmPct: 10 })
})

test('broker lease magic string parses to 0/100', () => {
  assert.deepEqual(parseCustomPlanSplit('Custom Lease 0/100'), { agentPct: 0, firmPct: 100 })
})

test('splits must sum to 100', () => {
  assert.equal(parseCustomPlanSplit('Custom - 60/30'), null)
})

test('no split in the string means no parse', () => {
  assert.equal(parseCustomPlanSplit('Broker Plan'), null)
  assert.equal(parseCustomPlanSplit(''), null)
  assert.equal(parseCustomPlanSplit(null), null)
  assert.equal(parseCustomPlanSplit(undefined), null)
})

test('dropdown words must never be treated as parseable plans', () => {
  // These exact values caused a production bug (July 2026): agents saved with
  // 'cap' / 'no_cap' / 'new_agent' computed at the 85/15 default.
  assert.equal(parseCustomPlanSplit('cap'), null)
  assert.equal(parseCustomPlanSplit('no_cap'), null)
  assert.equal(parseCustomPlanSplit('new_agent'), null)
})
