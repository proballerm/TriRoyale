"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordWin = recordWin;
// lib/recordWin.ts
const mongodb_1 = __importDefault(require("./mongodb"));
async function recordWin(username, category, io) {
    const client = await mongodb_1.default;
    const db = client.db(); // or specify db name
    const collection = db.collection("leaderboard");
    await collection.updateOne({ username, category }, { $inc: { wins: 1 } }, { upsert: true });
    // Real-time leaderboard update
    if (io) {
        io.emit("leaderboardUpdated");
    }
}
