import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

const VALID_LAYOUTS = ['classic', 'stacked', 'noLogo', 'mobile']

// Format raw phone digits to (XXX) XXX-XXXX
function formatPhone(value: string | null | undefined): string {
  if (!value) return ''
  const digits = String(value).replace(/\D/g, '')
  const cleaned = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits
  if (cleaned.length === 0) return ''
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
  return value // return original if not a clean 10-digit number
}

// Map users.office + mls_choice to the signature tool's expected office labels
function mapOfficeToSignatureLabel(user: any): string {
  if (!user) return ''
  if (user.mls_choice === 'Referral Collective (No MLS)') {
    return 'Referral Collective'
  }
  const office = user.office
  if (!office) return ''
  const o = String(office).trim().toLowerCase()
  if (o === 'houston' || o === 'houston office') return 'Houston Office'
  if (o === 'dfw' || o === 'irving' || o === 'irving office' || o === 'dallas') return 'Irving Office'
  return ''
}

// Build a social URL from a handle if a full URL is not already stored
function handleToInstagramUrl(handle: string | null | undefined): string {
  if (!handle) return ''
  const clean = handle.trim().replace(/^@/, '')
  if (!clean) return ''
  if (clean.startsWith('http')) return clean
  return `https://instagram.com/${clean}`
}
function handleToTiktokUrl(handle: string | null | undefined): string {
  if (!handle) return ''
  const clean = handle.trim().replace(/^@/, '')
  if (!clean) return ''
  if (clean.startsWith('http')) return clean
  return `https://tiktok.com/@${clean}`
}
function handleToThreadsUrl(handle: string | null | undefined): string {
  if (!handle) return ''
  const clean = handle.trim().replace(/^@/, '')
  if (!clean) return ''
  if (clean.startsWith('http')) return clean
  return `https://threads.net/@${clean}`
}

// Build a single-line address string from individual address parts
function joinAddress(line1: string, line2: string, city: string, state: string, zip: string): string {
  const street = [line1, line2].filter(Boolean).join(' ').trim()
  const cityStateZip = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ').trim()
  return [street, cityStateZip].filter(Boolean).join(', ')
}

// Build a structured object with all 3 offices' address data, used by the signature component
function buildOfficeData(company: any) {
  return {
    houston: {
      address: joinAddress(
        company?.houston_address_line1 || '13201 Northwest Fwy',
        company?.houston_address_line2 || 'Ste 450',
        company?.houston_city || 'Houston',
        company?.houston_state || 'TX',
        company?.houston_zip || '77040'
      ),
      phone: company?.houston_phone || '(281) 638-9407',
      fax: company?.houston_fax || '(281) 516-5806',
    },
    irving: {
      address: joinAddress(
        company?.dfw_address_line1 || '2300 Valley View Ln',
        company?.dfw_address_line2 || 'Ste 518',
        company?.dfw_city || 'Irving',
        company?.dfw_state || 'TX',
        company?.dfw_zip || '75062'
      ),
      phone: company?.dfw_phone || '',
      fax: company?.dfw_fax || '',
    },
    referral: {
      brandName: company?.rc_brand_name || 'Referral Collective',
      address: joinAddress(
        company?.rc_address_line1 || '13201 Northwest Fwy',
        company?.rc_address_line2 || 'Ste 450',
        company?.rc_city || 'Houston',
        company?.rc_state || 'TX',
        company?.rc_zip || '77040'
      ),
      phone: company?.rc_phone || '(281) 638-9407',
      fax: company?.rc_fax || '',
      logoUrl: company?.rc_logo_url || '',
      website: company?.rc_website || 'https://coachingbrokerage.com',
    },
    crc: {
      companyName: company?.agency_name || 'Collective Realty Co.',
      website: company?.website || 'https://coachingbrokerage.com',
    },
  }
}

// Determine office-specific fields for the form data based on user's effective office
function applyOfficeOverrides(formData: any, user: any, officeData: any) {
  const isRC = user?.mls_choice === 'Referral Collective (No MLS)'
  if (isRC) {
    formData.companyName = officeData.referral.brandName
    formData.officePhone = officeData.referral.phone
    formData.officeFax = officeData.referral.fax
    formData.website = officeData.referral.website
    formData.selectedOffice = 'Referral Collective'
  } else {
    formData.companyName = officeData.crc.companyName
    formData.website = officeData.crc.website
    // Phone/fax based on which CRC office (Houston vs Irving)
    if (formData.selectedOffice === 'Irving Office') {
      formData.officePhone = officeData.irving.phone || officeData.houston.phone
      formData.officeFax = officeData.irving.fax || officeData.houston.fax
    } else {
      formData.officePhone = officeData.houston.phone
      formData.officeFax = officeData.houston.fax
    }
  }
  return formData
}

// Build the form_data defaults from users + company_settings
function buildDefaults(user: any, company: any) {
  const fullName = [
    user?.preferred_first_name || user?.first_name || '',
    user?.preferred_last_name || user?.last_name || '',
  ].join(' ').trim()

  const rawMobile =
    user?.business_phone ||
    user?.personal_phone ||
    user?.phone ||
    ''
  const mobile = formatPhone(rawMobile)

  const officeData = buildOfficeData(company)

  const formData: any = {
    name: fullName,
    title: user?.job_title || '',
    mobile,
    email: user?.office_email || user?.email || '',
    website: company?.website || 'https://coachingbrokerage.com',
    companyName: company?.agency_name || 'Collective Realty Co.',
    officePhone: company?.phone || '(281) 638-9407',
    officeFax: '(281) 516-5806',
    selectedOffice: mapOfficeToSignatureLabel(user),
    instagram: handleToInstagramUrl(user?.instagram_handle),
    facebook: user?.facebook_url || '',
    linkedin: user?.linkedin_url || '',
    twitter: '',
    youtube: user?.youtube_url || '',
    tiktok: handleToTiktokUrl(user?.tiktok_handle),
    threads: handleToThreadsUrl(user?.threads_handle),
    includeLink1: false,
    linkText1: '',
    linkUrl1: '',
    includeLink2: false,
    linkText2: '',
    linkUrl2: '',
  }
}

