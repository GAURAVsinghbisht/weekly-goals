import React, { useEffect, useState } from "react";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { ensureFirebase } from "../lib/store";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  // FacebookAuthProvider,
  // GithubAuthProvider,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";

export default function AuthPage({ onSignedIn }: { onSignedIn?: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { db } = ensureFirebase(); // initialize the Firebase app + Firestore
  const auth = getAuth(); // get the Auth instance separately

  const afterAuth = async (user: any, fallbackName?: string) => {
    // Redirect immediately
    onSignedIn?.();

    // Fire-and-forget profile/user upsert (do not block UI)
    (async () => {
      try {
        const { db } = ensureFirebase();
        if (!db || !user) return;

        const displayName = user.displayName || fallbackName || "";
        const photoURL = user.photoURL || "";
        const providerIds = (user.providerData || []).map(
          (p: any) => p?.providerId
        );

        await Promise.allSettled([
          setDoc(
            doc(db, "users", user.uid),
            {
              uid: user.uid,
              email: user.email,
              displayName,
              photoURL,
              providerIds,
              lastLoginAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            },
            { merge: true }
          ),
          setDoc(
            doc(db, "profiles", user.uid),
            {
              name: displayName,
              email: user.email,
              photoUrl: photoURL,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          ),
        ]);
      } catch (e) {
        // Don’t surface errors to UI; just log for debugging
        console.warn("Post-auth upsert failed:", e);
      }
    })();
  };

  const doEmail = async () => {
    if (!auth) {
      setError("Service unavailable. Please try again later.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!email || !password) throw new Error("Email & password required");
        const cred = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        if (name) await updateProfile(cred.user, { displayName: name });
        await afterAuth(cred.user, name);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        await afterAuth(cred.user);
      }
    } catch (e: any) {
      console.error(e);
      setError("Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const doPopup = async (provider: "google" | "facebook" | "github") => {
    if (!auth) {
      setError("Service unavailable. Please try again later.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      let prov;
      if (provider === "google") prov = new GoogleAuthProvider();
      if (provider === "facebook") prov = new FacebookAuthProvider();
      if (provider === "github") prov = new GithubAuthProvider();
      const cred = await signInWithPopup(auth, prov!);
      await afterAuth(cred.user);
    } catch (e: any) {
      console.error(e);
      setError("Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto mt-6 max-w-xl rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h2>
        <button
          className="text-sm text-indigo-600 hover:underline"
          onClick={() => setMode((m) => (m === "signup" ? "signin" : "signup"))}
        >
          {mode === "signup"
            ? "Have an account? Sign in"
            : "New here? Create account"}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {mode === "signup" && (
          <label className="text-sm">
            Full name
            <input
              className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <label className="text-sm">
          Email
          <input
            type="email"
            className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          onClick={doEmail}
          disabled={loading}
          className="mt-1 rounded-xl bg-black px-4 py-2 text-sm text-white shadow-sm hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Please wait…"
            : mode === "signup"
            ? "Create account"
            : "Sign in"}
        </button>
      </div>

      <div className="my-5 flex items-center gap-3 text-xs text-neutral-500">
        <div className="h-px flex-1 bg-neutral-200" />
        <span>or continue with</span>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      <div className="flex justify-center">
        <button
          onClick={() => doPopup("google")}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm shadow-sm hover:bg-neutral-50"
          aria-label="Continue with Google"
        >
          {/* Google multi-color 'G' icon (inline SVG) */}
          <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
            <path
              fill="#FFC107"
              d="M43.611 20.083H42V20H24v8h11.303C33.882 32.538 29.419 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.156 7.961 3.039l5.657-5.657C34.869 6.053 29.7 4 24 4 12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20c0-1.341-.138-2.651-.389-3.917z"
            />
            <path
              fill="#FF3D00"
              d="M6.306 14.691l6.571 4.814C14.25 16.228 18.771 14 24 14c3.059 0 5.842 1.156 7.961 3.039l5.657-5.657C34.869 6.053 29.7 4 24 4 15.222 4 7.79 9.211 6.306 14.691z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.343 0 10.25-2.045 13.959-5.39l-6.466-5.476C29.419 36 26.864 37 24 37c-5.395 0-9.927-3.442-11.598-8.198l-6.541 5.036C7.292 39.918 15.088 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.611 20.083H42V20H24v8h11.303C34.828 31.045 29.661 34 24 34c-5.395 0-9.927-3.442-11.598-8.198l-6.541 5.036C7.292 39.918 15.088 44 24 44c10.85 0 19.77-8.694 19.996-19.5.004-.167.004-.333.004-.5 0-1.341-.138-2.651-.389-3.917z"
            />
          </svg>
          Continue with Google
        </button>
      </div>

      {/* <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <button
          onClick={() => doPopup("google")}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50"
        >
          Google
        </button>
        <button
          onClick={() => doPopup("facebook")}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50"
        >
          Facebook
        </button>
        <button
          onClick={() => doPopup("github")}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50"
        >
          GitHub
        </button>
      </div> */}
    </div>
  );
}
