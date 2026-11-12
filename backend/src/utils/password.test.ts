import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the original password against its hash", async () => {
    const hash = await hashPassword("Password123!");
    expect(hash).not.toBe("Password123!");
    expect(await verifyPassword("Password123!", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("Password123!");
    expect(await verifyPassword("password123!", hash)).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });
});
