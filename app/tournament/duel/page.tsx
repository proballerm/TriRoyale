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
  multiplier?: number;
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

type FeedItem = { id: string; text: string; emphasis?: string };
type RivalProfile = {
  title: string;
  traits: string[];
  tendency: string;
  threat: "Low" | "Medium" | "High" | "Elite";
};

type AnswerStatusPayload = {
  duelId: string;
  questionId: string;
  playerId: string;
  answeredPlayers: string[];
};

const labels = ["A", "B", "C", "D"];
const RESULT_REVEAL_DELAY_MS = 900;
const NEXT_DUEL_DELAY_SECONDS = 7;
const QUESTION_INTRO_TICKS = 3;
const FIELD_STEPS = [1000, 500, 250, 125, 63, 32, 16, 8, 4, 2, 1];
const FEED_NAMES = ["Nova", "Marcus", "Avery", "Kai", "Maya", "Jordan", "Riley", "Zane"];
const ARCHETYPES = [
  { title: "Speed Hunter", traits: ["Fast responder", "Aggressive"], tendency: "Answers early and trusts instinct." },
  { title: "Clutch Specialist", traits: ["Late-round threat", "Calm under pressure"], tendency: "Strongest when the duel is close." },
  { title: "Knowledge Generalist", traits: ["Balanced", "Consistent"], tendency: "Rarely gives away an easy question." },
  { title: "Risk Taker", traits: ["Unpredictable", "High variance"], tendency: "Can swing a round with one fast answer." },
  { title: "Methodical Reader", traits: ["Patient", "Accurate"], tendency: "Uses more time but avoids careless misses." },
  { title: "Momentum Player", traits: ["Streaky", "Confidence driven"], tendency: "Gets more dangerous after scoring first." },
];

