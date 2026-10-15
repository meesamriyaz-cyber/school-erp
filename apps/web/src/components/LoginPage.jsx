import { useState } from "react";
import { useAuth } from "../context/authContext.js";
export default function LoginPage() {
  const { login } = useAuth();

  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login({ tenantSlug, email, password });
    } catch (err) {
      setError(err.message || "Unable to sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand-mark">S</div>

        <div className="auth-brand-name">
          School<span>Suite</span>
        </div>

        <p className="auth-eyebrow">SCHOOL MANAGEMENT</p>

        <h1>Welcome back</h1>
        <p className="auth-description">
          Sign in to access your school workspace.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="tenantSlug">School ID</label>
          <input
            id="tenantSlug"
            name="tenantSlug"
            type="text"
            autoComplete="organization"
            placeholder="e.g. green-valley-school"
            value={tenantSlug}
            onChange={(event) => setTenantSlug(event.target.value)}
            required
            maxLength={100}
          />
          <small className="auth-field-hint">
            Enter the school ID provided by your administrator.
          </small>

          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@school.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Signing in…" : "Sign in to workspace"}
          </button>
        </form>

        <p className="auth-security-note">
          Your school data is protected by secure authentication and
          school-specific access controls.
        </p>
      </section>
    </main>
  );
}