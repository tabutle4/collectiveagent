import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { getServiceConfig } from '@/lib/db/service-config'

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_service_config')
  if (auth.error) return auth.error

  try {
    const searchParams = request.nextUrl.searchParams
    const serviceType = searchParams.get('type')

    if (!serviceType) {
      return NextResponse.json({ error: 'Service type is required' }, { status: 400 })
    }

    const config = await getServiceConfig(serviceType)

    return NextResponse.json({
      success: true,
      config,
    })
  } catch (error: any) {
    console.error('Error fetching service config:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch service configuration' },
      { status: 500 }
    )
  }
}
