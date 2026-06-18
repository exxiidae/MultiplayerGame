import * as THREE from 'three';

export class Bullet {
    constructor(scene, position, direction, ownerId) {
        this.scene = scene;
        this.ownerId = ownerId;
        this.speed = 30;
        this.lifeTime = 3.0; // секунд до самоуничтожения
        this.age = 0;

        // Создаём геометрию пули (маленькая сфера)
        const geometry = new THREE.SphereGeometry(0.15, 8, 8);
        const material = new THREE.MeshStandardMaterial({
            color: 0x00ccff,
            emissive: 0x0088ff,
            emissiveIntensity: 0.5
        });
        this.mesh = new THREE.Mesh(geometry, material);
        
        // Устанавливаем позицию и направление
        this.mesh.position.copy(position);
        this.direction = direction.clone().normalize();
        
        // Добавляем световой эффект (точка света)
        const light = new THREE.PointLight(0x00ccff, 0.5, 5);
        this.mesh.add(light);
        
        this.scene.add(this.mesh);
    }

    update(deltaTime) {
        this.age += deltaTime;
        
        // Движение
        this.mesh.position.x += this.direction.x * this.speed * deltaTime;
        this.mesh.position.y += this.direction.y * this.speed * deltaTime;
        this.mesh.position.z += this.direction.z * this.speed * deltaTime;

        // Проверка на самоуничтожение
        if (this.age > this.lifeTime) {
            this.destroy();
            return false;
        }

        return true;
    }

    destroy() {
        this.scene.remove(this.mesh);
        // Очищаем ресурсы
        if (this.mesh.geometry) this.mesh.geometry.dispose();
        if (this.mesh.material) this.mesh.material.dispose();
    }

    getPosition() {
        return this.mesh.position;
    }
}