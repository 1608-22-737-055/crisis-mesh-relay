
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
  route?: string[];
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
  const [connectionState, setConnectionState] = useState<'initializing' | 'ready' | 'connecting' | 'connected' | 'error'>('initializing');
  const initializationAttemptsRef = useRef(0);
  const maxInitializationAttempts = 3;

  useImperativeHandle(ref, () => ({
    connectToPeer: (peerId: string) => {
      if (peerRef.current && peerId !== peerRef.current.id && connectionState === 'ready') {
        console.log('Attempting to connect to peer:', peerId);
        try {
          const conn = peerRef.current.connect(peerId, { reliable: true });
          setupConnection(conn);
        } catch (error) {
          console.error('Error connecting to peer:', error);
          toast.error('Failed to connect to peer');
        }
      }
    },
    broadcastMessage: (message: EmergencyMessage) => {
      const messageWithRoute = {
        ...message,
        route: [peerRef.current?.id || '']
      };
      
      const connections = Array.from(connectionsRef.current.values());
      let sentCount = 0;
      
      connections.forEach(conn => {
        if (conn.open) {
          try {
            conn.send(messageWithRoute);
            sentCount++;
          } catch (error) {
            console.error('Error sending message to peer:', error);
          }
        }
      });
      
      console.log(`Message broadcasted to ${sentCount} peers`);
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
          quality: 1
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
      setConnectionState('connected');
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
                try {
                  connection.send(updatedMessage);
                } catch (error) {
                  console.error('Error forwarding message:', error);
                }
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
      connectionsRef.current.delete(conn.peer);
      updatePeersList();
      scheduleReconnection(conn.peer);
    });
  };

  const scheduleReconnection = (peerId: string) => {
    // Don't schedule if already scheduled or if peer initialization failed
    if (reconnectTimeoutRef.current.has(peerId) || connectionState === 'error') return;
    
    const timeout = setTimeout(() => {
      console.log('Attempting to reconnect to:', peerId);
      if (peerRef.current && peerId !== peerRef.current.id && connectionState === 'ready') {
        try {
          const conn = peerRef.current.connect(peerId, { reliable: true });
          setupConnection(conn);
        } catch (error) {
          console.error('Reconnection failed:', error);
        }
      }
      reconnectTimeoutRef.current.delete(peerId);
    }, 5000);
    
    reconnectTimeoutRef.current.set(peerId, timeout);
  };

  const updatePeersList = () => {
    const peers = Array.from(connectionsRef.current.keys());
    onPeersChange(peers);
    onConnectionChange(peers.length > 0);
    
    if (peers.length > 0 && connectionState !== 'connected') {
      setConnectionState('connected');
    } else if (peers.length === 0 && connectionState === 'connected') {
      setConnectionState('ready');
    }
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

  const initializePeer = () => {
    console.log('Initializing PeerJS...');
    setConnectionState('initializing');
    
    // Enhanced STUN/TURN server configuration
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.relay.metered.ca:80' },
        // Add TURN servers for better connectivity
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ],
      iceCandidatePoolSize: 10
    };

    const peer = new Peer({
      config,
      debug: 1, // Reduced debug level
      port: 443,
      secure: true
    });

    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('Peer connected with ID:', id);
      setConnectionState('ready');
      onPeerIdChange(id);
      onConnectionChange(false);
      toast.success(`Mesh network ready. Your ID: ${id.substring(0, 8)}...`);
      initializationAttemptsRef.current = 0; // Reset attempts on success
    });

    peer.on('connection', (conn) => {
      console.log('Incoming connection from:', conn.peer);
      setupConnection(conn);
    });

    peer.on('disconnected', () => {
      console.log('Peer disconnected from signaling server');
      setConnectionState('ready');
      updatePeersList();
      
      // Attempt to reconnect to the signaling server
      if (!peer.destroyed) {
        setTimeout(() => {
          console.log('Attempting to reconnect to signaling server...');
          peer.reconnect();
        }, 2000);
      }
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      
      // Handle different types of errors
      if (err.type === 'network' || err.type === 'server-error') {
        if (initializationAttemptsRef.current < maxInitializationAttempts) {
          initializationAttemptsRef.current++;
          toast.error(`Network error (attempt ${initializationAttemptsRef.current}/${maxInitializationAttempts}). Retrying...`);
          
          setTimeout(() => {
            if (peerRef.current) {
              peerRef.current.destroy();
            }
            initializePeer();
          }, 3000 * initializationAttemptsRef.current); // Exponential backoff
        } else {
          setConnectionState('error');
          toast.error('Failed to connect to mesh network after multiple attempts. Please check your internet connection.');
        }
      } else {
        setConnectionState('error');
        toast.error(`Mesh network error: ${err.type}`);
      }
    });
  };

  useEffect(() => {
    initializePeer();

    // Cleanup on unmount
    return () => {
      // Clear all reconnection timeouts
      reconnectTimeoutRef.current.forEach(timeout => clearTimeout(timeout));
      reconnectTimeoutRef.current.clear();
      
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, []);

  return null;
});

MeshNetwork.displayName = 'MeshNetwork';

export default MeshNetwork;
