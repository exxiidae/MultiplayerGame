import * as THREE from 'three';
import { SceneManager } from './core/SceneManager.js';
import { CameraManager } from './core/CameraManager.js';
import { LightManager } from './core/LightManager.js';
import { ModelLoader } from './core/ModelLoader.js';
import { SkySettings } from "./utils/SkySettings.js";
import { Ship } from './entities/Ship.js';
import { NetworkManager } from './core/NetworkManager.js';
import { AsteroidManager } from './core/AsteroidManager.js';
import { BulletPool } from './entities/BulletPool.js';

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
        this.localShipNameLabel = null;
        this.networkManager = null;
        this.remotePlayers = new Map();
        this.keys = { w: false, s: false, a: false, d: false, space: false, shift: false };
        this.isGameActive = false;
        this.sessionId = null;
        this.playerName = null;
        this.animationFrameId = null;
        this.asteroidManager = null;
        this.bulletPool = null;

        // HUD
        this.hp = 100;
        this.maxHp = 100;
        this.overheat = 0;
        this.overheatMax = 100;
        this.overheatCooldownRate = 20.0;
        this.score = 0;
        this.asteroidsDestroyed = 0;

        // СТРЕЛЬБА
        this.shootCooldown = 0.1;
        this.lastShootTime = 0;
        this.isOverheated = false;

        this.initLobby();
    }

    // ========== ЛОББИ ==========
    initLobby() {
        const playerNameInput = document.getElementById('playerName');
        const sessionList = document.getElementById('sessionList');
        const createSessionBtn = document.getElementById('createSessionBtn');
        const refreshSessionsBtn = document.getElementById('refreshSessionsBtn');
        const backBtn = document.getElementById('backBtn');
        const errorMessage = document.getElementById('errorMessage');

        setTimeout(() => {
            const loader = new THREE.TextureLoader();
            const textures = [
                '../../textures/cratered_rock/cratered-rock-albedo.png',
                '../../textures/cratered_rock/cratered-rock-normal.png',
                '../../textures/warm_rock/wet-mossy-rocks_albedo.png'
            ];
            textures.forEach(url => loader.load(url, () => console.log('✅ Текстура загружена:', url)));
        }, 1000);

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
                if (data.sessionId) {
                    console.log('✅ Сессия создана:', data.sessionId);
                    this.startGame(data.sessionId, playerName);
                }
            })
            .catch((err) => {
                console.error('❌ Ошибка создания сессии:', err);
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
        console.log('🎮 Запуск игры, сессия:', sessionId, 'игрок:', playerName);
        
        document.getElementById('lobby-container').style.display = 'none';
        document.getElementById('game-container').style.display = 'block';
        document.getElementById('backBtn').style.display = 'block';
        document.getElementById('hud').style.display = 'block';

        this.sessionId = sessionId;
        this.playerName = playerName;
        this.isGameActive = true;

        this.hp = 100;
        this.maxHp = 100;
        this.overheat = 0;
        this.score = 0;
        this.asteroidsDestroyed = 0;
        this.isOverheated = false;

        this.init();
    }

    leaveGame() {
        console.log('🚪 Выход из игры');
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
        if (this.bulletPool) {
            this.bulletPool.clear();
            this.bulletPool = null;
        }
        this.isGameActive = false;
        this.remotePlayers.clear();
        this.localShip = null;
        this.localShipNameLabel = null;
        this.asteroidManager = null;
        this.sceneManager = null;
        this.cameraManager = null;
        this.modelLoader = null;
        this.skySettings = null;
        this.lightManager = null;

        document.getElementById('lobby-container').style.display = 'flex';
        document.getElementById('game-container').style.display = 'none';
        document.getElementById('backBtn').style.display = 'none';
        document.getElementById('hud').style.display = 'none';
        document.getElementById('refreshSessionsBtn').click();
    }

    // ========== ИНИЦИАЛИЗАЦИЯ ==========
    init() {
        console.log('🛠️ Инициализация игры...');
        
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

        this.bulletPool = new BulletPool(scene, 100);

        this.networkManager = new NetworkManager();
        this.networkManager.onInit = (players) => {
            console.log('📋 Инициализация игроков:', players.length);
            players.forEach(p => this.addRemotePlayer(p));
        };
        this.networkManager.onPlayerJoin = (player) => {
            console.log('👤 Игрок присоединился:', player.name);
            this.addRemotePlayer(player);
        };
        this.networkManager.onPlayerMove = (data) => {
            const remote = this.remotePlayers.get(data.id);
            if (remote) {
                remote.targetPosition = data.position;
                remote.targetRotation = data.rotation;
            }
        };
        this.networkManager.onPlayerLeave = (id) => {
            console.log('🚶 Игрок покинул:', id);
            const remote = this.remotePlayers.get(id);
            if (remote && remote.model) {
                this.sceneManager.getScene().remove(remote.model);
                if (remote.label) {
                    this.sceneManager.getScene().remove(remote.label);
                }
                this.remotePlayers.delete(id);
            }
        };
        this.networkManager.onShoot = (data) => {
            if (data.ownerId !== this.networkManager.socket?.id) {
                this.bulletPool.shoot(
                    data.position,
                    data.direction,
                    data.ownerId
                );
            }
        };

        this.networkManager.connect(this.sessionId, this.playerName, 0);

        this.ship = new Ship(this.modelLoader, 0);
        this.clock = new THREE.Clock();

        setTimeout(() => {
            this.localShip = this.modelLoader.model;
            if (!this.localShip) {
                console.warn('⚠️ Модель корабля не загрузилась!');
                return;
            }
            
            this.maxHp = this.ship.hp || 100;
            this.hp = this.maxHp;
            this.updateHUD();

            this.localShipNameLabel = this.createNameLabel(this.playerName);
            this.localShip.add(this.localShipNameLabel);

            this.cameraManager = new CameraManager(this.renderer.domElement);
            this.cameraManager.create(this.localShip);
            this.cameraManager.createOrbitControls(this.localShip);

            this.asteroidManager = new AsteroidManager(scene, this.localShip, this.ship);
            console.log('✅ Игра инициализирована!');
        }, 500);

        this.renderer.domElement.addEventListener('click', () => {
            this.shoot();
        });

        this.setupControls();
        window.addEventListener('resize', () => this.onWindowResize());
        this.animate();
    }

    // ========== НИКНЕЙМ ==========
    createNameLabel(name) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 10;
        ctx.font = 'Bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(name, canvas.width/2, canvas.height/2);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.lineWidth = 4;
        ctx.strokeText(name, canvas.width/2, canvas.height/2);
        ctx.fillText(name, canvas.width/2, canvas.height/2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            sizeAttenuation: true
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(4, 1, 1);
        sprite.position.set(0, 2.5, 0);
        return sprite;
    }

    // ========== УПРАВЛЕНИЕ (ТОЛЬКО WASD + ПРОБЕЛ + SHIFT) ==========
    setupControls() {
        window.addEventListener('keydown', (e) => {
            // === WASD (по кодам, не по буквам) ===
            if (e.code === 'KeyW') this.keys.w = true;
            if (e.code === 'KeyA') this.keys.a = true;
            if (e.code === 'KeyS') this.keys.s = true;
            if (e.code === 'KeyD') this.keys.d = true;
            
            // === Пробел — вверх ===
            if (e.code === 'Space') {
                e.preventDefault();
                this.keys.space = true;
            }
            
            // === Левый Shift — вниз ===
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                e.preventDefault();
                this.keys.shift = true;
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'KeyW') this.keys.w = false;
            if (e.code === 'KeyA') this.keys.a = false;
            if (e.code === 'KeyS') this.keys.s = false;
            if (e.code === 'KeyD') this.keys.d = false;
            
            if (e.code === 'Space') {
                e.preventDefault();
                this.keys.space = false;
            }
            
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                e.preventDefault();
                this.keys.shift = false;
            }
        });
    }

    // ========== СТРЕЛЬБА ==========
    shoot() {
        if (!this.isGameActive || !this.localShip || !this.bulletPool) return;
        
        if (this.isOverheated) {
            console.log('🔥 Пушка перегрета!');
            return;
        }

        const now = performance.now();
        if (now - this.lastShootTime < this.shootCooldown * 1000) {
            return;
        }
        this.lastShootTime = now;

        this.overheat = Math.min(this.overheatMax, this.overheat + 8);
        
        if (this.overheat >= this.overheatMax) {
            this.isOverheated = true;
            console.log('🔥 Пушка перегрелась!');
        }

        const direction = new THREE.Vector3(0, 0, 1);
        direction.applyQuaternion(this.localShip.quaternion);
        
        this.bulletPool.shoot(
            this.localShip.position.clone(),
            direction,
            this.networkManager?.socket?.id || 'local'
        );
        
        if (this.networkManager && this.networkManager.socket) {
            this.networkManager.sendShoot(this.localShip.position, direction);
        }
        
        this.updateHUD();
    }

    // ========== HUD ==========
    updateHUD() {
        const hpPercent = Math.max(0, (this.hp / this.maxHp) * 100);
        document.getElementById('hp-bar').style.width = hpPercent + '%';
        document.getElementById('hp-text').textContent = `${Math.round(this.hp)} / ${this.maxHp}`;

        document.getElementById('overheat-bar').style.width = Math.min(100, this.overheat) + '%';
        const overheatText = document.getElementById('overheat-text');
        overheatText.textContent = Math.round(Math.min(100, this.overheat)) + '%';
        
        if (this.isOverheated || this.overheat >= this.overheatMax) {
            overheatText.style.color = '#ff0000';
            overheatText.style.animation = 'blink 0.3s infinite alternate';
        } else {
            overheatText.style.color = '';
            overheatText.style.animation = '';
        }

        document.getElementById('score-text').textContent = this.score;
        document.getElementById('asteroids-destroyed').textContent = this.asteroidsDestroyed;
    }

    addScore(points) {
        this.score += points;
        this.updateHUD();
    }

    takeDamage(damage) {
        this.hp = Math.max(0, this.hp - damage);
        this.updateHUD();
        if (this.hp <= 0) {
            console.log('💀 Корабль уничтожен!');
        }
    }

    // ========== УДАЛЁННЫЕ ИГРОКИ ==========
    addRemotePlayer(playerData) {
        if (this.remotePlayers.has(playerData.id)) return;

        const remoteLoader = new ModelLoader(this.sceneManager.getScene());
        new Ship(remoteLoader, playerData.modelIndex || 0);

        const checkInterval = setInterval(() => {
            if (remoteLoader.model) {
                clearInterval(checkInterval);
                remoteLoader.model.position.copy(playerData.position);
                remoteLoader.model.rotation.copy(playerData.rotation);

                const label = this.createNameLabel(playerData.name || 'Player');
                remoteLoader.model.add(label);

                this.remotePlayers.set(playerData.id, {
                    model: remoteLoader.model,
                    label: label,
                    targetPosition: playerData.position,
                    targetRotation: playerData.rotation,
                    name: playerData.name || 'Player'
                });
            }
        }, 50);
    }

    // ========== ОБНОВЛЕНИЕ КОРАБЛЯ ==========
    updateLocalShip(deltaTime) {
        if (!this.localShip) return;

        const moveSpeed = 5;
        const rotSpeed = 2;
        const verticalSpeed = 3;

        // ===== ПОВОРОТ =====
        if (this.keys.a) this.localShip.rotation.y += rotSpeed * deltaTime;
        if (this.keys.d) this.localShip.rotation.y -= rotSpeed * deltaTime;

        // ===== ДВИЖЕНИЕ ВПЕРЁД/НАЗАД =====
        if (this.keys.w) this.localShip.translateZ(moveSpeed * deltaTime);
        if (this.keys.s) this.localShip.translateZ(-moveSpeed * deltaTime);

        // ===== ДВИЖЕНИЕ ВВЕРХ/ВНИЗ =====
        if (this.keys.space) {
            this.localShip.position.y += verticalSpeed * deltaTime;
        }
        if (this.keys.shift) {
            this.localShip.position.y -= verticalSpeed * deltaTime;
        }

        if (this.networkManager) {
            this.networkManager.sendPosition(this.localShip.position, this.localShip.rotation);
        }

        if (this.cameraManager) {
            this.cameraManager.update(this.localShip, deltaTime);
        }

        if (this.overheat > 0) {
            this.overheat = Math.max(0, this.overheat - this.overheatCooldownRate * deltaTime);
            
            if (this.overheat <= 0 && this.isOverheated) {
                this.isOverheated = false;
                this.overheat = 0;
                console.log('✅ Пушка остыла!');
            }
        }

        if (this.bulletPool) {
            this.bulletPool.update(deltaTime);
            if (this.asteroidManager) {
                this.asteroidManager.checkBulletCollisions(this.bulletPool.getActiveBullets());
            }
        }

        if (this.asteroidManager) {
            document.getElementById('asteroids-total').textContent = this.asteroidManager.asteroids.length;
        }

        this.updateHUD();
    }

    // ========== ЦИКЛ ==========
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

        if (this.asteroidManager) {
            this.asteroidManager.updateAsteroids();
        }

        if (this.cameraManager && this.renderer) {
            this.renderer.render(this.sceneManager.getScene(), this.cameraManager.getCamera());
        }
    }
}

window.game = new Game();