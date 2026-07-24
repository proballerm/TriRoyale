"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { useSession, SessionProvider } from "next-auth/react";

type QuestionPayload = {
  questionId: string;
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

const answerLabels = ["A", "B", "C", "D"];

function InnerGamePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get("category") || "Battle Royale";
  const matchId = searchParams.get("matchId");

  const username = useMemo(
    () => session?.user?.name || session?.user?.email?.split("@")[0] || "Player",
    [session?.user?.name, session?.user?.email],
  );

  const [questionData, setQuestionData] = useState<QuestionPayload | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerConfirmed, setAnswerConfirmed] = useState(false);
  const [eliminated, setEliminated] = useState(false);
  const [gameFinished, setGameFinished] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResultPayload | null>(null);
  const [playersRemaining, setPlayersRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnected, setReconnected] = useState(false);

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
      const secondsLeft = Math.max(0, Math.ceil((questionEndTime - Date.now()) / 1000));
      setTimeLeft(secondsLeft);
      if (secondsLeft <= 0) stopTimer();
    };

    updateTime();
    timerRef.current = setInterval(updateTime, 250);
  };

  const loadQuestion = (question: QuestionPayload) => {
    setQuestionData(question);
    setSelectedAnswer(null);
    setAnswerConfirmed(false);
    setRoundResult(null);
    setPlayersRemaining(null);
    setupTimer(question.startTime, question.timeLimit);
  };

  useEffect(() => {
    if (status !== "authenticated" || !matchId) return;

    const socket = getSocket();
    const resume = () => {
      setConnected(true);
      socket.emit("resumeMatch", { username, category, matchId });
    };

    const handleDisconnect = () => setConnected(false);

    const handleGameStatus = (payload: {
      matchId: string;
      started: boolean;
      question?: QuestionPayload | null;
      eliminated?: string[];
      reconnected?: boolean;
    }) => {
      if (payload.matchId !== matchId) return;
      if (payload.started && payload.question) loadQuestion(payload.question);
      if (payload.eliminated?.includes(username)) setEliminated(true);
      if (payload.reconnected) {
        setReconnected(true);
        window.setTimeout(() => setReconnected(false), 3000);
      }
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

    const handlePlayersRemaining = ({ count }: { count: number }) => setPlayersRemaining(count);

    const handleGameOver = ({ winner: gameWinner }: { winner: string | null }) => {
      stopTimer();
      setGameFinished(true);
      setWinner(gameWinner);
    };

    const handleGameError = ({ message }: { message: string }) => {
      stopTimer();
      setError(message);
    };

    const handleAnswerAccepted = ({ questionId }: { questionId: string }) => {
      if (questionId === questionData?.questionId) setAnswerConfirmed(true);
    };

    socket.on("connect", resume);
    socket.on("disconnect", handleDisconnect);
    socket.on("gameStatus", handleGameStatus);
    socket.on("newQuestion", handleNewQuestion);
    socket.on("eliminated", handleEliminated);
    socket.on("roundResult", handleRoundResult);
    socket.on("playersRemaining", handlePlayersRemaining);
    socket.on("gameOver", handleGameOver);
    socket.on("gameError", handleGameError);
    socket.on("answerAccepted", handleAnswerAccepted);

    if (socket.connected) resume();
    else socket.connect();

    return () => {
      socket.off("connect", resume);
      socket.off("disconnect", handleDisconnect);
      socket.off("gameStatus", handleGameStatus);
      socket.off("newQuestion", handleNewQuestion);
      socket.off("eliminated", handleEliminated);
      socket.off("roundResult", handleRoundResult);
      socket.off("playersRemaining", handlePlayersRemaining);
      socket.off("gameOver", handleGameOver);
      socket.off("gameError", handleGameError);
      socket.off("answerAccepted", handleAnswerAccepted);
      stopTimer();
    };
  }, [status, username, category, matchId, questionData?.questionId]);

  const submitAnswer = (answer: string) => {
    if (
      selectedAnswer ||
      !matchId ||
      !questionData ||
      timeLeft === null ||
      timeLeft <= 0 ||
      roundResult
    ) return;

    setSelectedAnswer(answer);
    getSocket().emit("answer", {
      answer,
      questionId: questionData.questionId,
    });
  };

  const playAgain = () => router.push(`/lobby?category=${encodeURIComponent(category)}&new=1`);

  if (status === "loading") return <ArenaLoading label="Entering match…" />;

  if (status === "unauthenticated") {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  if (eliminated) {
    return (
      <ResultCard
        eyebrow="RUN ENDED"
        title="Eliminated"
        message={`Good run, ${username}. Queue up again and take back the arena.`}
        onPlayAgain={playAgain}
        onHome={() => router.push("/")}
      />
    );
  }

  if (gameFinished) {
    const message = winner
      ? winner === username
        ? "You outlasted every challenger and claimed the crown."
        : `${winner} claimed this match.`
      : "No player survived the final round.";

    return (
      <ResultCard
        eyebrow={winner === username ? "VICTORY" : "MATCH COMPLETE"}
        title={winner === username ? "Arena Champion" : "Final Results"}
        message={message}
        onPlayAgain={playAgain}
        onHome={() => router.push("/")}
      />
    );
  }

  const progress = questionData && timeLeft !== null
    ? Math.max(0, Math.min(100, (timeLeft / questionData.timeLimit) * 100))
    : 0;
  const urgent = (timeLeft ?? 99) <= 5;

  return (
    <main className="arena-shell min-h-screen px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#081426]/85 px-5 py-4 backdrop-blur-xl">
          <div>
            <p className="text-xs font-bold tracking-[0.3em] text-cyan-300">TRIROYALE LIVE</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">{questionData?.category || category}</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${connected ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
              {connected ? "Connected" : "Reconnecting"}
            </span>
            {playersRemaining !== null && (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200">
                {playersRemaining} alive
              </span>
            )}
          </div>
        </header>

        {reconnected && (
          <div className="mb-5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100">
            Session restored. You are back in the match.
          </div>
        )}

        <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_300px]">
          <section className="rounded-3xl border border-white/10 bg-[#081426]/90 p-5 shadow-2xl backdrop-blur-xl sm:p-8">
            {error ? (
              <div className="flex h-full min-h-[460px] flex-col items-center justify-center text-center">
                <p className="text-sm font-bold tracking-[0.25em] text-red-300">MATCH ERROR</p>
                <h2 className="mt-3 text-3xl font-black">Connection interrupted</h2>
                <p className="mt-3 max-w-md text-slate-300">{error}</p>
                <button onClick={playAgain} className="mt-7 rounded-xl bg-cyan-400 px-6 py-3 font-black text-[#03101f] transition hover:bg-cyan-300">
                  Return to lobby
                </button>
              </div>
            ) : roundResult ? (
              <div className="flex min-h-[460px] flex-col justify-center">
                <p className="text-sm font-bold tracking-[0.25em] text-emerald-300">ROUND COMPLETE</p>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">{roundResult.correctAnswer}</h2>
                {roundResult.explanation && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">{roundResult.explanation}</p>}
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                    <p className="text-xs font-bold tracking-widest text-emerald-300">SURVIVORS</p>
                    <p className="mt-2 text-2xl font-black">{roundResult.survivors.length}</p>
                  </div>
                  <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4">
                    <p className="text-xs font-bold tracking-widest text-red-300">ELIMINATED</p>
                    <p className="mt-2 text-2xl font-black">{roundResult.eliminated.length}</p>
                  </div>
                </div>
                <p className="mt-8 text-sm font-semibold text-cyan-200">Preparing the next challenge…</p>
              </div>
            ) : questionData ? (
              <>
                <div className="mb-7">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-widest text-slate-300">
                      {questionData.difficulty || "standard"}
                    </span>
                    <span className={`text-3xl font-black tabular-nums ${urgent ? "text-red-300" : "text-cyan-300"}`}>
                      {timeLeft ?? questionData.timeLimit}s
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full transition-[width] duration-200 ${urgent ? "bg-red-400" : "bg-cyan-400"}`} style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <h2 className="max-w-4xl text-2xl font-black leading-tight sm:text-4xl">{questionData.question}</h2>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {questionData.answers.map((answer, index) => {
                    const isSelected = selectedAnswer === answer;
                    return (
                      <button
                        key={`${questionData.questionId}-${answer}`}
                        onClick={() => submitAnswer(answer)}
                        disabled={!!selectedAnswer || timeLeft === null || timeLeft <= 0}
                        className={`group flex min-h-24 items-center gap-4 rounded-2xl border p-4 text-left transition duration-200 disabled:cursor-not-allowed ${isSelected ? "border-cyan-300 bg-cyan-300 text-[#03101f] shadow-[0_0_35px_rgba(34,211,238,0.25)]" : "border-white/10 bg-white/[0.04] hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-cyan-300/10 disabled:hover:translate-y-0"}`}
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-black ${isSelected ? "border-[#03101f]/20 bg-[#03101f]/10" : "border-white/15 bg-white/5 text-cyan-300"}`}>
                          {answerLabels[index]}
                        </span>
                        <span className="font-bold leading-snug">{answer}</span>
                      </button>
                    );
                  })}
                </div>

                {selectedAnswer && (
                  <div className="mt-6 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                    <span className={`h-2.5 w-2.5 rounded-full ${answerConfirmed ? "bg-emerald-400" : "bg-cyan-300 animate-pulse"}`} />
                    {answerConfirmed ? "Answer confirmed by the server" : "Locking answer with the server…"}
                  </div>
                )}
              </>
            ) : (
              <div className="flex min-h-[460px] items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-cyan-300" />
                  <p className="mt-5 font-semibold text-slate-300">Generating your first question…</p>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#081426]/90 p-5 backdrop-blur-xl">
              <p className="text-xs font-bold tracking-[0.22em] text-slate-400">PLAYER</p>
              <p className="mt-2 truncate text-xl font-black">{username}</p>
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-sm">
                <span className="text-slate-400">Status</span>
                <span className="font-bold text-emerald-300">Alive</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#081426]/90 p-5 backdrop-blur-xl">
              <p className="text-xs font-bold tracking-[0.22em] text-slate-400">MATCH ID</p>
              <p className="mt-2 break-all font-mono text-sm text-cyan-200">{matchId}</p>
            </div>
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-5 text-sm leading-relaxed text-cyan-100">
              Answers are validated by the server. Late and duplicate submissions are automatically rejected.
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ArenaLoading({ label }: { label: string }) {
  return (
    <main className="arena-shell min-h-screen flex items-center justify-center text-white">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-cyan-300" />
        <p className="mt-5 font-bold">{label}</p>
      </div>
    </main>
  );
}

function ResultCard({ eyebrow, title, message, onPlayAgain, onHome }: { eyebrow: string; title: string; message: string; onPlayAgain: () => void; onHome: () => void }) {
  return (
    <main className="arena-shell min-h-screen flex items-center justify-center p-4 text-white">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#081426]/95 p-8 text-center shadow-2xl backdrop-blur-xl sm:p-12">
        <p className="text-xs font-black tracking-[0.3em] text-cyan-300">{eyebrow}</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
        <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-slate-300">{message}</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button onClick={onPlayAgain} className="rounded-xl bg-cyan-400 px-5 py-3 font-black text-[#03101f] transition hover:bg-cyan-300">Play again</button>
          <button onClick={onHome} className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-black transition hover:bg-white/10">Return home</button>
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";

export default function GamePage() {
  return (
    <SessionProvider>
      <Suspense fallback={<ArenaLoading label="Loading arena…" />}>
        <InnerGamePage />
      </Suspense>
    </SessionProvider>
  );
}
