import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const userId = formData.get('userId') as string

    if (!file || !userId) {
      return NextResponse.json({ error: 'File and userId are required' }, { status: 400 })
    }

    // Allow if admin OR uploading own headshot
    const isAdmin = auth.permissions.has('can_manage_agents')
    const isOwnProfile = userId === auth.user.id
    if (!isAdmin && !isOwnProfile) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only .jpg, .jpeg, and .png are allowed.' },
        { status: 400 }
      )
    }

    // Generate unique filename: userId-timestamp.extension
    const timestamp = Date.now()
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `${userId}-${timestamp}.${extension}`
    const filePath = fileName // Just the filename, bucket is already 'headshots'

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('headshots')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true, // Replace if exists
      })

    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload image', details: uploadError.message },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('headshots').getPublicUrl(filePath)

    const publicUrl = urlData.publicUrl

    // Update user's headshot_url in database
    const { error: updateError } = await supabase
      .from('users')
      .update({ headshot_url: publicUrl })
      .eq('id', userId)

    if (updateError) {
      console.error('Database update error:', updateError)
      // Try to delete the uploaded file if database update fails
      await supabase.storage.from('headshots').remove([filePath])
      return NextResponse.json(
        { error: 'Failed to update user profile', details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      headshot_url: publicUrl,
      message: 'Headshot uploaded successfully',
    })
  } catch (error: any) {
    console.error('Upload headshot error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Allow if admin OR deleting own headshot
    const isAdmin = auth.permissions.has('can_manage_agents')
    const isOwnProfile = userId === auth.user.id
    if (!isAdmin && !isOwnProfile) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    
    // Get current headshot URL
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('headshot_url')
      .eq('id', userId)
      .single()

    if (fetchError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Delete from storage if exists
    if (user.headshot_url) {
      // Extract file path from URL
      const urlParts = user.headshot_url.split('/headshots/')
      if (urlParts.length > 1) {
        const fileName = urlParts[1].split('?')[0] // Remove query params if any
        await supabase.storage.from('headshots').remove([fileName])
      }
    }

    // Update database to remove headshot_url
    const { error: updateError } = await supabase
      .from('users')
      .update({ headshot_url: null })
      .eq('id', userId)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to remove headshot', details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Headshot removed successfully',
    })
  } catch (error: any) {
    console.error('Remove headshot error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
