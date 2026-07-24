// app/lobby/page.tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, Suspense } from "react";
import { getSocket } from "@/lib/socket";
import { useSession, SessionProvider } from "next-auth/react";
import { v4 as uuidv4 } from "uuid";

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

  const username = useMemo(
    () =>
      session?.user?.name ||
      session?.user?.email?.split("@")[0] ||
      `Player_${Math.random().toString(36).slice(2, 6)}`,
    [session?.user?.name, session?.user?.email],
  );

  const generatedMatchId = useMemo(
    () => incomingMatchId || uuidv4(),
    [incomingMatchId],
  );

  useEffect(() => {
    if (status !== "authenticated") return;

    const socket = getSocket();
    setMatchId(generatedMatchId);

    const joinLobby = () => {
      socket.emit("joinLobby", {
        username,
        category,
        matchId: generatedMatchId,
      });
      socket.emit("checkGameStatus", {
        category,
        matchId: generatedMatchId,
      });
    };

    const handleGameStatus = (payload: GameStatusPayload) => {
      if (payload.matchId !== generatedMatchId) return;
      if (payload.started && !gameStarted) {
        setGameStarted(true);
        router.push(
          `/game?category=${encodeURIComponent(category)}&matchId=${generatedMatchId}`,
        );
      }
    };

    const handleLobbyUpdate = (data: LobbyUpdate) => {
      if (data.matchId !== generatedMatchId) return;
      setPlayers(data.players);
      setHost(data.host || null);
    };

    const handleStartGame = (data: { category: string; matchId: string }) => {
      if (data.matchId !== generatedMatchId || gameStarted) return;
      setGameStarted(true);
      router.push(
        `/game?category=${encodeURIComponent(category)}&matchId=${generatedMatchId}`,
      );
    };

    const handleGameError = ({ message }: { message: string }) => {
      setError(message);
      setGameStarted(false);
    };

    socket.on("gameStatus", handleGameStatus);
    socket.on("lobbyUpdate", handleLobbyUpdate);
    socket.on("startGame", handleStartGame);
    socket.on("gameError", handleGameError);

    if (socket.connected) {
      joinLobby();
    } else {
      socket.once("connect", joinLobby);
      socket.connect();
    }

    return () => {
      socket.off("gameStatus", handleGameStatus);
      socket.off("lobbyUpdate", handleLobbyUpdate);
      socket.off("startGame", handleStartGame);
      socket.off("gameError", handleGameError);
      socket.off("connect", joinLobby);
    };
  }, [status, username, category, generatedMatchId, router, gameStarted]);

  const handleStartGameClick = () => {
    const socket = getSocket();
    if (!matchId || host !== username || gameStarted) return;
    setError(null);
    socket.emit("startGame", { category, matchId });
  };

  if (status === "loading") {
    return (
      <main className="min-h-screen flex justify-center items-center bg-gradient-to-b from-[#4EB8F2] to-[#0072CE]">
        <p className="text-white text-xl font-bold">Loading…</p>
      </main>
    );
  }

  if (status === "unauthenticated") {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  const isHost = host === username;

  return (
    <main className="min-h-screen flex justify-center items-center bg-gradient-to-b from-[#4EB8F2] to-[#0072CE] p-4">
      <div className="max-w-md w-full text-center bg-white/10 backdrop-blur p-8 rounded-3xl border border-white/30 shadow-2xl">
        <h1 className="text-white text-3xl font-extrabold mb-4">
          Trivia Royale Lobby
        </h1>
        <p className="text-white mb-2">
          Category: <span className="font-bold">{category}</span>
        </p>
        <p className="text-white mb-1">Players joined: {players.length}</p>
        <p className="text-yellow-200 text-sm mb-4">
          {isHost ? "You are the host" : host ? `Host: ${host}` : "Waiting for a host…"}
        </p>

        {error && (
          <p className="mb-4 rounded-lg bg-red-500/20 px-3 py-2 text-sm font-semibold text-red-100">
            {error}
          </p>
        )}

        <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
          {players.map((player) => (
            <div
              key={player}
              className={`px-4 py-2 rounded ${
                player === username
                  ? "bg-[#FFD930] text-[#003E7E] font-bold"
                  : "bg-white/20 text-white"
              }`}
            >
              {player}
              {player === host ? " 👑" : ""}
            </div>
          ))}
        </div>

        <button
          onClick={handleStartGameClick}
          disabled={!isHost || gameStarted || players.length < 2}
          className="w-full py-3 rounded-lg bg-[#FFD930] hover:bg-[#FFC500] disabled:bg-white/20 disabled:text-white/60 disabled:cursor-not-allowed text-[#003E7E] text-lg font-extrabold uppercase shadow transition"
        >
          {gameStarted
            ? "Starting…"
            : isHost
              ? "Start Game"
              : "Waiting for Host"}
        </button>
      </div>
    </main>
  );
}

export default function LobbyPage() {
  return (
    <SessionProvider>
      <Suspense
        fallback={
          <main className="min-h-screen flex items-center justify-center">
            <p>Loading…</p>
          </main>
        }
      >
        <LobbyPageInner />
      </Suspense>
    </SessionProvider>
  );
}
