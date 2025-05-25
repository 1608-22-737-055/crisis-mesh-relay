import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MapPin, Wifi, WifiOff, Users, AlertTriangle, MessageCircle, Phone } from "lucide-react";
import MeshNetwork from "@/components/MeshNetwork";
import EmergencyMap from "@/components/EmergencyMap";
import ConnectionManager from "@/components/ConnectionManager";
import EnhancedEmergencyMap from "@/components/EnhancedEmergencyMap";
import { toast } from "sonner";

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

const Index = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [messages, setMessages] = useState<EmergencyMessage[]>([]);
  const [customMessage, setCustomMessage] = useState('');
  const [peerId, setPeerId] = useState('');
  const [targetPeerId, setTargetPeerId] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const meshNetworkRef = useRef<any>(null);
  const [networkTopology, setNetworkTopology] = useState<NetworkTopology | undefined>();
  const [deviceLocations, setDeviceLocations] = useState<DeviceLocation[]>([]);
  const [connectionState, setConnectionState] = useState<'discovering' | 'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [autoDiscoveryEnabled, setAutoDiscoveryEnabled] = useState(true);

  useEffect(() => {
    // Get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        () => {
          // Default to San Francisco for demo
          setUserLocation({ lat: 37.7749, lng: -122.4194 });
        }
      );
    } else {
      setUserLocation({ lat: 37.7749, lng: -122.4194 });
    }
  }, []);

  const classifyUrgency = (message: string): 'HIGH' | 'MEDIUM' | 'LOW' => {
    const highKeywords = ['trapped', 'emergency', 'help', 'fire', 'injured', 'urgent', 'danger'];
    const mediumKeywords = ['hurt', 'stuck', 'need assistance', 'problem'];
    
    const lowerMessage = message.toLowerCase();
    
    if (highKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return 'HIGH';
    } else if (mediumKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return 'MEDIUM';
    }
    return 'LOW';
  };

  const sendEmergencyMessage = (messageText: string, isCustom = false) => {
    if (!meshNetworkRef.current || connectedPeers.length === 0) {
      toast.error("No connected peers. Connect to the mesh network first.");
      return;
    }

    const urgency = classifyUrgency(messageText);
    const emergencyMsg: EmergencyMessage = {
      id: Date.now().toString(),
      message: messageText,
      urgency,
      timestamp: new Date(),
      location: userLocation || undefined,
      senderId: peerId
    };

    // Add to local messages
    setMessages(prev => [emergencyMsg, ...prev]);
    
    // Send to all connected peers
    meshNetworkRef.current.broadcastMessage(emergencyMsg);
    
    toast.success(`${urgency} priority message sent to ${connectedPeers.length} peer(s)`);
    
    if (isCustom) {
      setCustomMessage('');
    }
  };

  const handleSOSPress = () => {
    sendEmergencyMessage("🆘 EMERGENCY: Need immediate assistance!");
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'HIGH': return 'destructive';
      case 'MEDIUM': return 'default';
      case 'LOW': return 'secondary';
      default: return 'outline';
    }
  };

  const getUrgencyIcon = (urgency: string) => {
    switch (urgency) {
      case 'HIGH': return '🔴';
      case 'MEDIUM': return '🟡';
      case 'LOW': return '🟢';
      default: return '⚪';
    }
  };

  const handlePeerDiscovered = (peerId: string, metadata?: any) => {
    console.log('Peer discovered:', peerId);
    
    // Add to device locations with simulated location near user
    if (userLocation) {
      const randomOffset = () => (Math.random() - 0.5) * 0.01; // ~1km radius
      const deviceLocation: DeviceLocation = {
        peerId,
        location: {
          lat: userLocation.lat + randomOffset(),
          lng: userLocation.lng + randomOffset()
        },
        lastSeen: new Date()
      };
      
      setDeviceLocations(prev => {
        const filtered = prev.filter(d => d.peerId !== peerId);
        return [...filtered, deviceLocation];
      });
    }
  };

  const handleTopologyChange = (topology: NetworkTopology) => {
    setNetworkTopology(topology);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-slate-800 to-red-900 p-4">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <AlertTriangle className="text-red-400" />
            ResilientMesh
            <AlertTriangle className="text-red-400" />
          </h1>
          <p className="text-blue-200 text-lg">Emergency Communication Mesh Network</p>
          <p className="text-slate-300 text-sm mt-2">Peer-to-peer emergency messaging when traditional networks fail</p>
        </div>

        {/* Enhanced Network Status */}
        <Card className="mb-6 border-2 border-blue-400/30 bg-slate-900/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              {isConnected ? <Wifi className="text-green-400" /> : <WifiOff className="text-red-400" />}
              Enhanced Network Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">
                  {connectionState.toUpperCase()}
                </div>
                <div className="text-sm text-slate-300">Connection State</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400 flex items-center justify-center gap-2">
                  <Users size={24} />
                  {connectedPeers.length}
                </div>
                <div className="text-sm text-slate-300">Connected Peers</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">{deviceLocations.length}</div>
                <div className="text-sm text-slate-300">Discovered Devices</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{messages.length}</div>
                <div className="text-sm text-slate-300">Messages Received</div>
              </div>
            </div>
            
            {autoDiscoveryEnabled && (
              <Alert className="mt-4 border-blue-400/30 bg-blue-900/20">
                <AlertDescription className="text-blue-200">
                  🔍 Auto-discovery active: Automatically scanning and connecting to nearby devices
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Communication */}
          <div className="space-y-6">
            {/* Enhanced Mesh Network Components */}
            <MeshNetwork
              ref={meshNetworkRef}
              onConnectionChange={setIsConnected}
              onPeerIdChange={setPeerId}
              onPeersChange={setConnectedPeers}
              onMessageReceived={(msg) => setMessages(prev => [msg, ...prev])}
              onTopologyChange={handleTopologyChange}
            />
            
            <ConnectionManager
              onPeerDiscovered={handlePeerDiscovered}
              onConnectionStateChange={setConnectionState}
              meshNetworkRef={meshNetworkRef}
            />

            {/* Emergency Controls */}
            <Card className="border-2 border-red-400/30 bg-slate-900/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-red-400 flex items-center gap-2">
                  <AlertTriangle />
                  Emergency Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* SOS Button */}
                <Button 
                  onClick={handleSOSPress}
                  size="lg"
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 text-xl animate-pulse border-2 border-red-400"
                  disabled={!isConnected || connectedPeers.length === 0}
                >
                  🆘 SEND SOS 🆘
                </Button>

                {/* Quick Emergency Messages */}
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    onClick={() => sendEmergencyMessage("Trapped in building - need rescue")}
                    variant="destructive"
                    disabled={!isConnected || connectedPeers.length === 0}
                    className="text-xs"
                  >
                    🏢 Trapped
                  </Button>
                  <Button 
                    onClick={() => sendEmergencyMessage("Medical emergency - injured person")}
                    variant="destructive"
                    disabled={!isConnected || connectedPeers.length === 0}
                    className="text-xs"
                  >
                    🚑 Medical
                  </Button>
                  <Button 
                    onClick={() => sendEmergencyMessage("Fire in area - evacuation needed")}
                    variant="destructive"
                    disabled={!isConnected || connectedPeers.length === 0}
                    className="text-xs"
                  >
                    🔥 Fire
                  </Button>
                  <Button 
                    onClick={() => sendEmergencyMessage("Need supplies - food and water")}
                    variant="secondary"
                    disabled={!isConnected || connectedPeers.length === 0}
                    className="text-xs"
                  >
                    📦 Supplies
                  </Button>
                </div>

                {/* Custom Message */}
                <div className="space-y-2">
                  <Textarea
                    placeholder="Type custom emergency message..."
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                  <Button 
                    onClick={() => sendEmergencyMessage(customMessage, true)}
                    disabled={!customMessage.trim() || !isConnected || connectedPeers.length === 0}
                    className="w-full"
                  >
                    <MessageCircle className="mr-2" size={16} />
                    Send Message
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Enhanced Manual Peer Connection */}
            <Card className="border-slate-600 bg-slate-900/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-blue-400 flex items-center gap-2">
                  <Phone />
                  Network Management
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-slate-300">Auto-Discovery:</label>
                  <Button
                    variant={autoDiscoveryEnabled ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setAutoDiscoveryEnabled(!autoDiscoveryEnabled)}
                  >
                    {autoDiscoveryEnabled ? "ON" : "OFF"}
                  </Button>
                </div>
                
                <div>
                  <label className="text-sm text-slate-300">Your Peer ID:</label>
                  <Input 
                    value={peerId} 
                    readOnly 
                    className="bg-slate-800 border-slate-600 text-white font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300">Connect to Peer ID:</label>
                  <Input
                    placeholder="Enter peer ID to connect"
                    value={targetPeerId}
                    onChange={(e) => setTargetPeerId(e.target.value)}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>
                <Button 
                  onClick={() => {
                    if (meshNetworkRef.current && targetPeerId.trim()) {
                      meshNetworkRef.current.connectToPeer(targetPeerId.trim());
                      setTargetPeerId('');
                    }
                  }}
                  disabled={!targetPeerId.trim() || !isConnected}
                  className="w-full"
                >
                  Connect Manually
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Enhanced Map and Messages */}
          <div className="space-y-6">
            {/* Enhanced Emergency Map */}
            <Card className="border-2 border-green-400/30 bg-slate-900/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-green-400 flex items-center gap-2">
                  <MapPin />
                  Mesh Network & Emergency Map
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80 rounded-lg overflow-hidden">
                  <EnhancedEmergencyMap 
                    messages={messages} 
                    userLocation={userLocation}
                    networkTopology={networkTopology}
                    connectedPeers={connectedPeers}
                    deviceLocations={deviceLocations}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Messages Feed */}
            <Card className="border-slate-600 bg-slate-900/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-blue-400 flex items-center gap-2">
                  <MessageCircle />
                  Emergency Messages ({messages.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {messages.length === 0 ? (
                    <div className="text-slate-400 text-center py-8">
                      No emergency messages yet. Connect to peers to start receiving alerts.
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <Alert key={msg.id} className="border-slate-600 bg-slate-800/50">
                        <AlertDescription>
                          <div className="flex items-start justify-between mb-2">
                            <Badge variant={getUrgencyColor(msg.urgency)} className="flex items-center gap-1">
                              {getUrgencyIcon(msg.urgency)} {msg.urgency}
                            </Badge>
                            <span className="text-xs text-slate-400">
                              {msg.timestamp.toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="text-white">{msg.message}</div>
                          <div className="text-xs text-slate-400 mt-1">
                            From: {msg.senderId.substring(0, 8)}...
                            {msg.location && (
                              <span className="ml-2">
                                📍 {msg.location.lat.toFixed(4)}, {msg.location.lng.toFixed(4)}
                              </span>
                            )}
                          </div>
                        </AlertDescription>
                      </Alert>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-slate-400 text-sm">
          <p>🌐 Resilient Emergency Communication • No Internet Required • Peer-to-Peer Mesh Network</p>
        </div>
      </div>
    </div>
  );
};

export default Index;
