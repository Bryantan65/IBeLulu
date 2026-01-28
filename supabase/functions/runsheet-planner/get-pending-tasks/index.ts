// Edge Function: get-pending-tasks
// Deploy to: supabase/functions/get-pending-tasks/index.ts

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
        const status = url.searchParams.get('status') || 'approved'
        const priority = url.searchParams.get('priority')
        const zone = url.searchParams.get('zone')

        // Build query - get tasks that need scheduling
        // Tasks come from clusters that have been reviewed and approved
        let query = supabaseClient
            .from('tasks')
            .select(`
                id,
                cluster_id,
                task_type,
                assigned_team,
                planned_date,
                time_window,
                status,
                requires_approval,
                created_at,
                clusters (
                    id,
                    category,
                    zone_id,
                    severity_score,
                    priority_score,
                    state
                )
            `)
            .in('status', ['PLANNED', 'APPROVED'])
            .is('assigned_team', null) // Not yet assigned to a team

        // Apply filters
        if (zone) {
            query = query.eq('clusters.zone_id', zone)
        }

        const { data: tasks, error: tasksError } = await query.order('created_at', { ascending: true })

        if (tasksError) throw tasksError

        // Also get pending clusters without tasks (need task creation)
        const { data: pendingClusters, error: clustersError } = await supabaseClient
            .from('clusters')
            .select('*')
            .eq('state', 'REVIEWED')
            .order('priority_score', { ascending: false })

        if (clustersError) throw clustersError

        // Format response
        const formattedTasks = tasks?.map(task => ({
            task_id: task.id,
            cluster_id: task.cluster_id,
            category: task.clusters?.category || task.task_type,
            location: task.clusters?.zone_id || 'Unknown',
            zone: task.clusters?.zone_id,
            priority: determinePriority(task.clusters?.priority_score),
            severity: task.clusters?.severity_score,
            status: task.status,
            created_at: task.created_at
        })) || []

        // Add clusters that need tasks created
        const clustersNeedingTasks = pendingClusters?.filter(c => 
            !tasks?.some(t => t.cluster_id === c.id)
        ).map(cluster => ({
            task_id: null,
            cluster_id: cluster.id,
            category: cluster.category,
            location: cluster.zone_id || 'Unknown',
            zone: cluster.zone_id,
            priority: determinePriority(cluster.priority_score),
            severity: cluster.severity_score,
            status: 'NEEDS_TASK',
            created_at: cluster.created_at
        })) || []

        const allPendingItems = [...formattedTasks, ...clustersNeedingTasks]

        return new Response(
            JSON.stringify({
                success: true,
                tasks: allPendingItems,
                total_count: allPendingItems.length,
                breakdown: {
                    with_tasks: formattedTasks.length,
                    needs_tasks: clustersNeedingTasks.length
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

function determinePriority(score: number | null): string {
    if (!score) return 'week'
    if (score >= 0.8) return 'today'
    if (score >= 0.5) return '48h'
    return 'week'
}
