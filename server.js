import Fastify from "fastify";
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fastify = Fastify({ logger: false });
const port = process.env.PORT || 3000;

fastify.register(fastifyStatic, { root: __dirname });
fastify.get('/', (_, reply) => reply.sendFile('index.html'));

const sessions = new Map();
const sessionMetadata = new Map();
const playerDataMap = new Map();

fastify.get('/api/sessions', async (_, reply) => {
    const sessionList = [];
    for (const [sessionId, players] of sessions) {
        sessionList.push({
            id: sessionId,
            players: players.size,
            created: sessionMetadata.get(sessionId)?.created || Date.now()
        });
    }
    sessionList.sort((a, b) => b.created - a.created);
    return reply.send(sessionList);
});

fastify.post('/api/create-session', async (request, reply) => {
    const { playerName } = request.body;
    const sessionId = `game_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    sessions.set(sessionId, new Map());
    sessionMetadata.set(sessionId, { created: Date.now() });
    return reply.send({ sessionId });
});

setInterval(() => {
    for (const [sessionId, players] of sessions) {
        if (players.size === 0) {
            sessions.delete(sessionId);
            sessionMetadata.delete(sessionId);
        }
    }
}, 30000);

const server = fastify.server;
fastify.listen({ port, host: '0.0.0.0' }, (err) => {
    if (err) {
        console.error('❌ Ошибка запуска:', err);
        process.exit(1);
    }
    console.log(`🚀 SERVER RUN: http://localhost:${port}`);
});

const io = new Server(server);

class PlayerData {
    constructor(socketId, playerName, currentModel) {
        this.id = socketId;
        this.name = playerName;
        this.currentModel = currentModel || 0;
        this.position = { x: 0, y: 0, z: 0 };
        this.rotation = { x: 0, y: 0, z: 0 };
        this.sessionId = null;
        this.hp = 100;
        this.maxHp = 100;
        this.isDead = false;
    }
}

io.on('connection', (socket) => {
    console.log('🔌 Игрок подключился:', socket.id);

    socket.on('join', (sessionId, playerName, currentModel) => {
        console.log(`📥 Присоединение к сессии ${sessionId}, игрок ${playerName}`);
        
        if (!sessions.has(sessionId)) {
            sessions.set(sessionId, new Map());
            sessionMetadata.set(sessionId, { created: Date.now() });
        }
        
        const session = sessions.get(sessionId);
        const playerData = new PlayerData(socket.id, playerName, currentModel);
        playerData.sessionId = sessionId;
        
        session.set(socket.id, playerData);
        playerDataMap.set(socket.id, playerData);
        
        const otherPlayers = Array.from(session.values())
            .filter(p => p.id !== socket.id)
            .map(p => ({
                id: p.id,
                name: p.name,
                currentModel: p.currentModel,
                position: p.position,
                rotation: p.rotation,
                hp: p.hp,
                maxHp: p.maxHp,
                isDead: p.isDead || false
            }));
        
        socket.emit('init', otherPlayers);
        socket.broadcast.to(sessionId).emit('playerJoined', {
            id: playerData.id,
            name: playerData.name,
            currentModel: playerData.currentModel,
            position: playerData.position,
            rotation: playerData.rotation,
            hp: playerData.hp,
            maxHp: playerData.maxHp,
            isDead: playerData.isDead
        });
        
        socket.join(sessionId);
        console.log(`✅ Игрок ${playerName} присоединился. Всего в сессии: ${session.size}`);
    });
    
    socket.on('move', (position, rotation) => {
        const playerData = playerDataMap.get(socket.id);
        if (!playerData) return;
        
        const sessionId = playerData.sessionId;
        if (!sessionId) return;
        
        playerData.position = position;
        playerData.rotation = rotation;
        
        socket.to(sessionId).emit('playerMoved', {
            id: socket.id,
            position,
            rotation
        });
    });
    
    // ===== ВЫСТРЕЛ =====
    socket.on('shoot', (data) => {
        const playerData = playerDataMap.get(socket.id);
        if (!playerData || playerData.isDead) return;
        
        const sessionId = playerData.sessionId;
        if (!sessionId) return;
        
        socket.to(sessionId).emit('shoot', {
            position: data.position,
            direction: data.direction,
            ownerId: socket.id
        });
    });
    
    // ===== ПОПАДАНИЕ В ИГРОКА =====
    socket.on('hitPlayer', (targetId, damage) => {
        const attacker = playerDataMap.get(socket.id);
        if (!attacker || attacker.isDead) return;
        
        const target = playerDataMap.get(targetId);
        if (!target || target.isDead) return;
        
        if (attacker.sessionId !== target.sessionId) return;
        if (attacker.id === target.id) return;
        
        target.hp = Math.max(0, target.hp - damage);
        
        const sessionId = attacker.sessionId;
        
        // Уведомляем всех в сессии
        io.to(sessionId).emit('playerHpUpdate', {
            id: targetId,
            hp: target.hp,
            maxHp: target.maxHp
        });
        
        console.log(`💥 ${attacker.name} нанёс ${damage} урона ${target.name}. HP: ${target.hp}`);
        
        if (target.hp <= 0) {
            target.isDead = true;
            io.to(sessionId).emit('playerDied', {
                id: targetId,
                killerId: socket.id,
                killerName: attacker.name,
                targetName: target.name
            });
            console.log(`💀 ${target.name} уничтожен ${attacker.name}!`);
            
            // Возрождаем через 3 секунды
            setTimeout(() => {
                target.hp = target.maxHp;
                target.isDead = false;
                target.position = { x: 0, y: 0, z: 0 };
                target.rotation = { x: 0, y: 0, z: 0 };
                
                io.to(sessionId).emit('playerRespawn', {
                    id: targetId,
                    hp: target.hp,
                    maxHp: target.maxHp,
                    position: target.position,
                    rotation: target.rotation
                });
                console.log(`♻️ ${target.name} возрождён`);
            }, 5000);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('👋 Игрок отключился:', socket.id);
        const playerData = playerDataMap.get(socket.id);
        if (!playerData) return;
        
        const sessionId = playerData.sessionId;
        if (!sessionId) return;
        
        const session = sessions.get(sessionId);
        if (session) {
            session.delete(socket.id);
            socket.to(sessionId).emit('playerLeft', socket.id);
        }
        
        playerDataMap.delete(socket.id);
    });
});

process.on('SIGINT', () => {
    console.log('\n🛑 Завершение работы...');
    process.exit(0);
});