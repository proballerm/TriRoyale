"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSignup = async () => {
    setError("");
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
      headers: { "Content-Type": "application/json" },
    });

    if (res.status === 409) {
      setError("User already exists");
    } else if (res.ok) {
      setSuccess("Account created! Redirecting...");
      setTimeout(() => router.push("/login"), 2000);
    } else {
      setError("Something went wrong");
    }
  };

  return (
    <main className="min-h-screen flex justify-center items-center bg-gradient-to-b from-[#4EB8F2] to-[#0072CE] p-4">
      <div className="max-w-md w-full bg-white/10 backdrop-blur p-8 rounded-3xl border border-white/30 shadow-2xl">
        <h1 className="text-white text-3xl font-extrabold mb-6 text-center">
          Create an Account
        </h1>

        {error && (
          <p className="text-red-400 font-semibold text-center mb-4">{error}</p>
        )}
        {success && (
          <p className="text-green-400 font-semibold text-center mb-4">
            {success}
          </p>
        )}

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-white/20 border border-white/30 text-white placeholder-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-white/20 border border-white/30 text-white placeholder-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-white/20 border border-white/30 text-white placeholder-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          <button
            onClick={handleSignup}
            className="w-full py-3 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-[#003E7E] font-bold text-lg transition"
          >
            Sign Up
          </button>
        </div>

        <p className="text-white text-center mt-6">
          Already have an account?{" "}
          <button
            onClick={() => router.push("/login")}
            className="text-yellow-300 font-semibold hover:underline"
          >
            Log In
          </button>
        </p>
      </div>
    </main>
  );
}
