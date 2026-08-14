import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { Resend } from 'resend'
import { getEmailLayout } from '@/lib/email/layout'
import { escapeHtml } from '@/lib/agent-email-send'
import { preferredDisplayName } from '@/lib/agent-email'

const resend = new Resend(process.env.RESEND_API_KEY)

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// GET - Weekly reconciliation of the agent roster against TREC.
//
// Two kinds of query against the Texas open data licence export:
//
//   1. every active agent's licence number, joined on licence number only
//   2. everyone TREC shows sponsored by one of our broker companies
//
// Query 1 finds agents who left, lapsed, went inactive, or are running out
// of time. Query 2 finds people TREC has under us that the roster here does
// not. Neither is sufficient on its own.
//
// TWO BROKERAGES. Collective Realty Co. and Referral Collective are separate
// companies at TREC with separate licences. An agent sponsored by either one
// has not gone anywhere, so both are read from company_settings and both are
// treated as ours.
//
// WHAT IT WRITES
//   One column: users.license_expiration, and only when TREC's date differs
//   from the one stored here. The app's copy goes stale the day after
//   onboarding, which is the bug this fixes. Nothing else is written.
//
// WHAT IT NEVER WRITES
//   Anything that is a business decision rather than a TREC fact. It does not
//   deactivate agents, does not touch billing or waivers, does not set
//   compliance flags, and never emails an agent. A licence that returns no
//   TREC record is reported as unverified, never as unlicensed.
//
// Authenticated with CRON_SECRET only.

const DEFAULT_DATASET = 'https://data.texas.gov/resource/s7ft-44qi.json'
const FALLBACK_REPORT_EMAIL = 'office@collectiverealtyco.com'

// Socrata caps every query at 1000 rows when no limit is given, and returns
// the newest 1000 of roughly a quarter million records without saying so.
// Every query here passes an explicit limit.
const QUERY_LIMIT = 1000

// Each licence expands to three type variants, so this is 180 values per
// query rather than 60.
const LICENCE_CHUNK = 60

type TrecRecord = {
  license_number?: string
  full_name?: string
  status?: string
  license_expiration_date?: string
  original_license_date?: string
  related_license_number?: string
  related_license_full_name?: string
  related_license_start_date?: string
  updated?: string
}

type FindingCategory =
  | 'moved_firm'
  | 'expired_under_us'
  | 'sponsorship_dropped'
  | 'sae_due'
  | 'expiring_soon'
  | 'unknown_to_app'
  | 'date_corrected'
  | 'unverified'

type Finding = {
  key: string
  category: FindingCategory
  name: string
  licenseNumber: string
  detail: string
  facts?: string
  action?: string
}

const SECTIONS: { category: FindingCategory; heading: string; blurb: string }[] = [
  {
    category: 'moved_firm',
    heading: 'Moved to another brokerage',
    blurb: 'TREC shows someone else as their sponsoring broker. They are no longer ours.',
  },
  {
    category: 'expired_under_us',
    heading: 'Not in good standing, still sponsored by us',
    blurb: 'TREC names us as the supervising broker for someone who cannot currently practise.',
  },
  {
    category: 'sponsorship_dropped',
    heading: 'No sponsoring broker at TREC',
    blurb: 'TREC has ended the sponsorship. They cannot practise under us until it is restored.',
  },
  {
    category: 'sae_due',
    heading: 'First renewal due, SAE required',
    blurb: 'Ninety hours including the 30 hour Brokerage course. Renewing inactive does not skip it.',
  },
  {
    category: 'expiring_soon',
    heading: 'Expiring within 90 days',
    blurb: 'Continuing education cycle, or renew inactive without it.',
  },
  {
    category: 'unknown_to_app',
    heading: 'At TREC under us, not on the roster here',
    blurb: 'We are the broker of record for people this app is not tracking.',
  },
  {
    category: 'date_corrected',
    heading: 'Expiration date corrected',
    blurb: 'Already fixed here to match TREC. No action needed.',
  },
  {
    category: 'unverified',
    heading: 'Could not verify',
    blurb: 'No TREC record matched. Nothing was changed for these.',
  },
]

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// The two sides store licence numbers differently. users.license_number holds
// the bare number ("826320"); TREC's license_number carries a type suffix
// ("826320-SA"). Comparing them as-is matches nothing, so everything here is
// keyed on the bare core and the suffix is added back only when querying.
//
// Whitelisting rather than escaping also keeps anything odd in the users
// table out of the SoQL string.
const LICENCE_SUFFIXES = ['SA', 'BR', 'BB']

