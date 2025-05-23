
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

// Fix for default markers in React Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface EmergencyMessage {
  id: string;
  message: string;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  timestamp: Date;
  location?: { lat: number; lng: number };
  senderId: string;
}

interface EmergencyMapProps {
  messages: EmergencyMessage[];
  userLocation: { lat: number; lng: number } | null;
}

const EmergencyMap: React.FC<EmergencyMapProps> = ({ messages, userLocation }) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup>(L.layerGroup());

  useEffect(() => {
    if (!userLocation) return;

    // Initialize map
    if (!mapRef.current) {
      mapRef.current = L.map('emergency-map').setView([userLocation.lat, userLocation.lng], 13);

      // Add OpenStreetMap tiles (works offline if cached)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapRef.current);

      // Add markers layer group
      markersRef.current.addTo(mapRef.current);
    }

    // Clear existing markers
    markersRef.current.clearLayers();

    // Add user location marker
    const userIcon = L.divIcon({
      html: '📍',
      iconSize: [30, 30],
      className: 'user-location-marker'
    });

    L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
      .bindPopup('Your Location')
      .addTo(markersRef.current);

    // Add emergency message markers
    messages.forEach((msg) => {
      if (msg.location) {
        const urgencyColors = {
          HIGH: '#ef4444',
          MEDIUM: '#f59e0b',
          LOW: '#10b981'
        };

        const urgencyIcons = {
          HIGH: '🚨',
          MEDIUM: '⚠️',
          LOW: 'ℹ️'
        };

        const emergencyIcon = L.divIcon({
          html: `<div style="background-color: ${urgencyColors[msg.urgency]}; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${urgencyIcons[msg.urgency]}</div>`,
          iconSize: [24, 24],
          className: 'emergency-marker'
        });

        L.marker([msg.location.lat, msg.location.lng], { icon: emergencyIcon })
          .bindPopup(`
            <div style="min-width: 200px;">
              <div style="font-weight: bold; color: ${urgencyColors[msg.urgency]}; margin-bottom: 5px;">
                ${urgencyIcons[msg.urgency]} ${msg.urgency} PRIORITY
              </div>
              <div style="margin-bottom: 5px;">${msg.message}</div>
              <div style="font-size: 12px; color: #666;">
                ${msg.timestamp.toLocaleString()}<br>
                From: ${msg.senderId.substring(0, 8)}...
              </div>
            </div>
          `)
          .addTo(markersRef.current);
      }
    });

  }, [messages, userLocation]);

  return (
    <div 
      id="emergency-map" 
      className="w-full h-full rounded-lg"
      style={{ minHeight: '250px' }}
    />
  );
};

export default EmergencyMap;
