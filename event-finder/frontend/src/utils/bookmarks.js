// src/utils/bookmarks.js
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
  
  export function bookmarkDocRef(uid, eventId) {
    return doc(db, "users", uid, "bookmarks", String(eventId));
  }
  
  export async function addBookmark(uid, event) {
    if (!uid) throw new Error("Not signed in");
    const eventId = String(event.id ?? event.eventId ?? event.url ?? event.name);
    const ref = bookmarkDocRef(uid, eventId);
  
    const payload = {
      eventId,
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
  
  export async function removeBookmark(uid, eventId) {
    if (!uid) throw new Error("Not signed in");
    await deleteDoc(bookmarkDocRef(uid, String(eventId)));
  }
  
  export function subscribeToBookmarks(uid, onChange, onError) {
    if (!uid) {
      onChange([]);
      return () => {};
    }
    const q = query(collection(db, "users", uid, "bookmarks"), orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        onChange(rows);
      },
      onError
    );
  }