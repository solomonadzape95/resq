"use client";

import { useState } from "react";
import { api } from "@/lib/api";

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
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">✅ Registered</h1>
        <p className="mt-2 text-neutral-400">
          You'll start receiving alerts once verified. For the demo, you're
          auto-verified.
        </p>
        <a
          href="/dashboard"
          className="mt-6 inline-block rounded-md bg-resq-red px-4 py-2 text-white"
        >
          Go to dashboard
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold">Register as a ResQ responder</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Trained volunteers — doctors, nurses, paramedics, fire wardens, security —
        receive nearby emergency alerts and respond before official agencies arrive.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-neutral-500">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-neutral-500">Phone (+234…)</label>
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+2348012345678"
            className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-neutral-500">Skills</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {SKILLS.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => toggleSkill(s)}
                className={`rounded-md border px-3 py-1 text-sm ${
                  skills.includes(s)
                    ? "border-resq-red bg-resq-red/20 text-white"
                    : "border-neutral-800 text-neutral-400"
                }`}
              >
                {s.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-neutral-500">
            Availability radius: {radius} km
          </label>
          <input
            type="range"
            min={1}
            max={20}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          disabled={pending || !name || !phone || skills.length === 0}
          className="w-full rounded-md bg-resq-red px-4 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-40"
        >
          {pending ? "Submitting…" : "Register"}
        </button>
      </form>
    </main>
  );
}
