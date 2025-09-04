"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTriviaCollection = getTriviaCollection;
const mongodb_1 = __importDefault(require("./mongodb"));
async function getTriviaCollection() {
    const client = await mongodb_1.default;
    const db = client.db(); // or specify db name: client.db("trivia-db")
    return db.collection("triviaquestions");
}
