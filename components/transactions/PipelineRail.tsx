'use client'

/**
 * Horizontal pipeline rail showing transaction progression through 8 stages.
 * The connector line between stages fills with gold when a stage is done,
 * stays gray when upcoming. The current stage has a subtle halo around its dot.
 *
 * Cancelled transactions should NOT render this component — the caller
 * checks for the cancelled state and renders a text badge instead.
 *
 * MOBILE: eight labelled dots cannot fit 375px - at that width the labels
 * either overlap or force the page to scroll sideways. Below `md` this renders
 * a compact indicator instead: the current stage by name, its position in the
 * sequence, and one progress bar. The full rail returns at `md` and up. Both
 * read the same PIPELINE_STAGES order, so they cannot disagree.
 */

import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  stageState,
  type PipelineStage,
} from '@/lib/transactions/stage'

const STAGE_LABEL_DISPLAY: Record<PipelineStage, React.ReactNode> = {
  prospect: 'Prospect',
  active: 'Active',
  pending: 'Pending',
  compliance_review: (
    <>
      Compliance
      <br />
      Review
    </>
  ),
  closed: 'Closed',
  awaiting_payment: (
    <>
      Awaiting
      <br />
      Payment
    </>
  ),
  funded: 'Funded',
  paid_out: 'Paid Out',
}

export default function PipelineRail({
  currentStage,
}: {
  currentStage: PipelineStage
}) {
  const currentIdx = PIPELINE_STAGES.indexOf(currentStage)
  const stepNumber = currentIdx + 1
  const totalSteps = PIPELINE_STAGES.length

  return (
    <div className="bg-luxury-light border-y border-luxury-gray-5 px-4 py-3.5">
      {/* Compact indicator, phones only */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-medium text-chart-gold-10 truncate">
            {STAGE_LABELS[currentStage]}
          </span>
          <span className="text-[11px] text-luxury-gray-3 flex-shrink-0">
            Step {stepNumber} of {totalSteps}
          </span>
        </div>
        {/* One segment per stage, filled up to the current one. Same shape the
            onboarding tracker's step bar uses, and it needs no dynamic width -
            a computed Tailwind class would not survive the build, and an
            inline style is not how this app draws layout. */}
        <div
          className="flex gap-1"
          role="progressbar"
          aria-valuenow={stepNumber}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-label={`Pipeline stage: ${STAGE_LABELS[currentStage]}, step ${stepNumber} of ${totalSteps}`}
        >
          {PIPELINE_STAGES.map((stage, i) => (
            <div
              key={stage}
              className={`h-1.5 flex-1 rounded ${i <= currentIdx ? 'bg-chart-gold-7' : 'bg-chart-gray-3'}`}
            />
          ))}
        </div>
      </div>

      {/* Full rail, md and up */}
      <div className="hidden md:flex items-start gap-0">
        {PIPELINE_STAGES.map((stage, idx) => {
          const state = stageState(stage, currentStage)
          const isLast = idx === PIPELINE_STAGES.length - 1

          const dotBase =
            'relative z-10 w-2.5 h-2.5 rounded-full border-[1.5px] transition-colors'
          const dotClass =
            state === 'done'
              ? `${dotBase} bg-chart-gold-7 border-chart-gold-7`
              : state === 'current'
              ? `${dotBase} bg-chart-gold-5 border-chart-gold-5 shadow-[0_0_0_3px_rgba(197,162,120,0.25)]`
              : `${dotBase} bg-chart-gray-3 border-chart-gray-3`

          const labelClass =
            state === 'current'
              ? 'text-chart-gold-10 font-medium'
              : state === 'done'
              ? 'text-luxury-gray-2'
              : 'text-luxury-gray-3'

          const connectorClass =
            state === 'done' ? 'bg-chart-gold-7' : 'bg-chart-gray-3'

          return (
            <div
              key={stage}
              className="flex-1 flex flex-col items-center gap-1.5 relative"
            >
              <div className={dotClass} aria-hidden="true" />
              <span
                className={`text-[9.5px] text-center whitespace-nowrap leading-tight ${labelClass}`}
                aria-current={state === 'current' ? 'step' : undefined}
              >
                {STAGE_LABEL_DISPLAY[stage] ?? STAGE_LABELS[stage]}
              </span>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`absolute top-[5px] left-1/2 right-[-50%] h-[1.5px] z-0 ${connectorClass}`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
