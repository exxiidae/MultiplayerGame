import * as THREE from 'three';
import { SHIP_CONFIG } from '../config/ship.js';

export class Ship {
    constructor(modelLoader, index, scale = 1) {
        this.modelLoader = modelLoader;
        this.collection_ship = ['scout', 'assault', 'lazership'];
        this.ship = null;
        this.hp = SHIP_CONFIG.type[this.collection_ship[index]]?.hp || 100;
        this.createShip(index, scale);
    }

    createShip(index, scale) {
        this.modelLoader.load(index, scale);
    }
}