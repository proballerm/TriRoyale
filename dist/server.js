"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const next_1 = __importDefault(require("next"));
require("dotenv/config");
const botManager_1 = require("./lib/botManager");
const uuid_1 = require("uuid");
const recordWin_1 = require("./lib/recordWin");
const triviaGenerator_1 = require("./lib/triviaGenerator");
const dev = process.env.NODE_ENV !== "production";
const nextApp = (0, next_1.default)({ dev });
const handle = nextApp.getRequestHandler();
const lobbies = {};
const hosts = {};
const currentQuestions = {};
const gameStartedFlags = {};
const botsLaunchedFlags = {};
const answerMaps = {};
const intermissionTime = 5000;
function startRound(io, matchId, category, timeLimit) {
    const question = currentQuestions[matchId];
    answerMaps[matchId] = new Map();
    io.to(matchId).emit("newQuestion", {
        category,
        matchId,
        question: question.question,
        answers: question.answers,
        timeLimit,
        startTime: Date.now(),
        correct: question.correct,
    });
    setTimeout(async () => {
        const correctAnswer = question.answers[["A", "B", "C", "D"].indexOf(question.correct)].trim().toLowerCase();
        const answeredUsers = answerMaps[matchId] || new Map();
        const players = lobbies[matchId] || [];
        console.log(`[Match ${matchId}] Correct answer: "${question.correct}"`);
        console.log(`[Match ${matchId}] Player answers:`);
        const eliminated = [];
        const survivors = [];
        for (const player of players) {
            const answer = answeredUsers.get(player);
            console.log(`- ${player}: "${answer}"`);
            if (answer && answer.trim().toLowerCase() === correctAnswer) {
                survivors.push(player);
            }
            else {
                eliminated.push(player);
                const sockets = await io.in(matchId).fetchSockets();
                const playerSocket = sockets.find((s) => s.data.username === player);
                if (playerSocket) {
                    playerSocket.emit("eliminated", { username: player });
                    playerSocket.leave(matchId);
                }
            }
        }
        lobbies[matchId] = survivors;
        io.to(matchId).emit("roundResult", {
            correctAnswer: question.correct,
            eliminated,
            survivors,
        });
        setTimeout(async () => {
            if (survivors.length === 1) {
                io.to(matchId).emit("gameOver", { winner: survivors[0] });
                await (0, recordWin_1.recordWin)(survivors[0], category, io);
                console.log(`[Match ${matchId}] Winner: ${survivors[0]} - Win recorded.`);
                io.emit("leaderboardUpdated", {
                    username: survivors[0],
                    category,
                });
            }
            else if (survivors.length === 0) {
                io.to(matchId).emit("gameOver", { winner: null });
            }
            else {
                const nextActualCategory = category === "Battle Royale"
                    ? ["Sports", "Science", "Movies", "History", "Geography", "Music"][Math.floor(Math.random() * 6)]
                    : category;
                const nextQ = await (0, triviaGenerator_1.generateTriviaQuestion)(nextActualCategory);
                currentQuestions[matchId] = nextQ;
                startRound(io, matchId, category, 15);
                return;
            }
            gameStartedFlags[matchId] = false;
            currentQuestions[matchId] = null;
            lobbies[matchId] = [];
            hosts[matchId] = null;
            botsLaunchedFlags[matchId] = false;
        }, intermissionTime);
    }, timeLimit * 1000);
}
nextApp.prepare().then(() => {
    const app = (0, express_1.default)();
    const httpServer = (0, http_1.createServer)(app);
    const io = new socket_io_1.Server(httpServer, {
        path: "/socket.io",
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
    });
    app.get("/api/new-match", (req, res) => {
        const matchId = (0, uuid_1.v4)();
        res.json({ matchId });
    });
    io.on("connection", (socket) => {
        socket.on("joinLobby", async ({ username, category, matchId }) => {
            if (!matchId)
                return;
            const roomId = matchId;
            if (!lobbies[roomId])
                lobbies[roomId] = [];
            if (!lobbies[roomId].includes(username)) {
                lobbies[roomId].push(username);
            }
            if (!hosts[roomId])
                hosts[roomId] = username;
            socket.join(roomId);
            socket.data.username = username;
            socket.data.category = category;
            socket.data.matchId = roomId;
            if (!botsLaunchedFlags[roomId] && !username.startsWith("🤖")) {
                botsLaunchedFlags[roomId] = true;
                await (0, botManager_1.launchBots)(io, roomId, category);
            }
            io.to(roomId).emit("lobbyUpdate", {
                category,
                players: lobbies[roomId],
                host: hosts[roomId],
                matchId: roomId,
            });
        });
        socket.on("startGame", async ({ category, matchId }) => {
            if (!matchId)
                return;
            const roomId = matchId;
            gameStartedFlags[roomId] = true;
            const actualCategory = category === "Battle Royale"
                ? ["Sports", "Science", "Movies", "History", "Geography", "Music"][Math.floor(Math.random() * 6)]
                : category;
            const question = await (0, triviaGenerator_1.generateTriviaQuestion)(actualCategory);
            currentQuestions[roomId] = question;
            io.to(roomId).emit("startGame", { matchId: roomId });
            startRound(io, roomId, category, 15);
        });
        socket.on("answer", ({ username, answer, matchId }) => {
            if (!matchId || !answerMaps[matchId])
                return;
            answerMaps[matchId].set(username, answer);
        });
        socket.on("checkGameStatus", ({ category, matchId }) => {
            if (!matchId)
                return;
            const roomId = matchId;
            const started = gameStartedFlags[roomId] || false;
            const question = currentQuestions[roomId] || null;
            socket.emit("gameStatus", {
                matchId: roomId,
                category,
                started,
                question,
                eliminated: [],
            });
        });
        socket.on("disconnect", () => {
            const { username, matchId } = socket.data;
            const roomId = matchId;
            if (username && roomId && lobbies[roomId]) {
                lobbies[roomId] = lobbies[roomId].filter((n) => n !== username);
                if (hosts[roomId] === username) {
                    hosts[roomId] = lobbies[roomId][0] || null;
                }
                io.to(roomId).emit("lobbyUpdate", {
                    category: socket.data.category,
                    players: lobbies[roomId],
                    host: hosts[roomId],
                    matchId: roomId,
                });
            }
        });
    });
    app.all("*", (req, res) => handle(req, res));
    const PORT = Number(process.env.PORT) || 3000;
    httpServer.listen(PORT, () => {
        console.log(`🚀 Server ready on http://localhost:${PORT}`);
    });
});
