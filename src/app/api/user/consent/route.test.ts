jest.mock("@/lib/auth", () => ({
  attachSessionCookie: jest.fn((response: Response) => response),
  clearSessionCookie: jest.fn((response: Response) => response),
  InvalidSessionTokenError: class InvalidSessionTokenError extends Error {
    constructor() {
      super("Invalid or expired session token");
      this.name = "InvalidSessionTokenError";
    }
  },
  resolveIdentity: jest.fn(),
}));

jest.mock("@/db/prisma", () => ({
  getPrismaClient: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logError: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";
import { CURRENT_CONSENT_VERSION } from "@/lib/legal";
import {
  attachSessionCookie,
  clearSessionCookie,
  InvalidSessionTokenError,
  resolveIdentity,
} from "@/lib/auth";
import { getPrismaClient } from "@/db/prisma";

describe("POST /api/user/consent", () => {
  const findUnique = jest.fn();
  const update = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (getPrismaClient as jest.Mock).mockReturnValue({
      user: {
        findUnique,
        update,
      },
    });
  });

  it("persiste consentimiento con fecha actual en primera aceptación y setea cookie", async () => {
    (resolveIdentity as jest.Mock).mockResolvedValue({
      userId: "usr_consent_1",
      sessionToken: "session-token",
      shouldSetCookie: true,
      source: "generated",
    });
    findUnique.mockResolvedValue({
      consentGiven: false,
      consentAt: null,
      source: null,
    });
    update.mockResolvedValue({ id: "usr_consent_1" });

    const req = new NextRequest("http://localhost/api/user/consent", {
      method: "POST",
    });

    const before = Date.now();
    const response = await POST(req);
    const body = await response.json();
    const after = Date.now();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.consentGiven).toBe(true);
    expect(body.consentVersion).toBe(CURRENT_CONSENT_VERSION);
    const persistedAt = new Date(body.consentAt).getTime();
    expect(persistedAt).toBeGreaterThanOrEqual(before);
    expect(persistedAt).toBeLessThanOrEqual(after);

    const updateArg = update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "usr_consent_1" });
    expect(updateArg.data.consentGiven).toBe(true);
    expect(updateArg.data.consentVersion).toBe(CURRENT_CONSENT_VERSION);
    expect(updateArg.data.source).toBe("web");
    expect(updateArg.data.consentAt).toBeInstanceOf(Date);
    expect(attachSessionCookie).toHaveBeenCalledWith(response, "session-token");
  });

  it("preserva consentAt original al re-aceptar la misma versión", async () => {
    const originalConsentAt = new Date("2026-04-04T10:00:00.000Z");
    (resolveIdentity as jest.Mock).mockResolvedValue({
      userId: "usr_consent_1",
      sessionToken: "session-token",
      shouldSetCookie: false,
      source: "session",
    });
    findUnique.mockResolvedValue({
      consentGiven: true,
      consentAt: originalConsentAt,
      source: "web",
    });
    update.mockResolvedValue({ id: "usr_consent_1" });

    const req = new NextRequest("http://localhost/api/user/consent", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.consentAt).toBe(originalConsentAt.toISOString());
  });

  it("rechaza una versión de consent distinta a la actual", async () => {
    (resolveIdentity as jest.Mock).mockResolvedValue({
      userId: "usr_consent_1",
      sessionToken: "session-token",
      shouldSetCookie: false,
      source: "session",
    });

    const req = new NextRequest("http://localhost/api/user/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consentVersion: "0.0" }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("CONSENT_VERSION_MISMATCH");
    expect(update).not.toHaveBeenCalled();
  });

  it("devuelve 401 y limpia cookie si la sesión es inválida", async () => {
    (resolveIdentity as jest.Mock).mockRejectedValue(new InvalidSessionTokenError());

    const req = new NextRequest("http://localhost/api/user/consent", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Token inválido o expirado");
    expect(clearSessionCookie).toHaveBeenCalledWith(response);
  });
});