// GET — return saved signature for the user + layout, or auto-populated defaults if none
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const layout = searchParams.get('layout') || 'classic'

  if (!VALID_LAYOUTS.includes(layout)) {
    return NextResponse.json({ success: false, error: 'Invalid layout' }, { status: 400 })
  }

  try {
    // First, look for a saved signature for this user + layout
    const { data: saved, error } = await supabaseAdmin
      .from('email_signatures')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('layout', layout)
      .maybeSingle()

    if (error) {
      console.error('email_signatures GET error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Fetch user + company in parallel — needed for office_data regardless of whether a saved signature exists
    const [{ data: userRow }, { data: companyRow }] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select(
          'preferred_first_name, preferred_last_name, first_name, last_name, job_title, business_phone, personal_phone, phone, email, office_email, office, mls_choice, instagram_handle, tiktok_handle, threads_handle, youtube_url, linkedin_url, facebook_url, headshot_url'
        )
        .eq('id', auth.user.id)
        .maybeSingle(),
      supabaseAdmin
        .from('company_settings')
        .select(
          'agency_name, phone, website, brokerage_address_line1, brokerage_address_line2, brokerage_city, brokerage_state, brokerage_zip, ' +
          'houston_address_line1, houston_address_line2, houston_city, houston_state, houston_zip, houston_phone, houston_fax, ' +
          'dfw_address_line1, dfw_address_line2, dfw_city, dfw_state, dfw_zip, dfw_phone, dfw_fax, ' +
          'rc_brand_name, rc_address_line1, rc_address_line2, rc_city, rc_state, rc_zip, rc_phone, rc_fax, rc_logo_url, rc_website'
        )
        .limit(1)
        .maybeSingle(),
    ])

    const officeData = buildOfficeData(companyRow)

    if (saved) {
      // Return the saved row as-is, plus office_data so the dropdown still works
      return NextResponse.json({
        success: true,
        signature: saved,
        office_data: officeData,
        source: 'saved',
      })
    }

    // No saved signature — auto-populate defaults from users + company_settings
    const formData = buildDefaults(userRow, companyRow)
    applyOfficeOverrides(formData, userRow, officeData)

    const isRC = userRow?.mls_choice === 'Referral Collective (No MLS)'

    // Return a synthesized "signature" object with default values + the user's headshot
    const synthesized = {
      id: null,
      user_id: auth.user.id,
      layout,
      form_data: formData,
      photo_url: userRow?.headshot_url || null,
      photo_url_square: userRow?.headshot_url || null,
      logo_url: isRC ? officeData.referral.logoUrl : null,
      logo_url_square: isRC ? officeData.referral.logoUrl : null,
      cta_image_url: null,
      cta_link: null,
      border_color: '#000000',
      show_border: true,
      signature_type: 'with-photo',
      created_at: null,
      updated_at: null,
    }

    return NextResponse.json({
      success: true,
      signature: synthesized,
      office_data: officeData,
      source: 'defaults',
    })
  } catch (err: any) {
    console.error('email_signatures GET exception:', err)
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 })
  }
}

// POST — upsert signature for user + layout
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const {
      layout,
      form_data,
      photo_url,
      photo_url_square,
      logo_url,
      logo_url_square,
      cta_image_url,
      cta_link,
      border_color,
      show_border,
      signature_type,
    } = body

    if (!layout || !VALID_LAYOUTS.includes(layout)) {
      return NextResponse.json({ success: false, error: 'Invalid layout' }, { status: 400 })
    }

    const upsertRow = {
      user_id: auth.user.id,
      layout,
      form_data: form_data || {},
      photo_url: photo_url || null,
      photo_url_square: photo_url_square || null,
      logo_url: logo_url || null,
      logo_url_square: logo_url_square || null,
      cta_image_url: cta_image_url || null,
      cta_link: cta_link || null,
      border_color: border_color || '#000000',
      show_border: show_border !== false,
      signature_type: signature_type || 'with-photo',
    }

    const { data, error } = await supabaseAdmin
      .from('email_signatures')
      .upsert(upsertRow, { onConflict: 'user_id,layout' })
      .select()
      .single()

    if (error) {
      console.error('email_signatures POST error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, signature: data })
  } catch (err: any) {
    console.error('email_signatures POST exception:', err)
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 })
  }
}

// DELETE — reset for the user + layout (delete the row)
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const layout = searchParams.get('layout')

  if (!layout || !VALID_LAYOUTS.includes(layout)) {
    return NextResponse.json({ success: false, error: 'Invalid layout' }, { status: 400 })
  }

  try {
    const { error } = await supabaseAdmin
      .from('email_signatures')
      .delete()
      .eq('user_id', auth.user.id)
      .eq('layout', layout)

    if (error) {
      console.error('email_signatures DELETE error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('email_signatures DELETE exception:', err)
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 })
  }
}