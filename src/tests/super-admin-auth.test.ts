import { describe, it, expect } from "vitest";
import { getSuperAdminEmails } from "@/lib/auth/super-admin";

describe("Super Admin Security & Email Validation", () => {
  it("should contain official platform owners and exclude typo domains", () => {
    const emails = getSuperAdminEmails();
    expect(emails).toContain("tariqfsd9@gmail.com");
    expect(emails).toContain("tarique@gmail.com");

    // QA Security: verify typo domain 'tarique@gmai.com' has been eliminated
    expect(emails).not.toContain("tarique@gmai.com");
    for (const email of emails) {
      expect(email.endsWith("@gmai.com")).toBe(false);
      expect(email.includes("@")).toBe(true);
    }
  });

  it("should normalize emails to lowercase", () => {
    const emails = getSuperAdminEmails();
    for (const email of emails) {
      expect(email).toBe(email.toLowerCase());
    }
  });
});
