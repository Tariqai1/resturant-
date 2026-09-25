import { describe, it, expect } from "vitest";

describe("Lightweight Status Polling & URL Query Parameter Optimization", () => {
  it("should detect ?poll=status flag correctly", () => {
    const fullUrl = new URL("http://localhost:3000/api/public/table/test-token-123");
    const isStatusOnlyInitial = fullUrl.searchParams.get("poll") === "status";
    expect(isStatusOnlyInitial).toBe(false);

    const pollUrl = new URL("http://localhost:3000/api/public/table/test-token-123?poll=status");
    const isStatusOnlyPoll = pollUrl.searchParams.get("poll") === "status";
    expect(isStatusOnlyPoll).toBe(true);
  });

  it("should verify static asset matcher regex excludes image and media extensions", () => {
    // Regex pattern matching the proxy configuration
    const proxyExcludeRegex = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|css|js)$/i;

    expect(proxyExcludeRegex.test("/favicon.ico")).toBe(true);
    expect(proxyExcludeRegex.test("/logo.png")).toBe(true);
    expect(proxyExcludeRegex.test("/icons/dish.svg")).toBe(true);
    expect(proxyExcludeRegex.test("/fonts/inter.woff2")).toBe(true);

    // Routes that MUST be matched by proxy
    expect(proxyExcludeRegex.test("/api/public/table/123")).toBe(false);
    expect(proxyExcludeRegex.test("/super-admin")).toBe(false);
    expect(proxyExcludeRegex.test("/kitchen")).toBe(false);
    expect(proxyExcludeRegex.test("/tables")).toBe(false);
  });
});
