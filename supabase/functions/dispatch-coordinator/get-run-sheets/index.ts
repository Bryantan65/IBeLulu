// Edge Function: get-run-sheets
// Deploy to: supabase/functions/get-run-sheets/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        // Parse query parameters
        const url = new URL(req.url)
        const dateParam = url.searchParams.get('date')
        const teamId = url.searchParams.get('team_id')
        const status = url.searchParams.get('status')
        const window = url.searchParams.get('window')
        const limit = parseInt(url.searchParams.get('limit') || '50')
        const offset = parseInt(url.searchParams.get('offset') || '0')

        // Build query
        let query = supabaseClient
            .from('run_sheets')
            .select(`
                *,
                teams (
                    id,
                    name,
                    primary_zone,
                    members_count
                ),
                run_sheet_tasks (
                    id,
                    task_id,
                    sequence,
                    estimated_duration
                )
            `, { count: 'exact' })
            .order('date', { ascending: false })
            .order('time_window', { ascending: true })
            .range(offset, offset + limit - 1)

        // Apply filters
        if (dateParam) {
            query = query.eq('date', dateParam)
        }
        if (teamId) {
            query = query.eq('team_id', teamId)
        }
        if (status) {
            query = query.eq('status', status)
        }
        if (window) {
            query = query.eq('time_window', window)
        }

        const { data: runSheets, error, count } = await query

        if (error) throw error

        // Calculate summary statistics
        const summary = {
            total: count || 0,
            by_status: {
                draft: runSheets?.filter(rs => rs.status === 'draft').length || 0,
                ready: runSheets?.filter(rs => rs.status === 'ready').length || 0,
                dispatched: runSheets?.filter(rs => rs.status === 'dispatched').length || 0,
                completed: runSheets?.filter(rs => rs.status === 'completed').length || 0
            },
            total_tasks: runSheets?.reduce((sum, rs) => sum + (rs.run_sheet_tasks?.length || 0), 0) || 0,
            avg_capacity_used: runSheets?.length 
                ? Math.round(runSheets.reduce((sum, rs) => sum + (rs.capacity_used_percent || 0), 0) / runSheets.length)
                : 0
        }

        // Format run sheets with additional computed fields
        const formattedRunSheets = runSheets?.map(rs => ({
            ...rs,
            task_count: rs.run_sheet_tasks?.length || 0,
            total_estimated_duration: rs.run_sheet_tasks?.reduce(
                (sum: number, task: any) => sum + (task.estimated_duration || 0), 
                0
            ) || 0
        })) || []

        return new Response(
            JSON.stringify({
                success: true,
                run_sheets: formattedRunSheets,
                pagination: {
                    total: count,
                    limit,
                    offset,
                    has_more: (offset + limit) < (count || 0)
                },
                summary,
                filters_applied: {
                    date: dateParam,
                    team_id: teamId,
                    status,
                    window
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Error:', error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
