'use client'

import { X } from 'lucide-react'
import MarkPaidPanel from './MarkPaidPanel'

interface Props {
  transactionId: string
  tia: {
    id: string
    agent_id: string
    agent_role: string
    agent_net: number
    transaction_type?: string
  }
  isLease?: boolean
  label?: string
  onClose: () => void
  onMarked: () => void
}

export default function MarkPaidPanelModal({ transactionId, tia, isLease, label, onClose, onMarked }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm my-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-luxury-gray-5">
          <div>
            <h2 className="text-sm font-semibold text-luxury-gray-1">Mark Paid</h2>
            {label && <p className="text-xs text-luxury-gray-3 mt-0.5">{label}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 pb-5">
          <MarkPaidPanel
            transactionId={transactionId}
            tia={tia}
            isLease={isLease}
            onCancel={onClose}
            onMarked={onMarked}
          />
        </div>
      </div>
    </div>
  )
}
