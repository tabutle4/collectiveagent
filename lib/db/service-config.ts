import { createClient } from '@/lib/supabase/server'
import { ServiceConfiguration } from '@/types/listing-coordination'

export async function getServiceConfig(serviceType: string): Promise<ServiceConfiguration | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('service_configurations')
    .select('*')
    .eq('service_type', serviceType)
    .single()

  if (error) {
    console.error('Error fetching service config:', error)
    return null
  }

  return data
}

export async function getAllServiceConfigs(): Promise<ServiceConfiguration[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('service_configurations')
    .select('*')
    .order('service_type')

  if (error) {
    console.error('Error fetching service configs:', error)
    return []
  }

  return data || []
}

export async function updateServiceConfig(
  serviceType: string,
  updates: Partial<ServiceConfiguration>
): Promise<boolean> {
  const supabase = createClient()

  const { error } = await supabase
    .from('service_configurations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('service_type', serviceType)

  if (error) {
    console.error('Error updating service config:', error)
    return false
  }

  return true
}
