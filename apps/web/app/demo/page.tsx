"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Incident } from "@resq/shared/types";
import { api, apiUrl } from "@/lib/api";

interface ActiveIncident extends Incident {
  responders?: Array<{
    responderId: string;
    status: string;
    responder?: { id: string; user: { name: string | null; phone: string } };
  }>;
}

interface Responder {
  id: string;
  user: { name: string | null; phone: string };
  status: string;
}

const PHONE_NUMBER = "+2348011112222";

export default function DemoPage() {
  const [incident, setIncident] = useState<ActiveIncident | null>(null);
  const [responder, setResponder] = useState<Responder | null>(null);
  const [now, setNow] = useState<number>(0);

  // Pick the most recently created active incident and the first responder
  // attached to it (or any available responder if none is attached yet).
  // The iframes below point at the chosen incident.
  useEffect(() => {
    let mounted = true;
    api<ActiveIncident[]>("/alerts?active=true&limit=50")
      .then((rows) => {
        if (!mounted) return;
        const top = rows[0] ?? null;
        setIncident(top);
        const attached = top?.responders?.[0]?.responder ?? null;
        if (attached) {
          setResponder({
            id: attached.id,
            user: attached.user,
            status: "available",
          });
        }
      })
      .catch(() => undefined);

    api<Responder[]>("/responders")
      .then((rows) => {
        if (!mounted) return;
        // Fall back to the first available responder if none was attached.
        setResponder((prev) =>
          prev ?? rows.find((r) => r.status === "available") ?? rows[0] ?? null,
        );
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  // Force iframes to refresh after a beat so they pick up the chosen
  // incident/responder ids once the API roundtrip lands.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const responderUrl = useMemo(() => {
    if (!incident) return null;
    const params = new URLSearchParams();
    if (responder) params.set("responder", responder.id);
    const qs = params.toString();
    return `/r/${incident.id}${qs ? `?${qs}` : ""}`;
  }, [incident, responder]);

  return (
    <main className="min-h-screen bg-resq-dark text-neutral-100">
      <header className="flex h-14 items-center justify-between border-b-2 border-neutral-900 bg-black/40 px-6">
        <Link href="/" className="flex items-center gap-2 text-neutral-100 hover:text-white">
          <span className="text-xl">🚨</span>
          <span className="font-semibold tracking-tight">ResQ</span>
          <span className="ml-3 border-l border-neutral-800 pl-3 text-xs uppercase tracking-widest text-neutral-500">
            Live demo
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-neutral-400">
          <Link href="/simulator" className="hover:text-white">
            Open phone ↗
          </Link>
          <Link href="/dashboard" className="hover:text-white">
            Open dashboard ↗
          </Link>
        </nav>
      </header>

      {/* Hero strip */}
      <section className="border-b-2 border-neutral-900 px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs uppercase tracking-widest text-resq-red">See the system live</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">
            Three personas. <span className="text-resq-red">One pipeline.</span>
          </h1>
          <p className="mt-3 max-w-3xl text-neutral-400">
            The phone simulator on the left, the coordinator dashboard in the middle, and the
            responder view on the right. Everything talks to the same backend you would see in
            production. Dial in the phone, watch the dashboard react, and watch the responder
            pick up the alert.
          </p>
        </div>
      </section>

      {/* Three-pane layout */}
      <section className="px-4 py-8 md:px-6">
        <div className="mx-auto grid max-w-[1600px] gap-4 md:grid-cols-[420px_minmax(0,1fr)_420px]">
          <Pane
            label="01 · Caller's phone"
            description="Dial *384*1# or use Call ResQ mode. The line records and our AI handles the rest."
            href="/simulator"
            iframe={`/simulator?demo=1&_=${now}`}
            height={620}
            badge="Phone"
          />
          <Pane
            label="02 · Coordinator dashboard"
            description="The live map, incident list, and side panel. Every state change is timestamped and audited."
            href="/dashboard"
            iframe={`/dashboard?_=${now}`}
            height={620}
            badge="Dashboard"
            wide
          />
          {responderUrl ? (
            <Pane
              label="03 · Responder view"
              description={`Pretending to be ${responder?.user.name ?? "a responder"} on the ground. Accept the alert and update status as they go.`}
              href={responderUrl}
              iframe={responderUrl + (responderUrl.includes("?") ? "&" : "?") + `_=${now}`}
              height={620}
              badge="Responder"
            />
          ) : (
            <ResponderEmpty />
          )}
        </div>
      </section>

      {/* Walkthrough */}
      <section className="border-t-2 border-neutral-900 bg-black/40 px-6 py-10">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          <Step
            num="01"
            title="Place a call"
            body="In the phone on the left, dial *384*1# and press the green call button. The screen confirms the alert was sent."
          />
          <Step
            num="02"
            title="Watch the dashboard react"
            body="A new incident appears in the dashboard list within a second. The AI fills in a triage score and the location pin lands on the map."
          />
          <Step
            num="03"
            title="Accept on the responder side"
            body="The responder view on the right gets the incoming alert. Tap Accept and the dashboard shows them en route."
          />
        </div>
        <div className="mx-auto mt-8 max-w-6xl border-l-2 border-l-resq-red bg-neutral-900/40 px-5 py-4 text-sm text-neutral-300">
          <strong className="block text-neutral-100">
            What's live here:
          </strong>
          The intake, AI triage, location extraction, dispatcher, and audit trail are all
          running. The hotline number itself is pending NCC licensing; the USSD simulator
          stands in for that channel.
        </div>
      </section>

      {/* Stats strip */}
      <DemoStats apiBase={apiUrl} />

      <footer className="border-t-2 border-neutral-900 px-6 py-8 text-xs text-neutral-500">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span>ResQ. Every second counts. Any phone. Any network.</span>
          <Link href="/" className="hover:text-white">
            ← Back to home
          </Link>
        </div>
      </footer>
    </main>
  );
}

function Pane({
  label,
  description,
  href,
  iframe,
  height,
  badge,
  wide,
}: {
  label: string;
  description: string;
  href: string;
  iframe: string;
  height: number;
  badge: string;
  wide?: boolean;
}) {
  return (
    <div className={`flex flex-col border-2 border-neutral-900 bg-neutral-950 ${wide ? "" : ""}`}>
      <header className="flex items-center justify-between border-b-2 border-neutral-900 bg-black/40 px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</div>
          <div className="mt-0.5 text-sm font-semibold text-white">{badge}</div>
        </div>
        <Link
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] uppercase tracking-widest text-neutral-400 hover:text-white"
        >
          Open ↗
        </Link>
      </header>
      <div className="px-4 pt-3 text-[11px] text-neutral-400 leading-relaxed">{description}</div>
      <div className="p-3">
        <div
          className="overflow-hidden border border-neutral-900 bg-black"
          style={{ height }}
        >
          <iframe
            src={iframe}
            className="h-full w-full"
            style={{ border: 0, colorScheme: "dark" }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            title={badge}
          />
        </div>
      </div>
    </div>
  );
}

function ResponderEmpty() {
  return (
    <div className="flex flex-col border-2 border-neutral-900 bg-neutral-950">
      <header className="flex items-center justify-between border-b-2 border-neutral-900 bg-black/40 px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">
            03 · Responder view
          </div>
          <div className="mt-0.5 text-sm font-semibold text-white">Responder</div>
        </div>
      </header>
      <div className="flex h-[620px] items-center justify-center p-6 text-center text-sm text-neutral-400">
        Waiting for the first active incident. Dial in the phone on the left to spawn one,
        then this pane will load the matched responder&apos;s view.
      </div>
    </div>
  );
}

function Step({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="border-l-2 border-l-resq-red bg-neutral-950 px-5 py-4">
      <div className="text-xs uppercase tracking-widest text-resq-red">{num}</div>
      <div className="mt-2 text-lg font-semibold text-white">{title}</div>
      <p className="mt-2 text-sm text-neutral-400">{body}</p>
    </div>
  );
}

function DemoStats({ apiBase }: { apiBase: string }) {
  const [counts, setCounts] = useState<{
    incidents: number;
    responders: number;
    available: number;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch(`${apiBase}/alerts?active=true&limit=200`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${apiBase}/responders`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([incidents, responders]: [unknown[], Responder[]]) => {
        if (!mounted) return;
        setCounts({
          incidents: Array.isArray(incidents) ? incidents.length : 0,
          responders: responders.length,
          available: responders.filter((r) => r.status === "available").length,
        });
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [apiBase]);

  if (!counts) return null;

  return (
    <section className="border-t-2 border-neutral-900 px-6 py-8">
      <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
        <Stat label="Active incidents" value={counts.incidents} />
        <Stat label="Verified responders" value={counts.responders} />
        <Stat label="On duty now" value={counts.available} accent="emerald" />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent = "red",
}: {
  label: string;
  value: number;
  accent?: "red" | "emerald";
}) {
  const color = accent === "emerald" ? "text-emerald-400" : "text-resq-red";
  return (
    <div className="border-2 border-neutral-900 bg-neutral-950 p-5">
      <div className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</div>
      <div className={`mt-2 font-mono text-4xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
