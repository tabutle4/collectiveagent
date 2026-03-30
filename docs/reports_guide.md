# CRC Financial Reports Guide

This guide covers all the reports you need for financial tracking, 1099s, and P&L.

---

## Data Sources Overview

| Data | Source | Used For |
|------|--------|----------|
| Commission income | `transaction_internal_agents` | P&L Income, 1099s |
| Agent payouts | `transaction_internal_agents.agent_net` | P&L Expense |
| External referrals | `transaction_external_brokerages` | P&L Expense, 1099s to other brokerages |
| Monthly fees | Stripe/Payload or `brokerage_ledger` | P&L Income |
| Onboarding fees | Stripe/Payload or `brokerage_ledger` | P&L Income |
| Listing coordination | `listing_coordination.service_fee` | P&L Income |
| Operating expenses | `brokerage_ledger` | P&L Expense |
| Property management | `landlord_disbursements`, `tenant_invoices` | Separate P&L |

---

## Report 1: Agent 1099 Summary

**Purpose:** Year-end 1099 preparation

**Who gets a 1099:**
- Any person paid ≥ $600 in the calendar year
- Includes: primary agent income, team lead income, rev share income
- Does NOT include: employee wages (W-2), refunds

### Query:
```sql
SELECT 
  u.id,
  COALESCE(u.preferred_first_name, u.first_name) || ' ' || 
    COALESCE(u.preferred_last_name, u.last_name) as display_name,
  w9.legal_name,
  w9.business_name,
  CASE w9.federal_id_type
    WHEN 'SSN' THEN 'XXX-XX-' || RIGHT(w9.federal_id_number, 4)
    WHEN 'EIN' THEN 'XX-XXX' || RIGHT(w9.federal_id_number, 4)
  END as masked_tin,
  w9.w9_address || ', ' || w9.w9_city || ', ' || w9.w9_state || ' ' || w9.w9_zip as address,
  
  SUM(tia.amount_1099_reportable) as total_1099,
  COUNT(*) as payment_count,
  
  -- Breakdown
  SUM(CASE WHEN tia.agent_role = 'primary_agent' THEN tia.amount_1099_reportable ELSE 0 END) as agent_income,
  SUM(CASE WHEN tia.agent_role = 'team_lead' THEN tia.amount_1099_reportable ELSE 0 END) as team_lead_income,
  SUM(CASE WHEN tia.agent_role = 'rev_share' THEN tia.amount_1099_reportable ELSE 0 END) as rev_share_income
  
FROM transaction_internal_agents tia
JOIN users u ON tia.agent_id = u.id
LEFT JOIN agent_w9s w9 ON u.id = w9.agent_id AND w9.is_current = true
WHERE tia.payment_status = 'paid'
  AND EXTRACT(YEAR FROM tia.payment_date) = 2026
GROUP BY u.id, u.first_name, u.last_name, u.preferred_first_name, u.preferred_last_name,
         w9.legal_name, w9.business_name, w9.federal_id_type, w9.federal_id_number,
         w9.w9_address, w9.w9_city, w9.w9_state, w9.w9_zip
HAVING SUM(tia.amount_1099_reportable) >= 600
ORDER BY total_1099 DESC;
```

### Missing W9 Report:
```sql
SELECT 
  u.id,
  u.first_name || ' ' || u.last_name as agent_name,
  u.email,
  u.phone,
  SUM(tia.amount_1099_reportable) as total_1099
FROM transaction_internal_agents tia
JOIN users u ON tia.agent_id = u.id
LEFT JOIN agent_w9s w9 ON u.id = w9.agent_id AND w9.is_current = true
WHERE tia.payment_status = 'paid'
  AND EXTRACT(YEAR FROM tia.payment_date) = 2026
  AND w9.id IS NULL  -- No W9 on file
GROUP BY u.id
HAVING SUM(tia.amount_1099_reportable) >= 600
ORDER BY total_1099 DESC;
```

---

## Report 2: External Brokerage 1099s

**Purpose:** 1099s for referral/co-op fees paid to other brokerages

```sql
SELECT 
  teb.brokerage_name,
  teb.brokerage_dba,
  teb.brokerage_ein,
  teb.brokerage_address || ', ' || teb.brokerage_city || ', ' || 
    teb.brokerage_state || ' ' || teb.brokerage_zip as address,
  teb.w9_on_file,
  SUM(teb.commission_amount) as total_paid,
  COUNT(*) as transaction_count
FROM transaction_external_brokerages teb
JOIN transactions t ON teb.transaction_id = t.id
WHERE teb.payment_status = 'paid'
  AND EXTRACT(YEAR FROM teb.payment_date) = 2026
GROUP BY teb.brokerage_name, teb.brokerage_dba, teb.brokerage_ein,
         teb.brokerage_address, teb.brokerage_city, teb.brokerage_state, teb.brokerage_zip,
         teb.w9_on_file
HAVING SUM(teb.commission_amount) >= 600
ORDER BY total_paid DESC;
```

