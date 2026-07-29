import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_TTL_SECONDS = 5 * 60;

type TournamentSocketTokenPayload = {
  playerId: string;
  displayName: string;
  expiresAt: number;
};

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for tournament socket authentication");
  return secret;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", getSecret()).update(encodedPayload).digest("base64url");
}

export function createTournamentSocketToken(playerId: string, displayName: string): string {
  const payload: TournamentSocketTokenPayload = {
    playerId: playerId.trim().toLowerCase().slice(0, 100),
    displayName: displayName.trim().replace(/\s+/g, " ").slice(0, 40) || "Player",
    expiresAt: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };

  if (!payload.playerId) throw new Error("A player identity is required");

  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyTournamentSocketToken(token: unknown): TournamentSocketTokenPayload | null {
  if (typeof token !== "string") return null;
  const [encodedPayload, providedSignature, extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra) return null;

  const expectedSignature = sign(encodedPayload);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<TournamentSocketTokenPayload>;
    if (
      typeof payload.playerId !== "string" ||
      typeof payload.displayName !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return {
      playerId: payload.playerId.slice(0, 100),
      displayName: payload.displayName.slice(0, 40),
      expiresAt: payload.expiresAt,
    };
  } catch {
    return null;
  }
}
