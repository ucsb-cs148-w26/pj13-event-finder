import {
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
  } from "firebase/firestore";
import { db } from "./firebase";
import { sha256Base64Url } from "./safeID";

  export async function addBookmark(uid, event) {
    if (!uid) throw new Error("Not signed in");

    // Prefer real IDs; only hash when needed
    const rawKey = String(event.id ?? event.eventId ?? event.url ?? event.name);
    const eventId =
        event.id || event.eventId
        ? String(event.id ?? event.eventId)
        : await sha256Base64Url(rawKey);

    const ref = bookmarkDocRef(uid, eventId);

    const payload = {
        eventId,           // the doc id (safe)
        sourceKey: rawKey, // optional: keep original for debugging
        name: event.name || "",
        date: event.date || "",
        time: event.time || "",
        venue: event.venue || "",
        location: event.location || "",
        image: event.image || "",
        url: event.url || "",
        createdAt: serverTimestamp(),
    };

    await setDoc(ref, payload, { merge: true });
    return eventId;
  }
  
  export function bookmarkDocRef(uid, eventId) {
    return doc(db, "users", uid, "bookmarks", String(eventId));
  }
  
  export async function removeBookmark(uid, eventId) {
    if (!uid) throw new Error("Not signed in");
    await deleteDoc(bookmarkDocRef(uid, String(eventId)));
  }
  
  /** ✅ Profile page: subscribe to the LIST */
  export function subscribeToBookmarks(uid, onChange, onError) {
    if (!uid) {
      onChange?.([]);
      return () => {};
    }
    const q = query(collection(db, "users", uid, "bookmarks"), orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        onChange?.(rows);
      },
      onError
    );
  }
  
  export function subscribeToBookmark(uid, eventId, onSaved, onError) {
    if (!uid) {
      onSaved?.(false);
      return () => {};
    }
    const ref = bookmarkDocRef(uid, String(eventId));
    return onSnapshot(ref, (snap) => onSaved?.(snap.exists()), onError);
  }