"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var http_1 = require("http");
var socket_io_1 = require("socket.io");
var next_1 = require("next");
var openai_1 = require("openai");
require("dotenv/config");
var dev = process.env.NODE_ENV !== "production";
var nextApp = (0, next_1.default)({ dev: dev });
var handle = nextApp.getRequestHandler();
var lobbies = {};
var hosts = {};
var currentQuestions = {};
var gameStartedFlags = {};
var openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
function generateTriviaQuestion(category) {
    return __awaiter(this, void 0, void 0, function () {
        var completion, text;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        temperature: 0.7,
                        messages: [
                            {
                                role: "system",
                                content: "You are a trivia question generator.",
                            },
                            {
                                role: "user",
                                content: "Generate one trivia question about \"".concat(category, "\". Respond ONLY as valid JSON:\n{\n  \"question\": \"...\",\n  \"answers\": [\"...\", \"...\", \"...\", \"...\"],\n  \"correct\": \"...\"\n}")
                            },
                        ],
                    })];
                case 1:
                    completion = _a.sent();
                    text = completion.choices[0].message.content;
                    return [2 /*return*/, JSON.parse(text)];
            }
        });
    });
}
nextApp.prepare().then(function () {
    var app = (0, express_1.default)();
    var httpServer = (0, http_1.createServer)(app);
    var io = new socket_io_1.Server(httpServer, {
        path: "/socket.io",
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
    });
    io.on("connection", function (socket) {
        console.log("✅ New socket connected!");
        socket.on("joinLobby", function (_a) {
            var username = _a.username, category = _a.category;
            if (!lobbies[category])
                lobbies[category] = [];
            if (!lobbies[category].includes(username)) {
                lobbies[category].push(username);
            }
            if (!hosts[category]) {
                hosts[category] = username;
            }
            socket.join(category);
            socket.data.username = username;
            socket.data.category = category;
            io.to(category).emit("lobbyUpdate", {
                category: category,
                players: lobbies[category],
                host: hosts[category],
            });
        });
        socket.on("checkGameStatus", function (_a) {
            var category = _a.category;
            socket.emit("gameStatus", {
                category: category,
                started: gameStartedFlags[category] || false,
            });
        });
        socket.on("startGame", function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var question;
            var category = _b.category;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        console.log("\uD83D\uDE80 Start Game for ".concat(category));
                        gameStartedFlags[category] = true;
                        return [4 /*yield*/, generateTriviaQuestion(category)];
                    case 1:
                        question = _c.sent();
                        currentQuestions[category] = question;
                        io.to(category).emit("startGame", { category: category });
                        io.to(category).emit("newQuestion", {
                            category: category,
                            question: question.question,
                            answers: question.answers,
                            timeLimit: 10,
                        });
                        return [2 /*return*/];
                }
            });
        }); });
        socket.on("disconnect", function () {
            var _a = socket.data, username = _a.username, category = _a.category;
            if (username && category && lobbies[category]) {
                lobbies[category] = lobbies[category].filter(function (n) { return n !== username; });
                if (hosts[category] === username) {
                    hosts[category] = lobbies[category][0] || null;
                }
                io.to(category).emit("lobbyUpdate", {
                    category: category,
                    players: lobbies[category],
                    host: hosts[category],
                });
            }
        });
    });
    app.all("*", function (req, res) {
        return handle(req, res);
    });
    httpServer.listen(3000, function () {
        console.log("🚀 Server ready on http://localhost:3000");
    });
});
