// Game config
const CANVAS = document.getElementById('gameCanvas');
const CTX = CANVAS.getContext('2d');
const WIDTH = CANVAS.width;
const HEIGHT = CANVAS.height;

let gameState = 'shop'; // 'shop', 'playing', 'gameOver'
let score = 0;
let level = 1;
let wave = 1;
let health = 100;
let weapon = 'sword'; // Current weapon
let points = 0; // Shop currency (score on death)
let enemies = [];
let bullets = [];
let particles = [];
let boss = null;
let lastSpawn = 0;
let waveTimer = 0;
let keys = {};
let animationId; // Track loop ID

// Weapons data
const WEAPONS = {
    sword: { damage: 20, range: 50, rate: 200, cost: 0, color: '#0f0' }, // Faster rate for melee feel
    pistol: { damage: 30, range: 150, rate: 300, cost: 50, color: '#00f' },
    shotgun: { damage: 15, range: 100, rate: 400, cost: 150, color: '#f0f', aoe: true },
    laser: { damage: 40, range: 300, rate: 200, cost: 300, color: '#f00', pierce: true }
};

// Player (Ninja)
const player = {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    size: 15,
    speed: 5,
    lastShot: 0
};

// Input handling
window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// Wait for DOM to load before attaching events
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded—attaching events');

    // Shop events
    document.querySelectorAll('.item').forEach(btn => {
        btn.addEventListener('click', () => {
            const w = btn.dataset.weapon;
            const cost = parseInt(btn.dataset.cost);
            if (points >= cost) {
                points -= cost;
                weapon = w;
                document.getElementById('weapon').textContent = w.charAt(0).toUpperCase() + w.slice(1);
                updateShopScore();
                // Visual feedback
                btn.classList.add('active');
                setTimeout(() => btn.classList.remove('active'), 500);
            }
        });
    });

    document.getElementById('startBtn').addEventListener('click', () => {
        console.log('Start button clicked! Diving in...');
        startGame();
    });

    document.getElementById('restartBtn').addEventListener('click', () => {
        console.log('Restart clicked—reborn!');
        restartGame();
    });

    // Init HUD
    updateHUD();
});

// Game loop
function gameLoop(timestamp = 0) {
    if (gameState !== 'playing') {
        // Only run loop in playing state—pause on shop/death
        animationId = requestAnimationFrame(gameLoop);
        return;
    }

    CTX.clearRect(0, 0, WIDTH, HEIGHT);
    
    updatePlayer();
    spawnEnemies(timestamp);
    updateEnemies(timestamp);
    updateBullets();
    updateParticles();
    checkCollisions();
    waveTimer++;
    if (waveTimer > 10000) { // ~10s per wave
        wave++;
        if (wave % 10 === 0) level++;
        if (level % 5 === 0 && !boss) spawnBoss();
        waveTimer = 0;
        score += 10 * level; // Survival bonus
        updateHUD();
    }
    draw();
    updateHUD();
    
    animationId = requestAnimationFrame(gameLoop);
}

// Player movement & sword melee
function updatePlayer() {
    if (keys['w'] || keys['arrowup']) player.y = Math.max(player.size, player.y - player.speed);
    if (keys['s'] || keys['arrowdown']) player.y = Math.min(HEIGHT - player.size, player.y + player.speed);
    if (keys['a'] || keys['arrowleft']) player.x = Math.max(player.size, player.x - player.speed);
    if (keys['d'] || keys['arrowright']) player.x = Math.min(WIDTH - player.size, player.x + player.speed);
    
    // Auto-attack
    const nearest = findNearestEnemy();
    if (nearest && Date.now() - player.lastShot > WEAPONS[weapon].rate) {
        if (weapon === 'sword') {
            // Direct melee—no shoot()
            const dist = Math.sqrt((player.x - nearest.x)**2 + (player.y - nearest.y)**2);
            if (dist < WEAPONS.sword.range) {
                nearest.health -= WEAPONS.sword.damage;
                console.log('Sword slash! Dmg:', WEAPONS.sword.damage, 'Target HP:', nearest.health); // Debug
                if (nearest.health <= 0) {
                    score += 10 * level;
                    createParticles(nearest.x, nearest.y, 5, '#0f0');
                    const idx = enemies.indexOf(nearest);
                    if (idx > -1) enemies.splice(idx, 1);
                    if (nearest === boss) boss = null;
                }
                player.lastShot = Date.now();
            }
        } else {
            // Ranged: shoot bullets
            shoot(nearest);
            player.lastShot = Date.now();
        }
    }
}

