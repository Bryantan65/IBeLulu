import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight request
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Create a Supabase client with the Auth context of the logged in user
        const supabaseClient = createClient(
            // Automatically injected by Supabase Edge Runtime
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            // Create client with Auth context of the user that called the function.
            // This way your Row Level Security (RLS) policies are applied.
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        // Parse the JSON body from the request
        const {
            text,
            location_text,
            category,
            severity,
            urgency,
            confidence,
            notes,
            hazard,
            escalation
        } = await req.json()

        // 1. Insert into 'complaints' table
        const { data: complaint, error: complaintError } = await supabaseClient
            .from('complaints')
            .insert([
                {
                    text: text,
                    location_label: location_text,
                    category_pred: category,
                    severity_pred: severity,
                    urgency_pred: urgency,
                    confidence: confidence,
                    requires_human_review: confidence < 0.7 || escalation,
                    hazard: hazard || false,
                    escalation: escalation || false
                }
            ])
            .select()
            .single()

        if (complaintError) {
            console.error('Complaint insert error:', complaintError)
            throw new Error(`Failed to insert complaint: ${complaintError.message}`)
        }

        // 2. Insert into 'audit_log' table
        // (We treat this as non-critical: log error but don't fail request if it fails)
        const { error: auditError } = await supabaseClient
            .from('audit_log')
            .insert([
                {
                    entity_type: 'complaint',
                    agent_name: 'ComplaintsAgent',
                    action: 'TRIAGE',
                    outputs_summary: { category, severity, urgency, notes, hazard, escalation },
                    confidence: confidence
                }
            ])

        if (auditError) console.error('Audit log insert error:', auditError)

        // Return success response
        return new Response(
            JSON.stringify({
                success: true,
                message: "Report submitted successfully",
                complaint_id: complaint.id
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            }
        )

    } catch (error) {
        console.error('Edge Function Error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400
            }
        )
    }
})
