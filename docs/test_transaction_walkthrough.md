# Test Transaction Walkthrough

This document walks through a complete transaction example showing how all the financial fields connect.

---

## Example Deal: Buyer Sale with 85/15 Agent

### The Scenario
- **Agent:** Sarah Johnson (85/15 plan, New Agent Plan)
- **Transaction:** Buyer purchase of 123 Main St
- **Sales Price:** $300,000
- **Commission on CDA:** CRC receives $9,000 (buyer side)
- **Rebate to Buyer:** $500 (this comes out BEFORE any calculations)
- **Processing Fee:** $150
- **Agent has $200 outstanding debt** (unpaid monthly fee)

---

## Step 1: What Title Pays

```
CDA Commission to CRC:                $9,000
Rebate paid to buyer at closing:     -$  500
───────────────────────────────────────────────
NET RECEIVED BY CRC (office_gross):   $8,500   ◄── This is agent_basis
```

**Important:** The rebate is NOT income to anyone. It's paid to the buyer before CRC ever touches it.

---

## Step 2: Split Calculation

```
agent_basis (office_gross):           $8,500   (100% - the commission after rebate)
Agent Split (85%):                    $7,225   (agent_gross)
Brokerage Split (15%):                $1,275   (brokerage_split - counts toward cap)
```

---

## Step 3: Fees Deducted

```
agent_gross:                          $7,225
- Processing Fee:                     -$ 150
- Coaching Fee:                       -$   0
- Other Fees:                         -$   0
───────────────────────────────────────────────
amount_1099_reportable:               $7,075   ◄── Goes on Sarah's 1099
```

**The 1099 stops here.** Everything above is taxable income to Sarah. Everything below is payment logistics.

---

## Step 4: Debts Applied

```
amount_1099_reportable:               $7,075
- Outstanding Debt Applied:           -$ 200   (debts_deducted)
───────────────────────────────────────────────
agent_net (cash to Sarah):            $6,875
```

**Note:** Sarah still owes tax on $7,075, even though she only received $6,875. The $200 was her income that paid off her debt.

---

## Step 5: Office Net (CRC's Profit)

```
Brokerage Split (15%):                $1,275
+ Processing Fee:                     +$ 150
+ Coaching Fee:                       +$   0
───────────────────────────────────────────────
office_net:                           $1,425
+ Debt Collected:                     +$ 200   (not really "profit" but cash received)
───────────────────────────────────────────────
Total cash retained by CRC:           $1,625
```

---

## The Database Records

### transactions table
```json
{
  "id": "abc-123",
  "transaction_type": "buyer_v2",
  "status": "closed",
  "property_address": "123 Main St",
  "sales_price": 300000,
  "gross_commission": 9000,
  "office_gross": 8500,
  "office_net": 1425,
  "rebate_amount": 500,
  "closing_date": "2026-03-30"
}
```

### transaction_internal_agents table (Sarah's record)
```json
{
  "id": "tia-456",
  "transaction_id": "abc-123",
  "agent_id": "sarah-uuid",
  "agent_role": "primary_agent",
  "commission_plan": "85/15",
  
  "agent_basis": 8500,
  "split_percentage": 85,
  "brokerage_split": 1275,
  "agent_gross": 7225,
  
  "processing_fee": 150,
  "coaching_fee": 0,
  "other_fees": 0,
  
  "amount_1099_reportable": 7075,
  "debts_deducted": 200,
  "agent_net": 6875,
  
  "payment_status": "paid",
  "payment_date": "2026-03-30",
  "payment_method": "ACH",
  "funding_source": "crc"
}
```

### users table (cap progress update)
```json
{
  "id": "sarah-uuid",
  "cap_progress": 1275,  // Added brokerage_split to previous
  "qualifying_transaction_count": 1  // Incremented for New Agent Plan
}
```

### agent_debts table (debt marked paid)
```json
{
  "id": "debt-789",
  "agent_id": "sarah-uuid",
  "debt_type": "monthly_fee",
  "amount_owed": 200,
  "amount_paid": 200,
  "amount_remaining": 0,
  "status": "paid",
  "date_resolved": "2026-03-30",
  "offset_transaction_id": "abc-123",
  "offset_transaction_agent_id": "tia-456"
}
```

---

## What If Title Pays Agent Directly?

Same calculations, but:
- `funding_source` = `'title_direct'`
- CRC still tracks everything for 1099/cap purposes
- CRC never physically receives or pays the commission

---

## Team Transaction Example

If Sarah is on Briana Thomas's team (Clutch City Realty Group):

### Additional Records

**Sarah's record (as above, but with team split applied)**

**Briana's record (team_lead role)**
```json
{
  "id": "tia-789",
  "transaction_id": "abc-123",
  "agent_id": "briana-uuid",
  "agent_role": "team_lead",
  
  "agent_basis": 0,
  "agent_gross": 0,
  "agent_net": 1445,  // Her team lead commission from Sarah's deal
  
  "amount_1099_reportable": 1445,  // Full amount goes on Briana's 1099
  "payment_status": "paid",
  "payment_date": "2026-03-30"
}
```

---

## End-of-Year 1099 Query

```sql
SELECT 
  u.first_name || ' ' || u.last_name as agent_name,
  SUM(tia.amount_1099_reportable) as total_1099
FROM transaction_internal_agents tia
JOIN users u ON tia.agent_id = u.id
WHERE tia.payment_status = 'paid'
  AND tia.payment_date >= '2026-01-01'
  AND tia.payment_date <= '2026-12-31'
GROUP BY u.id, u.first_name, u.last_name
HAVING SUM(tia.amount_1099_reportable) >= 600  -- Only 1099 if >= $600
ORDER BY total_1099 DESC;
```

This automatically combines:
- Primary agent income
- Team lead income
- Revenue share income

Into one total per person.
