import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const normalizeLocation = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
const MIN_CLUSTER_SIZE = 2

function canonicalLocation(value: string): string {
  let normalized = normalizeLocation(value)
  // Strip parenthetical details to reduce label variance.
  normalized = normalized.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
  // If a postal code exists, keep the base address up to it.
  const postalMatch = normalized.match(/^(.*?singapore\s*\d{6})/)
  if (postalMatch && postalMatch[1]) {
    normalized = postalMatch[1].trim()
  }
  return normalized
}

function chooseBestLocationLabel(labels: string[]): string {
  const cleaned = labels.map((label) => label.trim()).filter(Boolean)
  if (!cleaned.length) return ''

  const withPostal = cleaned.filter((label) => /singapore\s*\d{6}/i.test(label))
  const candidates = withPostal.length ? withPostal : cleaned

  return candidates.sort((a, b) => b.length - a.length)[0]
}

function summarizeComplaints(texts: string[]): string {
  const trimmed = texts
    .map((text) => (text || '').trim())
    .filter(Boolean)
    .slice(0, 5)
  if (!trimmed.length) return 'No complaint description available.'
  return trimmed.join(' | ')
}

function maxSeverity(items: Array<{ severity_pred?: number | null }>): number | null {
  const values = items
    .map((item) => (typeof item.severity_pred === 'number' ? item.severity_pred : null))
    .filter((value): value is number => value !== null)
  if (!values.length) return null
  return Math.max(...values)
}

function requiresHumanReview(items: Array<{ requires_human_review?: boolean; hazard?: boolean; escalation?: boolean; confidence?: number | null }>): boolean {
  return items.some((item) =>
    item.requires_human_review ||
    item.hazard ||
    item.escalation ||
    (typeof item.confidence === 'number' && item.confidence < 0.6)
  )
}

async function fetchActiveClustersByLocation(
  supabaseClient: ReturnType<typeof createClient>,
  locationLabel: string,
  category: string
) {
  const { data: clusters } = await supabaseClient
    .from('clusters')
    .select('*')
    .eq('category', category)
    .not('state', 'in', '(CLOSED,RESOLVED)')

  const targetKey = canonicalLocation(locationLabel)
  const matching = (clusters || []).filter((cluster) => {
    const raw = typeof cluster.location_label === 'string'
      ? cluster.location_label
      : (typeof cluster.zone_id === 'string' ? cluster.zone_id : '')
    if (!raw) return false
    return canonicalLocation(raw) === targetKey
  })

  const unique = new Map<string, any>()
  matching.forEach((cluster) => {
    if (cluster?.id && !unique.has(cluster.id)) {
      unique.set(cluster.id, cluster)
    }
  })

  return Array.from(unique.values()).sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime()
    const bTime = new Date(b.created_at || 0).getTime()
    return aTime - bTime
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    console.log('Starting clustering...')

    const { data: complaints, error: fetchError } = await supabaseClient
      .from('complaints')
      .select('*')
      .is('cluster_id', null)
      .limit(200)

    if (fetchError) throw fetchError
    if (!complaints || complaints.length === 0) {
      return new Response(JSON.stringify({ message: 'No unclustered complaints found.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results: any[] = []
    const groups = new Map<string, { locationLabel: string; category: string; items: any[]; canonicalKey: string }>()

    for (const complaint of complaints) {
      const locationLabel = typeof complaint.location_label === 'string' ? complaint.location_label.trim() : ''
      if (!locationLabel) {
        results.push({ complaint: complaint.id, info: 'Skipped - missing location_label' })
        continue
      }

      const complaintCategory = complaint.category_pred || 'other'
      const canonicalKey = `${canonicalLocation(locationLabel)}||${complaintCategory}`

      if (!groups.has(canonicalKey)) {
        groups.set(canonicalKey, { locationLabel, category: complaintCategory, items: [], canonicalKey })
      }

      groups.get(canonicalKey)!.items.push(complaint)
    }

    for (const group of groups.values()) {
      const now = new Date().toISOString()
      const bestLabel = chooseBestLocationLabel(group.items.map((item) => item.location_label || '').filter(Boolean))
      const existingClusters = await fetchActiveClustersByLocation(
        supabaseClient,
        bestLabel || group.locationLabel,
        group.category
      )

      if (group.items.length < MIN_CLUSTER_SIZE && existingClusters.length === 0) {
        results.push({
          location: group.locationLabel,
          category: group.category,
          info: `Skipped - only ${group.items.length} complaint(s)`,
        })
        continue
      }

      let primaryCluster = existingClusters[0]
      let created = false

      if (!primaryCluster) {
        const { data: cluster, error: insertError } = await supabaseClient
          .from('clusters')
          .insert({
            category: group.category,
            zone_id: bestLabel || group.locationLabel,
            location_label: bestLabel || group.locationLabel,
            description: summarizeComplaints(group.items.map((c) => c.text || '')),
            severity_score: maxSeverity(group.items),
            recurrence_count: group.items.length,
            complaint_count: group.items.length,
            state: 'TRIAGED',
            created_at: now,
            last_seen_at: now,
          })
          .select()
          .single()

        if (insertError) {
          console.error('Cluster Insert Failed', insertError)
          continue
        }
        primaryCluster = cluster
        created = true
      }

      const complaintIds = group.items.map((c) => c.id)
      if (complaintIds.length > 0) {
        const { error: updateError } = await supabaseClient
          .from('complaints')
          .update({ cluster_id: primaryCluster.id, status: 'LINKED' })
          .in('id', complaintIds)

        if (updateError) {
          console.error('Link Failed', updateError)
        }
      }

      // Refresh complaints for accurate counts and summary
      const { data: allComplaints } = await supabaseClient
        .from('complaints')
        .select('id, severity_pred, requires_human_review, hazard, escalation, confidence, text, cluster_id')
        .eq('category_pred', group.category)

      const allItems = (allComplaints || group.items).filter((item) => {
        const label = typeof item.location_label === 'string' ? item.location_label : ''
        return canonicalLocation(label) === canonicalLocation(bestLabel || group.locationLabel)
      })

      await supabaseClient
        .from('clusters')
        .update({
          zone_id: bestLabel || group.locationLabel,
          location_label: bestLabel || group.locationLabel,
          description: summarizeComplaints(allItems.map((c) => c.text || '')),
          severity_score: maxSeverity(allItems),
          recurrence_count: allItems.length,
          complaint_count: allItems.length,
          requires_human_review: requiresHumanReview(allItems),
          last_seen_at: now,
        })
        .eq('id', primaryCluster.id)

      // Deduplicate any concurrent cluster creations
      const refreshedClusters = await fetchActiveClustersByLocation(
        supabaseClient,
        group.locationLabel,
        group.category
      )

      if (refreshedClusters.length > 1) {
        const primary = refreshedClusters[0]
        const duplicates = refreshedClusters.slice(1)
        const duplicateIds = duplicates.map((cluster) => cluster.id)

        if (duplicateIds.length > 0) {
          await supabaseClient
            .from('complaints')
            .update({ cluster_id: primary.id })
            .in('cluster_id', duplicateIds)

          await supabaseClient
            .from('clusters')
            .update({
              state: 'CLOSED',
              review_notes: `Merged into cluster ${primary.id}`,
              last_action_at: now,
            })
            .in('id', duplicateIds)
        }
      }

      results.push({ cluster_id: primaryCluster.id, count: group.items.length, created })
    }

    return new Response(JSON.stringify({ success: true, clusters_processed: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
