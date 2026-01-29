// Edge Function: evidence-upload
// Uploads optional before/after files to the 'evidence-photos' bucket using the service role key.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ success: false, error: 'Server not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseClient = createClient(supabaseUrl, serviceKey)

    const form = await req.formData()
    const taskId = form.get('taskId')?.toString() || 'unknown'

    const result: { beforeUrl?: string; afterUrl?: string } = {}

    async function uploadField(fieldName: string) {
      const entry = form.get(fieldName) as File | null
      if (!entry) return undefined
      const buf = await entry.arrayBuffer()
      const uint8 = new Uint8Array(buf)
      const path = `${taskId}/${fieldName}_${Date.now()}_${entry.name}`
      const { error } = await supabaseClient.storage.from('evidence-photos').upload(path, uint8, { contentType: entry.type })
      if (error) throw error
      const { data: publicData } = supabaseClient.storage.from('evidence-photos').getPublicUrl(path)
      return publicData.publicUrl
    }

    // Upload before and after if present
    try {
      const before = await uploadField('before')
      if (before) result.beforeUrl = before
      const after = await uploadField('after')
      if (after) result.afterUrl = after
    } catch (err) {
      console.error('Upload error', err)
      return new Response(JSON.stringify({ success: false, error: err.message || String(err) }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
