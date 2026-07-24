import dotenv from "dotenv";

// Match Next.js local development behavior by loading .env.local first.
dotenv.config({ path: ".env.local" });
dotenv.config();

const requiredEnvironmentVariables = [
  "MONGODB_URI",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "OPENAI_API_KEY",
] as const;

const missingEnvironmentVariables = requiredEnvironmentVariables.filter(
  (name) => !process.env[name]?.trim(),
);

if (missingEnvironmentVariables.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvironmentVariables.join(", ")}`,
  );
}

void import("./server");
