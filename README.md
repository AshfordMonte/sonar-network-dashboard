# Sonar Network Dashboard

Internal network status dashboard for ISP/WISP operations, built on **Node.js + Express** with a vanilla JS frontend.  
It pulls data from **Sonar’s GraphQL API**, caches it server-side, and presents it in a user friendly format.

## What it does currently

- Displays customer device statuses (Good / Warning / Down / Uninventoried)
- Provides a detailed **Down customers** view (Warning page in progress)
- Automatically proxies and caches Sonar GraphQL requests
- Designed for LAN / internal NOC use

## Tech Stack

- **Backend:** Node.js, Express
- **Frontend:** Vanilla HTML, CSS, JavaScript  
- **Data:** Sonar GraphQL API

## Project Structure

```text
network-dashboard/
├─ data/
│  └─ suppressions.json        # Persistent suppression store (shared across users)
│
├─ public/                     # Frontend (served statically)
│  ├─ index.html               # Main dashboard
│  ├─ app.js                   # Dashboard client logic
│  ├─ styles.css               # Global UI styles
│  │
│  ├─ down.html                # Down customers page
│  ├─ down.js                  # Down customers table logic
│  │
│  ├─ warning.html             # Warning customers page
│  ├─ warning.js               # Warning customers table logic
│  │
│  ├─ suppressed.html          # Suppressed customers page
│  └─ suppressed.js            # Suppressed customers logic (unsuppress actions)
│
├─ src/                        # Server-side logic
│  ├─ routes/
│  │  ├─ api.js                # Core API endpoints (summary, down, warning, suppressed)
│  │  └─ suppressions.js       # Suppression CRUD endpoints
│  │
│  ├─ services/
│  │  ├─ sonarService.js       # Sonar data access + data normalization
│  │  └─ suppressionStore.js   # JSON-backed suppression persistence
│  │
│  ├─ sonar/
│  │  └─ queries.js            # Centralized Sonar GraphQL queries
│  │
│  └─ utils/
│     ├─ env.js                # Environment variable validation
│     ├─ network.js            # Detects host LAN IP addresses
│     └─ normalize.js          # Shared data normalization helpers
│
├─ .env                        # Local environment configuration
├─ .env.example                # Example environment file
├─ .gitignore
├─ package.json
├─ package-lock.json
├─ server.js                   # Express application entry point
├─ sonarClient.js              # Sonar GraphQL client wrapper
└─ README.md
```

## Setup
Clone the repository into a folder via Bash terminal
```text
git clone https://github.com/AshfordMonte/sonar-network-dashboard.git .
```

Open the .env.example file and fill in the necessary data from your Sonar instance.

```text
# Server
PORT=3000      # This can be any free port on the device
CACHE_TTL_MS=60000 # Cache duration for Sonar API responses (milliseconds)
# Sonar GraphQL
SONAR_ENDPOINT=https://example.sonar.software/api/graphql   # Replace with Sonar instance domain
SONAR_TOKEN=replace_me    # Replace with Personal Access Token generated in your User Profile

SONAR_COMPANY_ID=0      # Located at Settings > Company > Companies
SONAR_ACCOUNT_STATUS_ID=0 # ID for customer Account Status listed as "Active - Company Name"
```
Run the following commands in bash to install necessary packages, rename to .env, and start the web server.
```bash
npm install
cp .env.example .env
npm start
```
The server binds to all host IPv4 addresses by default for LAN access.
