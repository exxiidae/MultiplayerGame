import * as THREE from 'three';
import { LIGHT_CONFIG } from '../config/light.js';

export class LightManager{
    constructor(scene){
        this.scene = scene;
        this.lights = {};
    }

    createAll(){
        this._createMainLight();
        this._createAmbientLight();
        this._createRimLight();

        return this.lights;
    }

    _createAmbientLight(){
        const config = LIGHT_CONFIG.ambient;
        const light = new THREE.AmbientLight(config.color, config.intesity);
        this.scene.add(light);
        this.lights.ambient = light;
    }

    _createMainLight(){
        const config = LIGHT_CONFIG.main;
        const light = new THREE.DirectionalLight(config.color, config.intesity);
        light.position.set(config.position.x, config.position.y, config.position.z);

        if(config.castShadow){
            light.castShadow = true;
            light.shadow.mapSize.width = config.shadowMapSize;
            light.shadow.mapSize.height = config.shadowMapSize;

            this.scene.add(light);
            this.lights.main = light;
        }
    }

    _createRimLight(){
        const config = LIGHT_CONFIG.rim;
        const light = new THREE.DirectionalLight(config.color, config.intensity);
        light.position.set(config.position.x, config.position.y, config.position.z);

        this.scene.add(light);
        this.lights.rim = light;
    }

    update(){
        if (this.lights.rim) {
            const random = Math.random() * 0.3 - 0.15; // от -0.15 до +0.15
            const baseIntensity = LIGHT_CONFIG.rim.intensity;
            this.lights.rim.intensity = Math.max(0.2, baseIntensity + random);
        }
    }

    getLight(name){
        return this.lights[name];
    }
}