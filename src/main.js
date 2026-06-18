import * as THREE from 'three';
import { SceneManager } from './core/SceneManager.js';
import { CameraManager } from './core/CameraManager.js';
import { LightManager } from './core/LightManager.js';
import { ModelLoader } from './core/ModelLoader.js';
import { SkySettings } from "./utils/SkySettings.js";
import { Ship } from './entities/Ship.js';
import { NetworkManager } from './core/NetworkManager.js';

class Game {
    constructor() {
        this.sceneManager = null;
        this.cameraManager = null;
        this.lightManager = null;
        this.modelLoader = null;
        this.skySettings = null;
        this.renderer = null;
        this.clock = null;
        this.localShip = null;
        this.networkManager = null;
        this.remotePlayers = new Map();
        this.keys = { w: false, s: false, a: false, d: false };
        this.isGameActive = false;
        this.sessionId = null;
        this.playerName = null;
        this.animationFrameId = null;

        this.initLobby();
    }

    initLobby() {
        const playerNameInput = document.getElementById('playerName');
        const sessionList = document.getElementById('sessionList');
        const createSessionBtn = document.getElementById('createSessionBtn');
        const refreshSessionsBtn = document.getElementById('refreshSessionsBtn');
        const backBtn = document.getElementById('backBtn');
        const errorMessage = document.getElementById('errorMessage');

        const savedName = localStorage.getItem('playerName');
        if (savedName) playerNameInput.value = savedName;

        const updateSessionList = () => {
            sessionList.innerHTML = '<div class="loading-text">Загрузка...</div>';
            
            fetch('/api/sessions')
                .then(res => res.json())
                .then(sessions => {
                    if (sessions.length === 0) {
                        sessionList.innerHTML = '<div class="loading-text">Нет сессий. Создайте новую!</div>';
                        return;
                    }
                    
                    sessionList.innerHTML = '';
                    sessions.forEach(session => {
                        const div = document.createElement('div');
                        div.className = 'session-item';
                        div.innerHTML = `
                            <span>${session.id}</span>
                            <span class="badge">${session.players}</span>
                        `;
                        div.addEventListener('click', () => {
                            const playerName = playerNameInput.value.trim() || `Player_${Math.floor(Math.random() * 1000)}`;
                            localStorage.setItem('playerName', playerName);
                            this.startGame(session.id, playerName);
                        });
                        sessionList.appendChild(div);
                    });
                })
                .catch(() => {
                    sessionList.innerHTML = '<div class="loading-text">Ошибка загрузки</div>';
                });
        };

        createSessionBtn.addEventListener('click', () => {
            const playerName = playerNameInput.value.trim() || `Player_${Math.floor(Math.random() * 1000)}`;
            localStorage.setItem('playerName', playerName);
            
            fetch('/api/create-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerName })
            })
            .then(res => res.json())
            .then(data => {
                if (data.sessionId) this.startGame(data.sessionId, playerName);
            })
            .catch(() => {
                errorMessage.textContent = 'Не удалось создать сессию';
                errorMessage.style.display = 'block';
                setTimeout(() => errorMessage.style.display = 'none', 5000);
            });
        });

        refreshSessionsBtn.addEventListener('click', updateSessionList);
        backBtn.addEventListener('click', () => this.leaveGame());
        
