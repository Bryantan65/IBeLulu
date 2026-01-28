// Edge Function: create-tasks-from-clusters
// Deploy to: supabase/functions/create-tasks-from-clusters/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateTasksRequest {
    cluster_ids?: string[]  // Optional: specific clusters, or all if omitted
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

        const body: CreateTasksRequest = await req.json().catch(() => ({}))

        // Get reviewed clusters that don't have tasks yet
        let clustersQuery = supabaseClient
            .from('clusters')
            .select('*')
            .eq('state', 'REVIEWED')

        // Filter by specific cluster IDs if provided
        if (body.cluster_ids && body.cluster_ids.length > 0) {
            clustersQuery = clustersQuery.in('id', body.cluster_ids)
        }

        const { data: clusters, error: clustersError } = await clustersQuery

        if (clustersError) throw clustersError

        if (!clusters || clusters.length === 0) {
            return new Response(
                JSON.stringify({ 
                    success: true, 
                    message: 'No reviewed clusters found to convert',
                    tasks_created: 0
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Check which clusters already have tasks
        const { data: existingTasks } = await supabaseClient
            .from('tasks')
            .select('cluster_id')
            .in('cluster_id', clusters.map(c => c.id))

        const existingClusterIds = new Set(existingTasks?.map(t => t.cluster_id) || [])
        
        // Filter out clusters that already have tasks
        const clustersNeedingTasks = clusters.filter(c => !existingClusterIds.has(c.id))

        if (clustersNeedingTasks.length === 0) {
            return new Response(
                JSON.stringify({ 
                    success: true, 
                    message: 'All selected clusters already have tasks',
                    tasks_created: 0,
                    clusters_checked: clusters.length
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Create tasks from clusters
        const tasksToCreate = clustersNeedingTasks.map(cluster => ({
            cluster_id: cluster.id,
            task_type: cluster.category || 'General',
            status: cluster.requires_human_review ? 'PLANNED' : 'APPROVED',
            requires_approval: cluster.requires_human_review || false,
            assigned_team: null,
            planned_date: null,
            time_window: null
        }))

        const { data: createdTasks, error: tasksError } = await supabaseClient
            .from('tasks')
            .insert(tasksToCreate)
            .select()

        if (tasksError) throw tasksError

        // Update cluster states to indicate tasks have been created
        const { error: updateError } = await supabaseClient
            .from('clusters')
            .update({ state: 'TASK_CREATED' })
            .in('id', clustersNeedingTasks.map(c => c.id))

        if (updateError) {
            console.warn('Failed to update cluster states:', updateError)
            // Don't fail the request - tasks were created successfully
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: `Created ${createdTasks?.length || 0} tasks from reviewed clusters`,
                tasks_created: createdTasks?.length || 0,
                tasks: createdTasks,
                clusters_processed: clustersNeedingTasks.map(c => ({
                    cluster_id: c.id,
                    category: c.category,
                    zone: c.zone_id,
                    priority_score: c.priority_score
                }))
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
