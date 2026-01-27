# 🚀 How To Run AEGIS

## Prerequisites
- **Docker Desktop** (installed and running)
- **Node.js** (v18+)

## Setup

1.  **Clone the Repo**:
    ```bash
    git clone <repo-url>
    cd IBeLuLu
    ```

2.  **Add Secrets**:
    Create a `.env.local` file in the `aegis-frontend` folder.
    ```
    # aegis-frontend/.env.local
    VITE_SUPABASE_URL=...
    VITE_SUPABASE_ANON_KEY=...
    SUPABASE_PROJECT_REF=...
    SUPABASE_PAT=...
    ```

3.  **Run Development Environment**:
    We have streamlined the startup process. You only need to run the development script in the frontend folder. This will automatically:
    - Boot up the backend Docker containers (Auth & Proxy)
    - Start the local Vite frontend development server

    ```bash
    cd aegis-frontend
    npm run dev
    ```

4.  **Access**:
    - **Frontend:** http://localhost:5173
    - **Auth Service:** http://localhost:5000 (Internal)
    - **MCP Proxy:** http://localhost:3001 (Internal)

## Troubleshooting
If the containers fail to start, make sure Docker Desktop is running.
To stop the services manually:
```bash
cd docker
docker compose down
```
