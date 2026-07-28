"use client";

import { ArenaShell, arenaPanelClass } from "@/components/arena/ArenaShell";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
        headers: { "Content-Type": "application/json" },
      });

      if (response.status === 409) {
        setError("An account with this email already exists.");
      } else if (response.ok) {
        setSuccess("Account created. Taking you to the arena entrance…");
        window.setTimeout(() => router.push("/login"), 1500);
      } else {
        setError("We could not create your account. Please try again.");
      }
    } catch {
      setError("The signup service is temporarily unavailable.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ArenaShell>
      <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center py-8">
        <div className={`grid w-full max-w-5xl overflow-hidden ${arenaPanelClass} lg:grid-cols-[0.9fr_1.1fr]`}>
          <section className="relative hidden min-h-[650px] overflow-hidden border-r border-white/10 p-10 lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(34,211,238,0.16),transparent_35%),radial-gradient(circle_at_75%_75%,rgba(168,85,247,0.16),transparent_35%)]" />
            <Link href="/" className="relative flex items-center gap-3">
              <div className="relative grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/30 bg-white/10 text-xl font-black text-cyan-100">T</div>
              <div>
                <p className="text-xl font-black uppercase tracking-[0.16em]">TriRoyale</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200/60">Knowledge is power</p>
              </div>
            </Link>

            <div className="relative">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200/60">Create your challenger profile</p>
              <h1 className="mt-4 text-6xl font-black leading-[0.95] tracking-[-0.055em]">
                Join the arena.
                <span className="block bg-gradient-to-r from-cyan-200 via-white to-amber-200 bg-clip-text text-transparent">Build your legacy.</span>
              </h1>
              <p className="mt-6 max-w-md text-base leading-7 text-slate-300">Track wins, compete across categories, and climb the live leaderboard with a persistent player identity.</p>
            </div>

            <div className="relative grid grid-cols-3 gap-3">
              {[["01", "Create"], ["02", "Compete"], ["03", "Climb"]].map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/10 p-4 text-center">
                  <p className="text-xl font-black text-cyan-200">{value}</p>
                  <p className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/45">{label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="flex min-h-[650px] items-center p-6 sm:p-10 lg:p-12">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8 lg:hidden">
                <Link href="/" className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/30 bg-white/10 text-xl font-black text-cyan-100">T</div>
                  <p className="text-xl font-black uppercase tracking-[0.16em]">TriRoyale</p>
                </Link>
              </div>

              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-cyan-200/60">Player registration</p>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.04em]">Create your account</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">Set up your profile and enter the competition.</p>

              {error ? <div className="mt-6 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100">{error}</div> : null}
              {success ? <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100">{success}</div> : null}

              <form onSubmit={handleSignup} className="mt-8 space-y-5">
                {[
                  { label: "Display name", type: "text", value: name, setValue: setName, placeholder: "How players will see you", autoComplete: "name" },
                  { label: "Email address", type: "email", value: email, setValue: setEmail, placeholder: "you@example.com", autoComplete: "email" },
                  { label: "Password", type: "password", value: password, setValue: setPassword, placeholder: "Create a secure password", autoComplete: "new-password" },
                ].map((field) => (
                  <label key={field.label} className="block">
                    <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-white/45">{field.label}</span>
                    <input
                      type={field.type}
                      value={field.value}
                      onChange={(event) => field.setValue(event.target.value)}
                      placeholder={field.placeholder}
                      autoComplete={field.autoComplete}
                      required
                      minLength={field.type === "password" ? 8 : undefined}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4 text-white outline-none transition placeholder:text-white/25 focus:border-cyan-300/45 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10"
                    />
                  </label>
                ))}

                <button
                  type="submit"
                  disabled={submitting || Boolean(success)}
                  className="w-full rounded-2xl bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 px-5 py-4 text-sm font-black uppercase tracking-[0.16em] text-slate-950 shadow-[0_15px_40px_rgba(56,189,248,0.22)] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
                >
                  {submitting ? "Creating profile…" : success ? "Account created" : "Join TriRoyale"}
                </button>
              </form>

              <p className="mt-8 text-center text-sm text-slate-400">
                Already registered? <Link href="/login" className="font-black text-cyan-200 transition hover:text-white">Enter the arena</Link>
              </p>
            </div>
          </section>
        </div>
      </div>
    </ArenaShell>
  );
}
