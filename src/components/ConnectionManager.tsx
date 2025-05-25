
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
  const cleanupIntervalRef = useRef<NodeJS.Timeout>();

  // Enhanced peer discovery with better persistence
  const startPeerDiscovery = () => {
    console.log('Starting enhanced peer discovery...');
    onConnectionStateChange('discovering');
    
    const announcePresence = () => {
      const myPeerId = meshNetworkRef.current?.getPeerId();
      if (myPeerId) {
        const presence = {
          peerId: myPeerId,
          timestamp: Date.now(),
          status: 'available',
          version: '1.0',
          capabilities: ['emergency-mesh', 'auto-discovery']
        };
        
        try {
          localStorage.setItem(`peer_${myPeerId}`, JSON.stringify(presence));
          
          // Also announce in sessionStorage for cross-tab discovery
          sessionStorage.setItem(`peer_session_${myPeerId}`, JSON.stringify(presence));
        } catch (error) {
          console.error('Error storing presence:', error);
        }
      }
    };

    const discoverPeers = () => {
      const myPeerId = meshNetworkRef.current?.getPeerId();
      if (!myPeerId) return;

      // Discover from localStorage
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('peer_')) {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            const peerId = data.peerId;
            
            if (peerId && peerId !== myPeerId && !discoveredPeers.has(peerId)) {
              // Check if peer is still active (within last 60 seconds)
              const lastSeen = Date.now() - data.timestamp;
              if (lastSeen < 60000) {
                console.log('Discovered active peer:', peerId);
                setDiscoveredPeers(prev => new Set([...prev, peerId]));
                onPeerDiscovered(peerId, data);
                
                // Auto-connect with smart retry logic
                attemptConnection(peerId);
              }
            }
          }
        });

        // Also check sessionStorage for cross-tab peers
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith('peer_session_')) {
            const data = JSON.parse(sessionStorage.getItem(key) || '{}');
            const peerId = data.peerId;
            
            if (peerId && peerId !== myPeerId && !discoveredPeers.has(peerId)) {
              console.log('Discovered session peer:', peerId);
              setDiscoveredPeers(prev => new Set([...prev, peerId]));
              onPeerDiscovered(peerId, data);
              attemptConnection(peerId);
            }
          }
        });
      } catch (error) {
        console.error('Error during peer discovery:', error);
      }
    };

    const cleanupOldPeers = () => {
      const cutoff = Date.now() - 60000; // 60 seconds
      
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('peer_')) {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data.timestamp < cutoff) {
              localStorage.removeItem(key);
            }
          }
        });

        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith('peer_session_')) {
            const data = JSON.parse(sessionStorage.getItem(key) || '{}');
            if (data.timestamp < cutoff) {
              sessionStorage.removeItem(key);
            }
          }
        });
      } catch (error) {
        console.error('Error cleaning up old peers:', error);
      }
    };

    announcePresence();
    discoverPeers();
    
    discoveryIntervalRef.current = setInterval(() => {
      announcePresence();
      discoverPeers();
    }, 3000); // Discover every 3 seconds

    cleanupIntervalRef.current = setInterval(cleanupOldPeers, 10000); // Cleanup every 10 seconds
  };

  const attemptConnection = (peerId: string) => {
    const attempts = connectionAttempts.get(peerId) || 0;
    const maxAttempts = 3; // Reduced max attempts
    const baseDelay = 1000; // 1 second
    
    if (attempts >= maxAttempts) {
      console.log(`Max connection attempts reached for peer: ${peerId}`);
      return;
    }

    const delay = baseDelay * Math.pow(1.5, attempts); // Gentler exponential backoff
    
    setTimeout(() => {
      console.log(`Attempting to connect to peer: ${peerId} (attempt ${attempts + 1})`);
      setConnectionAttempts(prev => new Map([...prev, [peerId, attempts + 1]]));
      
      if (meshNetworkRef.current) {
        try {
          meshNetworkRef.current.connectToPeer(peerId);
        } catch (error) {
          console.error('Connection attempt failed:', error);
        }
      }
    }, delay);
  };

  // Enhanced connection health monitoring
  const startHeartbeat = () => {
    heartbeatIntervalRef.current = setInterval(() => {
      const connectedPeers = meshNetworkRef.current?.getConnectedPeers() || [];
      const myPeerId = meshNetworkRef.current?.getPeerId();
      
      if (connectedPeers.length > 0) {
        onConnectionStateChange('connected');
      } else if (myPeerId) {
        // Reset connection attempts for discovered peers if we're not connected
        if (discoveredPeers.size > 0) {
          onConnectionStateChange('connecting');
        } else {
          onConnectionStateChange('discovering');
        }
      } else {
        onConnectionStateChange('disconnected');
      }

      // Reset connection attempts periodically for retry
      if (connectedPeers.length === 0 && discoveredPeers.size > 0) {
        setConnectionAttempts(new Map());
      }
    }, 5000); // Check every 5 seconds
  };

  useEffect(() => {
    // Small delay to ensure mesh network is initialized
    const initTimeout = setTimeout(() => {
      startPeerDiscovery();
      startHeartbeat();
    }, 1000);

    return () => {
      clearTimeout(initTimeout);
      
      if (discoveryIntervalRef.current) {
        clearInterval(discoveryIntervalRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }

      // Clean up our presence on unmount
      const myPeerId = meshNetworkRef.current?.getPeerId();
      if (myPeerId) {
        try {
          localStorage.removeItem(`peer_${myPeerId}`);
          sessionStorage.removeItem(`peer_session_${myPeerId}`);
        } catch (error) {
          console.error('Error cleaning up presence:', error);
        }
      }
    };
  }, []);

  return null;
});

export default ConnectionManager;
