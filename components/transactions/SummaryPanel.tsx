import { ProcessingFeeType } from '@/lib/transactions/types'
import { X, Check } from 'lucide-react'

interface SummaryPanelProps {
  typeName: string | null
  typeId: string
  isLease: boolean
  propertyAddress: string
  clientName: string
  salesPrice: string
  monthlyRent: string
  commissionRate: string
  closingDate: string
  moveInDate: string
  expediteRequested: boolean
  processingFee: number
  onClose?: () => void
}

export default function SummaryPanel({
  typeName,
  typeId,
  isLease,
  propertyAddress,
  clientName,
  salesPrice,
  monthlyRent,
  commissionRate,
  closingDate,
  moveInDate,
  expediteRequested,
  processingFee,
  onClose,
}: SummaryPanelProps) {
  const priceValue = isLease ? monthlyRent : salesPrice
  const dateValue = isLease ? moveInDate : closingDate

  return (
    <div className="container-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title mb-0">Summary</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden text-luxury-gray-3 hover:text-luxury-gray-1"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div className="summary-row">
          <p className="summary-label">Type</p>
          <p className="summary-value">{typeName || 'Not selected'}</p>
        </div>

        <div className="summary-row">
          <p className="summary-label">Status</p>
          <p className="summary-value">Draft</p>
        </div>

        {propertyAddress && (
          <div className="summary-row">
            <p className="summary-label">Property</p>
            <p className="summary-value">{propertyAddress}</p>
          </div>
        )}

        {clientName && (
          <div className="summary-row">
            <p className="summary-label">Client</p>
            <p className="summary-value">{clientName}</p>
          </div>
        )}

        {priceValue && (
          <div className="summary-row">
            <p className="summary-label">{isLease ? 'Monthly Rent' : 'Sales Price'}</p>
            <p className="summary-value">${parseFloat(priceValue).toLocaleString()}</p>
          </div>
        )}

        {commissionRate && (
          <div className="summary-row">
            <p className="summary-label">Commission</p>
            <p className="summary-value">{commissionRate}%</p>
          </div>
        )}

        {processingFee > 0 && (
          <div className="summary-row">
            <p className="summary-label">Processing Fee</p>
            <p className="summary-value">${processingFee}</p>
          </div>
        )}

        {expediteRequested && (
          <div className="summary-row">
            <p className="summary-label">Expedite Fee</p>
            <p className="summary-value">$95</p>
          </div>
        )}

        {dateValue && (
          <div className="summary-row">
            <p className="summary-label">{isLease ? 'Move-in Date' : 'Closing Date'}</p>
            <p className="summary-value">{new Date(dateValue).toLocaleDateString()}</p>
          </div>
        )}

        {/* Completion checklist */}
        <div className="pt-3 border-t border-luxury-gray-5/50">
          <p className="summary-label mb-2">Completion</p>
          <div className="space-y-1.5">
            {[
              { label: 'Type', done: !!typeId },
              { label: 'Property', done: !!propertyAddress },
              { label: 'Client', done: !!clientName },
              { label: 'Financials', done: !!(salesPrice || monthlyRent) },
              { label: 'Dates', done: !!(closingDate || moveInDate) },
            ].map(item => (
              <div key={item.label} className="checklist-item">
                <div className={item.done ? 'checklist-check-done' : 'checklist-check'}>
                  {item.done && <Check size={8} />}
                </div>
                <span className={item.done ? 'text-luxury-gray-1' : ''}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
