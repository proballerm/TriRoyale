import dotenv from "dotenv";

// Match Next.js local development behavior by loading .env.local first.
dotenv.config({ path: ".env.local" });
dotenv.config();

void import("./server");
