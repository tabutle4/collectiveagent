'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Move, ZoomIn, ZoomOut, Check, Loader2 } from 'lucide-react'

interface HeadshotCropEditorProps {
  imageUrl: string
  onSave: (croppedImageBlob: Blob) => void
  onCancel: () => void
  aspectRatio?: number // 1 for square
}

export default function HeadshotCropEditor({
  imageUrl,
  onSave,
  onCancel,
  aspectRatio = 1,
}: HeadshotCropEditorProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [cropSize, setCropSize] = useState(300)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    // Load image - handle CORS by fetching as blob first if needed
    const loadImage = async () => {
      try {
        // Try to fetch image as blob to avoid CORS issues
        let blob: Blob | null = null
        try {
          const response = await fetch(imageUrl, { mode: 'cors' })
          if (response.ok) {
            blob = await response.blob()
          }
        } catch (fetchError) {
          // If fetch fails, we'll use the image URL directly
          console.log('Direct fetch failed, using image URL')
        }

        const img = new Image()
        if (blob) {
          // Use blob URL to avoid CORS
          const blobUrl = URL.createObjectURL(blob)
          img.onload = () => {
            setImageDimensions({ width: img.width, height: img.height })
            const minDimension = Math.min(img.width, img.height)
            const initialSize = Math.min(minDimension * 0.6, 400)
            setCropSize(initialSize)
            setImageLoaded(true)
            setPosition({ x: 0, y: 0 })
            URL.revokeObjectURL(blobUrl)
          }
          img.onerror = () => {
            setError('Failed to load image')
            URL.revokeObjectURL(blobUrl)
          }
          img.src = blobUrl
        } else {
          // Fallback to direct URL
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            setImageDimensions({ width: img.width, height: img.height })
            const minDimension = Math.min(img.width, img.height)
            const initialSize = Math.min(minDimension * 0.6, 400)
            setCropSize(initialSize)
            setImageLoaded(true)
            setPosition({ x: 0, y: 0 })
          }
          img.onerror = () => {
            setError('Failed to load image')
          }
          img.src = imageUrl
        }
      } catch (err: any) {
        setError('Failed to load image: ' + err.message)
      }
    }

    loadImage()
  }, [imageUrl])

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current || !imageRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const imgRect = imageRef.current.getBoundingClientRect()
    
    // Calculate new position - image moves opposite to mouse
    const newX = dragStart.x - e.clientX
    const newY = dragStart.y - e.clientY
    
    // Calculate bounds - crop area (centered) must stay within image
    // The image can move, but the crop area (fixed at center) must always see part of the image
    const maxMoveX = (imgRect.width - cropSize) / 2
    const maxMoveY = (imgRect.height - cropSize) / 2
    
    setPosition({
      x: Math.max(-maxMoveX, Math.min(maxMoveX, newX)),
      y: Math.max(-maxMoveY, Math.min(maxMoveY, newY)),
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setCropSize((prev) => Math.max(100, Math.min(600, prev + delta * 50)))
  }

  const handleCrop = async () => {
    if (!imageRef.current || !canvasRef.current || !containerRef.current) {
      setError('Missing required elements for cropping')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Could not get canvas context')
      }

      const img = imageRef.current
      const containerRect = containerRef.current.getBoundingClientRect()
      const imgRect = img.getBoundingClientRect()
      
      // Crop area is fixed at container center
      // Image has moved by position.x and position.y
      // So the crop center in image coordinates is:
      const containerCenterX = containerRect.width / 2
      const containerCenterY = containerRect.height / 2
      
      // Image center relative to container
      const imgOffsetX = imgRect.left - containerRect.left
      const imgOffsetY = imgRect.top - containerRect.top
      
      // Crop center in image coordinates (accounting for image movement)
      const cropCenterXInImage = containerCenterX - imgOffsetX + position.x
      const cropCenterYInImage = containerCenterY - imgOffsetY + position.y
      
      // Crop top-left in image coordinates
      const cropXInImage = cropCenterXInImage - cropSize / 2
      const cropYInImage = cropCenterYInImage - cropSize / 2
      
      // Scale to natural image dimensions
      const scaleX = img.naturalWidth / imgRect.width
      const scaleY = img.naturalHeight / imgRect.height
      
      // Source coordinates in natural image size
      const sourceX = Math.max(0, Math.min(img.naturalWidth - cropSize * scaleX, cropXInImage * scaleX))
      const sourceY = Math.max(0, Math.min(img.naturalHeight - cropSize * scaleY, cropYInImage * scaleY))
      const sourceSize = Math.min(
        cropSize * scaleX,
        img.naturalWidth - sourceX,
        cropSize * scaleY,
        img.naturalHeight - sourceY
      )

      if (sourceSize <= 0) {
        throw new Error('Invalid crop area')
      }

      // Set canvas size
      canvas.width = 800
      canvas.height = 800

      // Clear canvas with white background
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, 800, 800)

      // Save context state
      ctx.save()

      // Enable high-quality image rendering
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      // Create circular clipping path
      ctx.beginPath()
      ctx.arc(400, 400, 400, 0, Math.PI * 2)
      ctx.clip()

      // Draw cropped image with proper aspect ratio preservation
      // Use the sourceSize for both width and height to maintain square aspect ratio
      // This ensures no distortion - the image is cropped as a square, then clipped to a circle
      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        800,
        800
      )

      // Restore context (removes clip)
      ctx.restore()

      // Convert to blob - use toDataURL to avoid CORS issues
      // Use high quality (0.95) to preserve image quality
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
      
      // Convert data URL to blob
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      
      if (!blob || blob.size === 0) {
        throw new Error('Failed to create image blob')
      }
      
      onSave(blob)
    } catch (err: any) {
      console.error('Crop error:', err)
      setError(err.message || 'Failed to crop image. Please try again.')
      setSaving(false)
    }
  }

  if (!imageLoaded) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="text-white">Loading image...</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-xl font-semibold">Crop Headshot</h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Instructions */}
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-200">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 mb-1">How to crop your headshot:</p>
              <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                <li><strong>Move:</strong> Click and drag the white circle to reposition the image</li>
                <li><strong>Resize:</strong> Use the +/- buttons below or scroll your mouse wheel over the circle</li>
                <li><strong>Preview:</strong> The dark area shows what will be cropped out - only the circle will be saved</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Crop Area */}
        <div
          ref={containerRef}
          className="relative bg-gray-100 flex items-center justify-center overflow-hidden"
          style={{ height: '500px' }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {/* Dark overlay - shows what will be cropped (circular) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'rgba(0, 0, 0, 0.6)',
            }}
          />
          {/* Circular cutout */}
          <div
            className="absolute pointer-events-none"
            style={{
              width: `${cropSize}px`,
              height: `${cropSize}px`,
              left: `calc(50% - ${cropSize / 2}px + ${position.x}px)`,
              top: `calc(50% - ${cropSize / 2}px + ${position.y}px)`,
              borderRadius: '50%',
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
            }}
          />

          {/* Image - moves when dragging */}
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Crop preview"
            className="max-w-full max-h-full object-contain select-none"
            style={{
              transform: `translate(${-position.x}px, ${-position.y}px)`,
              cursor: isDragging ? 'grabbing' : 'grab',
            }}
            draggable={false}
            crossOrigin="anonymous"
          />

          {/* Circular Crop Overlay Border - fixed in center */}
          <div
            className="absolute border-4 border-white shadow-2xl pointer-events-none z-10 rounded-full"
            style={{
              width: `${cropSize}px`,
              height: `${cropSize}px`,
              left: `calc(50% - ${cropSize / 2}px)`,
              top: `calc(50% - ${cropSize / 2}px)`,
              boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.5)',
            }}
          />

          {/* Drag area - click and drag to move image behind crop (circular) */}
          <div
            className="absolute cursor-move z-10 rounded-full"
            style={{
              width: `${cropSize}px`,
              height: `${cropSize}px`,
              left: `calc(50% - ${cropSize / 2}px)`,
              top: `calc(50% - ${cropSize / 2}px)`,
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsDragging(true)
              setDragStart({
                x: e.clientX + position.x,
                y: e.clientY + position.y,
              })
            }}
            title="Click and drag to move the image"
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="px-6 py-3 bg-red-50 border-b border-red-200">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Controls */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded px-2 py-1">
                <button
                  onClick={() => setCropSize((prev) => Math.max(100, prev - 20))}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Make crop area smaller"
                >
                  <ZoomOut className="w-4 h-4 text-gray-600" />
                </button>
                <span className="text-sm font-medium text-gray-700 w-16 text-center">
                  {Math.round(cropSize)}px
                </span>
                <button
                  onClick={() => setCropSize((prev) => Math.min(600, prev + 20))}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Make crop area larger"
                >
                  <ZoomIn className="w-4 h-4 text-gray-600" />
                </button>
              </div>
              <span className="text-xs text-gray-500">Scroll to resize</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onCancel}
                disabled={saving}
                className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleCrop}
                disabled={saving}
                className="px-4 py-2 text-sm rounded bg-luxury-black text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save Crop
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden canvas for cropping */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

