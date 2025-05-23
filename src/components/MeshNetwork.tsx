
import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import Peer from 'peerjs';
import { toast } from 'sonner';

interface EmergencyMessage {
  id: string;
  message: string;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  timestamp: Date;
  location?: { lat: number; lng: number };
  senderId: string;
}

interface MeshNetworkProps {
  onConnectionChange: (connected: boolean) => void;
  onPeerIdChange: (peerId: string) => void;
  onPeersChange: (peers: string[]) => void;
  onMessageReceived: (message: EmergencyMessage) => void;
}

export interface MeshNetworkRef {
  connectToPeer: (peerId: string) => void;
  broadcastMessage: (message: EmergencyMessage) => void;
}

const MeshNetwork = forwardRef<MeshNetworkRef, MeshNetworkProps>(({
  onConnectionChange,
  onPeerIdChange,
  onPeersChange,
  onMessageReceived
}, ref) => {
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, any>>(new Map());

  useImperativeHandle(ref, () => ({
    connectToPeer: (peerId: string) => {
      if (peerRef.current && peerId !== peerRef.current.id) {
        console.log('Attempting to connect to peer:', peerId);
        const conn = peerRef.current.connect(peerId);
        setupConnection(conn);
      }
    },
    broadcastMessage: (message: EmergencyMessage) => {
      const connections = Array.from(connectionsRef.current.values());
      connections.forEach(conn => {
        if (conn.open) {
          conn.send(message);
        }
      });
    }
  }));

  const setupConnection = (conn: any) => {
    conn.on('open', () => {
      console.log('Connection opened with:', conn.peer);
      connectionsRef.current.set(conn.peer, conn);
      onPeersChange(Array.from(connectionsRef.current.keys()));
      toast.success(`Connected to peer: ${conn.peer.substring(0, 8)}...`);
    });

    conn.on('data', (data: any) => {
      console.log('Received data:', data);
      if (data && typeof data === 'object' && data.message) {
        // Convert timestamp back to Date object
        const message: EmergencyMessage = {
          ...data,
          timestamp: new Date(data.timestamp)
        };
        onMessageReceived(message);
        toast.success(`Emergency message received: ${message.urgency} priority`);
      }
    });

    conn.on('close', () => {
      console.log('Connection closed with:', conn.peer);
      connectionsRef.current.delete(conn.peer);
      onPeersChange(Array.from(connectionsRef.current.keys()));
      toast.error(`Disconnected from peer: ${conn.peer.substring(0, 8)}...`);
    });

    conn.on('error', (err: any) => {
      console.error('Connection error:', err);
      toast.error('Connection error occurred');
    });
  };

  useEffect(() => {
    console.log('Initializing PeerJS...');
    
    // Initialize PeerJS with a random ID
    const peer = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      },
      debug: 2
    });

    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('Peer connected with ID:', id);
      onPeerIdChange(id);
      onConnectionChange(true);
      toast.success(`Mesh network initialized. Your ID: ${id.substring(0, 8)}...`);
    });

    peer.on('connection', (conn) => {
      console.log('Incoming connection from:', conn.peer);
      setupConnection(conn);
    });

    peer.on('disconnected', () => {
      console.log('Peer disconnected');
      onConnectionChange(false);
      toast.error('Disconnected from mesh network');
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      onConnectionChange(false);
      toast.error(`Network error: ${err.type}`);
    });

    // Cleanup on unmount
    return () => {
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, [onConnectionChange, onPeerIdChange, onPeersChange, onMessageReceived]);

  return null; // This component doesn't render anything
});

MeshNetwork.displayName = 'MeshNetwork';

export default MeshNetwork;
