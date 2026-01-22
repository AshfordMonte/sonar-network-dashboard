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
├─ public/                # Frontend (served statically)
│  ├─ index.html
│  ├─ down.html
│  ├─ app.js
│  ├─ down.js
│  └─ styles.css
│
├─ src/                   # Server-side logic
│  ├─ routes/             
│     ├─ api.js           # Express route handlers
│  ├─ services/           
│     ├─ sonarService.js  # Formats raw API data
│  ├─ sonar/              
│     ├─ queries.js       # Sonar GraphQL queries
│  └─ utils/              
│     ├─ env.js           # Validates env file data
│     ├─ network.js       # Grabs host device local IPv4 addresses
│     ├─ normalize.js     # Provides helper functions to handle api data
│
├─ server.js              # Express app entry point
├─ sonarClient.js         # Sonar GraphQL client wrapper
├─ .env.example           # Format example for .env file
├─ package.json
└─ README.md
```


## Setup
Open the .env.example file and fill in the necessary data from your Sonar instance.

```text
# Server
PORT=3000      # This can be any free port on the device
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