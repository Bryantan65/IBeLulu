# EstateOps Orchestrator (Town Council)
## With Best Single Upgrade: Proactive Risk Forecast + What-If Simulator

EstateOps Orchestrator is an agentic operations coordinator for Town Councils. It closes the loop from resident complaints to coordinated work execution to verified improvements.

**Best single upgrade added:** a **Proactive Risk Forecast** that generates a “tomorrow plan” and a **What-If simulator** that lets supervisors test policy knobs (fairness, SLA urgency, manpower) before dispatch.

---

## 1) Why this matters

### Liveability outcomes
- Reduce time from report → plan → dispatch
- Reduce repeat complaints for the same hotspot
- Improve first-time fix rate (fewer reopenings)
- Increase resident update coverage

### Environmental outcomes (practical proxies)
- Increase bundling efficiency (tasks per trip)
- Reduce estimated travel distance vs naive dispatch
- Reduce rework (repeat dispatches for same cluster)
- Reduce overflow incidents where measurable

---

## 2) What it does end-to-end

1) Resident submits complaint (Telegram or web form) with location and optional photo  
2) **Complaints Agent** triages into category, severity, urgency, confidence, suggested task  
3) **Clusterer** merges duplicates into persistent hotspot clusters (state machine)  
4) **Review Agent** selects playbook, applies fairness rules, routes risky cases to approval  
5) **Scheduling Agent** generates run sheets (bundling + ordering) under manpower constraints  
6) **Dispatch** posts run sheet to ops channel and creates tasks (approval gates)  
7) Ops uploads completion evidence; supervisor verifies; cluster closes  
8) Residents get status updates at PLANNED and VERIFIED  
9) Dashboard updates metrics and playbook scoring learns from recurrence

**NEW (Upgrade):**
10) **Forecast Agent** predicts likely hotspots for the next day using public signals + historical patterns  
11) **What-If Simulator** previews outcomes under policy knobs before supervisor commits to dispatch

---

## 3) The Best Single Upgrade

### 3.1 Forecast Agent: “Tomorrow Risk Forecast”
**Goal:** Move from reactive “handle tickets” to proactive “prevent spikes.”

**Inputs (MVP-safe, no private data):**
- Weather forecast (rain probability, temperature, humidity)
- Public event calendar (optional; manual import CSV for hackathon)
- Historical complaints and cluster recurrence patterns
- Zone assets metadata (optional, public): bin density, markets, schools, food centres

**Outputs:**
- `risk_hotspots`: ranked list of zones/areas with predicted categories (overflow/litter/smell)
- `preemptive_tasks`: recommended inspections / bin checks / washdowns for high-risk zones
- `tomorrow_plan`: a draft run sheet that includes both reactive clusters + proactive tasks

**Why it’s innovative (judge framing):**
- Agentic system becomes **district-scale preventive operations**, not just dispatch automation.
- Environmental impact improves via fewer overflows and fewer repeat trips.

### 3.2 What-If Simulator
Before dispatch, a supervisor can test scenarios:
- **Knobs**
  - Fairness boost strength (silent zones)
  - SLA thresholds (TODAY vs 48H)
  - Manpower counts per team
  - Max tasks per team per window
  - “Proactive budget” (cap proactive tasks/day)

- **Simulator outputs**
  - Estimated time to dispatch
  - Estimated distance traveled (bundled vs naive)
  - Coverage metrics (zones served)
  - Predicted overflow risk reduction (simple proxy)
  - Tradeoff alerts (eg, fairness increased but distance rises)

---

## 4) Scope (3 day build)
Ship an end-to-end workflow including the upgrade.

**In scope:**
- Telegram/web intake
- Agent triage + clustering
- Review + approval gates
- Scheduling + run sheet + dispatch
- Evidence upload + verification + resident updates
- Outcomes dashboard
- Playbook scoring adaptation
- **Forecast Agent + Tomorrow Plan tab**
- **What-If simulator (2–4 knobs)**

**Out of scope:**
- Full integration into internal TC systems
- Advanced route optimisation
- Training custom ML models
- Any private CCTV or personal data

---

## 5) Architecture (MVP)

### Interfaces
- Resident intake: Telegram bot or simple web form
- Ops dashboard: web dashboard
- Dispatch: Telegram ops group + downloadable run sheet
- Optional: `.ics` export for team schedule

### Core agentic loop
Hotspot clusters are persistent entities with state transitions. Agents operate continuously over time, not one-off.

### Components
- **Services:** API server + database + job scheduler (daily forecast job)
- **Agents (powered by IBM watsonx.ai):**
  - ComplaintsAgent (triage)
  - ReviewAgent (playbook + fairness + gating)
  - RunSheetPlannerAgent (AI optimizer - creates draft run sheets from approved tasks)
  - DispatchCoordinatorAgent (supervisor - reviews, dispatches, and monitors run sheets)
  - ForecastAgent (tomorrow risk + proactive tasks)
  - Verification flow (human + optional evidence checks)
  
