import Link from "next/link";

const USSD = [
  { code: "*384*1#", label: "Medical Emergency" },
  { code: "*384*2#", label: "Fire" },
  { code: "*384*3#", label: "Crime / Security" },
  { code: "*384*4#", label: "Road Accident" },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🚨</span>
          <span className="text-xl font-bold tracking-tight">ResQ</span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-neutral-300">
          <Link href="/demo" className="btn-press hover:text-white">
            Live demo
          </Link>
          <Link href="/simulator" className="btn-press hover:text-white">
            Phone simulator
          </Link>
          <Link href="/responders/register" className="btn-press hover:text-white">
            Register as responder
          </Link>
          <Link
            href="/dashboard"
            className="btn-press border-2 border-resq-red bg-resq-red px-3 py-1.5 text-white hover:bg-red-700"
          >
            Coordinator Login
          </Link>
        </nav>
      </header>

      <section className="mt-20 text-center">
        <p className="text-sm uppercase tracking-widest text-resq-red">
          Nigeria's community-powered emergency network
        </p>
        <h1 className="mt-4 text-5xl font-bold leading-tight">
          Every second counts.
          <br />
          <span className="text-neutral-400">Any phone. Any network.</span>
        </h1>
        <p className="mt-6 text-lg text-neutral-300">
          One dial connects you to the nearest doctor, paramedic, or fire warden — and to a
          government coordinator who sees the same live picture you do.
        </p>
      </section>

      <section className="mt-16 grid gap-3 sm:grid-cols-2">
        {USSD.map((u) => (
          <Link
            key={u.code}
            href={`/simulator?dial=${encodeURIComponent(u.code)}`}
            className="btn-press group border-l-4 border-2 border-neutral-900 border-l-resq-red bg-neutral-950 p-6 transition hover:border-neutral-700 hover:border-l-resq-red"
          >
            <div className="text-3xl font-mono text-resq-red">{u.code}</div>
            <div className="mt-2 text-sm text-neutral-400 group-hover:text-neutral-200">
              {u.label} — tap to try in the dialer ↗
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-16 grid gap-3 text-sm sm:grid-cols-3">
        <div className="border-2 border-neutral-900 p-5">
          <div className="text-[10px] uppercase tracking-widest text-resq-red">Step 01</div>
          <div className="mt-1 text-xl font-semibold">Dial</div>
          <p className="mt-2 text-neutral-400">
            Dial *384*1# from any phone — even a basic one. No app, no internet, no registration.
          </p>
        </div>
        <div className="border-2 border-neutral-900 p-5">
          <div className="text-[10px] uppercase tracking-widest text-resq-red">Step 02</div>
          <div className="mt-1 text-xl font-semibold">Callback</div>
          <p className="mt-2 text-neutral-400">
            ResQ rings you back. Pick up and describe what is happening — the line records silently.
          </p>
        </div>
        <div className="border-2 border-neutral-900 p-5">
          <div className="text-[10px] uppercase tracking-widest text-resq-red">Step 03</div>
          <div className="mt-1 text-xl font-semibold">Respond</div>
          <p className="mt-2 text-neutral-400">
            AI extracts your location. The nearest responders are matched and dispatched
            automatically.
          </p>
        </div>
      </section>

      <footer className="mt-24 border-t-2 border-neutral-900 pt-6 text-xs text-neutral-500">
        Built for Nigeria. Ready for Africa.
      </footer>
    </main>
  );
}
