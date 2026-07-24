"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { useSession, SessionProvider } from "next-auth/react";

type QuestionPayload = {
  category: string;
  question: string;
  answers: string[];
  difficulty?: "easy" | "medium" | "hard";
  timeLimit: number;
  startTime: number;
  matchId: string;
};

type RoundResultPayload = {
  correctAnswer: string;
  explanation?: string;
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
  const [gameFinished, setGameFinished] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResultPayload | null>(null);
  const [playersRemaining, setPlayersRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const setupTimer = (startTime: number, timeLimit: number) => {
    stopTimer();
    const questionEndTime = startTime + timeLimit * 1000;

    const updateTime = () => {
      const secondsLeft = Math.max(
        0,
        Math.ceil((questionEndTime - Date.now()) / 1000),
      );
      setTimeLeft(secondsLeft);
      if (secondsLeft <= 0) stopTimer();
    };

    updateTime();
    timerRef.current = setInterval(updateTime, 250);
  };

  const loadQuestion = (question: QuestionPayload) => {
    setQuestionData(question);
    setSelectedAnswer(null);
    setRoundResult(null);
    setPlayersRemaining(null);
    setupTimer(question.startTime, question.timeLimit);
  };

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name || !matchId) return;

    const username = session.user.name;
    const socket = getSocket();

    const checkStatus = () => {
      socket.emit("checkGameStatus", { category, matchId });
    };

    const handleGameStatus = (payload: {
      matchId: string;
      started: boolean;
      question?: QuestionPayload | null;
      eliminated?: string[];
    }) => {
      if (payload.matchId !== matchId) return;
      if (payload.started && payload.question) loadQuestion(payload.question);
      if (payload.eliminated?.includes(username)) setEliminated(true);
    };

    const handleNewQuestion = (question: QuestionPayload) => {
      if (question.matchId !== matchId) return;
      setError(null);
      loadQuestion(question);
    };

    const handleEliminated = ({ username: eliminatedUser }: { username: string }) => {
      if (eliminatedUser === username) {
        stopTimer();
        setEliminated(true);
      }
    };

    const handleRoundResult = (payload: RoundResultPayload) => {
      stopTimer();
      setTimeLeft(0);
      setRoundResult(payload);
    };

    const handlePlayersRemaining = ({ count }: { count: number }) => {
      setPlayersRemaining(count);
    };

    const handleGameOver = ({ winner: gameWinner }: { winner: string | null }) => {
      stopTimer();
      setGameFinished(true);
      setWinner(gameWinner);
    };

    const handleGameError = ({ message }: { message: string }) => {
      stopTimer();
      setError(message);
    };

    socket.on("connect", checkStatus);
    socket.on("gameStatus", handleGameStatus);
    socket.on("newQuestion", handleNewQuestion);
    socket.on("eliminated", handleEliminated);
    socket.on("roundResult", handleRoundResult);
    socket.on("playersRemaining", handlePlayersRemaining);
    socket.on("gameOver", handleGameOver);
    socket.on("gameError", handleGameError);

    if (socket.connected) checkStatus();
    else socket.connect();

    return () => {
      socket.off("connect", checkStatus);
      socket.off("gameStatus", handleGameStatus);
      socket.off("newQuestion", handleNewQuestion);
      socket.off("eliminated", handleEliminated);
      socket.off("roundResult", handleRoundResult);
      socket.off("playersRemaining", handlePlayersRemaining);
      socket.off("gameOver", handleGameOver);
      socket.off("gameError", handleGameError);
      stopTimer();
    };
  }, [status, session?.user?.name, category, matchId]);

  const submitAnswer = (answer: string) => {
    if (
      !selectedAnswer &&
      matchId &&
      timeLeft !== null &&
      timeLeft > 0 &&
      !roundResult
    ) {
      setSelectedAnswer(answer);
      getSocket().emit("answer", { answer });
    }
  };

  const playAgain = () => {
    router.push(`/lobby?category=${encodeURIComponent(category)}&new=1`);
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

  if (eliminated) {
    return (
      <ResultCard
        title="Eliminated!"
        message={`Sorry ${session?.user?.name}, you were eliminated.`}
        onPlayAgain={playAgain}
        onHome={() => router.push("/")}
      />
    );
  }

  if (gameFinished) {
    const message = winner
      ? winner === session?.user?.name
        ? "You won Trivia Royale!"
        : `${winner} won the match.`
      : "No player survived the final round.";

    return (
      <ResultCard
        title={winner ? "🎉 We Have a Winner!" : "Match Over"}
        message={message}
        onPlayAgain={playAgain}
        onHome={() => router.push("/")}
      />
    );
  }

  return (
    <main className="min-h-screen flex justify-center items-center bg-gradient-to-b from-[#4EB8F2] to-[#0072CE] p-4">
      <div className="max-w-md w-full text-center bg-white/10 backdrop-blur p-8 rounded-3xl border border-white/30 shadow-2xl">
        <h1 className="text-white text-3xl font-extrabold mb-3">
          Trivia Royale
        </h1>
        <p className="text-white mb-3">
          Category: <span className="font-bold">{questionData?.category || category}</span>
          {questionData?.difficulty ? (
            <span className="ml-2 text-sm capitalize text-yellow-200">
              · {questionData.difficulty}
            </span>
          ) : null}
        </p>

        {error && (
          <div className="mb-5 rounded-lg bg-red-500/20 p-4 text-red-100">
            <p className="font-bold">Match error</p>
            <p className="mt-1 text-sm">{error}</p>
            <button
              onClick={playAgain}
              className="mt-4 rounded bg-white px-4 py-2 font-bold text-[#003E7E]"
            >
              Return to Lobby
            </button>
          </div>
        )}

        {!error && roundResult ? (
          <div className="rounded-xl bg-white/10 p-5 text-left">
            <p className="text-lg font-extrabold text-green-300">
              Correct answer: {roundResult.correctAnswer}
            </p>
            {roundResult.explanation && (
              <p className="mt-2 text-sm leading-relaxed text-white">
                {roundResult.explanation}
              </p>
            )}
            <p className="mt-4 text-sm text-red-200">
              Eliminated: {roundResult.eliminated.join(", ") || "None"}
            </p>
            <p className="mt-1 text-sm text-yellow-100">
              {playersRemaining ?? roundResult.survivors.length} players remaining
            </p>
            <p className="mt-4 text-center font-semibold text-white">
              Next question starting shortly…
            </p>
          </div>
        ) : !error && questionData ? (
          <>
            <p className="text-yellow-300 font-extrabold text-xl mb-4">
              ⏳ {timeLeft ?? questionData.timeLimit}s
            </p>
            <h2 className="text-white text-2xl font-bold mb-6">
              {questionData.question}
            </h2>
            <div className="space-y-3">
              {questionData.answers.map((answer) => (
                <button
                  key={answer}
                  onClick={() => submitAnswer(answer)}
                  disabled={
                    !!selectedAnswer ||
                    timeLeft === null ||
                    timeLeft <= 0
                  }
                  className={`w-full py-3 rounded text-lg font-bold transition disabled:cursor-not-allowed ${
                    selectedAnswer === answer
                      ? "bg-green-400 text-[#003E7E]"
                      : "bg-yellow-400 hover:bg-yellow-300 disabled:bg-white/20 disabled:text-white/70 text-[#003E7E]"
                  }`}
                >
                  {answer}
                </button>
              ))}
            </div>
            {selectedAnswer && (
              <p className="mt-4 text-sm font-semibold text-white">
                Answer locked in. Waiting for the round to end…
              </p>
            )}
          </>
        ) : !error ? (
          <p className="text-white mt-6">Loading the first question…</p>
        ) : null}
      </div>
    </main>
  );
}

function ResultCard({
  title,
  message,
  onPlayAgain,
  onHome,
}: {
  title: string;
  message: string;
  onPlayAgain: () => void;
  onHome: () => void;
}) {
  return (
    <main className="min-h-screen flex justify-center items-center bg-gradient-to-b from-[#4EB8F2] to-[#0072CE] p-4">
      <div className="max-w-md w-full text-center bg-white/10 backdrop-blur p-8 rounded-3xl border border-white/30 shadow-2xl">
        <h1 className="text-yellow-300 text-3xl font-extrabold mb-4">{title}</h1>
        <p className="text-white mb-4">{message}</p>
        <button
          onClick={onPlayAgain}
          className="w-full py-3 rounded bg-yellow-400 hover:bg-yellow-300 text-[#003E7E] font-bold text-lg transition mt-4"
        >
          🔁 Play Again
        </button>
        <button
          onClick={onHome}
          className="w-full py-3 rounded bg-white/20 hover:bg-white/30 text-white font-bold text-lg transition mt-4"
        >
          🏠 Return Home
        </button>
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