**Agent Implementation:**
All agents will use **IBM watsonx.ai foundation models** (Granite 13B or Llama 3) for LLM-powered decision-making. Each agent will:
- Call watsonx.ai API with structured prompts
- Receive JSON-formatted responses
- Apply business rules and guardrails
- Log decisions to audit_log for transparency
- Use watsonx.governance for explainable AI compliance

---

## 6) State machine (clusters)
Each cluster uses:
- NEW → TRIAGED → REVIEWED → PLANNED → DISPATCHED → VERIFIED → CLOSED

Transitions:
- Complaint intake creates/updates cluster
- Complaints Agent sets TRIAGED
- Review Agent sets REVIEWED
- Scheduling Agent sets PLANNED + tasks created
- Dispatch sets DISPATCHED
- Evidence + verification sets VERIFIED and cluster CLOSED

---

## 7) Data model (existing + upgrade)

### complaints
- id, user_id (telegram id or anonymous), text, photo_url?, lat, lng, location_label
- created_at, channel, status (RECEIVED/LINKED)
- category_pred, severity_pred (1–5), urgency_pred (TODAY/48H/WEEK)
- confidence (0–1), cluster_id

### clusters
- id, category, centroid_lat, centroid_lng, zone_id
- state, severity_score, recurrence_count, last_seen_at
- assigned_playbook, requires_human_review
- priority_score, last_action_at

### tasks
- id, cluster_id?, task_type (cleanup/bulky_removal/bin_washdown/inspection)
- assigned_team (CLEANING/WASTE), planned_date, time_window (AM/PM)
- status (PLANNED/DISPATCHED/DONE/VERIFIED)
- requires_approval, dispatch_message_id?

### evidence
- id, task_id, before_image_url, after_image_url, file_path, notes, submitted_at, submitted_by

### playbook_scores
- id, playbook_name, category, success_count, fail_count, last_updated

### audit_log
- id, entity_type, entity_id, agent_name
- action (TRIAGE/REVIEW/PLAN/DISPATCH/VERIFY/FORECAST/SIMULATE)
- inputs_summary, outputs_summary, confidence, human_approved_by?, timestamp

---

### NEW: forecast_signals
Stores the daily signals used (for auditability).
- id
- date
- zone_id
- weather_rain_prob, weather_temp, weather_humidity (optional subset)
- event_flag (bool) + event_type (optional)
- notes (optional)
- created_at

### NEW: forecasts
Forecast results (ranked).
- id
- date
- zone_id
- predicted_category (bin_overflow/litter/smell/general_cleanliness)
- risk_score (0–1)
- reason (1–2 lines)
- suggested_preemptive_task (inspection/bin_washdown/bin_check)
- created_at

### NEW: simulations
What-If run results for transparency.
- id
- date
- knobs_json
- output_metrics_json
- created_by
- created_at

---

## 8) Agents (with upgrade)

### 8.1 Complaints Agent (TRIAGE)
**Input:** complaint text, photo presence, location label  
**Output JSON:**
- category, severity (1–5), urgency (TODAY/48H/WEEK), confidence (0–1)
- suggested_task_type, reason (1–2 lines)

**Rules overlay:**
- If overflow or smell present: severity min 3
- If confidence < 0.6: requires_human_review = true
- If photo exists: +0.1 confidence

Logs `TRIAGE` into `audit_log`.

---

### 8.2 Clusterer (GROUP DUPLICATES)
Deterministic:
- Same category
- Distance threshold: 80m
- Time threshold: 72h

Updates cluster severity_score and priority_score, logs to `audit_log`.

---

### 8.3 Review Agent (PLAYBOOK + FAIRNESS + RISK)
**Input:** cluster, recurrence, time since last action, zone stats, confidence, severity  
**Output JSON:** playbook, root_cause_guess, requires_human_review, fairness_note

**Fairness (signature feature):**
- Silent zone boost: if zone complaint volume low but severity high, boost priority_score

**Gating:**
- severity >= 4 → human review
- confidence < 0.6 → human review

Logs `REVIEW`.

---

### 8.4 RunSheet Planner Agent (AI OPTIMIZER)
**Role:** Creates optimized draft run sheets from approved tasks

**Input:** approved tasks, team availability, manpower per team, AM/PM windows, capacity constraints  
**Output JSON:** draft run_sheets by team and time window

**AI Optimization Process:**
1) Geographic clustering - group tasks by proximity
2) Priority sorting - high urgency tasks first
3) Team-zone matching - assign teams to their primary zones when possible
4) Capacity balancing - distribute workload evenly across teams
5) Route optimization - order tasks for minimal travel within zone
6) Draft creation - generate run sheets with status='draft' for supervisor review

**Tools:**
- create-tasks-from-clusters: Convert reviewed clusters into approved tasks
- get-pending-tasks: Retrieve tasks needing scheduling
- get-team-availability: Check team capacity and assignments
- create-run-sheet: Generate optimized draft run sheet
- get-run-sheets: Review created run sheets

**Output:** Tasks updated to status='SCHEDULED', run sheets created with status='draft'

Logs `PLAN`.

---

### 8.5 Dispatch Coordinator Agent (SUPERVISOR)
**Role:** Reviews draft run sheets, adds instructions, dispatches to field teams

