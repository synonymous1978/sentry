import React, { useState, useEffect, useRef, useCallback } from "react";
import AddPathModal from "@/pages/AddPathModel";
import {
  MapPin,
  AlertTriangle,
  CheckCircle,
  Truck,
  AlertOctagon,
  Activity,
  Plus,
} from "lucide-react";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@/styles/LeafletMapViewer.css";


const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

function haversine([lat1, lon1], [lat2, lon2]) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371e3; // meters
  const φ1 = toRad(lat1),
    φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // meters
}




export default function LeafletMapViewer({ start, destination, trackingId }) {
  // UI/state
  const [status, setStatus] = useState({
    text: "Initializing Map...",
    cardClass: "status-gray",
    icon: <Activity className="w-5 h-5 mr-2" />,
  });
  const [userLocation, setUserLocation] = useState(null);
  const [currentPositionText, setCurrentPositionText] = useState("N/A");
  const [risk, setRisk] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // map refs
  const mapRef = useRef(null);
  const tileRef = useRef(null);
  const routeLayerRef = useRef(null);
  const zoneLayerRef = useRef(null);
  const riskAreaLayerRef = useRef(null);
  const positionMarkerRef = useRef(null); // driver marker (animated)
  const breadcrumbRef = useRef(null);
  const breadcrumbCoordsRef = useRef([]); // array of [lat, lon]
  const isMapInitialized = useRef(false);

  // driver animation state for speed/heading
  const driverPrevRef = useRef(null); // {lat, lon, t}
  const driverSpeedRef = useRef(0); // m/s (smoothed)
  const animationFrameRef = useRef(null);

  // ---------------------------
  // MAP INITIALIZATION
  // ---------------------------
  useEffect(() => {
    if (isMapInitialized.current) return;

    const defaultCenter = [28.65, 77.22];
    const defaultZoom = 12;

    const mapInstance = L.map("map", { zoomControl: true }).setView(
      defaultCenter,
      defaultZoom
    );
    mapRef.current = mapInstance;

    tileRef.current = L.tileLayer(LIGHT_TILES, {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(mapInstance);

    routeLayerRef.current = L.geoJSON(null, {
      style: { color: "#1d4ed8", weight: 4, dashArray: "10,5", opacity: 0.9 },
    }).addTo(mapInstance);

    zoneLayerRef.current = L.geoJSON(null, {
      style: {
        fillColor: "#6ee7b7",
        color: "#10b981",
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.25,
      },
    }).addTo(mapInstance);

    riskAreaLayerRef.current = L.geoJSON(null, {
      style: {
        fillColor: "#c2410c",
        color: "#c2410c",
        weight: 1,
        opacity: 0.9,
        fillOpacity: 0.5,
      },
    }).addTo(mapInstance);

    // default driver marker (invisible until we get first position)
    positionMarkerRef.current = L.marker(defaultCenter, {
      icon: driverIcon(0),
      rotationAngle: 0,
      rotationOrigin: "center center",
    }).addTo(mapInstance);

    // breadcrumb polyline
    breadcrumbRef.current = L.polyline([], { color: "#2563eb", weight: 3 }).addTo(
      mapInstance
    );

    isMapInitialized.current = true;
    setTimeout(() => mapRef.current?.invalidateSize(), 300);
  }, []);

  // helper: returns a DivIcon for driver with rotation
  function driverIcon(headingDegrees = 0) {
    const svg = encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 24 24'>
        <g transform="rotate(${headingDegrees},12,12)">
          <path fill="#111827" d="M12 2 L15 12 L12 10 L9 12 Z" />
          <circle cx="12" cy="12" r="3" fill="#3b82f6" />
        </g>
      </svg>`
    );
    return L.divIcon({
      className: "driver-div-icon",
      html: `<img src="data:image/svg+xml;utf8,${svg}" style="transform-origin:center center;"/>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  }

  // smooth animate marker from current to target over duration (ms)
  function animateMarkerTo(marker, fromLatLng, toLatLng, duration = 800) {
    if (!marker) return;
    const start = performance.now();
    const [fromLat, fromLng] = fromLatLng;
    const [toLat, toLng] = toLatLng;

    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const lat = fromLat + (toLat - fromLat) * easeOutQuad(t);
      const lng = fromLng + (toLng - fromLng) * easeOutQuad(t);
      marker.setLatLng([lat, lng]);
      if (t < 1) animationFrameRef.current = requestAnimationFrame(step);
    }
    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(step);
  }
  function easeOutQuad(t) {
    return t * (2 - t);
  }

  // ---------------------------
  // LIVE WEBSOCKET GPS STREAM
  // ---------------------------
  useEffect(() => {
    if (!trackingId) return;
    const token = "YOUR_JWT_TOKEN"; // replace with real JWT

    const ws = new WebSocket(
      `wss://sentry-1.onrender.com/ws?token=${token}&trackingId=${trackingId}`
    );

    ws.onopen = () => {
      setStatus({
        text: "Connected — waiting for GPS...",
        cardClass: "status-yellow",
        icon: <Truck className="w-5 h-5 mr-2" />,
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // pass to handler
        handleWebSocketMessage(data);
      } catch (e) {
        console.error("Invalid WS message:", e);
      }
    };

    ws.onerror = (err) => {
      console.error("WS error", err);
      setStatus({
        text: "WebSocket error. Check server.",
        cardClass: "status-red",
        icon: <AlertOctagon className="w-5 h-5 mr-2" />,
      });
    };

    ws.onclose = () => {
      setStatus({
        text: "Disconnected. Attempting reconnect...",
        cardClass: "status-gray",
        icon: <Activity className="w-5 h-5 mr-2" />,
      });
      // attempt reconnect after a bit (reload as fallback)
      setTimeout(() => {
        // try a soft reconnect by reloading page (simple)
        window.location.reload();
      }, 3000);
    };

    return () => {
      ws.close();
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [trackingId]);

  // ---------------------------
  // USER LIVE LOCATION (CLIENT SIDE)
  // ---------------------------
  useEffect(() => {
    if (!navigator.geolocation) {
      console.log("Geolocation is not supported");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLocation({ lat: latitude, lng: longitude });

        // optionally place/center a small user marker (reuse window.userMarker)
        if (mapRef.current && isMapInitialized.current) {
          if (!window.userMarker) {
            window.userMarker = L.circleMarker([latitude, longitude], {
              radius: 7,
              color: "#0ea5e9",
              fillColor: "#38bdf8",
              fillOpacity: 1,
            }).addTo(mapRef.current);
          } else {
            window.userMarker.setLatLng([latitude, longitude]);
          }
        }
      },
      (err) => console.error("Location error:", err),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ---------------------------
  // WEBSOCKET MESSAGE HANDLING + UI (route + updates)
  // ---------------------------
  const handleWebSocketMessage = useCallback((data) => {
    if (!mapRef.current || !isMapInitialized.current || !data) return;

    // INITIAL: backend provided route & zone & start
    if (data.type === "INITIAL") {
      try {
        if (data.route) {
          routeLayerRef.current.clearLayers();
          routeLayerRef.current.addData({ type: "Feature", geometry: data.route });
        }

        if (data.zone) {
          zoneLayerRef.current.clearLayers();
          zoneLayerRef.current.addData({ type: "Feature", geometry: data.zone });
        }

        if (data.zone) {
          const bounds = L.geoJSON(data.zone);
          mapRef.current.fitBounds(bounds.getBounds(), { padding: [50, 50] });
        }

        if (data.startLat && data.startLon) {
          // set driver marker and store prev
          const lat = data.startLat;
          const lon = data.startLon;
          const cur = positionMarkerRef.current;
          cur.setLatLng([lat, lon]);
          breadcrumbCoordsRef.current = [[lat, lon]];
          breadcrumbRef.current.setLatLngs(breadcrumbCoordsRef.current);
          driverPrevRef.current = { lat, lon, t: Date.now() };
          setCurrentPositionText(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
        }

        setStatus({
          text: "Route Ready — Streaming Live Data",
          cardClass: "status-green",
          icon: <CheckCircle className="w-5 h-5 mr-2" />,
        });
      } catch (e) {
        console.warn("INITIAL handling error", e);
      }
      return;
    }

    // UPDATE: live GPS update
    if (data.type === "UPDATE") {
      const { lat, lon, deviation, risk, riskyAreas } = data;
      if (lat == null || lon == null) return;

      const now = Date.now();
      const prev = driverPrevRef.current;
      // compute instantaneous speed if prev exists
      if (prev) {
        const dist = haversine([prev.lat, prev.lon], [lat, lon]); // meters
        const dt = Math.max(1, (now - prev.t) / 1000); // seconds
        const instSpeed = dist / dt; // m/s
        // smooth speed (EWMA)
        driverSpeedRef.current = driverSpeedRef.current
          ? driverSpeedRef.current * 0.7 + instSpeed * 0.3
          : instSpeed;
      }

      // update prev
      driverPrevRef.current = { lat, lon, t: now };

      // animate marker smoothly
      const marker = positionMarkerRef.current;
      const from = marker.getLatLng();
      // compute heading
      const heading = computeHeading([from.lat, from.lng], [lat, lon]);
      marker.setIcon(driverIcon(heading));
      animateMarkerTo(marker, [from.lat, from.lng], [lat, lon], 900);

      // breadcrumb
      breadcrumbCoordsRef.current.push([lat, lon]);
      // keep only last N points to avoid huge arrays
      if (breadcrumbCoordsRef.current.length > 200) {
        breadcrumbCoordsRef.current.shift();
      }
      breadcrumbRef.current.setLatLngs(breadcrumbCoordsRef.current);

      // risky areas
      riskAreaLayerRef.current.clearLayers();
      if (riskyAreas?.length) {
        riskAreaLayerRef.current.addData({
          type: "FeatureCollection",
          features: riskyAreas,
        });
      }

      // update status logic
      let newStatus = {
        text: "Status: Inside Safe Zone",
        cardClass: "status-green",
        icon: <CheckCircle className="w-5 h-5 mr-2" />,
      };
      if (deviation) {
        newStatus = {
          text: "⚠️ DEVIATION ALERT! Outside Safe Zone.",
          cardClass: "status-red",
          icon: <AlertOctagon className="w-5 h-5 mr-2" />,
        };
      } else if (risk > 0.65) {
        newStatus = {
          text: "⚠️ HIGH RISK DETECTED!",
          cardClass: "status-yellow",
          icon: <AlertTriangle className="w-5 h-5 mr-2" />,
        };
      }

      setStatus(newStatus);
      setRisk(risk ?? 0);
      setCurrentPositionText(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
    }
  }, []);

  // compute heading in degrees from two coords [lat,lng]
  function computeHeading([lat1, lng1], [lat2, lng2]) {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
    let brng = toDeg(Math.atan2(y, x));
    brng = (brng + 360) % 360;
    return brng;
  }

  // ---------------------------
  // ETA / distance utilities (simple estimator)
  // ---------------------------
  const computeRemainingDistance = useCallback(() => {
    // we try to approximate remaining distance along breadcrumb to final route end:
    const coords = breadcrumbCoordsRef.current;
    if (!coords.length) return 0;
    // if routeLayer has GeoJSON route, try to find route end
    const routeLayer = routeLayerRef.current;
    if (routeLayer && routeLayer.toGeoJSON) {
      const gj = routeLayer.toGeoJSON();
      const geom = gj?.features?.[0]?.geometry;
      if (geom && geom.coordinates && geom.coordinates.length) {
        // OSRM geojson is [lon,lat] pairs; convert to [lat,lon]
        const end = geom.coordinates[geom.coordinates.length - 1];
        const last = coords[coords.length - 1];
        const endLatLon = [end[1], end[0]];
        return haversine(last, endLatLon); // meters
      }
    }
    // fallback: distance between last breadcrumb point and last point in array
    return 0;
  }, []);

  const computeETA = useCallback(() => {
    const dist = computeRemainingDistance(); // meters
    const speed = Math.max(0.1, driverSpeedRef.current || 0.1); // m/s fallback
    const seconds = dist / speed;
    if (!isFinite(seconds) || seconds > 60 * 60 * 24) return null;
    return seconds; // sec
  }, [computeRemainingDistance]);

  // ---------------------------
  // UI Helpers: locate me and tile toggle
  // ---------------------------
  function locateMe() {
    if (!userLocation || !mapRef.current) return;
    mapRef.current.flyTo([userLocation.lat, userLocation.lng], 15, {
      animate: true,
      duration: 0.8,
    });
  }

  function toggleDark() {
    if (!mapRef.current) return;
    setDarkMode((d) => {
      const newMode = !d;
      tileRef.current && mapRef.current.removeLayer(tileRef.current);
      tileRef.current = L.tileLayer(newMode ? DARK_TILES : LIGHT_TILES, {
        maxZoom: 19,
        attribution: newMode
          ? "© CartoDB, OpenStreetMap contributors"
          : "© OpenStreetMap contributors",
      }).addTo(mapRef.current);
      return newMode;
    });
  }

  // formatted ETA string
  const etaSeconds = computeETA();
  const etaText =
    etaSeconds == null
      ? "—"
      : etaSeconds < 60
      ? `${Math.round(etaSeconds)}s`
      : etaSeconds < 3600
      ? `${Math.floor(etaSeconds / 60)}m`
      : `${Math.floor(etaSeconds / 3600)}h ${Math.floor((etaSeconds % 3600) / 60)}m`;

  const remainingMeters = Math.round(computeRemainingDistance());

  // ---------- Render ----------
  return (
    <>
      <div className="leaflet-container">
        {/* SIDEBAR */}
        <div className="sidebar">
          <h1 className="sidebar-title">Live Route Monitor</h1>
          <p className="sidebar-subtitle">
            Real-time GPS, Geofence & ML Risk Monitoring
          </p>

          {/* ROUTE INFO */}
          <div className="route-info">
            <h2 className="route-heading">Current Route</h2>
            <div className="route-details">
              <div>
                <span className="label">
                  <MapPin className="w-4 h-4 mr-2 text-green-600" /> Start:
                </span>
                <p className="value">{start}</p>
              </div>
              <div>
                <span className="label">
                  <MapPin className="w-4 h-4 mr-2 text-red-600" /> Destination:
                </span>
                <p className="value">{destination}</p>
              </div>
            </div>

            {/* ETA & distance */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <strong>ETA:</strong> {etaText}
                </div>
                <div>
                  <strong>Remaining:</strong>{" "}
                  {remainingMeters > 0 ? `${(remainingMeters / 1000).toFixed(2)} km` : "—"}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="mt-3 flex items-center space-x-2">
              <button
                onClick={() => {
                  // center on driver
                  const coords = breadcrumbCoordsRef.current;
                  if (coords.length && mapRef.current) {
                    mapRef.current.flyTo(coords[coords.length - 1], 15, {
                      animate: true,
                      duration: 0.8,
                    });
                  }
                }}
                className="px-3 py-1 rounded bg-red-400"
              >
                Center Driver
              </button>

              <button onClick={locateMe} className="px-3 py-1 rounded bg-red-400">
                Locate Me
              </button>

              <button onClick={toggleDark} className="px-3 py-1 rounded bg-red-400">
                Toggle {darkMode ? "Light" : "Dark"}
              </button>
            </div>
          </div>

          {/* STATUS CARD */}
          <div className={`status-card ${status.cardClass}`}>
            {status.icon}
            <p className="status-text">{status.text}</p>
          </div>

          {/* INFO */}
          <div className="info-block">
            <div>
              <span className="info-title">Driver GPS Position:</span>
              <p className="info-value">{currentPositionText}</p>

              <span className="info-title mt-3 block">Your Location:</span>
              <p className="info-value">
                {userLocation
                  ? `${userLocation.lat.toFixed(6)}, ${userLocation.lng.toFixed(6)}`
                  : "Detecting..."}
              </p>
            </div>
            <div>
              <span className="info-title">ML Risk Score:</span>
              <p className={`risk-score ${risk > 0.65 ? "text-red-600" : risk > 0.3 ? "text-yellow-600" : "text-green-600"}`}>
                {(risk * 100).toFixed(0)}%
              </p>
            </div>
          </div>
        </div>

        {/* MAP */}
        <div className="map-wrapper">
          <div id="map" className="map-view" />

          {isModalOpen && (
            <AddPathModal
              isVisible={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              onStartTracking={(s, d) => {
                console.log("Tracking started:", s, "→", d);
                setIsModalOpen(false);
              }}
            />
          )}

      
        </div>
      </div>
    </>
  );
}
