import Fastify from "fastify";
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
console.log('DB URL:', process.env.DATABASE_URL);
const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ========== ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ ==========
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/game_db',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ========== СОЗДАНИЕ ТАБЛИЦ ==========
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS players (
                id SERIAL PRIMARY KEY,
                socket_id VARCHAR(255) UNIQUE NOT NULL,
                username VARCHAR(100) NOT NULL,
                model_index INTEGER DEFAULT 0,
                total_games INTEGER DEFAULT 0,
                wins INTEGER DEFAULT 0,
                losses INTEGER DEFAULT 0,
                asteroids_destroyed INTEGER DEFAULT 0,
                kills INTEGER DEFAULT 0,
                deaths INTEGER DEFAULT 0,
                score INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                last_seen TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS game_sessions (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(255) UNIQUE NOT NULL,
                host_socket_id VARCHAR(255),
                player_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                ended_at TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS session_players (
                session_id VARCHAR(255) REFERENCES game_sessions(session_id) ON DELETE CASCADE,
                socket_id VARCHAR(255) REFERENCES players(socket_id) ON DELETE CASCADE,
                joined_at TIMESTAMP DEFAULT NOW(),
                left_at TIMESTAMP,
                score_in_session INTEGER DEFAULT 0,
                asteroids_destroyed_in_session INTEGER DEFAULT 0,
                kills_in_session INTEGER DEFAULT 0,
                deaths_in_session INTEGER DEFAULT 0,
                PRIMARY KEY (session_id, socket_id)
            );

            CREATE TABLE IF NOT EXISTS player_unlocks (
                socket_id VARCHAR(255) REFERENCES players(socket_id) ON DELETE CASCADE,
                unlock_type VARCHAR(50) NOT NULL,
                unlock_value VARCHAR(50) NOT NULL,
                unlocked_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (socket_id, unlock_type, unlock_value)
            );
        `);
        console.log('✅ Таблицы базы данных созданы');
    } catch (err) {
        console.error('❌ Ошибка создания таблиц:', err);
    }
}

initDatabase();

// ========== ФУНКЦИИ РАБОТЫ С БАЗОЙ ==========
async function getPlayerBySocket(socketId) {
    const result = await pool.query('SELECT * FROM players WHERE socket_id = $1', [socketId]);
    return result.rows[0];
}

async function getPlayerByUsername(username) {
    const result = await pool.query('SELECT * FROM players WHERE username = $1', [username]);
    return result.rows[0];
}

async function savePlayer(socketId, username, modelIndex = 0) {
    const result = await pool.query(
        `INSERT INTO players (socket_id, username, model_index, last_seen) 
         VALUES ($1, $2, $3, NOW()) 
         ON CONFLICT (socket_id) 
         DO UPDATE SET 
            username = EXCLUDED.username, 
            model_index = EXCLUDED.model_index,
            last_seen = NOW()
         RETURNING *`,
        [socketId, username, modelIndex]
    );
    return result.rows[0];
}

async function updatePlayerStats(socketId, stats) {
    const { asteroids_destroyed, kills, deaths, score, wins, losses } = stats;
    await pool.query(
        `UPDATE players SET 
            asteroids_destroyed = asteroids_destroyed + $2,
            kills = kills + $3,
            deaths = deaths + $4,
            score = score + $5,
            wins = wins + $6,
            losses = losses + $7,
            total_games = total_games + 1,
            last_seen = NOW()
         WHERE socket_id = $1`,
        [socketId, asteroids_destroyed || 0, kills || 0, deaths || 0, score || 0, wins || 0, losses || 0]
    );
}

async function saveSession(sessionId, hostSocketId) {
    const result = await pool.query(
        `INSERT INTO game_sessions (session_id, host_socket_id, player_count) 
         VALUES ($1, $2, 1) 
         ON CONFLICT (session_id) 
         DO UPDATE SET host_socket_id = EXCLUDED.host_socket_id
         RETURNING *`,
        [sessionId, hostSocketId]
    );
    return result.rows[0];
}

async function addPlayerToSession(sessionId, socketId) {
    await pool.query(
        `INSERT INTO session_players (session_id, socket_id) 
         VALUES ($1, $2) 
         ON CONFLICT (session_id, socket_id) DO NOTHING`,
        [sessionId, socketId]
    );
    await pool.query(
        `UPDATE game_sessions 
         SET player_count = (SELECT COUNT(*) FROM session_players WHERE session_id = $1 AND left_at IS NULL) 
         WHERE session_id = $1`,
        [sessionId]
    );
}

async function removePlayerFromSession(sessionId, socketId) {
    await pool.query(
        `UPDATE session_players 
         SET left_at = NOW() 
         WHERE session_id = $1 AND socket_id = $2`,
        [sessionId, socketId]
    );
    await pool.query(
        `UPDATE game_sessions 
         SET player_count = (SELECT COUNT(*) FROM session_players WHERE session_id = $1 AND left_at IS NULL) 
         WHERE session_id = $1`,
        [sessionId]
    );
}

async function updateSessionPlayerStats(sessionId, socketId, stats) {
    const { score, asteroids_destroyed, kills, deaths } = stats;
    await pool.query(
        `UPDATE session_players 
         SET score_in_session = score_in_session + $3,
             asteroids_destroyed_in_session = asteroids_destroyed_in_session + $4,
             kills_in_session = kills_in_session + $5,
             deaths_in_session = deaths_in_session + $6
         WHERE session_id = $1 AND socket_id = $2`,
        [sessionId, socketId, score || 0, asteroids_destroyed || 0, kills || 0, deaths || 0]
    );
}

async function getLeaderboard(limit = 10) {
    const result = await pool.query(
        `SELECT username, score, kills, wins, total_games, asteroids_destroyed
         FROM players 
         ORDER BY score DESC 
         LIMIT $1`,
        [limit]
    );
    return result.rows;
}

// ========== ОСНОВНОЙ КОД СЕРВЕРА ==========
const fastify = Fastify({ logger: false });
const port = process.env.PORT || 3000;

fastify.register(fastifyStatic, { root: __dirname });
fastify.get('/', (_, reply) => reply.sendFile('index.html'));

const sessions = new Map();
const sessionMetadata = new Map();
const playerDataMap = new Map();

// ===== API: СПИСОК СЕССИЙ =====
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

// ===== API: СОЗДАНИЕ СЕССИИ =====
fastify.post('/api/create-session', async (request, reply) => {
    const { playerName } = request.body;
    const sessionId = `game_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    sessions.set(sessionId, new Map());
    sessionMetadata.set(sessionId, { created: Date.now() });
    return reply.send({ sessionId });
});

