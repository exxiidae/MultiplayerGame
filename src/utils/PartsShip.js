import * as THREE from 'three';
import {TextureLoader} from '../core/TextureLoader.js';

export class PartsShip {
    constructor() {
        this.ship = null;
        this.cabine = null;
        this.texture_loader = new TextureLoader();
    }
    
    createCabin(){
        const map = this.texture_loader.load_maps(1);
        const ao = this.texture_loader.load_maps(2);
        const height = this.texture_loader.load_maps(2);
        const geometry = new THREE.SphereGeometry();
        const material = new THREE.MeshStandardMaterial( { map: map , aoMap: ao, displacementMap: height} );
        console.log(material);
        this.cabin = new THREE.Mesh(geometry, material);
        return this.cabin;
    }
}