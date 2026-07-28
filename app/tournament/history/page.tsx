"use client";

import { ArenaHeader, ArenaShell, arenaPanelClass } from "@/components/arena/ArenaShell";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type HistoryEntry = {
  tournamentId: string;
  champion: {
    id: string;
    displayName: string;
    kind: "human" | "bot";
    wins: number;
  };
  startingPlayers: number;
  rounds: number;
  humanParticipants: Array<{ id: string; displayName: string; wins: number }>;
  totalMatches: number;
  completedAt: string;
};

type PlayerStats = {
  playerId: string;
  displayName: string;
  tournamentsPlayed: number;
  tournamentWins: number;
  duelsWon: number;
  roundsSurvived: number;
  longestTournamentRun: number;
};

export default function TournamentHistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [leaders, setLeaders] = useState<PlayerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setError(null);
        const [historyResponse, statsResponse] = await Promise.all([
          fetch("/api/tournament/history?limit=20", { cache: "no-store" }),
          fetch("/api/tournament/stats?limit=25", { cache: "no-store" }),
        ]);

        if (!historyResponse.ok || !statsResponse.ok) {
          throw new Error("Tournament records could not be loaded.");
        }

        const [historyData, statsData] = await Promise.all([
          historyResponse.json() as Promise<HistoryEntry[]>,
          statsResponse.json() as Promise<PlayerStats[]>,
        ]);

        if (!cancelled) {
          setHistory(historyData);
          setLeaders(statsData);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Tournament records could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    return history.reduce(
      (summary, tournament) => ({
        tournaments: summary.tournaments + 1,
        matches: summary.matches + tournament.totalMatches,
        humanEntries: summary.humanEntries + tournament.humanParticipants.length,
      }),
      { tournaments: 0, matches: 0, humanEntries: 0 },
    );
  }, [history]);

  return (
    <ArenaShell>
      <ArenaHeader
        eyebrow="Tournament records"
        title="Hall of Champions"
        description="Review completed 1,000-player tournaments and the strongest lifetime tournament runs."
        action={
          <div className="flex gap-3">
            <button
              onClick={() => router.push("/tournament/spectate")}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-white/10"
            >
              Watch live
            </button>
            <button
              onClick={() => router.push("/tournament")}
              className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-[#03101f] transition hover:bg-cyan-300"
            >
              Enter tournament
            </button>
          </div>
        }
      />

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-400/25 bg-red-400/10 px-5 py-4 text-sm font-semibold text-red-100">
          {error}
        </div>
      ) : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <SummaryCard value={String(totals.tournaments)} label="Completed tournaments" />
        <SummaryCard value={totals.matches.toLocaleString()} label="Archived matches" />
        <SummaryCard value={String(totals.humanEntries)} label="Human tournament entries" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className={`${arenaPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-6 py-5">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/60">Archive</p>
            <h2 className="mt-1 text-xl font-black">Recent champions</h2>
          </div>

          {loading ? (
            <LoadingRows count={5} />
          ) : history.length === 0 ? (
            <EmptyState title="No completed tournaments yet" body="The first champion will appear here after a tournament finishes." />
          ) : (
            <div className="divide-y divide-white/5">
              {history.map((entry) => (
                <article key={entry.tournamentId} className="grid gap-4 px-6 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-300 font-black text-slate-950">1</span>
                      <div>
                        <h3 className="text-lg font-black text-white">{entry.champion.displayName}</h3>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {entry.champion.kind === "bot" ? "AI champion" : "Human champion"}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-slate-400">
                      {entry.totalMatches.toLocaleString()} matches · {entry.rounds} rounds · {entry.humanParticipants.length} human entrants
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-sm font-black text-cyan-200">{entry.champion.wins} duel wins</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(entry.completedAt)}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={`${arenaPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-6 py-5">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/60">Lifetime records</p>
            <h2 className="mt-1 text-xl font-black">Tournament leaderboard</h2>
          </div>

          {loading ? (
            <LoadingRows count={7} />
          ) : leaders.length === 0 ? (
            <EmptyState title="No player records yet" body="Lifetime tournament statistics are recorded when a tournament completes." />
          ) : (
            <div className="divide-y divide-white/5">
              {leaders.map((player, index) => (
                <div key={player.playerId} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-4">
                  <span className={`grid h-9 w-9 place-items-center rounded-xl text-sm font-black ${index === 0 ? "bg-amber-300 text-slate-950" : index === 1 ? "bg-slate-200 text-slate-900" : index === 2 ? "bg-orange-400 text-slate-950" : "border border-white/10 bg-white/5 text-slate-300"}`}>
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-black text-white">{player.displayName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {player.duelsWon} duel wins · best run {player.longestTournamentRun}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-cyan-200">{player.tournamentWins}</p>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Titles</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </ArenaShell>
  );
}

function SummaryCard({ value, label }: { value: string; label: string }) {
  return (
    <div className={`${arenaPanelClass} p-5`}>
      <p className="truncate text-2xl font-black text-white">{value}</p>
      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{label}</p>
    </div>
  );
}

function LoadingRows({ count }: { count: number }) {
  return (
    <div className="divide-y divide-white/5">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="px-6 py-5">
          <div className="h-12 animate-pulse rounded-xl bg-white/5" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-lg font-black text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{body}</p>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
