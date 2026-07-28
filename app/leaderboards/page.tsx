"use client";

import { ArenaHeader, ArenaShell, arenaPanelClass } from "@/components/arena/ArenaShell";
import { useEffect, useMemo, useState } from "react";
import io from "socket.io-client";

interface LeaderboardEntry {
  username: string;
  category: string;
  wins: number;
}

const categories = [
  "Total Wins",
  "Battle Royale",
  "Sports",
  "Science",
  "Movies",
  "History",
  "Geography",
  "Music",
];

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("Total Wins");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    const socket: ReturnType<typeof io> = io({
      path: "/socket.io",
      transports: ["websocket"],
    });

    const fetchLeaderboard = async () => {
      try {
        setError(null);
        const response = await fetch("/api/leaderboard", { cache: "no-store" });
        if (!response.ok) throw new Error("Leaderboard request failed");
        const data: LeaderboardEntry[] = await response.json();
        setLeaderboard(data);
        setLastUpdatedAt(Date.now());
      } catch (fetchError) {
        console.error("Error fetching leaderboard:", fetchError);
        setError("The rankings could not be loaded right now.");
      } finally {
        setLoading(false);
      }
    };

    void fetchLeaderboard();
    socket.on("leaderboardUpdated", fetchLeaderboard);

    return () => {
      socket.off("leaderboardUpdated", fetchLeaderboard);
      socket.disconnect();
    };
  }, []);

  const filteredLeaderboard = useMemo(() => {
    if (selectedCategory !== "Total Wins") {
      return leaderboard
        .filter((entry) => entry.category === selectedCategory)
        .sort((a, b) => b.wins - a.wins);
    }

    return leaderboard
      .filter((entry) => entry.category !== "Unknown")
      .reduce((entries: LeaderboardEntry[], current) => {
        const existing = entries.find((entry) => entry.username === current.username);
        if (existing) existing.wins += current.wins;
        else entries.push({ username: current.username, category: "Total Wins", wins: current.wins });
        return entries;
      }, [])
      .sort((a, b) => b.wins - a.wins);
  }, [leaderboard, selectedCategory]);

  const totalWins = filteredLeaderboard.reduce((sum, entry) => sum + entry.wins, 0);
  const topPlayer = filteredLeaderboard[0];

  return (
    <ArenaShell>
      <ArenaHeader
        eyebrow="Global rankings"
        title="Hall of Champions"
        description="Live rankings update when matches finish. Filter by arena to see who dominates each category."
        action={
          <label className="block min-w-52">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Ranking view</span>
            <select
              className="w-full rounded-xl border border-white/10 bg-[#0d1c31] px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-300/40"
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          [filteredLeaderboard.length.toString(), "Ranked players"],
          [totalWins.toString(), "Recorded wins"],
          [topPlayer?.username || "—", "Current leader"],
        ].map(([value, label]) => (
          <div key={label} className={`${arenaPanelClass} p-5`}>
            <p className="truncate text-2xl font-black text-white">{value}</p>
            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{label}</p>
          </div>
        ))}
      </section>

      <section className={`${arenaPanelClass} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-7">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/60">Live standings</p>
            <h2 className="mt-1 text-xl font-black">{selectedCategory}</h2>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]" />
            {lastUpdatedAt ? `Updated ${new Date(lastUpdatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Connecting…"}
          </div>
        </div>

        {error ? (
          <div className="m-6 rounded-2xl border border-red-400/25 bg-red-400/10 px-5 py-4 text-sm font-semibold text-red-100">{error}</div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead className="border-b border-white/10 bg-white/[0.025] text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
              <tr>
                <th className="px-6 py-4">Rank</th>
                <th className="px-6 py-4">Player</th>
                <th className="px-6 py-4">Arena</th>
                <th className="px-6 py-4 text-right">Wins</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="border-b border-white/5">
                    <td colSpan={4} className="px-6 py-5"><div className="h-5 animate-pulse rounded bg-white/5" /></td>
                  </tr>
                ))
              ) : filteredLeaderboard.length > 0 ? (
                filteredLeaderboard.map((entry, index) => (
                  <tr key={`${entry.username}-${entry.category}-${index}`} className="border-b border-white/5 transition hover:bg-white/[0.035]">
                    <td className="px-6 py-5">
                      <span className={`grid h-10 w-10 place-items-center rounded-xl font-black ${index === 0 ? "bg-amber-300 text-slate-950" : index === 1 ? "bg-slate-200 text-slate-900" : index === 2 ? "bg-orange-400 text-slate-950" : "border border-white/10 bg-white/5 text-slate-300"}`}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-6 py-5 font-black text-white">{entry.username}</td>
                    <td className="px-6 py-5 text-sm text-slate-400">{selectedCategory === "Total Wins" ? "All categories" : selectedCategory}</td>
                    <td className="px-6 py-5 text-right text-xl font-black text-cyan-200">{entry.wins}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <p className="text-lg font-black text-white">No champions yet</p>
                    <p className="mt-2 text-sm text-slate-400">Complete a match in this arena to claim the first ranking.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </ArenaShell>
  );
}
