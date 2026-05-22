# 🚨 ResQ — Emergency Response Platform

Nigeria's community-powered emergency network. One dial — any phone, any network — connects a person in crisis to the nearest trained volunteer and a government coordinator on a live dashboard.

This is the **web-first MVP**: backend + Next.js coordinator dashboard + working USSD round-trip via Africa's Talking sandbox. Native apps come later.

---

## What's in here

```
.
├── apps/
│   ├── api/          Node 20 + Express + Socket.io + Prisma
│   └── web/          Next.js 14 dashboard + landing + responder view
├── packages/
│   └── shared/       Shared TS types (Incident, events)
├── docker-compose.yml   Postgres 16 + Redis 7
└── ResQ_Technical_Specification.docx
```

---

## Quick start (local dev)

### 1. Prerequisites

- Node 20+ (Node 24 works)
- pnpm 10+
- Docker (for Postgres + Redis)
- ngrok (free tier) — needed to expose your local API to Africa's Talking
- Africa's Talking sandbox account → <https://account.africastalking.com>
- OpenRouter API key → <https://openrouter.ai>
- (no map key needed — uses free OpenStreetMap tiles via MapLibre)

### 2. Install dependencies

```bash
pnpm install
```

### 3. Start Postgres + Redis

```bash
docker compose up -d
```

### 4. Configure env files

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Fill in `apps/api/.env`:
- `AFRICAS_TALKING_API_KEY` (sandbox key) — for SMS/Voice
- `OPENROUTER_API_KEY` — for AI triage + transcript extraction
- `JWT_SECRET` — any long random string

`apps/web/.env.local` needs no editing — the map is free OpenStreetMap.

### 5. Run database migration + seed

```bash
pnpm --filter @resq/api prisma generate
pnpm --filter @resq/api prisma migrate dev --name init
pnpm db:seed
```

Seeds a coordinator user and 5 demo responders in Port Harcourt.

### 6. Start dev servers

```bash
pnpm dev
```

- API → <http://localhost:4000> (health: `/healthz`)
- Web → <http://localhost:3000>

---

## USSD demo on a real phone (Africa's Talking sandbox)

The single most important thing for the competition demo. End-to-end, this is how a real Nigerian SIM (or the AT Simulator app) dials your code and lands an incident on the dashboard:

### A. Create your sandbox USSD channel

1. Log in to <https://account.africastalking.com>
2. Switch to **Sandbox** (top-right).
3. **USSD → Create Channel**. AT will assign a code like `*384*<channel-id>#`.
4. **Callback URL**: paste your **ngrok HTTPS URL** + `/ussd` (see step B).
5. **SMS → Sandbox Test Phone Numbers**: add the phones that will receive SMS in the demo (sandbox SMS only delivers to whitelisted numbers).
6. **API Keys**: copy the sandbox API key into `apps/api/.env`.

### B. Expose your local API with ngrok

In a separate terminal:

```bash
ngrok http 4000
```

ngrok will print something like `https://abc-12-34-56.ngrok-free.app`. Paste that URL + `/ussd` into the AT channel callback. Re-run ngrok every session (the URL changes on the free tier) — and update the AT callback each time.

### C. Dial the channel

You have three working options, in increasing order of "feels like a real phone":

1. **AT Web Simulator** — <https://simulator.africastalking.com:1517/>
   Type your channel code, press dial. Best for screen-share demos.
2. **AT USSD Simulator Android app** — install from the Play Store, sign in, dial `*384*<channel>#`. This is the most reliable demo medium on a real Nigerian phone, regardless of telco (MTN / Airtel / Glo / 9mobile).
3. **Native dial on a real SIM** — works reliably in Kenya by default; on Nigerian SIMs in sandbox it's inconsistent. For competition day, plan around option 2; pursue a live shortcode via a licensed aggregator (4–8 weeks) for true production dial.

### D. Verify the round-trip

Dial → choose `1` for Medical → expect:

- ✅ USSD reply: *“ResQ Alert Sent ✓ …”*
- ✅ New row in `incidents` table (status: `new`)
- ✅ Dashboard at <http://localhost:3000/dashboard> shows the incident in the sidebar (Socket.io live)
- ✅ Whitelisted phone receives an SMS confirmation (sandbox SMS)
- ✅ Within ~5 seconds, AI triage score + severity appear on the incident card

### E. Showing transcript + responder view (demo polish)

The coordinator panel includes a *Push* button that lets you paste a fake caller line — it broadcasts a transcript chunk through Socket.io to the dashboard **and** any responder web view subscribed to that incident. This avoids depending on a live voice call during the demo.

For the responder side, click *Responder view ↗* on the incident panel. It opens a mobile-responsive page at `/r/<incident-id>` — open it on a second device and the transcript appears there live too.

---

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere |
| Backend | Express + Socket.io |
| DB | PostgreSQL via Prisma |
| Cache / queues | Redis + BullMQ (queues wired but not yet processing) |
| Realtime | Socket.io (with shared event types in `packages/shared`) |
| Frontend | Next.js 14 (App Router) + Tailwind + react-map-gl (MapLibre + OpenStreetMap, free) |
| State (web) | Zustand + React Query patterns where useful |
| USSD / SMS / Voice | Africa's Talking |
| AI | OpenRouter → `anthropic/claude-3.5-sonnet` (triage, location extraction), Whisper for transcription |
| Maps | MapLibre GL + OpenStreetMap raster tiles on the dashboard (free, no API key); Google Maps for geocoding when a key is provided (server-side) |
| Auth | JWT + bcrypt (refresh tokens stub) |
| Hosting | Vercel (web) + Railway/Render (api) — both free tier sufficient for MVP |

---

## API surface (current)

```
POST  /ussd                        AT USSD webhook
POST  /ussd/sms-reply              AT inbound SMS webhook (landmark reply)
POST  /alerts                      Create incident (from web/app)
GET   /alerts?active=true          List active incidents
GET   /alerts/:id                  Incident detail
PATCH /alerts/:id/status           Status transitions
POST  /alerts/:id/location         Manual location update
POST  /alerts/:id/assign           Assign responder
POST  /alerts/:id/respond          Responder accept/decline/en_route/on_scene
POST  /responders/register         Public responder signup
GET   /responders                  List
GET   /responders/nearby           Skill+distance ranked candidates
PATCH /responders/:id/status       Toggle availability
POST  /responders/:id/location     GPS heartbeat
POST  /calls/initiate              AT Voice outbound call
POST  /calls/recording             AT Voice recording webhook
POST  /calls/transcribe            Demo: push a transcript chunk
GET   /calls/:incidentId/transcript
POST  /auth/register
POST  /auth/login
```

---

## Phase-2 work (deferred from the spec)

- React Native caller + responder apps (Expo) — currently the responder view is a mobile-responsive web page.
- Live shortcode via AT/Termii aggregator (NCC licensing, 4–8 weeks).
- Telco cell-tower triangulation API (MTN/Airtel MOU).
- Multi-LGA coordinator role management.
- Analytics dashboard (Recharts).
- Whisper streaming integration (currently `/calls/transcribe` accepts pre-built chunks).
- Sentry, observability, full BullMQ workers split out.

See `ResQ_Technical_Specification.docx` and `/Users/solenoid/.claude/plans/go-to-collabs-resq-and-concurrent-cloud.md` for the full plan.

---

## Demo credentials

- Coordinator: phone `+2348000000001`, password `resq-demo-2026`
- Seeded responders: `+2348000000002` … `+2348000000006` (no password — placeholders)

---

## Pitch deck

- Projector slides live in `PITCH.html` (open in any browser; ← / → / space / click to navigate; append `?notes` to show speaker notes on screen).
- Speaker notes for both presenters live in `PITCH.md` — slide-by-slide outline with keywords + Q&A appendix.
- To refresh `smart-challenge-pitch.pdf`: open `PITCH.html` → Cmd-P → **Save as PDF**. One slide per page, speaker notes printed inline.

ResQ — because every second counts.