---

## Report 3: Commission P&L (Transaction-Based)

**Purpose:** Monthly/quarterly/annual income from commissions

### Income Side:
```sql
SELECT 
  DATE_TRUNC('month', tia.payment_date) as month,
  
  -- CRC's income from transactions
  SUM(tia.brokerage_split) as brokerage_split_income,
  SUM(tia.processing_fee) as processing_fee_income,
  SUM(tia.coaching_fee) as coaching_fee_income,
  SUM(tia.other_fees) as other_fee_income,
  
  SUM(COALESCE(tia.brokerage_split, 0) + 
      COALESCE(tia.processing_fee, 0) + 
      COALESCE(tia.coaching_fee, 0) + 
      COALESCE(tia.other_fees, 0)) as total_commission_income,
  
  -- Payouts (for reconciliation)
  SUM(tia.agent_net) as agent_payouts,
  
  -- Debt collections (recovered money)
  SUM(tia.debts_deducted) as debts_collected,
  
  -- Volume stats
  COUNT(DISTINCT tia.transaction_id) as transaction_count,
  SUM(tia.sales_volume) as total_volume

FROM transaction_internal_agents tia
WHERE tia.payment_status = 'paid'
  AND tia.payment_date >= '2026-01-01'
  AND tia.payment_date <= '2026-12-31'
GROUP BY DATE_TRUNC('month', tia.payment_date)
ORDER BY month;
```

### Expense Side (External Referrals):
```sql
SELECT 
  DATE_TRUNC('month', teb.payment_date) as month,
  SUM(teb.commission_amount) as referral_fees_paid
FROM transaction_external_brokerages teb
WHERE teb.payment_status = 'paid'
  AND teb.payment_date >= '2026-01-01'
GROUP BY DATE_TRUNC('month', teb.payment_date)
ORDER BY month;
```

---

## Report 4: Full P&L with Non-Transaction Items

**Purpose:** Complete P&L including bank transactions

### Combined P&L Query:
```sql
WITH commission_income AS (
  SELECT 
    DATE_TRUNC('month', tia.payment_date) as month,
    SUM(COALESCE(tia.brokerage_split, 0) + 
        COALESCE(tia.processing_fee, 0) + 
        COALESCE(tia.coaching_fee, 0)) as amount,
    'Commission Income' as category
  FROM transaction_internal_agents tia
  WHERE tia.payment_status = 'paid'
  GROUP BY DATE_TRUNC('month', tia.payment_date)
),

ledger_items AS (
  SELECT 
    DATE_TRUNC('month', entry_date) as month,
    CASE WHEN entry_type = 'income' THEN amount ELSE -amount END as amount,
    category
  FROM brokerage_ledger
),

referral_expense AS (
  SELECT 
    DATE_TRUNC('month', payment_date) as month,
    -SUM(commission_amount) as amount,
    'External Referrals' as category
  FROM transaction_external_brokerages
  WHERE payment_status = 'paid'
  GROUP BY DATE_TRUNC('month', payment_date)
)

SELECT 
  month,
  category,
  SUM(amount) as amount
FROM (
  SELECT * FROM commission_income
  UNION ALL
  SELECT * FROM ledger_items
  UNION ALL
  SELECT * FROM referral_expense
) combined
GROUP BY month, category
ORDER BY month, category;
```

---

## Report 5: Agent Production Report

**Purpose:** Track individual agent performance