// ===== API: ТАБЛИЦА ЛИДЕРОВ =====
fastify.get('/api/leaderboard', async (_, reply) => {
    try {
        const leaderboard = await getLeaderboard(10);
        return reply.send(leaderboard);
    } catch (err) {
        console.error('Ошибка получения лидерборда:', err);
        return reply.send([]);
    }
});

// ===== API: СТАТИСТИКА ИГРОКА ПО SOCKET ID =====
fastify.get('/api/player/:socketId', async (request, reply) => {
    try {
        const { socketId } = request.params;
        const player = await getPlayerBySocket(socketId);
        if (!player) {
            return reply.status(404).send({ error: 'Игрок не найден' });
        }
        return reply.send(player);
    } catch (err) {
        console.error('Ошибка получения статистики:', err);
        return reply.status(500).send({ error: 'Ошибка сервера' });
    }
});

// ===== API: СТАТИСТИКА ИГРОКА ПО НИКУ =====
fastify.get('/api/player/name/:username', async (request, reply) => {
    try {
        const { username } = request.params;
        const player = await getPlayerByUsername(username);
        if (!player) {
            return reply.status(404).send({ error: 'Игрок не найден' });
        }
        return reply.send({
            username: player.username,
            score: player.score,
            kills: player.kills,
            deaths: player.deaths,
            wins: player.wins,
            total_games: player.total_games,
            asteroids_destroyed: player.asteroids_destroyed
        });
    } catch (err) {
        console.error('Ошибка получения статистики по нику:', err);
        return reply.status(500).send({ error: 'Ошибка сервера' });
    }
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
        this.score = 0;
        this.asteroidsDestroyed = 0;
        this.kills = 0;
        this.deaths = 0;
    }
}

