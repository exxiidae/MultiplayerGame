import * as THREE from 'three';

export class BulletPool {
    constructor(scene, poolSize = 50) {
        this.scene = scene;
        this.pool = [];
        this.activeBullets = [];
        this.bulletSpeed = 30;
        this.lifeTime = 3.0;

        // ===== ОПТИМИЗАЦИЯ: ОБЩАЯ ГЕОМЕТРИЯ =====
        const geometry = new THREE.SphereGeometry(0.15, 6, 6);
        const material = new THREE.MeshStandardMaterial({
            color: 0x00ccff,
            emissive: 0x0088ff,
            emissiveIntensity: 0.5
        });

        for (let i = 0; i < poolSize; i++) {
            const mesh = new THREE.Mesh(geometry, material.clone());
            mesh.visible = false;
            this.scene.add(mesh);
            this.pool.push({
                mesh: mesh,
                direction: new THREE.Vector3(),
                age: 0,
                active: false,
                ownerId: null
            });
        }
    }

    shoot(position, direction, ownerId) {
        const bullet = this.pool.find(b => !b.active);
        if (!bullet) {
            console.warn('⚠️ Пул пуль исчерпан!');
            return null;
        }

        bullet.mesh.position.copy(position);
        bullet.direction.copy(direction).normalize();
        bullet.age = 0;
        bullet.active = true;
        bullet.mesh.visible = true;
        bullet.ownerId = ownerId;
        this.activeBullets.push(bullet);
        return bullet;
    }

    update(deltaTime) {
        for (let i = this.activeBullets.length - 1; i >= 0; i--) {
            const bullet = this.activeBullets[i];
            bullet.age += deltaTime;

            bullet.mesh.position.x += bullet.direction.x * this.bulletSpeed * deltaTime;
            bullet.mesh.position.y += bullet.direction.y * this.bulletSpeed * deltaTime;
            bullet.mesh.position.z += bullet.direction.z * this.bulletSpeed * deltaTime;

            if (bullet.age > this.lifeTime) {
                this.deactivateBullet(bullet);
                this.activeBullets.splice(i, 1);
            }
        }
    }

    deactivateBullet(bullet) {
        bullet.active = false;
        bullet.mesh.visible = false;
        bullet.ownerId = null;
    }

    getActiveBullets() {
        return this.activeBullets;
    }

    clear() {
        for (const bullet of this.pool) {
            this.scene.remove(bullet.mesh);
        }
        this.pool = [];
        this.activeBullets = [];
    }
}