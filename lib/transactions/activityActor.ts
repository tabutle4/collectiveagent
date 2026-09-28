import { supabaseAdmin } from '@/lib/supabase'

/**
 * Put a name against the history rows an edit just produced.
 *
 * transaction_activity is written by a database trigger (migrations/checks/16),
 * which is what makes the history complete - it cannot be forgotten by a route
 * that takes a shortcut. The cost of that is that the trigger sees one service
 * credential and has no idea which person was logged in, so every row it writes
 * has a null actor.
 *
 * This closes the gap from the other side. A route records the time just before
 * it starts changing things, does its work, and then calls this to claim the
 * rows that appeared in between.
 *
 * Why after rather than during: the alternative is passing an actor down
 * through recomputeOfficeNet and everything it calls, which is twenty-six call
 * sites deep in code that has nothing to do with who is logged in. This keeps
 * the knowledge of "who" at the edge of the system, where it actually exists.
 *
 * Only rows with no actor already on them are claimed, so a nested call that
 * stamped its own rows first keeps its own attribution.
 *
 * Best effort by design. A failure here means a history row reads "System"
 * instead of a name; it must never fail the edit that the person actually
 * asked for, which has already been written by the time this runs.
 */
export async function stampActivityActor(opts: {
  /** The deal whose rows to claim. */
  transactionId: string
  /** ISO timestamp captured BEFORE the edit began. */
  since: string
  /** The logged-in person, when a person did this. */
  actorId?: string | null
  /** The job's name, when no person did. Ignored if actorId is set. */
  actorLabel?: string | null
}): Promise<void> {
  const { transactionId, since, actorId, actorLabel } = opts
  if (!transactionId || !since) return
  if (!actorId && !actorLabel) return

  // A person wins over a label. Never both: the activity API reads actor_id
  // first, and a row carrying both would claim to be a person and a job.
  const patch = actorId
    ? { actor_id: actorId }
    : { actor_label: actorLabel }

  try {
    const { error } = await supabaseAdmin
      .from('transaction_activity')
      .update(patch)
      .eq('transaction_id', transactionId)
      .gte('occurred_at', since)
      .is('actor_id', null)
      .is('actor_label', null)
    if (error) {
      console.warn('stampActivityActor could not claim rows:', error.message)
    }
  } catch (e: any) {
    console.warn('stampActivityActor failed:', e?.message || e)
  }
}

/**
 * The timestamp to hand back to stampActivityActor as `since`.
 *
 * Wound back a couple of seconds on purpose. The database writes occurred_at
 * with its own clock, and a Vercel function's clock can sit slightly ahead of
 * Postgres's. Without the margin, a row written microseconds after the edit
 * began can carry a timestamp fractionally before it and never be claimed.
 * The cost of the margin is that an edit made by someone else on the same deal
 * inside that window could be attributed to this person - two people editing
 * the same deal in the same two seconds - which is rarer than the clock skew
 * it protects against.
 */
export function activityStampPoint(): string {
  return new Date(Date.now() - 2000).toISOString()
}
