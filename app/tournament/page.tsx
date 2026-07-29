"use client";

import { ArenaHeader, ArenaShell, arenaPanelClass } from "@/components/arena/ArenaShell";
import { getSocket } from "@/lib/socket";
import { SessionProvider, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Player = { id: string; displayName: string; kind: "human" | "bot"; status: "queued" | "matched" | "eliminated" | "champion"; round: number; wins: number };
type Snapshot = { id: string; startingPlayers: number; remainingPlayers: number; round: number; queuedHumans: number; queuedBots: number; activeDuels: number; champion: Player | null };
type Duel = { id: string; round: number; playerOneId: string; playerTwoId: string; questionCount: number };
type Match = { lobbyId: string; duel: Duel; player: Player; opponent: Player; tournament: Snapshot };
type Lobby = { lobbyId: string | null; phase: "creating" | "waiting" | "starting" | "matched" | "error"; joinedPlayers: number; targetPlayers: number; secondsRemaining: number };
type Activity = { id: string; text: string; accent?: string };

const LOCATIONS = ["California", "Texas", "New York", "Florida", "Canada", "Brazil", "United Kingdom", "India"];
const TRAITS = ["Sports Specialist", "Movie Buff", "History Grinder", "Quick Thinker", "Comeback Player", "All-Rounder"];
const REVEAL_SECONDS = 4;

function TournamentPageInner() {
  const { status } = useSession();
  const router = useRouter();
  const requestedRef = useRef(false);
  const previousJoinedRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [revealSeconds, setRevealSeconds] = useState(REVEAL_SECONDS);
  const [lobby, setLobby] = useState<Lobby>({ lobbyId: null, phase: "creating", joinedPlayers: 0, targetPlayers: 1000, secondsRemaining: 6 });

  const opponentTrait = (() => {
    if (!match) return "Unknown";
    const total = [...match.opponent.displayName].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return TRAITS[total % TRAITS.length];
  })();

  useEffect(() => {
    if (status !== "authenticated") return;
    const socket = getSocket();

    const createLobby = () => {
      if (requestedRef.current) return;
      requestedRef.current = true;
      previousJoinedRef.current = 0;
      setError(null);
      setMatch(null);
      setActivity([{ id: crypto.randomUUID(), text: "Searching for an open tournament server…" }]);
      setLobby({ lobbyId: null, phase: "creating", joinedPlayers: 0, targetPlayers: 1000, secondsRemaining: 6 });
      socket.emit("createTournamentLobby", {});
    };

    const onConnect = () => { setConnected(true); createLobby(); };
    const onDisconnect = () => setConnected(false);
    const onCreated = (payload: { lobbyId: string; joinedPlayers: number; targetPlayers: number; player: Player }) => {
      previousJoinedRef.current = payload.joinedPlayers;
      setPlayer(payload.player);
      setLobby({ lobbyId: payload.lobbyId, phase: "waiting", joinedPlayers: payload.joinedPlayers, targetPlayers: payload.targetPlayers, secondsRemaining: 6 });
      setActivity((items) => [
        { id: crypto.randomUUID(), text: "You joined the tournament", accent: "PLAYER LOCKED" },
        { id: crypto.randomUUID(), text: `Server ${payload.lobbyId.slice(0, 8).toUpperCase()} created` },
        ...items,
      ].slice(0, 6));
    };
    const onUpdate = (payload: { lobbyId: string; phase: "waiting" | "starting"; joinedPlayers: number; targetPlayers: number; estimatedSecondsRemaining: number }) => {
      const added = Math.max(0, payload.joinedPlayers - previousJoinedRef.current);
      previousJoinedRef.current = payload.joinedPlayers;
      setLobby((current) => current.lobbyId && current.lobbyId !== payload.lobbyId ? current : ({ lobbyId: payload.lobbyId, phase: payload.phase, joinedPlayers: payload.joinedPlayers, targetPlayers: payload.targetPlayers, secondsRemaining: payload.estimatedSecondsRemaining }));
      if (added > 0) {
        setActivity((items) => [{ id: crypto.randomUUID(), text: `+${added.toLocaleString()} competitors joined`, accent: LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)] }, ...items].slice(0, 6));
      }
      if (payload.phase === "starting") {
        setActivity((items) => [{ id: crypto.randomUUID(), text: "Bracket locked", accent: "1,000 READY" }, ...items].slice(0, 6));
      }
    };
    const onJoined = (payload: { player: Player }) => setPlayer(payload.player);
    const onMatch = (payload: Match) => {
      setMatch(payload);
      setPlayer(payload.player);
      setRevealSeconds(REVEAL_SECONDS);
      setLobby((current) => ({ ...current, phase: "matched", lobbyId: payload.lobbyId }));
      setActivity((items) => [{ id: crypto.randomUUID(), text: `Round ${payload.duel.round} opponent selected`, accent: payload.opponent.displayName }, ...items].slice(0, 6));
      setError(null);
    };
    const onError = ({ message }: { message: string }) => { setError(message); setLobby((current) => ({ ...current, phase: "error" })); };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("tournamentLobbyCreated", onCreated);
    socket.on("tournamentLobbyUpdate", onUpdate);
    socket.on("tournamentJoined", onJoined);
    socket.on("tournamentMatchFound", onMatch);
    socket.on("tournamentError", onError);
    socket.on("tournamentAuthenticationRequired", onError);
    if (socket.connected) onConnect(); else socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("tournamentLobbyCreated", onCreated);
      socket.off("tournamentLobbyUpdate", onUpdate);
      socket.off("tournamentJoined", onJoined);
      socket.off("tournamentMatchFound", onMatch);
      socket.off("tournamentError", onError);
      socket.off("tournamentAuthenticationRequired", onError);
    };
  }, [status]);

  useEffect(() => {
    if (!match) return;
    setRevealSeconds(REVEAL_SECONDS);
    const timer = window.setInterval(() => {
      setRevealSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          router.push(`/tournament/duel?duelId=${encodeURIComponent(match.duel.id)}`);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [match, router]);

  const retry = () => {
    requestedRef.current = false;
    previousJoinedRef.current = 0;
    const socket = getSocket();
    setError(null);
    setMatch(null);
    setPlayer(null);
    setActivity([{ id: crypto.randomUUID(), text: "Searching for a new tournament server…" }]);
    setLobby({ lobbyId: null, phase: "creating", joinedPlayers: 0, targetPlayers: 1000, secondsRemaining: 6 });
    if (socket.connected) { requestedRef.current = true; socket.emit("createTournamentLobby", {}); } else socket.connect();
  };

  if (status === "loading") return <main className="arena-shell flex min-h-screen items-center justify-center text-white"><div className="text-center"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-cyan-300" /><p className="mt-4 font-bold">Preparing tournament…</p></div></main>;
  if (status === "unauthenticated") { if (typeof window !== "undefined") window.location.href = "/login"; return null; }

  const progress = Math.max(0, Math.min(100, (lobby.joinedPlayers / Math.max(1, lobby.targetPlayers)) * 100));

  return (
    <ArenaShell>
      <ArenaHeader eyebrow="1,000-player elimination" title="TriRoyale Tournament" description="Enter the field, survive three-question duels, and outlast the entire lobby." action={<button onClick={() => router.push("/")} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-white/10">Back home</button>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className={`${arenaPanelClass} overflow-hidden p-6 sm:p-8`}>
          <div className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-7">
            <div><p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">Competitors locked</p><p className="mt-2 text-6xl font-black tracking-[-0.05em]">{lobby.joinedPlayers.toLocaleString()}<span className="text-2xl text-slate-500"> / {lobby.targetPlayers.toLocaleString()}</span></p><p className="mt-2 text-sm text-slate-400">{lobby.lobbyId ? `Server ${lobby.lobbyId.slice(0, 8).toUpperCase()}` : "Finding tournament server"}</p></div>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-bold ${connected ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}><span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-300" : "animate-pulse bg-amber-300"}`} />{connected ? "Live server" : "Reconnecting"}</span>
          </div>
          <div className="mt-7"><div className="mb-2 flex justify-between text-xs font-bold uppercase tracking-[0.18em] text-slate-500"><span>{match ? "Opponent reveal" : "Lobby formation"}</span><span>{Math.round(progress)}%</span></div><div className="h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} /></div></div>
          {error && <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100">{error}</div>}
          {match ? <OpponentReveal match={match} trait={opponentTrait} seconds={revealSeconds} onEnter={() => router.push(`/tournament/duel?duelId=${encodeURIComponent(match.duel.id)}`)} /> : <WaitingPanel lobby={lobby} activity={activity} onRetry={retry} />}
        </section>
        <aside className="space-y-4">
          <div className={`${arenaPanelClass} p-5`}><p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Your run</p><div className="mt-5 grid grid-cols-2 gap-3"><Stat value={String(player?.wins ?? 0)} label="Duel wins" /><Stat value={String(player?.round ?? 1)} label="Current round" /></div></div>
          <div className={`${arenaPanelClass} p-5`}><p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Road to champion</p><div className="mt-4 space-y-3">{[1000, 500, 250, 125, 63, 32, 16, 8, 4, 2, 1].map((count, index) => <div key={count} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${index === 0 ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.025] text-slate-400"}`}><span>Round {index + 1}</span><span className="font-black">{count.toLocaleString()} left</span></div>)}</div></div>
        </aside>
      </div>
    </ArenaShell>
  );
}

