"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import { useSession, SessionProvider } from "next-auth/react";
import { v4 as uuidv4 } from "uuid";
import { Suspense } from "react";

type LobbyUpdate = {
  category: string;
  players: string[];
  matchId: string;
};

type GameStatusPayload = {
  category: string;
  started: boolean;
  matchId: string;
};

export const dynamic = "force-dynamic";

function LobbyPage() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const category = searchParams.get("category") || "Battle Royale";
  const incomingMatchId = searchParams.get("matchId");

  const [players, setPlayers] = useState<string[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [matchId, setMatchId] = useState<string>("");

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name) return;

    const socket = getSocket();

    const generatedMatchId = incomingMatchId || uuidv4();
    setMatchId(generatedMatchId);

    const handleGameStatus = (payload: GameStatusPayload) => {
      if (payload.matchId !== generatedMatchId) return;
      if (payload.started && !gameStarted) {
        setGameStarted(true);
        router.push(`/game?category=${encodeURIComponent(category)}&matchId=${generatedMatchId}`);
      }
    };

    const handleLobbyUpdate = (data: LobbyUpdate) => {
      if (data.category === category && data.matchId === generatedMatchId) {
        setPlayers(data.players);
      }
    };

    const handleStartGame = (data: { category: string; matchId: string }) => {
      if (data.category === category && data.matchId === generatedMatchId && !gameStarted) {
        setGameStarted(true);
        router.push(`/game?category=${encodeURIComponent(category)}&matchId=${generatedMatchId}`);
      }
    };

    socket.on("gameStatus", handleGameStatus);
    socket.on("lobbyUpdate", handleLobbyUpdate);
    socket.on("startGame", handleStartGame);

    if (!socket.connected) socket.connect();

    socket.emit("joinLobby", {
      username: session.user?.name,
      category,
      matchId: generatedMatchId,
    });

    socket.emit("checkGameStatus", { category, matchId: generatedMatchId });

    return () => {
      socket.off("gameStatus", handleGameStatus);
      socket.off("lobbyUpdate", handleLobbyUpdate);
      socket.off("startGame", handleStartGame);
    };
  }, [status, session, category, router, gameStarted, incomingMatchId]);

  const handleStartGame = () => {
    const socket = getSocket();
    if (!matchId) return;
    socket.emit("startGame", { category, matchId });
    router.push(`/game?category=${encodeURIComponent(category)}&matchId=${matchId}`);
  };

  if (status === "loading") {
    return (
      <main className="min-h-screen flex justify-center items-center bg-gradient-to-b from-[#4EB8F2] to-[#0072CE]">
        <p className="text-white text-xl font-bold">Loading…</p>
      </main>
    );
  }

  if (status === "unauthenticated") {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    return null;
  }

  return (
    <main className="min-h-screen flex justify-center items-center bg-gradient-to-b from-[#4EB8F2] to-[#0072CE] p-4">
      <div className="max-w-md w-full text-center bg-white/10 backdrop-blur p-8 rounded-3xl border border-white/30 shadow-2xl">
        <h1 className="text-white text-3xl font-extrabold mb-4">Trivia Royale Lobby</h1>
        <p className="text-white mb-2">
          Category: <span className="font-bold">{category}</span>
        </p>
        <p className="text-white mb-4">Players joined: {players.length}</p>

        <div className="space-y-2 mb-4">
          {players.map((p, i) => (
            <div
              key={i}
              className={`px-4 py-2 rounded ${
                p === session?.user?.name
                  ? "bg-[#FFD930] text-[#003E7E] font-bold"
                  : "bg-white/20 text-white"
              }`}
            >
              {p}
            </div>
          ))}
        </div>

        <button
          onClick={handleStartGame}
          className="w-full py-3 rounded-lg bg-[#FFD930] hover:bg-[#FFC500] text-[#003E7E] text-lg font-extrabold uppercase shadow transition"
        >
          Start Game
        </button>
      </div>
    </main>
  );
}

export default function LobbyPageWrapper() {
  return (
    <SessionProvider>
      <Suspense
        fallback={
          <main className="min-h-screen flex items-center justify-center">
            <p>Loading…</p>
          </main>
        }
      >
        <LobbyPage />
      </Suspense>
    </SessionProvider>
  );
}
