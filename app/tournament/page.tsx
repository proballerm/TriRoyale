"use client";

import { ArenaHeader, ArenaShell, arenaPanelClass } from "@/components/arena/ArenaShell";
import { getSocket } from "@/lib/socket";
import { SessionProvider, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  lobbyId: string;
  duel: TournamentDuel;
  player: TournamentPlayer;
  opponent: TournamentPlayer;
  tournament: TournamentSnapshot;
};

type LobbyState = {
  lobbyId: string | null;
  phase: "creating" | "waiting" | "starting" | "matched" | "error";
  joinedPlayers: number;
  targetPlayers: number;
  secondsRemaining: number;
};

function TournamentPageInner() {
  const { status } = useSession();
  const router = useRouter();
  const createRequestedRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tournament, setTournament] = useState<TournamentSnapshot | null>(null);
  const [player, setPlayer] = useState<TournamentPlayer | null>(null);
  const [match, setMatch] = useState<TournamentMatch | null>(null);
  const [lobby, setLobby] = useState<LobbyState>({
    lobbyId: null,
    phase: "creating",
    joinedPlayers: 0,
    targetPlayers: 1000,
    secondsRemaining: 6,
  });

  useEffect(() => {
    if (status !== "authenticated") return;
    const socket = getSocket();

    const requestFreshLobby = () => {
      if (createRequestedRef.current) return;
      createRequestedRef.current = true;
      setError(null);
      setMatch(null);
      setLobby({
        lobbyId: null,
        phase: "creating",
        joinedPlayers: 0,
        targetPlayers: 1000,
        secondsRemaining: 6,
      });
      socket.emit("createTournamentLobby", {});
    };

    const handleConnect = () => {
      setConnected(true);
      requestFreshLobby();
    };
    const handleDisconnect = () => setConnected(false);
    const handleLobbyCreated = (payload: {
      lobbyId: string;
      joinedPlayers: number;
      targetPlayers: number;
      tournament: TournamentSnapshot;
      player: TournamentPlayer;
    }) => {
      setTournament(payload.tournament);
      setPlayer(payload.player);
      setLobby({
        lobbyId: payload.lobbyId,
        phase: "waiting",
        joinedPlayers: payload.joinedPlayers,
        targetPlayers: payload.targetPlayers,
        secondsRemaining: 6,
      });
    };
    const handleLobbyUpdate = (payload: {
      lobbyId: string;
      phase: "waiting" | "starting";
      joinedPlayers: number;
      targetPlayers: number;
      estimatedSecondsRemaining: number;
    }) => {
      setLobby((current) => {
        if (current.lobbyId && current.lobbyId !== payload.lobbyId) return current;
        return {
          lobbyId: payload.lobbyId,
          phase: payload.phase,
          joinedPlayers: payload.joinedPlayers,
          targetPlayers: payload.targetPlayers,
          secondsRemaining: payload.estimatedSecondsRemaining,
        };
      });
    };
    const handleJoined = (payload: {
      lobbyId: string;
      player: TournamentPlayer;
      tournament: TournamentSnapshot;
    }) => {
      setPlayer(payload.player);
      setTournament(payload.tournament);
    };
    const handleMatchFound = (payload: TournamentMatch) => {
      setMatch(payload);
      setPlayer(payload.player);
      setTournament(payload.tournament);
      setLobby((current) => ({ ...current, phase: "matched", lobbyId: payload.lobbyId }));
      setError(null);
    };
    const handleError = ({ message }: { message: string }) => {
      setError(message);
      setLobby((current) => ({ ...current, phase: "error" }));
    };
    const handleAuthenticationRequired = ({ message }: { message: string }) => {
      setError(message);
      setLobby((current) => ({ ...current, phase: "error" }));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("tournamentLobbyCreated", handleLobbyCreated);
    socket.on("tournamentLobbyUpdate", handleLobbyUpdate);
    socket.on("tournamentJoined", handleJoined);
    socket.on("tournamentMatchFound", handleMatchFound);
    socket.on("tournamentError", handleError);
    socket.on("tournamentAuthenticationRequired", handleAuthenticationRequired);

    if (socket.connected) handleConnect();
    else socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("tournamentLobbyCreated", handleLobbyCreated);
      socket.off("tournamentLobbyUpdate", handleLobbyUpdate);
      socket.off("tournamentJoined", handleJoined);
      socket.off("tournamentMatchFound", handleMatchFound);
      socket.off("tournamentError", handleError);
      socket.off("tournamentAuthenticationRequired", handleAuthenticationRequired);
    };
  }, [status]);

  const startAnotherTournament = () => {
    createRequestedRef.current = false;
    const socket = getSocket();
    if (socket.connected) {
      createRequestedRef.current = true;
      setError(null);
      setMatch(null);
      setTournament(null);
      setPlayer(null);
      setLobby({
        lobbyId: null,
        phase: "creating",
        joinedPlayers: 0,
        targetPlayers: 1000,
        secondsRemaining: 6,
      });
      socket.emit("createTournamentLobby", {});
    } else {
      socket.connect();
    }
  };

  if (status === "loading") {
    return (
      <main className="arena-shell flex min-h-screen items-center justify-center text-white">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-cyan-300" />
          <p className="mt-4 font-bold">Preparing tournament…</p>
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  const waitingProgress = Math.max(
    0,
    Math.min(100, (lobby.joinedPlayers / Math.max(1, lobby.targetPlayers)) * 100),
  );

  return (
    <ArenaShell>
      <ArenaHeader
        eyebrow="Fresh 1,000-player lobby"
        title="TriRoyale Tournament"
        description="Every visit creates a new tournament lobby. Players fill the field, then your elimination run begins."
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
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">
                Players joined
              </p>
              <p className="mt-2 text-6xl font-black tracking-[-0.05em]">
                {lobby.joinedPlayers.toLocaleString()}
                <span className="text-2xl text-slate-500"> / {lobby.targetPlayers.toLocaleString()}</span>
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {lobby.lobbyId ? `Lobby ${lobby.lobbyId.slice(0, 8).toUpperCase()}` : "Creating your lobby"}
              </p>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-bold ${connected ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-300" : "animate-pulse bg-amber-300"}`} />
              {connected ? "Server connected" : "Reconnecting"}
            </span>
          </div>

          <div className="mt-7">
            <div className="mb-2 flex justify-between text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              <span>Lobby fill progress</span>
              <span>{Math.round(waitingProgress)}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-500 transition-all duration-300"
                style={{ width: `${waitingProgress}%` }}
              />
            </div>
          </div>

          {error && (
            <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100">
              {error}
            </div>
          )}

          {match ? (
            <div className="mt-8">
              <p className="text-center text-xs font-black uppercase tracking-[0.3em] text-cyan-300">
                Opponent found
              </p>
              <div className="mt-6 grid items-center gap-5 sm:grid-cols-[1fr_auto_1fr]">
                <PlayerCard player={match.player} label="You" />
                <div className="text-center text-2xl font-black text-white/35">VS</div>
                <PlayerCard
                  player={match.opponent}
                  label={match.opponent.kind === "bot" ? "AI challenger" : "Live player"}
                />
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
          ) : (
            <WaitingPanel lobby={lobby} onRetry={startAnotherTournament} />
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
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Lobby rules</p>
            <ol className="mt-4 space-y-4 text-sm leading-6 text-slate-300">
              <li className="flex gap-3"><span className="font-black text-cyan-300">01</span><span>Every visit creates a separate tournament.</span></li>
              <li className="flex gap-3"><span className="font-black text-cyan-300">02</span><span>The field visibly fills before Round 1 starts.</span></li>
              <li className="flex gap-3"><span className="font-black text-cyan-300">03</span><span>Each duel uses three unique questions.</span></li>
              <li className="flex gap-3"><span className="font-black text-cyan-300">04</span><span>Questions already used in this tournament are rejected.</span></li>
            </ol>
          </div>
        </aside>
      </div>
    </ArenaShell>
  );
}

function WaitingPanel({ lobby, onRetry }: { lobby: LobbyState; onRetry: () => void }) {
  const creating = lobby.phase === "creating";
  const starting = lobby.phase === "starting";
  const failed = lobby.phase === "error";

  return (
    <div className="mt-8 flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-8 text-center">
      <div className="relative grid h-20 w-20 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/10">
        <div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-t-cyan-300" />
        <span className="text-2xl">⚔</span>
      </div>
      <h2 className="mt-6 text-3xl font-black">
        {failed ? "Lobby could not start" : starting ? "Tournament starting" : creating ? "Creating your lobby" : "Filling the tournament"}
      </h2>
      <p className="mt-3 max-w-lg text-slate-300">
        {failed
          ? "Start a new isolated lobby and try again."
          : starting
            ? "The bracket is locked. Your Round 1 opponent is being selected."
            : `Players are joining now. Estimated start: ${lobby.secondsRemaining} second${lobby.secondsRemaining === 1 ? "" : "s"}.`}
      </p>
      {failed && (
        <button
          onClick={onRetry}
          className="mt-7 rounded-2xl bg-cyan-400 px-8 py-4 text-lg font-black text-[#03101f] transition hover:bg-cyan-300"
        >
          Create new tournament
        </button>
      )}
    </div>
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
