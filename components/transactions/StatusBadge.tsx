import { STATUS_LABELS, STATUS_COLORS, TransactionStatus } from '@/lib/transactions/types'

interface StatusBadgeProps {
  status: TransactionStatus
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`status-badge ${STATUS_COLORS[status] || 'text-luxury-gray-3'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}