function licenceCore(value: string | null | undefined): string {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/(SA|BR|BB)$/, '')
}

function licenceVariants(core: string): string[] {
  return LICENCE_SUFFIXES.map(suffix => `${core}-${suffix}`)
}

// TREC returns MM/DD/YYYY. The users.license_expiration column is a date.
function trecDateToIso(value?: string | null): string | null {
  if (!value) return null
  const v = String(value).trim()
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) {
    const mm = us[1].padStart(2, '0')
    const dd = us[2].padStart(2, '0')
    return `${us[3]}-${mm}-${dd}`
  }
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return null
}

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function daysFrom(todayIso: string, targetIso: string): number {
  return Math.round((isoToUtcMs(targetIso) - isoToUtcMs(todayIso)) / 86400000)
}

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  // Day 0 of the month after the target is the target's last day. Clamping to
  // it stops a 31st rolling forward into the next month, which would print a
  // reinstatement deadline later than it really is. Texas licences always
  // expire on a month end, so this fires on every 31 day month.
  const lastDayOfTarget = new Date(Date.UTC(y, m + months, 0)).getUTCDate()
  const shifted = new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDayOfTarget)))
  return shifted.toISOString().split('T')[0]
}

// A Texas sales agent licence expires on the last day of the month two years
// after it was issued, so a first cycle is exactly 24 months wide. Anything
// else has already been renewed at least once and is on continuing education
// rather than SAE.
function isFirstRenewalCycle(originalIso: string | null, expirationIso: string | null): boolean {
  if (!originalIso || !expirationIso) return false
  const [oy, om] = originalIso.split('-').map(Number)
  const [ey, em] = expirationIso.split('-').map(Number)
  return ey * 12 + em - (oy * 12 + om) === 24
}

function formatIso(iso: string | null): string {
  if (!iso) return 'unknown'
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

// "on 06/06/2025, 433 days ago" - the elapsed time is what makes a stale
// record feel urgent rather than academic.
function whenPhrase(todayIso: string, targetIso: string | null): string {
  if (!targetIso) return ''
  const days = Math.abs(daysFrom(todayIso, targetIso))
  return `${formatIso(targetIso)}, ${days} ${plural(days, 'day', 'days')} ago`
}

function factsLine(record: TrecRecord, expIso: string | null, origIso: string | null): string {
  const bits: string[] = []
  if (record.status) bits.push(`TREC status ${record.status}`)
  if (expIso) bits.push(`licence expires ${formatIso(expIso)}`)
  if (origIso) bits.push(`licensed since ${formatIso(origIso)}`)
  if (record.updated) bits.push(`TREC record updated ${formatIso(trecDateToIso(record.updated))}`)
  return bits.join('. ') + (bits.length ? '.' : '')
}

// Every path that gives up has to say so in the same inbox that gets the
// report. Silence is supposed to mean the cron is broken, and nobody reads
// Vercel logs, so a run that dies quietly is indistinguishable from a clean
// week.
async function sendFailureEmail(recipients: string[], paragraphs: string[], detail: string) {
  try {
    await resend.emails.send({
      from: 'Collective Realty Co. <notifications@coachingbrokeragetools.com>',
      to: recipients,
      subject: 'License check: the run failed',
      html: getEmailLayout(
        [
          ...paragraphs.map(p => `<p style="margin:0 0 14px;">${escapeHtml(p)}</p>`),
          `<p style="margin:0;padding:11px 14px;background:#FAF8F5;border-left:3px solid #8B7355;font-family:monospace;font-size:12px;color:#4A4A4A;">${escapeHtml(
            detail.slice(0, 400)
          )}</p>`,
        ].join('\n'),
        {
          title: 'Weekly license check',
          subtitle: 'Run failed',
          preheader: 'The licence check did not finish.',
        }
      ),
    })
  } catch (mailError) {
    console.error('verify-licenses - failure email also failed:', mailError)
  }
}

async function queryTrec(where: string): Promise<TrecRecord[]> {
  const base = process.env.SOCRATA_TREC_DATASET_URL || DEFAULT_DATASET
  const url = `${base}?$limit=${QUERY_LIMIT}&$where=${encodeURIComponent(where)}`

  const headers: Record<string, string> = { Accept: 'application/json' }
  // Without an app token the request shares an anonymous throttle pool with
  // every other caller hitting data.texas.gov.
  if (process.env.SOCRATA_APP_TOKEN) headers['X-App-Token'] = process.env.SOCRATA_APP_TOKEN

  const res = await fetch(url, { headers, cache: 'no-store' })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`TREC query failed with ${res.status}: ${body.slice(0, 300)}`)
  }

  const rows = await res.json()
  if (!Array.isArray(rows)) throw new Error('TREC returned an unexpected payload shape')
  return rows as TrecRecord[]
}

