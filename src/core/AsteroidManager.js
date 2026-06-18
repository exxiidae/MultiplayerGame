import * as THREE from 'three';
import { MaterialManager } from './MaterialManager.js';

export class AsteroidManager {
    constructor(scene, ship_model, ship_obj) {
        this.scene = scene;
        this.ship = ship_model;
        this.ship_obj = ship_obj;
        this.asteroids = [];
        this.materialManager = new MaterialManager();
        this.chunkLength = 100;

        // ===== НОВЫЕ ПАРАМЕТРЫ =====
        this.maxAsteroids = 30;          // максимум на карте
        this.spawnInterval = 5000;       // 5 секунд между спавнами
        this.spawnCountMin = 5;          // минимум астероидов за раз
        this.spawnCountMax = 7;          // максимум астероидов за раз
        this.asteroidSpeed = 0.02;       // скорость полёта (было 0.05)
        this.asteroidRotSpeed = 0.002;   // скорость вращения (было 0.005)

        // Запускаем периодический спавн
        this.startSpawning();
    }

    // ===== ЗАПУСК ПЕРИОДИЧЕСКОГО СПАВНА =====
    startSpawning() {
        // Первый спавн через 1 секунду
        setTimeout(() => {
            this.spawnAsteroids();
        }, 1000);

        // Запускаем интервал
        this.spawnTimer = setInterval(() => {
            this.spawnAsteroids();
        }, this.spawnInterval);
    }

    // ===== СПАВН ГРУППЫ АСТЕРОИДОВ =====
    spawnAsteroids() {
        // Если на карте уже много астероидов — не спавним
        if (this.asteroids.length >= this.maxAsteroids) return;

        // Сколько астероидов спавнить сейчас (от 5 до 7)
        const count = Math.floor(Math.random() * (this.spawnCountMax - this.spawnCountMin + 1)) + this.spawnCountMin;

        for (let i = 0; i < count; i++) {
            // Если превысили лимит — выходим
            if (this.asteroids.length >= this.maxAsteroids) break;

            const shipPosition = this.getPosition();

            // Случайное смещение в радиусе 30–80 единиц
            const angle = Math.random() * Math.PI * 2;
            const distance = 30 + Math.random() * 50;
            const offsetX = Math.cos(angle) * distance;
            const offsetZ = Math.sin(angle) * distance;
            const offsetY = (Math.random() - 0.5) * 8;

            const asteroid = this.createAsteroid();
            this.asteroids.push(asteroid);
            asteroid.position.set(
                shipPosition.x + offsetX,
                shipPosition.y + offsetY,
                shipPosition.z + offsetZ
            );
            this.scene.add(asteroid);
        }
    }

    // ===== ПОЛУЧИТЬ ПОЗИЦИЮ КОРАБЛЯ =====
    getPosition() {
        return this.ship ? this.ship.position : new THREE.Vector3(0, 0, 0);
    }

    // ===== СОЗДАТЬ ОДИН АСТЕРОИД =====
    createAsteroid() {
        const geometry = new THREE.SphereGeometry(1, 24, 24);
        const material = this.materialManager.createMaterial('cratered_rock');
        const mesh = new THREE.Mesh(geometry, material);
        
        // Случайный размер (от 0.8 до 1.5)
        const scale = 0.8 + Math.random() * 0.7;
        mesh.scale.set(scale, scale, scale);

        // Случайный поворот
        mesh.rotation.x = Math.random() * Math.PI * 2;
        mesh.rotation.y = Math.random() * Math.PI * 2;

        return mesh;
    }

    // ===== ОБНОВЛЕНИЕ КАЖДОГО КАДРА =====
    updateAsteroids() {
        for (let i = this.asteroids.length - 1; i >= 0; i--) {
            const asteroid = this.asteroids[i];

            // === ДВИЖЕНИЕ К КОРАБЛЮ (медленное) ===
            const direction = new THREE.Vector3()
                .copy(this.ship.position)
                .sub(asteroid.position)
                .normalize();

            asteroid.position.x += direction.x * this.asteroidSpeed;
            asteroid.position.y += direction.y * this.asteroidSpeed * 0.3;
            asteroid.position.z += direction.z * this.asteroidSpeed;

            // === ВРАЩЕНИЕ ===
            asteroid.rotation.x += this.asteroidRotSpeed;
            asteroid.rotation.y += this.asteroidRotSpeed * 0.7;
            asteroid.rotation.z += this.asteroidRotSpeed * 0.3;

            // === УДАЛЕНИЕ, ЕСЛИ СЛИШКОМ ДАЛЕКО ===
            const distToShip = asteroid.position.distanceTo(this.ship.position);
            if (distToShip > this.chunkLength) {
                this.scene.remove(asteroid);
                this.asteroids.splice(i, 1);
                continue;
            }

            // === СТОЛКНОВЕНИЕ С КОРАБЛЁМ ===
            if (distToShip < 4.5) {
                this.ship_obj.hp -= 10;
                console.log('💥 Урон! HP:', this.ship_obj.hp);

                // Уведомляем HUD
                if (window.game && window.game.isGameActive) {
                    window.game.takeDamage(10);
                }

                this.scene.remove(asteroid);
                this.asteroids.splice(i, 1);
            }
        }
    }

    // ===== ОСТАНОВКА СПАВНА (при выходе) =====
    stopSpawning() {
        if (this.spawnTimer) {
            clearInterval(this.spawnTimer);
            this.spawnTimer = null;
        }
    }
}