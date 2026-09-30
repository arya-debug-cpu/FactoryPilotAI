# FactoryPilot AI

AI-powered factory operations platform: live machine monitoring, production,
orders, maintenance, energy, alerts — plus a real predictive-maintenance model
and a fully functional, data-grounded AI assistant.

```
FACTORY DATA → REACT → FASTAPI → POSTGRESQL → Factory Data Analysis
           → Predictive Intelligence → AI ENGINE → Recommendations → REACT DASHBOARD
```

---

## 1. Project overview

FactoryPilot AI has two parts and **no authentication**:

| Route        | What it is                                                        |
| ------------ | ----------------------------------------------------------------- |
| `/`          | Enterprise landing page: hero, features, how it works, AI, predictive maintenance, footer |
| `/dashboard` | The operations console: Overview, Machines, Production, Orders, Maintenance, Energy, Alerts, AI Assistant |

The landing page carries a prominent **“Go to Dashboard”** button that navigates
straight to `/dashboard`.

Everything shown on the dashboard is fetched from the backend at runtime.
No KPI, chart, table or insight is hardcoded in React.

---

## 2. Technology stack

| Layer      | Technology                                             |
| ---------- | ------------------------------------------------------ |
| Frontend   | **React** (rendered by the Next.js React toolchain)    |
| Backend    | **FastAPI** (Python) — the only backend                |
| Database   | **PostgreSQL** via SQLAlchemy ORM                      |
| AI         | OpenAI-compatible model when `OPENAI_API_KEY` is set, otherwise a deterministic data-grounded answer composer |
| Styling    | Tailwind CSS v4                                        |
| Icons      | `lucide-react`                                          |

Only one backend framework (FastAPI) and one database (PostgreSQL) are used.
There is no Express, no MongoDB, no Firebase, no Supabase, no Flask.

---

## 3. Folder structure

```
.
├── backend/                      # FastAPI backend
│   ├── app/
│   │   ├── main.py               # app, CORS, routers, startup + auto-seed
│   │   ├── database.py           # engine / session / Base (reads .env)
│   │   ├── models.py             # machines, readings, production, orders,
│   │   │                         # maintenance, energy, alerts, chat messages
│   │   ├── predict.py            # predictive-maintenance engine
│   │   ├── ai.py                 # intent → retrieval → model → answer
│   │   ├── seed.py               # deterministic, causally-linked demo data
│   │   └── routers/
│   │       ├── dashboard.py      # GET  /api/dashboard
│   │       ├── machines.py       # GET  /api/machines  /api/machines/{id}
│   │       ├── production.py     # GET  /api/production
│   │       ├── orders.py         # GET  /api/orders
│   │       ├── maintenance.py    # GET  /api/maintenance
│   │       ├── energy.py         # GET  /api/energy
│   │       ├── alerts.py         # GET  /api/alerts, POST .../resolve
│   │       └── ai.py             # POST /api/ai/chat, GET /api/ai/insights
│   ├── requirements.txt
│   └── start.sh                  # installs deps if missing, runs uvicorn
├── src/
│   ├── app/
│   │   ├── page.tsx              # landing page
│   │   ├── api/health/route.ts   # health check (frontend + backend)
│   │   └── dashboard/
│   │       ├── layout.tsx        # sidebar + top bar
│   │       ├── page.tsx          # Overview (KPIs, charts, alerts, insights)
│   │       ├── machines/         # list + [id] detail with history
│   │       ├── production/  orders/  maintenance/  energy/  alerts/
│   │       └── ai/               # AI assistant
│   ├── components/               # ui.tsx primitives, charts.tsx SVG charts
│   ├── lib/                      # api.ts (fetch + hooks), backend.ts (boot)
│   ├── instrumentation.ts        # starts FastAPI with the frontend
│   └── app/globals.css           # design tokens (charcoal / green / emerald)
├── public/images/                # generated photography
├── .env.example
└── README.md
```

---

## 4. Environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable             | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string (only database used)           |
| `OPENAI_API_KEY`     | Enables model-generated AI answers (optional)               |
| `OPENAI_MODEL`       | Model name, default `gpt-4o-mini`                            |
| `OPENAI_BASE_URL`    | Any OpenAI-compatible endpoint                              |
| `CORS_ALLOW_ORIGINS` | Backend CORS allow-list                                     |
| `SEED_ON_STARTUP`    | `true` seeds demo data when the DB is empty                 |
| `SEED_RESET`         | `true` drops and reseeds on startup (destructive)           |
| `API_ORIGIN`         | Where the frontend proxies `/api/*`                         |

Secrets are never hardcoded.

---

## 5. Database setup

```bash
# PostgreSQL must be running and reachable
createdb app_db   # or rely on an existing database

# create tables + load demo data
cd backend
python3 -m app.seed            # idempotent, skips if data exists
python3 -m app.seed --reset    # destructive: drop + recreate + reseed
```

Tables: `machines`, `machine_readings`, `production_records`, `orders`,
`maintenance_records`, `energy_records`, `alerts`, `chat_messages`.

The demo set contains **14 machines across 4 lines**, 1,162 sensor readings
(4-hourly over 14 days), 588 production records, 196 energy records, 18 orders,
19 maintenance records (scheduled / overdue / completed / AI-predicted) and
rule alerts. Data is generated from a per-machine *degradation* parameter so the
relationships are real:

