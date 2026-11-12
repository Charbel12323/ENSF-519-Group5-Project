import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { tokenHash } from "./tokens";

// tokens.ts imports the shared Prisma client; stub it so the test never needs a database.
vi.mock("./prisma", () => ({ prisma: {} }));

describe("tokenHash", () => {
  it("returns the SHA-256 hex digest of the token", () => {
    expect(tokenHash("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
    expect(tokenHash("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic and differs between tokens", () => {
    expect(tokenHash("token-1")).toBe(tokenHash("token-1"));
    expect(tokenHash("token-1")).not.toBe(tokenHash("token-2"));
  });
});
