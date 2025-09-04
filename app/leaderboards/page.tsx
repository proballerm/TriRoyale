"use client";

import { useEffect, useState } from "react";
import io from "socket.io-client"; // ✅ no Socket import

interface LeaderboardEntry {
  username: string;
  category: string;
  wins: number;
}

const categories = [
  "Total Wins",
  "Battle Royale",
  "Sports",
  "Science",
  "Movies",
  "History",
  "Geography",
  "Music",
];

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("Total Wins");

  useEffect(() => {
    // ✅ robust typing without importing Socket
    const socket: ReturnType<typeof io> = io({
      path: "/socket.io",
      transports: ["websocket"],
    });

    const fetchLeaderboard = async () => {
      try {
        const res = await fetch("/api/leaderboard");
        const data: LeaderboardEntry[] = await res.json();
        setLeaderboard(data);
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
      }
    };

    fetchLeaderboard();

    socket.on("leaderboardUpdated", () => {
      fetchLeaderboard();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const filteredLeaderboard =
    selectedCategory === "Total Wins"
      ? leaderboard
          .filter((entry) => entry.category !== "Unknown")
          .reduce((acc: LeaderboardEntry[], curr) => {
            const existing = acc.find((entry) => entry.username === curr.username);
            if (existing) {
              existing.wins += curr.wins;
            } else {
              acc.push({ username: curr.username, category: "Total Wins", wins: curr.wins });
            }
            return acc;
          }, [])
          .sort((a, b) => b.wins - a.wins)
      : leaderboard
          .filter((entry) => entry.category === selectedCategory)
          .sort((a, b) => b.wins - a.wins);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2a8bff] to-[#005eff] text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-extrabold">🏆 Leaderboard</h1>
          <select
            className="bg-white text-black px-4 py-2 rounded-md font-semibold"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="w-full table-auto text-black">
            <thead className="bg-blue-100 text-gray-800">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">Username</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-left">Wins</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeaderboard.length > 0 ? (
                filteredLeaderboard.map((entry, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-4 py-2">{index + 1}</td>
                    <td className="px-4 py-2">{entry.username}</td>
                    <td className="px-4 py-2">
                      {selectedCategory === "Total Wins" ? entry.category : selectedCategory}
                    </td>
                    <td className="px-4 py-2">{entry.wins}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    No data for this category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
