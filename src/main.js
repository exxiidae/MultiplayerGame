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

// ===== ХАРАКТЕРИСТИКИ КОРАБЛЕЙ =====
const SHIP_STATS = {
    0: { // SCOUT
        name: 'Scout',
        description: '⚡ Быстрый, но слабый',
        hp: 70,
        speed: 8,
        rotSpeed: 3.5,
        damage: 15,
        overheatRate: 25,
        cooldownRate: 35,
        modelIndex: 0,
        rotationOffset: 0,
        scale: 1
    },
    1: { // ASSAULT
        name: 'Assault',
        description: '🛡️ Тяжёлый штурмовик',
        hp: 150,
        speed: 3,
        rotSpeed: 1.5,
        damage: 35,
        overheatRate: 10,
        cooldownRate: 15,
        modelIndex: 1,
        rotationOffset: -Math.PI / 2,
        scale: 0.5
    },
    2: { // LAZERSHIP
        name: 'LazerShip',
        description: '⚡🔫 Мощный лазер с зарядкой',
        hp: 100,
        speed: 4,
        rotSpeed: 2,
        damage: 99999,
        overheatRate: 20,
        cooldownRate: 20,
        modelIndex: 4,
        rotationOffset: 0,
        scale: 0.8,
        isLazer: true,
        lazerChargeTime: 1.0
    }
};

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
        this.selectedShip = 0;

        // HUD
        this.hp = 100;
        this.maxHp = 100;
        this.overheat = 0;
        this.overheatMax = 100;
        this.overheatCooldownRate = 20.0;
        this.overheatRate = 8;
        this.score = 0;
        this.asteroidsDestroyed = 0;
        this.kills = 0;
        this.deaths = 0;
        this.isDead = false;
        this.respawnTimer = 0;
        this.shipSpeed = 5;
        this.shipRotSpeed = 2;
        this.shipDamage = 20;
        this.shipRotationOffset = 0;
        this.isLazer = false;
        this.lazerChargeTime = 1.0;
        this.lazerCharging = false;
        this.lazerChargeStart = 0;

        // СТРЕЛЬБА
        this.shootCooldown = 0.1;
        this.lastShootTime = 0;
        this.isOverheated = false;

        // ВЗРЫВ
        this.explosionParticles = [];

        const savedShip = localStorage.getItem('selectedShip');
        if (savedShip !== null && SHIP_STATS[savedShip]) {
            this.selectedShip = parseInt(savedShip);
            console.log('📦 Загружен корабль из localStorage:', SHIP_STATS[this.selectedShip].name);
        } else {
            this.selectedShip = 0;
            localStorage.setItem('selectedShip', '0');
            console.log('📦 Установлен корабль по умолчанию: Scout');
        }

        this.initLobby();
    }

    // ========== ЗАГРУЗКА СТАТИСТИКИ ПО НИКУ ==========
    async loadPlayerStats(username) {
        try {
            const response = await fetch(`/api/player/name/${encodeURIComponent(username)}`);
            if (response.ok) {
                const stats = await response.json();
                console.log('📊 Статистика игрока:', stats);
                return stats;
            } else {
                console.log('📊 Новый игрок, статистики пока нет');
                return null;
            }
        } catch (err) {
            console.error('❌ Ошибка загрузки статистики:', err);
            return null;
        }
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
        
        const savedShip = localStorage.getItem('selectedShip');
        if (savedShip !== null && SHIP_STATS[savedShip]) {
            this.selectedShip = parseInt(savedShip);
        }
        console.log('🚀 Выбран корабль:', SHIP_STATS[this.selectedShip].name);
        
        document.getElementById('lobby-container').style.display = 'none';
        document.getElementById('game-container').style.display = 'block';
        document.getElementById('backBtn').style.display = 'block';
        document.getElementById('hud').style.display = 'block';

        this.sessionId = sessionId;
        this.playerName = playerName;
        this.isGameActive = true;

        const stats = SHIP_STATS[this.selectedShip];
        this.maxHp = stats.hp;
        this.hp = stats.hp;
        this.shipSpeed = stats.speed;
        this.shipRotSpeed = stats.rotSpeed;
        this.shipDamage = stats.damage;
        this.overheatRate = stats.overheatRate;
        this.overheatCooldownRate = stats.cooldownRate;
        this.shipRotationOffset = stats.rotationOffset || 0;
        this.isLazer = stats.isLazer || false;
        this.lazerChargeTime = stats.lazerChargeTime || 1.0;
        this.lazerCharging = false;
        this.lazerChargeStart = 0;
        this.overheat = 0;
        this.score = 0;
        this.asteroidsDestroyed = 0;
        this.kills = 0;
        this.deaths = 0;
        this.isOverheated = false;
        this.isDead = false;
        this.respawnTimer = 0;

        // Загружаем статистику игрока
        this.loadPlayerStats(playerName).then(stats => {
            if (stats) {
                console.log(`🏆 ${playerName}: Очки: ${stats.score}, Убийств: ${stats.kills}`);
                // Обновляем HUD в лобби (если нужно)
                this.updateLobbyStats(stats);
            }
        });

        this.init();
    }

    // ===== ОБНОВЛЕНИЕ СТАТИСТИКИ В ЛОББИ =====
    updateLobbyStats(stats) {
        const statsContainer = document.getElementById('stats-container');
        const playerStatsDiv = document.getElementById('player-stats');
        if (statsContainer && playerStatsDiv) {
            statsContainer.style.display = 'block';
            playerStatsDiv.innerHTML = `
                <div class="stat-row"><span class="stat-label">⭐ Очки</span><span class="stat-value">${stats.score || 0}</span></div>
                <div class="stat-row"><span class="stat-label">💀 Убийств</span><span class="stat-value">${stats.kills || 0}</span></div>
                <div class="stat-row"><span class="stat-label">🏆 Побед</span><span class="stat-value">${stats.wins || 0}</span></div>
                <div class="stat-row"><span class="stat-label">☄️ Астероидов</span><span class="stat-value">${stats.asteroids_destroyed || 0}</span></div>
                <div class="stat-row"><span class="stat-label">🎮 Игр сыграно</span><span class="stat-value">${stats.total_games || 0}</span></div>
            `;
        }
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
        console.log('🚀 Загружается корабль:', SHIP_STATS[this.selectedShip].name);
        
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
            } else {
                // Если убит другой игрок — обновляем счётчик убийств
                if (data.killerId === this.networkManager.socket?.id) {
                    this.kills += 1;
                    this.updateHUD();
                    console.log(`💀 Убийство! Всего убийств: ${this.kills}`);
                }
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

        this.networkManager.connect(this.sessionId, this.playerName, this.selectedShip);

        // ===== СОЗДАЁМ КОРАБЛЬ =====
        const stats = SHIP_STATS[this.selectedShip];
        this.ship = new Ship(this.modelLoader, this.selectedShip, stats.scale || 1);
        this.clock = new THREE.Clock();

        setTimeout(() => {
            this.localShip = this.modelLoader.model;
            if (!this.localShip) {
                console.warn('⚠️ Модель корабля не загрузилась!');
                return;
            }
            
            if (this.shipRotationOffset !== 0) {
                this.localShip.rotation.y = this.shipRotationOffset;
                console.log(`🔄 Применён разворот модели на ${this.shipRotationOffset * 180 / Math.PI}°`);
            }
            
            this.hp = this.maxHp;
            this.updateHUD();

            this.localShipNameLabel = this.createNameLabel(this.playerName);
            this.localShip.add(this.localShipNameLabel);

            this.cameraManager = new CameraManager(this.renderer.domElement);
            this.cameraManager.create(this.localShip);
            this.cameraManager.createOrbitControls(this.localShip);

            this.asteroidManager = new AsteroidManager(scene, this.localShip, this.ship);
            console.log(`✅ Игра инициализирована! Корабль: ${SHIP_STATS[this.selectedShip].name}`);
        }, 500);

        // ===== КЛИК МЫШИ ДЛЯ СТРЕЛЬБЫ =====
        this.renderer.domElement.addEventListener('mousedown', () => {
            if (this.isLazer) {
                this.startLazerCharge();
            } else {
                this.shoot();
            }
        });

        this.renderer.domElement.addEventListener('mouseup', () => {
            if (this.isLazer && this.lazerCharging) {
                this.fireLazer();
            }
        });

        // Отключаем контекстное меню (ПКМ)
        this.renderer.domElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        this.setupControls();
        window.addEventListener('resize', () => this.onWindowResize());
        this.animate();
    }

    // ========== ЛАЗЕР ==========
    startLazerCharge() {
        if (!this.isGameActive || this.isDead || this.isOverheated) return;
        if (this.lazerCharging) return;
        
        this.lazerCharging = true;
        this.lazerChargeStart = performance.now();
        console.log('🔋 Зарядка лазера...');
        
        document.getElementById('overheat-bar').style.background = 'linear-gradient(90deg, #ff00ff, #ff00cc)';
    }

    fireLazer() {
        if (!this.lazerCharging) return;
        this.lazerCharging = false;
        
        const chargeTime = (performance.now() - this.lazerChargeStart) / 1000;
        if (chargeTime < this.lazerChargeTime) {
            console.log(`❌ Зарядка прервана: ${chargeTime.toFixed(2)}с / ${this.lazerChargeTime}с`);
            document.getElementById('overheat-bar').style.background = 'linear-gradient(90deg, #ffcc00, #ff8800)';
            return;
        }
        
        console.log(`💥 ЛАЗЕР ВЫСТРЕЛ! Зарядка: ${chargeTime.toFixed(2)}с`);
        document.getElementById('overheat-bar').style.background = 'linear-gradient(90deg, #ffcc00, #ff8800)';
        
        this.shootLazer();
        
        this.overheat = Math.min(this.overheatMax, this.overheat + this.overheatRate);
        if (this.overheat >= this.overheatMax) {
            this.isOverheated = true;
            console.log('🔥 Пушка перегрелась!');
        }
        this.updateHUD();
    }

    shootLazer() {
        if (!this.localShip || !this.bulletPool) return;
        
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(this.localShip.quaternion);
        
        const bullet = this.bulletPool.shoot(
            this.localShip.position.clone(),
            direction,
            this.networkManager?.socket?.id || 'local'
        );
        
        if (bullet) {
            bullet.ownerId = this.networkManager?.socket?.id || 'local';
            bullet.mesh.material.color.setHex(0xff00ff);
            bullet.mesh.material.emissive.setHex(0xff00ff);
            bullet.mesh.material.emissiveIntensity = 1.0;
            bullet.mesh.scale.set(2, 2, 2);
            
            const lazerSpeed = 120;
            bullet.speed = lazerSpeed;
            bullet.damage = this.shipDamage || 99999;
        }
        
        if (this.networkManager && this.networkManager.socket) {
            this.networkManager.sendShoot(this.localShip.position, direction);
        }
        
        this.updateHUD();
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
        
        // Отправляем смерть на сервер
        if (this.networkManager && this.networkManager.socket) {
            this.networkManager.socket.emit('updateStats', {
                deaths: 1
            });
        }
        
        this.updateHUD();
    }

    handleRespawn(position, rotation) {
        this.isDead = false;
        this.hp = this.maxHp;
        this.respawnTimer = 0;
        
        document.getElementById('death-message').style.display = 'none';
        
        if (this.localShip) {
            this.localShip.position.copy(position);
            this.localShip.rotation.set(rotation.x, rotation.y, rotation.z);
            if (this.shipRotationOffset !== 0) {
                this.localShip.rotation.y += this.shipRotationOffset;
            }
            this.localShip.visible = true;
            if (this.localShipNameLabel) this.localShipNameLabel.visible = true;
            
            if (this.cameraManager) {
                this.cameraManager.update(this.localShip, 0.016);
            }
        }
        
        this.updateHUD();
        console.log('♻️ Возрождение!');
    }

    // ========== ОБНОВЛЕНИЕ ТАЙМЕРА ==========
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

    // ========== УПРАВЛЕНИЕ ==========
    setupControls() {
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

    // ========== СТРЕЛЬБА (ОБЫЧНАЯ) ==========
    shoot() {
        if (this.isLazer) return;
        
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

        this.overheat = Math.min(this.overheatMax, this.overheat + this.overheatRate);
        
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
            bullet.damage = this.shipDamage;
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
        document.getElementById('kills-text').textContent = this.kills || 0;
        
        const weaponText = this.isLazer ? '🔫 ЛАЗЕР (зарядка 1с)' : '🔫 ПУШКА';
        document.getElementById('weapon-text').textContent = weaponText;
    }

    addScore(points) {
        this.score += points;
        this.updateHUD();
        console.log('➕ Очки добавлены:', points, 'Всего:', this.score);
        
        if (this.networkManager && this.networkManager.socket) {
            this.networkManager.socket.emit('updateStats', {
                score: points,
                asteroids_destroyed: 0
            });
        }
    }

    takeDamage(damage) {
        if (this.isDead) return;
        this.hp = Math.max(0, this.hp - damage);
        this.updateHUD();
        
        if (this.hp <= 0) {
            console.log('💀 Корабль уничтожен!');
            if (this.networkManager && this.networkManager.socket) {
                this.networkManager.socket.emit('updateStats', {
                    deaths: 1
                });
            }
        }
    }

    // ========== УДАЛЁННЫЕ ИГРОКИ ==========
    addRemotePlayer(playerData) {
        if (this.remotePlayers.has(playerData.id)) return;

        const remoteLoader = new ModelLoader(this.sceneManager.getScene());
        new Ship(remoteLoader, playerData.currentModel || 0);

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
        
        if (!this.isDead) {
            const moveSpeed = this.shipSpeed;
            const rotSpeed = this.shipRotSpeed;
            const verticalSpeed = 3;

            if (this.keys.a) this.localShip.rotation.y += rotSpeed * deltaTime;
            if (this.keys.d) this.localShip.rotation.y -= rotSpeed * deltaTime;

            if (this.isLazer) {
                if (this.keys.w) this.localShip.translateZ(-moveSpeed * deltaTime);
                if (this.keys.s) this.localShip.translateZ(moveSpeed * deltaTime);
            } else {
                if (this.keys.w) this.localShip.translateZ(moveSpeed * deltaTime);
                if (this.keys.s) this.localShip.translateZ(-moveSpeed * deltaTime);
            }

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
            if (this.cameraManager && this.localShip) {
                this.cameraManager.update(this.localShip, deltaTime);
            }
        }

        if (this.overheat > 0) {
            this.overheat = Math.max(0, this.overheat - this.overheatCooldownRate * deltaTime);
            if (this.overheat <= 0 && this.isOverheated) {
                this.isOverheated = false;
                this.overheat = 0;
                console.log('✅ Пушка остыла!');
            }
        }

        // ===== ПРОВЕРКА ПОПАДАНИЙ ПУЛЬ (ТОЛЬКО УРОН, БЕЗ УБИЙСТВ) =====
        if (this.bulletPool && this.networkManager) {
            const activeBullets = this.bulletPool.getActiveBullets();
            
            for (let i = activeBullets.length - 1; i >= 0; i--) {
                const bullet = activeBullets[i];
                const bulletPos = bullet.mesh.position;
                const ownerId = bullet.ownerId;
                const damage = bullet.damage || this.shipDamage || 20;
                
                for (const [playerId, remote] of this.remotePlayers) {
                    if (playerId === ownerId) continue;
                    if (remote.isDead) continue;
                    
                    const dist = bulletPos.distanceTo(remote.model.position);
                    if (dist < 2.5) {
                        if (this.networkManager.socket) {
                            // Отправляем урон на сервер (сервер сам решит, убийство это или нет)
                            this.networkManager.socket.emit('hitPlayer', playerId, damage);
                            this.bulletPool.deactivateBullet(bullet);
                            activeBullets.splice(i, 1);
                            this.createExplosion(remote.model.position);
                            
                            console.log(`💥 Попадание в ${remote.name}`);
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