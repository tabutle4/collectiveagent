'use client'

import { useState, useRef } from 'react'
import { Upload, X, Loader2, Move, ZoomIn, ZoomOut, Check } from 'lucide-react'
import HeadshotPlaceholder from './HeadshotPlaceholder'

interface HeadshotUploadProps {
  currentHeadshotUrl: string | null
  userId: string
  onUploadComplete: (url: string) => void
  onRemove: () => void
  size?: 'small' | 'medium' | 'large'
  disabled?: boolean
  firstName?: string
  lastName?: string
  initialCrop?: {
    offsetX: number
    offsetY: number
    scale: number
  } | null
}

const sizeClasses = {
  small: 'w-16 h-16',
  medium: 'w-24 h-24',
  large: 'w-32 h-32',
}

export default function HeadshotUpload({
  currentHeadshotUrl,
  userId,
  onUploadComplete,
  onRemove,
  size = 'medium',
  disabled = false,
  firstName = '',
  lastName = '',
  initialCrop = null,
}: HeadshotUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editingCrop, setEditingCrop] = useState(false)
  const [savingCrop, setSavingCrop] = useState(false)
  const [crop, setCrop] = useState<{
    offsetX: number
    offsetY: number
    scale: number
  }>(() => {
  if (initialCrop && typeof initialCrop.offsetX === 'number') {
    return initialCrop
  }
  return { offsetX: 0, offsetY: 0, scale: 1 }
})
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)

  const circleSizePx = size === 'small' ? 64 : size === 'medium' ? 96 : 128

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png']
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Only .jpg, .jpeg, and .png are allowed.')
      return
    }

    // Create a local preview for the circle, but upload the original file unchanged
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    void handleUpload(file).finally(() => {
      // Revoke the local object URL after upload to avoid leaks
      URL.revokeObjectURL(objectUrl)
    })
  }

  const handleUpload = async (file: File | Blob) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('userId', userId)

      const response = await fetch('/api/users/upload-headshot', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      onUploadComplete(data.headshot_url)
      setPreview(null)
    } catch (error: any) {
      console.error('Upload error:', error)
      alert(error.message || 'Failed to upload headshot')
      setPreview(null)
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemove = async () => {
    if (!confirm('Remove this headshot?')) return

    try {
      const response = await fetch(`/api/users/upload-headshot?userId=${userId}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Remove failed')
      }

      onRemove()
      setPreview(null)
    } catch (error: any) {
      console.error('Remove error:', error)
      alert(error.message || 'Failed to remove headshot')
    }
  }

  const displayUrl = preview || currentHeadshotUrl

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!editingCrop) return
    e.preventDefault()
    setDragging(true)
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: crop.offsetX,
      offsetY: crop.offsetY,
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!editingCrop || !dragging || !dragStartRef.current) return
    e.preventDefault()
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setCrop(prev => ({
      ...prev,
      offsetX: dragStartRef.current!.offsetX + dx,
      offsetY: dragStartRef.current!.offsetY + dy,
    }))
  }

  const handleMouseUp = () => {
    if (dragging) {
      setDragging(false)
      dragStartRef.current = null
    }
  }

  const handleWheel = (e: React.WheelEvent) => {
    if (!editingCrop) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.05 : 0.05
    setCrop(prev => ({
      ...prev,
      scale: Math.min(3, Math.max(0.7, prev.scale + delta)),
    }))
  }

  const handleSaveCrop = async () => {
    if (!userId) return
    setSavingCrop(true)
    try {
      const response = await fetch('/api/users/update-headshot-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          crop,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save crop')
      }
      setEditingCrop(false)
    } catch (err: any) {
      console.error('Save crop error:', err)
      alert(err?.message || 'Failed to save headshot position')
    } finally {
      setSavingCrop(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative"
        style={{ width: `${circleSizePx}px`, height: `${circleSizePx}px` }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
  className={`rounded-full overflow-hidden border-2 border-luxury-gray-5 bg-gray-100 flex items-center justify-center ${
    sizeClasses[size]
  }`}
  onMouseDown={handleMouseDown}
  style={{ 
    cursor: editingCrop ? (dragging ? 'grabbing' : 'grab') : 'default',
    width: `${circleSizePx}px`,
    height: `${circleSizePx}px`,
    minWidth: `${circleSizePx}px`,
    minHeight: `${circleSizePx}px`,
    maxWidth: `${circleSizePx}px`,
    maxHeight: `${circleSizePx}px`,
  }}
>
          {displayUrl ? (
            <img
              src={displayUrl}
              alt="Headshot"
              className="w-full h-full object-contain select-none"
              style={{
                transform: `translate(${crop.offsetX}px, ${crop.offsetY}px) scale(${crop.scale})`,
                transformOrigin: 'center center',
              }}
              draggable={false}
            />
          ) : (
            <HeadshotPlaceholder
              firstName={firstName || ''}
              lastName={lastName || ''}
              size={circleSizePx}
              className="border-0"
            />
          )}
        </div>
        {uploading && (
          <div className="absolute inset-0 rounded-full bg-black bg-opacity-50 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png"
          onChange={handleFileSelect}
          disabled={disabled || uploading}
          className="hidden"
          id={`headshot-upload-${userId}`}
        />
        <label
          htmlFor={`headshot-upload-${userId}`}
          className={`px-2 py-1 text-xs rounded transition-colors text-center border cursor-pointer flex items-center gap-1.5 ${
            disabled || uploading
              ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
              : 'bg-white border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black'
          }`}
        >
          <Upload className="w-3 h-3" />
          {uploading ? 'Uploading...' : displayUrl ? 'Replace' : 'Upload'}
        </label>
        {displayUrl && (
          <>
            <button
              type="button"
              onClick={() => setEditingCrop((prev) => !prev)}
              disabled={disabled || uploading}
              className="px-2 py-1 text-xs rounded transition-colors text-center btn-secondary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Move className="w-3 h-3" />
              {editingCrop ? 'Done' : 'Adjust'}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled || uploading}
              className="px-2 py-1 text-xs rounded transition-colors text-center bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <X className="w-3 h-3" />
              Remove
            </button>
          </>
        )}
      </div>

      {editingCrop && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 bg-white border border-luxury-gray-5 rounded px-2 py-1">
            <button
              type="button"
              onClick={() =>
                setCrop((prev) => ({ ...prev, scale: Math.max(0.7, prev.scale - 0.1) }))
              }
              className="p-1 hover:bg-gray-100 rounded"
            >
              <ZoomOut className="w-3 h-3 text-gray-600" />
            </button>
            <span className="text-[11px] text-gray-700 w-10 text-center">
              {crop.scale.toFixed(2)}
            </span>
            <button
              type="button"
              onClick={() =>
                setCrop((prev) => ({ ...prev, scale: Math.min(3, prev.scale + 0.1) }))
              }
              className="p-1 hover:bg-gray-100 rounded"
            >
              <ZoomIn className="w-3 h-3 text-gray-600" />
            </button>
          </div>
          <p className="text-[11px] text-luxury-gray-3">
            Drag the photo to center your face. Scroll or use +/- to zoom.
          </p>
          <button
            type="button"
            onClick={handleSaveCrop}
            disabled={savingCrop}
            className="mt-1 px-3 py-1.5 text-xs rounded transition-colors btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {savingCrop ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-3 h-3" />
                Save Position
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