function renderRows(findings: Finding[], newKeys: Set<string>): string {
  return findings
    .map(f => {
      const flag = newKeys.has(f.key)
        ? '<span style="background:#8B7355;color:#ffffff;font-size:10px;font-weight:700;letter-spacing:0.4px;padding:2px 6px;border-radius:3px;margin-right:8px;vertical-align:2px;">NEW</span>'
        : ''
      const facts = f.facts
        ? `<div style="color:#9A9A9A;font-size:12px;margin-top:3px;line-height:1.5;">${escapeHtml(f.facts)}</div>`
        : ''
      const action = f.action
        ? `<div style="margin-top:7px;padding:8px 11px;background:#FAF8F5;border-left:3px solid #8B7355;color:#4A4A4A;font-size:13px;line-height:1.5;"><strong style="color:#8B7355;">Do this:</strong> ${escapeHtml(f.action)}</div>`
        : ''
      return `<tr>
  <td style="padding:14px 0;border-bottom:1px solid #EFEDE9;vertical-align:top;">
    <div style="font-size:15px;color:#1A1A1A;">${flag}<strong>${escapeHtml(f.name)}</strong><span style="color:#A0A0A0;font-size:13px;font-weight:400;"> &middot; ${escapeHtml(f.licenseNumber)}</span></div>
    <div style="color:#333333;font-size:14px;margin-top:4px;line-height:1.45;">${escapeHtml(f.detail)}</div>
    ${facts}
    ${action}
  </td>
</tr>`
    })
    .join('\n')
}

