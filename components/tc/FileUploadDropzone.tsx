'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDropzone, Accept } from 'react-dropzone'
import { Upload, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

/**
 * Props for FileUploadDropzone.
 *
 * The component is intentionally split into two phases:
 *   1. Select: user picks a file (via drag-drop or click). The file is
 *      held locally and previewed. Nothing is sent to the server yet.
 *   2. Confirm: user clicks the Upload button. The `onUpload` handler
 *      is invoked with the File. The component shows a spinner until
 *      the promise resolves, then clears the local selection.
 *
 * If `currentUrl` is set, the component renders the current image as
 * the "installed" state. Picking a new file switches into preview mode
 * while leaving the current image visible until the upload succeeds.
 */
export interface FileUploadDropzoneProps {
  /** Called after the user confirms the upload. Must resolve on success and reject on failure. */
  onUpload: (file: File) => Promise<void>
  /** URL of the currently installed file. If set, shown as preview. */
  currentUrl?: string | null
  /** Called when the user clicks Remove on the current file. Optional. */
  onRemove?: () => Promise<void>
  /** Accepted MIME types. Defaults to common image types. */
  acceptedTypes?: string[]
  /** Max file size in bytes. Defaults to 2 MB. */
  maxSizeBytes?: number
  /** If set, warn the user when the image dimensions differ from this. */
  recommendedDimensions?: { width: number; height: number }
  /** Help text shown inside the empty dropzone. */
  helpText?: string
  /** Aspect ratio for the preview container (e.g. "2/1"). Defaults to "2/1". */
  aspectRatio?: string
  /** Disable all interaction. */
  disabled?: boolean
}

export default function FileUploadDropzone({
  onUpload,
  currentUrl,
  onRemove,
  acceptedTypes = ['image/png', 'image/jpeg', 'image/webp'],
  maxSizeBytes = 2 * 1024 * 1024,
  recommendedDimensions,
  helpText = 'Drop an image here, or click to browse',
  aspectRatio = '2/1',
  disabled = false,
}: FileUploadDropzoneProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dimensionWarning, setDimensionWarning] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Build the `accept` object react-dropzone expects: { mime: [] }
  const accept: Accept = acceptedTypes.reduce((acc, type) => {
    acc[type] = []
    return acc
  }, {} as Accept)

  // Release the blob URL when the component unmounts or the selection
  // changes. Leaking blob URLs is a small memory leak but adds up.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      setError(null)
      setDimensionWarning(null)
      setSuccess(false)

      // react-dropzone already filters by accept + maxSize, but the
      // rejections come with reason codes we can surface to the user.
      if (rejectedFiles.length > 0) {
        const reason = rejectedFiles[0]?.errors?.[0]
        if (reason?.code === 'file-too-large') {
          setError(`File is too large. Max ${Math.round(maxSizeBytes / 1024 / 1024)} MB.`)
        } else if (reason?.code === 'file-invalid-type') {
          const types = acceptedTypes
            .map(t => t.split('/')[1]?.toUpperCase())
            .filter(Boolean)
            .join(', ')
          setError(`Invalid file type. Use ${types}.`)
        } else {
          setError(reason?.message || 'File rejected')
        }
        return
      }

      if (acceptedFiles.length === 0) return

      const file = acceptedFiles[0]
      setSelectedFile(file)

      // Create a preview URL and check dimensions if requested.
      const url = URL.createObjectURL(file)
      setPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })

      if (recommendedDimensions && file.type.startsWith('image/')) {
        const img = new Image()
        img.onload = () => {
          const { width, height } = img
          const { width: recW, height: recH } = recommendedDimensions
          const widthOff = Math.abs(width - recW)
          const heightOff = Math.abs(height - recH)
          // Allow 10% deviation before warning.
          if (widthOff > recW * 0.1 || heightOff > recH * 0.1) {
            setDimensionWarning(
              `Image is ${width}x${height}. Recommended is ${recW}x${recH}.`
            )
          }
        }
        img.src = url
      }
    },
    [acceptedTypes, maxSizeBytes, recommendedDimensions]
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept,
    maxSize: maxSizeBytes,
    multiple: false,
    disabled: disabled || uploading || removing,
    noClick: true, // We use a custom button so we can style it properly
    noKeyboard: true,
  })

  const handleCancel = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelectedFile(null)
    setPreviewUrl(null)
    setError(null)
    setDimensionWarning(null)
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    setError(null)
    try {
      await onUpload(selectedFile)
      // Clear the local selection so the parent's updated currentUrl
      // becomes the visible state.
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setSelectedFile(null)
      setPreviewUrl(null)
      setDimensionWarning(null)
      setSuccess(true)
      // Hide the success badge after a moment.
      setTimeout(() => setSuccess(false), 2500)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Upload failed'
      setError(message)
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = async () => {
    if (!onRemove) return
    const confirmed = window.confirm('Remove the current image?')
    if (!confirmed) return
    setRemoving(true)
    setError(null)
    try {
      await onRemove()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Remove failed'
      setError(message)
    } finally {
      setRemoving(false)
    }
  }

  // The visible image: pending preview takes priority over currentUrl
  // so the user sees what they just selected.
  const visibleUrl = previewUrl || currentUrl || null

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        style={{ aspectRatio }}
        className={`
          relative rounded-lg border-2 border-dashed overflow-hidden transition-colors
          ${isDragActive ? 'border-luxury-accent bg-luxury-accent/5' : 'border-luxury-gray-5'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${visibleUrl ? 'bg-luxury-page-bg' : 'bg-luxury-light'}
        `}
      >
        <input {...getInputProps()} />

        {visibleUrl ? (
          <>
            <img
              src={visibleUrl}
              alt="Preview"
              className="w-full h-full object-contain"
            />
            {/* Overlay buttons when an image is shown */}
            {!uploading && !removing && !disabled && (
              <div className="absolute inset-0 bg-luxury-gray-1/0 hover:bg-luxury-gray-1/40 transition-colors flex items-center justify-center gap-2 opacity-0 hover:opacity-100">
                <button
                  type="button"
                  onClick={open}
                  className="px-3 py-1.5 bg-white text-luxury-gray-1 text-[13px] font-medium rounded-md shadow-lg hover:bg-luxury-page-bg transition-colors flex items-center gap-1.5"
                >
                  <Upload size={14} strokeWidth={1.5} />
                  Replace
                </button>
                {currentUrl && !previewUrl && onRemove && (
                  <button
                    type="button"
                    onClick={handleRemove}
                    className="px-3 py-1.5 bg-white text-red-600 text-[13px] font-medium rounded-md shadow-lg hover:bg-red-50 transition-colors flex items-center gap-1.5"
                  >
                    <X size={14} strokeWidth={1.5} />
                    Remove
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={open}
            disabled={disabled}
            className="w-full h-full flex flex-col items-center justify-center gap-2 text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
          >
            <Upload size={28} strokeWidth={1.5} />
            <p className="text-[13px] font-medium">
              {isDragActive ? 'Drop the file here' : helpText}
            </p>
            <p className="text-[11px] text-luxury-gray-3">
              {acceptedTypes
                .map(t => t.split('/')[1]?.toUpperCase())
                .filter(Boolean)
                .join(', ')}{' '}
              up to {Math.round(maxSizeBytes / 1024 / 1024)} MB
              {recommendedDimensions &&
                ` . Recommended ${recommendedDimensions.width}x${recommendedDimensions.height}`}
            </p>
          </button>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-luxury-light/80 flex items-center justify-center">
            <Loader2 size={24} strokeWidth={1.5} className="animate-spin text-luxury-accent" />
          </div>
        )}
      </div>

      {/* Action row when a file is selected but not yet uploaded */}
      {selectedFile && (
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-luxury-gray-1 truncate">{selectedFile.name}</p>
            <p className="text-[11px] text-luxury-gray-3">
              {(selectedFile.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleCancel}
              disabled={uploading}
              className="px-3 py-1.5 text-[13px] font-medium text-luxury-gray-2 hover:text-luxury-gray-1 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="px-3 py-1.5 bg-luxury-accent text-white text-[13px] font-medium rounded-md hover:bg-luxury-accent/90 transition-colors disabled:opacity-60 flex items-center gap-1.5"
            >
              {uploading ? (
                <>
                  <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                  Uploading
                </>
              ) : (
                <>
                  <Upload size={14} strokeWidth={1.5} />
                  Upload
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Status rows */}
      {error && (
        <div className="flex items-start gap-2 px-1 text-red-600 text-[12px]">
          <AlertCircle size={14} strokeWidth={1.5} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {dimensionWarning && !error && (
        <div className="flex items-start gap-2 px-1 text-amber-700 text-[12px]">
          <AlertCircle size={14} strokeWidth={1.5} className="flex-shrink-0 mt-0.5" />
          <span>{dimensionWarning}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 px-1 text-emerald-700 text-[12px]">
          <CheckCircle2 size={14} strokeWidth={1.5} className="flex-shrink-0 mt-0.5" />
          <span>Uploaded.</span>
        </div>
      )}
    </div>
  )
}