```
degradation ↑  →  temperature & vibration ↑
             →  energy per unit ↑, downtime ↑
             →  output vs target ↓, defects ↑
             →  rule alerts fire
             →  health ↓ and failure probability ↑
             →  AI-predicted maintenance raised
```

---

## 6. Backend setup

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
# interactive docs: http://127.0.0.1:8000/docs
```

`start.sh` performs the same thing and installs missing packages first — it is
what the frontend calls when it boots.

---

## 7. Frontend setup

```bash
npm install
npm run dev        # development
npm run build      # production build
npm run start      # production server
```

`src/instrumentation.ts` starts the FastAPI backend automatically when the
frontend server boots, and `next.config.ts` proxies every `/api/*` request to
it, so the browser only ever talks to one origin.

---

## 8. How to run everything

```bash
cp .env.example .env

# backend
pip install -r backend/requirements.txt
cd backend && python3 -m app.seed && cd ..     # tables + demo data
uvicorn app.main:app --app-dir backend --port 8000 &

# frontend
npm install
npm run build && npm run start
```

The frontend also boots the backend for you: `src/instrumentation.ts` runs
`backend/start.sh` when the Next.js server starts, so a single `npm run start`
is enough.

Then open `/` for the landing page and `/dashboard` for the console.

---

## 9. API documentation

Base URL: `/api` (proxied to FastAPI on `127.0.0.1:8000`)

| Method | Endpoint                | Description                                                        |
| ------ | ----------------------- | ------------------------------------------------------------------ |
| GET    | `/api/health`           | Health of the frontend and the backend                              |
| GET    | `/api/dashboard`        | KPIs, charts, machine status, alerts, orders, energy, insights, `workflow` (DETECT → PREDICT → RECOMMEND) |
| GET    | `/api/machines`         | `?status= &risk= &line= &q= &sort=` — machines + predictions        |
| GET    | `/api/machines/{id}`    | Detail + prediction + temperature/vibration/energy/production/downtime history, alerts, maintenance |
| GET    | `/api/production`       | `?day=YYYY-MM-DD &machine_id= &days=` — summary, by machine, series, by shift |
| GET    | `/api/orders`           | `?status= &priority= &q=` — order rows + summary                    |
| GET    | `/api/maintenance`      | `?filter=upcoming\|overdue\|completed\|predicted`                   |
| GET    | `/api/energy`           | `?days= &machine_id=` — totals, intensity, trend, machine-wise      |
| GET    | `/api/alerts`           | `?severity= &status= &machine_id=` + summary                        |
| POST   | `/api/alerts/{id}/resolve`     | Mark an alert resolved (written to PostgreSQL)               |
| POST   | `/api/alerts/{id}/acknowledge` | Mark an alert acknowledged                                   |
| POST   | `/api/ai/chat`          | `{message, session_id}` → `{reply, mode, sources, intents}`         |
| GET    | `/api/ai/insights`      | AI-generated dashboard insights                                    |
| GET    | `/api/ai/context?question=` | Debug: exactly the data the AI would send to the model         |
| GET    | `/api/ai/history`       | Conversation history                                               |

---

## 10. How predictive maintenance works

`backend/app/predict.py`, evaluated per machine on every request:

1. **Baseline** — each machine stores its rated `normal_temperature`,
   `normal_vibration`, `normal_energy_kw`, `rated_capacity`.
2. **Windows** — the last 7 days of readings are compared with the previous
   7 days to obtain a deterioration *trend*.
3. **Normalised signals** (0 = nominal, 1 = badly out of envelope):
   temperature excess, vibration excess, day-on-day trend, load, downtime,
   operating hours, energy-per-unit waste, failure history, output gap.
4. **Health score** — a weighted penalty model:
   `100 − (0.28·temp + 0.26·vib + 0.16·downtime + 0.10·energy + 0.12·history …)`
   minus a trend penalty.
5. **Failure probability** — logistic function
   `p = σ(−3.2 + 2.2·temp + 2.4·vib + 1.1·downtime + 0.7·load + 0.9·energy + …)`
6. **Risk level** — `p < 0.18 LOW`, `< 0.42 MEDIUM`, `< 0.72 HIGH`, else `CRITICAL`.
7. **Recommendation** — the dominant contributing factor selects a concrete
   written action, prefixed with its urgency window.

Because everything is computed from stored readings, no probability is ever a
hardcoded constant. `GET /api/ai/context` and the machine detail page expose
the contributing factors and their percentage contribution.

---

## 11. How the AI works

```
question → intent classification (risk / production / maintenance / energy /
           orders / alerts / quality / machine code)
        → retrieval of exactly those tables from PostgreSQL
        → context package (plant summary + ranked machines + slices)
        → LLM call when OPENAI_API_KEY is set, otherwise the grounded composer
        → answer: Situation → Evidence → Likely cause → Risk → Recommended action
```

* The system prompt forbids inventing machines, values or dates and requires the
  model to state when the data is insufficient.
* The fallback composer writes the same structure directly from the retrieved
  rows, so the assistant is fully functional with no API key.
* Every exchange is stored in `chat_messages`.

---

## 12. Design notes

Charcoal powder-coat surface (`#0A0D0C`), dark green (`#0B3B2E`), professional
emerald (`#12A66A`), amber warnings (`#E8A020`), red criticals (`#D9422B`).
IBM Plex Sans + IBM Plex Mono; every number is tabular. The KPI row is a single
hairline-divided instrument cluster rather than a grid of rounded cards, and the
DETECT → PREDICT → RECOMMEND panel is the centrepiece of the Overview screen.