function renderGlance(rows: { count: number; label: string; note: string }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 26px;background:#FAF8F5;border-radius:4px;">
${rows
  .map(
    r => `<tr>
  <td style="padding:9px 14px;font-size:22px;font-weight:700;color:#1A1A1A;width:44px;text-align:right;vertical-align:middle;">${r.count}</td>
  <td style="padding:9px 14px 9px 4px;vertical-align:middle;">
    <div style="font-size:14px;font-weight:600;color:#1A1A1A;">${escapeHtml(r.label)}</div>
    <div style="font-size:12px;color:#8A8A8A;">${escapeHtml(r.note)}</div>
  </td>
</tr>`
  )
  .join('\n')}
</table>`
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Declared outside the try so the failure path can still reach the inbox.
  let reportRecipients: string[] = [FALLBACK_REPORT_EMAIL]

  try {
    const nowIso = new Date().toISOString()
    const todayIso = nowIso.split('T')[0]

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('company_settings')
      .select('trec_broker_license_number, license_report_email')
      .single()
    if (settingsError) {
      console.error('verify-licenses - company_settings read failed:', settingsError)
    }

    // Resolved before anything can fail, so every giving-up path can reach the
    // inbox. Comma separated so more than one person can be on the report
    // without needing a distribution list.
    reportRecipients = String(settings?.license_report_email || FALLBACK_REPORT_EMAIL)
      .split(',')
      .map(address => address.trim())
      .filter(Boolean)
    if (reportRecipients.length === 0) reportRecipients.push(FALLBACK_REPORT_EMAIL)

    // Comma separated because Collective Realty Co. and Referral Collective
    // are two separate brokerages at TREC. An agent sponsored by either has
    // not gone anywhere.
    const ourLicenceQueries = String(settings?.trec_broker_license_number || '')
      .toUpperCase()
      .split(',')
      .map(value => value.replace(/[^A-Z0-9-]/g, ''))
      .filter(Boolean)
    const ourCores = new Set(ourLicenceQueries.map(licenceCore).filter(Boolean))

    if (ourCores.size === 0) {
      await sendFailureEmail(
        reportRecipients,
        [
          'This week\'s licence check did not run, so there is no report. Nothing was changed in the app.',
          'No broker licence number is configured, so there is nothing to compare the roster against. It needs company_settings.trec_broker_license_number set to the TREC licences for Collective Realty Co. and Referral Collective, comma separated.',
        ],
        'company_settings.trec_broker_license_number is empty.'
      )
      return NextResponse.json(
        {
          error:
            'company_settings.trec_broker_license_number is not set. Run the license monitor migration before enabling this cron.',
        },
        { status: 400 }
      )
    }

    const agents = await fetchAllRows<any>(
      'users',
      'id, first_name, last_name, preferred_first_name, preferred_last_name, email, role, license_number, license_expiration',
      { filters: [{ type: 'eq', column: 'is_active', value: true }] }
    )

    const withLicence = (agents || []).filter((a: any) => licenceCore(a.license_number))
    // Named rather than counted. Support and TC accounts hold no licence and
    // never will, so a bare number in the summary would read as a problem
    // every week forever.
    const missingLicence = (agents || [])
      .filter((a: any) => !licenceCore(a.license_number))
      .map((a: any) => `${preferredDisplayName(a)}${a.role ? ` (${a.role})` : ''}`)
      .sort()

    // --- Query 1: our roster, as TREC sees it ---------------------------

    const licenceCores = Array.from(new Set(withLicence.map((a: any) => licenceCore(a.license_number))))
    const byLicence = new Map<string, TrecRecord>()
    let recordsReturned = 0

    for (const group of chunk(licenceCores, LICENCE_CHUNK)) {
      // Ask for every licence type a person here could hold, because the
      // stored number does not say which one it is.
      const list = group.flatMap(licenceVariants).map(n => `'${n}'`).join(',')
      const rows = await queryTrec(`license_number in (${list})`)
      recordsReturned += rows.length
      for (const row of rows) {
        const key = licenceCore(row.license_number)
        if (!key) continue
        // One person can hold more than one licence type on the same number,
        // for example a broker who started as a sales agent. Both come back,
        // and without this the later row wins, so a terminated record can
        // mask an active one and the person reads as unsponsored.
        const existing = byLicence.get(key)
        if (!existing || (row.status || '').toLowerCase() === 'active') {
          byLicence.set(key, row)
        }
      }
    }

    // --- Query 2: TREC's roster for each of our brokerages ---------------

    const sponsored: TrecRecord[] = []
    for (const ourLicence of ourLicenceQueries) {
      const rows = await queryTrec(`related_license_number='${ourLicence}'`)
      recordsReturned += rows.length
      sponsored.push(...rows)
    }

    // --- Build findings -------------------------------------------------

    const findings: Finding[] = []
    const updates: { id: string; patch: Record<string, any> }[] = []
    let verifiedClean = 0

    for (const agent of withLicence) {
      const core = licenceCore(agent.license_number)
      const name = preferredDisplayName(agent)
      const record = byLicence.get(core)
      // Show TREC's canonical form once we have it, the stored one otherwise.
      const licence = record?.license_number?.trim() || String(agent.license_number || '').trim()

      if (!record) {
        findings.push({
          key: `unverified:${core}`,
          category: 'unverified',
          name,
          licenseNumber: licence,
          detail: `Licence number on file: ${licence || 'blank'}. No TREC record matched it.`,
          action: 'Check the licence number on their profile against their licence.',
        })
        continue
      }

      const expIso = trecDateToIso(record.license_expiration_date)
      const origIso = trecDateToIso(record.original_license_date)
      const sponsorCore = licenceCore(record.related_license_number)
      const status = (record.status || '').trim()
      const facts = factsLine(record, expIso, origIso)

      // The only write. TREC's date is taken as correct, but only when TREC
      // actually supplied one, so a sparse record can never blank out a date
      // the app already has. Agents whose date already matches are untouched.
      const storedExpIso = agent.license_expiration ? String(agent.license_expiration).split('T')[0] : null
      if (expIso && storedExpIso !== expIso) {
        updates.push({ id: agent.id, patch: { license_expiration: expIso } })
        findings.push({
          key: `date_corrected:${core}`,
          category: 'date_corrected',
          name,
          licenseNumber: licence,
          detail: `Stored here as ${formatIso(storedExpIso)}, TREC says ${formatIso(expIso)}. Updated to match TREC.`,
        })
      }

      let flagged = false

      const daysToExp = expIso ? daysFrom(todayIso, expIso) : null
      const expired = daysToExp !== null && daysToExp <= 0
      const activeStatus = status.toLowerCase() === 'active'

      if (sponsorCore && !ourCores.has(sponsorCore)) {
        const firm = record.related_license_full_name?.trim() || 'another brokerage'
        const since = trecDateToIso(record.related_license_start_date)
        findings.push({
          key: `moved_firm:${core}`,
          category: 'moved_firm',
          name,
          licenseNumber: licence,
          detail: since
            ? `Sponsored by ${firm} since ${whenPhrase(todayIso, since)}.`
            : `Sponsored by ${firm}.`,
          facts,
          action:
            'Take them off the roster. Deactivate the profile here, cancel the monthly fee in Payload, remove Microsoft 365 and MLS access, and reassign any open transactions. TREC has already ended our sponsorship, so they are not ours to supervise.',
        })
        flagged = true
      } else if (!sponsorCore) {
        const window = expIso ? addMonthsIso(expIso, 6) : null
        findings.push({
          key: `sponsorship_dropped:${core}`,
          category: 'sponsorship_dropped',
          name,
          licenseNumber: licence,
          detail: expired
            ? `Licence expired ${whenPhrase(todayIso, expIso)}, and TREC shows no sponsoring broker.`
            : `TREC shows no sponsoring broker. Status ${status || 'unknown'}, licence still current.`,
          facts,
          action: expired
            ? `Reinstatement window closes ${formatIso(window)}. Late fee plus the education, no re-exam before then. Pause their billing until it clears.`
            : 'The licence is current but unsponsored, so they cannot practise. Decide whether to sponsor them again or take them off the roster and stop billing.',
        })
        flagged = true
      } else if (expired || !activeStatus) {
        // Sponsored by us, but not in good standing. This is the highest
        // exposure on the list, because TREC still names us as supervising
        // broker for someone who cannot legally work.
        findings.push({
          key: `expired_under_us:${core}`,
          category: 'expired_under_us',
          name,
          licenseNumber: licence,
          detail: expired
            ? `Licence expired ${whenPhrase(todayIso, expIso)}, and TREC still lists us as the sponsoring broker.`
            : `TREC status is ${status || 'unknown'}, and TREC still lists us as the sponsoring broker.`,
          facts,
          action:
            'Confirm with them today. Until it clears they should not take new business under us, and it is the broker of record who carries that.',
        })
        flagged = true
      }

      // Deadline warnings only apply to a licence that has not already
      // lapsed. An expired one is covered by the sections above.
      if (expIso && daysToExp !== null) {
        const days = daysToExp
        if (days > 0 && isFirstRenewalCycle(origIso, expIso) && days <= 365) {
          findings.push({
            key: `sae_due:${core}`,
            category: 'sae_due',
            name,
            licenseNumber: licence,
            detail: `First renewal due ${formatIso(expIso)}, ${days} ${plural(days, 'day', 'days')} away. Licensed ${formatIso(origIso)}.`,
            facts,
            action:
              'Ninety hours of SAE including the 30 hour Real Estate Brokerage course. Renewing inactive does not skip it. Ask them today whether the hours are done.',
          })
          flagged = true
        } else if (days > 0 && days <= 90) {
          findings.push({
            key: `expiring_soon:${core}`,
            category: 'expiring_soon',
            name,
            licenseNumber: licence,
            detail: `Expires ${formatIso(expIso)}, ${days} ${plural(days, 'day', 'days')} away.`,
            facts,
            action: 'Continuing education and the renewal fee, or renew inactive without the education.',
          })
          flagged = true
        }
      }

      if (!flagged) verifiedClean += 1
    }

    // Anyone TREC sponsors under one of our brokerages who is not on the
    // roster here. Deduplicated, because query 2 runs once per brokerage.
    const activeCores = new Set(licenceCores)
    const seenUnknown = new Set<string>()
    for (const record of sponsored) {
      const core = licenceCore(record.license_number)
      const licence = record.license_number?.trim() || core
      if (!core || activeCores.has(core) || seenUnknown.has(core)) continue
      seenUnknown.add(core)
      const expIso = trecDateToIso(record.license_expiration_date)
      const origIso = trecDateToIso(record.original_license_date)
      const since = trecDateToIso(record.related_license_start_date)
      findings.push({
        key: `unknown_to_app:${core}`,
        category: 'unknown_to_app',
        name: record.full_name?.trim() || 'Name not given',
        licenseNumber: licence,
        detail: `${record.related_license_full_name?.trim() || 'One of our brokerages'} has sponsored this licence${
          since ? ` since ${whenPhrase(todayIso, since)}` : ''
        }, but there is no active person here with that number.`,
        facts: factsLine(record, expIso, origIso),
        action:
          'Either release the sponsorship at TREC, or add them here so they are being tracked. While TREC shows the sponsorship, the broker of record is responsible for them.',
      })
    }

    // --- Write TREC's dates back ----------------------------------------

    let updated = 0
    const updateErrors: string[] = []
    for (const batch of chunk(updates, 10)) {
      const results = await Promise.all(
        batch.map(u =>
          supabaseAdmin
            .from('users')
            .update(u.patch)
            .eq('id', u.id)
            .then(({ error }) => ({ id: u.id, error }))
        )
      )
      for (const r of results) {
        if (r.error) {
          console.error(`verify-licenses - update failed for ${r.id}:`, r.error)
          updateErrors.push(r.id)
        } else {
          updated += 1
        }
      }
    }

    // --- New since last run ---------------------------------------------

    const { data: priorRuns, error: priorError } = await supabaseAdmin
      .from('license_check_runs')
      .select('findings')
      .order('ran_at', { ascending: false })
      .limit(1)
    if (priorError) console.error('verify-licenses - prior run read failed:', priorError)

    const priorKeys = new Set<string>(
      Array.isArray(priorRuns?.[0]?.findings)
        ? (priorRuns![0].findings as any[]).map(f => String(f?.key || ''))
        : []
    )
    const newKeys = new Set(findings.map(f => f.key).filter(k => !priorKeys.has(k)))
    const isFirstRun = priorKeys.size === 0

    // --- Email ------------------------------------------------------------

    const movedCount = findings.filter(f => f.category === 'moved_firm').length
    // Corrected dates are already handled by the time the email is read, so
    // they are reported but never counted as work.
    const actionable = findings.filter(f => f.category !== 'date_corrected')
    const correctedCount = findings.length - actionable.length
    const openCount = actionable.length
    const newActionable = actionable.filter(f => newKeys.has(f.key)).length

    let subject: string
    if (movedCount > 0) {
      subject = `License check: ${movedCount} ${plural(movedCount, 'person has', 'people have')} moved to another brokerage`
    } else if (newActionable > 0) {
      subject = `License check: ${newActionable} new, ${openCount} open`
    } else if (openCount > 0) {
      subject = `License check: ${openCount} open, nothing new`
    } else if (correctedCount > 0) {
      subject = `License check: all clear, ${correctedCount} ${plural(correctedCount, 'date', 'dates')} corrected`
    } else {
      subject = 'License check: all clear'
    }

    const correctedNote = correctedCount
      ? ` ${correctedCount} expiration ${plural(correctedCount, 'date was', 'dates were')} corrected automatically, no action needed.`
      : ''
    const summaryLine = `${withLicence.length} ${plural(withLicence.length, 'licence', 'licences')} checked against TREC. ${verifiedClean} clean. ${openCount} ${plural(openCount, 'needs', 'need')} attention, ${newActionable} new since the last run.${correctedNote}`

    const parts: string[] = [
      `<p style="margin:0 0 14px;font-size:14px;color:#4A4A4A;line-height:1.6;">Every Monday this compares the roster here against the Texas licence register and reports what disagrees. It corrects one thing on its own, the expiration date stored on a profile. Everything below needs a person.</p>`,
      `<p style="margin:0 0 18px;font-size:15px;color:#1A1A1A;font-weight:600;line-height:1.5;">${escapeHtml(summaryLine)}</p>`,
    ]

    if (isFirstRun) {
      parts.push(
        `<p style="margin:0 0 18px;padding:11px 14px;background:#FBF7EF;border-left:3px solid #8B7355;font-size:13px;line-height:1.55;">This is the first run, so everything is marked new. From next week only genuinely new findings carry the tag and the rest read as still open.</p>`
      )
    }

    const glance = SECTIONS.filter(sec => findings.some(f => f.category === sec.category)).map(sec => ({
      count: findings.filter(f => f.category === sec.category).length,
      label: sec.heading,
      note: sec.blurb,
    }))
    if (glance.length > 0) parts.push(renderGlance(glance))

    for (const section of SECTIONS) {
      const rows = findings.filter(f => f.category === section.category)
      if (rows.length === 0) continue
      parts.push(`
<h3 style="margin:32px 0 2px;font-size:15px;color:#1A1A1A;border-top:2px solid #1A1A1A;padding-top:10px;">${escapeHtml(section.heading)} (${rows.length})</h3>
<p style="margin:0 0 8px;color:#8A8A8A;font-size:12px;line-height:1.5;">${escapeHtml(section.blurb)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
${renderRows(rows, newKeys)}
</table>`)
    }

    if (openCount === 0) {
      parts.push(
        `<p style="margin:20px 0 0;">Nothing to act on this week. Everyone on the roster with a licence number is in good standing and sponsored by us.</p>`
      )
    }

    if (missingLicence.length > 0) {
      parts.push(
        `<p style="margin:24px 0 0;color:#8A8A8A;font-size:12px;line-height:1.6;">Not checked, no licence number on file: ${escapeHtml(
          missingLicence.join(', ')
        )}.</p>`
      )
    }

    // Silence per section is otherwise ambiguous between "checked, nothing
    // found" and "not checked".
    const emptySections = SECTIONS.filter(sec => !findings.some(f => f.category === sec.category))
    if (emptySections.length > 0) {
      parts.push(
        `<p style="margin:8px 0 0;color:#8A8A8A;font-size:12px;line-height:1.6;">Checked, nothing found: ${escapeHtml(
          emptySections.map(sec => sec.heading.toLowerCase()).join(', ')
        )}.</p>`
      )
    }

    parts.push(
      `<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #EFEDE9;color:#8A8A8A;font-size:12px;line-height:1.6;">Source is the Texas open data licence export, matched on licence number, covering both Collective Realty Co. and Referral Collective. The only thing this changes in the app is the licence expiration date, and only where it disagreed with TREC. It does not deactivate anyone, does not change billing, and does not email agents. A licence with no TREC record is reported as unverified, never as unlicensed.</p>`
    )

    if (updateErrors.length > 0) {
      parts.push(
        `<p style="margin:12px 0 0;color:#B04A38;font-size:12px;">${escapeHtml(
          `${updateErrors.length} ${plural(updateErrors.length, 'record', 'records')} could not be updated. See the run log.`
        )}</p>`
      )
    }

    let emailed = false
    let emailError: string | null = null
    try {
      await resend.emails.send({
        from: 'Collective Realty Co. <notifications@coachingbrokeragetools.com>',
        to: reportRecipients,
        subject,
        html: getEmailLayout(parts.join('\n'), {
          title: 'Weekly license check',
          subtitle: new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }),
          preheader: summaryLine,
        }),
      })
      emailed = true
    } catch (err) {
      emailError = String(err)
      console.error('verify-licenses - report email failed:', err)
    }

    // --- Run log ----------------------------------------------------------

    const { error: runError } = await supabaseAdmin.from('license_check_runs').insert({
      ran_at: nowIso,
      agents_checked: withLicence.length,
      records_returned: recordsReturned,
      findings,
      summary: summaryLine,
    })
    if (runError) console.error('verify-licenses - run log insert failed:', runError)

    return NextResponse.json({
      success: true,
      agentsChecked: withLicence.length,
      missingLicenceNumber: missingLicence.length,
      recordsReturned,
      expirationDatesCorrected: updated,
      updateFailures: updateErrors.length,
      findings: openCount,
      newFindings: newActionable,
      emailed,
      emailError,
      subject,
    })
  } catch (error) {
    console.error('verify-licenses - run failed:', error)
    await sendFailureEmail(
      reportRecipients,
      [
        'This week\'s licence check did not finish, so there is no report. Nothing was changed in the app.',
        'The usual cause is the Texas open data service being unavailable or rate limiting us. It will try again next Monday on its own, or it can be run by hand.',
      ],
      String(error)
    )
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}
