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
  host?: string;
};

type GameStatusPayload = {
  matchId: string;
  category?: string;
  started: boolean;
  question?: any;
};

export const dynamic = "force-dynamic";

function LobbyPageInner() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  const category = searchParams.get("category") || "Battle Royale";
  const incomingMatchId = searchParams.get("matchId");

  const [players, setPlayers] = useState<string[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [matchId, setMatchId] = useState<string>("");

  // Stable username fallback so joinLobby never no-ops
  const username = useMemo(() => {
    return (
      session?.user?.name ||
      session?.user?.email?.split("@")[0] ||
      `Player_${Math.random().toString(36).slice(2, 6)}`
    );
  }, [session?.user?.name, session?.user?.email]);

  // Stable matchId for this lobby view
  const generatedMatchId = useMemo(
    () => incomingMatchId || uuidv4(),
    [incomingMatchId]
  );

  useEffect(() => {
    if (status !== "authenticated") return;

    const socket = getSocket();
    setMatchId(generatedMatchId);

    const handleGameStatus = (payload: GameStatusPayload) => {
      if (payload.matchId !== generatedMatchId) return;
      if (payload.started && !gameStarted) {
        setGameStarted(true);
        router.push(
          `/game?category=${encodeURIComponent(category)}&matchId=${generatedMatchId}`
        );
      }
    };

    const handleLobbyUpdate = (data: LobbyUpdate) => {
      // Key the lobby strictly by matchId (server includes category too, but it's not required)
      if (data.matchId === generatedMatchId) {
        setPlayers(data.players);
      }
    };

    const onStartGameEvent = (data: { category: string; matchId: string }) => {
      if (data.matchId === generatedMatchId && !gameStarted) {
        setGameStarted(true);
        router.push(
          `/game?category=${encodeURIComponent(category)}&matchId=${generatedMatchId}`
        );
      }
    };

    socket.on("gameStatus", handleGameStatus);
    socket.on("lobbyUpdate", handleLobbyUpdate);
    socket.on("startGame", onStartGameEvent);

    if (!socket.connected) socket.connect();

    // Ensure we emit after the socket is actually connected
    const onConnect = () => {
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
    socket.once("connect", onConnect);

    return () => {
      socket.off("gameStatus", handleGameStatus);
      socket.off("lobbyUpdate", handleLobbyUpdate);
      socket.off("startGame", onStartGameEvent);
      socket.off("connect", onConnect);
      // (We keep the socket connected across pages so the game screen reuses it.)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, username, category, generatedMatchId, router, gameStarted]);

  const handleStartGameClick = () => {
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
                p === username
                  ? "bg-[#FFD930] text-[#003E7E] font-bold"
                  : "bg-white/20 text-white"
              }`}
            >
              {p}
            </div>
          ))}
        </div>

        <button
          onClick={handleStartGameClick}
          className="w-full py-3 rounded-lg bg-[#FFD930] hover:bg-[#FFC500] text-[#003E7E] text-lg font-extrabold uppercase shadow transition"
        >
          Start Game
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
