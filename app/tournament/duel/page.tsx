"use client";

import { ArenaShell, arenaPanelClass } from "@/components/arena/ArenaShell";
import { getSocket } from "@/lib/socket";
import { SessionProvider, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

type TournamentPlayer = {
  id: string;
  displayName: string;
  kind: "human" | "bot";
  status: "queued" | "matched" | "eliminated" | "champion";
  round: number;
  wins: number;
};

type DuelQuestion = {
  duelId: string;
  questionId: string;
  category: string;
  question: string;
  answers: string[];
  timeLimit: number;
  questionNumber: number;
  questionCount: number;
  startTime: number;
};

type Score = {
  playerId: string;
  correctAnswers: number;
  score: number;
  totalResponseMs: number;
};

type DuelResult = {
  winner: TournamentPlayer;
  loser: TournamentPlayer;
  scores: Score[];
  tournament: { remainingPlayers: number; round: number };
};

const labels = ["A", "B", "C", "D"];

function TournamentDuelPageInner() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const duelId = searchParams.get("duelId") || "";
  const displayName = session?.user?.name || session?.user?.email?.split("@")[0] || "Player";
  const playerId = useMemo(
    () => session?.user?.email || `player:${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    [session?.user?.email, displayName],
  );

  const [question, setQuestion] = useState<DuelQuestion | null>(null);
  const [player, setPlayer] = useState<TournamentPlayer | null>(null);
  const [opponent, setOpponent] = useState<TournamentPlayer | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerLocked, setAnswerLocked] = useState(false);
  const [timeLeft, setTimeLeft] = useState(12);
  const [roundResult, setRoundResult] = useState<{
    correctAnswer: string;
    explanation?: string;
  } | null>(null);
  const [duelResult, setDuelResult] = useState<DuelResult | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !duelId) return;
    const socket = getSocket();

    const stopTimer = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };

    const startTimer = (payload: DuelQuestion) => {
      stopTimer();
      const end = payload.startTime + payload.timeLimit * 1000;
      const update = () => {
        const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) stopTimer();
      };
      update();
      timerRef.current = setInterval(update, 250);
    };

    const begin = () => {
      setConnected(true);
      socket.emit("joinTournament", { playerId, displayName });
      socket.emit("startTournamentDuel", { duelId });
    };

    const handleReady = (payload: {
      player: TournamentPlayer;
      opponent: TournamentPlayer;
    }) => {
      setPlayer(payload.player);
      setOpponent(payload.opponent);
    };

    const handleQuestion = (payload: DuelQuestion) => {
      if (payload.duelId !== duelId) return;
      setQuestion(payload);
      setSelectedAnswer(null);
      setAnswerLocked(false);
      setRoundResult(null);
      setError(null);
      startTimer(payload);
    };

    const handleState = (payload: {
      duelId: string;
      question: DuelQuestion;
      scores: Score[];
    }) => {
      if (payload.duelId !== duelId) return;
      setQuestion(payload.question);
      setScores(payload.scores);
      startTimer(payload.question);
    };

    const handleScore = (payload: { duelId: string; scores: Score[] }) => {
      if (payload.duelId === duelId) setScores(payload.scores);
    };

    const handleAnswerAccepted = (payload: {
      duelId: string;
      questionId: string;
      accepted: boolean;
    }) => {
      if (payload.duelId === duelId && payload.questionId === question?.questionId) {
        setAnswerLocked(payload.accepted || answerLocked);
      }
    };

    const handleQuestionResult = (payload: {
      duelId: string;
      correctAnswer: string;
      explanation?: string;
      scores: Score[];
    }) => {
      if (payload.duelId !== duelId) return;
      stopTimer();
      setScores(payload.scores);
      setRoundResult({
        correctAnswer: payload.correctAnswer,
        explanation: payload.explanation,
      });
    };

    const handleCompleted = (payload: DuelResult & { duel: { id: string } }) => {
      if (payload.duel.id !== duelId) return;
      stopTimer();
      setDuelResult(payload);
      setScores(payload.scores);
    };

    const handleError = ({ message }: { message: string }) => setError(message);
    const handleDisconnect = () => setConnected(false);

    socket.on("connect", begin);
    socket.on("disconnect", handleDisconnect);
    socket.on("tournamentDuelReady", handleReady);
    socket.on("tournamentQuestion", handleQuestion);
    socket.on("tournamentDuelState", handleState);
    socket.on("tournamentScoreUpdate", handleScore);
    socket.on("tournamentAnswerAccepted", handleAnswerAccepted);
    socket.on("tournamentQuestionResult", handleQuestionResult);
    socket.on("tournamentDuelCompleted", handleCompleted);
    socket.on("tournamentError", handleError);

    if (socket.connected) begin();
    else socket.connect();

    return () => {
      stopTimer();
      socket.off("connect", begin);
      socket.off("disconnect", handleDisconnect);
      socket.off("tournamentDuelReady", handleReady);
      socket.off("tournamentQuestion", handleQuestion);
      socket.off("tournamentDuelState", handleState);
      socket.off("tournamentScoreUpdate", handleScore);
      socket.off("tournamentAnswerAccepted", handleAnswerAccepted);
      socket.off("tournamentQuestionResult", handleQuestionResult);
      socket.off("tournamentDuelCompleted", handleCompleted);
      socket.off("tournamentError", handleError);
    };
  }, [status, duelId, playerId, displayName, question?.questionId, answerLocked]);

  const submitAnswer = (answer: string) => {
    if (!question || selectedAnswer || timeLeft <= 0 || roundResult || duelResult) return;
    setSelectedAnswer(answer);
    getSocket().emit("submitTournamentAnswer", {
      duelId,
      questionId: question.questionId,
      answer,
    });
  };

  if (status === "loading") return <Loading label="Loading duel…" />;
  if (status === "unauthenticated") {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  const playerScore = scores.find((score) => score.playerId === playerId);
  const opponentScore = scores.find((score) => score.playerId !== playerId);
  const progress = question ? (timeLeft / question.timeLimit) * 100 : 0;

  if (duelResult) {
    const won = duelResult.winner.id === playerId;
    return (
      <ArenaShell>
        <section className={`${arenaPanelClass} mx-auto max-w-3xl p-8 text-center sm:p-12`}>
          <p className={`text-xs font-black uppercase tracking-[0.28em] ${won ? "text-emerald-300" : "text-red-300"}`}>
            {won ? "DUEL WON" : "TOURNAMENT RUN ENDED"}
          </p>
          <h1 className="mt-4 text-5xl font-black">{won ? "You advance" : "Eliminated"}</h1>
          <p className="mt-4 text-lg text-slate-300">
            {won
              ? `${duelResult.tournament.remainingPlayers.toLocaleString()} players remain. Your next opponent is being prepared.`
              : `${duelResult.winner.displayName} won this duel.`}
          </p>
          <div className="mx-auto mt-8 grid max-w-lg grid-cols-2 gap-4">
            <Stat label="Your score" value={(playerScore?.score ?? 0).toLocaleString()} />
            <Stat label="Correct" value={`${playerScore?.correctAnswers ?? 0} / 3`} />
          </div>
          <button
            onClick={() => router.push("/tournament")}
            className="mt-8 rounded-2xl bg-cyan-400 px-8 py-4 text-lg font-black text-[#03101f] transition hover:bg-cyan-300"
          >
            {won ? "Find next opponent" : "View tournament"}
          </button>
        </section>
      </ArenaShell>
    );
  }

  return (
    <ArenaShell>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#081426]/85 px-5 py-4 backdrop-blur-xl">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Tournament duel</p>
          <h1 className="mt-1 text-2xl font-black">Round {player?.round ?? 1}</h1>
        </div>
        <span className={`rounded-full border px-3 py-2 text-sm font-bold ${connected ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}>
          {connected ? "Live" : "Reconnecting"}
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className={`${arenaPanelClass} p-6 sm:p-8`}>
          {error ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">Duel error</p>
              <h2 className="mt-3 text-3xl font-black">Unable to continue</h2>
              <p className="mt-3 max-w-md text-slate-300">{error}</p>
              <button onClick={() => router.push("/tournament")} className="mt-7 rounded-xl bg-cyan-400 px-6 py-3 font-black text-[#03101f]">
                Return to tournament
              </button>
            </div>
          ) : roundResult ? (
            <div className="flex min-h-[520px] flex-col justify-center text-center">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Question complete</p>
              <h2 className="mt-4 text-4xl font-black">{roundResult.correctAnswer}</h2>
              {roundResult.explanation && <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">{roundResult.explanation}</p>}
              <p className="mt-8 font-bold text-cyan-200">Preparing the next question…</p>
            </div>
          ) : question ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                  Question {question.questionNumber} of {question.questionCount}
                </span>
                <span className={`text-3xl font-black ${timeLeft <= 4 ? "text-red-300" : "text-cyan-300"}`}>{timeLeft}s</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full transition-[width] ${timeLeft <= 4 ? "bg-red-400" : "bg-cyan-400"}`} style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-8 text-xs font-black uppercase tracking-[0.24em] text-white/40">{question.category}</p>
              <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">{question.question}</h2>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {question.answers.map((answer, index) => (
                  <button
                    key={answer}
                    onClick={() => submitAnswer(answer)}
                    disabled={!!selectedAnswer || timeLeft <= 0}
                    className={`flex min-h-24 items-center gap-4 rounded-2xl border p-5 text-left font-bold transition ${selectedAnswer === answer ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.035] hover:border-white/25 hover:bg-white/[0.07] disabled:opacity-60"}`}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-cyan-200">{labels[index]}</span>
                    <span>{answer}</span>
                  </button>
                ))}
              </div>
              {selectedAnswer && <p className="mt-5 text-center text-sm font-bold text-cyan-200">{answerLocked ? "Answer locked in" : "Submitting answer…"}</p>}
            </>
          ) : (
            <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
              <div className="h-14 w-14 animate-spin rounded-full border-4 border-white/10 border-t-cyan-300" />
              <h2 className="mt-6 text-2xl font-black">Preparing three questions</h2>
              <p className="mt-2 text-slate-400">Both competitors receive the same server-controlled duel.</p>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className={`${arenaPanelClass} p-5`}>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Scoreboard</p>
            <ScoreRow name={displayName} score={playerScore?.score ?? 0} correct={playerScore?.correctAnswers ?? 0} highlight />
            <ScoreRow name={opponent?.displayName || "Opponent"} score={opponentScore?.score ?? 0} correct={opponentScore?.correctAnswers ?? 0} />
          </div>
          <div className={`${arenaPanelClass} p-5`}>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Scoring</p>
            <p className="mt-4 text-sm leading-6 text-slate-300">Correct answers earn 1,000 points plus up to 500 speed points. Highest total after three questions advances.</p>
          </div>
        </aside>
      </div>
    </ArenaShell>
  );
}

function ScoreRow({ name, score, correct, highlight = false }: { name: string; score: number; correct: number; highlight?: boolean }) {
  return (
    <div className={`mt-4 rounded-2xl border p-4 ${highlight ? "border-cyan-300/30 bg-cyan-300/10" : "border-white/10 bg-white/[0.035]"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="truncate font-black">{name}</p>
        <p className="font-black text-cyan-200">{score.toLocaleString()}</p>
      </div>
      <p className="mt-1 text-xs text-slate-400">{correct} correct</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.15em] text-slate-500">{label}</p>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <main className="arena-shell flex min-h-screen items-center justify-center text-white">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-cyan-300" />
        <p className="mt-4 font-bold">{label}</p>
      </div>
    </main>
  );
}

export default function TournamentDuelPage() {
  return (
    <SessionProvider>
      <Suspense fallback={<Loading label="Loading duel…" />}>
        <TournamentDuelPageInner />
      </Suspense>
    </SessionProvider>
  );
}
