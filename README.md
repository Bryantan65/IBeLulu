# Aegis

A multi-agent operations coordination system for town councils that automates complaint triage, task scheduling, and field work verification. Built for the IBM-SMU Hackathon.

## Project Overview

Town councils receive hundreds of resident complaints daily (bin overflows, litter, pest issues). Current processes are manual, reactive, and inefficient—complaints get lost, similar issues aren't grouped, and field teams make redundant trips.

EstateOps Orchestrator solves this by:
- Auto-triaging complaints using IBM Watsonx.ai
- Clustering duplicate reports into persistent hotspots
- Generating optimized work schedules for field teams
- Verifying task completion with before/after photo evidence
- Forecasting tomorrow's likely problem areas

**Target users:** Town council supervisors and operations managers.

## Key Features

- **Complaint Intake**: Telegram bot + web form with photo upload
- **AI Triage**: IBM Watsonx.ai classifies complaints by category, severity (1-5), urgency (TODAY/48H/WEEK)
- **Spatial Clustering**: Groups complaints within 80m radius + 72h window into persistent hotspots
- **Fairness Rules**: Boosts priority for "silent zones" (low complaint volume but high severity)
- **Run Sheet Generation**: AI-optimized task bundling by zone and team capacity
- **Evidence Verification**: Supervisors verify field work with before/after photos
- **Forecast Agent**: Predicts tomorrow's risk hotspots using weather + historical patterns
- **What-If Simulator**: Test policy knobs (fairness strength, manpower, SLA thresholds) before dispatch
- **Audit Trail**: Immutable log of all agent decisions with confidence scores

## Architecture / Tech Stack

**Frontend:**
- React + TypeScript + Vite
- Zustand for state management
- Google Maps API for spatial visualization

**Backend:**
- Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- 14 interconnected tables with RLS policies
- Database triggers for real-time aggregation

**AI/ML:**
- IBM Watsonx.ai (Granite 13B / Llama 3)
- 5 specialized agents: Complaints, Review, RunSheet Planner, Dispatch Coordinator, Forecast
- JWT token management with automatic refresh

**Integrations:**
- Telegram Bot API (Python + Flask)
- Supabase Storage for evidence photos
- Google Maps Geocoding API

**Key Design Decisions:**
- **Persistent state machine**: Clusters have lifecycle (NEW → TRIAGED → REVIEWED → PLANNED → DISPATCHED → VERIFIED → CLOSED)
- **Denormalized counts**: `complaint_count` stored in clusters table for O(1) dashboard queries
- **Edge functions**: Serverless compute for file uploads and agent orchestration
- **Audit-first**: Every agent decision logged with inputs/outputs/confidence

## Setup & Installation

### Prerequisites
- Node.js 18+
- Python 3.9+ (for Telegram bot)
- Supabase account
- IBM Watsonx.ai account
- Google Maps API key

### 1. Clone Repository
```bash
git clone <repo-url>
cd IBeLulu
```

### 2. Frontend Setup
```bash
cd aegis-frontend
npm install
cp .env.local.example .env.local
# Edit .env.local with your credentials (see Configuration section)
npm run dev
```

### 3. Telegram Bot Setup
```bash
cd backend/telegram-bot
pip install -r ../../requirements.txt
cp .env.local.example .env.local
# Edit .env.local with your credentials
python app.py
```

### 4. Supabase Setup
1. Create new Supabase project
2. Run migrations from `supabase/migrations/` (if available) or manually create tables from Context.md schema
3. Deploy edge functions:
```bash
supabase functions deploy evidence-upload
supabase functions deploy watson-token
supabase functions deploy cluster-complaints
supabase functions deploy forecast-agent-runner
supabase functions deploy runsheet-planner
```
4. Create storage bucket: `evidence-photos` (public access)

### 5. IBM Watsonx.ai Setup
1. Create IBM Cloud account
2. Provision Watsonx.ai instance
3. Create 5 agents (Complaints, Review, RunSheet Planner, Dispatch Coordinator, Forecast)
4. Note agent IDs and update in code:
   - Complaints Agent: `addd6d7a-97ab-44db-8774-30fb15f7a052`
   - Review Agent: `f3c41796-118f-4f5a-a77c-e29890eaca6e`

## Configuration

### Frontend `.env.local`
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_PROJECT_REF=your-project-ref
SUPABASE_PAT=your-personal-access-token

