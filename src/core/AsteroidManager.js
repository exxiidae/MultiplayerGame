import * as THREE from 'three';
import {MaterialManager} from './MaterialManager.js'

export class AsteroidManager{
    constructor(scene, ship_model, ship_obj){
        this.scene = scene;
        this.ship = ship_model;
        this.ship_obj = ship_obj;
        this.asteroids = [];
        this.materialManager = new MaterialManager();
        this.chank_length = 100;

        this.spawnAsteroids();
    }

    spawnAsteroids(){
        for(let i = 0; i < (this.chank_length / 3); i++){
            setTimeout(() => {
                const shipPosition = this.getPosition();
                
                // Добавляем случайное смещение в радиусе 
                const offsetX = (Math.random() - 0.5) * 100;  
                const offsetY = (Math.random() - 0.5) * 10;  
                const offsetZ = (Math.random() - 0.5) * 100;  

                const asteroid = this.createAsteroid();
                this.asteroids.push(asteroid);
                asteroid.position.set(
                    shipPosition.x + offsetX,
                    shipPosition.y + offsetY,
                    shipPosition.z + offsetZ
                );
                this.scene.add(asteroid);
            }, Math.random(500, 2500));
        }
    }

    getPosition() {
        return this.ship ? this.ship.position : new THREE.Vector3(0, 0, 0);
    }

    createAsteroid(){
        const geometry = new THREE.SphereGeometry(1, 32, 32);
        const material = this.materialManager.createMaterial('cratered_rock');
        const mesh = new THREE.Mesh(geometry, material);
        return mesh;
    }

    updateAsteroids(){
        if(this.asteroids.length < 25){
            this.spawnAsteroids();
        }
        for(let i = 0; i < this.asteroids.length; i++){
            //position fly & remove exit zone
            if(this.asteroids[i].position.distanceTo(this.ship.position) > this.chank_length){
                this.scene.remove(this.asteroids[i]);
                this.asteroids.splice(i, 1);
            }
            else{
                this.asteroids[i].rotation.z -= 0.005;
                this.asteroids[i].rotation.x -= 0.005;

                this.asteroids[i].position.x -= 0.05;
                this.asteroids[i].position.z -= 0.05;
                
            }
            //collision
            if(this.asteroids[i].position.distanceTo(this.ship.position) < 5){
                this.ship_obj.hp -= 10;
                console.log(this.ship_obj.hp)
                this.scene.remove(this.asteroids[i]);
                this.asteroids.splice(i, 1);
            }
        }
    }
}