```sql
SELECT 
  u.id,
  COALESCE(u.preferred_first_name, u.first_name) || ' ' || 
    COALESCE(u.preferred_last_name, u.last_name) as agent_name,
  u.office,
  u.commission_plan,
  u.cap_progress,
  
  -- YTD Stats (as primary agent only)
  COUNT(DISTINCT CASE WHEN tia.agent_role = 'primary_agent' THEN tia.transaction_id END) as transactions,
  SUM(CASE WHEN tia.agent_role = 'primary_agent' THEN tia.units ELSE 0 END) as units,
  SUM(CASE WHEN tia.agent_role = 'primary_agent' THEN tia.sales_volume ELSE 0 END) as volume,
  SUM(CASE WHEN tia.agent_role = 'primary_agent' THEN tia.agent_gross ELSE 0 END) as gross_commission,
  SUM(CASE WHEN tia.agent_role = 'primary_agent' THEN tia.amount_1099_reportable ELSE 0 END) as net_income,
  
  -- Sales vs Leases
  SUM(CASE WHEN tia.agent_role = 'primary_agent' AND t.transaction_type NOT LIKE '%tenant%' AND t.transaction_type NOT LIKE '%landlord%' 
      THEN tia.sales_volume ELSE 0 END) as sales_volume,
  SUM(CASE WHEN tia.agent_role = 'primary_agent' AND (t.transaction_type LIKE '%tenant%' OR t.transaction_type LIKE '%landlord%')
      THEN tia.sales_volume ELSE 0 END) as lease_volume

FROM users u
LEFT JOIN transaction_internal_agents tia ON u.id = tia.agent_id AND tia.payment_status = 'paid'
LEFT JOIN transactions t ON tia.transaction_id = t.id
WHERE u.is_active = true
  AND u.is_licensed_agent = true
  AND (tia.payment_date IS NULL OR EXTRACT(YEAR FROM tia.payment_date) = 2026)
GROUP BY u.id
ORDER BY SUM(CASE WHEN tia.agent_role = 'primary_agent' THEN tia.sales_volume ELSE 0 END) DESC;
```

---

## Report 6: Team Performance

**Purpose:** Track team production

```sql
SELECT 
  t.team_name,
  
  -- Team volume (all member transactions)
  COUNT(DISTINCT tia.transaction_id) as transactions,
  SUM(tia.sales_volume) as total_volume,
  SUM(tia.agent_net) as total_agent_net,
  
  -- Member count
  COUNT(DISTINCT tma.agent_id) as member_count

FROM teams t
JOIN team_member_agreements tma ON t.id = tma.team_id AND tma.end_date IS NULL
JOIN transaction_internal_agents tia ON tma.agent_id = tia.agent_id
WHERE tia.payment_status = 'paid'
  AND EXTRACT(YEAR FROM tia.payment_date) = 2026
GROUP BY t.id, t.team_name
ORDER BY SUM(tia.sales_volume) DESC;
```

---

## How to Export for Bank Reconciliation

### Option A: Export Commission P&L to CSV

Run the P&L query above and export. Then in Excel:
1. Add your bank statement transactions (bank fees, wire fees, etc.)
2. Combine with commission income
3. Reconcile totals

### Option B: Use brokerage_ledger Table

Add bank transactions directly:
```sql
INSERT INTO brokerage_ledger (entry_date, entry_type, category, description, amount, bank_reference, bank_date)
VALUES 
  ('2026-03-01', 'expense', 'bank_fees', 'March wire fees', 25.00, 'WIRE-001', '2026-03-01'),
  ('2026-03-15', 'income', 'onboarding_fees', 'New agent - Sarah Johnson', 399.00, 'STRIPE-ABC', '2026-03-15');
```

Then run the combined P&L report above.

### Option C: Stripe/Payload Import

Build an import function that pulls transactions from Stripe/Payload API and writes to `brokerage_ledger` with:
- `external_source` = 'stripe' or 'payload'
- `external_id` = the charge/transaction ID

---

## Report Page Build Plan

### Pages to Build:

1. **1099 Report** (`/admin/reports/1099`)
   - Year filter
   - Shows all agents with ≥ $600
   - Missing W9 warnings
   - Export to CSV
   - Integration with Track1099 API

2. **P&L Report** (`/admin/reports/pnl`)
   - Date range filter
   - Monthly breakdown
   - Category totals
   - Export to CSV/Excel

3. **Agent Production** (`/admin/reports/production`)
   - Date range filter
   - Office filter
   - Sort by volume/units/net
   - Compare to goals

4. **Team Performance** (`/admin/reports/teams`)
   - Date range filter
   - Team comparison
   - Member breakdown

5. **Ledger Entry** (`/admin/ledger`)
   - Add income/expense entries
   - Bank reconciliation
   - Import from Stripe/Payload

---

## Quick Summary

| To Find | Query | Source |
|---------|-------|--------|
| What goes on agent's 1099 | `SUM(amount_1099_reportable)` | `transaction_internal_agents` |
| CRC's income from deal | `brokerage_split + fees` | `transaction_internal_agents` |
| Agent's cash received | `agent_net` | `transaction_internal_agents` |
| Cap progress | `brokerage_split` | `transaction_internal_agents` |
| Monthly fee income | Manual entry or Stripe import | `brokerage_ledger` |
| External referral expense | `commission_amount` | `transaction_external_brokerages` |
