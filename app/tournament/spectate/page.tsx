"use client";

import { ArenaHeader, ArenaShell, arenaPanelClass } from "@/components/arena/ArenaShell";
import { getSocket } from "@/lib/socket";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type TournamentPlayer = {
  id: string;
  displayName: string;
  kind: "human" | "bot";
  status: "queued" | "matched" | "eliminated" | "champion";
  round: number;
  wins: number;
};

type TournamentDuel = {
  id: string;
  round: number;
  playerOneId: string;
  playerTwoId: string;
  questionCount: number;
  winnerId: string | null;
  completedAt: number | null;
};

type SpectatorDuel = {
  duel: TournamentDuel;
  playerOne: TournamentPlayer;
  playerTwo: TournamentPlayer;
  winner: TournamentPlayer | null;
};

type SpectatorState = {
  tournament: {
    id: string;
    startingPlayers: number;
    remainingPlayers: number;
    round: number;
    queuedHumans: number;
    queuedBots: number;
    activeDuels: number;
    champion: TournamentPlayer | null;
  };
  activeDuels: SpectatorDuel[];
  recentResults: SpectatorDuel[];
};

export default function TournamentSpectatorPage() {
  const router = useRouter();
  const [state, setState] = useState<SpectatorState | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    const requestState = () => socket.emit("getTournamentSpectatorState");
    const handleConnect = () => {
      setConnected(true);
      socket.emit("subscribeTournamentSpectator");
    };
    const handleDisconnect = () => setConnected(false);
    const handleState = (payload: SpectatorState) => setState(payload);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("tournamentSpectatorState", handleState);

    if (socket.connected) handleConnect();
    else socket.connect();

    const interval = window.setInterval(requestState, 2_000);
    return () => {
      window.clearInterval(interval);
      socket.emit("unsubscribeTournamentSpectator");
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("tournamentSpectatorState", handleState);
    };
  }, []);

  const tournament = state?.tournament;

  return (
    <ArenaShell>
      <ArenaHeader
        eyebrow="Live tournament feed"
        title="Spectator Arena"
        description="Follow the field, watch active pairings, and see the latest players advance."
        action={
          <button
            onClick={() => router.push("/tournament")}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-white/10"
          >
            Back to tournament
          </button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={(tournament?.remainingPlayers ?? 1000).toLocaleString()} label="Players remaining" />
        <Stat value={String(tournament?.round ?? 1)} label="Current round" />
        <Stat value={String(tournament?.activeDuels ?? 0)} label="Active duels" />
        <Stat value={connected ? "LIVE" : "WAIT"} label="Feed status" />
      </section>

      {tournament?.champion ? (
        <section className={`${arenaPanelClass} mt-6 p-8 text-center`}>
          <p className="text-xs font-black uppercase tracking-[0.26em] text-amber-300">Tournament champion</p>
          <h2 className="mt-3 text-4xl font-black">{tournament.champion.displayName}</h2>
          <p className="mt-2 text-slate-400">Won {tournament.champion.wins} duels</p>
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className={`${arenaPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-6 py-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Live pairings</p>
            <h2 className="mt-1 text-2xl font-black">Active duels</h2>
          </div>
          <div className="divide-y divide-white/5">
            {state?.activeDuels.length ? (
              state.activeDuels.map((entry) => <DuelRow key={entry.duel.id} entry={entry} active />)
            ) : (
              <EmptyState message="No live duel is currently active." />
            )}
          </div>
        </section>

        <section className={`${arenaPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-6 py-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Latest eliminations</p>
            <h2 className="mt-1 text-2xl font-black">Recent results</h2>
          </div>
          <div className="divide-y divide-white/5">
            {state?.recentResults.length ? (
              state.recentResults.map((entry) => <DuelRow key={entry.duel.id} entry={entry} active={false} />)
            ) : (
              <EmptyState message="Results will appear after the first duel finishes." />
            )}
          </div>
        </section>
      </div>
    </ArenaShell>
  );
}

function DuelRow({ entry, active }: { entry: SpectatorDuel; active: boolean }) {
  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Round {entry.duel.round}</span>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${active ? "bg-emerald-400/10 text-emerald-200" : "bg-white/5 text-slate-400"}`}>
          {active ? "In progress" : "Final"}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <PlayerName player={entry.playerOne} winnerId={entry.winner?.id} />
        <span className="text-xs font-black text-white/30">VS</span>
        <PlayerName player={entry.playerTwo} winnerId={entry.winner?.id} align="right" />
      </div>
    </div>
  );
}

function PlayerName({ player, winnerId, align = "left" }: { player: TournamentPlayer; winnerId?: string; align?: "left" | "right" }) {
  const winner = winnerId === player.id;
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <p className={`truncate font-black ${winner ? "text-cyan-200" : "text-white"}`}>{player.displayName}</p>
      <p className="mt-1 text-xs text-slate-500">{player.kind === "bot" ? "AI" : "Human"} · {player.wins} wins</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className={`${arenaPanelClass} p-5`}>
      <p className="text-3xl font-black text-white">{value}</p>
      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-6 py-12 text-center text-sm text-slate-500">{message}</p>;
}
