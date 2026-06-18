import { io } from 'socket.io-client';

export class NetworkManager {
    constructor() {
        this.socket = null;
        this.sessionId = null;
        this.playerName = null;
        this.modelIndex = null;
        this.onInit = null;
        this.onPlayerJoin = null;
        this.onPlayerMove = null;
        this.onPlayerLeave = null;
        this.onShoot = null;
        this.position = null;
        this.rotation = null;
        this.isConnected = false;
        this.updateInterval = null;
    }

    connect(sessionId, playerName, modelIndex = 0) {
        this.sessionId = sessionId;
        this.playerName = playerName;
        this.modelIndex = modelIndex;
        this.isConnected = true;
        
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.socket.emit('join', sessionId, playerName, modelIndex);
        });
        
        this.socket.on('init', (players) => {
            if (this.onInit) this.onInit(players);
        });
        
        this.socket.on('playerJoined', (player) => {
            if (this.onPlayerJoin) this.onPlayerJoin(player);
        });
        
        this.socket.on('playerMoved', (data) => {
            if (this.onPlayerMove) this.onPlayerMove(data);
        });
        
        this.socket.on('playerLeft', (id) => {
            if (this.onPlayerLeave) this.onPlayerLeave(id);
        });
        
        this.socket.on('shoot', (data) => {
            if (this.onShoot) this.onShoot(data);
        });
        
        this.socket.on('disconnect', () => {
            this.isConnected = false;
        });
        
        this.updateInterval = setInterval(() => {
            if (this.position && this.socket && this.socket.connected) {
                this.socket.emit('move', this.position, this.rotation);
            }
        }, 50);
    }
    
    sendPosition(position, rotation) {
        if (!this.isConnected || !this.socket || !this.socket.connected) return;
        this.position = { x: position.x, y: position.y, z: position.z };
        this.rotation = { x: rotation.x, y: rotation.y, z: rotation.z };
    }
    
    sendShoot(position, direction) {
        if (!this.isConnected || !this.socket || !this.socket.connected) return;
        this.socket.emit('shoot', {
            position: { x: position.x, y: position.y, z: position.z },
            direction: { x: direction.x, y: direction.y, z: direction.z }
        });
    }
    
    disconnect() {
        this.isConnected = false;
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}