// src/components/BookmarkStar.js
import React, { useEffect, useMemo, useState } from "react";
import { addBookmark, removeBookmark, subscribeToBookmark } from "../utils/bookmarks";
import { sha256Base64Url } from "../utils/safeID";

export default function BookmarkStar({ user, event, className = "" }) {
  const eventId = useMemo(
    () => String(event.id ?? event.eventId ?? event.url ?? event.name),
    [event]
  );

  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
  
    (async () => {
      const rawKey = String(event.id ?? event.eventId ?? event.url ?? event.name);
      const safeEventId =
        event.id || event.eventId
          ? String(event.id ?? event.eventId)
          : await sha256Base64Url(rawKey);
  
      if (!alive) return;
      setSaved(false);
      if (!user) return;
  
      const unsub = subscribeToBookmark(user.uid, safeEventId, setSaved, console.error);
      return unsub;
    })();
  
    return () => {
      alive = false;
    };
  }, [user, event]);

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