import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Request, Response, NextFunction } from "express";

export interface AuthedRequest extends Request {
  user?: { email: string; name: string };
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) {
    const base = (process.env.CLIENT_URL || "").split(",")[0].trim().replace(/\/$/, "");
    jwks = createRemoteJWKSet(new URL(`${base}/api/auth/jwks`));
  }
  return jwks;
}

/**
 * Verifies the Bearer JWT issued by BetterAuth (jwt plugin) against the client's public JWKS.
 * No secret is shared between the client and the API.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Please log in to continue." });
  }
  try {
    const { payload } = await jwtVerify(header.slice(7), getJwks());
    if (typeof payload.email !== "string") throw new Error("Token has no email");
    (req as AuthedRequest).user = {
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : "Volunteer",
    };
    next();
  } catch {
    res.status(401).json({ message: "Your session is invalid or has expired. Please log in again." });
  }
}
