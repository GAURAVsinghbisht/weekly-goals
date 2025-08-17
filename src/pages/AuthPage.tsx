import React, { useEffect, useState } from "react";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { ensureFirebase } from "../lib/store";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  FacebookAuthProvider,
  GithubAuthProvider,
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

  const { db, auth, providers } = ensureFirebase();

  const afterAuth = async (user: any, fallbackName?: string) => {
    if (!db || !user) return;
    const displayName = user.displayName || fallbackName || "";
    const photoURL = user.photoURL || "";
    const providerIds = (user.providerData || []).map((p: any) => p.providerId);

    // Upsert into users collection
    await setDoc(
      doc(db, "users", user.uid),
      {
        uid: user.uid,
        email: user.email || email,
        displayName,
        photoURL,
        providerIds,
        lastLoginAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    // Seed/sync profile
    await setDoc(
      doc(db, "profiles", user.uid),
      {
        name: displayName,
        email: user.email || email,
        photoUrl: photoURL,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    onSignedIn?.();
  };

  const doEmail = async () => {
    if (!auth) { setError("Firebase is not configured."); return; }
    setError(null); setLoading(true);
    try {
      if (mode === "signup") {
        if (!email || !password) throw new Error("Email & password required");
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
        await afterAuth(cred.user, name);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        await afterAuth(cred.user);
      }
    } catch (e: any) {
      console.error(e); setError(e.message || "Authentication failed");
    } finally { setLoading(false); }
  };

  const doPopup = async (provider: "google" | "facebook" | "github") => {
    if (!auth) { setError("Firebase is not configured."); return; }
    setError(null); setLoading(true);
    try {
      let prov;
      if (provider === "google") prov = new GoogleAuthProvider();
      if (provider === "facebook") prov = new FacebookAuthProvider();
      if (provider === "github") prov = new GithubAuthProvider();
      const cred = await signInWithPopup(auth, prov!);
      await afterAuth(cred.user);
    } catch (e: any) {
      console.error(e); setError(e.message || "Authentication failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="mx-auto mt-6 max-w-xl rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
        <button className="text-sm text-indigo-600 hover:underline" onClick={() => setMode(m => m === "signup" ? "signin" : "signup")}>{mode === "signup" ? "Have an account? Sign in" : "New here? Create account"}</button>
      </div>

      {error && <div className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-1 gap-3">
        {mode === "signup" && (
          <label className="text-sm">Full name
            <input className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" value={name} onChange={e => setName(e.target.value)} />
          </label>
        )}
        <label className="text-sm">Email
          <input type="email" className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="text-sm">Password
          <input type="password" className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <button onClick={doEmail} disabled={loading} className="mt-1 rounded-xl bg-black px-4 py-2 text-sm text-white shadow-sm hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50">{loading ? "Please wait…" : (mode === "signup" ? "Create account" : "Sign in")}</button>
      </div>

      <div className="my-5 flex items-center gap-3 text-xs text-neutral-500"><div className="h-px flex-1 bg-neutral-200"/><span>or continue with</span><div className="h-px flex-1 bg-neutral-200"/></div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <button onClick={() => doPopup("google")} className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50">Google</button>
        <button onClick={() => doPopup("facebook")} className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50">Facebook</button>
        <button onClick={() => doPopup("github")} className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50">GitHub</button>
      </div>

      <p className="mt-4 text-xs text-neutral-500">Make sure you've enabled these providers in your Firebase Console and configured OAuth redirect URIs for Facebook/GitHub.</p>
    </div>
  );
}