// Enemy spawning (faster initial for action)
function spawnEnemies(timestamp) {
    const spawnDelay = Math.max(200, 1000 / level); // Min 200ms, faster per level
    if (timestamp - lastSpawn > spawnDelay) {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        if (side === 0) { x = Math.random() * WIDTH; y = -20; }
        else if (side === 1) { x = WIDTH + 20; y = Math.random() * HEIGHT; }
        else if (side === 2) { x = Math.random() * WIDTH; y = HEIGHT + 20; }
        else { x = -20; y = Math.random() * HEIGHT; }
        
        enemies.push({
            x, y, size: 10 + Math.random() * 10, speed: 1 + level * 0.5,
            health: 20 + level * 10, maxHealth: 20 + level * 10, color: '#f00'
        });
        lastSpawn = timestamp;
    }
}

// Boss spawn
function spawnBoss() {
    boss = {
        x: WIDTH / 2, y: -50, size: 50, speed: 2,
        health: 200 + level * 50, maxHealth: 200 + level * 50,
        color: '#900' // Dark red
    };
    console.log('Boss spawned—level', level);
}

// Update enemies (chase player)
function updateEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 0) {
            e.x += (dx / dist) * e.speed;
            e.y += (dy / dist) * e.speed;
        }
        // Remove off-screen
        if (e.y > HEIGHT + 50 || e.x < -50 || e.x > WIDTH + 50 || e.y < -50) {
            enemies.splice(i, 1);
        }
    }
    if (boss) {
        const bdx = player.x - boss.x;
        const bdy = player.y - boss.y;
        const bdist = Math.sqrt(bdx*bdx + bdy*bdy);
        if (bdist > 0) {
            boss.x += (bdx / bdist) * boss.speed;
            boss.y += (bdy / bdist) * boss.speed;
        }
        if (boss.y > HEIGHT + 50 || boss.x < -50 || boss.x > WIDTH + 50) boss = null;
    }
}

// Shooting (ranged only)
function shoot(target) {
    const w = WEAPONS[weapon];
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const angle = Math.atan2(dy, dx);
    
    if (w.aoe) { // Shotgun spread
        for (let i = -2; i <= 2; i++) {
            const spreadAngle = angle + (i * 0.2);
            bullets.push({
                x: player.x, y: player.y, vx: Math.cos(spreadAngle) * 10, vy: Math.sin(spreadAngle) * 10,
                damage: w.damage, color: w.color
            });
        }
    } else {
        bullets.push({
            x: player.x, y: player.y, vx: (dx / dist) * 8, vy: (dy / dist) * 8,
            damage: w.pierce ? w.damage * 2 : w.damage, color: w.color, range: w.range, distTraveled: 0
        });
    }
}

// Update bullets
function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        if (b.range) b.distTraveled += Math.sqrt(b.vx*b.vx + b.vy*b.vy);
        
        if (b.x < 0 || b.x > WIDTH || b.y < 0 || b.y > HEIGHT || (b.range && b.distTraveled > b.range)) {
            bullets.splice(i, 1);
            continue;
        }
    }
}

// Particles (for kills/explosions)
function createParticles(x, y, count = 10, color = '#ff0') {
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 30, color
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

// Collisions (bullets & touches)
function checkCollisions() {
    // Bullets vs enemies/boss
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
        const b = bullets[bi];
        let hit = false;

        for (let ei = enemies.length - 1; ei >= 0; ei--) {
            const e = enemies[ei];
            const dx = b.x - e.x;
            const dy = b.y - e.y;
            if (Math.sqrt(dx*dx + dy*dy) < e.size + 3) {
                e.health -= b.damage;
                hit = true;
                if (e.health <= 0) {
                    score += 10 * level;
                    createParticles(e.x, e.y, 5, '#f00');
                    enemies.splice(ei, 1);
                }
                if (!WEAPONS[weapon].pierce) break; // Non-pierce stops
            }
        }

        if (boss && !hit) {
            const dx = b.x - boss.x;
            const dy = b.y - boss.y;
            if (Math.sqrt(dx*dx + dy*dy) < boss.size + 3) {
                boss.health -= b.damage;
                hit = true;
                if (boss.health <= 0) {
                    score += 100 * level;
                    createParticles(boss.x, boss.y, 20, '#900');
                    boss = null;
                    level++;
                }
            }
        }

        if (hit) bullets.splice(bi, 1);
    }
    
    // Enemies vs player
    enemies.forEach(e => {
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        if (Math.sqrt(dx*dx + dy*dy) < player.size + e.size) {
            health -= 1;
            if (health <= 0) endGame();
        }
    });
    if (boss) {
        const dx = player.x - boss.x;
        const dy = player.y - boss.y;
        if (Math.sqrt(dx*dx + dy*dy) < player.size + boss.size) {
            health -= 2;
            if (health <= 0) endGame();
        }
    }
}

