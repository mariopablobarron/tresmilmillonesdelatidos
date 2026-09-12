jest.mock("@/lib/csrf", () => ({
  validateOrigin: jest.fn().mockResolvedValue(undefined).mockReturnValue(true),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue(undefined).mockReturnValue({ allowed: true }),
}));

jest.mock("@/lib/password", () => ({
  hashPassword: jest.fn().mockResolvedValue(undefined).mockResolvedValue("hashed-pw"),
}));

const resolveIdentityMock = jest.fn();

jest.mock("@/lib/auth", () => ({
  attachSessionCookie: jest.fn().mockResolvedValue(undefined),
  InvalidSessionTokenError: class InvalidSessionTokenError extends Error {
    constructor() {
      super("INVALID_SESSION_TOKEN");
      this.name = "InvalidSessionTokenError";
    }
  },
  issueSessionToken: jest.fn().mockResolvedValue(undefined).mockReturnValue("session-token"),
  resolveIdentity: (...args: unknown[]) => resolveIdentityMock(...args),
}));

jest.mock("@/lib/email", () => ({
  sendUserEmail: jest.fn().mockResolvedValue(undefined).mockResolvedValue(undefined),
  buildVerificationEmail: jest.fn().mockResolvedValue(undefined).mockReturnValue({ subject: "v", html: "h", text: "t" }),
  buildWelcomeEmail: jest.fn().mockResolvedValue(undefined).mockReturnValue({ subject: "w", html: "h", text: "t" }),
}));

jest.mock("@/lib/telegram-link", () => ({
  issueWebLinkToken: jest.fn().mockResolvedValue(undefined).mockReturnValue(null),
}));

jest.mock("@/lib/alerts", () => ({ sendAlert: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/n8n", () => ({ dispatchN8nEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/services/onboarding-emails", () => ({
  scheduleOnboardingEmails: jest.fn().mockResolvedValue(undefined).mockResolvedValue(undefined),
}));
jest.mock("@/services/welcomeAvatarVideo", () => ({ triggerWelcomeAvatarVideoAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/services/invites", () => ({ bindInviteToUser: jest.fn().mockResolvedValue(undefined).mockResolvedValue(null) }));
jest.mock("@/services/latidos", () => ({ awardLatidos: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/services/events", () => ({ trackSafe: jest.fn().mockResolvedValue(undefined) }));

jest.mock("@/services/user", () => ({
  normalizeEmail: (e: string) => e.trim().toLowerCase(),
  getUserSessionProfile: jest.fn().mockResolvedValue(undefined).mockResolvedValue({
    id: "usr_new",
    email: "x@x.com",
    name: null,
    plan: "free",
    role: "user",
    consentGiven: true,
    remainingMessages: 50,
    hasActiveGoal: false,
  }),
}));

const userCreateMock = jest.fn().mockResolvedValue(undefined);
const userUpdateMock = jest.fn().mockResolvedValue(undefined);
const userFindUniqueMock = jest.fn().mockResolvedValue(undefined);

jest.mock("@/db/prisma", () => ({
  getPrismaClient: () => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        user: {
          findUnique: userFindUniqueMock,
          create: userCreateMock,
          update: userUpdateMock,
        },
      }),
    orgInvite: { update: jest.fn().mockResolvedValue(undefined).mockResolvedValue({}) },
  }),
}));

import { InvalidSessionTokenError } from "@/lib/auth";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { CURRENT_CONSENT_VERSION } from "@/lib/legal";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signup — consent validation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveIdentityMock.mockReset();
    resolveIdentityMock.mockRejectedValue(new InvalidSessionTokenError());
    userFindUniqueMock.mockResolvedValue(null); // email no existe
    userCreateMock.mockResolvedValue({ id: "usr_new" });
  });

  it("rechaza el signup cuando falta consentAccepted", async () => {
    const res = await POST(
      makeRequest({ email: "alice@example.com", password: "password1234" })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: "CONSENT_REQUIRED" });
    expect(userCreateMock).not.toHaveBeenCalled();
  });

  it("rechaza el signup cuando consentAccepted es false explícito", async () => {
    const res = await POST(
      makeRequest({
        email: "alice@example.com",
        password: "password1234",
        consentAccepted: false,
        consentVersion: CURRENT_CONSENT_VERSION,
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("CONSENT_REQUIRED");
  });

  it("rechaza el signup cuando la versión aceptada es antigua", async () => {
    const res = await POST(
      makeRequest({
        email: "alice@example.com",
        password: "password1234",
        consentAccepted: true,
        consentVersion: "0.9",
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("CONSENT_VERSION_MISMATCH");
    expect(userCreateMock).not.toHaveBeenCalled();
  });

  it("crea el usuario con consentGiven=true y consentVersion al aceptar", async () => {
    const res = await POST(
      makeRequest({
        email: "Alice@Example.com",
        password: "password1234",
        name: "Alice",
        consentAccepted: true,
        consentVersion: CURRENT_CONSENT_VERSION,
      })
    );
    const body = await res.json();
    if (res.status !== 200) console.error("status", res.status, "body", body);
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(userCreateMock).toHaveBeenCalledTimes(1);
    const createArg = userCreateMock.mock.calls[0][0];
    expect(createArg.data.email).toBe("alice@example.com");
    expect(createArg.data.consentGiven).toBe(true);
    expect(createArg.data.consentVersion).toBe(CURRENT_CONSENT_VERSION);
    expect(createArg.data.consentAt).toBeInstanceOf(Date);
  });

  it("al hacer upgrade desde anonymous también persiste consent", async () => {
    userFindUniqueMock.mockResolvedValue({ id: "usr_anon", passwordHash: null });
    resolveIdentityMock.mockResolvedValueOnce({ userId: "usr_anon" });

    const res = await POST(
      makeRequest({
        email: "anon@example.com",
        password: "password1234",
        consentAccepted: true,
        consentVersion: CURRENT_CONSENT_VERSION,
      })
    );
    expect(res.status).toBe(200);
    expect(userUpdateMock).toHaveBeenCalledTimes(1);
    const updateArg = userUpdateMock.mock.calls[0][0];
    expect(updateArg.data.consentGiven).toBe(true);
    expect(updateArg.data.consentVersion).toBe(CURRENT_CONSENT_VERSION);
  });

  it("no permite reclamar una cuenta passwordless con solo conocer su email", async () => {
    userFindUniqueMock.mockResolvedValue({ id: "usr_victim", passwordHash: null });
    resolveIdentityMock.mockResolvedValueOnce({ userId: "usr_attacker" });

    const res = await POST(
      makeRequest({
        email: "victim@example.com",
        password: "attacker-password",
        consentAccepted: true,
        consentVersion: CURRENT_CONSENT_VERSION,
      })
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, error: "EMAIL_TAKEN" });
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("no permite reclamar una cuenta passwordless sin una sesión propietaria", async () => {
    userFindUniqueMock.mockResolvedValue({ id: "usr_victim", passwordHash: null });

    const res = await POST(
      makeRequest({
        email: "victim@example.com",
        password: "attacker-password",
        consentAccepted: true,
        consentVersion: CURRENT_CONSENT_VERSION,
      })
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, error: "EMAIL_TAKEN" });
    expect(userUpdateMock).not.toHaveBeenCalled();
  });
});
