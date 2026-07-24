"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, Suspense } from "react";
import { getSocket } from "@/lib/socket";
import { useSession, SessionProvider } from "next-auth/react";

type LobbyUpdate = {
  matchId: string;
  players: string[];
  category?: string;
  host?: string | null;
};

type GameStatusPayload = {
  matchId: string;
  category?: string;
  started: boolean;
  question?: unknown;
  reconnected?: boolean;
};

export const dynamic = "force-dynamic";

function LobbyPageInner() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  const category = searchParams.get("category") || "Battle Royale";
  const incomingMatchId = searchParams.get("matchId");

  const [players, setPlayers] = useState<string[]>([]);
  const [host, setHost] = useState<string | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [matchId, setMatchId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [disconnectedPlayers, setDisconnectedPlayers] = useState<Set<string>>(new Set());

  const username = useMemo(
    () =>
      session?.user?.name ||
      session?.user?.email?.split("@")[0] ||
      `Player_${Math.random().toString(36).slice(2, 6)}`,
    [session?.user?.name, session?.user?.email],
  );

  const generatedMatchId = useMemo(
    () => incomingMatchId || crypto.randomUUID(),
    [incomingMatchId],
  );

  useEffect(() => {
    if (status !== "authenticated") return;

    const socket = getSocket();
    setMatchId(generatedMatchId);

    const joinLobby = () => {
      setConnected(true);
      socket.emit("joinLobby", {
        username,
        category,
        matchId: generatedMatchId,
      });
    };

    const handleDisconnect = () => setConnected(false);

    const handleGameStatus = (payload: GameStatusPayload) => {
      if (payload.matchId !== generatedMatchId) return;
      if (payload.started && !gameStarted) {
        setGameStarted(true);
        router.push(`/game?category=${encodeURIComponent(category)}&matchId=${generatedMatchId}`);
      }
    };

    const handleLobbyUpdate = (data: LobbyUpdate) => {
      if (data.matchId !== generatedMatchId) return;
      setPlayers(data.players);
      setHost(data.host || null);
      setDisconnectedPlayers((current) => {
        const next = new Set(current);
        data.players.forEach((player) => {
          if (!next.has(player)) return;
        });
        return next;
      });
    };

    const handleConnectionChanged = ({ username: changedUser, connected: isConnected }: { username: string; connected: boolean }) => {
      setDisconnectedPlayers((current) => {
        const next = new Set(current);
        if (isConnected) next.delete(changedUser);
        else next.add(changedUser);
        return next;
      });
    };

    const handleStartGame = (data: { category: string; matchId: string }) => {
      if (data.matchId !== generatedMatchId || gameStarted) return;
      setGameStarted(true);
      router.push(`/game?category=${encodeURIComponent(category)}&matchId=${generatedMatchId}`);
    };

    const handleGameError = ({ message }: { message: string }) => {
      setError(message);
      setGameStarted(false);
    };

    socket.on("connect", joinLobby);
    socket.on("disconnect", handleDisconnect);
    socket.on("gameStatus", handleGameStatus);
    socket.on("lobbyUpdate", handleLobbyUpdate);
    socket.on("playerConnectionChanged", handleConnectionChanged);
    socket.on("startGame", handleStartGame);
    socket.on("gameError", handleGameError);

    if (socket.connected) joinLobby();
    else socket.connect();

    return () => {
      socket.off("connect", joinLobby);
      socket.off("disconnect", handleDisconnect);
      socket.off("gameStatus", handleGameStatus);
      socket.off("lobbyUpdate", handleLobbyUpdate);
      socket.off("playerConnectionChanged", handleConnectionChanged);
      socket.off("startGame", handleStartGame);
      socket.off("gameError", handleGameError);
    };
  }, [status, username, category, generatedMatchId, router, gameStarted]);

  const handleStartGameClick = () => {
    const socket = getSocket();
    if (!matchId || host !== username || gameStarted) return;
    setError(null);
    socket.emit("startGame", { category, matchId });
  };

  const copyInvite = async () => {
    const inviteUrl = `${window.location.origin}/lobby?category=${encodeURIComponent(category)}&matchId=${generatedMatchId}`;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (status === "loading") return <LobbyLoading />;

  if (status === "unauthenticated") {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  const isHost = host === username;
  const humanPlayers = players.filter((player) => !player.startsWith("🤖"));
  const botPlayers = players.filter((player) => player.startsWith("🤖"));

  return (
    <main className="arena-shell min-h-screen px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#081426]/85 px-5 py-4 backdrop-blur-xl">
          <div>
            <p className="text-xs font-black tracking-[0.3em] text-cyan-300">MATCH LOBBY</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">{category}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${connected ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
              {connected ? "Live" : "Reconnecting"}
            </span>
            <button onClick={() => router.push("/")} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/10">
              Leave
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className="rounded-3xl border border-white/10 bg-[#081426]/90 p-5 shadow-2xl backdrop-blur-xl sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
              <div>
                <p className="text-sm font-semibold text-slate-400">Players assembled</p>
                <p className="mt-1 text-4xl font-black">{players.length}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold tracking-[0.2em] text-slate-500">HOST</p>
                <p className="mt-1 font-bold text-cyan-200">{host || "Assigning…"}</p>
              </div>
            </div>

            {error && (
              <div className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100">
                {error}
              </div>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {players.map((player, index) => {
                const isYou = player === username;
                const isBot = player.startsWith("🤖");
                const isDisconnected = disconnectedPlayers.has(player);
                return (
                  <div key={player} className={`flex items-center gap-4 rounded-2xl border p-4 ${isYou ? "border-cyan-300/50 bg-cyan-300/10" : "border-white/10 bg-white/[0.035]"}`}>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300/20 to-blue-500/20 text-sm font-black text-cyan-200">
                      {isBot ? "AI" : player.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-black">{player}</p>
                        {player === host && <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-black tracking-wider text-amber-200">HOST</span>}
                      </div>
                      <p className={`mt-1 text-xs font-semibold ${isDisconnected ? "text-amber-300" : "text-emerald-300"}`}>
                        {isDisconnected ? "Reconnecting…" : isBot ? "AI challenger" : isYou ? "You" : `Player ${index + 1}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {players.length === 0 && (
              <div className="mt-8 rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-400">
                Waiting for players to enter the arena…
              </div>
            )}

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold tracking-[0.2em] text-slate-500">MATCH COMPOSITION</p>
                  <p className="mt-2 text-sm text-slate-300">{humanPlayers.length} human · {botPlayers.length} AI challengers</p>
                </div>
                <div className="flex gap-1.5">
                  {Array.from({ length: Math.max(8, players.length) }).map((_, index) => (
                    <span key={index} className={`h-2.5 w-6 rounded-full ${index < players.length ? "bg-cyan-300" : "bg-white/10"}`} />
                  ))}
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#081426]/90 p-5 backdrop-blur-xl">
              <p className="text-xs font-bold tracking-[0.22em] text-slate-500">INVITE PLAYERS</p>
              <p className="mt-3 break-all font-mono text-sm text-cyan-200">{matchId || generatedMatchId}</p>
              <button onClick={copyInvite} className="mt-4 w-full rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 font-black text-cyan-100 transition hover:bg-cyan-300/20">
                {copied ? "Invite copied" : "Copy invite link"}
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#081426]/90 p-5 backdrop-blur-xl">
              <p className="text-xs font-bold tracking-[0.22em] text-slate-500">MATCH RULES</p>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <li className="flex gap-3"><span className="text-cyan-300">01</span><span>Each question has a server-controlled 15-second timer.</span></li>
                <li className="flex gap-3"><span className="text-cyan-300">02</span><span>Wrong or missing answers eliminate the player.</span></li>
                <li className="flex gap-3"><span className="text-cyan-300">03</span><span>Disconnected players get 20 seconds to recover their session.</span></li>
              </ul>
            </div>

            <button
              onClick={handleStartGameClick}
              disabled={!isHost || gameStarted || players.length < 2 || !connected}
              className="w-full rounded-2xl bg-cyan-400 px-5 py-4 text-lg font-black text-[#03101f] shadow-[0_0_35px_rgba(34,211,238,0.18)] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500 disabled:shadow-none"
            >
              {gameStarted ? "Launching match…" : isHost ? players.length < 2 ? "Waiting for players" : "Start match" : "Waiting for host"}
            </button>
          </aside>
        </div>
      </div>
    </main>
  );
}

function LobbyLoading() {
  return (
    <main className="arena-shell min-h-screen flex items-center justify-center text-white">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-cyan-300" />
        <p className="mt-5 font-bold">Preparing lobby…</p>
      </div>
    </main>
  );
}

export default function LobbyPage() {
  return (
    <SessionProvider>
      <Suspense fallback={<LobbyLoading />}>
        <LobbyPageInner />
      </Suspense>
    </SessionProvider>
  );
}
