"use client";

import { SessionProvider, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect } from "react";

const modes = [
  {
    href: "/tournament",
    eyebrow: "1,000-player tournament",
    title: "Battle Royale",
    description: "Win three-question duels, survive each cut, and keep requeueing until one champion remains.",
    icon: "⚔",
    accent: "from-cyan-400 to-blue-500",
    glow: "group-hover:shadow-[0_0_45px_rgba(34,211,238,0.35)]",
    cta: "Join tournament",
  },
  {
    href: "/categories",
    eyebrow: "Choose your arena",
    title: "Category Clash",
    description: "Pick a specialty, sharpen your knowledge, and own the board.",
    icon: "◆",
    accent: "from-amber-300 to-orange-500",
    glow: "group-hover:shadow-[0_0_45px_rgba(251,191,36,0.3)]",
    cta: "Browse categories",
  },
  {
    href: "/leaderboards",
    eyebrow: "Global rankings",
    title: "Hall of Champions",
    description: "Track the best players, climb the ladder, and defend your rank.",
    icon: "♛",
    accent: "from-fuchsia-400 to-violet-500",
    glow: "group-hover:shadow-[0_0_45px_rgba(192,132,252,0.3)]",
    cta: "View leaderboard",
  },
];

function LoadingArena() {
  return (
    <main className="arena-shell flex min-h-screen items-center justify-center text-white">
      <div className="text-center">
        <div className="mx-auto mb-5 h-14 w-14 animate-spin rounded-full border-4 border-white/15 border-t-cyan-300" />
        <p className="text-sm font-black uppercase tracking-[0.35em] text-cyan-100/80">
          Opening the arena
        </p>
      </div>
    </main>
  );
}

function InnerHomePage() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/login";
  }, [status]);

  if (status === "loading") return <LoadingArena />;
  if (status === "unauthenticated") return null;

  const firstName = session?.user?.name?.split(" ")[0] || "Player";

  return (
    <main className="arena-shell relative min-h-screen overflow-hidden px-5 py-6 text-white sm:px-8 lg:px-12">
      <div className="arena-grid pointer-events-none absolute inset-0 opacity-30" />
      <div className="pointer-events-none absolute -left-32 top-16 h-96 w-96 rounded-full bg-cyan-400/20 blur-[110px]" />
      <div className="pointer-events-none absolute -right-36 bottom-0 h-[30rem] w-[30rem] rounded-full bg-violet-500/20 blur-[130px]" />

      <div className="relative mx-auto max-w-7xl">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <Link href="/" className="group flex items-center gap-3">
            <div className="relative grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/30 bg-white/10 shadow-[0_0_30px_rgba(34,211,238,0.16)] backdrop-blur-xl">
              <span className="text-xl font-black text-cyan-200">T</span>
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(253,224,71,0.9)]" />
            </div>
            <div>
              <p className="text-lg font-black uppercase tracking-[0.16em]">TriRoyale</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200/65">
                Knowledge is power
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-white/10 bg-white/5 px-4 py-2 text-right backdrop-blur md:block">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">Signed in as</p>
              <p className="max-w-48 truncate text-sm font-bold text-white/90">{session?.user?.name || "Player"}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white/70 transition hover:border-red-300/50 hover:bg-red-400/10 hover:text-red-100"
            >
              Sign out
            </button>
          </div>
        </header>

        <section className="grid items-end gap-10 pb-12 pt-16 lg:grid-cols-[1.2fr_0.8fr] lg:pt-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100">
              <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.9)]" />
              Arena systems online
            </div>
            <p className="mb-3 text-sm font-black uppercase tracking-[0.28em] text-white/45">
              Welcome back, {firstName}
            </p>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.92] tracking-[-0.055em] sm:text-7xl lg:text-[6.4rem]">
              Think fast.
              <span className="block bg-gradient-to-r from-cyan-200 via-white to-amber-200 bg-clip-text text-transparent">
                Rule the arena.
              </span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Enter live trivia battles, master your strongest categories, and rise through a competitive world built for quick minds.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-2xl">
            <div className="absolute right-0 top-0 h-32 w-32 bg-cyan-300/10 blur-3xl" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Player status</p>
                <h2 className="mt-2 text-2xl font-black">Ready to compete</h2>
              </div>
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10 text-2xl shadow-[0_0_30px_rgba(52,211,153,0.15)]">
                ⚡
              </div>
            </div>
            <div className="relative mt-7 grid grid-cols-3 gap-3">
              {[
                ["3", "Game modes"],
                ["∞", "Questions"],
                ["24/7", "Arena"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-white/8 bg-black/10 p-4 text-center">
                  <p className="text-xl font-black text-white">{value}</p>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-200/60">Select your path</p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">Choose an arena</h2>
            </div>
            <p className="hidden text-sm text-white/35 sm:block">Every match is a chance to take the crown.</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {modes.map((mode, index) => (
              <Link
                key={mode.title}
                href={mode.href}
                className={`group relative min-h-[330px] overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.055] p-7 shadow-xl backdrop-blur-xl transition duration-500 hover:-translate-y-2 hover:border-white/20 ${mode.glow}`}
              >
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${mode.accent}`} />
                <div className={`absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br ${mode.accent} opacity-10 blur-3xl transition duration-500 group-hover:opacity-25`} />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-start justify-between">
                    <div className={`grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${mode.accent} text-2xl font-black text-slate-950 shadow-lg transition duration-500 group-hover:scale-110 group-hover:rotate-3`}>
                      {mode.icon}
                    </div>
                    <span className="text-xs font-black tracking-[0.2em] text-white/20">0{index + 1}</span>
                  </div>
                  <p className="mt-8 text-[10px] font-black uppercase tracking-[0.24em] text-white/40">{mode.eyebrow}</p>
                  <h3 className="mt-2 text-3xl font-black tracking-[-0.03em]">{mode.title}</h3>
                  <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">{mode.description}</p>
                  <div className="mt-auto flex items-center justify-between pt-8 text-sm font-black uppercase tracking-[0.12em] text-white/80">
                    <span>{mode.cta}</span>
                    <span className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 transition duration-300 group-hover:translate-x-1 group-hover:border-white/25 group-hover:bg-white/10">→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <footer className="mt-12 flex flex-col gap-3 border-t border-white/10 py-6 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 TriRoyale. Built for the fastest minds.</p>
          <p className="font-bold uppercase tracking-[0.18em]">Play smart · Play bold · Take the crown</p>
        </footer>
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <SessionProvider>
      <InnerHomePage />
    </SessionProvider>
  );
}
