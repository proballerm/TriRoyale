"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    await signIn("credentials", {
      email,
      password,
      callbackUrl: "/",
    });
    setSubmitting(false);
  };

  return (
    <main className="arena-shell relative min-h-screen overflow-hidden px-5 py-8 text-white sm:px-8">
      <div className="arena-grid pointer-events-none absolute inset-0 opacity-30" />
      <div className="pointer-events-none absolute -left-40 top-10 h-[32rem] w-[32rem] rounded-full bg-cyan-400/20 blur-[130px]" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-[30rem] w-[30rem] rounded-full bg-violet-500/25 blur-[140px]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl items-center">
        <div className="grid w-full overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.055] shadow-[0_35px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl lg:grid-cols-[1.08fr_0.92fr]">
          <section className="relative hidden min-h-[700px] overflow-hidden border-r border-white/10 p-12 lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_30%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_75%_70%,rgba(168,85,247,0.16),transparent_32%)]" />
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="relative grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/30 bg-white/10 shadow-[0_0_35px_rgba(34,211,238,0.18)]">
                  <span className="text-xl font-black text-cyan-100">T</span>
                  <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(253,224,71,0.9)]" />
                </div>
                <div>
                  <p className="text-xl font-black uppercase tracking-[0.16em]">TriRoyale</p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200/60">Knowledge is power</p>
                </div>
              </div>

              <div className="mt-24 max-w-xl">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.9)]" />
                  Live arena access
                </div>
                <h1 className="text-6xl font-black leading-[0.92] tracking-[-0.055em] xl:text-7xl">
                  Outsmart.
                  <span className="block bg-gradient-to-r from-cyan-200 via-white to-amber-200 bg-clip-text text-transparent">Outlast.</span>
                  <span className="block">Take the crown.</span>
                </h1>
                <p className="mt-7 max-w-lg text-lg leading-8 text-slate-300">
                  Compete in live trivia battles, master your strongest categories, and prove you belong at the top.
                </p>
              </div>
            </div>

            <div className="relative grid grid-cols-3 gap-3">
              {[
                ["⚔", "Live battles"],
                ["◆", "Smart categories"],
                ["♛", "Global rankings"],
              ].map(([icon, label]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <p className="text-2xl">{icon}</p>
                  <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-white/55">{label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="flex min-h-[680px] items-center p-6 sm:p-10 lg:p-12">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-10 lg:hidden">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/30 bg-white/10 text-xl font-black text-cyan-100">T</div>
                  <p className="text-xl font-black uppercase tracking-[0.16em]">TriRoyale</p>
                </div>
              </div>

              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-cyan-200/60">Player access</p>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.04em]">Enter the arena</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">Sign in to continue your climb and challenge the competition.</p>

              <form onSubmit={handleSubmit} className="mt-9 space-y-5">
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Email address</span>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4 text-white outline-none transition placeholder:text-white/25 focus:border-cyan-300/45 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Password</span>
                  <input
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4 text-white outline-none transition placeholder:text-white/25 focus:border-cyan-300/45 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10"
                    required
                  />
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 px-5 py-4 text-sm font-black uppercase tracking-[0.16em] text-slate-950 shadow-[0_15px_40px_rgba(56,189,248,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(56,189,248,0.3)] disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="relative z-10">{submitting ? "Entering..." : "Enter arena"}</span>
                  <span className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-white/30 blur-md transition duration-700 group-hover:left-[120%]" />
                </button>
              </form>

              <div className="my-7 flex items-center gap-4">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">or continue with</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <button
                onClick={() => signIn("google", { callbackUrl: "/" })}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white px-5 py-4 text-sm font-black text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-100"
              >
                <img src="/google-logo.png" alt="Google" className="h-5 w-5" />
                Sign in with Google
              </button>

              <p className="mt-8 text-center text-sm text-slate-400">
                New challenger?{" "}
                <a href="/signup" className="font-black text-cyan-200 transition hover:text-white">Create an account</a>
              </p>

              <div className="mt-10 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/25">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Secure player authentication
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
