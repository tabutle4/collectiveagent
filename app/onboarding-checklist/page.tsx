'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import LuxuryHeader from '@/components/LuxuryHeader'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, ExternalLink, Lock, Info, ShoppingCart, Circle, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import PageContainer from '@/components/PageContainer'

interface ChecklistItem {
  id: string
  section: string
  section_title: string
  item_key: string | null
  label: string
  description: string | null
  priority: 'normal' | 'high'
  link_text: string | null
  link_url: string | null
  second_link_text: string | null
  second_link_url: string | null
  display_order: number
  is_active: boolean
}

interface User {
  id: string
  preferred_first_name: string
  preferred_last_name: string
  first_name: string
  last_name: string
  email: string
  onboarding_unlocked: boolean
  paid_onboarding_fee: boolean
  accepted_trec: boolean
  independent_contractor_agreement_signed: boolean
  w9_completed: boolean
  onboarding_checklist: any
}

// Confetti Component
function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx || !canvas) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: Array<{
      x: number
      y: number
      size: number
      speedY: number
      speedX: number
      color: string
      rotation: number
      rotationSpeed: number
    }> = []
    const colors = ['#000000', '#C0C0C0', '#808080', '#A9A9A9']

    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        size: Math.random() * 8 + 4,
        speedY: Math.random() * 3 + 2,
        speedX: Math.random() * 2 - 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: Math.random() * 4 - 2,
      })
    }

    function animate() {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particles.forEach((p, index) => {
        if (!ctx || !canvas) return
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation * Math.PI / 180)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        ctx.restore()

        p.y += p.speedY
        p.x += p.speedX
        p.rotation += p.rotationSpeed

        if (p.y > canvas.height) {
          particles.splice(index, 1)
        }
      })

      if (particles.length > 0) {
        requestAnimationFrame(animate)
      }
    }

    animate()

    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  )
}

// Congratulations Message Component
function CongratulationsMessage() {
  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 9998,
          animation: 'fadeInOut 4s ease-in-out',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '90%' }}>
          <h1
            style={{
              fontSize: 'clamp(32px, 6vw, 64px)',
              fontWeight: 'bold',
              margin: '0 0 20px 0',
              color: '#000000',
              textShadow: '2px 2px 4px rgba(255, 255, 255, 0.8)',
            }}
          >
            Congratulations!
          </h1>
          <p
            style={{
              fontSize: 'clamp(18px, 3vw, 28px)',
              margin: 0,
              fontWeight: '300',
              color: '#000000',
              textShadow: '1px 1px 2px rgba(255, 255, 255, 0.8)',
            }}
          >
            You've completed your onboarding checklist!
          </p>
        </div>
      </div>
      <style jsx>{`
        @keyframes fadeInOut {
          0% {
            opacity: 0;
            transform: scale(0.5);
          }
          15% {
            opacity: 1;
            transform: scale(1);
          }
          85% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(0.95);
          }
        }
      `}</style>
    </>
  )
}

