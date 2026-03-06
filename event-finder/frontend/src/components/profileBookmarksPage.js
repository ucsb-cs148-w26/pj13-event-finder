// src/components/profileBookmarksPage.js
import React, { useEffect, useState } from "react";
import { subscribeToBookmarks, removeBookmark } from "../utils/bookmarks";
import { Link } from "react-router-dom";

export default function ProfileBookmarksPage({ user }) {
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    setErr("");
    setLoading(true);

    const unsub = subscribeToBookmarks(
      user?.uid,
      (rows) => {
        setBookmarks(rows);
        setLoading(false);
      },
      (e) => {
        setErr(e.message || "Failed to load bookmarks");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user?.uid]);

  if (!user) {
    return (
      <div className="bg-white/80 backdrop-blur-lg border border-white/20 rounded-2xl shadow-xl p-6">
        <h2 className="m-0 mb-2 text-gray-800 text-3xl font-bold">Your Bookmarks</h2>
        <p className="m-0 text-gray-600">Sign in to save and view bookmarks.</p>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-lg border border-white/20 rounded-2xl shadow-xl p-6">
      <h2 className="m-0 mb-2 text-gray-800 text-3xl font-bold">Your Bookmarks</h2>

      {err && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-4 text-red-700">
          <p className="m-0">{err}</p>
        </div>
      )}

      {loading ? (
        <p className="text-purple-600">Loading bookmarks…</p>
      ) : bookmarks.length === 0 ? (
        <p className="text-gray-600">
          No bookmarks yet. Save some events from the{" "}
          <Link
            to="/"
            className="text-purple-600 font-semibold hover:underline"
          >
            results page
          </Link>.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
          {bookmarks.map((b) => (
            <div
              key={b.id}
              className="bg-gray-50 rounded-lg border-2 border-gray-200 overflow-hidden flex flex-col"
            >
              {b.image && (
                <img src={b.image} alt={b.name} className="w-full h-48 object-cover bg-gray-200" />
              )}

              <div className="p-6 flex flex-col flex-1">
                <h3 className="m-0 mb-3 text-gray-800 text-xl font-bold">{b.name}</h3>
                {b.venue && <p className="m-2 text-gray-600 text-sm">🏢 {b.venue}</p>}
                {b.location && <p className="m-2 text-gray-600 text-sm">📍 {b.location}</p>}
                {(b.date || b.time) && (
                  <p className="m-2 text-gray-600 text-sm">
                    📅 {b.date} {b.time ? `at ${b.time}` : ""}
                  </p>
                )}

                <div className="mt-auto pt-4 flex items-center justify-between">
                  {b.url ? (
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 font-semibold hover:underline"
                    >
                      View event →
                    </a>
                  ) : (
                    <span />
                  )}

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await removeBookmark(user.uid, b.eventId || b.id);
                      } catch (e) {
                        setErr(e.message || "Failed to remove bookmark");
                      }
                    }}
                    className="px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:border-purple-500"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}