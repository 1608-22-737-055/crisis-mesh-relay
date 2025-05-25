import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet-geometryutil';

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

interface NetworkTopology {
  nodes: Array<{ id: string; connections: string[] }>;
  edges: Array<{ from: string; to: string; quality: number }>;
}

interface DeviceLocation {
  peerId: string;
  location: { lat: number; lng: number };
  lastSeen: Date;
}

interface EnhancedEmergencyMapProps {
  messages: EmergencyMessage[];
  userLocation: { lat: number; lng: number } | null;
  networkTopology?: NetworkTopology;
  connectedPeers: string[];
  deviceLocations?: DeviceLocation[];
}

const EnhancedEmergencyMap: React.FC<EnhancedEmergencyMapProps> = ({ 
  messages, 
  userLocation, 
  networkTopology,
  connectedPeers,
  deviceLocations = []
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup>(L.layerGroup());
  const networkLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const coverageLayerRef = useRef<L.LayerGroup>(L.layerGroup());

  useEffect(() => {
    if (!userLocation) return;

    // Initialize map
    if (!mapRef.current) {
      mapRef.current = L.map('enhanced-emergency-map').setView([userLocation.lat, userLocation.lng], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapRef.current);

      // Add layer groups
      markersRef.current.addTo(mapRef.current);
      networkLayerRef.current.addTo(mapRef.current);
      coverageLayerRef.current.addTo(mapRef.current);
    }

    // Clear all layers
    markersRef.current.clearLayers();
    networkLayerRef.current.clearLayers();
    coverageLayerRef.current.clearLayers();

    // Add user location marker
    const userIcon = L.divIcon({
      html: '<div style="background: #3b82f6; border: 3px solid white; border-radius: 50%; width: 20px; height: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
      iconSize: [20, 20],
      className: 'user-location-marker'
    });

    L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
      .bindPopup('<div style="font-weight: bold; color: #3b82f6;">📍 Your Location</div>')
      .addTo(markersRef.current);

    // Add connected device markers
    deviceLocations.forEach((device) => {
      const isConnected = connectedPeers.includes(device.peerId);
      const deviceIcon = L.divIcon({
        html: `<div style="background: ${isConnected ? '#10b981' : '#6b7280'}; border: 2px solid white; border-radius: 50%; width: 16px; height: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [16, 16],
        className: 'device-marker'
      });

      L.marker([device.location.lat, device.location.lng], { icon: deviceIcon })
        .bindPopup(`
          <div style="min-width: 150px;">
            <div style="font-weight: bold; color: ${isConnected ? '#10b981' : '#6b7280'};">
              ${isConnected ? '🟢' : '⚫'} Device ${device.peerId.substring(0, 8)}...
            </div>
            <div style="font-size: 12px; color: #666;">
              Status: ${isConnected ? 'Connected' : 'Offline'}<br>
              Last seen: ${device.lastSeen.toLocaleTimeString()}
            </div>
          </div>
        `)
        .addTo(markersRef.current);
    });

    // Draw network topology connections
    if (networkTopology && deviceLocations.length > 0) {
      networkTopology.edges.forEach(edge => {
        const fromDevice = deviceLocations.find(d => d.peerId === edge.from);
        const toDevice = deviceLocations.find(d => d.peerId === edge.to);
        
        if (fromDevice && toDevice) {
          const connection = L.polyline([
            [fromDevice.location.lat, fromDevice.location.lng],
            [toDevice.location.lat, toDevice.location.lng]
          ], {
            color: '#10b981',
            weight: 2,
            opacity: 0.7,
            dashArray: '5, 10'
          });
          
          connection.bindPopup(`
            <div>
              <strong>Network Connection</strong><br>
              Quality: ${Math.round(edge.quality * 100)}%<br>
              From: ${edge.from.substring(0, 8)}...<br>
              To: ${edge.to.substring(0, 8)}...
            </div>
          `);
          
          networkLayerRef.current.addLayer(connection);
        }
      });
    }

    // Add communication range circles
    const communicationRange = 1000; // meters
    if (userLocation) {
      const rangeCircle = L.circle([userLocation.lat, userLocation.lng], {
        radius: communicationRange,
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.1,
        weight: 2,
        opacity: 0.5
      });
      coverageLayerRef.current.addLayer(rangeCircle);
    }

    // Add coverage polygon for connected devices
    if (deviceLocations.length >= 3) {
      const connectedDeviceCoords = deviceLocations
        .filter(device => connectedPeers.includes(device.peerId))
        .map(device => [device.location.lat, device.location.lng] as [number, number]);
      
      if (connectedDeviceCoords.length >= 3) {
        // Add user location to create mesh polygon
        connectedDeviceCoords.push([userLocation.lat, userLocation.lng]);
        
        const meshPolygon = L.polygon(connectedDeviceCoords, {
          color: '#10b981',
          fillColor: '#10b981',
          fillOpacity: 0.1,
          weight: 2,
          opacity: 0.6
        });
        
        meshPolygon.bindPopup(`
          <div>
            <strong>🌐 Mesh Network Coverage</strong><br>
            Connected devices: ${connectedPeers.length}<br>
            Coverage area: Active mesh network
          </div>
        `);
        
        coverageLayerRef.current.addLayer(meshPolygon);
      }
    }

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
          html: `<div style="background-color: ${urgencyColors[msg.urgency]}; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.4); font-size: 14px;">${urgencyIcons[msg.urgency]}</div>`,
          iconSize: [28, 28],
          className: 'emergency-marker'
        });

        L.marker([msg.location.lat, msg.location.lng], { icon: emergencyIcon })
          .bindPopup(`
            <div style="min-width: 220px;">
              <div style="font-weight: bold; color: ${urgencyColors[msg.urgency]}; margin-bottom: 8px; font-size: 16px;">
                ${urgencyIcons[msg.urgency]} ${msg.urgency} PRIORITY
              </div>
              <div style="margin-bottom: 8px; font-size: 14px;">${msg.message}</div>
              <div style="font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 6px;">
                ${msg.timestamp.toLocaleString()}<br>
                From: ${msg.senderId.substring(0, 8)}...<br>
                📍 ${msg.location.lat.toFixed(4)}, ${msg.location.lng.toFixed(4)}
              </div>
            </div>
          `)
          .addTo(markersRef.current);
      }
    });

  }, [messages, userLocation, networkTopology, connectedPeers, deviceLocations]);

  return (
    <div className="space-y-4">
      <div 
        id="enhanced-emergency-map" 
        className="w-full h-full rounded-lg border-2 border-slate-600"
        style={{ minHeight: '300px' }}
      />
      
      {/* Map Legend */}
      <div className="bg-slate-800/50 p-3 rounded-lg text-sm">
        <div className="font-semibold text-blue-400 mb-2">Map Legend</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full border border-white"></div>
            <span className="text-slate-300">Your Device</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full border border-white"></div>
            <span className="text-slate-300">Connected Device</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-500 rounded-full border border-white"></div>
            <span className="text-slate-300">Offline Device</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-green-500 opacity-70"></div>
            <span className="text-slate-300">Network Link</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-slate-300">Emergency</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 opacity-20 rounded"></div>
            <span className="text-slate-300">Coverage Area</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedEmergencyMap;
