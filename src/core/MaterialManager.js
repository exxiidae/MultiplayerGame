import * as THREE from 'three';
import {TextureLoader} from './TextureLoader.js'

export class MaterialManager{
    constructor(){
        this.textureLoader = new TextureLoader();
    }

    createMaterial(key){
        const map = this.textureLoader.load(0, key);
        //const map_ao = this.textureLoader.load(1, key);
        //const map_metallic = this.textureLoader.load(2, key);
        //const map_roughness = this.textureLoader.load(3, key);
        //const map_normal = this.textureLoader.load(4, key);
        //const map_heigth = this.textureLoader.load(5, key);
        const material = new THREE.MeshStandardMaterial({
            map: map, 
            //aoMap: map_ao, 
            //metalnessMap: map_metallic,
            //roughnessMap: map_roughness,
            //normalMap: map_normal,
            //displacementMap: map_heigth
        });

        return material;
    }
}