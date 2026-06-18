import * as THREE from 'three';
import { TEXTURES_CONFIG } from '../config/texture.js';

export class TextureLoader {
    constructor() {
        this.textureLoader = new THREE.TextureLoader();
    }

    load(index, key) {
        let ship_config = TEXTURES_CONFIG.url[key][index];
        const texture = this.textureLoader.load(ship_config)
        return texture;
    }
}