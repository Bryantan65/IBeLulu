import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

interface WeatherData {
  rain_prob: number
  temperature: number
  humidity: number
}

interface HistoricalPattern {
  zone_id: string
  category: string
  avg_severity: number
  recurrence_count: number
  last_incident: string
  complaint_count: number
}

interface ForecastInput {
  tomorrow_date: string
  weather: WeatherData
  historical_patterns: HistoricalPattern[]
  recent_clusters: any[]
}

interface ForecastResult {
  date: string
  zone_id: string
  predicted_category: string
  risk_score: number
  reason: string
  suggested_preemptive_task: string
  confidence: number
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const ibmApiKey = Deno.env.get("IBM_API_KEY")

    if (!supabaseUrl || !supabaseKey || !ibmApiKey) {
      throw new Error("Missing environment variables")
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Get weather data from get-weather function
    console.log("🌤️ Fetching weather forecast...")
    const weatherRes = await fetch(`${supabaseUrl}/functions/v1/get-weather`, {
      headers: { "Content-Type": "application/json" },
    })

    if (!weatherRes.ok) {
      console.warn(`Weather API failed (${weatherRes.status}), using defaults`)
    }

    const weatherData = weatherRes.ok ? await weatherRes.json() : {}

    // Parse weather from Singapore API format
    const forecastData = weatherData.forecasts?.[0] || {}
    const rainProb = forecastData.rainfall ? 0.7 : 0.3 // Simple heuristic
    const temperature = 28 // Default Singapore temp
    const humidity = 78 // Default Singapore humidity

    const weather: WeatherData = {
      rain_prob: rainProb,
      temperature: temperature,
      humidity: humidity,
    }

    console.log("✅ Weather:", weather)

    // 2. Query historical complaints (blocked_drain, litter, cleaning, walkway_cleanliness)
    console.log("📊 Fetching historical complaint patterns...")
    const { data: complaints, error: complaintsError } = await supabase
      .from("complaints")
      .select(
        `
        id,
        category_pred,
        zone_id: location_label,
        severity_pred,
        created_at,
        cluster:clusters(
          id,
          zone_id,
          category,
          state,
          severity_score,
          recurrence_count,
          last_seen_at
        )
      `
      )
      .in("category_pred", [
        "blocked_drain",
        "litter",
        "cleaning",
        "walkway_cleanliness",
        "overflow",
        "smell",
      ])
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    if (complaintsError) {
      console.error("Complaints query error:", complaintsError)
    }

    // 3. Build historical patterns by zone
    const patternMap = new Map<string, HistoricalPattern>()

    if (complaints) {
      for (const complaint of complaints) {
        const zoneId = complaint.zone_id || "UNKNOWN"
        const category = complaint.category_pred || "other"

        if (!patternMap.has(zoneId)) {
          patternMap.set(zoneId, {
            zone_id: zoneId,
            category: category,
            avg_severity: complaint.severity_pred || 2,
            recurrence_count: 1,
            last_incident: new Date().toISOString().split("T")[0],
            complaint_count: 1,
          })
        } else {
          const pattern = patternMap.get(zoneId)!
          pattern.complaint_count += 1
          pattern.recurrence_count = Math.min(
            pattern.recurrence_count + 1,
            10
          )
          pattern.avg_severity =
            (pattern.avg_severity + (complaint.severity_pred || 2)) / 2
        }
      }
    }

    const historicalPatterns = Array.from(patternMap.values())
    console.log(`✅ Found ${historicalPatterns.length} zones with complaint history`)

    // 4. Get recent clusters
    const { data: clusters, error: clustersError } = await supabase
      .from("clusters")
      .select("*")
      .in("state", ["TRIAGED", "REVIEWED", "PLANNED"])
      .order("created_at", { ascending: false })
      .limit(10)

    if (clustersError) {
      console.error("Clusters query error:", clustersError)
    }

    const recentClusters = clusters || []
    console.log(`✅ Found ${recentClusters.length} recent clusters`)

    // 5. Determine target date (from request or default to tomorrow)
    let tomorrowDate: string | null = null

    try {
      // Clone the request to avoid consuming the body if we need it later (though we don't here)
      // or just try/catch the json parse
      const body = await req.json()
      if (body?.date) {
        tomorrowDate = body.date
      }
    } catch {
      // Request body might be empty or invalid JSON, ignore
    }

    if (!tomorrowDate) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrowDate = tomorrow.toISOString().split("T")[0]
    }

