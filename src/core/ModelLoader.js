import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MODELS_CONFIG } from '../config/model.js';

export class ModelLoader {
    constructor(scene) {
        this.scene = scene;
        this.model = null;
        this.positions = new THREE.Vector3(2, 0, 2);
    }

    load(index) {
        const url = MODELS_CONFIG.url;
        const loader = new GLTFLoader();
        loader.load(
            url[index],
            (gltf) => {
                this.model = gltf.scene;               
                if (index === 1) {
                    this.model.scale.set(0.2, 0.2, 0.2); 
                    
                }
                this.scene.add(this.model);
            },
            undefined,
            (error) => {
                console.error('Ошибка загрузки модели:', error);
            }
        );
    }
    load(index, scale = 2) {
        const url = MODELS_CONFIG.url;
        const loader = new GLTFLoader();
        loader.load(
            url[index],
            (gltf) => {
                this.model = gltf.scene;
                this.model.scale.set(scale, scale, scale);
                this.scene.add(this.model);
            },
            undefined,
            (error) => {
                console.error('Ошибка загрузки модели:', error);
            }
        );
    }

    _updatePosition() {
        this.positions.x += 4;
        this.positions.z += 4;
    }
}