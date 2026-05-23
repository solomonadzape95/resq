import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

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
        <Link href="/" className="btn-press flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-resq-red text-base shadow-md shadow-resq-red/30">
            🚨
          </span>
          <span className="text-lg font-bold tracking-tight">ResQ</span>
        </Link>
        <nav className="flex items-center gap-1.5">
          <NavLink href="/demo">Live demo</NavLink>
          <NavLink href="/simulator">Phone simulator</NavLink>
          <NavLink href="/responders/register">Register</NavLink>
          <Link
            href="/dashboard"
            className="btn-press rounded-full bg-resq-red px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white shadow-md shadow-resq-red/30 hover:bg-red-700"
          >
            Coordinator Login
          </Link>
        </nav>
      </header>

      <section className="mt-24 text-center">
        <Badge tone="red" size="md">
          Community-powered emergency network
        </Badge>
        <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
          Every second counts.
          <br />
          <span className="text-neutral-500">Any phone. Any network.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-neutral-300">
          One dial connects you to the nearest doctor, paramedic, or fire warden — and to a
          government coordinator who sees the same live picture you do.
        </p>
      </section>

      <section className="mt-16 grid gap-3 sm:grid-cols-2">
        {USSD.map((u) => (
          <Link
            key={u.code}
            href={`/simulator?dial=${encodeURIComponent(u.code)}`}
            className="btn-press surface-hover group rounded-2xl border border-neutral-900 bg-neutral-900/40 p-5 hover:border-resq-red/40 hover:bg-neutral-900/70"
          >
            <div className="flex items-center justify-between">
              <div className="font-mono text-2xl text-resq-red">{u.code}</div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 group-hover:text-neutral-300">
                Try ↗
              </span>
            </div>
            <div className="mt-2 text-sm text-neutral-400 group-hover:text-neutral-200">
              {u.label}
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-16 grid gap-3 sm:grid-cols-3">
        <Step n="01" title="Dial">
          Dial *384*1# from any phone — even a basic one. No app, no internet, no
          registration.
        </Step>
        <Step n="02" title="Callback">
          ResQ rings you back. Pick up and describe what is happening — the line records
          silently.
        </Step>
        <Step n="03" title="Respond">
          AI extracts your location. The nearest responders are matched and dispatched
          automatically.
        </Step>
      </section>

      <footer className="mt-24 border-t border-neutral-900 pt-6 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        Built for Nigeria. Ready for Africa.
      </footer>
    </main>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="btn-press rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-300 hover:bg-neutral-900 hover:text-white"
    >
      {children}
    </Link>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-hover rounded-2xl border border-neutral-900 bg-neutral-900/40 p-5 hover:border-neutral-800">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-resq-red">
        Step {n}
      </div>
      <div className="mt-1 text-xl font-bold">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-neutral-400">{children}</p>
    </div>
  );
}