    // 6. Call IBM Watsonx Forecast Agent
    console.log("🤖 Calling Forecast Agent...")

    // Get IBM token
    const tokenRes = await fetch(
      `${supabaseUrl}/functions/v1/watson-token-internal`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    )

    if (!tokenRes.ok) {
      throw new Error(`Failed to get IBM Watson token: ${tokenRes.statusText}`)
    }

    const tokenData = await tokenRes.json()
    const watsonToken = tokenData.token

    if (!watsonToken) {
      throw new Error("Failed to get IBM Watson token from response")
    }

    // Build agent input
    const agentInput: ForecastInput = {
      tomorrow_date: tomorrowDate,
      weather,
      historical_patterns: historicalPatterns,
      recent_clusters: recentClusters,
    }

    console.log("📤 Agent input:", JSON.stringify(agentInput, null, 2))

    // Call Watsonx agent
    // Using same pattern as complaints agent
    const FORECAST_AGENT_ID = Deno.env.get("FORECAST_AGENT_ID")
    const INSTANCE_ID = Deno.env.get("WATSON_INSTANCE_ID")

    if (!FORECAST_AGENT_ID || !INSTANCE_ID) {
      throw new Error("Missing Watson Agent ID or Instance ID configuration")
    }

    const agentUrl = `https://ap-southeast-1.dl.watson-orchestrate.ibm.com/instances/${INSTANCE_ID}/v1/orchestrate/${FORECAST_AGENT_ID}/chat/completions`

    const agentResponse = await fetch(agentUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${watsonToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        stream: false,
        messages: [
          {
            role: "user",
            content: [
              {
                response_type: "text",
                text: JSON.stringify(agentInput),
              },
            ],
          },
        ],
      }),
    })

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text()
      throw new Error(
        `Agent API error: ${agentResponse.status} - ${errorText}`
      )
    }

    const agentData = await agentResponse.json()
    const agentMessage =
      agentData.choices?.[0]?.message?.content?.[0]?.text || "[]"

    console.log("🤖 Agent response:", agentMessage)

    // Parse agent response (should be JSON array of forecasts)
    let forecasts: ForecastResult[] = []
    try {
      // Agent returns JSON string, parse it
      forecasts = JSON.parse(agentMessage)
      if (!Array.isArray(forecasts)) {
        forecasts = [forecasts]
      }
    } catch (parseError) {
      console.error("Failed to parse agent response:", parseError)
      // Try to extract JSON from response
      const jsonMatch = agentMessage.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        forecasts = JSON.parse(jsonMatch[0])
      } else {
        console.warn("No JSON array found in agent response")
      }
    }

    console.log(`✅ Generated ${forecasts.length} forecasts`)

    // 7. Store forecasts in database
    if (forecasts.length > 0) {
      const forecastsToStore = forecasts.map((f) => ({
        date: f.date || tomorrowDate,
        zone_id: f.zone_id,
        predicted_category: f.predicted_category,
        risk_score: f.risk_score,
        reason: f.reason,
        suggested_preemptive_task: f.suggested_preemptive_task,
        created_at: new Date().toISOString(),
      }))

      const { error: insertError } = await supabase
        .from("forecasts")
        .insert(forecastsToStore)

      if (insertError) {
        console.error("Error storing forecasts:", insertError)
      } else {
        console.log("✅ Stored forecasts in database")
      }
    }

    // Also store weather signals for audit trail
    const { error: signalError } = await supabase.from("forecast_signals").insert({
      date: tomorrowDate,
      zone_id: "SINGAPORE",
      weather_rain_prob: weather.rain_prob,
      weather_temp: weather.temperature,
      weather_humidity: weather.humidity,
      notes: `Forecast generated on ${new Date().toISOString()}`,
      created_at: new Date().toISOString(),
    })

    if (signalError) {
      console.error("Error storing weather signal:", signalError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        tomorrow_date: tomorrowDate,
        weather,
        forecasts,
        message: `Generated ${forecasts.length} risk forecasts for tomorrow`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    )
  } catch (error) {
    console.error("Error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    )
  }
})
