// Edge Function: dispatch-run-sheet
// Deploy to: supabase/functions/dispatch-run-sheet/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DispatchRequest {
    run_sheet_id: string
    notify_team?: boolean
    dispatch_notes?: string
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ success: false, error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        const body: DispatchRequest = await req.json()

        // Validate required fields
        if (!body.run_sheet_id) {
            return new Response(
                JSON.stringify({ success: false, error: 'run_sheet_id is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Fetch the run sheet with team info
        const { data: runSheet, error: fetchError } = await supabaseClient
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
            `)
            .eq('id', body.run_sheet_id)
            .single()

        if (fetchError || !runSheet) {
            return new Response(
                JSON.stringify({ success: false, error: 'Run sheet not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Check if already dispatched
        if (runSheet.status === 'dispatched') {
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Run sheet has already been dispatched',
                    dispatched_at: runSheet.dispatched_at
                }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Check if completed (can't dispatch completed run sheets)
        if (runSheet.status === 'completed') {
            return new Response(
                JSON.stringify({ success: false, error: 'Cannot dispatch a completed run sheet' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Check if run sheet has tasks
        if (!runSheet.run_sheet_tasks || runSheet.run_sheet_tasks.length === 0) {
            return new Response(
                JSON.stringify({ success: false, error: 'Cannot dispatch an empty run sheet' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Update run sheet status to dispatched
        const dispatchTime = new Date().toISOString()
        const updatedNotes = body.dispatch_notes 
            ? (runSheet.notes ? `${runSheet.notes}\n\n[Dispatch Notes]: ${body.dispatch_notes}` : `[Dispatch Notes]: ${body.dispatch_notes}`)
            : runSheet.notes

        const { data: updatedRunSheet, error: updateError } = await supabaseClient
            .from('run_sheets')
            .update({
                status: 'dispatched',
                dispatched_at: dispatchTime,
                notes: updatedNotes
            })
            .eq('id', body.run_sheet_id)
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
            `)
            .single()

        if (updateError) throw updateError

        // Log the dispatch action to audit_log if table exists
        try {
            await supabaseClient
                .from('audit_log')
                .insert({
                    action: 'RUN_SHEET_DISPATCHED',
                    entity_type: 'run_sheet',
                    entity_id: body.run_sheet_id,
                    details: {
                        team_id: runSheet.team_id,
                        team_name: runSheet.teams?.name,
                        date: runSheet.date,
                        time_window: runSheet.time_window,
                        task_count: runSheet.run_sheet_tasks?.length,
                        notify_team: body.notify_team ?? true
                    }
                })
        } catch (auditError) {
            // Don't fail if audit log fails - it's non-critical
            console.warn('Failed to log to audit_log:', auditError)
        }

        // Prepare notification payload (for future integration)
        const notificationPayload = {
            type: 'run_sheet_dispatched',
            team_id: runSheet.team_id,
            team_name: runSheet.teams?.name,
            run_sheet_id: body.run_sheet_id,
            date: runSheet.date,
            time_window: runSheet.time_window,
            task_count: runSheet.run_sheet_tasks?.length,
            zones: runSheet.zones_covered,
            dispatched_at: dispatchTime
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: `Run sheet dispatched to ${runSheet.teams?.name}`,
                run_sheet: updatedRunSheet,
                notification: {
                    sent: body.notify_team ?? true,
                    payload: notificationPayload
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
