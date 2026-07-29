import { hashPassword, randomToken, signAccessToken, verifyAccessToken, verifyPassword } from "../src/auth/crypto";

describe("authentication cryptography", () => {
  it("hashes and verifies passwords without storing the cleartext", async () => {
    const password = "CorrectHorseBatteryStaple!";
    const encoded = await hashPassword(password);
    expect(encoded).not.toContain(password);
    await expect(verifyPassword(password, encoded)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", encoded)).resolves.toBe(false);
  });

  it("signs access tokens and rejects tampering", () => {
    const token = signAccessToken({ sub: "user-1", exp: Math.floor(Date.now() / 1000) + 60, jti: randomToken() }, "test-secret");
    expect(verifyAccessToken(token, "test-secret")?.sub).toBe("user-1");
    expect(verifyAccessToken(`${token}x`, "test-secret")).toBeNull();
  });
});
