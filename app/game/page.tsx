"use client";
import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { getSocket } from "@/lib/socket";
import { useSession, SessionProvider } from "next-auth/react";

// Types

type QuestionPayload = {
  category: string;
  question: string;
  answers: string[];
  timeLimit: number;
  startTime: number;
  matchId: string;
};

type AnswerResult = {
  correct: boolean;
};

type RoundResultPayload = {
  correctAnswer: string;
  eliminated: string[];
  survivors: string[];
};

function InnerGamePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get("category") || "Battle Royale";
  const matchId = searchParams.get("matchId");

  const [questionData, setQuestionData] = useState<QuestionPayload | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [eliminated, setEliminated] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [roundMessage, setRoundMessage] = useState<string | null>(null);
  const [gamePhase, setGamePhase] = useState<"question" | "intermission" | "eliminated" | "winner">("question");
  const [playersRemaining, setPlayersRemaining] = useState<number>(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name || !matchId) return;

    const username = session.user.name; // capture once

    const socket = getSocket();

    const handleConnect = () => {
      socket.emit("checkGameStatus", { category, matchId });
    };

    socket.on("connect", handleConnect);

    socket.on("gameStatus", (payload: any) => {
      if (payload.matchId !== matchId) return;
      if (payload.started && payload.question) {
        loadQuestion(payload.question);
      }
      if (payload.eliminated?.includes(username)) {
        setEliminated(true);
      }
    });

    socket.on("newQuestion", (data: QuestionPayload) => {
      if (data.matchId !== matchId) return;
      setRoundMessage(null);
      setGamePhase("question");
      loadQuestion(data);
    });

    socket.on("answerResult", (data: AnswerResult) => {
      if (!data.correct) {
        setEliminated(true);
      }
    });

    // ⬇️ explicit type for the destructured param
    socket.on("eliminated", ({ username: elimUser }: { username: string }) => {
      if (elimUser === username) {
        setEliminated(true);
      }
    });

    socket.on("roundResult", (payload: RoundResultPayload) => {
      setRoundMessage(
        `✅ Correct Answer: ${payload.correctAnswer}\n` +
          `❌ Eliminated: ${payload.eliminated.join(", ") || "None"}\n` +
          `👥 Remaining: ${payload.survivors.join(", ")}`
      );
    });

    socket.on("playersRemaining", ({ count }: { count: number }) => {
      setPlayersRemaining(count);
      setGamePhase("intermission");
    });

    socket.on("gameOver", (payload: { winner: string | null }) => {
      setWinner(payload.winner);
    });

    socket.on("error", (payload: { message: string }) => {
      alert(payload.message);
      router.push("/");
    });

    if (socket.connected) handleConnect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("gameStatus");
      socket.off("newQuestion");
      socket.off("answerResult");
      socket.off("roundResult");
      socket.off("playersRemaining");
      socket.off("gameOver");
      socket.off("playerEliminated");
      socket.off("error");

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [status, session, category, matchId, router]);

  const loadQuestion = (question: QuestionPayload) => {
    setQuestionData(question);
    setSelectedAnswer(null);
    setupTimer(question.startTime, question.timeLimit);
  };

  const setupTimer = (startTime: number, timeLimit: number) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    const questionEndTime = startTime + timeLimit * 1000;

    const updateTime = () => {
      const secondsLeft = Math.max(0, Math.floor((questionEndTime - Date.now()) / 1000));
      setTimeLeft(secondsLeft);

      if (secondsLeft <= 0) {
        clearInterval(timerRef.current!);
        handleTimeExpired();
      }
    };

    updateTime();
    timerRef.current = setInterval(updateTime, 1000);
  };

  const handleTimeExpired = () => {
    const socket = getSocket();
    socket.emit("answer", {
      username: session?.user?.name,
      answer: "__TIMEOUT__",
      category,
      matchId,
    });
  };

  const handleAnswerClick = (answer: string) => {
    if (!session?.user?.name || selectedAnswer || !matchId || timeLeft === null || timeLeft <= 0) return;

    const socket = getSocket();
    setSelectedAnswer(answer);
    if (timerRef.current) {
      clearInterval(timerRef.current);  // ✅ Stop the timeout emit
      timerRef.current = null;
    }

    console.log(`[Answer Submitted] ${session.user.name} → ${answer}, timeLeft=${timeLeft}`);

    socket.emit("answer", {
      username: session.user.name,
      answer,
      category,
      matchId,
    });
  };

  if (status === "loading") {
    return <main className="min-h-screen flex justify-center items-center bg-gradient-to-b from-[#4EB8F2] to-[#0072CE]">
      <p className="text-white text-xl font-bold">Loading…</p>
    </main>;
  }

  if (status === "unauthenticated") {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    return null;
  }

  if (eliminated) {
    return (
      <main className="min-h-screen flex justify-center items-center bg-gradient-to-b from-[#4EB8F2] to-[#0072CE] p-4">
        <div className="max-w-md w-full text-center bg-white/10 backdrop-blur p-8 rounded-3xl border border-white/30 shadow-2xl">
          <h1 className="text-white text-3xl font-extrabold mb-4">Eliminated!</h1>
          <p className="text-white mb-4">Sorry {session?.user?.name}, you were eliminated.</p>
          <button onClick={() => {
            localStorage.removeItem(`matchId_${category}`);
            router.push(`/lobby?category=${category}&new=1`);
          }}
            className="w-full py-3 rounded bg-yellow-400 hover:bg-yellow-300 text-[#003E7E] font-bold text-lg transition mt-4">
            🔁 Play Again
          </button>
          <button onClick={() => router.push("/")}
            className="w-full py-3 rounded bg-white/20 hover:bg-white/30 text-white font-bold text-lg transition mt-4">
            🏠 Return Home
          </button>
        </div>
      </main>
    );
  }

  if (winner) {
    return (
      <main className="min-h-screen flex justify-center items-center bg-gradient-to-b from-[#4EB8F2] to-[#0072CE] p-4">
        <div className="max-w-md w-full text-center bg-white/10 backdrop-blur p-8 rounded-3xl border border-white/30 shadow-2xl">
          <h1 className="text-yellow-300 text-3xl font-extrabold mb-4">🎉 We Have a Winner! 🎉</h1>
          <p className="text-white mb-4">
            {winner === session?.user?.name ? "You won Trivia Royale!" : `${winner} has won.`}
          </p>
          <button onClick={() => {
            localStorage.removeItem(`matchId_${category}`);
            router.push(`/lobby?category=${category}&new=1`);
          }}
            className="w-full py-3 rounded bg-yellow-400 hover:bg-yellow-300 text-[#003E7E] font-bold text-lg transition mt-4">
            🔁 Play Again
          </button>
          <button onClick={() => router.push("/")}
            className="w-full py-3 rounded bg-white/20 hover:bg-white/30 text-white font-bold text-lg transition mt-4">
            🏠 Return Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex justify-center items-center bg-gradient-to-b from-[#4EB8F2] to-[#0072CE] p-4">
      <div className="max-w-md w-full text-center bg-white/10 backdrop-blur p-8 rounded-3xl border border-white/30 shadow-2xl">
        <h1 className="text-white text-3xl font-extrabold mb-4">Trivia Royale Game</h1>
        <p className="text-white mb-2">
          Category: <span className="font-bold">{category}</span>
        </p>

        {timeLeft !== null && gamePhase === "question" && (
          <p className="text-yellow-300 font-extrabold text-xl mb-4">⏳ Time Left: {timeLeft}s</p>
        )}

        {roundMessage && (
          <p className="text-green-300 whitespace-pre-line mb-4">{roundMessage}</p>
        )}

        {gamePhase === "intermission" ? (
          <div>
            <h2 className="text-white text-2xl font-bold mb-4">🧠 Get Ready!</h2>
            <p className="text-yellow-300 text-lg font-semibold">{playersRemaining} players remaining</p>
            <p className="text-white mt-2">Next question starting shortly…</p>
          </div>
        ) : questionData ? (
          <>
            <h2 className="text-white text-2xl font-bold mb-6">{questionData.question}</h2>
            <div className="space-y-3">
              {questionData.answers.map((ans, idx) => (
                <button key={idx} onClick={() => handleAnswerClick(ans)} disabled={!!selectedAnswer}
                  className={`w-full py-3 rounded ${selectedAnswer === ans
                    ? "bg-green-400 text-[#003E7E] font-bold"
                    : "bg-yellow-400 hover:bg-yellow-300 text-[#003E7E]"
                    } text-lg font-bold transition`}>
                  {ans}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-white mt-6">Waiting for the first question…</p>
        )}
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";

export default function GamePage() {
  return (
    <SessionProvider>
      <Suspense
        fallback={
          <main className="min-h-screen flex justify-center items-center bg-gradient-to-b from-[#4EB8F2] to-[#0072CE]">
            <p className="text-white text-xl font-bold">Loading…</p>
          </main>
        }
      >
        <InnerGamePage />
      </Suspense>
    </SessionProvider>
  );
}