function buildRivalProfile(opponent: TournamentPlayer | null): RivalProfile {
  if (!opponent) {
    return {
      title: "Unknown challenger",
      traits: ["Scanning", "Unranked"],
      tendency: "Match intelligence is loading.",
      threat: "Medium",
    };
  }
  const seed = [...opponent.displayName].reduce(
    (total, character) => total + character.charCodeAt(0),
    opponent.wins * 17,
  );
  const archetype = ARCHETYPES[Math.abs(seed) % ARCHETYPES.length];
  const threat = opponent.wins >= 6 ? "Elite" : opponent.wins >= 3 ? "High" : opponent.wins >= 1 ? "Medium" : "Low";
  return { ...archetype, threat };
}

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
  const [opponentAnswered, setOpponentAnswered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(12);
  const [roundResult, setRoundResult] = useState<{ correctAnswer: string; explanation?: string } | null>(null);
  const [duelResult, setDuelResult] = useState<DuelResult | null>(null);
  const [showFinalResult, setShowFinalResult] = useState(false);
  const [displayedRemaining, setDisplayedRemaining] = useState<number | null>(null);
  const [nextMatch, setNextMatch] = useState<MatchFound | null>(null);
  const [nextDuelCountdown, setNextDuelCountdown] = useState(NEXT_DUEL_DELAY_SECONDS);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [introTick, setIntroTick] = useState(0);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [scoreFlash, setScoreFlash] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionIdRef = useRef<string | null>(null);
  const previousScoresRef = useRef<Score[]>([]);
  const rivalProfile = useMemo(() => buildRivalProfile(opponent), [opponent]);

  useEffect(() => {
    questionIdRef.current = question?.questionId ?? null;
  }, [question?.questionId]);

  useEffect(() => {
    if (introTick <= 0) return;
    const timer = window.setTimeout(() => setIntroTick((tick) => tick - 1), 550);
    return () => window.clearTimeout(timer);
  }, [introTick]);

  useEffect(() => {
    if (!question || duelResult) return;
    const timer = window.setInterval(() => {
      const name = FEED_NAMES[Math.floor(Math.random() * FEED_NAMES.length)];
      const remaining = Math.max(2, FIELD_STEPS[Math.min(FIELD_STEPS.length - 1, player?.round ?? 1)] ?? 500);
      const messages = [
        `${name} survived a sudden-death duel`,
        `${Math.max(1, Math.floor(Math.random() * 9) + 1)} perfect answers recorded`,
        `The field is collapsing toward ${remaining.toLocaleString()}`,
        `${name} eliminated a higher seed`,
      ];
      setFeed((items) => [
        { id: crypto.randomUUID(), text: messages[Math.floor(Math.random() * messages.length)], emphasis: "LIVE" },
        ...items,
      ].slice(0, 4));
    }, 4200);
    return () => window.clearInterval(timer);
  }, [question, duelResult, player?.round]);

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
      const profile = buildRivalProfile(payload.opponent);
      setFeed([
        { id: crypto.randomUUID(), text: `${payload.opponent.displayName} entered the arena`, emphasis: "RIVAL LOCKED" },
        { id: crypto.randomUUID(), text: `${profile.title} · ${profile.threat} threat`, emphasis: "SCOUT REPORT" },
      ]);
    };

    const handleQuestion = (payload: DuelQuestion) => {
      if (payload.duelId !== duelId) return;
      setQuestion(payload);
      setSelectedAnswer(null);
      setAnswerLocked(false);
      setOpponentAnswered(false);
      setRoundResult(null);
      setError(null);
      setIntroTick(QUESTION_INTRO_TICKS);
      setScoreFlash(payload.multiplier === 2 ? "FINAL QUESTION · 2× POINTS" : `QUESTION ${payload.questionNumber}`);
      window.setTimeout(() => setScoreFlash(null), 2200);
      startTimer(payload);
    };

    const applyScores = (nextScores: Score[]) => {
      const previousPlayer = previousScoresRef.current.find((score) => score.playerId === playerId)?.score ?? 0;
      const previousOpponent = previousScoresRef.current.find((score) => score.playerId !== playerId)?.score ?? 0;
      const nextPlayer = nextScores.find((score) => score.playerId === playerId)?.score ?? 0;
      const nextOpponent = nextScores.find((score) => score.playerId !== playerId)?.score ?? 0;
      previousScoresRef.current = nextScores;
      setScores(nextScores);
      if (nextPlayer !== previousPlayer || nextOpponent !== previousOpponent) {
        const message = nextPlayer === nextOpponent ? "DEAD EVEN" : nextPlayer > nextOpponent ? "YOU TAKE THE LEAD" : "RIVAL TAKES THE LEAD";
        setScoreFlash(message);
        window.setTimeout(() => setScoreFlash(null), 1800);
      }
    };

    const handleState = (payload: {
      duelId: string;
      question: DuelQuestion;
      scores: Score[];
      answered?: boolean;
      opponentAnswered?: boolean;
    }) => {
      if (payload.duelId !== duelId) return;
      setQuestion(payload.question);
      applyScores(payload.scores);
      setAnswerLocked(Boolean(payload.answered));
      setOpponentAnswered(Boolean(payload.opponentAnswered));
      startTimer(payload.question);
    };

    const handleScore = (payload: { duelId: string; scores: Score[] }) => {
      if (payload.duelId === duelId) applyScores(payload.scores);
    };

    const handleAnswerAccepted = (payload: { duelId: string; questionId: string; accepted: boolean }) => {
      if (payload.duelId === duelId && payload.questionId === questionIdRef.current) {
        setAnswerLocked((locked) => payload.accepted || locked);
      }
    };

    const handlePlayerAnswered = (payload: AnswerStatusPayload) => {
      if (payload.duelId !== duelId || payload.questionId !== questionIdRef.current) return;
      const rivalId = opponent?.id;
      const rivalLocked = rivalId
        ? payload.answeredPlayers.includes(rivalId)
        : payload.playerId !== playerId;
      if (!rivalLocked) return;
      setOpponentAnswered(true);
      setFeed((items) => [
        { id: crypto.randomUUID(), text: `${opponent?.displayName || "Your rival"} locked an answer`, emphasis: "DUEL UPDATE" },
        ...items,
      ].slice(0, 4));
    };

    const handleQuestionResult = (payload: { duelId: string; correctAnswer: string; explanation?: string; scores: Score[] }) => {
      if (payload.duelId !== duelId) return;
      stopTimer();
      applyScores(payload.scores);
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
    socket.on("tournamentPlayerAnswered", handlePlayerAnswered);
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
      socket.off("tournamentPlayerAnswered", handlePlayerAnswered);
      socket.off("tournamentQuestionResult", handleQuestionResult);
      socket.off("tournamentDuelCompleted", handleCompleted);
      socket.off("tournamentMatchFound", handleNextMatch);
      socket.off("tournamentError", handleError);
    };
  }, [status, duelId, playerId, opponent?.id, opponent?.displayName]);

  useEffect(() => {
    if (!duelResult || !showFinalResult) return;
    const target = duelResult.tournament.remainingPlayers;
    const start = Math.max(target, Math.min(1000, target * 2));
    setDisplayedRemaining(start);
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const ratio = Math.min(1, (Date.now() - startedAt) / 1000);
      const eased = 1 - Math.pow(1 - ratio, 3);
      setDisplayedRemaining(Math.round(start + (target - start) * eased));
      if (ratio >= 1) window.clearInterval(interval);
    }, 30);
    return () => window.clearInterval(interval);
  }, [duelResult, showFinalResult]);

  useEffect(() => {
    if (!nextMatch || duelResult?.winner.id !== playerId || !showFinalResult) return;
    const interval = window.setInterval(() => setNextDuelCountdown((seconds) => Math.max(0, seconds - 1)), 1000);
    const redirect = window.setTimeout(
      () => router.replace(`/tournament/duel?duelId=${encodeURIComponent(nextMatch.duel.id)}`),
      NEXT_DUEL_DELAY_SECONDS * 1000,
    );
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(redirect);
    };
  }, [nextMatch, duelResult?.winner.id, playerId, router, showFinalResult]);

  const submitAnswer = (answer: string) => {
    if (!question || introTick > 0 || selectedAnswer || timeLeft <= 0 || roundResult || duelResult) return;
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
  const scoreGap = (playerScore?.score ?? 0) - (opponentScore?.score ?? 0);
  const momentum = scoreGap === 0 ? "Dead even" : scoreGap > 0 ? `Leading by ${scoreGap.toLocaleString()}` : `Down by ${Math.abs(scoreGap).toLocaleString()}`;
  const currentRound = player?.round ?? 1;
  const currentFieldIndex = Math.min(FIELD_STEPS.length - 1, Math.max(0, currentRound - 1));
  const currentField = FIELD_STEPS[currentFieldIndex];

  if (duelResult) {
    const won = duelResult.winner.id === playerId;
    const remaining = duelResult.tournament.remainingPlayers;
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
            <p className={`text-xs font-black uppercase tracking-[0.32em] ${won ? "text-emerald-300" : "text-red-300"}`}>{won ? "VICTORY — YOU SURVIVED" : "ELIMINATED"}</p>
            <h1 className="mt-4 text-5xl font-black sm:text-6xl">{won ? `Top ${remaining.toLocaleString()}` : `#${placement.toLocaleString()}`}</h1>
            <p className="mt-4 text-lg text-slate-300">{won ? `You defeated ${duelResult.loser.displayName} and advanced.` : `${duelResult.winner.displayName} ended your run.`}</p>
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
              {won && <MomentBadge text="+1 DUEL WIN" />}
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
              <button onClick={() => router.replace(`/tournament/duel?duelId=${encodeURIComponent(nextMatch.duel.id)}`)} className="mt-5 rounded-2xl bg-cyan-400 px-8 py-4 font-black text-[#03101f] transition hover:bg-cyan-300">Face next rival now</button>
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
  const isFinal = question?.multiplier === 2 || question?.questionNumber === question?.questionCount;
  const answerStatus = answerLocked && opponentAnswered
    ? "Both players locked"
    : opponentAnswered
      ? `${opponent?.displayName || "Rival"} locked in`
      : answerLocked
        ? "Your answer is locked"
        : "Both players active";

  return (
    <ArenaShell>
      {scoreFlash && <div className="pointer-events-none fixed inset-x-0 top-24 z-50 mx-auto w-fit rounded-full border border-cyan-300/30 bg-[#071324]/95 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-cyan-100 shadow-2xl">{scoreFlash}</div>}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#081426]/85 px-5 py-4 backdrop-blur-xl">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Round of {currentField.toLocaleString()}</p>
          <h1 className="mt-1 text-2xl font-black">{displayName} vs {opponent?.displayName || "Rival"}</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">{rivalProfile.title} · {rivalProfile.threat} threat</p>
        </div>
        <span className={`rounded-full border px-3 py-2 text-sm font-bold ${connected ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}>{connected ? "Live" : "Reconnecting"}</span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className={`${arenaPanelClass} relative overflow-hidden p-6 sm:p-8`}>
          {introTick > 0 && question && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#06101e]/95 text-center backdrop-blur-sm">
              <p className="text-xs font-black uppercase tracking-[0.34em] text-cyan-300">{isFinal ? "FINAL QUESTION" : `QUESTION ${question.questionNumber}`}</p>
              <h2 className="mt-4 text-5xl font-black">{isFinal ? "2× POINTS" : introTick}</h2>
              <p className="mt-4 text-slate-300">{isFinal ? "One answer can change everything." : momentum}</p>
            </div>
          )}

          {error ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">Duel error</p>
              <h2 className="mt-3 text-3xl font-black">Unable to continue</h2>
              <p className="mt-3 max-w-md text-slate-300">{error}</p>
              <button onClick={() => router.push("/tournament")} className="mt-7 rounded-xl bg-cyan-400 px-6 py-3 font-black text-[#03101f]">Start a new tournament</button>
            </div>
          ) : roundResult ? (
            <div className="flex min-h-[520px] flex-col justify-center text-center">
              <p className={`text-xs font-black uppercase tracking-[0.28em] ${answeredCorrectly ? "text-emerald-300" : "text-red-300"}`}>{answeredCorrectly ? "CORRECT" : selectedAnswer ? "NOT QUITE" : "TIME EXPIRED"}</p>
              <h2 className="mt-4 text-4xl font-black">{roundResult.correctAnswer}</h2>
              {roundResult.explanation && <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">{roundResult.explanation}</p>}
              <div className="mx-auto mt-7 flex gap-3">
                <Stat label="Your score" value={(playerScore?.score ?? 0).toLocaleString()} />
                <Stat label="Rival score" value={(opponentScore?.score ?? 0).toLocaleString()} />
              </div>
              <p className="mt-8 font-bold text-cyan-200">{momentum} · Next question incoming…</p>
            </div>
          ) : question ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${isFinal ? "border-amber-300/30 bg-amber-300/10 text-amber-200" : "border-white/10 bg-white/5 text-slate-300"}`}>{isFinal ? "Final question · 2×" : `Question ${question.questionNumber} of ${question.questionCount}`}</span>
                <span className={`text-3xl font-black ${timeLeft <= 4 ? "text-red-300" : "text-cyan-300"}`}>{timeLeft}s</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full transition-[width] ${timeLeft <= 4 ? "bg-red-400" : isFinal ? "bg-amber-300" : "bg-cyan-400"}`} style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="font-bold text-slate-400">{momentum}</span>
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-bold ${opponentAnswered ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-400"}`}>
                  <span className={`h-2 w-2 rounded-full ${opponentAnswered ? "bg-emerald-300" : "animate-pulse bg-cyan-300"}`} />
                  {answerStatus}
                </span>
              </div>
              <p className="mt-8 text-xs font-black uppercase tracking-[0.24em] text-white/40">{question.category}</p>
              <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">{question.question}</h2>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {question.answers.map((answer, index) => (
                  <button key={answer} onClick={() => submitAnswer(answer)} disabled={introTick > 0 || !!selectedAnswer || timeLeft <= 0} className={`flex min-h-24 items-center gap-4 rounded-2xl border p-5 text-left font-bold transition ${selectedAnswer === answer ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.035] hover:border-white/25 hover:bg-white/[0.07] disabled:opacity-60"}`}>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-cyan-200">{labels[index]}</span>
                    <span>{answer}</span>
                  </button>
                ))}
              </div>
              {selectedAnswer && <p className="mt-5 text-center text-sm font-bold text-cyan-200">{answerLocked ? (opponentAnswered ? "Both answers locked — revealing result" : "Answer locked — waiting on your rival") : "Locking answer…"}</p>}
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
          <RivalCard opponent={opponent} profile={rivalProfile} answered={opponentAnswered} />
          <div className={`${arenaPanelClass} p-5`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Live duel</p>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">{momentum}</span>
            </div>
            <ScoreRow name={displayName} score={playerScore?.score ?? 0} correct={playerScore?.correctAnswers ?? 0} highlight status={answerLocked ? "Locked" : "Thinking"} />
            <ScoreRow name={opponent?.displayName || "Opponent"} score={opponentScore?.score ?? 0} correct={opponentScore?.correctAnswers ?? 0} status={opponentAnswered ? "Locked" : "Thinking"} />
          </div>
          <TournamentTimeline currentRound={currentRound} />
          <div className={`${arenaPanelClass} p-5`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Tournament live</p>
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
            </div>
            <div className="mt-4 space-y-3">
              {feed.length === 0 ? <p className="text-sm text-slate-500">Waiting for bracket activity…</p> : feed.map((item) => (
                <div key={item.id} className="border-l-2 border-cyan-300/40 pl-3">
                  <p className="text-sm font-bold text-slate-200">{item.text}</p>
                  {item.emphasis && <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">{item.emphasis}</p>}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </ArenaShell>
  );
}

function RivalCard({ opponent, profile, answered }: { opponent: TournamentPlayer | null; profile: RivalProfile; answered: boolean }) {
  const threatClass = profile.threat === "Elite" ? "text-red-300" : profile.threat === "High" ? "text-amber-300" : "text-cyan-300";
  return (
    <div className={`${arenaPanelClass} overflow-hidden p-5`}>
      <div className="flex items-start gap-4">
        <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/10 bg-cyan-300/10 text-lg font-black text-cyan-100">
          {(opponent?.displayName || "??").slice(0, 2).toUpperCase()}
          <span className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-[#081426] ${answered ? "bg-emerald-300" : "animate-pulse bg-cyan-300"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-lg font-black">{opponent?.displayName || "Scanning rival"}</p>
            <span className={`text-[10px] font-black uppercase tracking-[0.16em] ${threatClass}`}>{profile.threat}</span>
          </div>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-cyan-300">{profile.title}</p>
          <p className="mt-2 text-sm leading-5 text-slate-400">{profile.tendency}</p>
          <p className={`mt-2 text-xs font-black uppercase tracking-[0.14em] ${answered ? "text-emerald-300" : "text-slate-500"}`}>{answered ? "Answer locked" : "Choosing an answer"}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{profile.traits.map((trait) => <span key={trait} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">{trait}</span>)}</div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><p className="text-lg font-black">{opponent?.wins ?? 0}</p><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Duel wins</p></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><p className="text-lg font-black">{opponent?.kind === "bot" ? "AI" : "LIVE"}</p><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Competitor</p></div>
      </div>
    </div>
  );
}

function TournamentTimeline({ currentRound }: { currentRound: number }) {
  return (
    <div className={`${arenaPanelClass} p-5`}>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Road to champion</p>
      <div className="mt-4 space-y-1">{FIELD_STEPS.map((count, index) => {
        const completed = index < currentRound - 1;
        const active = index === currentRound - 1;
        return <div key={count} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${active ? "border border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : completed ? "text-emerald-300" : "text-slate-500"}`}><span className="w-5 text-center font-black">{completed ? "✓" : active ? "●" : "·"}</span><span className="flex-1">{count === 1 ? "Champion" : `${count.toLocaleString()} left`}</span>{active && <span className="text-[10px] font-black uppercase tracking-[0.15em]">You</span>}</div>;
      })}</div>
    </div>
  );
}

function ScoreRow({ name, score, correct, status, highlight = false }: { name: string; score: number; correct: number; status: string; highlight?: boolean }) {
  return (
    <div className={`mt-4 rounded-2xl border p-4 ${highlight ? "border-cyan-300/30 bg-cyan-300/10" : "border-white/10 bg-white/[0.035]"}`}>
      <div className="flex items-center justify-between gap-3"><p className="truncate font-black">{name}</p><p className="font-black text-cyan-200">{score.toLocaleString()}</p></div>
      <div className="mt-1 flex items-center justify-between text-xs text-slate-400"><span>{correct} correct</span><span className={status === "Locked" ? "font-black text-emerald-300" : "font-bold text-slate-500"}>{status}</span></div>
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
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-cyan-300/10 font-black text-cyan-100">{name.slice(0, 2).toUpperCase()}</div><p className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p><p className="mt-1 truncate font-black">{name}</p></div>;
}

function Loading({ label }: { label: string }) {
  return <main className="arena-shell flex min-h-screen items-center justify-center text-white"><div className="text-center"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-cyan-300" /><p className="mt-4 font-bold">{label}</p></div></main>;
}

export default function TournamentDuelPage() {
  return <SessionProvider><Suspense fallback={<Loading label="Loading duel…" />}><TournamentDuelPageInner /></Suspense></SessionProvider>;
}
