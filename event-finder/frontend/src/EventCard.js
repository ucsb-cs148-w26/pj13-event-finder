import React from "react";
import BookmarkStar from "./components/bookmarkStar";

function EventCard({ event, user, compact, distanceFromCenterMiles, onClick }) {
  return (
    <div
      onClick={onClick}
      style={onClick ? { cursor: "pointer" } : undefined}
      className={`bg-gray-50 rounded-lg border-2 border-gray-200 transition-all overflow-hidden flex flex-col hover:border-purple-500 hover:shadow-lg ${
        compact ? "min-w-0 w-full max-w-full" : ""
      } ${compact ? "" : "hover:-translate-y-1"}`}
    >
      <div className="relative">
        {event.image && (
          <img
            src={event.image}
            alt={event.name}
            className={`w-full object-cover bg-gray-200 ${compact ? "h-24" : "h-48"}`}
          />
        )}

        <BookmarkStar
          user={user}
          event={event}
          className="absolute top-3 right-3"
        />
      </div>

      <div className={`${compact ? "p-3 min-w-0" : "p-6"}`}>
        <h3
          className={`m-0 text-gray-800 font-bold break-words ${
            compact ? "mb-1 text-base" : "mb-3 text-xl"
          }`}
        >
          {event.name}
        </h3>

        {distanceFromCenterMiles != null && (
          <p className="m-2 text-gray-600 text-sm">
            📏 {distanceFromCenterMiles} miles from you
          </p>
        )}

        {event.venue && (
          <p className="m-2 text-gray-600 text-sm">🏢 {event.venue}</p>
        )}

        {event.location && (
          <p className="m-2 text-gray-600 text-sm">📍 {event.location}</p>
        )}

        <p className="m-2 text-gray-600 text-sm">
          📅 {event.date}
          {event.time && ` at ${event.time}`}
        </p>

        {event.priceRange && event.priceRange.min !== undefined && (
          <p className="m-2 text-gray-600 text-sm">
            💵 {event.priceRange.currency || "USD"} ${event.priceRange.min}
            {event.priceRange.max &&
              event.priceRange.max !== event.priceRange.min &&
              ` - $${event.priceRange.max}`}
          </p>
        )}

        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-block mt-4 text-purple-600 no-underline font-semibold transition-colors hover:text-purple-800 hover:underline"
          >
            View on {event.source} →
          </a>
        )}
      </div>
    </div>
  );
}

export default EventCard;