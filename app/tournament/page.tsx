"use client";

import { ArenaHeader, ArenaShell, arenaPanelClass } from "@/components/arena/ArenaShell";
import { getSocket } from "@/lib/socket";
import { SessionProvider, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type TournamentPlayer = {
  id: string;
  displayName: string;
  kind: "human" | "bot";
  status: "queued" | "matched" | "eliminated" | "champion";
  round: number;
  wins: number;
};

type TournamentSnapshot = {
  id: string;
  startingPlayers: number;
  remainingPlayers: number;
  round: number;
  queuedHumans: number;
  queuedBots: number;
  activeDuels: number;
  champion: TournamentPlayer | null;
};

type TournamentDuel = {
  id: string;
  round: number;
  playerOneId: string;
  playerTwoId: string;
  questionCount: number;
};

type TournamentMatch = {
  duel: TournamentDuel;
  player: TournamentPlayer;
  opponent: TournamentPlayer;
  tournament: TournamentSnapshot;
};

function TournamentPageInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tournament, setTournament] = useState<TournamentSnapshot | null>(null);
  const [player, setPlayer] = useState<TournamentPlayer | null>(null);
  const [match, setMatch] = useState<TournamentMatch | null>(null);
  const [connected, setConnected] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = session?.user?.name || session?.user?.email?.split("@")[0] || "Player";
  const playerId = useMemo(
    () => session?.user?.email || `player:${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    [session?.user?.email, displayName],
  );

  useEffect(() => {
    if (status !== "authenticated") return;

    const socket = getSocket();

    const handleConnect = () => {
      setConnected(true);
      socket.emit("getTournamentStatus");
    };
    const handleDisconnect = () => setConnected(false);
    const handleJoined = (payload: { player: TournamentPlayer; tournament: TournamentSnapshot }) => {
      setJoining(false);
      setPlayer(payload.player);
      setTournament(payload.tournament);
    };
    const handleMatchFound = (payload: TournamentMatch) => {
      setJoining(false);
      setPlayer(payload.player);
      setTournament(payload.tournament);
      setMatch(payload);
      setError(null);
    };
    const handleStatus = (payload: {
      tournament: TournamentSnapshot;
      player: TournamentPlayer | null;
      match: TournamentMatch | null;
    }) => {
      setTournament(payload.tournament);
      setPlayer(payload.player);
      setMatch(payload.match);
    };
    const handleCompleted = (payload: {
      winner: TournamentPlayer;
      loser: TournamentPlayer;
      tournament: TournamentSnapshot;
    }) => {
      setTournament(payload.tournament);
      const currentPlayer = payload.winner.id === playerId ? payload.winner : payload.loser;
      setPlayer(currentPlayer);
      if (currentPlayer.status === "eliminated") setMatch(null);
    };
    const handleError = ({ message }: { message: string }) => {
      setJoining(false);
      setError(message);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("tournamentJoined", handleJoined);
    socket.on("tournamentMatchFound", handleMatchFound);
    socket.on("tournamentStatus", handleStatus);
    socket.on("tournamentMatchCompleted", handleCompleted);
    socket.on("tournamentError", handleError);

    if (socket.connected) handleConnect();
    else socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("tournamentJoined", handleJoined);
      socket.off("tournamentMatchFound", handleMatchFound);
      socket.off("tournamentStatus", handleStatus);
      socket.off("tournamentMatchCompleted", handleCompleted);
      socket.off("tournamentError", handleError);
    };
  }, [status, playerId]);

  const joinTournament = () => {
    setJoining(true);
    setError(null);
    getSocket().emit("joinTournament", { playerId, displayName });
  };

  if (status === "loading") {
    return (
      <main className="arena-shell flex min-h-screen items-center justify-center text-white">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-cyan-300" />
          <p className="mt-4 font-bold">Loading tournament…</p>
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  const remaining = tournament?.remainingPlayers ?? 1000;
  const progress = Math.max(0, Math.min(100, ((1000 - remaining) / 999) * 100));

  return (
    <ArenaShell>
      <ArenaHeader
        eyebrow="1,000-player elimination"
        title="TriRoyale Tournament"
        description="Win a three-question duel, survive the cut, and get matched again until only one player remains."
        action={
          <button
            onClick={() => router.push("/")}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-white/10"
          >
            Back home
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className={`${arenaPanelClass} p-6 sm:p-8`}>
          <div className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-7">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">Players remaining</p>
              <p className="mt-2 text-6xl font-black tracking-[-0.05em]">{remaining.toLocaleString()}</p>
              <p className="mt-2 text-sm text-slate-400">Started with 1,000 competitors</p>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-bold ${connected ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-300" : "animate-pulse bg-amber-300"}`} />
              {connected ? "Matchmaking live" : "Reconnecting"}
            </span>
          </div>

          <div className="mt-7">
            <div className="mb-2 flex justify-between text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              <span>Tournament progress</span>
              <span>Round {tournament?.round ?? 1}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {error && (
            <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100">
              {error}
            </div>
          )}

          {match ? (
            <div className="mt-8">
              <p className="text-center text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Opponent found</p>
              <div className="mt-6 grid items-center gap-5 sm:grid-cols-[1fr_auto_1fr]">
                <PlayerCard player={match.player} label="You" />
                <div className="text-center text-2xl font-black text-white/35">VS</div>
                <PlayerCard player={match.opponent} label={match.opponent.kind === "bot" ? "AI challenger" : "Live player"} />
              </div>

              <div className="mt-7 grid grid-cols-3 gap-3">
                <Stat value={String(match.duel.questionCount)} label="Questions" />
                <Stat value={String(match.duel.round)} label="Round" />
                <Stat value={match.opponent.kind === "bot" ? "AI" : "LIVE"} label="Opponent" />
              </div>

              <button
                onClick={() => router.push(`/tournament/duel?duelId=${encodeURIComponent(match.duel.id)}`)}
                className="mt-7 w-full rounded-2xl bg-cyan-400 px-5 py-4 text-lg font-black text-[#03101f] transition hover:bg-cyan-300"
              >
                Enter duel
              </button>
            </div>
          ) : player?.status === "eliminated" ? (
            <div className="mt-8 rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-red-300">Tournament run ended</p>
              <h2 className="mt-3 text-3xl font-black">Eliminated</h2>
              <p className="mt-3 text-slate-300">You survived {player.wins} duel{player.wins === 1 ? "" : "s"}.</p>
            </div>
          ) : (
            <div className="mt-8 flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-8 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-3xl">⚔</div>
              <h2 className="mt-5 text-3xl font-black">Ready for the first duel?</h2>
              <p className="mt-3 max-w-lg text-slate-300">We search for another real player first. If no one is available, a realistic AI opponent fills the match immediately.</p>
              <button
                onClick={joinTournament}
                disabled={joining || !connected}
                className="mt-7 rounded-2xl bg-cyan-400 px-8 py-4 text-lg font-black text-[#03101f] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
              >
                {joining ? "Finding opponent…" : "Join tournament"}
              </button>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className={`${arenaPanelClass} p-5`}>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Your run</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Stat value={String(player?.wins ?? 0)} label="Duel wins" />
              <Stat value={String(player?.round ?? 1)} label="Current round" />
            </div>
          </div>

          <div className={`${arenaPanelClass} p-5`}>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">How it works</p>
            <ol className="mt-4 space-y-4 text-sm leading-6 text-slate-300">
              <li className="flex gap-3"><span className="font-black text-cyan-300">01</span><span>Match with one remaining competitor.</span></li>
              <li className="flex gap-3"><span className="font-black text-cyan-300">02</span><span>Both players answer the same three questions.</span></li>
              <li className="flex gap-3"><span className="font-black text-cyan-300">03</span><span>The winner advances and is automatically requeued.</span></li>
              <li className="flex gap-3"><span className="font-black text-cyan-300">04</span><span>Keep winning until one champion remains.</span></li>
            </ol>
          </div>
        </aside>
      </div>
    </ArenaShell>
  );
}

function PlayerCard({ player, label }: { player: TournamentPlayer; label: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-cyan-300/25 to-blue-500/25 text-xl font-black text-cyan-100">
        {player.displayName.slice(0, 2).toUpperCase()}
      </div>
      <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <h3 className="mt-2 truncate text-xl font-black">{player.displayName}</h3>
      <p className="mt-2 text-sm text-slate-400">{player.wins} wins</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-center">
      <p className="text-xl font-black text-white">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
    </div>
  );
}

export default function TournamentPage() {
  return (
    <SessionProvider>
      <TournamentPageInner />
    </SessionProvider>
  );
}
