"use client";

import { useRouter } from "next/navigation";

const categories = [
  "Sports",
  "Science",
  "Movies",
  "History",
  "Geography",
  "Music",
];

export default function CategorySelectionPage() {
  const router = useRouter();

  const handleSelect = (category: string) => {
    // Navigate to the game page with selected category
    router.push(`/lobby?category=${encodeURIComponent(category)}`);
  };

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
        <div className="bg-[#003E7E] text-white py-4 px-6 rounded-xl inline-block mb-6">
          <h1 className="text-3xl font-extrabold tracking-wide uppercase">
            Choose Your Category
          </h1>
        </div>

        <div className="flex flex-col gap-4">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => handleSelect(cat)}
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
              "
            >
              {cat}
            </button>
          ))}
        </div>

        <p className="text-white mt-8 text-sm opacity-80">
          © 2025 Trivia Royale
        </p>
      </div>
    </main>
  );
}
