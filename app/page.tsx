"use client";

import { SessionProvider, useSession, signOut } from "next-auth/react";
import { useEffect } from "react";
import Link from "next/link";

function InnerHomePage() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/login";
    }
  }, [status]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <main
      className="
        relative
        min-h-screen
        w-full
        flex
        justify-center
        items-center
        bg-gradient-to-b
        from-[#4EB8F2]
        to-[#0072CE]
        px-4
        overflow-hidden
      "
    >
      <div
        className="
          w-full max-w-md
          bg-white/10
          backdrop-blur
          border border-white/30
          rounded-3xl
          p-8
          text-center
          shadow-2xl
        "
      >
        {/* Title */}
        <div className="bg-[#003E7E] text-white py-4 px-6 rounded-xl inline-block mb-6">
          <h1 className="text-4xl font-extrabold tracking-wide uppercase">
            TriRoyale
          </h1>
        </div>

        {/* Welcome Text */}
        <p className="text-white text-xl font-extrabold mb-8">
          Welcome, {session?.user?.name || "Player"}!
        </p>

        {/* Buttons */}
        <div className="flex flex-col gap-4 w-full">
          <Link
            href="/lobby"
            className="
              w-full
              py-3
              rounded-lg
              bg-[#0072CE]
              hover:bg-[#005CB9]
              text-white
              text-lg
              font-extrabold
              uppercase
              shadow
              transition
              text-center
            "
          >
            Battle Royale Mode
          </Link>

          <Link
            href="/categories"
            className="
              w-full
              py-3
              rounded-lg
              bg-[#FFD930]
              hover:bg-[#FFC500]
              text-[#003E7E]
              text-lg
              font-extrabold
              uppercase
              shadow
              transition
              text-center
            "
          >
            Categories
          </Link>

          <Link
            href="/leaderboards"
            className="
              w-full
              py-3
              rounded-lg
              bg-white
              hover:bg-gray-100
              text-[#003E7E]
              text-lg
              font-extrabold
              uppercase
              shadow
              transition
              border border-[#003E7E]
              text-center
            "
          >
            View Leaderboards
          </Link>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="
              w-full
              py-3
              rounded-lg
              bg-[#E53935]
              hover:bg-[#C62828]
              text-white
              text-lg
              font-extrabold
              uppercase
              shadow
              transition
              text-center
            "
          >
            Sign Out
          </button>
        </div>

        <p className="text-white mt-8 text-sm opacity-80">
          © 2025 TriRoyale
        </p>
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <SessionProvider>
      <InnerHomePage />
    </SessionProvider>
  );
}
