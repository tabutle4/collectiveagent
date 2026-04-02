import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { createAgentFolder, uploadAgentDocument } from '@/lib/microsoft-graph'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agents')
  if (auth.error) return auth.error

  try {
    const formData = await request.formData()
    const user_id = formData.get('user_id') as string
    const file = formData.get('file') as File
    const document_type = (formData.get('document_type') as string) || 'Other'

    if (!user_id || !file) {
      return NextResponse.json({ error: 'user_id and file are required' }, { status: 400 })
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, onedrive_folder_url')
      .eq('id', user_id)
      .single()

    if (error || !user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Always rebuild folder path deterministically — same formula as onboarding
    const sanitizedName = `${user.first_name} ${user.last_name}`.replace(/[/\\?%*:|"<>]/g, '-')
    const folderPath = `Agent Documents/${sanitizedName}-${user.id}`

    // Create folder if it doesn't exist yet
    if (!user.onedrive_folder_url) {
      const { sharingUrl } = await createAgentFolder(user.first_name, user.last_name, user.id)
      await supabaseAdmin
        .from('users')
        .update({ onedrive_folder_url: sharingUrl })
        .eq('id', user.id)
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const { fileUrl } = await uploadAgentDocument(folderPath, file.name, fileBuffer)

    // Save to user_documents table
    await supabaseAdmin.from('user_documents').insert({
      user_id,
      document_type,
      custom_document_name: file.name,
      onedrive_file_url: fileUrl,
      uploaded_by: auth.user.id,
      upload_date: new Date().toISOString().split('T')[0],
      is_current: true,
    })

    return NextResponse.json({ success: true, fileUrl, fileName: file.name })
  } catch (error: any) {
    console.error('Document upload error:', error)
    return NextResponse.json({ error: error.message || 'Failed to upload document' }, { status: 500 })
  }
}