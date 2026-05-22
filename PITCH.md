# 🚨 ResQ — Pitch Speaker Notes

> *"Every second counts. Any phone. Any network."*
> What Nigeria's 112 should have been — built as **govtech public infrastructure**, not a startup.

**This document is not a script.** Read it, internalise it, then deliver it in your own words. Each slide has a one-line keyword reel you can lift verbatim if you blank.

- **Total run time:** ~6:45 (range 6:30 – 7:15) — fits the 5–8 minute slot.
- **Slide deck:** `PITCH.html` (project that; arrow-keys to navigate). Append `?notes` to see speaker notes live.
- **Print to PDF:** Open `PITCH.html` → Cmd-P → Save as PDF → replaces `smart-challenge-pitch.pdf`.

## Speaker split

| | Presenter A — *The Story* | Presenter B — *The GovTech + Ask* |
|---|---|---|
| Slides | 1 → 5 | 6 → 11 |
| Window | 0:00 – 3:10 | 3:10 – 6:45 |
| Voice | Empathetic, narrative, slows down on the citizen story | Confident, structured, slows down on the audit trail line |

**Stage prop:** Presenter A holds a feature phone for the entire pitch. Every time anyone says *"any phone"*, point at it.

---

## SLIDE 1 · Title & Hook  ·  *Presenter A · 25s*

🚨 *Visual: ResQ wordmark, badge "GovTech · Emergency Response · Nigeria", siren icon.*

**On screen**
- `ResQ` wordmark, huge
- Tagline italic: *"Every second counts. Any phone. Any network."*
- Lead paragraph: *"What Nigeria's 112 should have been — one dial connects any caller to the nearest trained responder, while a government coordinator watches the rescue happen live."*

**Say in your own words**
> ResQ is what 112 should have been in Nigeria. One dial, any phone, any network — a trained responder is on the way in seconds, and a government coordinator is watching the rescue on a live map.

**Keywords:** `ResQ` · `112` · `every second counts` · `any phone` · `any network` · `government coordinator` · `live`

---

## SLIDE 2 · The Problem  ·  *Presenter A · 40s*

📵 *Visual: three icon cards — phone-off, signal-zero, users-round.*

**On screen**
- Header: *"Nigeria's emergency system is broken."*
- **Card 1 · 112 doesn't pick up** — drop rates, no LGA integration, manual dispatch.
- **Card 2 · Most phones can't run an app** — feature phones, no data at the moment of crisis.
- **Card 3 · Responders exist — invisibly** — off-duty doctors, nurses, NYSC corps members, fire wardens, vigilantes.

**Say in your own words**
> Three failures stack into one outcome. Most Nigerians dial 112 and hear silence. Most phones in the country can't even open an emergency app. And yet — every street has trained people who could help. They have no way to be reached. The supply is already there. The system to find them isn't.

**Keywords:** `112 doesn't work` · `feature phone` · `no data` · `invisible responders` · `the supply is already there`

---

## SLIDE 3 · What ResQ Is  ·  *Presenter A · 40s*

🧭 *Visual: 3-actor triangle — citizen, responder, coordinator.*

**On screen**
- Big sentence: *"ResQ is not an app. It is the matching engine between citizens in crisis and the trained responders already nearby — visible to government in real time."*
- Three actor cards: 👤 The Citizen · 🛡️ The Responder · 🖥️ The Coordinator (state / LGA).

**Say in your own words**
> ResQ is not an app. It's the layer between three people who never speak to each other today. The citizen calling for help. The trained responder already a few streets away. And the government coordinator who is supposed to be accountable for the response. We connect all three in seconds.

**Keywords:** `matching engine` · `not an app` · `citizen` · `responder` · `government coordinator` · `real time` · `accountable`

---

## SLIDE 4 · How a Call Happens  ·  *Presenter A · 50s*

📞 *Visual: two parallel columns — USSD path (left), voicemail path (right).*

**On screen**
- **Any phone · USSD**
  - `#️⃣` Dial `*384*1#`
  - `📲` ResQ rings them back in ~3 seconds
  - `🎙️` They describe what happened — the line records silently
- **Smartphone · direct call**
  - `📞` Tap the ResQ call button
  - `📭` Leave a voicemail — AI listens silently
  - `✅` Same dashboard, same dispatch
- Footer: *"The caller never has to know what to say."*