**Input:** draft run_sheets, team status, operational context  
**Output:** dispatched run sheets with notes and assignments

**Workflow:**
1) Review draft run sheets created by Planner
2) Add dispatch notes and special instructions
3) Validate team readiness and capacity
4) Dispatch approved run sheets to field teams
5) Monitor run sheet status and completion
6) Handle exceptions and reassignments

**Tools:**
- get-run-sheets: View draft and dispatched run sheets
- dispatch-run-sheet: Send run sheet to field team with notes

**Output:** Run sheets updated to status='dispatched', notifications sent, audit log updated

**Collaboration:** Works with RunSheet_Planner_Agent (receives optimized drafts for review)

Logs `DISPATCH`.

---

### 8.6 NEW: Forecast Agent (TOMORROW PLAN)
**Runs daily** (or on-demand demo button).

**Input:**
- Weather forecast (public)
- Optional events (manual CSV)
- Historical complaint recurrence by zone and category
- Recent cluster density by zone
- Optional bin density metadata

**Output:**
- Ranked forecast list per zone
- Preemptive tasks list
- Draft tomorrow plan (merged with existing open clusters)

**MVP scoring approach (simple but defensible):**
- `risk_score = base_zone_rate + rain_boost + event_boost + recurrence_boost - recent_service_credit`
- Then clamp 0..1, pick top K zones

Logs `FORECAST`.

---

### 8.7 NEW: What-If Simulator
**Input:**
- Knobs: fairness_boost_strength, manpower, proactive_budget, SLA thresholds, caps

**Output metrics (MVP proxies):**
- Estimated distance: bundled vs naive
- Tasks per trip (bundling efficiency)
- Coverage by zones
- SLA compliance estimate (by urgency)
- Overflow risk reduction proxy (if predicted overflow zones get preemptive tasks)

Logs `SIMULATE`.

---

## 9) Guardrails and threat model
- Confidence gating to human review queue
- Approval tier for high severity dispatch
- Evidence requirement for closure verification
- Rate limiting for spam submissions
- Privacy minimisation: no personal identifiers; use block-level public areas only
- Immutable audit log for decisions and approvals
- Forecast uses only public signals and aggregated historical patterns

---

## 10) Minimal dashboard screens
1) Incoming complaints (triage + cluster assignment)
2) Hotspot clusters (map/list, priority sorting, fairness flags)
3) Review queue (approve/override playbook, approve dispatch)
4) Run sheet (daily plan + export + dispatch)
5) Evidence & verification (before/after, verify/return)
6) Outcomes dashboard (time-to-x, repeat rate, distance saved)
7) **NEW: Tomorrow Plan**
   - Forecast hotspots
   - Preemptive tasks
   - Merge preview with reactive backlog
8) **NEW: What-If**
   - Sliders/inputs for knobs
   - Compare scenario A vs B metrics

---

## 11) 3 day build plan (updated)

### Day 1
- DB schema + core tables
- Complaint intake (Telegram/web)
- Complaints Agent triage
- Clustering into hotspots
- Audit logging (triage + cluster update)
- Basic dashboard: complaints + clusters

### Day 2
- Review Agent playbooks + fairness + gating
- Supervisor approval flow
- RunSheet Planner Agent - AI optimization for draft run sheets
- Dispatch Coordinator Agent - supervisor review and dispatch
- Dashboard: review queue + run sheet
- Add simulation scaffolding (store knobs + metrics)

### Day 3
- Dispatch to ops group
- Evidence upload + verification flow
- Resident status updates
- Outcomes dashboard
- Playbook scoring + adaptive selection
- **Forecast Agent + Tomorrow Plan tab**
- **What-If simulator knobs + comparison card**
- Optional `.ics` export

---

## 12) Demo flow (shows innovation clearly)
1) Submit 6 complaints near same area, plus 2 in a “silent zone”
2) Show triage outputs and clustering into hotspots
3) Show fairness boost promoting silent zone priority
4) Supervisor approves playbook for high-severity cluster
5) Show run sheet generation and bundling by zone
6) **Show Forecast Agent**
   - Toggle “rain tomorrow” scenario
   - Tomorrow Plan highlights bin overflow risk zones
   - Adds preemptive inspection/bin-check tasks
7) **Show What-If**
   - Increase fairness strength vs reduce travel distance
   - Reduce manpower and watch SLA/compliance drop
8) Dispatch to ops group
9) Upload after-photo, verify, resident gets “resolved” update
10) Dashboard updates metrics + playbook score changes

---

## 13) What makes this hackathon-strong
- True agentic loop with persistent state + multiple agents + tool actions + adaptation
- Human approval gates and audit log (realistic governance)
- Evidence-based closure (trust layer)
- **Proactive district-scale prevention (Forecast Agent)**
- **Policy tradeoff visibility (What-If simulator)**

---

## Repo structure (suggested)
- `/apps/dashboard` Web UI
- `/apps/bot` Telegram intake + ops dispatch
- `/services/api` API + agents orchestration
- `/services/jobs` daily forecast scheduler
- `/db` schema + migrations
- `/docs` demo scripts, architecture diagrams

---

## License
Hackathon prototype. Not open source unless explicitly stated.
