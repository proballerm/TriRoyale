import Link from "next/link";
import type { ReactNode } from "react";

export function ArenaShell({ children }: { children: ReactNode }) {
  return (
    <main className="arena-shell relative min-h-screen overflow-hidden px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="arena-grid pointer-events-none absolute inset-0 opacity-30" />
      <div className="pointer-events-none absolute -left-40 top-10 h-[32rem] w-[32rem] rounded-full bg-cyan-400/15 blur-[130px]" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-[30rem] w-[30rem] rounded-full bg-violet-500/20 blur-[140px]" />
      <div className="relative mx-auto w-full max-w-7xl">{children}</div>
    </main>
  );
}

export function ArenaHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Link href="/" className="mb-6 inline-flex items-center gap-3">
          <div className="relative grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/30 bg-white/10 shadow-[0_0_30px_rgba(34,211,238,0.16)]">
            <span className="text-xl font-black text-cyan-200">T</span>
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(253,224,71,0.9)]" />
          </div>
          <div>
            <p className="text-lg font-black uppercase tracking-[0.16em]">TriRoyale</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200/65">Knowledge is power</p>
          </div>
        </Link>
        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-200/60">{eyebrow}</p>
        <h1 className="mt-2 text-4xl font-black tracking-[-0.045em] sm:text-5xl">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

export const arenaPanelClass =
  "rounded-[2rem] border border-white/10 bg-[#081426]/85 shadow-2xl backdrop-blur-xl";