        updateSessionList();
        setInterval(updateSessionList, 10000);
    }

    startGame(sessionId, playerName) {
        document.getElementById('lobby-container').style.display = 'none';
        document.getElementById('game-container').style.display = 'block';
        document.getElementById('backBtn').style.display = 'block';
        
        this.sessionId = sessionId;
        this.playerName = playerName;
        this.isGameActive = true;
        this.init();
    }

    leaveGame() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        if (this.networkManager) {
            this.networkManager.disconnect();
            this.networkManager = null;
        }
        
        if (this.renderer) {
            const rendererDom = this.renderer.domElement;
            if (rendererDom && rendererDom.parentNode) {
                rendererDom.parentNode.removeChild(rendererDom);
            }
            this.renderer.dispose();
            this.renderer = null;
        }
        
        if (this.sceneManager) {
            const scene = this.sceneManager.getScene();
            while(scene.children.length > 0) {
                const child = scene.children[0];
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
                scene.remove(child);
            }
        }
        
        this.isGameActive = false;
        this.remotePlayers.clear();
        this.localShip = null;
        this.sceneManager = null;
        this.cameraManager = null;
        this.modelLoader = null;
        this.skySettings = null;
        this.lightManager = null;
        
        document.getElementById('lobby-container').style.display = 'flex';
        document.getElementById('game-container').style.display = 'none';
        document.getElementById('backBtn').style.display = 'none';
        
        document.getElementById('refreshSessionsBtn').click();
    }

    init() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enable = true;
        document.getElementById('game-container').appendChild(this.renderer.domElement);
        
        this.sceneManager = new SceneManager();
        const scene = this.sceneManager.create();
        
        this.lightManager = new LightManager(scene);
        this.lightManager.createAll();
        
        this.skySettings = new SkySettings(scene);
        this.skySettings.createStars();
        
        this.modelLoader = new ModelLoader(scene);
        
        this.networkManager = new NetworkManager();
        this.networkManager.onInit = (players) => players.forEach(p => this.addRemotePlayer(p));
        this.networkManager.onPlayerJoin = (player) => this.addRemotePlayer(player);
        this.networkManager.onPlayerMove = (data) => {
            const remote = this.remotePlayers.get(data.id);
            if (remote) {
                remote.targetPosition = data.position;
                remote.targetRotation = data.rotation;
            }
        };
        this.networkManager.onPlayerLeave = (id) => {
            const remote = this.remotePlayers.get(id);
            if (remote && remote.model) {
                this.sceneManager.getScene().remove(remote.model);
                this.remotePlayers.delete(id);
            }
        };
        
        this.networkManager.connect(this.sessionId, this.playerName, 0);
        
        this.ship = new Ship(this.modelLoader, 0);
        this.clock = new THREE.Clock();

        setTimeout(() => {
            this.localShip = this.modelLoader.model;
            this.cameraManager = new CameraManager(this.renderer.domElement);
            this.cameraManager.create(this.localShip);
            this.cameraManager.createOrbitControls(this.localShip);
        }, 500);

        this.setupControls();
        window.addEventListener('resize', () => this.onWindowResize());
        this.animate();
    }

    addRemotePlayer(playerData) {
        if (this.remotePlayers.has(playerData.id)) return;
        
        const remoteLoader = new ModelLoader(this.sceneManager.getScene());
        new Ship(remoteLoader, playerData.modelIndex || 0);
        
        const checkInterval = setInterval(() => {
            if (remoteLoader.model) {
                clearInterval(checkInterval);
                remoteLoader.model.position.copy(playerData.position);
                remoteLoader.model.rotation.copy(playerData.rotation);
                
                this.remotePlayers.set(playerData.id, {
                    model: remoteLoader.model,
                    targetPosition: playerData.position,
                    targetRotation: playerData.rotation
                });
            }
        }, 50);
    }

    setupControls() {
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (key === 'a' || key === 'arrowleft') this.keys.a = true;
            if (key === 'd' || key === 'arrowright') this.keys.d = true;
            if (key === 'w' || key === 'arrowup') this.keys.w = true;
            if (key === 's' || key === 'arrowdown') this.keys.s = true;
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (key === 'a' || key === 'arrowleft') this.keys.a = false;
            if (key === 'd' || key === 'arrowright') this.keys.d = false;
            if (key === 'w' || key === 'arrowup') this.keys.w = false;
            if (key === 's' || key === 'arrowdown') this.keys.s = false;
        });
    }

    updateLocalShip(deltaTime) {
        if (!this.localShip) return;
        
        const moveSpeed = 5;
        const rotSpeed = 2;
        
        if (this.keys.a) this.localShip.rotation.y += rotSpeed * deltaTime;
        if (this.keys.d) this.localShip.rotation.y -= rotSpeed * deltaTime;
        if (this.keys.w) this.localShip.translateZ(moveSpeed * deltaTime);
        if (this.keys.s) this.localShip.translateZ(-moveSpeed * deltaTime);
        
        if (this.networkManager) {
            this.networkManager.sendPosition(this.localShip.position, this.localShip.rotation);
        }
        
        if (this.cameraManager) {
            this.cameraManager.update(this.localShip, deltaTime);
        }
    }

    onWindowResize() {
        if (this.cameraManager) this.cameraManager.onWindowResize();
        if (this.renderer) this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        if (!this.isGameActive) return;
        
        this.animationFrameId = requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();
        
        this.updateLocalShip(delta);
        
        for (const [_, remote] of this.remotePlayers) {
            if (remote.targetPosition && remote.model) {
                remote.model.position.lerp(remote.targetPosition, 0.3);
                if (remote.targetRotation) {
                    remote.model.rotation.x += (remote.targetRotation.x - remote.model.rotation.x) * 0.3;
                    remote.model.rotation.y += (remote.targetRotation.y - remote.model.rotation.y) * 0.3;
                    remote.model.rotation.z += (remote.targetRotation.z - remote.model.rotation.z) * 0.3;
                }
            }
        }

        if (this.cameraManager && this.renderer) {
            this.renderer.render(this.sceneManager.getScene(), this.cameraManager.getCamera());
        }
    }
}

const game = new Game();