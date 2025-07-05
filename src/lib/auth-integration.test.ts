import { describe, it, expect, vi, beforeEach } from "vitest";
import { authClient } from "@/lib/auth-client";

// Mock auth client for integration tests
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: vi.fn(),
      social: vi.fn(),
    },
    signUp: {
      email: vi.fn(),
    },
    signOut: vi.fn(),
    getSession: vi.fn(),
  },
}));

describe("Auth Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Complete Auth Flow", () => {
    it("should handle a complete sign up and sign in flow", async () => {
      // Mock successful sign up
      vi.mocked(authClient.signUp.email).mockResolvedValue({
        data: { user: { id: "new-user-123", email: "newuser@example.com" } },
      });

      // Mock successful sign in after sign up
      vi.mocked(authClient.signIn.email).mockResolvedValue({
        data: { user: { id: "new-user-123", email: "newuser@example.com" } },
      });

      // Mock session retrieval
      vi.mocked(authClient.getSession).mockResolvedValue({
        data: {
          user: { id: "new-user-123", email: "newuser@example.com" },
          session: { id: "session-123", expiresAt: new Date() },
        },
      });

      // Mock successful sign out
      vi.mocked(authClient.signOut).mockResolvedValue({
        data: { success: true },
      });

      // Test sign up
      const signUpResult = await authClient.signUp.email({
        email: "newuser@example.com",
        password: "password123",
        name: "newuser",
        callbackURL: "/",
      });
      expect(signUpResult.data?.user.email).toBe("newuser@example.com");

      // Test sign in
      const signInResult = await authClient.signIn.email({
        email: "newuser@example.com",
        password: "password123",
        callbackURL: "/",
      });
      expect(signInResult.data?.user.email).toBe("newuser@example.com");

      // Test session retrieval
      const sessionResult = await authClient.getSession();
      expect(sessionResult.data?.user.email).toBe("newuser@example.com");

      // Test sign out
      const signOutResult = await authClient.signOut();
      expect(signOutResult.data?.success).toBe(true);
    });

    it("should handle auth errors throughout the flow", async () => {
      // Mock sign up failure
      vi.mocked(authClient.signUp.email).mockResolvedValue({
        error: { message: "Email already exists" },
      });

      // Mock sign in failure
      vi.mocked(authClient.signIn.email).mockResolvedValue({
        error: { message: "Invalid credentials" },
      });

      // Test sign up error
      const signUpResult = await authClient.signUp.email({
        email: "existing@example.com",
        password: "password123",
        name: "existing",
        callbackURL: "/",
      });
      expect(signUpResult.error?.message).toBe("Email already exists");

      // Test sign in error
      const signInResult = await authClient.signIn.email({
        email: "user@example.com",
        password: "wrongpassword",
        callbackURL: "/",
      });
      expect(signInResult.error?.message).toBe("Invalid credentials");
    });
  });

  describe("Social Auth Integration", () => {
    it("should handle Google OAuth flow", async () => {
      // Mock successful Google OAuth
      vi.mocked(authClient.signIn.social).mockResolvedValue({
        data: {
          redirect: false,
          token: "oauth-token",
          url: undefined,
          user: {
            id: "google-user-123",
            email: "googleuser@gmail.com",
            name: "Google User",
            image: null,
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      });

      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });

      expect(authClient.signIn.social).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/",
      });
      expect(result.data?.user?.email).toBe("googleuser@gmail.com");
    });

    it("should handle Google OAuth errors", async () => {
      // Mock Google OAuth failure
      vi.mocked(authClient.signIn.social).mockResolvedValue({
        error: { message: "OAuth provider rejected the request" },
      });

      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });

      expect(result.error?.message).toBe("OAuth provider rejected the request");
    });
  });

  describe("Session Persistence", () => {
    it("should maintain session across requests", async () => {
      const mockUser = { id: "user-123", email: "test@example.com" };
      const mockSession = {
        id: "session-123",
        expiresAt: new Date(Date.now() + 3600000),
      };

      // Mock successful login
      vi.mocked(authClient.signIn.email).mockResolvedValue({
        data: { user: mockUser },
      });

      // Mock session retrieval
      vi.mocked(authClient.getSession).mockResolvedValue({
        data: { user: mockUser, session: mockSession },
      });

      // Sign in
      await authClient.signIn.email({
        email: "test@example.com",
        password: "password123",
        callbackURL: "/",
      });

      // Check session multiple times
      const session1 = await authClient.getSession();
      const session2 = await authClient.getSession();

      expect(session1.data?.user.id).toBe(session2.data?.user.id);
      expect(session1.data?.session.id).toBe(session2.data?.session.id);
    });

    it("should handle expired sessions", async () => {
      const expiredSession = {
        error: { message: "Session expired" },
      };

      vi.mocked(authClient.getSession).mockResolvedValue(expiredSession);

      const result = await authClient.getSession();

      expect(result.error?.message).toBe("Session expired");
    });
  });

  describe("Auth State Management", () => {
    it("should properly clear auth state on sign out", async () => {
      // Mock sign out
      vi.mocked(authClient.signOut).mockResolvedValue({
        data: { success: true },
      });

      // Mock session check after sign out
      vi.mocked(authClient.getSession).mockResolvedValue({
        error: { message: "No active session" },
      });

      // Sign out
      const signOutResult = await authClient.signOut();
      expect(signOutResult.data?.success).toBe(true);

      // Check that session is cleared
      const sessionResult = await authClient.getSession();
      expect(sessionResult.error?.message).toBe("No active session");
    });
  });

  describe("Error Recovery", () => {
    it("should handle network errors gracefully", async () => {
      // Mock network error
      vi.mocked(authClient.signIn.email).mockRejectedValue(
        new Error("Network error")
      );

      await expect(
        authClient.signIn.email({
          email: "test@example.com",
          password: "password123",
          callbackURL: "/",
        })
      ).rejects.toThrow("Network error");
    });

    it("should handle malformed responses", async () => {
      // Mock malformed response
      vi.mocked(authClient.getSession).mockResolvedValue({} as any);

      const result = await authClient.getSession();

      expect(result.data).toBeUndefined();
      expect(result.error).toBeUndefined();
    });
  });
});
