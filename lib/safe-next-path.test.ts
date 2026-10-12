import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/safe-next-path";

describe("safeNextPath", () => {
  describe("redirects to dashboard for dangerous values", () => {
    it("rejects a full https URL", () => {
      expect(safeNextPath("https://evil.example/phish")).toBe("/dashboard");
    });

    it("rejects a protocol-relative URL", () => {
      expect(safeNextPath("//evil.example/phish")).toBe("/dashboard");
    });

    it("rejects a percent-encoded protocol-relative URL", () => {
      expect(safeNextPath("%2F%2Fevil.example")).toBe("/dashboard");
    });

    it("rejects percent-encoded slashes after a single slash", () => {
      expect(safeNextPath("/%2F%2Fevil.example")).toBe("/dashboard");
    });

    it("rejects malformed percent-encoding", () => {
      expect(safeNextPath("/%E0%A4%A")).toBe("/dashboard");
    });

    it("rejects a path that starts with backslash", () => {
      expect(safeNextPath("/\\evil.example/phish")).toBe("/dashboard");
    });

    it("rejects a percent-encoded backslash after single slash", () => {
      expect(safeNextPath("/%5Cevil.example/phish")).toBe("/dashboard");
    });

    it("rejects a full http URL", () => {
      expect(safeNextPath("http://evil.example:3100/phish")).toBe("/dashboard");
    });

    it("rejects a javascript URL", () => {
      expect(safeNextPath("javascript:alert(1)")).toBe("/dashboard");
    });

    it("rejects an empty string", () => {
      expect(safeNextPath("")).toBe("/dashboard");
    });

    it("rejects null", () => {
      expect(safeNextPath(null)).toBe("/dashboard");
    });

    it("rejects undefined", () => {
      expect(safeNextPath(undefined)).toBe("/dashboard");
    });
  });

  describe("preserves safe same-origin paths", () => {
    it("keeps /dashboard unchanged", () => {
      expect(safeNextPath("/dashboard")).toBe("/dashboard");
    });

    it("keeps a path with query parameters", () => {
      expect(safeNextPath("/repositories/list?kind=rpm")).toBe("/repositories/list?kind=rpm");
    });

    it("keeps a path with percent-encoded query parameters", () => {
      expect(safeNextPath("/tasks/detail?pulp_href=%2Fpulp%2Fapi%2Fv3%2Ftasks%2Fx%2F")).toBe(
        "/tasks/detail?pulp_href=%2Fpulp%2Fapi%2Fv3%2Ftasks%2Fx%2F"
      );
    });
  });
});