function findNearestEnemy() {
    let nearest = null;
    let minDist = Infinity;
    enemies.forEach(e => {
        const dist = Math.sqrt((player.x - e.x)**2 + (player.y - e.y)**2);
        if (dist < minDist) {
            minDist = dist;
            nearest = e;
        }
    });
    if (boss) {
        const bdist = Math.sqrt((player.x - boss.x)**2 + (player.y - boss.y)**2);
        if (bdist < minDist) {
            minDist = bdist;
            nearest = boss;
        }
    }
    return nearest && minDist < WEAPONS[weapon].range ? nearest : null;
}

// Drawing
function draw() {
    // Player (ninja - simple triangle)
    CTX.fillStyle = '#0f0';
    CTX.beginPath();
    CTX.moveTo(player.x, player.y - player.size);
    CTX.lineTo(player.x - player.size, player.y + player.size);
    CTX.lineTo(player.x + player.size, player.y + player.size);
    CTX.closePath();
    CTX.fill();
    
    // Enemies (red balls)
    enemies.forEach(e => {
        CTX.fillStyle = e.color;
        CTX.beginPath();
        CTX.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        CTX.fill();
        // Health bar
        const barWidth = e.size * 2;
        CTX.fillStyle = '#f00';
        CTX.fillRect(e.x - barWidth/2, e.y - e.size - 10, barWidth, 5);
        CTX.fillStyle = '#0f0';
        CTX.fillRect(e.x - barWidth/2, e.y - e.size - 10, (e.health / e.maxHealth) * barWidth, 5);
    });
    
    if (boss) {
        CTX.fillStyle = boss.color;
        CTX.beginPath();
        CTX.arc(boss.x, boss.y, boss.size, 0, Math.PI * 2);
        CTX.fill();
        // Boss health
        const bBarWidth = boss.size * 2;
        CTX.fillStyle = '#f00';
        CTX.fillRect(boss.x - bBarWidth/2, boss.y - boss.size - 15, bBarWidth, 8);
        CTX.fillStyle = '#0f0';
        CTX.fillRect(boss.x - bBarWidth/2, boss.y - boss.size - 15, (boss.health / boss.maxHealth) * bBarWidth, 8);
    }
    
    // Bullets
    bullets.forEach(b => {
        CTX.fillStyle = b.color;
        CTX.beginPath();
        CTX.arc(b.x, b.y, 3, 0, Math.PI * 2);
        CTX.fill();
    });
    
    // Particles
    particles.forEach(p => {
        CTX.globalAlpha = p.life / 30;
        CTX.fillStyle = p.color;
        CTX.beginPath();
        CTX.arc(p.x, p.y, 3, 0, Math.PI * 2);
        CTX.fill();
        CTX.globalAlpha = 1;
    });
}

// HUD updates
function updateHUD() {
    document.getElementById('level').textContent = level;
    document.getElementById('score').textContent = score;
    document.getElementById('wave').textContent = wave;
    document.getElementById('health').textContent = Math.max(0, health); // Clamp to 0
    document.getElementById('weapon').textContent = weapon.charAt(0).toUpperCase() + weapon.slice(1);
}

function updateShopScore() {
    document.getElementById('shopScore').textContent = points;
}

// Game state functions
function startGame() {
    console.log('startGame called—state to playing');
    gameState = 'playing';
    document.getElementById('shop').classList.add('hidden');
    health = 100;
    enemies = [];
    bullets = [];
    particles = [];
    boss = null;
    wave = 1;
    waveTimer = 0;
    lastSpawn = 0;
    player.lastShot = 0;
    // Cancel old loop, start fresh
    if (animationId) cancelAnimationFrame(animationId);
    requestAnimationFrame(gameLoop);
}

function endGame() {
    console.log('Game over—health 0');
    gameState = 'gameOver';
    points = score; // Carry over to shop
    updateShopScore();
    document.getElementById('finalScore').textContent = score;
    document.getElementById('gameOver').classList.remove('hidden');
    document.getElementById('shop').classList.remove('hidden');
    // Full pause: clear arrays, cancel loop
    enemies = [];
    bullets = [];
    particles = [];
    if (animationId) cancelAnimationFrame(animationId);
    // Keep loop "running" but idle (from loop guard)
    animationId = requestAnimationFrame(gameLoop);
}

function restartGame() {
    console.log('Restart—back to shop');
    score = 0;
    level = 1;
    wave = 1;
    health = 100;
    weapon = 'sword';
    points = 0;
    enemies = [];
    bullets = [];
    particles = [];
    boss = null;
    updateHUD();
    updateShopScore();
    document.getElementById('gameOver').classList.add('hidden');
    gameState = 'shop';
    document.getElementById('shop').classList.remove('hidden');
    // Idle loop
    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(gameLoop);
}

// Start idle loop
requestAnimationFrame(gameLoop);
