"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gradeCreativity = gradeCreativity;
// lib/gradeCreativity.ts
const openai_1 = __importDefault(require("openai"));
require("dotenv/config");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
async function gradeCreativity(question, answers) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            temperature: 0.7,
            messages: [
                {
                    role: "system",
                    content: `You are a trivia creativity grader. Your job is to rate how original, clever, or surprising a trivia question is.

Give a score from 1 to 10:
- 1 means boring, predictable, unoriginal
- 5 means average or typical trivia
- 10 means highly creative, funny, unexpected, or especially clever

Only respond with the number.`,
                },
                {
                    role: "user",
                    content: `Rate this:
Question: ${question}
Answers: ${answers.join(", ")}`,
                },
            ],
        });
        const ratingText = response.choices[0].message.content?.trim() || "0";
        const match = ratingText.match(/\d+(\.\d+)?/);
        const score = match ? parseFloat(match[0]) : 0;
        return Math.min(10, Math.max(1, score));
    }
    catch (err) {
        console.error("Failed to grade creativity:", err);
        return 1;
    }
}