function WaitingPanel({ lobby, activity, onRetry }: { lobby: Lobby; activity: Activity[]; onRetry: () => void }) {
  const failed = lobby.phase === "error";
  const starting = lobby.phase === "starting";
  return <div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
    <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-8 text-center"><div className="relative grid h-24 w-24 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/10"><div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-t-cyan-300" /><span className="text-3xl">⚔</span></div><p className="mt-5 text-xs font-black uppercase tracking-[0.3em] text-cyan-300">{starting ? "Bracket locking" : "Matchmaking"}</p><h2 className="mt-3 text-3xl font-black">{failed ? "Tournament failed" : starting ? "Get ready" : lobby.phase === "creating" ? "Finding a server" : "Building the field"}</h2><p className="mt-3 max-w-lg text-slate-300">{failed ? "Create a fresh tournament server and retry." : starting ? "All competitors are locked. Your opponent reveal is next." : `${lobby.secondsRemaining} second${lobby.secondsRemaining === 1 ? "" : "s"} until the bracket locks.`}</p>{!failed && <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-6 py-3"><span className="text-4xl font-black text-white">{Math.max(0, lobby.secondsRemaining)}</span><span className="ml-2 text-sm font-bold uppercase tracking-[0.18em] text-slate-500">seconds</span></div>}{failed && <button onClick={onRetry} className="mt-7 rounded-2xl bg-cyan-400 px-8 py-4 text-lg font-black text-[#03101f] transition hover:bg-cyan-300">Create new tournament</button>}</div>
    <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Live lobby</p><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /></div><div className="mt-4 space-y-3">{activity.length === 0 ? <p className="text-sm text-slate-500">Waiting for competitors…</p> : activity.map((item) => <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"><p className="text-sm font-bold text-slate-200">{item.text}</p>{item.accent && <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">{item.accent}</p>}</div>)}</div></div>
  </div>;
}

function OpponentReveal({ match, trait, seconds, onEnter }: { match: Match; trait: string; seconds: number; onEnter: () => void }) {
  return <div className="mt-8 rounded-3xl border border-cyan-300/20 bg-gradient-to-b from-cyan-300/[0.08] to-transparent p-6 sm:p-8"><p className="text-center text-xs font-black uppercase tracking-[0.32em] text-cyan-300">Opponent found</p><h2 className="mt-3 text-center text-3xl font-black">Round {match.duel.round}</h2><div className="mt-7 grid items-center gap-5 sm:grid-cols-[1fr_auto_1fr]"><PlayerCard player={match.player} label="You" subtitle="Tournament challenger" /><div className="text-center"><div className="text-3xl font-black text-white/30">VS</div><div className="mt-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-black text-slate-300">{seconds}</div></div><PlayerCard player={match.opponent} label={match.opponent.kind === "bot" ? "AI rival" : "Live rival"} subtitle={trait} /></div><div className="mt-7 grid grid-cols-3 gap-3"><Stat value={String(match.duel.questionCount)} label="Questions" /><Stat value="12s" label="Per question" /><Stat value="WIN" label="To advance" /></div><p className="mt-5 text-center text-sm text-slate-400">Entering the arena automatically in {seconds}…</p><button onClick={onEnter} className="mt-5 w-full rounded-2xl bg-cyan-400 px-5 py-4 text-lg font-black text-[#03101f] transition hover:bg-cyan-300">Enter arena now</button></div>;
}

function PlayerCard({ player, label, subtitle }: { player: Player; label: string; subtitle: string }) { return <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-cyan-300/25 to-blue-500/25 text-2xl font-black text-cyan-100">{player.displayName.slice(0, 2).toUpperCase()}</div><p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-slate-500">{label}</p><h3 className="mt-2 truncate text-xl font-black">{player.displayName}</h3><p className="mt-2 text-sm font-semibold text-cyan-200">{subtitle}</p><p className="mt-1 text-sm text-slate-500">{player.wins} previous wins</p></div>; }
function Stat({ value, label }: { value: string; label: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-center"><p className="text-xl font-black text-white">{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p></div>; }

export default function TournamentPage() { return <SessionProvider><TournamentPageInner /></SessionProvider>; }
