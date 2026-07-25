import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLeaseTransactionType } from '../lib/transactions/transactionTypes'
import { complianceIsLease } from '../lib/forms/requiredFields'

// Lease vs sale drives which commission plan applies, which date column the
// quarterly report reads, and which checklist a deal uses. Getting this wrong
// once put lease dates in closing_date and broke reporting.

test('lease transaction types', () => {
  assert.equal(isLeaseTransactionType('tenant_apt_v2'), true)
  assert.equal(isLeaseTransactionType('tenant_simplyhome_v2'), true)
  assert.equal(isLeaseTransactionType('landlord_v2'), true)
})

test('sale transaction types', () => {
  assert.equal(isLeaseTransactionType('buyer_v2'), false)
  assert.equal(isLeaseTransactionType('seller_v2'), false)
  assert.equal(isLeaseTransactionType('nc_buyer_v2'), false)
  assert.equal(isLeaseTransactionType('referred_out_v2'), false)
  assert.equal(isLeaseTransactionType(null), false)
})

test('compliance form: direct lease representation', () => {
  assert.equal(complianceIsLease({ representing: 'tenant' }), true)
  assert.equal(complianceIsLease({ representing: 'landlord' }), true)
  assert.equal(complianceIsLease({ representing: 'buyer' }), false)
  assert.equal(complianceIsLease({ representing: 'seller' }), false)
})

test('referred-out is a lease only when the referred client was tenant/landlord', () => {
  assert.equal(complianceIsLease({ representing: 'referred_out', referred_client_type: 'tenant' }), true)
  assert.equal(complianceIsLease({ representing: 'referred_out', referred_client_type: 'landlord' }), true)
  assert.equal(complianceIsLease({ representing: 'referred_out', referred_client_type: 'buyer' }), false)
  assert.equal(complianceIsLease({ representing: 'referred_out' }), false)
})
