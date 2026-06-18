import * as THREE from 'three';
import {SceneManager} from "./core/SceneManager.js";
import {CameraManager} from "./core/CameraManager.js";
import {LightManager} from "./core/LightManager.js";
import {Settings} from "./utils/Settings.js"
import {ShipGenerator} from "./utils/ShipGenerator.js"
import {SkySettings} from "./utils/SkySettings.js"
import {ModelLoader} from "./core/ModelLoader.js"
import { PaneConstructor } from './utils/PaneConstructor.js';
import {AsteroidManager} from './core/AsteroidManager.js'
import {Ship} from './entities/Ship.js'


class Main{
    constructor(){
        this.sceneManager = null;
        this.cameraManager = null;
        this.lightManager = null;
        this.settings = null;
        this.renderer = null;
        this.camera = null;
        
        this.skySettings = null;
        this.shipGenerator = null;
        this.modelLoader = null;
        
        this.clock = null;
        this.model = null;

        this.ship = null;

        this.asteroidManager = null;
        this.asteroid = null;

        this.paneConstructor = null;
        
        this.init()
    }
    
    init(){
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enable = true;
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);

        this.sceneManager = new SceneManager();
        const scene = this.sceneManager.create();

        this.lightManager = new LightManager(scene);
        this.lightManager.createAll();

        this.settings = new Settings(scene);
        //this.settings.createAllHelpers();
        this.settings.createAllMeshes();
        
        this.skySettings = new SkySettings(scene);
        this.skySettings.createStars();

        this.modelLoader = new ModelLoader(scene);
        //this.modelLoader.load(0);
        this.ship = new Ship(this.modelLoader, 0);
        console.log(this.ship)

        setTimeout(()=> {
            this.model = this.modelLoader.model;
            //this.ship = this.modelLoader.model
            this.modelLoader.model = null;
            this.cameraManager = new CameraManager(this.renderer.domElement);
            this.cameraManager.create(this.model);
            //this.cameraManager.createFlyControls();
            this.cameraManager.createOrbitControls(this.model);
            this.asteroidManager = new AsteroidManager(scene, this.model, this.ship);
        }, 500)  

        this.clock = new THREE.Clock();

        window.addEventListener('resize', () => this.onWindowResize());

        window.addEventListener('keydown', (event) => {
            if(event.key === 'a'){
                this.model.rotation.y -= 0.01;
                this.model.rotation.x -= 0.01;
            }
            if(event.key === 'd'){
                this.model.rotation.y += 0.01;
                this.model.rotation.x += 0.01;
            }

            if(event.key === 's'){
                this.model.rotation.z -= 0.02;
                this.model.position.y -= 0.02;
            }

            if(event.key === 'w'){
                this.model.rotation.z += 0.02;
                this.model.position.y += 0.02;
            }
        })

        this.animate();
    }
    
    onWindowResize(){
        this.cameraManager.onWindowResize();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    animate(){
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();

        if(this.model){
            this.cameraManager.update(this.model, delta);
            this.model.position.z += 0.03;
        }

        if(this.asteroidManager){
            this.asteroidManager.updateAsteroids();
        }

        if(this.cameraManager){
            this.renderer.render(
                this.sceneManager.getScene(),         
                this.cameraManager.getCamera(),
                this.camera = this.cameraManager.getCamera()
            )
        }
        
    }
}

const game = new Main();
