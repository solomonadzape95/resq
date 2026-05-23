"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";

const SKILLS = [
  "doctor",
  "nurse",
  "paramedic",
  "first_aider",
  "fire_warden",
  "security",
  "civil_defence",
  "police_liaison",
  "traffic_warden",
];

export default function RegisterResponderPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [radius, setRadius] = useState(5);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toggleSkill(s: string) {
    setSkills((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api("/responders/register", {
        method: "POST",
        body: JSON.stringify({
          name,
          phone,
          skills,
          availabilityRadiusKm: radius,
        }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <span className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-3xl ring-1 ring-emerald-400/40">
          ✓
        </span>
        <h1 className="text-2xl font-bold tracking-tight">You&apos;re registered.</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          You&apos;ll start receiving alerts once verified. For the demo, you&apos;re
          auto-verified.
        </p>
        <Link
          href="/dashboard"
          className="btn-press mt-8 inline-flex rounded-xl bg-resq-red px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white shadow-lg shadow-resq-red/20 hover:bg-red-700"
        >
          Go to dashboard →
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="btn-press flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-resq-red text-sm shadow-md shadow-resq-red/30">
            🚨
          </span>
          <span className="text-base font-bold tracking-tight">ResQ</span>
        </Link>
        <Badge tone="red" size="sm">
          Responder signup
        </Badge>
      </header>

      <h1 className="text-3xl font-bold leading-tight tracking-tight">
        Register as a ResQ responder.
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-400">
        Trained volunteers — doctors, nurses, paramedics, fire wardens, security — receive
        nearby emergency alerts and respond before official agencies arrive.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLASS}
            placeholder="Dr. Amara Okeke"
          />
        </Field>

        <Field label="Phone (+234…)">
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+2348012345678"
            className={clsx(INPUT_CLASS, "font-mono tabular-nums")}
          />
        </Field>

        <Field label="Skills">
          <div className="flex flex-wrap gap-2">
            {SKILLS.map((s) => {
              const selected = skills.includes(s);
              return (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggleSkill(s)}
                  className={clsx(
                    "btn-press rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                    selected
                      ? "border-resq-red/50 bg-resq-red/15 text-red-100"
                      : "border-neutral-800 bg-neutral-900/40 text-neutral-400 hover:border-neutral-700 hover:text-white",
                  )}
                >
                  {s.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        </Field>

        <Field
          label={
            <span className="flex items-center justify-between">
              <span>Availability radius</span>
              <span className="font-mono text-[11px] tabular-nums normal-case tracking-normal text-neutral-300">
                {radius} km
              </span>
            </span>
          }
        >
          <input
            type="range"
            min={1}
            max={20}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full accent-resq-red"
          />
        </Field>

        {error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <button
          disabled={pending || !name || !phone || skills.length === 0}
          className="btn-press w-full rounded-xl bg-resq-red px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-white shadow-lg shadow-resq-red/25 hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500 disabled:shadow-none"
        >
          {pending ? "Submitting…" : "Register"}
        </button>
      </form>
    </main>
  );
}

const INPUT_CLASS =
  "w-full rounded-xl border border-neutral-800 bg-neutral-900/40 px-3.5 py-2.5 text-sm text-neutral-100 outline-none transition focus:border-resq-red/50 focus:bg-neutral-900/70 placeholder:text-neutral-600";

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