**Say in your own words**
> Two ways to reach us. A feature-phone user dials a short code — three seconds later we ring them back, and they just talk. A smartphone user taps a button and leaves a voicemail. In both cases the caller doesn't have to know what to say. The line records, the AI does the rest.

**Keywords:** `USSD` · `callback in 3 seconds` · `voicemail` · `any phone` · `the line records` · `no script needed`

---

## SLIDE 5 · AI in the Loop  ·  *Presenter A · 35s*

🧠 *Visual: three icon blocks — brain (triage), map-pin (location), circle-alert (urgency).*

**On screen**
- **Triage** — severity score 1–10, type, recommended responders
- **Location extraction** — *"behind the big mosque on Aba Road"* → geocoded pin
- **Urgency signals** — *"bleeding"*, *"not breathing"* auto-bump severity
- Quote bubble: *"My dad, 67, chest pain, we are near Shoprite Lekki Phase 1."*
- Footer: *"Pin lands at Shoprite. Severity high. Two responders ranked by distance. **No human typed a word.**"*

**Say in your own words**
> While the caller is still speaking, the AI is already triaging. It pulls landmarks out of natural speech, drops the pin on the map, ranks severity, and flags urgency words. The dashboard fills in live. No human is typing.

**Keywords:** `AI triage` · `severity score` · `location extraction` · `landmarks` · `no human typing`

### ✋ HANDOFF — Presenter A nods to Presenter B

---

## SLIDE 6 · Auto-Dispatch  ·  *Presenter B · 40s*

🎯 *Visual: 4-step flow — incident → match → notify → accept.*

**On screen**
- **Incident** — type + location + severity
- **Match** — skill + Haversine distance + availability radius
- **Notify** — push to the nearest 5 verified responders, simultaneously
- **Accept** — first to tap accept gets the job; others held as backup
- Footer: *"No dispatcher on the phone. No call queue. No lunch break."*

**Say in your own words**
> The matcher takes the incident — say, medical — and checks every verified responder in the database. Skill match. Distance. On-duty. The nearest five get pinged at the same time. First to tap accept takes the job. There is no human dispatcher anywhere in this loop.

**Keywords:** `matcher` · `verified` · `skill match` · `nearest five` · `first to accept` · `no dispatcher`

---

## SLIDE 7 · Coordinator Dashboard  ·  *Presenter B · 55s*

🖥️ *Visual: dashboard mock — list left, live map centre, incident detail right; three icon callouts below.*

**On screen**
- **One screen per LGA** — every incident, every responder, every state change
- **Immutable audit trail** — every transition timestamped; cannot be edited
- **Public response-time metrics** — by LGA, by month
- Mock shows: active incidents list, live map with status-coloured pins + responder diamonds + dashed match lines, side panel with triage score, live transcript, status workflow

**Say in your own words**
> This is the government's screen. Every active emergency in their LGA on a live map. Every responder pin moving toward the scene. The call transcript appearing word-by-word. Every status change — timestamped and immutable. The first time we've had a piece of public infrastructure where the response itself is auditable. A commissioner can prove they showed up. A citizen can prove they didn't.

**Keywords:** `coordinator dashboard` · `LGA` · `live map` · `immutable audit trail` · `timestamped` · `public response-time metrics`

> ⏸ **Slow down here.** This is the line that wins the govtech category. Pause after "auditable". Let it land.

---

## SLIDE 8 · Why This Is GovTech  ·  *Presenter B · 45s*

🏛️ *Visual: 2×2 grid — accessibility, file-text, layers, users.*

**On screen**
- **Universal access** — works on the cheapest phone in the country
- **Accountability built-in** — every action audited by default
- **LGA-scalable** — same software for all 774 Local Government Areas
- **Public asset, public good** — uses NYSC, FRSC, off-duty health workers, civil defence

**Say in your own words**
> This isn't a startup pitch. It's public infrastructure. It works on the cheapest phone in the country. Every response is audited by default. The same dashboard runs in all 774 LGAs with one configuration change. And it taps into people the government already pays — NYSC corps members, FRSC officers, off-duty health workers — instead of trying to hire ten thousand new paramedics.

**Keywords:** `public infrastructure` · `universal access` · `audit by default` · `774 LGAs` · `existing public asset` · `NOT a startup pitch`

---

## SLIDE 9 · The Responder Network  ·  *Presenter B · 45s*

🤝 *Visual: 4 responder icon rows + 2 keys (recruitment, stipend).*

