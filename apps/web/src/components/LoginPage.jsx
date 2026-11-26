import { useState } from "react";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";

export default function LoginPage() {
  const { login } = useAuth();
  const [workspace, setWorkspace] = useState("school");
  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetStep, setResetStep] = useState("login");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  const resetPayload = {
    email: email.trim().toLowerCase(),
    ...(workspace === "school" ? { tenantSlug: tenantSlug.trim().toLowerCase() } : {}),
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login({ tenantSlug, email, password, workspace });
    } catch (err) {
      setError(err.message || "Unable to sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function requestReset(event) {
    event.preventDefault();
    setError("");
    setResetMessage("");
    setSubmitting(true);
    try {
      const response = await apiRequest("/auth/password-reset/request", {
        method: "POST",
        body: resetPayload,
      });
      setResetMessage(response.message || "If the account is eligible, a reset code has been sent.");
      setResetStep("complete");
    } catch (err) {
      setError(err.message || "Unable to request a reset code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function completeReset(event) {
    event.preventDefault();
    setError("");
    setResetMessage("");
    setSubmitting(true);
    try {
      const response = await apiRequest("/auth/password-reset/complete", {
        method: "POST",
        body: { ...resetPayload, code: resetCode.trim(), newPassword },
      });
      setResetMessage(response.message || "Password reset successfully.");
      setResetStep("login");
      setPassword("");
      setResetCode("");
      setNewPassword("");
    } catch (err) {
      setError(err.message || "Unable to reset password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand-mark">S</div>
        <div className="auth-brand-name">School<span>Suite</span></div>
        <p className="auth-eyebrow">SCHOOL MANAGEMENT PLATFORM</p>
        <h1>{resetStep === "login" ? "Welcome back" : resetStep === "request" ? "Reset your password" : "Choose a new password"}</h1>
        <p className="auth-description">
          {resetStep === "login"
            ? "Choose your workspace, then sign in with your account."
            : resetStep === "request"
              ? "Enter your account email. Student recovery codes are sent to the linked guardian's verified email."
              : "Enter the six-digit code sent to your recovery email."}
        </p>

        {resetStep === "login" && (
          <div className="workspace-choice" role="group" aria-label="Choose workspace">
            <button type="button" className={workspace === "school" ? "workspace-choice-active" : ""} aria-pressed={workspace === "school"} onClick={() => { setWorkspace("school"); setError(""); }}>
              School workspace
            </button>
            <button type="button" className={workspace === "platform" ? "workspace-choice-active" : ""} aria-pressed={workspace === "platform"} onClick={() => { setWorkspace("platform"); setError(""); }}>
              Platform Admin
            </button>
          </div>
        )}

        {resetStep === "login" && (
          <form className="auth-form" onSubmit={handleSubmit}>
            {workspace === "school" && <>
              <label htmlFor="tenantSlug">School ID</label>
              <input id="tenantSlug" name="tenantSlug" type="text" autoComplete="organization" placeholder="e.g. green-valley-school" value={tenantSlug} onChange={event => setTenantSlug(event.target.value)} required maxLength={100} />
              <small className="auth-field-hint">Enter the school ID provided by your administrator.</small>
            </>}
            <label htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" autoComplete="username" placeholder="you@school.com" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} />
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={event => setPassword(event.target.value)} required />
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : workspace === "platform" ? "Sign in to Platform Admin" : "Sign in to school workspace"}
            </button>
            <button type="button" className="auth-link" onClick={() => { setError(""); setResetMessage(""); setResetStep("request"); }}>Forgot password?</button>
          </form>
        )}

        {resetStep === "request" && (
          <form className="auth-form" onSubmit={requestReset}>
            {workspace === "school" && <>
              <label htmlFor="resetTenantSlug">School ID</label>
              <input id="resetTenantSlug" value={tenantSlug} onChange={event => setTenantSlug(event.target.value)} required maxLength={100} />
            </>}
            <label htmlFor="resetEmail">Account email</label>
            <input id="resetEmail" type="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} />
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? "Sending code…" : "Send reset code"}</button>
            <button type="button" className="auth-link" onClick={() => setResetStep("login")}>Back to sign in</button>
          </form>
        )}

        {resetStep === "complete" && (
          <form className="auth-form" onSubmit={completeReset}>
            <label htmlFor="resetCode">Six-digit email code</label>
            <input id="resetCode" inputMode="numeric" autoComplete="one-time-code" value={resetCode} onChange={event => setResetCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required minLength={6} maxLength={6} />
            <label htmlFor="newPassword">New password</label>
            <input id="newPassword" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required />
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? "Updating password…" : "Reset password"}</button>
            <button type="button" className="auth-link" onClick={() => setResetStep("request")}>Send another code</button>
            <button type="button" className="auth-link" onClick={() => setResetStep("login")}>Back to sign in</button>
          </form>
        )}
        {resetMessage && <p role="status">{resetMessage}</p>}
        <p className="auth-security-note">
          {workspace === "platform"
            ? "Platform administration is restricted to authorized platform administrator accounts."
            : "Your school data is protected by secure authentication and school-specific access controls."}
        </p>
      </section>
    </main>
  );
}
