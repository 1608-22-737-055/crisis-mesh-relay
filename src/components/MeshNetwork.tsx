
import React, { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import Peer from 'peerjs';
import { toast } from 'sonner';

interface EmergencyMessage {
  id: string;
  message: string;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  timestamp: Date;
  location?: { lat: number; lng: number };
  senderId: string;
  route?: string[]; // Track message routing path
}

interface NetworkTopology {
  nodes: Array<{ id: string; connections: string[] }>;
  edges: Array<{ from: string; to: string; quality: number }>;
}

interface MeshNetworkProps {
  onConnectionChange: (connected: boolean) => void;
  onPeerIdChange: (peerId: string) => void;
  onPeersChange: (peers: string[]) => void;
  onMessageReceived: (message: EmergencyMessage) => void;
  onTopologyChange?: (topology: NetworkTopology) => void;
}

export interface MeshNetworkRef {
  connectToPeer: (peerId: string) => void;
  broadcastMessage: (message: EmergencyMessage) => void;
  getPeerId: () => string;
  getConnectedPeers: () => string[];
  getNetworkTopology: () => NetworkTopology;
}

const MeshNetwork = forwardRef<MeshNetworkRef, MeshNetworkProps>(({
  onConnectionChange,
  onPeerIdChange,
  onPeersChange,
  onMessageReceived,
  onTopologyChange
}, ref) => {
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, any>>(new Map());
  const [messageHistory, setMessageHistory] = useState<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useImperativeHandle(ref, () => ({
    connectToPeer: (peerId: string) => {
      if (peerRef.current && peerId !== peerRef.current.id) {
        console.log('Attempting to connect to peer:', peerId);
        const conn = peerRef.current.connect(peerId);
        setupConnection(conn);
      }
    },
    broadcastMessage: (message: EmergencyMessage) => {
      const messageWithRoute = {
        ...message,
        route: [peerRef.current?.id || '']
      };
      
      const connections = Array.from(connectionsRef.current.values());
      connections.forEach(conn => {
        if (conn.open) {
          conn.send(messageWithRoute);
        }
      });
    },
    getPeerId: () => peerRef.current?.id || '',
    getConnectedPeers: () => Array.from(connectionsRef.current.keys()),
    getNetworkTopology: () => {
      const myId = peerRef.current?.id || '';
      const connectedPeers = Array.from(connectionsRef.current.keys());
      
      return {
        nodes: [
          { id: myId, connections: connectedPeers },
          ...connectedPeers.map(peerId => ({ id: peerId, connections: [myId] }))
        ],
        edges: connectedPeers.map(peerId => ({
          from: myId,
          to: peerId,
          quality: 1 // TODO: Implement actual quality measurement
        }))
      };
    }
  }));

  const setupConnection = (conn: any) => {
    conn.on('open', () => {
      console.log('Connection opened with:', conn.peer);
      connectionsRef.current.set(conn.peer, conn);
      updatePeersList();
      updateTopology();
      toast.success(`Connected to peer: ${conn.peer.substring(0, 8)}...`);
      
      // Clear any pending reconnection attempts
      const timeout = reconnectTimeoutRef.current.get(conn.peer);
      if (timeout) {
        clearTimeout(timeout);
        reconnectTimeoutRef.current.delete(conn.peer);
      }
    });

    conn.on('data', (data: any) => {
      console.log('Received data:', data);
      if (data && typeof data === 'object' && data.message) {
        const message: EmergencyMessage = {
          ...data,
          timestamp: new Date(data.timestamp)
        };
        
        // Prevent message loops using message ID tracking
        if (!messageHistory.has(message.id)) {
          setMessageHistory(prev => new Set([...prev, message.id]));
          onMessageReceived(message);
          
          // Re-broadcast to other peers (mesh routing)
          const route = message.route || [];
          if (!route.includes(peerRef.current?.id || '')) {
            const updatedMessage = {
              ...message,
              route: [...route, peerRef.current?.id || '']
            };
            
            // Forward to other connected peers (except sender)
            connectionsRef.current.forEach((connection, peerId) => {
              if (connection.open && peerId !== conn.peer) {
                connection.send(updatedMessage);
              }
            });
          }
          
          toast.success(`Emergency message received: ${message.urgency} priority`);
        }
      }
    });

    conn.on('close', () => {
      console.log('Connection closed with:', conn.peer);
      connectionsRef.current.delete(conn.peer);
      updatePeersList();
      updateTopology();
      toast.error(`Disconnected from peer: ${conn.peer.substring(0, 8)}...`);
      
      // Schedule reconnection attempt
      scheduleReconnection(conn.peer);
    });

    conn.on('error', (err: any) => {
      console.error('Connection error with', conn.peer, ':', err);
      toast.error('Connection error occurred');
      scheduleReconnection(conn.peer);
    });
  };

  const scheduleReconnection = (peerId: string) => {
    // Don't schedule if already scheduled
    if (reconnectTimeoutRef.current.has(peerId)) return;
    
    const timeout = setTimeout(() => {
      console.log('Attempting to reconnect to:', peerId);
      if (peerRef.current && peerId !== peerRef.current.id) {
        const conn = peerRef.current.connect(peerId);
        setupConnection(conn);
      }
      reconnectTimeoutRef.current.delete(peerId);
    }, 5000); // Reconnect after 5 seconds
    
    reconnectTimeoutRef.current.set(peerId, timeout);
  };

  const updatePeersList = () => {
    const peers = Array.from(connectionsRef.current.keys());
    onPeersChange(peers);
    onConnectionChange(peers.length > 0);
  };

  const updateTopology = () => {
    if (onTopologyChange) {
      const topology = {
        nodes: [
          { 
            id: peerRef.current?.id || '', 
            connections: Array.from(connectionsRef.current.keys()) 
          }
        ],
        edges: Array.from(connectionsRef.current.keys()).map(peerId => ({
          from: peerRef.current?.id || '',
          to: peerId,
          quality: 1
        }))
      };
      onTopologyChange(topology);
    }
  };

  useEffect(() => {
    console.log('Initializing PeerJS...');
    
    const peer = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      },
      debug: 2
    });

    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('Peer connected with ID:', id);
      onPeerIdChange(id);
      onConnectionChange(false); // Initially not connected to other peers
      toast.success(`Mesh network initialized. Your ID: ${id.substring(0, 8)}...`);
    });

    peer.on('connection', (conn) => {
      console.log('Incoming connection from:', conn.peer);
      setupConnection(conn);
    });

    peer.on('disconnected', () => {
      console.log('Peer disconnected');
      updatePeersList();
      toast.error('Disconnected from mesh network');
      
      // Attempt to reconnect to the signaling server
      setTimeout(() => {
        if (peerRef.current && !peerRef.current.destroyed) {
          peerRef.current.reconnect();
        }
      }, 3000);
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      toast.error(`Network error: ${err.type}`);
    });

    // Cleanup on unmount
    return () => {
      // Clear all reconnection timeouts
      reconnectTimeoutRef.current.forEach(timeout => clearTimeout(timeout));
      reconnectTimeoutRef.current.clear();
      
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, [onConnectionChange, onPeerIdChange, onPeersChange, onMessageReceived]);

  return null;
});

MeshNetwork.displayName = 'MeshNetwork';

export default MeshNetwork;