**On screen**
- 🩺 **Off-duty doctors & nurses** (MDCN-verified, skill-tagged)
- 🔥 **Fire wardens & civil defence** (cross-checked vs NSCDC)
- 🛡️ **Security & police liaisons** (includes registered vigilantes)
- ❤️ **NYSC, FRSC, Red Cross first aiders** (credentials uploaded at signup)
- **Recruitment** — Public sign-up at resq.ng → credential check → verified flag → activated in the matching pool
- **A modest monthly stipend** — Weighted by verified response activity. Performance-aligned. Not volunteer burnout — a **part-time public service**.

**Say in your own words**
> Our responders are the community itself. Off-duty doctors, nurses, NYSC corps members, fire wardens, vigilantes — people who already live on the street where the emergency happens. They register publicly on our site, we verify their credentials, and once they're verified they're in the matching pool. We pay them a modest monthly stipend, weighted by how many incidents they've actually shown up to. Not volunteers who burn out in six months — a part-time public service, paid for the value they provide.

**Keywords:** `community responders` · `off-duty professionals` · `publicly recruited` · `verified` · `modest monthly stipend` · `performance-weighted` · `part-time public service` · `not volunteer burnout`

> 💰 **If a judge asks "how much is the stipend?"** Answer in the Q&A appendix below. Don't quote numbers on stage.

---

## SLIDE 10 · Built vs Phase 2  ·  *Presenter B · 25s*

🚀 *Visual: two columns — checks (built) vs rocket (Phase 2).*

**On screen**
- **Built & running now**: USSD intake with 3-second callback ring · voicemail flow with silent AI agent · AI triage + location extraction · skill + distance dispatcher · coordinator dashboard with audit trail · responder mobile view + match lines
- **Phase 2 (paperwork, not engineering)**: NCC-licensed national shortcode · MTN / Airtel cell-tower triangulation MOU · State SEMA integrations · Native iOS / Android apps · Public response-time analytics

**Say in your own words**
> Everything I just showed you is built and running. The engine works. Phase 2 isn't engineering — it's paperwork: the national shortcode, MOUs with telcos, agreements with state SEMAs.

**Keywords:** `built and running` · `engine works` · `Phase 2 is paperwork` · `shortcode` · `telco MOU` · `SEMA`

---

## SLIDE 11 · The Ask + Close  ·  *Presenter B · 25s*

🎤 *Visual: three asks across the middle + huge "ResQ." closing.*

**On screen**
- 🔑 **License the shortcode** (NCC, via aggregator)
- 🚩 **90-day Port Harcourt pilot** (one LGA, 100 verified responders)
- 📊 **Publish response times vs 112**
- ResQ. — *Every second counts. Any phone. Any network.*

**Say in your own words**
> Three asks. License the shortcode. Pilot ResQ in one Port Harcourt LGA for 90 days. Publish the response times against 112. If we beat 112 — and we will — the rest of Nigeria writes itself. ResQ. Every second counts. Any phone. Any network. Thank you.

**Keywords:** `license shortcode` · `90-day pilot` · `publish numbers` · `beat 112` · `tagline`

> 🎤 **Don't add anything after the tagline.** Walk away from the mic.

---

## Cheat Sheet (print this — one page, both presenters)

