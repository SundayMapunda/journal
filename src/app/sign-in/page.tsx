"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "");

    const { error } =
      mode === "signup"
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message ?? "Something went wrong. Try again.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  const isSignIn = mode === "signin";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <p className="font-serif text-lg font-semibold">Journal</p>

      <h1 className="mt-8 font-serif text-3xl font-semibold leading-tight">
        {isSignIn ? "Welcome back" : "Start your journal"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {isSignIn
          ? "Sign in to read and write your entries."
          : "Create an account. Your entries stay private to you."}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-3">
        {!isSignIn && (
          <input
            name="name"
            placeholder="Your name"
            aria-label="Your name"
            autoComplete="name"
            required
            className="field"
          />
        )}
        <input
          name="email"
          type="email"
          placeholder="Email"
          aria-label="Email"
          autoComplete="email"
          required
          className="field"
        />
        <input
          name="password"
          type="password"
          placeholder="Password (at least 8 characters)"
          aria-label="Password"
          autoComplete={isSignIn ? "current-password" : "new-password"}
          required
          minLength={8}
          className="field"
        />

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn w-full">
          {loading ? "Please wait..." : isSignIn ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(isSignIn ? "signup" : "signin");
          setError("");
        }}
        className="link-quiet mt-6 self-start"
      >
        {isSignIn
          ? "No account yet? Create one"
          : "Already have an account? Sign in"}
      </button>
    </main>
  );
}
