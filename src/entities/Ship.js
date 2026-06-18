import * as THREE from 'three';
import {SHIP_CONFIG} from '../config/ship.js'

export class Ship{
    constructor(modelLoader, index){
        this.modelLoader = modelLoader;
        this.collection_ship = ['scout', 'assault']
        this.ship =  null;
        this.hp = SHIP_CONFIG.type[this.collection_ship[index]].hp;

        this.createShip(index);
    }

    createShip(index){
        this.modelLoader.load(index);
    }

}