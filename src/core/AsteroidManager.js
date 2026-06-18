import * as THREE from 'three';
import { MaterialManager } from './MaterialManager.js';

export class AsteroidManager {
    constructor(scene, ship_model, ship_obj) {
        this.scene = scene;
        this.ship = ship_model;
        this.ship_obj = ship_obj;
        this.asteroids = [];
        this.materialManager = new MaterialManager();
        this.chunkLength = 150;

        this.maxAsteroids = 30;
        this.spawnInterval = 30000;
        this.spawnCountMin = 20;
        this.spawnCountMax = 30;
        this.asteroidSpeed = 0.004;
        this.asteroidRotSpeed = 0.0004;

        AsteroidManager.sharedGeometry = new THREE.SphereGeometry(1, 16, 16);
        AsteroidManager.sharedMaterial = null;

        this.startSpawning();
    }

    startSpawning() {
        setTimeout(() => {
            this.spawnAsteroids();
        }, 2000);

        this.spawnTimer = setInterval(() => {
            this.spawnAsteroids();
        }, this.spawnInterval);
    }

    spawnAsteroids() {
        const count = Math.floor(Math.random() * (this.spawnCountMax - this.spawnCountMin + 1)) + this.spawnCountMin;
        let spawned = 0;

        const spawnBatch = () => {
            const batchSize = 3;
            for (let i = 0; i < batchSize && spawned < count; i++) {
                const shipPosition = this.getPosition();
                const angle = Math.random() * Math.PI * 2;
                const distance = 40 + Math.random() * 60;
                const offsetX = Math.cos(angle) * distance;
                const offsetZ = Math.sin(angle) * distance;
                const offsetY = (Math.random() - 0.5) * 10;

                const asteroid = this.createAsteroid();
                this.asteroids.push(asteroid);
                asteroid.position.set(
                    shipPosition.x + offsetX,
                    shipPosition.y + offsetY,
                    shipPosition.z + offsetZ
                );
                this.scene.add(asteroid);
                spawned++;
            }

            if (spawned < count) {
                requestAnimationFrame(spawnBatch);
            }
        };

        spawnBatch();
    }

    getPosition() {
        return this.ship ? this.ship.position : new THREE.Vector3(0, 0, 0);
    }

    getAsteroidMaterial() {
        if (!AsteroidManager.sharedMaterial) {
            const materialManager = new MaterialManager();
            AsteroidManager.sharedMaterial = materialManager.createMaterial('cratered_rock');
        }
        return AsteroidManager.sharedMaterial.clone();
    }

    createAsteroid() {
        const geometry = AsteroidManager.sharedGeometry;
        const material = this.getAsteroidMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        
        const scale = 0.8 + Math.random() * 0.7;
        mesh.scale.set(scale, scale, scale);
        mesh.rotation.x = Math.random() * Math.PI * 2;
        mesh.rotation.y = Math.random() * Math.PI * 2;

        return mesh;
    }

    checkBulletCollisions(bullets) {
        let asteroidsDestroyed = 0;
        
        for (let i = this.asteroids.length - 1; i >= 0; i--) {
            const asteroid = this.asteroids[i];
            const asteroidPos = asteroid.position;
            
            for (let j = bullets.length - 1; j >= 0; j--) {
                const bullet = bullets[j];
                const bulletPos = bullet.mesh.position;
                
                const dist = asteroidPos.distanceTo(bulletPos);
                const asteroidRadius = asteroid.scale.x * 0.8;
                
                if (dist < asteroidRadius + 0.3) {
                    this.scene.remove(asteroid);
                    this.asteroids.splice(i, 1);
                    
                    if (bullet.deactivate) {
                        bullet.deactivate();
                    } else if (bullet.destroy) {
                        bullet.destroy();
                    } else if (bullet.mesh) {
                        this.scene.remove(bullet.mesh);
                    }
                    bullets.splice(j, 1);
                    
                    asteroidsDestroyed++;
                    
                    // ===== ОТПРАВКА СТАТИСТИКИ =====
                    if (window.game && typeof window.game.addScore === 'function') {
                        window.game.addScore(10);
                        window.game.asteroidsDestroyed += 1;
                        console.log('💥 +10 очков! Всего:', window.game.score);
                        
                        // Отправляем на сервер через Socket.IO
                        if (window.game.networkManager && window.game.networkManager.socket) {
                            window.game.networkManager.socket.emit('updateStats', {
                                asteroids_destroyed: 1,
                                score: 10
                            });
                            console.log('📤 Статистика отправлена на сервер');
                        }
                    }
                    
                    break;
                }
            }
        }
        
        return asteroidsDestroyed;
    }

    updateAsteroids() {
        for (let i = this.asteroids.length - 1; i >= 0; i--) {
            const asteroid = this.asteroids[i];

            const direction = new THREE.Vector3()
                .copy(this.ship.position)
                .sub(asteroid.position)
                .normalize();

            asteroid.position.x += direction.x * this.asteroidSpeed;
            asteroid.position.y += direction.y * this.asteroidSpeed * 0.3;
            asteroid.position.z += direction.z * this.asteroidSpeed;

            asteroid.rotation.x += this.asteroidRotSpeed;
            asteroid.rotation.y += this.asteroidRotSpeed * 0.7;
            asteroid.rotation.z += this.asteroidRotSpeed * 0.3;

            const distToShip = asteroid.position.distanceTo(this.ship.position);
            if (distToShip > this.chunkLength) {
                this.scene.remove(asteroid);
                this.asteroids.splice(i, 1);
                continue;
            }

            if (distToShip < 4.5) {
                this.ship_obj.hp -= 10;
                console.log('💥 Урон! HP:', this.ship_obj.hp);

                if (window.game && window.game.isGameActive) {
                    window.game.takeDamage(10);
                }

                this.scene.remove(asteroid);
                this.asteroids.splice(i, 1);
            }
        }
    }

    stopSpawning() {
        if (this.spawnTimer) {
            clearInterval(this.spawnTimer);
            this.spawnTimer = null;
        }
    }
}