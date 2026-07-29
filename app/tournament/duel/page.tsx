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
  lobbyId?: string;
  duel: { id: string; round?: number };
  winner: TournamentPlayer;
  loser: TournamentPlayer;
  scores: Score[];
  tournament: { remainingPlayers: number; round: number };
};

type MatchFound = {
  lobbyId?: string;
  duel: { id: string; round: number; questionCount: number };
  player: TournamentPlayer;
  opponent: TournamentPlayer;
};

const labels = ["A", "B", "C", "D"];
const RESULT_REVEAL_DELAY_MS = 900;
const NEXT_DUEL_DELAY_SECONDS = 7;

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
  const [roundResult, setRoundResult] = useState<{ correctAnswer: string; explanation?: string } | null>(null);
  const [duelResult, setDuelResult] = useState<DuelResult | null>(null);
  const [showFinalResult, setShowFinalResult] = useState(false);
  const [displayedRemaining, setDisplayedRemaining] = useState<number | null>(null);
  const [nextMatch, setNextMatch] = useState<MatchFound | null>(null);
  const [nextDuelCountdown, setNextDuelCountdown] = useState(NEXT_DUEL_DELAY_SECONDS);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionIdRef = useRef<string | null>(null);

  useEffect(() => {
    questionIdRef.current = question?.questionId ?? null;
  }, [question?.questionId]);

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
      socket.emit("startTournamentDuel", { duelId });
    };

    const handleReady = (payload: { player: TournamentPlayer; opponent: TournamentPlayer }) => {
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

    const handleState = (payload: { duelId: string; question: DuelQuestion; scores: Score[]; answered?: boolean }) => {
      if (payload.duelId !== duelId) return;
      setQuestion(payload.question);
      setScores(payload.scores);
      setAnswerLocked(Boolean(payload.answered));
      startTimer(payload.question);
    };

    const handleScore = (payload: { duelId: string; scores: Score[] }) => {
      if (payload.duelId === duelId) setScores(payload.scores);
    };

    const handleAnswerAccepted = (payload: { duelId: string; questionId: string; accepted: boolean }) => {
      if (payload.duelId === duelId && payload.questionId === questionIdRef.current) {
        setAnswerLocked((locked) => payload.accepted || locked);
      }
    };

    const handleQuestionResult = (payload: { duelId: string; correctAnswer: string; explanation?: string; scores: Score[] }) => {
      if (payload.duelId !== duelId) return;
      stopTimer();
      setScores(payload.scores);
      setRoundResult({ correctAnswer: payload.correctAnswer, explanation: payload.explanation });
    };

    const handleCompleted = (payload: DuelResult) => {
      if (payload.duel.id !== duelId) return;
      stopTimer();
      setDuelResult(payload);
      setScores(payload.scores);
      setDisplayedRemaining(1000);
      window.setTimeout(() => setShowFinalResult(true), RESULT_REVEAL_DELAY_MS);
    };

    const handleNextMatch = (payload: MatchFound) => {
      if (payload.duel.id === duelId || payload.player.id !== playerId) return;
      setNextMatch(payload);
      setNextDuelCountdown(NEXT_DUEL_DELAY_SECONDS);
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
    socket.on("tournamentMatchFound", handleNextMatch);
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
      socket.off("tournamentMatchFound", handleNextMatch);
      socket.off("tournamentError", handleError);
    };
  }, [status, duelId, playerId]);

  useEffect(() => {
    if (!duelResult || !showFinalResult) return;
    const target = duelResult.tournament.remainingPlayers;
    const start = Math.max(target, Math.min(1000, target * 2));
    setDisplayedRemaining(start);
    const startedAt = Date.now();
    const duration = 1000;
    const interval = window.setInterval(() => {
      const ratio = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - ratio, 3);
      setDisplayedRemaining(Math.round(start + (target - start) * eased));
      if (ratio >= 1) window.clearInterval(interval);
    }, 30);
    return () => window.clearInterval(interval);
  }, [duelResult, showFinalResult]);

  useEffect(() => {
    if (!nextMatch || duelResult?.winner.id !== playerId || !showFinalResult) return;
    const interval = window.setInterval(() => {
      setNextDuelCountdown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    const redirect = window.setTimeout(() => {
      router.replace(`/tournament/duel?duelId=${encodeURIComponent(nextMatch.duel.id)}`);
    }, NEXT_DUEL_DELAY_SECONDS * 1000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(redirect);
    };
  }, [nextMatch, duelResult?.winner.id, playerId, router, showFinalResult]);

  const submitAnswer = (answer: string) => {
    if (!question || selectedAnswer || timeLeft <= 0 || roundResult || duelResult) return;
    setSelectedAnswer(answer);
    getSocket().emit("submitTournamentAnswer", { duelId, questionId: question.questionId, answer });
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
    const remaining = duelResult.tournament.remainingPlayers;
    const eliminatedThisRound = Math.max(0, remaining);
    const outlasted = Math.max(0, 1000 - remaining);
    const placement = won ? remaining : Math.min(1000, remaining + 1);
    const accuracy = Math.round(((playerScore?.correctAnswers ?? 0) / 3) * 100);
    const margin = Math.abs((playerScore?.score ?? 0) - (opponentScore?.score ?? 0));
    const closeFinish = margin <= 250;
    const perfect = (playerScore?.correctAnswers ?? 0) === 3;

    if (!showFinalResult) {
      return (
        <ArenaShell>
          <section className={`${arenaPanelClass} mx-auto flex min-h-[560px] max-w-3xl flex-col items-center justify-center p-8 text-center sm:p-12`}>
            <div className="h-20 w-20 animate-pulse rounded-full border border-white/10 bg-white/5" />
            <p className="mt-6 text-xs font-black uppercase tracking-[0.32em] text-slate-400">Final scores locked</p>
            <h1 className="mt-3 text-4xl font-black">Calculating result…</h1>
          </section>
        </ArenaShell>
      );
    }

    return (
      <ArenaShell>
        <section className={`${arenaPanelClass} mx-auto max-w-4xl overflow-hidden p-6 text-center sm:p-10`}>
          <div className={`rounded-3xl border p-7 sm:p-10 ${won ? "border-emerald-300/25 bg-emerald-300/[0.07]" : "border-red-300/25 bg-red-300/[0.06]"}`}>
            <p className={`text-xs font-black uppercase tracking-[0.32em] ${won ? "text-emerald-300" : "text-red-300"}`}>
              {won ? "VICTORY — YOU SURVIVED" : "ELIMINATED"}
            </p>
            <h1 className="mt-4 text-5xl font-black sm:text-6xl">{won ? `Top ${remaining.toLocaleString()}` : `#${placement.toLocaleString()}`}</h1>
            <p className="mt-4 text-lg text-slate-300">
              {won
                ? `You defeated ${duelResult.loser.displayName} and advanced to Round ${duelResult.tournament.round}.`
                : `${duelResult.winner.displayName} ended your run.`}
            </p>

            {won && (
              <div className="mx-auto mt-8 max-w-xl rounded-3xl border border-white/10 bg-black/20 p-6">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Survivors</p>
                <div className="mt-3 flex items-center justify-center gap-5">
                  <span className="text-2xl font-black text-slate-600">{Math.min(1000, remaining * 2).toLocaleString()}</span>
                  <span className="text-2xl text-cyan-300">→</span>
                  <span className="text-5xl font-black text-white">{(displayedRemaining ?? remaining).toLocaleString()}</span>
                </div>
                <p className="mt-3 text-sm font-bold text-cyan-200">You have outlasted {outlasted.toLocaleString()} competitors.</p>
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <Stat label="Your score" value={(playerScore?.score ?? 0).toLocaleString()} />
            <Stat label="Accuracy" value={`${accuracy}%`} />
            <Stat label="Correct" value={`${playerScore?.correctAnswers ?? 0} / 3`} />
            <Stat label={won ? "Players left" : "Placement"} value={won ? remaining.toLocaleString() : `#${placement}`} />
          </div>

          {(perfect || closeFinish || won) && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {perfect && <MomentBadge text="PERFECT ROUND" />}
              {closeFinish && <MomentBadge text={`CLUTCH FINISH · ${margin} PTS`} />}
              {won && <MomentBadge text={`+1 DUEL WIN`} />}
              {won && eliminatedThisRound > 0 && <MomentBadge text={`TOP ${Math.max(1, Math.ceil((remaining / 1000) * 100))}%`} />}
            </div>
          )}

          {won && nextMatch ? (
            <div className="mt-8 rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.07] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">Next rival identified</p>
              <div className="mx-auto mt-5 grid max-w-xl items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
                <MiniPlayer name={displayName} label="You" />
                <div className="text-2xl font-black text-white/30">VS</div>
                <MiniPlayer name={nextMatch.opponent.displayName} label={nextMatch.opponent.kind === "bot" ? "AI rival" : "Live rival"} />
              </div>
              <p className="mt-5 text-sm text-slate-300">Round {nextMatch.duel.round} begins in <span className="font-black text-white">{nextDuelCountdown}</span>…</p>
              <button
                onClick={() => router.replace(`/tournament/duel?duelId=${encodeURIComponent(nextMatch.duel.id)}`)}
                className="mt-5 rounded-2xl bg-cyan-400 px-8 py-4 font-black text-[#03101f] transition hover:bg-cyan-300"
              >
                Face next rival now
              </button>
            </div>
          ) : won ? (
            <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6">
              <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-white/10 border-t-cyan-300" />
              <p className="mt-4 font-bold text-cyan-100">The bracket is collapsing. Finding your next rival…</p>
            </div>
          ) : (
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <button onClick={() => router.push("/tournament")} className="rounded-2xl bg-cyan-400 px-8 py-4 text-lg font-black text-[#03101f] transition hover:bg-cyan-300">Run it back</button>
              <button onClick={() => router.push("/")} className="rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-lg font-black text-white transition hover:bg-white/10">Back home</button>
            </div>
          )}
        </section>
      </ArenaShell>
    );
  }

  const answeredCorrectly = roundResult && selectedAnswer === roundResult.correctAnswer;

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
              <button onClick={() => router.push("/tournament")} className="mt-7 rounded-xl bg-cyan-400 px-6 py-3 font-black text-[#03101f]">Start a new tournament</button>
            </div>
          ) : roundResult ? (
            <div className="flex min-h-[520px] flex-col justify-center text-center">
              <p className={`text-xs font-black uppercase tracking-[0.28em] ${answeredCorrectly ? "text-emerald-300" : "text-red-300"}`}>
                {answeredCorrectly ? "CORRECT" : selectedAnswer ? "NOT QUITE" : "TIME EXPIRED"}
              </p>
              <h2 className="mt-4 text-4xl font-black">{roundResult.correctAnswer}</h2>
              {roundResult.explanation && <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">{roundResult.explanation}</p>}
              <div className="mx-auto mt-7 flex gap-3">
                <Stat label="Your score" value={(playerScore?.score ?? 0).toLocaleString()} />
                <Stat label="Rival score" value={(opponentScore?.score ?? 0).toLocaleString()} />
              </div>
              <p className="mt-8 font-bold text-cyan-200">Next question incoming…</p>
            </div>
          ) : question ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-slate-300">Question {question.questionNumber} of {question.questionCount}</span>
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
              {selectedAnswer && <p className="mt-5 text-center text-sm font-bold text-cyan-200">{answerLocked ? "Answer locked — waiting on your rival" : "Locking answer…"}</p>}
            </>
          ) : (
            <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
              <div className="h-14 w-14 animate-spin rounded-full border-4 border-white/10 border-t-cyan-300" />
              <h2 className="mt-6 text-2xl font-black">Preparing the arena</h2>
              <p className="mt-2 text-slate-400">Loading three unique questions for both competitors.</p>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className={`${arenaPanelClass} p-5`}>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Live duel</p>
            <ScoreRow name={displayName} score={playerScore?.score ?? 0} correct={playerScore?.correctAnswers ?? 0} highlight />
            <ScoreRow name={opponent?.displayName || "Opponent"} score={opponentScore?.score ?? 0} correct={opponentScore?.correctAnswers ?? 0} />
          </div>
          <div className={`${arenaPanelClass} p-5`}>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Stakes</p>
            <p className="mt-4 text-sm leading-6 text-slate-300">Three questions decide who survives. Correct answers earn 1,000 points plus a speed bonus. Every point can decide your run.</p>
          </div>
        </aside>
      </div>
    </ArenaShell>
  );
}

function ScoreRow({ name, score, correct, highlight = false }: { name: string; score: number; correct: number; highlight?: boolean }) {
  return (
    <div className={`mt-4 rounded-2xl border p-4 ${highlight ? "border-cyan-300/30 bg-cyan-300/10" : "border-white/10 bg-white/[0.035]"}`}>
      <div className="flex items-center justify-between gap-3"><p className="truncate font-black">{name}</p><p className="font-black text-cyan-200">{score.toLocaleString()}</p></div>
      <p className="mt-1 text-xs text-slate-400">{correct} correct</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><p className="text-2xl font-black">{value}</p><p className="mt-1 text-xs font-bold uppercase tracking-[0.15em] text-slate-500">{label}</p></div>;
}

function MomentBadge({ text }: { text: string }) {
  return <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-100">{text}</span>;
}

function MiniPlayer({ name, label }: { name: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-cyan-300/10 font-black text-cyan-100">{name.slice(0, 2).toUpperCase()}</div>
      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 truncate font-black">{name}</p>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return <main className="arena-shell flex min-h-screen items-center justify-center text-white"><div className="text-center"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-cyan-300" /><p className="mt-4 font-bold">{label}</p></div></main>;
}

export default function TournamentDuelPage() {
  return <SessionProvider><Suspense fallback={<Loading label="Loading duel…" />}><TournamentDuelPageInner /></Suspense></SessionProvider>;
}