```
┌──────────────────────────────────────────────────────────────────────┐
│  RESQ · PITCH CHEAT SHEET · 6:45 total · 11 slides · 2 presenters    │
├──────────────────────────────────────────────────────────────────────┤
│  HOOK (A):    ResQ — every second counts, any phone, any network.    │
│                                                                      │
│  PROBLEM (A):  112 doesn't pick up. Most phones can't run an app.    │
│                Responders exist — but they are invisible.            │
│                                                                      │
│  RESQ IS (A):  Matching engine. Citizen ↔ Responder ↔ Coordinator.   │
│                Visible to government in real time. NOT an app.       │
│                                                                      │
│  CALL FLOW (A): USSD → callback in 3s OR voicemail direct.           │
│                The line records. No script needed.                   │
│                                                                      │
│  AI (A):      Triage score · location extraction · urgency signals.  │
│                No human typing.                                      │
│  ─── HANDOFF ─────────────────────────────────────────────────────   │
│  DISPATCH (B): Match → notify nearest 5 verified → first to accept.  │
│                No dispatcher in the loop.                            │
│                                                                      │
│  DASHBOARD (B): One screen per LGA. Live map. Immutable audit trail. │
│                 [PAUSE on "auditable" — this is the govtech line.]   │
│                                                                      │
│  GOVTECH (B):  Public infrastructure. Universal access. 774 LGAs.    │
│                Uses people government already pays.                  │
│                                                                      │
│  RESPONDERS (B): Doctors · fire wardens · security · NYSC / FRSC.    │
│                  Publicly recruited. Verified. Modest monthly        │
│                  stipend, performance-weighted. Part-time service.   │
│                                                                      │
│  BUILT (B):    Engine works. Phase 2 is paperwork.                   │
│                                                                      │
│  ASK (B):     1. License shortcode  2. 90-day PH pilot               │
│                3. Publish numbers vs 112.                            │
│                                                                      │
│  CLOSER:      "Every second counts. Any phone. Any network."         │
│               Pause. Walk off.                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Q&A appendix — likely judge questions

Prepare these. The first three are the most common.

| Question | Crisp answer |
|---|---|
| *"How is this different from emergency apps like Sety or RescueMe?"* | They're **smartphone-app-first**. We're **USSD-first**, with the smartphone path as an upgrade. We start from the 100% of Nigerians who have a phone, not the 30% who have a smartphone with data. |
| *"Why won't telcos block you?"* | We're not bypassing them. We use Africa's Talking, an **NCC-licensed aggregator**. The shortcode lives on real telco rails. We pay the rev-share. |
| *"How much is the stipend exactly?"* | We're modelling stipends against the average part-time wage in each state — finalising the figure with the SEMA partner before pilot. Designed to be **less than the cost of a single ambulance dispatch per responder per month** — so it's cheaper for government than the system that already fails. |
| *"How do you verify responders aren't fake?"* | Public registration form + manual coordinator verification + skill tags audited against credentials (MDCN number, NYSC ID, FRSC badge, NSCDC record). The `verified` flag in the database is the gate — only verified responders get dispatched. |
| *"What if no responder is in the area?"* | The AI **detects zero-responder areas** and auto-bumps severity, which escalates to the LGA coordinator for manual fallback. Coverage gaps become a *visible metric* on the dashboard, not a hidden failure. |
| *"What about prank calls?"* | Every USSD session is tied to a phone number + network code. Three unconfirmed alerts from one number triggers a soft block. Coordinators can also mark `false_alarm` — full audit trail per number. |
| *"Why isn't this just 112 with a coat of paint?"* | 112 is a phone number. ResQ is a **matching engine**. Same difference as a switchboard versus Uber. |
| *"Why a hackathon project, not a startup?"* | It's govtech infrastructure first, business model second. Revenue model in Phase 2: per-LGA SaaS licence to state SEMAs + corporate sponsorship of responder training. The licence pays the responder stipends. |
| *"What's the moat?"* | Three things: (a) the verified responder network — a two-sided graph that compounds; (b) the audit trail — once a government agency commits to ResQ for accountability, switching cost is high; (c) the AI pipeline tuned on Nigerian speech, Pidgin, and local landmarks. |
| *"What's the data privacy story?"* | All call recordings stored encrypted; transcripts retained for the audit trail per Nigeria Data Protection Act. Caller can request deletion via the coordinator dashboard. No data sold to third parties — ever. |

---

## Govtech anchor phrases (each appears at least once in the deck)

Read this list before stepping on stage:

- *public infrastructure* (slides 3, 8)
- *government coordinator* (slides 1, 3, 7)
- *LGA* / *774 LGAs* (slides 7, 8)
- *immutable audit trail* (slides 7, 8)
- *publish the numbers vs 112* (slide 11)
- *the cheapest phone in the country* (slide 8)
- *NYSC* / *FRSC* / *SEMA* (slides 2, 9, 10)

If any of these don't make it out of your mouth, the audience will walk away thinking ResQ is a startup. Hit each one at least once.

---

## Tone & delivery

- **Don't say "we built an AI emergency response platform."** Say *"we built the thing that should have been 112."*
- **Hold the feature phone the entire pitch.** It is your single best prop.
- **Use one Nigerian-specific noun per minute.** *Mushin. Aba Road. NYSC. Lekki Phase 1.* It signals you built this for **here**, not for Silicon Valley.
- **Slow down on the audit trail line** (slide 7). Pause. Let it land.
- **End on the cold open.** *"Every second counts. Any phone. Any network."* Walk away.

---

*ResQ — because every second counts.*