VITE_IBM_JWT_TOKEN=your-jwt-token
VITE_IBM_API_KEY=your-api-key
VITE_IBM_SERVICE_URL=https://api.region.dl.watson-orchestrate.ibm.com/instances/your-instance-id
VITE_IBM_AUTH_TYPE=jwt

VITE_GOOGLE_MAPS_API_KEY=your-google-maps-key
```

### Telegram Bot `.env.local`
```bash
TELEGRAM_BOT_TOKEN=your-bot-token
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
```

### Supabase Edge Function Secrets
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
supabase secrets set IBM_JWT_TOKEN=your-jwt-token
```

## Usage

### Running Locally
1. Start frontend: `cd aegis-frontend && npm run dev` (http://localhost:5173)
2. Start Telegram bot: `cd backend/telegram-bot && python app.py`
3. Supabase edge functions run automatically when deployed

### Demo Flow
1. **Submit Complaints**: Use Telegram bot or web form at `/complaints`
2. **View Hotspots**: Navigate to `/hotspots` to see clustered complaints on map
3. **Review Queue**: Go to `/review` to approve AI-recommended playbooks
4. **Generate Run Sheet**: Visit `/runsheet` to create optimized task schedules
5. **Dispatch**: Send run sheets to field teams via Telegram
6. **Verify Evidence**: Field teams upload photos, supervisors verify at `/evidence`
7. **Tomorrow Plan**: Check `/tomorrow` for forecasted risk zones
8. **What-If**: Use `/whatif` to simulate policy changes

### Key Workflows

**Complaint → Task → Verification:**
```
Resident submits complaint → AI triages → Clusters with similar reports → 
Supervisor reviews → Planner generates run sheet → Dispatch to team → 
Field work completed → Supervisor verifies photos → Cluster closed
```

**Forecast Generation:**
```
Daily cron job → Fetch weather forecast → Analyze historical patterns → 
Generate risk scores by zone → Recommend preemptive tasks → 
Merge with reactive backlog
```

## Limitations & Assumptions

**Current Constraints:**
- RLS policies set to public access (hackathon demo mode) - needs role-based restrictions for production
- Team names fetched individually (N+1 query pattern) - should use JOIN or batch fetch
- Run sheet updates fail silently if `run_sheet_tasks` table is empty
- Task status has trailing space bug (`"DONE "` vs `"DONE"`) - requires data cleanup
- No authentication system - assumes trusted internal users
- Forecast agent uses simple heuristics, not trained ML models
- Google Maps API calls not rate-limited - could hit quota

**Assumptions:**
- Single town council deployment (no multi-tenancy)
- Field teams have Telegram access
- Complaints are in English
- Zones are pre-defined (no dynamic boundary creation)
- Weather data manually imported (no live API integration)

## Future Improvements

**High Priority:**
1. Add proper authentication (Supabase Auth with role-based RLS)
2. Fix task status data quality issue (trim trailing spaces)
3. Implement proper team JOIN query to avoid N+1 pattern
4. Add run_sheet_id foreign key to tasks table for direct relationship
5. Rate limiting on Google Maps API calls

**Medium Priority:**
6. Real-time weather API integration (OpenWeatherMap)
7. Batch geocoding for better performance
8. Mobile-responsive UI improvements
9. Export run sheets to PDF/iCal
10. Resident notification system (SMS/email)

**Low Priority:**
11. Advanced route optimization (TSP solver)
12. Custom ML model training for triage
13. Multi-language support
14. Historical analytics dashboard
15. Integration with existing TC systems (SAP, etc.)

---

## Project Structure
```
IBeLulu/
├── aegis-frontend/          # React frontend
│   ├── src/
│   │   ├── pages/           # Dashboard, Complaints, Evidence, etc.
│   │   ├── components/      # Reusable UI components
│   │   ├── services/        # API clients (orchestrate.ts)
│   │   └── utils/           # Helpers (geocode.ts)
│   └── .env.local
├── backend/
│   └── telegram-bot/        # Python Telegram bot
├── supabase/
│   └── functions/           # Edge functions
│       ├── evidence-upload/
│       ├── watson-token/
│       └── ...
├── agentfolder/
│   └── agents/              # IBM Watsonx.ai agent configs
└── Context.md               # System design document
```

## License
Hackathon prototype. Not open source unless explicitly stated.
