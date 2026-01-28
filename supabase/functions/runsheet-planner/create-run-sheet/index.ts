// Edge Function: create-run-sheet
// Deploy to: supabase/functions/create-run-sheet/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateRunSheetRequest {
    team_id: string
    date: string
    time_window: 'AM' | 'PM'
    task_ids: string[]
    zones_covered?: string[]
    notes?: string
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

        const body: CreateRunSheetRequest = await req.json()

        // Validate required fields
        if (!body.team_id || !body.date || !body.time_window || !body.task_ids?.length) {
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Missing required fields: team_id, date, time_window, and task_ids are required' 
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Verify team exists and is active
        const { data: team, error: teamError } = await supabaseClient
            .from('teams')
            .select('*')
            .eq('id', body.team_id)
            .eq('is_active', true)
            .single()

        if (teamError || !team) {
            return new Response(
                JSON.stringify({ success: false, error: 'Team not found or inactive' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Check if run sheet already exists for this team/date/window
        const { data: existingRunSheet } = await supabaseClient
            .from('run_sheets')
            .select('id')
            .eq('team_id', body.team_id)
            .eq('date', body.date)
            .eq('time_window', body.time_window)
            .single()

        if (existingRunSheet) {
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Run sheet already exists for this team/date/window combination',
                    existing_run_sheet_id: existingRunSheet.id
                }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Check capacity
        if (body.task_ids.length > team.max_tasks_per_window) {
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: `Task count (${body.task_ids.length}) exceeds team capacity (${team.max_tasks_per_window})` 
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Calculate capacity used percentage
        const capacityUsedPercent = Math.round((body.task_ids.length / team.max_tasks_per_window) * 100)

        // Create the run sheet
        const { data: runSheet, error: runSheetError } = await supabaseClient
            .from('run_sheets')
            .insert({
                team_id: body.team_id,
                date: body.date,
                time_window: body.time_window,
                status: 'draft',
                zones_covered: body.zones_covered || [team.primary_zone],
                notes: body.notes || null,
                capacity_used_percent: capacityUsedPercent
            })
            .select()
            .single()

        if (runSheetError) throw runSheetError

        // Create run sheet tasks with sequence
        const runSheetTasks = body.task_ids.map((taskId, index) => ({
            run_sheet_id: runSheet.id,
            task_id: taskId,
            sequence: index + 1,
            estimated_duration: 30 // Default 30 minutes per task
        }))

        const { error: tasksError } = await supabaseClient
            .from('run_sheet_tasks')
            .insert(runSheetTasks)

        if (tasksError) {
            // Rollback: delete the run sheet if task insertion fails
            await supabaseClient.from('run_sheets').delete().eq('id', runSheet.id)
            throw tasksError
        }

        // Update the tasks to mark them as scheduled
        const { error: updateTasksError } = await supabaseClient
            .from('tasks')
            .update({
                status: 'SCHEDULED',
                assigned_team: body.team_id,
                planned_date: body.date,
                time_window: body.time_window
            })
            .in('id', body.task_ids)

        if (updateTasksError) {
            // Rollback: delete run_sheet_tasks and run_sheet if task update fails
            await supabaseClient.from('run_sheet_tasks').delete().eq('run_sheet_id', runSheet.id)
            await supabaseClient.from('run_sheets').delete().eq('id', runSheet.id)
            throw updateTasksError
        }

        // Fetch the complete run sheet with tasks
        const { data: completeRunSheet, error: fetchError } = await supabaseClient
            .from('run_sheets')
            .select(`
                *,
                teams (id, name, primary_zone),
                run_sheet_tasks (
                    id,
                    task_id,
                    sequence,
                    estimated_duration
                )
            `)
            .eq('id', runSheet.id)
            .single()

        if (fetchError) throw fetchError

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Run sheet created successfully',
                run_sheet: completeRunSheet
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
