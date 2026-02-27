"use client";

import { FormEvent, useMemo, useState } from "react";
import { signIn } from "next-auth/react";

type Props = {
  callbackUrl: string;
  error?: string;
};

export default function SignInPanel({ callbackUrl, error = "" }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [showLocal, setShowLocal] = useState(false);

  const errorMessage = useMemo(() => {
    if (error === "no_matching_user_account_found") {
      return "No matching user account found. Contact an administrator to be added.";
    }

    if (error === "CredentialsSignin") {
      return "Local login failed. Check username/password.";
    }

    if (error) {
      return "Sign-in failed. Please try again.";
    }

    return "";
  }, [error]);

  async function onEntraSignIn() {
    setStatus("Redirecting to Microsoft Entra ID...");
    await signIn("azure-ad", { callbackUrl });
  }

  async function onLocalSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Signing in with local account...");

    const response = await signIn("credentials", {
      username,
      password,
      callbackUrl,
      redirect: false,
    });

    if (!response || response.error) {
      setStatus("Local login failed.");
      return;
    }

    window.location.href = response.url || callbackUrl;
  }

  return (
    <main className="shell-bg min-h-screen px-5 py-6 md:px-8 md:py-8 text-slate-900">
      <div className="mx-auto grid min-h-[80vh] max-w-5xl place-items-center">
        <section className="glass-panel w-full max-w-xl rounded-3xl p-6 md:p-8">
          <p className="inline-flex w-fit items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold tracking-wide text-blue-700">
            OPERATIONS COMMUNICATION HUB
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Sign in to Email Alerts & Marketing Studio</h1>
          <p className="mt-2 text-sm subtle-text">
            Use your approved Entra ID account. Local login is available for emergency admin access only.
          </p>

          {errorMessage ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p> : null}
          {status ? <p className="mt-3 text-xs subtle-text">{status}</p> : null}

          <button type="button" className="primary-btn mt-4 w-full" onClick={onEntraSignIn}>
            Continue with Microsoft Entra ID
          </button>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <button
              type="button"
              className="text-xs font-semibold text-slate-500 underline underline-offset-2 hover:text-slate-700"
              onClick={() => setShowLocal((value) => !value)}
            >
              {showLocal ? "Hide local admin login" : "Use local admin login"}
            </button>

            {showLocal ? (
              <form onSubmit={onLocalSignIn} className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Emergency access</p>
                <input
                  className="field mb-2"
                  placeholder="Local username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
                <input
                  className="field mb-2"
                  type="password"
                  placeholder="Local password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button type="submit" className="secondary-btn text-xs px-3 py-2">
                  Sign in (local)
                </button>
              </form>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
