"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await signIn("credentials", {
      email,
      password,
      callbackUrl: "/",
    });
  };

  return (
    <main
      className="
        min-h-screen
        w-full
        flex
        justify-center
        items-center
        bg-gradient-to-b
        from-[#4EB8F2]
        to-[#0072CE]
        px-4
      "
    >
      <div className="
        w-full max-w-sm
        bg-white
        border border-[#003E7E]
        rounded-xl
        p-8
      ">
        {/* Title */}
        <div className="flex justify-center mb-4">
          <div className="
            bg-[#003E7E]
            px-6 py-3
            rounded
          ">
            <h1 className="
              text-white
              text-3xl
              font-extrabold
              tracking-wide
              uppercase
            ">
              TRIROYALE
            </h1>
          </div>
        </div>

        {/* Yellow Bars */}
        <div className="flex justify-center gap-2 mb-6">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="w-6 h-2 rounded bg-[#FFD930]"
            ></div>
          ))}
        </div>

        {/* Tagline */}
        <p className="
          text-center
          text-[#003E7E]
          text-lg
          font-extrabold
          uppercase
          mb-8
        ">
          ENTER THE ARENA. OUTWIT YOUR RIVALS.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="
              w-full
              px-4
              py-3
              rounded
              border border-[#003E7E]
              focus:outline-none
              focus:ring-2
              focus:ring-[#0072CE]
              text-[#003E7E]
              placeholder:text-[#003E7E]
              placeholder:font-semibold
            "
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="
              w-full
              px-4
              py-3
              rounded
              border border-[#003E7E]
              focus:outline-none
              focus:ring-2
              focus:ring-[#0072CE]
              text-[#003E7E]
              placeholder:text-[#003E7E]
              placeholder:font-semibold
            "
            required
          />
          <button
            type="submit"
            className="
              w-full
              py-3
              rounded
              bg-[#0072CE]
              text-white
              font-extrabold
              text-lg
              uppercase
              relative
              after:content-['']
              after:absolute
              after:bottom-[-4px]
              after:left-0
              after:w-full
              after:h-[4px]
              after:bg-[#FFD930]
              after:rounded
              hover:bg-[#005CB9]
              transition
            "
          >
            ENTER ARENA
          </button>
        </form>

        <div className="flex items-center my-6">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="mx-3 text-gray-400 text-sm">or</span>
          <div className="flex-grow border-t border-gray-300"></div>
        </div>

        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="
            w-full
            border border-[#003E7E]
            py-3
            rounded
            flex
            items-center
            justify-center
            bg-white
            hover:bg-gray-50
            text-[#003E7E]
            font-bold
            text-base
            transition
          "
        >
          <img
            src="/google-logo.png"
            alt="Google"
            className="w-5 h-5 mr-3"
          />
          Sign in with Google
        </button>

        <p className="text-center text-gray-600 mt-6 text-sm">
          Don’t have an account?{" "}
          <a
            href="/signup"
            className="text-[#003E7E] font-extrabold hover:underline"
          >
            Sign up
          </a>
        </p>
      </div>
    </main>
  );
}
