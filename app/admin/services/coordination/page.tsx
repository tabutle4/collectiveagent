'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ServiceConfiguration } from '@/types/listing-coordination'

export default function CoordinationServiceConfig() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<ServiceConfiguration | null>(null)
  
  const [formData, setFormData] = useState({
    service_name: '',
    service_description: '',
    price: 0,
    payment_terms: '',
    inclusions: [] as string[],
    is_active: true,
  })
  
  const [newInclusion, setNewInclusion] = useState('')
  
  useEffect(() => {
    loadConfig()
  }, [])
  
  const loadConfig = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/service-config/get?type=listing_coordination')
      const data = await response.json()
      
      if (data.success && data.config) {
        setConfig(data.config)
        setFormData({
          service_name: data.config.service_name,
          service_description: data.config.service_description || '',
          price: data.config.price,
          payment_terms: data.config.payment_terms || '',
          inclusions: data.config.inclusions || [],
          is_active: data.config.is_active,
        })
      }
    } catch (error) {
      console.error('Error loading config:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/service-config/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_type: 'listing_coordination',
          updates: formData,
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert('Service configuration updated successfully!')
        loadConfig()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error saving config:', error)
      alert('Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }
  
  const addInclusion = () => {
    if (newInclusion.trim()) {
      setFormData({
        ...formData,
        inclusions: [...formData.inclusions, newInclusion.trim()]
      })
      setNewInclusion('')
    }
  }
  
  const removeInclusion = (index: number) => {
    setFormData({
      ...formData,
      inclusions: formData.inclusions.filter((_, i) => i !== index)
    })
  }
  
  const moveInclusion = (index: number, direction: 'up' | 'down') => {
    const newInclusions = [...formData.inclusions]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    
    if (newIndex >= 0 && newIndex < newInclusions.length) {
      [newInclusions[index], newInclusions[newIndex]] = [newInclusions[newIndex], newInclusions[index]]
      setFormData({ ...formData, inclusions: newInclusions })
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-luxury-light py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2">Loading...</p>
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-luxury-light py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="card-section">
          <div className="mb-6">
            <button
              onClick={() => router.push('/admin/coordination')}
              className="text-sm text-luxury-gray-2 hover:text-luxury-black mb-4"
            >
              ← Back to Coordination Dashboard
            </button>
            <h1 className="text-2xl font-light tracking-luxury">
              Listing Coordination Service Configuration
            </h1>
            <p className="text-sm text-luxury-gray-2 mt-2">
              Update pricing, terms, and inclusions for the coordination service
            </p>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Service Name
              </label>
              <input
                type="text"
                value={formData.service_name}
                onChange={(e) => setFormData({...formData, service_name: e.target.value})}
                className="input-luxury"
              />
            </div>
            
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Service Description
              </label>
              <textarea
                value={formData.service_description}
                onChange={(e) => setFormData({...formData, service_description: e.target.value})}
                className="textarea-luxury"
                rows={2}
              />
            </div>
            
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Price ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value)})}
                className="input-luxury"
              />
            </div>
            
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Payment Terms
              </label>
              <textarea
                value={formData.payment_terms}
                onChange={(e) => setFormData({...formData, payment_terms: e.target.value})}
                className="textarea-luxury"
                rows={3}
                placeholder="Fee: $250. Payment Options: (1) Client pays brokerage directly before service starts (must be included in listing agreement), OR (2) You pay $250 to brokerage within 60 days or at closing, whichever happens first. If not paid within 60 days, fee will be deducted from any commission."
              />
            </div>
            
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                What's Included (Bullet Points)
              </label>
              
              <div className="space-y-2 mb-3">
                {formData.inclusions.map((inclusion, index) => (
                  <div key={index} className="flex items-center space-x-2 bg-luxury-light p-3 rounded">
                    <span className="flex-1 text-sm">{inclusion}</span>
                    <button
                      onClick={() => moveInclusion(index, 'up')}
                      disabled={index === 0}
                      className="px-2 py-1 text-xs rounded transition-colors btn-white disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveInclusion(index, 'down')}
                      disabled={index === formData.inclusions.length - 1}
                      className="px-2 py-1 text-xs rounded transition-colors btn-white disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removeInclusion(index)}
                      className="px-2 py-1 text-xs rounded transition-colors bg-red-600 text-white hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newInclusion}
                  onChange={(e) => setNewInclusion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addInclusion()}
                  className="input-luxury flex-1"
                  placeholder="Add new inclusion..."
                />
                <button
                  onClick={addInclusion}
                  className="px-4 py-2 text-sm rounded transition-colors btn-black"
                >
                  Add
                </button>
              </div>
            </div>
            
            <div>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                  className="w-4 h-4"
                />
                <span className="text-sm">Service is active and available to agents</span>
              </label>
            </div>
            
            <div className="border-t border-luxury-gray-5 pt-6">
              <h3 className="text-sm font-medium mb-3">Preview (as shown to agents)</h3>
              <div className="bg-luxury-light p-4 rounded">
                <p className="font-medium text-base mb-1">
                  {formData.service_name} - ${formData.price} <span className="text-xs font-normal text-luxury-gray-2">(one time)</span>
                </p>
                {formData.payment_terms && (
                  <p className="text-xs text-luxury-gray-2 mb-2">
                    {formData.payment_terms}
                  </p>
                )}
                {formData.inclusions.length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-xs text-luxury-gray-1 ml-4">
                    {formData.inclusions.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            
            <div className="flex justify-end gap-4 pt-6 border-t border-luxury-gray-5">
              <button
                onClick={() => router.push('/admin/coordination')}
                className="px-6 py-2.5 text-sm rounded transition-colors btn-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 text-sm rounded transition-colors btn-black disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