// Document Tracker Component
function DocumentTracker({
  docKey,
  label,
  url,
  signed,
  onToggle,
}: {
  docKey: string
  label: string
  url: string
  signed: boolean
  onToggle: (key: string) => void
}) {
  const id = `doc-${docKey}`

  return (
    <div className={`p-3 sm:p-4 rounded-lg border transition-all ${signed ? 'bg-luxury-light' : 'bg-white'}`}>
      <div className="flex items-start gap-3 sm:gap-4">
        <input
          type="checkbox"
          id={id}
          checked={signed}
          onChange={() => onToggle(docKey)}
          className="mt-1 w-4 h-4 rounded border-luxury-gray-5"
        />
        <div className="flex-1 min-w-0">
          <label
            htmlFor={id}
            className={`font-bold text-xs sm:text-sm cursor-pointer break-words ${
              signed ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-1'
            }`}
          >
            {label}
          </label>
          <p className="text-xs text-luxury-gray-2 mt-1">Open link, sign document, then check box</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block px-3 py-1.5 text-xs rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black"
          >
            Open <ExternalLink className="w-3 h-3 ml-1 inline" />
          </a>
          {signed && (
            <div className="flex items-center gap-2 mt-2 text-xs sm:text-sm font-semibold text-green-700">
              <CheckCircle2 className="w-4 h-4" />
              Completed
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AgentOnboardingPageContent({ insideAgentLayout = false }: { insideAgentLayout?: boolean } = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const previewUserId = searchParams.get('preview')
  const isPreviewMode = !!previewUserId
  const [checklist, setChecklist] = useState<any>({})
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [showConfetti, setShowConfetti] = useState(false)
  const [previousProgress, setPreviousProgress] = useState(0)

  // MLS Setup state
  const [mlsSelection, setMlsSelection] = useState('')
  const [mlsStatus, setMlsStatus] = useState('')
  const [mlsStatusMetroTex, setMlsStatusMetroTex] = useState('')
  const [mlsStatusHAR, setMlsStatusHAR] = useState('')
  const [mlsCompleted, setMlsCompleted] = useState(false)

  useEffect(() => {
    loadUserData()
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('user')
    router.push('/auth/login')
  }

  const loadUserData = async () => {
    try {
      setError(null)

      // Check localStorage for user (same auth method as rest of app)
      const userStr = localStorage.getItem('user')
      if (!userStr) {
        router.push('/auth/login')
        return
      }

      const currentUserData = JSON.parse(userStr)

      // If preview mode, fetch the preview user's data
      let userDataToUse: User | null = null
      
      if (isPreviewMode && previewUserId) {
        // Only allow admins to preview - Check role (simple string, not array)
        if (currentUserData.role !== 'Admin') {
          router.push('/auth/login')
          return
        }

        // Fetch the preview user's data
        const { data: previewUserData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', previewUserId)
          .single()

        if (userError) {
          console.error('Error fetching preview user:', userError)
          throw new Error(`Failed to load user data: ${userError.message || 'User not found'}`)
        }
        
        if (!previewUserData) {
          throw new Error('User not found')
        }
        userDataToUse = previewUserData as User
        setUser(userDataToUse)
      } else {
        // Normal mode - redirect admins - Check role (simple string, not array)
        if (currentUserData.role === 'Admin') {
          router.push('/admin/dashboard')
          return
        }

        // Fetch fresh user data from database
        const { data: freshUserData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', currentUserData.id)
          .single()

        if (userError) {
          console.error('Error fetching user data:', userError)
          throw new Error(`Failed to load user data: ${userError.message || 'Unknown error'}`)
        }
        
        if (!freshUserData) {
          throw new Error('User not found in database')
        }
        userDataToUse = freshUserData as User
        setUser(userDataToUse)
      }

      // Fetch checklist items
      const { data: items, error: itemsError } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (itemsError) {
        // Check if it's a "table doesn't exist" error
        const errorCode = itemsError.code || ''
        const errorMessage = itemsError.message || ''
        
        if (errorCode === '42P01' || errorMessage.includes('does not exist') || errorMessage.includes('relation')) {
          console.warn('Checklist items table does not exist yet. Please run the database migration (supabase-checklist-schema.sql) to create the table.')
        } else {
          console.error('Error fetching checklist items:', itemsError)
        }
        
        // Don't throw - checklist items might not exist yet, just log and continue
        // The page will still work, just without dynamic checklist items
        setChecklistItems([])
      } else {
        setChecklistItems((items || []) as ChecklistItem[])
      }

      // Load checklist state (use the fetched data directly, not state)
      if (userDataToUse?.onboarding_checklist) {
        setChecklist(userDataToUse.onboarding_checklist)

        // Load MLS Setup data if exists
        const mlsData = userDataToUse.onboarding_checklist.mls_setup
        if (mlsData) {
          setMlsSelection(mlsData.selection || '')
          setMlsStatus(mlsData.status || '')
          setMlsStatusMetroTex(mlsData.statusMetroTex || '')
          setMlsStatusHAR(mlsData.statusHAR || '')
          setMlsCompleted(mlsData.completed || false)
        }

        // Set initial progress
        const initialProgress = calculateProgressFromData(
          userDataToUse.onboarding_checklist,
          items || [],
          mlsData?.completed || false
        )
        setPreviousProgress(initialProgress)
      }

      setLoading(false)
    } catch (err: any) {
      console.error('Error loading user data:', err)
      // Better error handling - Supabase errors have specific structure
      let errorMessage = 'Failed to load your data. Please refresh the page.'
      if (err?.message) {
        errorMessage = err.message
      } else if (err?.error?.message) {
        errorMessage = err.error.message
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (err?.code) {
        errorMessage = `Database error (${err.code}): ${err.message || 'Unknown error'}`
      } else if (err?.hint) {
        errorMessage = `Error: ${err.hint}`
      }
      // Log full error for debugging
      console.error('Full error details:', JSON.stringify(err, null, 2))
      
      // If error message is still default, check if error is empty object
      if (errorMessage === 'Failed to load your data. Please refresh the page.' && err && typeof err === 'object') {
        const errorStr = JSON.stringify(err)
        if (errorStr === '{}') {
          errorMessage = 'Failed to load user data. The database query returned an empty error. Please check your database connection and try again.'
        }
      }
      
      setError(errorMessage)
      setLoading(false)
    }
  }

  const calculateProgressFromData = (checklistData: any, items: ChecklistItem[], mlsComplete: boolean) => {
    let total = items.length + 1 // +1 for MLS Setup
    let completed = 0

    items.forEach((item) => {
      const sectionData = checklistData[item.section]
      if (item.item_key) {
        if (sectionData && sectionData[item.item_key]) {
          completed++
        }
      } else {
        if (checklistData[item.section]) {
          completed++
        }
      }
    })

    if (mlsComplete) {
      completed++
    }

    return total > 0 ? Math.round((completed / total) * 100) : 0
  }

  const sendCompletionNotification = async () => {
    try {
      await fetch('/api/checklist/send-completion-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          user_name: user?.preferred_first_name && user?.preferred_last_name
            ? `${user.preferred_first_name} ${user.preferred_last_name}`
            : `${user?.first_name} ${user?.last_name}`,
          user_email: user?.email,
        }),
      })
    } catch (error) {
      console.error('Error sending completion notification:', error)
    }
  }

  const checkForCompletion = (newProgress: number) => {
    if (newProgress === 100 && previousProgress < 100) {
      // Trigger confetti
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 4000)

      // Send notification
      sendCompletionNotification()
    }
    setPreviousProgress(newProgress)
  }

  const updateChecklist = async (newChecklist: any) => {
    // In preview mode, allow admins to update (they're viewing/managing another user's checklist)
    if (isPreviewMode) {
      const userStr = localStorage.getItem('user')
      if (userStr) {
        const currentUser = JSON.parse(userStr)
        // Check role (simple string, not array)
        if (currentUser.role === 'Admin' && previewUserId) {
          // Admin can update the preview user's checklist
          try {
            setChecklist(newChecklist)
            const { error } = await supabase
              .from('users')
              .update({ onboarding_checklist: newChecklist })
              .eq('id', previewUserId)
            
            if (error) throw error
            return
          } catch (error) {
            console.error('Error updating checklist in preview mode:', error)
            alert('Failed to update checklist')
            return
          }
        }
      }
      console.warn('Cannot update checklist in preview mode')
      return
    }

    // Normal mode - agent updating their own checklist
    setChecklist(newChecklist)
    if (user) {
      try {
        const { error } = await supabase
          .from('users')
          .update({ onboarding_checklist: newChecklist })
          .eq('id', user.id)

        if (error) throw error

        // Calculate new progress and check for completion
        const newProgress = calculateProgressFromData(
          newChecklist,
          checklistItems,
          newChecklist.mls_setup?.completed || false
        )
        checkForCompletion(newProgress)
      } catch (err) {
        console.error('Error updating checklist:', err)
      }
    }
  }

  const updateMLSSetup = async (updates: any) => {
    const newChecklist = {
      ...checklist,
      mls_setup: {
        ...(checklist.mls_setup || {}),
        ...updates,
      },
    }
    await updateChecklist(newChecklist)
  }

  const handleMlsSelectionChange = async (value: string) => {
    setMlsSelection(value)
    setMlsStatus('')
    setMlsStatusMetroTex('')
    setMlsStatusHAR('')
    setMlsCompleted(false)
    await updateMLSSetup({
      selection: value,
      status: '',
      statusMetroTex: '',
      statusHAR: '',
      completed: false,
    })
  }

  const handleMlsStatusChange = async (value: string) => {
    setMlsStatus(value)
    await updateMLSSetup({ status: value })
  }

  const handleMlsStatusMetroTexChange = async (value: string) => {
    setMlsStatusMetroTex(value)
    await updateMLSSetup({ statusMetroTex: value })
  }

  const handleMlsStatusHARChange = async (value: string) => {
    setMlsStatusHAR(value)
    await updateMLSSetup({ statusHAR: value })
  }

  const handleMlsCompletedToggle = async () => {
    const newValue = !mlsCompleted
    setMlsCompleted(newValue)
    await updateMLSSetup({ completed: newValue })
  }

  const handleCheck = async (section: string, item: string | null = null) => {
    const newChecklist = { ...checklist }

    if (item) {
      if (!newChecklist[section]) {
        newChecklist[section] = {}
      }
      const wasUnchecked = !newChecklist[section][item]
      newChecklist[section][item] = !newChecklist[section][item]

      // Send notification if item was just checked
      if (wasUnchecked && newChecklist[section][item] && user) {
        const itemName = item.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
        try {
          await fetch('/api/checklist/send-item-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agent_id: user.id,
              item_name: itemName,
            }),
          })
        } catch (error) {
          console.error('Error sending notification:', error)
        }
      }
    } else {
      newChecklist[section] = !newChecklist[section]
    }

    await updateChecklist(newChecklist)
  }

  const handleDocumentToggle = async (docKey: string) => {
    // In preview mode, allow admins to update
    if (isPreviewMode) {
      const userStr = localStorage.getItem('user')
      if (userStr) {
        const currentUser = JSON.parse(userStr)
        // Check role (simple string, not array)
        if (currentUser.role === 'Admin' && previewUserId) {
          // Admin can update the preview user's documents
          if (!user) return
          const updatedValue = !user[docKey as keyof User]
          const updatedData = { [docKey]: updatedValue }
          try {
            const { error } = await supabase
              .from('users')
              .update(updatedData)
              .eq('id', previewUserId)
            
            if (error) throw error
            await loadUserData() // Reload user data to update the UI
            return
          } catch (error) {
            console.error('Failed to update document status:', error)
            alert('Failed to update document')
            return
          }
        }
      }
      console.warn('Cannot update documents in preview mode')
      return
    }

    if (!user) return

    const updatedValue = !user[docKey as keyof User]
    const updatedData: any = { [docKey]: updatedValue }

    try {
      const { error } = await supabase.from('users').update(updatedData).eq('id', user.id)
      if (error) throw error

      await loadUserData() // Reload user data to update the UI
    } catch (error) {
      console.error('Failed to update document status:', error)
    }
  }

  const isSectionComplete = (sectionKey: string, sectionItems: ChecklistItem[]) => {
    if (sectionItems.length === 0) return false
    return sectionItems.every((item) => {
      if (item.item_key) {
        return checklist[sectionKey]?.[item.item_key] || false
      } else {
        return checklist[sectionKey] || false
      }
    })
  }

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }))
  }

  const calculateProgress = () => {
    let total = checklistItems.length + 1 // +1 for MLS Setup
    let completed = 0

    checklistItems.forEach((item) => {
      const sectionData = checklist[item.section]
      if (item.item_key) {
        if (sectionData && sectionData[item.item_key]) {
          completed++
        }
      } else {
        if (checklist[item.section]) {
          completed++
        }
      }
    })

    // Add MLS Setup to progress calculation
    if (mlsCompleted) {
      completed++
    }

    return total > 0 ? Math.round((completed / total) * 100) : 0
  }

  const progress = calculateProgress()
  const isUnlocked = user?.onboarding_unlocked || false

  // Calculate unlock section completion
  const unlockStepsComplete = {
    step1: user?.paid_onboarding_fee && user?.accepted_trec,
    step2: user?.independent_contractor_agreement_signed && user?.w9_completed,
  }

  const allUnlockStepsComplete = unlockStepsComplete.step1 && unlockStepsComplete.step2

  if (loading) {
    if (insideAgentLayout) {
      // Within agent layout, keep it simple (layout already provides chrome)
      return (
        <PageContainer className="max-w-5xl mx-auto px-3 sm:px-4 pb-8">
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2">Loading your onboarding checklist...</p>
          </div>
        </PageContainer>
      )
    } else {
      return (
        <PageContainer>
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2">Loading your onboarding checklist...</p>
          </div>
        </PageContainer>
      )
    }
  }

  if (error) {
    if (insideAgentLayout) {
      return (
        <PageContainer className="max-w-5xl mx-auto px-3 sm:px-4 pb-8">
          <div className="card-section">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle className="w-5 h-5" />
              <div>
                <p className="font-medium">{error}</p>
                <button
                  onClick={() => {
                    setLoading(true)
                    loadUserData()
                  }}
                  className="text-sm text-blue-600 hover:underline mt-2"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </PageContainer>
      )
    } else {
      return (
        <PageContainer>
          <div className="card-section">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle className="w-5 h-5" />
              <div>
                <p className="font-medium">{error}</p>
                <button
                  onClick={() => {
                    setLoading(true)
                    loadUserData()
                  }}
                  className="text-sm text-blue-600 hover:underline mt-2"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </PageContainer>
      )
    }
  }

  // Group items by section
  const groupedItems = checklistItems.reduce((acc: Record<string, { title: string; items: ChecklistItem[] }>, item) => {
    if (!acc[item.section]) {
      acc[item.section] = {
        title: item.section_title,
        items: [],
      }
    }
    acc[item.section].items.push(item)
    return acc
  }, {})

  const preferredName = user?.preferred_first_name && user?.preferred_last_name
    ? `${user.preferred_first_name} ${user.preferred_last_name}`
    : `${user?.first_name} ${user?.last_name}`

  // In preview mode, check if current user is admin to allow edits
  const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null
  const currentUser = userStr ? JSON.parse(userStr) : null
  // Check role (simple string, not array)
  const isAdminPreview = isPreviewMode && currentUser?.role === 'Admin'
  // Only read-only if preview mode but not admin
  const isReadOnly = isPreviewMode && !isAdminPreview

  return (
    <div className="min-h-screen bg-white">
      {!insideAgentLayout && <LuxuryHeader />}
      {isPreviewMode && !insideAgentLayout && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-center">
          <p className="text-sm text-blue-800">
            <strong>Preview Mode:</strong> Viewing {preferredName}'s checklist (Read-only)
          </p>
        </div>
      )}
      {showConfetti && (
        <>
          <CongratulationsMessage />
          <Confetti />
        </>
      )}

      <div
        className="max-w-5xl mx-auto px-3 sm:px-4 pb-8"
        style={insideAgentLayout ? undefined : { paddingTop: '104px' }}
      >
        {!insideAgentLayout && (
          <div className="flex justify-end gap-3 mb-4">
            <Link
              href="/agent/forms"
              className="text-sm text-luxury-gray-2 hover:text-luxury-black transition-colors px-3 py-1.5 rounded border border-luxury-gray-5 hover:border-luxury-black"
            >
              Forms
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-luxury-gray-2 hover:text-luxury-black transition-colors px-3 py-1.5 rounded border border-luxury-gray-5 hover:border-luxury-black"
            >
              Logout
            </button>
          </div>
        )}
        <div className="text-center space-y-2 sm:space-y-3 mb-6">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-light text-luxury-gray-1 break-words">
            Welcome, <span className="font-medium">{preferredName}</span>
          </h1>
          {progress === 100 ? (
            <div className="space-y-3 sm:space-y-4 mt-4 sm:mt-6">
              <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-luxury-gray-1">Agent Readiness Checklist</h2>
              <p className="text-sm sm:text-base text-luxury-gray-2">Stay current with all requirements</p>
              <div className="card-section bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 text-left">
                <div className="flex items-start gap-2 sm:gap-3">
                  <Info className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm sm:text-base text-luxury-gray-1 mb-1 sm:mb-2">Stay Current & Compliant</h3>
                    <p className="text-xs sm:text-sm text-luxury-gray-2">
                      Review each item to confirm you've completed all required setups and training.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2 sm:gap-3 mt-4">
                  <Info className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm sm:text-base text-luxury-gray-1 mb-1 sm:mb-2">Need Support?</h3>
                    <p className="text-xs sm:text-sm text-luxury-gray-2">
                      Reach out to the office for assistance with any items.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm sm:text-base md:text-lg text-luxury-gray-2 font-light">Complete all items to finish onboarding</p>
          )}
        </div>

        {/* Unlock Onboarding Section */}
        {!isUnlocked && (
          <div className="space-y-4 sm:space-y-6 mb-6">
            <header className="bg-black text-white text-center p-4 sm:p-6 rounded-lg shadow-xl">
              <h1 className="text-xl sm:text-2xl font-normal">Unlock Onboarding</h1>
              <p className="text-xs sm:text-sm mt-2 text-gray-300">Complete steps below</p>
            </header>

            <div className="card-section bg-gradient-to-br from-green-50 to-emerald-50">
              <div className="flex items-start gap-2 sm:gap-3">
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-luxury-gray-1 mb-1 sm:mb-2">Thank You!</h3>
                  <p className="text-xs sm:text-sm text-luxury-gray-2 leading-relaxed">Thank you for joining Collective Realty Co!</p>
                </div>
              </div>
            </div>

            {/* Step 1 - Collapsible */}
            <div className="card-section border-2 border-luxury-gray-5">
              <div
                className="p-4 sm:p-5 cursor-pointer hover:bg-luxury-light transition-colors"
                onClick={() => toggleSection('unlock_step1')}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    {unlockStepsComplete.step1 ? (
                      <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                    ) : (
                      <Circle className="w-6 h-6 text-luxury-gray-3 flex-shrink-0" />
                    )}
                    <h3 className={`text-base sm:text-lg font-bold ${unlockStepsComplete.step1 ? 'text-green-700' : 'text-luxury-gray-1'}`}>
                      Step 1: Your Fees
                    </h3>
                  </div>
                  <button className="flex-shrink-0 p-0 h-auto">
                    {collapsedSections.unlock_step1 ? <ChevronDown className="w-5 h-5 text-luxury-gray-3" /> : <ChevronUp className="w-5 h-5 text-luxury-gray-3" />}
                  </button>
                </div>
              </div>

              {(!unlockStepsComplete.step1 || !collapsedSections.unlock_step1) && (
                <div className="space-y-3 sm:space-y-4 p-4 sm:p-5 pt-0 border-t border-luxury-gray-5">
                  <div className="p-4 sm:p-6 rounded-lg border-2 bg-white border-luxury-gray-5">
                    <div className="flex flex-col gap-3 sm:gap-4">
                      <div className="flex-1">
                        <p className="font-bold text-sm sm:text-base md:text-lg text-luxury-gray-1">Onboarding & Monthly Fee</p>
                        <p className="text-xs sm:text-sm text-luxury-gray-2 mt-2">
                          Covers setup including cards, name tag, shirt, and signs.
                        </p>
                      </div>
                      <a
                        href="/agent-fee-info" // TODO: Update this URL when fee page is created
                        className="w-full px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 flex items-center justify-center gap-2"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Calculate & Pay
                      </a>
                    </div>
                  </div>

                  <div className={`p-3 sm:p-4 rounded-lg border ${user?.paid_onboarding_fee ? 'bg-luxury-light' : 'bg-white'}`}>
                    <div className="flex items-start gap-3 sm:gap-4">
                      <input
                        type="checkbox"
                        id="paid_onboarding_fee"
                        checked={user?.paid_onboarding_fee || false}
                        onChange={() => handleDocumentToggle('paid_onboarding_fee')}
                        className="mt-1 w-4 h-4 rounded border-luxury-gray-5"
                      />
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor="paid_onboarding_fee"
                          className={`font-bold text-xs sm:text-sm cursor-pointer ${user?.paid_onboarding_fee ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-1'}`}
                        >
                          Payment completed
                        </label>
                        <p className="text-xs text-luxury-gray-2 mt-1">Check after submitting payment</p>
                        {user?.paid_onboarding_fee && (
                          <div className="flex items-center gap-2 mt-2 text-xs sm:text-sm font-semibold text-green-700">
                            <CheckCircle2 className="w-4 h-4" />
                            Confirmed
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className={`p-3 sm:p-4 rounded-lg border ${user?.accepted_trec ? 'bg-luxury-light' : 'bg-white'}`}>
                    <div className="flex items-start gap-3 sm:gap-4">
                      <input
                        type="checkbox"
                        id="accepted_trec"
                        checked={user?.accepted_trec || false}
                        onChange={() => handleDocumentToggle('accepted_trec')}
                        className="mt-1 w-4 h-4 rounded border-luxury-gray-5"
                      />
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor="accepted_trec"
                          className={`font-bold text-xs sm:text-sm cursor-pointer ${user?.accepted_trec ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-1'}`}
                        >
                          Accept TREC Invitation
                        </label>
                        <p className="text-xs text-luxury-gray-2 mt-1">Accept invitation when it arrives</p>
                        {user?.accepted_trec && (
                          <div className="flex items-center gap-2 mt-2 text-xs sm:text-sm font-semibold text-green-700">
                            <CheckCircle2 className="w-4 h-4" />
                            Accepted
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2 - Collapsible */}
            <div className="card-section border-2 border-luxury-gray-5">
              <div
                className="p-4 sm:p-5 cursor-pointer hover:bg-luxury-light transition-colors"
                onClick={() => toggleSection('unlock_step2')}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    {unlockStepsComplete.step2 ? (
                      <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                    ) : (
                      <Circle className="w-6 h-6 text-luxury-gray-3 flex-shrink-0" />
                    )}
                    <h3 className={`text-base sm:text-lg font-bold ${unlockStepsComplete.step2 ? 'text-green-700' : 'text-luxury-gray-1'}`}>
                      Step 2: Sign Documents
                    </h3>
                  </div>
                  <button className="flex-shrink-0 p-0 h-auto">
                    {collapsedSections.unlock_step2 ? <ChevronDown className="w-5 h-5 text-luxury-gray-3" /> : <ChevronUp className="w-5 h-5 text-luxury-gray-3" />}
                  </button>
                </div>
              </div>

              {(!unlockStepsComplete.step2 || !collapsedSections.unlock_step2) && (
                <div className="space-y-3 sm:space-y-4 p-4 sm:p-5 pt-0 border-t border-luxury-gray-5">
                  <p className="text-xs sm:text-sm text-luxury-gray-2 leading-relaxed">
                    Review and electronically sign the required documents below.
                  </p>

                  <DocumentTracker
                    docKey="independent_contractor_agreement_signed"
                    label="Independent Contractor Agreement"
                    url="https://app.hellosign.com/s/5FfSgpM8"
                    signed={user?.independent_contractor_agreement_signed || false}
                    onToggle={handleDocumentToggle}
                  />

                  <DocumentTracker
                    docKey="w9_completed"
                    label="W-9 Form"
                    url="https://app.hellosign.com/s/IThaxBZj"
                    signed={user?.w9_completed || false}
                    onToggle={handleDocumentToggle}
                  />
                </div>
              )}
            </div>

            {/* Step 3 */}
            <div className="card-section">
              <div className="p-4 sm:p-6">
                <h3 className="flex items-center gap-2 text-sm sm:text-base font-bold text-luxury-gray-1 mb-4">
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  Step 3: Unlocked
                </h3>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 sm:p-6 rounded-lg border-2 border-blue-200">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm sm:text-base text-luxury-gray-1 mb-2">What's Next?</h4>
                      <p className="text-xs sm:text-sm text-luxury-gray-2 leading-relaxed">
                        You'll receive a welcome email within 24 hours with system access. An admin will review and unlock your checklist.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card-section">
              <h4 className="font-bold text-sm sm:text-base text-luxury-gray-1 mb-3">Need Help?</h4>
              <p className="text-xs sm:text-sm text-luxury-gray-2 mb-4 leading-relaxed">
                Contact the office for assistance with onboarding.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href="mailto:office@collectiverealtyco.com?subject=Onboarding Support"
                  className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90"
                >
                  Email Office
                </a>
                <a
                  href="tel:+12816389407"
                  className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black"
                >
                  Call Office
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Lock Status Badge */}
        {isUnlocked && progress < 100 && (
          <div className="card-section bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 border-2 mb-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />
              <div>
                <p className="font-bold text-sm sm:text-base md:text-lg text-green-900">Unlocked!</p>
                <p className="text-xs sm:text-sm text-green-700 mt-1">Complete checklist below</p>
              </div>
            </div>
          </div>
        )}

        {/* Main Checklist Section - Conditionally Grayed Out */}
        <div className={`space-y-6 ${!isUnlocked ? 'opacity-50 pointer-events-none' : ''}`}>
          {!isUnlocked && (
            <div className="card-section bg-luxury-light border-luxury-gray-3 border-2">
              <div className="flex items-center gap-2 sm:gap-3 text-luxury-gray-2">
                <Lock className="w-5 h-5 sm:w-6 sm:h-6" />
                <p className="font-semibold text-xs sm:text-sm">Locked. Complete steps above to unlock.</p>
              </div>
            </div>
          )}

          {/* Progress Card */}
          <div className="card-section">
            <h3 className="text-base sm:text-lg md:text-xl text-luxury-gray-1 mb-1">Your Progress</h3>
            <p className="text-xs sm:text-sm text-luxury-gray-2 mb-4">Track completion</p>
            <div className="space-y-2 sm:space-y-3">
              <div className="bg-luxury-gray-5 rounded-full relative h-3 sm:h-4 overflow-hidden">
                <div
                  className="h-full bg-luxury-black transition-all duration-500 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs sm:text-sm text-luxury-gray-1 text-center font-bold">{progress}% Complete</p>
            </div>
          </div>

          {/* MLS Setup Section */}
          <div className="card-section border-2 border-luxury-gray-5">
            <div
              className="p-4 sm:p-5 cursor-pointer hover:bg-luxury-light transition-colors"
              onClick={() => toggleSection('mls_setup')}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  {mlsCompleted ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                  ) : (
                    <Circle className="w-6 h-6 text-luxury-gray-3 flex-shrink-0" />
                  )}
                  <h3 className={`text-base sm:text-lg font-bold ${mlsCompleted ? 'text-green-700' : 'text-luxury-gray-1'}`}>
                    MLS Setup
                  </h3>
                </div>
                {allUnlockStepsComplete && (
                  <button className="flex-shrink-0 p-0 h-auto">
                    {collapsedSections.mls_setup ? <ChevronDown className="w-5 h-5 text-luxury-gray-3" /> : <ChevronUp className="w-5 h-5 text-luxury-gray-3" />}
                  </button>
                )}
              </div>
            </div>

            {(!mlsCompleted || !collapsedSections.mls_setup) && (
              <div className="space-y-4 p-4 sm:p-5 pt-0 border-t border-luxury-gray-5">
                {/* Question 1: Which MLS */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-luxury-gray-1">Which MLS will you join?</label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="HAR"
                        checked={mlsSelection === 'HAR'}
                        onChange={(e) => handleMlsSelectionChange(e.target.value)}
                        disabled={!isUnlocked || isReadOnly}
                        className="mr-3"
                      />
                      <span>HAR</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="MetroTex"
                        checked={mlsSelection === 'MetroTex'}
                        onChange={(e) => handleMlsSelectionChange(e.target.value)}
                        disabled={!isUnlocked || isReadOnly}
                        className="mr-3"
                      />
                      <span>MetroTex | NTREIS</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="Both"
                        checked={mlsSelection === 'Both'}
                        onChange={(e) => handleMlsSelectionChange(e.target.value)}
                        disabled={!isUnlocked || isReadOnly}
                        className="mr-3"
                      />
                      <span>Both</span>
                    </label>
                  </div>
                </div>

                {/* Question 2: Status (for HAR or MetroTex only) */}
                {mlsSelection && mlsSelection !== 'Both' && (
                  <div className="space-y-3 pl-4 border-l-2 border-blue-200">
                    <label className="text-sm font-semibold text-luxury-gray-1">Select option that describes your association status.</label>
                    <div className="space-y-2">
                      <label className="flex items-start">
                        <input
                          type="radio"
                          value="brand_new"
                          checked={mlsStatus === 'brand_new'}
                          onChange={(e) => handleMlsStatusChange(e.target.value)}
                          disabled={!isUnlocked || isReadOnly}
                          className="mt-1 mr-3"
                        />
                        <span>I am a brand new licensed agent.</span>
                      </label>
                      <label className="flex items-start">
                        <input
                          type="radio"
                          value="previous_member"
                          checked={mlsStatus === 'previous_member'}
                          onChange={(e) => handleMlsStatusChange(e.target.value)}
                          disabled={!isUnlocked || isReadOnly}
                          className="mt-1 mr-3"
                        />
                        <span>
                          I was previously a member of {mlsSelection === 'HAR' ? 'HAR' : 'NTREIS'} with another brokerage.
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Question 2a & 2b: Status for Both */}
                {mlsSelection === 'Both' && (
                  <div className="space-y-4 pl-4 border-l-2 border-blue-200">
                    <div className="space-y-3">
                      <label className="text-sm font-semibold text-luxury-gray-1">Select option that describes your MetroTex | NTREIS status.</label>
                      <div className="space-y-2">
                        <label className="flex items-start">
                          <input
                            type="radio"
                            value="brand_new"
                            checked={mlsStatusMetroTex === 'brand_new'}
                            onChange={(e) => handleMlsStatusMetroTexChange(e.target.value)}
                            disabled={!isUnlocked || isReadOnly}
                            className="mt-1 mr-3"
                          />
                          <span>I am a brand new licensed agent.</span>
                        </label>
                        <label className="flex items-start">
                          <input
                            type="radio"
                            value="previous_member"
                            checked={mlsStatusMetroTex === 'previous_member'}
                            onChange={(e) => handleMlsStatusMetroTexChange(e.target.value)}
                            disabled={!isUnlocked || isReadOnly}
                            className="mt-1 mr-3"
                          />
                          <span>I was previously a member of NTREIS with another brokerage.</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-sm font-semibold text-luxury-gray-1">Select option that describes your HAR status.</label>
                      <div className="space-y-2">
                        <label className="flex items-start">
                          <input
                            type="radio"
                            value="brand_new"
                            checked={mlsStatusHAR === 'brand_new'}
                            onChange={(e) => handleMlsStatusHARChange(e.target.value)}
                            disabled={!isUnlocked || isReadOnly}
                            className="mt-1 mr-3"
                          />
                          <span>I am a brand new licensed agent.</span>
                        </label>
                        <label className="flex items-start">
                          <input
                            type="radio"
                            value="previous_member"
                            checked={mlsStatusHAR === 'previous_member'}
                            onChange={(e) => handleMlsStatusHARChange(e.target.value)}
                            disabled={!isUnlocked || isReadOnly}
                            className="mt-1 mr-3"
                          />
                          <span>I was previously a member of HAR with another brokerage.</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Instructions based on selections */}
                {((mlsSelection && mlsSelection !== 'Both' && mlsStatus) ||
                  (mlsSelection === 'Both' && mlsStatusMetroTex && mlsStatusHAR)) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                    <h4 className="font-semibold text-sm text-luxury-gray-1">Instructions:</h4>

                    {/* MetroTex Instructions */}
                    {(mlsSelection === 'MetroTex' || mlsSelection === 'Both') && (
                      <div className="space-y-2">
                        {mlsSelection === 'Both' && <h5 className="font-semibold text-sm text-luxury-gray-1">MetroTex | NTREIS:</h5>}

                        {((mlsSelection === 'MetroTex' && mlsStatus === 'brand_new') ||
                          (mlsSelection === 'Both' && mlsStatusMetroTex === 'brand_new')) && (
                          <ol className="list-decimal list-inside space-y-1 text-sm text-luxury-gray-2">
                            <li>
                              Visit the MetroTex website:{' '}
                              <a
                                href="https://www.mymetrotex.com/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline inline-flex items-center gap-1"
                              >
                                https://www.mymetrotex.com/ <ExternalLink className="w-3 h-3" />
                              </a>
                            </li>
                            <li>Click "Join Today"</li>
                            <li>Complete the Member Application</li>
                            <li>Fill out all required information</li>
                            <li>Submit your application</li>
                            <li>Check Your Email for login credentials and access information from MetroTex</li>
                            <li>Pay any required fees</li>
                            <li>Mark Complete once you've completed your application and received confirmation</li>
                          </ol>
                        )}

                        {((mlsSelection === 'MetroTex' && mlsStatus === 'previous_member') ||
                          (mlsSelection === 'Both' && mlsStatusMetroTex === 'previous_member')) && (
                          <ol className="list-decimal list-inside space-y-1 text-sm text-luxury-gray-2">
                            <li>
                              Visit the MetroTex website:{' '}
                              <a
                                href="https://www.mymetrotex.com/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline inline-flex items-center gap-1"
                              >
                                https://www.mymetrotex.com/ <ExternalLink className="w-3 h-3" />
                              </a>
                            </li>
                            <li>Click "Manage My Membership"</li>
                            <li>Log in to Your Account using your existing MetroTex credentials</li>
                            <li>Complete the Transfer Form</li>
                            <li>Pay any required fees</li>
                            <li>Wait for Processing</li>
                            <li>Mark Complete once your transfer is confirmed and you receive confirmation from MetroTex</li>
                          </ol>
                        )}
                      </div>
                    )}

                    {/* HAR Instructions */}
                    {(mlsSelection === 'HAR' || mlsSelection === 'Both') && (
                      <div className="space-y-2">
                        {mlsSelection === 'Both' && <h5 className="font-semibold text-sm text-luxury-gray-1 mt-4">HAR:</h5>}

                        {((mlsSelection === 'HAR' && mlsStatus === 'brand_new') ||
                          (mlsSelection === 'Both' && mlsStatusHAR === 'brand_new')) && (
                          <ol className="list-decimal list-inside space-y-1 text-sm text-luxury-gray-2">
                            <li>
                              Visit the HAR Join Page:{' '}
                              <a
                                href="https://www.har.com/joinhar"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline inline-flex items-center gap-1"
                              >
                                https://www.har.com/joinhar <ExternalLink className="w-3 h-3" />
                              </a>
                            </li>
                            <li>Click "Apply Now"</li>
                            <li>Complete the Application Form</li>
                            <li>Check Your Email for login credentials and access information from HAR</li>
                            <li>Pay any required fees</li>
                            <li>Mark Complete once you've been approved and received your HAR access</li>
                          </ol>
                        )}

                        {((mlsSelection === 'HAR' && mlsStatus === 'previous_member') ||
                          (mlsSelection === 'Both' && mlsStatusHAR === 'previous_member')) && (
                          <ol className="list-decimal list-inside space-y-1 text-sm text-luxury-gray-2">
                            <li>
                              Complete the HAR Transfer Form:{' '}
                              <a
                                href="https://app.hellosign.com/s/62GzWyXz"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline inline-flex items-center gap-1"
                              >
                                https://app.hellosign.com/s/62GzWyXz <ExternalLink className="w-3 h-3" />
                              </a>
                            </li>
                            <li>Check Your Email for confirmation from HAR once your transfer is complete</li>
                            <li>Pay any required fees</li>
                            <li>Mark Complete once you receive confirmation from HAR</li>
                          </ol>
                        )}
                      </div>
                    )}

                    {/* Mark Complete Checkbox */}
                    <div className="flex items-start gap-3 pt-3 border-t border-blue-300">
                      <input
                        type="checkbox"
                        id="mls-complete"
                        checked={mlsCompleted}
                        onChange={handleMlsCompletedToggle}
                        disabled={!isUnlocked || isReadOnly}
                        className="mt-1 w-4 h-4 rounded border-luxury-gray-5"
                      />
                      <label htmlFor="mls-complete" className="cursor-pointer font-medium text-sm text-luxury-gray-1">
                        I have completed the MLS setup process and received confirmation
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dynamic Checklist Sections */}
          {Object.entries(groupedItems).map(([sectionKey, section]) => {
            const isComplete = isSectionComplete(sectionKey, section.items)
            const isCollapsed = collapsedSections[sectionKey]

            return (
              <div key={sectionKey} className="card-section border-2 border-luxury-gray-5">
                <div
                  className="p-4 sm:p-5 cursor-pointer hover:bg-luxury-light transition-colors"
                  onClick={() => toggleSection(sectionKey)}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      {isComplete ? (
                        <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                      ) : (
                        <Circle className="w-6 h-6 text-luxury-gray-3 flex-shrink-0" />
                      )}
                      <h3 className={`text-base sm:text-lg font-bold ${isComplete ? 'text-green-700' : 'text-luxury-gray-1'}`}>
                        {section.title}
                      </h3>
                    </div>
                    {allUnlockStepsComplete && (
                      <button className="flex-shrink-0 p-0 h-auto">
                        {isCollapsed ? <ChevronDown className="w-5 h-5 text-luxury-gray-3" /> : <ChevronUp className="w-5 h-5 text-luxury-gray-3" />}
                      </button>
                    )}
                  </div>
                </div>

                {(!isComplete || !isCollapsed) && (
                  <div className="space-y-2 p-4 sm:p-5 pt-0 border-t border-luxury-gray-5">
                    {section.items.map((item) => (
                      <ChecklistItemComponent
                        key={item.id}
                        checked={item.item_key ? (checklist[sectionKey]?.[item.item_key] || false) : (checklist[sectionKey] || false)}
                        onChange={() => handleCheck(sectionKey, item.item_key || null)}
                        label={item.label}
                        description={item.description}
                        priority={item.priority}
                        hasLink={!!item.link_url}
                        linkText={item.link_text}
                        linkUrl={item.link_url}
                        secondLinkText={item.second_link_text}
                        secondLinkUrl={item.second_link_url}
                        disabled={!isUnlocked || isReadOnly}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function AgentOnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-luxury-gray-2">Loading...</p>
      </div>
    }>
      <AgentOnboardingPageContent />
    </Suspense>
  )
}

// Re-export content so it can be used inside the agent layout
export { AgentOnboardingPageContent }

// ChecklistItem Component
function ChecklistItemComponent({
  checked,
  onChange,
  label,
  description,
  priority,
  hasLink,
  linkText,
  linkUrl,
  secondLinkText,
  secondLinkUrl,
  disabled,
}: {
  checked: boolean
  onChange: () => void
  label: string
  description: string | null
  priority: 'normal' | 'high'
  hasLink: boolean
  linkText: string | null
  linkUrl: string | null
  secondLinkText: string | null
  secondLinkUrl: string | null
  disabled: boolean
}) {
  return (
    <div className="flex items-start gap-2 sm:gap-3 p-3 rounded-lg hover:bg-luxury-light transition-all">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-1 w-4 h-4 rounded border-luxury-gray-5 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start flex-wrap gap-2">
          <label
            className={`text-xs sm:text-sm font-medium transition-all break-words ${
              checked ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-1'
            } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            onClick={!disabled ? onChange : undefined}
          >
            {label}
          </label>
          {priority === 'high' && !checked && (
            <span className="px-2 py-0.5 text-[10px] sm:text-xs rounded bg-red-100 text-red-700 flex-shrink-0">Priority</span>
          )}
          {hasLink && linkUrl && (
            <a
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-blue-600 hover:text-blue-800 text-[10px] sm:text-xs flex items-center gap-1 flex-shrink-0 ${disabled ? 'pointer-events-none opacity-50' : ''}`}
            >
              <ExternalLink className="w-3 h-3" />
              <span>{linkText}</span>
            </a>
          )}
          {secondLinkText && secondLinkUrl && (
            <a
              href={secondLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-blue-600 hover:text-blue-800 text-[10px] sm:text-xs flex items-center gap-1 flex-shrink-0 ${disabled ? 'pointer-events-none opacity-50' : ''}`}
            >
              <ExternalLink className="w-3 h-3" />
              <span>{secondLinkText}</span>
            </a>
          )}
        </div>
        {description && !checked && (
          <p className="text-[10px] sm:text-xs text-luxury-gray-2 mt-1 font-light leading-relaxed break-words">{description}</p>
        )}
      </div>
    </div>
  )
}

