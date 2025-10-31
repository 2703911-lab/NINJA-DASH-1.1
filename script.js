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

// Weapons data
const WEAPONS = {
    sword: { damage: 20, range: 50, rate: 500, cost: 0, color: '#0f0' },
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
    console.log('DOM loaded—attaching events'); // Debug log

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
        console.log('Start button clicked! Diving in...'); // Debug
        startGame();
    });

    document.getElementById('restartBtn').addEventListener('click', restartGame);

    // Init HUD
    updateHUD();
});

// Game loop (with explicit first timestamp)
let animationId;
function gameLoop(timestamp = 0) { // Default 0 for first call
    console.log('Game loop tick:', gameState, timestamp); // Debug—remove later if spammy
    CTX.clearRect(0, 0, WIDTH, HEIGHT);
    
    if (gameState === 'playing') {
        updatePlayer();
        spawnEnemies(timestamp);
        updateEnemies(timestamp);
        updateBullets();
        updateParticles();
        checkCollisions();
        waveTimer++;
        if (waveTimer > 10000) { // ~10s per wave (adjust for FPS)
            wave++;
            if (wave % 10 === 0) level++;
            if (level % 5 === 0 && !boss) spawnBoss();
            waveTimer = 0;
            score += 10 * level; // Survival bonus
        }
        draw();
        updateHUD();
    }
    
    animationId = requestAnimationFrame(gameLoop);
}

// Player movement
function updatePlayer() {
    if (keys['w'] || keys['arrowup']) player.y = Math.max(player.size, player.y - player.speed);
    if (keys['s'] || keys['arrowdown']) player.y = Math.min(HEIGHT - player.size, player.y + player.speed);
    if (keys['a'] || keys['arrowleft']) player.x = Math.max(player.size, player.x - player.speed);
    if (keys['d'] || keys['arrowright']) player.x = Math.min(WIDTH - player.size, player.x + player.speed);
    
    // Auto-attack nearest enemy
    const nearest = findNearestEnemy();
    if (nearest && Date.now() - player.lastShot > WEAPONS[weapon].rate) { // Use Date.now() for reliability
        shoot(nearest);
        player.lastShot = Date.now();
    }
}

// Enemy spawning
function spawnEnemies(timestamp) {
    if (timestamp - lastSpawn > 1000 / level) { // Faster spawns per level
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
    console.log('Boss spawned—level', level); // Debug
}

// Update enemies (chase player)
function updateEnemies(timestamp) {
    enemies.forEach((e, i) => {
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 0) {
            e.x += (dx / dist) * e.speed;
            e.y += (dy / dist) * e.speed;
        }
        // Remove off-screen
        if (e.y > HEIGHT + 50 || e.x < -50 || e.x > WIDTH + 50) enemies.splice(i, 1);
    });
    if (boss) {
        const bdx = player.x - boss.x;
        const bdy = player.y - boss.y;
        const bdist = Math.sqrt(bdx*bdx + bdy*bdy);
        if (bdist > 0) {
            boss.x += (bdx / bdist) * boss.speed;
            boss.y += (bdy / bdist) * boss.speed;
        }
        if (boss.y > HEIGHT + 50) boss = null;
    }
}

// Shooting
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
    bullets.forEach((b, i) => {
        b.x += b.vx;
        b.y += b.vy;
        if (b.range) b.distTraveled += Math.sqrt(b.vx*b.vx + b.vy*b.vy);
        
        if (b.x < 0 || b.x > WIDTH || b.y < 0 || b.y > HEIGHT || (b.range && b.distTraveled > b.range)) {
            bullets.splice(i, 1);
            return;
        }
    });
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
    particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    });
}

// Collisions
function checkCollisions() {
    // Bullets vs enemies
    bullets.forEach((b, bi) => {
        enemies.forEach((e, ei) => {
            const dx = b.x - e.x;
            const dy = b.y - e.y;
            if (Math.sqrt(dx*dx + dy*dy) < e.size + 3) { // +bullet size
                e.health -= b.damage;
                bullets.splice(bi, 1);
                if (e.health <= 0) {
                    score += 10 * level;
                    createParticles(e.x, e.y, 5, '#f00');
                    enemies.splice(ei, 1);
                }
                return; // Stop checking this bullet
            }
        });
        // Boss hit
        if (boss) {
            const dx = b.x - boss.x;
            const dy = b.y - boss.y;
            if (Math.sqrt(dx*dx + dy*dy) < boss.size + 3) {
                boss.health -= b.damage;
                bullets.splice(bi, 1);
                if (boss.health <= 0) {
                    score += 100 * level;
                    createParticles(boss.x, boss.y, 20, '#900');
                    boss = null;
                    level++;
                }
                return;
            }
        }
    });
    
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
    
    // Sword melee (if close)
    if (weapon === 'sword') {
        const nearest = findNearestEnemy();
        if (nearest) {
            const dist = Math.sqrt((player.x - nearest.x)**2 + (player.y - nearest.y)**2);
            if (dist < WEAPONS.sword.range) {
                nearest.health -= WEAPONS.sword.damage;
                if (nearest.health <= 0) {
                    score += 10 * level;
                    createParticles(nearest.x, nearest.y, 5, '#0f0');
                    const idx = enemies.indexOf(nearest);
                    if (idx > -1) enemies.splice(idx, 1);
                }
            }
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
    if (boss && (!nearest || Math.sqrt((player.x - boss.x)**2 + (player.y - boss.y)**2) < minDist)) {
        nearest = boss;
    }
    return nearest && minDist < WEAPONS[weapon].range ? nearest : null;
}

// Drawing
function draw() {
    // Player (ninja - simple triangle for now)
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
    document.getElementById('health').textContent = health;
    document.getElementById('weapon').textContent = weapon.charAt(0).toUpperCase() + weapon.slice(1);
}

function updateShopScore() {
    document.getElementById('shopScore').textContent = points;
}

// Game state functions
function startGame() {
    console.log('startGame called—state to playing'); // Debug
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
    // Cancel any old loop, start fresh
    if (animationId) cancelAnimationFrame(animationId);
    requestAnimationFrame(gameLoop);
}

function endGame() {
    console.log('Game over—health 0'); // Debug
    gameState = 'gameOver';
    points = score; // Carry over score to shop
    updateShopScore();
    document.getElementById('finalScore').textContent = score;
    document.getElementById('gameOver').classList.remove('hidden');
    document.getElementById('shop').classList.remove('hidden');
    // Pause loop
    if (animationId) cancelAnimationFrame(animationId);
}

function restartGame() {
    console.log('Restart—back to shop'); // Debug
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
    // Restart loop if needed, but since shop, it's paused
}

// Init loop after DOM—moved here
window.addEventListener('DOMContentLoaded', () => {
    // ... (events above)
    requestAnimationFrame(gameLoop); // Start loop
});
