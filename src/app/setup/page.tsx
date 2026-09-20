"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function InitialSetupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ restaurantName: "", ownerName: "", email: "", password: "" });
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Setup failed");
      router.push(`/login?created=${encodeURIComponent(form.email)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Setup failed");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="setup-shell">
      <section className="setup-panel">
        <div className="brand"><span className="brand-mark">OD</span><span>Order Desk</span></div>
        <span className="section-kicker">FIRST-TIME SETUP</span>
        <h1>Create your owner account</h1>
        <p className="setup-intro">Set up your restaurant and the first administrator.</p>
        <form className="setup-form" onSubmit={handleSubmit}>
          <label htmlFor="restaurantName">Restaurant name</label>
          <input id="restaurantName" required value={form.restaurantName} onChange={(event) => setForm({ ...form, restaurantName: event.target.value })} />
          <label htmlFor="ownerName">Your name</label>
          <input id="ownerName" required value={form.ownerName} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} />
          <label htmlFor="email">Owner email</label>
          <input id="email" type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" minLength={8} autoComplete="new-password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          {message && <p className="setup-error" role="alert">{message}</p>}
          <button className="login-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating account..." : "Create owner account"}<span>→</span></button>
        </form>
        <p className="login-note">This setup can only be completed once for an empty database.</p>
      </section>
      <aside className="login-aside"><span className="aside-mark">✦</span><p>Start with one secure owner account, then manage your whole team from Order Desk.</p><small>ORDER DESK · RESTAURANT OPERATIONS</small></aside>
    </main>
  );
}