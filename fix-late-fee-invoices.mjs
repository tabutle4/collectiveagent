// One-time fix: restores Monthly Fee line item on invoices where it was
// replaced by the Late Fee (items[0] bug). Run once in Codespaces:
//
//   PAYLOAD_SECRET_KEY=xxx PAYLOAD_PROCESSING_ID=xxx node fix-late-fee-invoices.mjs

const PAYLOAD_SECRET_KEY = process.env.PAYLOAD_SECRET_KEY
const PAYLOAD_PROCESSING_ID = process.env.PAYLOAD_PROCESSING_ID

if (!PAYLOAD_SECRET_KEY || !PAYLOAD_PROCESSING_ID) {
  console.error('Missing env vars. Run as:')
  console.error('PAYLOAD_SECRET_KEY=xxx PAYLOAD_PROCESSING_ID=xxx node fix-late-fee-invoices.mjs')
  process.exit(1)
}

const plAuth = () =>
  'Basic ' + Buffer.from(PAYLOAD_SECRET_KEY + ':').toString('base64')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getAllUnpaidInvoices() {
  // Fetch all unpaid invoices across all customers, up to 100
  const res = await fetch(
    'https://api.payload.com/invoices/?status=unpaid&limit=100',
    { headers: { Authorization: plAuth() } }
  )
  const data = await res.json()
  return data.values || []
}

async function fixInvoice(inv) {
  // A broken invoice has ONLY a Late Fee item (Monthly Fee was overwritten)
  const items = inv.items || []
  const hasLateFee = items.some((i) => i.type === 'Late Fee')
  const hasMonthlyFee = items.some((i) => i.type === 'Monthly Fee')

  if (!hasLateFee || hasMonthlyFee) return false // not broken, skip

  console.log(`Fixing invoice ${inv.id} for customer ${inv.customer_id}`)
  console.log(`  Current items: ${items.map((i) => i.type).join(', ')}`)

  // Determine month label from the late fee applied date or just use current month
  const now = new Date()
  const monthName = now.toLocaleString('default', { month: 'long' })
  const year = now.getFullYear()
  const description = `${monthName} ${year} Monthly Brokerage Fee`

  // PUT the invoice with both items restored:
  // items[0] = Monthly Fee (restored), items[1] = Late Fee (kept)
  const updateRes = await fetch(`https://api.payload.com/invoices/${inv.id}`, {
    method: 'PUT',
    headers: {
      Authorization: plAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'items[0][type]': 'Monthly Fee',
      'items[0][description]': description,
      'items[0][amount]': '50',
      'items[0][entry_type]': 'charge',
      'items[1][type]': 'Late Fee',
      'items[1][description]': 'Late fee: payment not received by the 5th',
      'items[1][amount]': '25',
      'items[1][entry_type]': 'charge',
    }),
  })

  const result = await updateRes.json()
  if (updateRes.ok) {
    console.log(`  ✓ Fixed — now $75 ($50 Monthly Fee + $25 Late Fee)`)
    return true
  } else {
    console.error(`  ✗ Failed: ${result.message}`)
    return false
  }
}

async function main() {
  console.log('Fetching all unpaid invoices...\n')
  const invoices = await getAllUnpaidInvoices()
  console.log(`Found ${invoices.length} unpaid invoices total\n`)

  let fixed = 0
  let skipped = 0
  let failed = 0

  for (const inv of invoices) {
    const result = await fixInvoice(inv)
    if (result === true) fixed++
    else if (result === false) skipped++
    else failed++
    await sleep(200) // be gentle with the API
  }

  console.log(`\nDone.`)
  console.log(`  Fixed:   ${fixed}`)
  console.log(`  Skipped: ${skipped} (already correct)`)
  console.log(`  Failed:  ${failed}`)
}

main().catch(console.error)
