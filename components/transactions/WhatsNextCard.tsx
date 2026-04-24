'use client'

/**
 * "What's next" card. Copy and primary action change based on the current
 * pipeline stage and the viewer's role.
 *
 * For broker/admin/ops the card prompts the next action Tara should take.
 * For agents, the card tells them what to expect next from their side.
 * TC sees compliance-focused next steps.
 *
 * The card is read-only when there's nothing actionable for the viewer —
 * no primary button renders in that case.
 */

import type { PipelineStage } from '@/lib/transactions/stage'
import type { AppRole } from '@/lib/transactions/role'

interface NextStep {
  copy: string
  action?: {
    label: string
    onClick: () => void
    disabled?: boolean
  }
}

export default function WhatsNextCard({
  stage,
  role,
  transaction,
  onReleaseToAgents,
  onMarkCompliant,
}: {
  stage: PipelineStage
  role: AppRole
  transaction: any
  onReleaseToAgents?: () => void
  onMarkCompliant?: () => void
}) {
  const next = computeNextStep({
    stage,
    role,
    transaction,
    onReleaseToAgents,
    onMarkCompliant,
  })

  return (
    <div id="whats-next" className="container-card">
      <p className="field-label mb-1">What's next</p>
      <p className="text-sm text-luxury-gray-1 leading-relaxed mb-3">
        {next.copy}
      </p>
      {next.action && (
        <button
          type="button"
          onClick={next.action.onClick}
          disabled={next.action.disabled}
          className="btn btn-primary text-xs px-3 py-1.5"
        >
          {next.action.label}
        </button>
      )}
    </div>
  )
}

function computeNextStep({
  stage,
  role,
  transaction,
  onReleaseToAgents,
  onMarkCompliant,
}: {
  stage: PipelineStage
  role: AppRole
  transaction: any
  onReleaseToAgents?: () => void
  onMarkCompliant?: () => void
}): NextStep {
  const released = !!transaction?.released_to_agent_at
  const isBrokerOrAdmin = role === 'broker' || role === 'admin'

  switch (stage) {
    case 'prospect':
      if (role === 'agent') {
        return {
          copy:
            'This prospect has a representation agreement but no property under contract yet. Add the property and contract details once your client signs.',
        }
      }
      return {
        copy:
          'The agent has signed a representation agreement. Progress will advance to Active once the listing is on MLS, or to Pending once the contract is signed.',
      }

    case 'active':
      return {
        copy:
          'The listing is active on MLS. Progress will advance once the contract is signed and the under contract date is set.',
      }

    case 'pending':
      if (role === 'agent') {
        return {
          copy:
            'The deal is under contract. Once all your documents are uploaded, your transaction coordinator will submit them for compliance review.',
        }
      }
      if (role === 'tc') {
        return {
          copy:
            'The deal is under contract. Submit the transaction documents for compliance review once the agent has uploaded everything needed.',
        }
      }
      return {
        copy:
          'The deal is under contract. It will move to Compliance Review once documents are submitted to the transaction coordinator.',
      }

    case 'compliance_review':
      if (role === 'tc' || isBrokerOrAdmin) {
        return {
          copy:
            'Compliance is reviewing transaction documents. When the review is complete, mark compliance complete to advance to Closed.',
          action: onMarkCompliant
            ? {
                label: 'Mark compliance complete',
                onClick: onMarkCompliant,
              }
            : undefined,
        }
      }
      return {
        copy:
          'Your transaction coordinator is reviewing documents. You will be notified once compliance is complete.',
      }

    case 'closed':
      return {
        copy:
          'The deal has closed and compliance is complete. The title company will wire commission to the brokerage, and a check entry will be created when funds arrive.',
      }

    case 'awaiting_payment':
      if (isBrokerOrAdmin) {
        return {
          copy:
            'The deal is closed and compliance is complete. Create a check entry in Checks & Payouts once the title company delivers funds.',
        }
      }
      return {
        copy:
          'The deal is closed. The brokerage is waiting on the title company to deliver commission. Payouts will process once funds are received.',
      }

    case 'funded':
      if (isBrokerOrAdmin) {
        if (!released) {
          return {
            copy:
              'Funds are received. Verify each agent\'s commission in the Commissions section below, then release to agents to send statements and open their payouts.',
            action: onReleaseToAgents
              ? {
                  label: 'Release to agents',
                  onClick: onReleaseToAgents,
                }
              : undefined,
          }
        }
        return {
          copy:
            'Commissions have been released to agents. Mark each agent paid as you send their payments.',
        }
      }
      if (role === 'agent') {
        if (!released) {
          return {
            copy:
              'Your deal has funded. Your broker is finalizing commission details. You will receive your commission statement once it is released.',
          }
        }
        return {
          copy:
            'Your commission statement is available. Your payout will process shortly and you will be notified when it is sent.',
        }
      }
      return {
        copy: 'Funds are received. Agent payouts will process once released.',
      }

    case 'paid_out':
      return {
        copy:
          'All agents have been paid out on this transaction. This deal is complete.',
      }
  }
}
