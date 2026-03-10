// src/components/ProgressBar.jsx
import React from "react";

/**
 * ProgressBar component displays a visual progress bar with percentage.
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} label - Optional label to display above the bar
 */
export default function ProgressBar({ progress = 0, label = "Loading events..." }) {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  
  return (
    <div className="w-full bg-white/80 backdrop-blur-lg border border-white/20 rounded-2xl shadow-xl p-6 mb-6">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-sm">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${clampedProgress}%` }}
          />
        </div>
        <div className="text-right">
          <span className="text-xs font-medium text-gray-600">{Math.round(clampedProgress)}%</span>
        </div>
      </div>
    </div>
  );
}
