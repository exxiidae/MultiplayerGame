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
        this.isDead = false;
        this.respawnTimer = 0;

        // СТРЕЛЬБА
        this.shootCooldown = 0.1;
        this.lastShootTime = 0;
        this.isOverheated = false;

        // ВЗРЫВ
        this.explosionParticles = [];

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
        const selectShipBtn = document.getElementById('selectShipBtn');

        selectShipBtn.addEventListener('click', () => {
            alert('🚀 Выбор кораблей будет доступен в следующем обновлении!');
        });

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
        this.isDead = false;
        this.respawnTimer = 0;

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
        document.getElementById('death-message').style.display = 'none';
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
        
        this.networkManager.onPlayerHpUpdate = (data) => {
            const remote = this.remotePlayers.get(data.id);
            if (remote) {
                remote.hp = data.hp;
                remote.maxHp = data.maxHp;
            }
        };
        
        this.networkManager.onPlayerDied = (data) => {
            const remote = this.remotePlayers.get(data.id);
            if (remote) {
                remote.isDead = true;
                this.createExplosion(remote.model.position);
                remote.model.visible = false;
                if (remote.label) remote.label.visible = false;
            }
            
            if (data.id === this.networkManager.socket?.id) {
                this.handleDeath(data.killerName);
            }
        };
        
        this.networkManager.onPlayerRespawn = (data) => {
            const remote = this.remotePlayers.get(data.id);
            if (remote) {
                remote.isDead = false;
                remote.model.position.copy(data.position);
                remote.model.rotation.copy(data.rotation);
                remote.model.visible = true;
                if (remote.label) remote.label.visible = true;
                remote.hp = data.hp;
                remote.maxHp = data.maxHp;
                remote.targetPosition = data.position;
                remote.targetRotation = data.rotation;
            }
            
            if (data.id === this.networkManager.socket?.id) {
                this.handleRespawn(data.position, data.rotation);
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

    // ========== ЭФФЕКТ ВЗРЫВА ==========
    createExplosion(position) {
        const particleCount = 50;
        const color = 0xff6600;
        
        for (let i = 0; i < particleCount; i++) {
            const geometry = new THREE.SphereGeometry(0.1 + Math.random() * 0.2, 4, 4);
            const material = new THREE.MeshStandardMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.5
            });
            const particle = new THREE.Mesh(geometry, material);
            
            particle.position.copy(position);
            particle.position.x += (Math.random() - 0.5) * 0.5;
            particle.position.y += (Math.random() - 0.5) * 0.5;
            particle.position.z += (Math.random() - 0.5) * 0.5;
            
            const speed = 2 + Math.random() * 3;
            particle.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * speed,
                (Math.random() - 0.5) * speed,
                (Math.random() - 0.5) * speed
            );
            particle.userData.life = 1.0;
            particle.userData.decay = 0.5 + Math.random() * 0.5;
            
            this.sceneManager.getScene().add(particle);
            this.explosionParticles.push(particle);
        }
    }

    updateExplosions(deltaTime) {
        for (let i = this.explosionParticles.length - 1; i >= 0; i--) {
            const p = this.explosionParticles[i];
            p.position.x += p.userData.velocity.x * deltaTime;
            p.position.y += p.userData.velocity.y * deltaTime;
            p.position.z += p.userData.velocity.z * deltaTime;
            p.userData.velocity.multiplyScalar(0.98);
            p.userData.life -= p.userData.decay * deltaTime;
            p.scale.multiplyScalar(1 - deltaTime * 0.5);
            
            if (p.userData.life <= 0) {
                this.sceneManager.getScene().remove(p);
                p.geometry.dispose();
                p.material.dispose();
                this.explosionParticles.splice(i, 1);
            }
        }
    }

    // ========== СМЕРТЬ И ВОЗРОЖДЕНИЕ ==========
    handleDeath(killerName) {
        this.isDead = true;
        this.hp = 0;
        this.respawnTimer = 5;
        
        const deathMsg = document.getElementById('death-message');
        deathMsg.style.display = 'block';
        document.getElementById('killer-name').textContent = `💀 Вас убил: ${killerName || 'неизвестный'}`;
        document.getElementById('respawn-timer').textContent = Math.ceil(this.respawnTimer);
        
        if (this.localShip) {
            this.localShip.visible = false;
            if (this.localShipNameLabel) this.localShipNameLabel.visible = false;
        }
        
        // НЕ ОБНУЛЯЕМ КЛАВИШИ! Только блокируем управление через isDead
        this.updateHUD();
    }

    handleRespawn(position, rotation) {
        this.isDead = false;
        this.hp = this.maxHp;
        this.respawnTimer = 0;
        
        document.getElementById('death-message').style.display = 'none';
        
        if (this.localShip) {
            // Принудительно устанавливаем позицию и поворот
            this.localShip.position.copy(position);
            this.localShip.rotation.set(rotation.x, rotation.y, rotation.z);
            this.localShip.visible = true;
            if (this.localShipNameLabel) this.localShipNameLabel.visible = true;
            
            // Принудительно обновляем камеру
            if (this.cameraManager) {
                this.cameraManager.update(this.localShip, 0.016);
            }
        }
        
        this.updateHUD();
        console.log('♻️ Возрождение! Поворот доступен!');
    }

    // ========== ОБНОВЛЕНИЕ ТАЙМЕРА ВОЗРОЖДЕНИЯ ==========
    updateRespawnTimer(deltaTime) {
        if (!this.isDead) return;
        
        this.respawnTimer -= deltaTime;
        if (this.respawnTimer < 0) this.respawnTimer = 0;
        
        const timerElement = document.getElementById('respawn-timer');
        const displayValue = Math.ceil(this.respawnTimer);
        timerElement.textContent = displayValue;
        
        if (displayValue <= 1) {
            timerElement.style.color = '#00ff88';
        } else if (displayValue <= 3) {
            timerElement.style.color = '#ffcc00';
        } else {
            timerElement.style.color = '#ff3355';
        }
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

    // ========== УПРАВЛЕНИЕ (КЛАВИШИ ВСЕГДА ЗАПОМИНАЮТСЯ) ==========
    setupControls() {
        // Клавиши запоминаются ВСЕГДА, даже если игрок мёртв
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyW') this.keys.w = true;
            if (e.code === 'KeyA') this.keys.a = true;
            if (e.code === 'KeyS') this.keys.s = true;
            if (e.code === 'KeyD') this.keys.d = true;
            
            if (e.code === 'Space') {
                e.preventDefault();
                this.keys.space = true;
            }
            
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
        if (!this.isGameActive || !this.localShip || !this.bulletPool || this.isDead) return;
        
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
        
        const bullet = this.bulletPool.shoot(
            this.localShip.position.clone(),
            direction,
            this.networkManager?.socket?.id || 'local'
        );
        
        if (bullet) {
            bullet.ownerId = this.networkManager?.socket?.id || 'local';
        }
        
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
        if (this.isDead) return;
        this.hp = Math.max(0, this.hp - damage);
        this.updateHUD();
        if (this.hp <= 0) {
            console.log('💀 Корабль уничтожен!');
            if (this.networkManager && this.networkManager.socket) {
                this.networkManager.socket.emit('playerDied', {
                    id: this.networkManager.socket.id,
                    killerId: 'unknown'
                });
            }
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
                
                const isDead = playerData.isDead || false;
                remoteLoader.model.position.copy(playerData.position);
                remoteLoader.model.rotation.copy(playerData.rotation);
                remoteLoader.model.visible = !isDead;

                const label = this.createNameLabel(playerData.name || 'Player');
                label.visible = !isDead;
                remoteLoader.model.add(label);

                this.remotePlayers.set(playerData.id, {
                    model: remoteLoader.model,
                    label: label,
                    targetPosition: playerData.position,
                    targetRotation: playerData.rotation,
                    name: playerData.name || 'Player',
                    hp: playerData.hp || 100,
                    maxHp: playerData.maxHp || 100,
                    isDead: isDead
                });
            }
        }, 50);
    }

    // ========== ОБНОВЛЕНИЕ КОРАБЛЯ ==========
    updateLocalShip(deltaTime) {
        this.updateRespawnTimer(deltaTime);
        
        if (!this.localShip) return;
        
        // ===== ДВИЖЕНИЕ (ТОЛЬКО ЕСЛИ ЖИВ) =====
        if (!this.isDead) {
            const moveSpeed = 5;
            const rotSpeed = 2;
            const verticalSpeed = 3;

            // ПОВОРОТ (A/D) — теперь точно работает
            if (this.keys.a) this.localShip.rotation.y += rotSpeed * deltaTime;
            if (this.keys.d) this.localShip.rotation.y -= rotSpeed * deltaTime;

            // ДВИЖЕНИЕ ВПЕРЁД/НАЗАД (W/S)
            if (this.keys.w) this.localShip.translateZ(moveSpeed * deltaTime);
            if (this.keys.s) this.localShip.translateZ(-moveSpeed * deltaTime);

            // ДВИЖЕНИЕ ВВЕРХ/ВНИЗ (ПРОБЕЛ / SHIFT)
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
        } else {
            // Если мёртв — просто обновляем камеру (чтобы она не слетала)
            if (this.cameraManager && this.localShip) {
                this.cameraManager.update(this.localShip, deltaTime);
            }
        }

        // ===== ОСТЫВАНИЕ ПЕРЕГРЕВА (РАБОТАЕТ ВСЕГДА) =====
        if (this.overheat > 0) {
            this.overheat = Math.max(0, this.overheat - this.overheatCooldownRate * deltaTime);
            if (this.overheat <= 0 && this.isOverheated) {
                this.isOverheated = false;
                this.overheat = 0;
                console.log('✅ Пушка остыла!');
            }
        }

        // ===== ПРОВЕРКА ПОПАДАНИЙ ПУЛЬ (РАБОТАЕТ ВСЕГДА) =====
        if (this.bulletPool && this.networkManager) {
            const activeBullets = this.bulletPool.getActiveBullets();
            
            for (let i = activeBullets.length - 1; i >= 0; i--) {
                const bullet = activeBullets[i];
                const bulletPos = bullet.mesh.position;
                const ownerId = bullet.ownerId;
                
                for (const [playerId, remote] of this.remotePlayers) {
                    if (playerId === ownerId) continue;
                    if (remote.isDead) continue;
                    
                    const dist = bulletPos.distanceTo(remote.model.position);
                    if (dist < 2.5) {
                        if (this.networkManager.socket) {
                            this.networkManager.socket.emit('hitPlayer', playerId, 20);
                            this.bulletPool.deactivateBullet(bullet);
                            activeBullets.splice(i, 1);
                            this.createExplosion(remote.model.position);
                        }
                        break;
                    }
                }
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
        this.updateExplosions(delta);

        for (const [_, remote] of this.remotePlayers) {
            if (remote.targetPosition && remote.model && !remote.isDead) {
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