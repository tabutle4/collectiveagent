import { supabaseAdmin } from '@/lib/supabase'

/**
 * Flyer creation driven by the `forms` table instead of hardcoded route logic.
 *
 * Each form row carries its own flyer config:
 *   triggers_flyer  boolean  - does submitting this form create a flyer?
 *   flyer_type      text     - which flyer, e.g. 'just_listed' / 'under_contract'
 *
 * A route that needs a dynamic type (compliance can produce either just_sold or
 * just_leased depending on the deal) passes `typeOverride` and leaves
 * forms.flyer_type null. Everything else reads the type from the config, so a
 * new form can start producing flyers by flipping a switch in the admin UI with
 * no code change.
 */

export interface FormFlyerConfig {
  id: string
  triggers_flyer: boolean | null
  flyer_type: string | null
  notification_emails: string[] | null
  name?: string | null
}

/** Load a form row (and its flyer config) by linked_form_type. */
export async function getFormConfig(linkedFormType: string): Promise<FormFlyerConfig | null> {
  const { data } = await supabaseAdmin
    .from('forms')
    .select('id, name, notification_emails, triggers_flyer, flyer_type')
    .eq('linked_form_type', linkedFormType)
    .eq('is_active', true)
    .maybeSingle()
  return (data as FormFlyerConfig) || null
}

/**
 * Create the flyer for a submitted form, if that form is configured to make one.
 *
 * Idempotent: if a flyer of the same type already exists on the transaction it
 * does nothing, so re-submitting a form never creates duplicates. Never throws;
 * a flyer failure must not roll back the form submission.
 */
export async function createFlyerFromForm(params: {
  form: FormFlyerConfig | null
  transactionId: string | null
  agentId: string | null
  flyerDivision?: string | null
  typeOverride?: string | null
}): Promise<void> {
  const { form, transactionId, agentId, stats, flyerDivision, typeOverride } = params

  try {
    if (!form || !transactionId || !agentId) return
    if (!form.triggers_flyer) return

    const flyerType = typeOverride || form.flyer_type
    if (!flyerType) {
      console.error(`createFlyerFromForm: form ${form.id} has triggers_flyer set but no flyer_type`)
      return
    }

    const { data: existing } = await supabaseAdmin
      .from('transaction_flyers')
      .select('id')
      .eq('transaction_id', transactionId)
      .eq('flyer_type', flyerType)
      .maybeSingle()
    if (existing) return

    await supabaseAdmin.from('transaction_flyers').insert({
      transaction_id: transactionId,
      flyer_type: flyerType,
      status: 'requested',
      requested_by: agentId,
      flyer_division: flyerDivision || null,
      updated_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('createFlyerFromForm error:', err)
  }
}
