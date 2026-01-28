// Edge Function: get-team-availability
// Deploy to: supabase/functions/get-team-availability/index.ts

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
        const dateParam = url.searchParams.get('date') || new Date().toISOString().split('T')[0]
        const window = url.searchParams.get('window') || 'AM'

        // Get all active teams
        const { data: teams, error: teamsError } = await supabaseClient
            .from('teams')
            .select('*')
            .eq('is_active', true)
            .order('name')

        if (teamsError) throw teamsError

        // Get existing run sheets for this date/window to calculate assigned tasks
        const { data: runSheets, error: runSheetsError } = await supabaseClient
            .from('run_sheets')
            .select(`
                id,
                team_id,
                status,
                run_sheet_tasks (
                    id,
                    task_id
                )
            `)
            .eq('date', dateParam)
            .eq('time_window', window)

        if (runSheetsError) throw runSheetsError

        // Calculate availability for each team
        const teamsWithAvailability = teams?.map(team => {
            const teamRunSheet = runSheets?.find(rs => rs.team_id === team.id)
            const assignedTasks = teamRunSheet?.run_sheet_tasks?.length || 0
            const availableCapacity = team.max_tasks_per_window - assignedTasks

            return {
                team_id: team.id,
                team_name: team.name,
                members_count: team.members_count,
                max_tasks: team.max_tasks_per_window,
                assigned_tasks: assignedTasks,
                available_capacity: Math.max(0, availableCapacity),
                primary_zone: team.primary_zone,
                has_run_sheet: !!teamRunSheet,
                run_sheet_id: teamRunSheet?.id || null,
                run_sheet_status: teamRunSheet?.status || null
            }
        }) || []

        const totalCapacity = teamsWithAvailability.reduce((sum, t) => sum + t.available_capacity, 0)
        const totalMaxCapacity = teamsWithAvailability.reduce((sum, t) => sum + t.max_tasks, 0)
        const totalAssigned = teamsWithAvailability.reduce((sum, t) => sum + t.assigned_tasks, 0)

        return new Response(
            JSON.stringify({
                success: true,
                date: dateParam,
                window: window,
                teams: teamsWithAvailability,
                summary: {
                    total_teams: teamsWithAvailability.length,
                    total_capacity: totalCapacity,
                    total_max_capacity: totalMaxCapacity,
                    total_assigned: totalAssigned,
                    utilization_percent: totalMaxCapacity > 0 
                        ? Math.round((totalAssigned / totalMaxCapacity) * 100) 
                        : 0
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
