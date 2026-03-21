interface ProgressBarProps {
  current: number
  total: number
  label?: string
}

export default function ProgressBar({ current, total, label }: ProgressBarProps) {
  const percentage = total > 0 ? (current / total) * 100 : 0

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-luxury-gray-3">
          Step {current} of {total}
        </p>
        {label && <p className="text-xs font-medium text-luxury-gray-2">{label}</p>}
      </div>
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}
