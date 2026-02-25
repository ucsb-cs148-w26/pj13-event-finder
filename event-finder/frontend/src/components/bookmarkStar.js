// src/components/BookmarkStar.js
import React, { useEffect, useMemo, useState } from "react";
import { addBookmark, removeBookmark, subscribeToBookmarks } from "../utils/bookmarks";

export default function BookmarkStar({ user, event, className = "" }) {
  const eventId = useMemo(
    () => String(event.id ?? event.eventId ?? event.url ?? event.name),
    [event]
  );

  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSaved(false);
    if (!user) return;

    const unsub = subscribeToBookmarks(user.uid, eventId, setSaved, console.error);
    return () => unsub();
  }, [user, eventId]);

  const toggle = async () => {
    if (!user) {
      alert("Sign in to bookmark events.");
      return;
    }
    if (busy) return;

    setBusy(true);
    try {
      if (saved) {
        await removeBookmark(user.uid, eventId);
      } else {
        await addBookmark(user.uid, event);
      }
      // saved state will update via onSnapshot subscription
    } catch (e) {
      console.error("Bookmark toggle failed:", e);
      alert(e.message || "Bookmark failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={saved ? "Remove bookmark" : "Add bookmark"}
      title={saved ? "Bookmarked" : "Bookmark"}
      className={
        "inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/90 border border-gray-200 shadow-sm " +
        "hover:border-purple-500 hover:shadow transition " +
        (busy ? "opacity-60 cursor-not-allowed " : "") +
        className
      }
    >
      <span className={"text-2xl leading-none " + (saved ? "text-yellow-500" : "text-gray-400")}>
        {saved ? "★" : "☆"}
      </span>
    </button>
  );
}