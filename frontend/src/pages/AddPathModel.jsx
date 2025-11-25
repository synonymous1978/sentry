import React, { useState } from "react";
import { MapPin, AlertTriangle, Truck, Loader2, X } from "lucide-react";
import "@/styles/AddPathModel.css";

export default function AddPathModal({ isVisible, onClose, onStartTracking }) {
  const [startLocation, setStartLocation] = useState("New Delhi");
  const [destination, setDestination] = useState("Mumbai");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isVisible) return null;

  const handleStartTracking = async (e) => {
    e.preventDefault();
    setError(null);

    if (!startLocation.trim() || !destination.trim()) {
      setError("Please enter both start and destination.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("https://sentry-1.onrender.com/api/start-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: startLocation, destination }),
      });

      const result = await res.json();

      // IMPORTANT FIX — avoid empty or undefined trackingId
      if (!result.trackingId) {
        setError("Backend did not return a valid tracking ID.");
        setIsLoading(false);
        return;
      }

      // Send validated data to parent component
      onStartTracking(startLocation, destination, result.trackingId);

      onClose();
    } catch (err) {
      setError("Failed to communicate with backend.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="add-path-overlay" onClick={onClose}>
      <div className="add-path-modal" onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button onClick={onClose} className="add-path-close" disabled={isLoading}>
          <X className="w-6 h-6" />
        </button>

        {/* Header */}
        <div className="add-path-header">
          <MapPin className="w-7 h-7 mr-2" />
          <h2>Start New Tracking</h2>
        </div>

        {/* Error */}
        {error && (
          <div className="add-path-error">
            <AlertTriangle className="w-5 h-5 mr-2" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleStartTracking}>
          <div className="add-path-form">
            <div>
              <label className="add-path-label">Start Location</label>
              <input
                type="text"
                value={startLocation}
                onChange={(e) => setStartLocation(e.target.value)}
                disabled={isLoading}
                className="add-path-input"
              />
            </div>

            <div>
              <label className="add-path-label">Destination</label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                disabled={isLoading}
                className="add-path-input"
              />
            </div>
          </div>

          <button type="submit" disabled={isLoading} className="add-path-submit">
            {isLoading ? (
              <Loader2 className="animate-spin mr-3 h-5 w-5" />
            ) : (
              <>
                <Truck className="w-5 h-5 mr-2" />
                Start Live Tracking
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
