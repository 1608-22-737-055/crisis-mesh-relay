
import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface ConnectionManagerProps {
  onPeerDiscovered: (peerId: string, metadata?: any) => void;
  onConnectionStateChange: (state: 'discovering' | 'connecting' | 'connected' | 'disconnected') => void;
  meshNetworkRef: React.RefObject<any>;
}

const ConnectionManager: React.FC<ConnectionManagerProps> = ({
  onPeerDiscovered,
  onConnectionStateChange,
  meshNetworkRef
}) => {
  const [discoveredPeers, setDiscoveredPeers] = useState<Set<string>>(new Set());
  const [connectionAttempts, setConnectionAttempts] = useState<Map<string, number>>(new Map());
  const discoveryIntervalRef = useRef<NodeJS.Timeout>();
  const heartbeatIntervalRef = useRef<NodeJS.Timeout>();

  // Auto-discovery mechanism
  const startPeerDiscovery = () => {
    console.log('Starting peer discovery...');
    onConnectionStateChange('discovering');
    
    // Simulate discovery using localStorage as a simple peer registry
    const announcePresence = () => {
      const myPeerId = meshNetworkRef.current?.getPeerId();
      if (myPeerId) {
        const presence = {
          peerId: myPeerId,
          timestamp: Date.now(),
          status: 'available'
        };
        localStorage.setItem(`peer_${myPeerId}`, JSON.stringify(presence));
        
        // Clean up old presence entries (older than 30 seconds)
        const cutoff = Date.now() - 30000;
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('peer_')) {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data.timestamp < cutoff) {
              localStorage.removeItem(key);
            }
          }
        });
      }
    };

    const discoverPeers = () => {
      const myPeerId = meshNetworkRef.current?.getPeerId();
      if (!myPeerId) return;

      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('peer_')) {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          const peerId = data.peerId;
          
          if (peerId !== myPeerId && !discoveredPeers.has(peerId)) {
            console.log('Discovered peer:', peerId);
            setDiscoveredPeers(prev => new Set([...prev, peerId]));
            onPeerDiscovered(peerId, data);
            
            // Auto-connect with exponential backoff
            attemptConnection(peerId);
          }
        }
      });
    };

    announcePresence();
    discoverPeers();
    
    discoveryIntervalRef.current = setInterval(() => {
      announcePresence();
      discoverPeers();
    }, 5000); // Discover every 5 seconds
  };

  const attemptConnection = (peerId: string) => {
    const attempts = connectionAttempts.get(peerId) || 0;
    const maxAttempts = 5;
    const baseDelay = 1000; // 1 second
    
    if (attempts >= maxAttempts) {
      console.log(`Max connection attempts reached for peer: ${peerId}`);
      return;
    }

    const delay = baseDelay * Math.pow(2, attempts); // Exponential backoff
    
    setTimeout(() => {
      console.log(`Attempting to connect to peer: ${peerId} (attempt ${attempts + 1})`);
      setConnectionAttempts(prev => new Map([...prev, [peerId, attempts + 1]]));
      
      if (meshNetworkRef.current) {
        meshNetworkRef.current.connectToPeer(peerId);
      }
    }, delay);
  };

  // Connection health monitoring
  const startHeartbeat = () => {
    heartbeatIntervalRef.current = setInterval(() => {
      // Simple heartbeat mechanism
      const connectedPeers = meshNetworkRef.current?.getConnectedPeers() || [];
      if (connectedPeers.length > 0) {
        onConnectionStateChange('connected');
      } else {
        onConnectionStateChange('disconnected');
      }
    }, 3000);
  };

  useEffect(() => {
    startPeerDiscovery();
    startHeartbeat();

    return () => {
      if (discoveryIntervalRef.current) {
        clearInterval(discoveryIntervalRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, []);

  return null; // This component doesn't render anything
};

export default ConnectionManager;
