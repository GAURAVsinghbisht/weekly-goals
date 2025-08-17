import React, { useEffect, useMemo, useState } from "react";
import { doc, getDoc, getDocFromCache, serverTimestamp, setDoc, enableNetwork } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import type { Profile } from "../lib/core";
import { ensureFirebase } from "../lib/store";
import { uid } from "../lib/core";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";

function getProviderPhoto(u: User | null | undefined): string | null {
  if (!u) return null;
  if (u.photoURL) return u.photoURL;
  const fromProvider = u.providerData?.find(p => !!p?.photoURL)?.photoURL;
  return fromProvider || null;
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null); // what we actually display
  const [profile, setProfile] = useState<Profile>({ name: "", age: "", sex: "", email: "", bloodGroup: "", maritalStatus: "", occupation: "", photoUrl: "" });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const { db, storage } = ensureFirebase();
  const auth = getAuth();
  const [authUser, setAuthUser] = useState<User | null>(auth.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setAuthUser(u));
    return () => unsub();
  }, [auth]);

  // pick profileId: prefer uid when signed in, else local anon id
  const profileIdKey = "goal-challenge:profileId";
  const [profileId, setProfileId] = useState<string>(() => {
    const uidFromAuth = auth?.currentUser?.uid;
    if (uidFromAuth) return uidFromAuth;
    const existing = localStorage.getItem(profileIdKey);
    if (existing) return existing;
    const id = uid();
    localStorage.setItem(profileIdKey, id);
    return id;
  });
  useEffect(() => {
    if (authUser?.uid) setProfileId(authUser.uid);
  }, [authUser]);

  // Load profile and compute preview with precedence: Uploaded (profile.photoUrl) > Provider photo > Placeholder
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null); setInfo(null);
        if (!db) { setError("Firebase not configured."); return; }
        try { await enableNetwork(db); } catch { /* noop */ }
        const ref = doc(db, "profiles", profileId);
        let snap: any;
        try { snap = await getDoc(ref); } catch (e: any) {
          if (e?.code === "unavailable" || /offline/i.test(String(e?.message))) {
            try { snap = await getDocFromCache(ref); setInfo("Loaded from local cache (offline)."); } catch { /* ignore */ }
          } else { throw e; }
        }

        const providerPhoto = getProviderPhoto(authUser);
        if (snap && snap.exists()) {
          const data = snap.data() as Profile;
          setProfile({
            name: data.name || "",
            age: (data.age as number) ?? "",
            sex: (data.sex as any) ?? "",
            email: data.email || authUser?.email || "",
            bloodGroup: data.bloodGroup || "",
            maritalStatus: (data.maritalStatus as any) ?? "",
            occupation: (data.occupation as any) ?? "",
            photoUrl: data.photoUrl || "",
          });
          const effective = (data.photoUrl && data.photoUrl.length > 0) ? data.photoUrl : (providerPhoto || null);
          setPreview(effective);
        } else {
          setProfile(p => ({ ...p, email: authUser?.email || "" }));
          setPreview(providerPhoto || null);
        }
      } catch (e: any) {
        console.error("Profile load error:", e);
        setError(e?.message || "Failed to load profile. Check Firebase config & connectivity.");
      } finally { setLoading(false); }
    })();
  }, [db, profileId, authUser]);

  // When selecting a new file, always show it immediately
  const onFile = (f: File | null) => {
    setPhotoFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      // If user clears selection, fall back to stored photo or provider photo
      const providerPhoto = getProviderPhoto(authUser);
      const fallback = profile.photoUrl || providerPhoto || null;
      setPreview(fallback);
    }
  };

  // Save: if user uploaded, upload & store that URL; otherwise, if no stored photoUrl, store provider photo (so future reloads don’t depend on provider).
  const save = async () => {
    setError(null); setInfo(null);
    if (!profile.name) { setError("Name is required"); return; }
    try {
      setSaving(true);
      if (!db) { setError("Firebase not configured." ); return; }

      let photoUrl = profile.photoUrl || "";
      if (photoFile && storage) {
        const blob = await photoFile.arrayBuffer();
        const ref = storageRef(storage, `profiles/${profileId}`);
        await uploadBytes(ref, new Blob([blob], { type: photoFile.type || "image/jpeg" }));
        photoUrl = await getDownloadURL(ref);
      } else if (!photoUrl) {
        // If no explicit upload, persist provider photo if available
        const providerPhoto = getProviderPhoto(authUser);
        if (providerPhoto) photoUrl = providerPhoto;
      }

      const payload: Profile = { ...profile, photoUrl };
      await setDoc(doc(db, "profiles", profileId), { ...payload, updatedAt: serverTimestamp() }, { merge: true });

      // Update local state/preview with whatever we saved
      setProfile(p => ({ ...p, photoUrl }));
      setPreview(photoUrl || getProviderPhoto(authUser));
      setInfo("Profile saved.");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to save. Verify Firebase config, rules & network.");
      return;
    } finally { setSaving(false); }
  };

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Profile</h2>
          <span className="text-xs text-neutral-500">Profile ID: <span className="font-mono">{profileId}</span></span>
        </div>

        {error && <div className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        {info && !error && <div className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{info}</div>}

        {loading ? <div className="text-sm text-neutral-500">Loading…</div> : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm">Name
              <input className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
            </label>
            <label className="text-sm">Age
              <input type="number" min={0} className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" value={profile.age as any} onChange={e => setProfile(p => ({ ...p, age: e.target.value === "" ? "" : Number(e.target.value) }))} />
            </label>
            <label className="text-sm">Sex
              <select className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" value={profile.sex as any} onChange={e => setProfile(p => ({ ...p, sex: e.target.value as any }))}>
                <option value="">Select</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </label>
            <label className="text-sm">Email
              <input type="email" className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" value={profile.email || ""} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
            </label>
            <label className="text-sm">Blood Group
              <input className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" placeholder="e.g., O+" value={profile.bloodGroup || ""} onChange={e => setProfile(p => ({ ...p, bloodGroup: e.target.value }))} />
            </label>
            <label className="text-sm">Marital Status
              <select className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" value={profile.maritalStatus as any} onChange={e => setProfile(p => ({ ...p, maritalStatus: e.target.value as any }))}>
                <option value="">Select</option>
                <option>Single</option>
                <option>Married</option>
                <option>Other</option>
              </select>
            </label>
            <label className="text-sm">Occupation
              <select className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" value={profile.occupation as any} onChange={e => setProfile(p => ({ ...p, occupation: e.target.value as any }))}>
                <option value="">Select</option>
                <option>Job</option>
                <option>Business</option>
                <option>Student</option>
                <option>Other</option>
              </select>
            </label>
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button onClick={save} disabled={saving} className="rounded-xl bg-black px-4 py-2 text-sm text-white shadow-sm hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : "Save to Firebase"}</button>
        </div>
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-semibold">Profile Photo</div>
        {preview ? (
          <img src={preview} alt="Profile" className="mb-3 aspect-square w-full rounded-2xl object-cover" />
        ) : (
          <div className="mb-3 flex aspect-square w-full items-center justify-center rounded-2xl bg-neutral-100 text-xs text-neutral-500">No photo</div>
        )}
        <input type="file" accept="image/*" onChange={e => onFile(e.target.files?.[0] || null)} className="w-full text-sm" />
        <p className="mt-2 text-xs text-neutral-500">If you upload a photo, it overrides the sign-in provider picture. Otherwise your Google/GitHub/Facebook photo is shown.</p>
      </div>
    </div>
  );
}
