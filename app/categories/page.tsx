"use client";

import { ArenaHeader, ArenaShell, arenaPanelClass } from "@/components/arena/ArenaShell";
import { useRouter } from "next/navigation";

const categories = [
  { name: "Sports", icon: "◉", description: "Teams, athletes, records, and unforgettable moments.", accent: "from-emerald-300 to-cyan-400" },
  { name: "Science", icon: "✦", description: "Space, biology, inventions, and the natural world.", accent: "from-cyan-300 to-blue-500" },
  { name: "Movies", icon: "▶", description: "Blockbusters, classics, actors, and cinematic history.", accent: "from-fuchsia-400 to-violet-500" },
  { name: "History", icon: "⌛", description: "Civilizations, leaders, turning points, and discoveries.", accent: "from-amber-300 to-orange-500" },
  { name: "Geography", icon: "◆", description: "Countries, landmarks, capitals, and the world map.", accent: "from-sky-300 to-indigo-500" },
  { name: "Music", icon: "♫", description: "Artists, albums, genres, and chart-defining songs.", accent: "from-pink-300 to-rose-500" },
];

export default function CategorySelectionPage() {
  const router = useRouter();

  return (
    <ArenaShell>
      <ArenaHeader
        eyebrow="Choose your arena"
        title="Category Clash"
        description="Pick the subject you know best. Every match uses the same live, server-authoritative elimination rules."
        action={
          <button
            onClick={() => router.push("/")}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-white/10"
          >
            Back home
          </button>
        }
      />

      <section className={`${arenaPanelClass} p-5 sm:p-8`}>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((category, index) => (
            <button
              key={category.name}
              onClick={() => router.push(`/lobby?category=${encodeURIComponent(category.name)}`)}
              className="group relative min-h-64 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-6 text-left transition duration-500 hover:-translate-y-1.5 hover:border-white/20 hover:bg-white/[0.065]"
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${category.accent}`} />
              <div className={`absolute -right-12 -top-12 h-36 w-36 rounded-full bg-gradient-to-br ${category.accent} opacity-10 blur-3xl transition group-hover:opacity-25`} />
              <div className="relative flex h-full flex-col">
                <div className="flex items-start justify-between">
                  <div className={`grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${category.accent} text-2xl font-black text-slate-950 shadow-lg`}>
                    {category.icon}
                  </div>
                  <span className="text-xs font-black tracking-[0.2em] text-white/20">0{index + 1}</span>
                </div>
                <h2 className="mt-8 text-2xl font-black">{category.name}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">{category.description}</p>
                <div className="mt-auto flex items-center justify-between pt-8 text-xs font-black uppercase tracking-[0.14em] text-white/75">
                  <span>Enter lobby</span>
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 transition group-hover:translate-x-1 group-hover:bg-white/10">→</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </ArenaShell>
  );
}