io.on('connection', (socket) => {
    console.log('🔌 Игрок подключился:', socket.id);

    socket.on('join', async (sessionId, playerName, currentModel) => {
    console.log(`📥 Присоединение к сессии ${sessionId}, игрок ${playerName}, модель ${currentModel}`);
    
    // 1. Сохраняем игрока в БД
    try {
        await savePlayer(socket.id, playerName, currentModel);
        console.log(`✅ Игрок ${playerName} сохранён в БД`);
    } catch (err) {
        console.error('❌ Ошибка сохранения игрока:', err);
    }
    
    // 2. Проверяем, есть ли сессия в памяти
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, new Map());
        sessionMetadata.set(sessionId, { created: Date.now() });
        
        // 3. СОЗДАЁМ СЕССИЮ В БАЗЕ ДО ТОГО, КАК ДОБАВЛЯТЬ ИГРОКА
        try {
            await saveSession(sessionId, socket.id);
            console.log(`✅ Сессия ${sessionId} создана в БД`);
        } catch (err) {
            console.error('❌ Ошибка создания сессии:', err);
        }
    }
    
    const session = sessions.get(sessionId);
    const playerData = new PlayerData(socket.id, playerName, currentModel);
    playerData.sessionId = sessionId;
    
    session.set(socket.id, playerData);
    playerDataMap.set(socket.id, playerData);
    
    // 4. Загружаем статистику игрока
    try {
        const playerStats = await getPlayerBySocket(socket.id);
        if (playerStats) {
            socket.emit('playerStats', {
                score: playerStats.score,
                kills: playerStats.kills,
                deaths: playerStats.deaths,
                wins: playerStats.wins,
                total_games: playerStats.total_games,
                asteroids_destroyed: playerStats.asteroids_destroyed
            });
        }
    } catch (err) {
        console.error('❌ Ошибка загрузки статистики:', err);
    }
    
    // 5. ДОБАВЛЯЕМ ИГРОКА В СЕССИЮ (теперь сессия точно существует)
    try {
        await addPlayerToSession(sessionId, socket.id);
        console.log(`✅ Игрок ${playerName} добавлен в сессию ${sessionId}`);
    } catch (err) {
        console.error('❌ Ошибка добавления игрока в сессию:', err);
    }
    
    // Остальной код (отправка другим игрокам, join комнаты)
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
    
    socket.on('updateStats', async (stats) => {
        const playerData = playerDataMap.get(socket.id);
        if (!playerData) return;
        
        const sessionId = playerData.sessionId;
        if (!sessionId) return;
        
        if (stats.asteroids_destroyed) {
            playerData.asteroidsDestroyed += stats.asteroids_destroyed;
        }
        if (stats.score) {
            playerData.score += stats.score;
        }
        if (stats.kills) {
            playerData.kills += stats.kills;
        }
        if (stats.deaths) {
            playerData.deaths += stats.deaths;
        }
        
        try {
            await updatePlayerStats(socket.id, {
                asteroids_destroyed: stats.asteroids_destroyed || 0,
                score: stats.score || 0,
                kills: stats.kills || 0,
                deaths: stats.deaths || 0,
                wins: stats.wins || 0,
                losses: stats.losses || 0
            });
            
            await updateSessionPlayerStats(sessionId, socket.id, {
                asteroids_destroyed: stats.asteroids_destroyed || 0,
                score: stats.score || 0,
                kills: stats.kills || 0,
                deaths: stats.deaths || 0
            });
            
            console.log(`📊 Статистика обновлена для ${playerData.name}`);
        } catch (err) {
            console.error('❌ Ошибка сохранения статистики:', err);
        }
    });
    
    socket.on('hitPlayer', async (targetId, damage) => {
        const attacker = playerDataMap.get(socket.id);
        if (!attacker || attacker.isDead) return;
        
        const target = playerDataMap.get(targetId);
        if (!target || target.isDead) return;
        
        if (attacker.sessionId !== target.sessionId) return;
        if (attacker.id === target.id) return;
        
        target.hp = Math.max(0, target.hp - damage);
        
        const sessionId = attacker.sessionId;
        
        io.to(sessionId).emit('playerHpUpdate', {
            id: targetId,
            hp: target.hp,
            maxHp: target.maxHp
        });
        
        console.log(`💥 ${attacker.name} нанёс ${damage} урона ${target.name}. HP: ${target.hp}`);
        
        if (target.hp <= 0) {
            target.isDead = true;
            
            attacker.kills += 1;
            target.deaths += 1;
            
            try {
                await updatePlayerStats(attacker.id, {
                    kills: 1,
                    score: 10
                });
                await updatePlayerStats(target.id, {
                    deaths: 1
                });
            } catch (err) {
                console.error('❌ Ошибка сохранения убийства:', err);
            }
            
            io.to(sessionId).emit('playerDied', {
                id: targetId,
                killerId: socket.id,
                killerName: attacker.name,
                targetName: target.name
            });
            console.log(`💀 ${target.name} уничтожен ${attacker.name}!`);
            
            setTimeout(async () => {
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
    
    socket.on('disconnect', async () => {
        console.log('👋 Игрок отключился:', socket.id);
        const playerData = playerDataMap.get(socket.id);
        if (!playerData) return;
        
        const sessionId = playerData.sessionId;
        if (!sessionId) return;
        
        try {
            await updatePlayerStats(socket.id, {
                asteroids_destroyed: playerData.asteroidsDestroyed || 0,
                score: playerData.score || 0,
                kills: playerData.kills || 0,
                deaths: playerData.deaths || 0
            });
            await removePlayerFromSession(sessionId, socket.id);
        } catch (err) {
            console.error('❌ Ошибка сохранения при выходе:', err);
        }
        
        const session = sessions.get(sessionId);
        if (session) {
            session.delete(socket.id);
            socket.to(sessionId).emit('playerLeft', socket.id);
        }
        
        playerDataMap.delete(socket.id);
    });
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Завершение работы...');
    await pool.end();
    process.exit(0);
});