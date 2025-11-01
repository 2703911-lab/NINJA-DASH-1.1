// Game config
const CANVAS = document.getElementById('gameCanvas');
const CTX = CANVAS.getContext('2d');
const WIDTH = CANVAS.width;
const HEIGHT = CANVAS.height;

let gameState = 'shop'; // 'shop', 'playing', 'paused', 'gameOver', 'menu', 'settings'
let score = 0;
let level = 1;
let wave = 1;
let health = 100;
let weapon = 'sword';
let points = 0;
let enemies = [];
let bullets = [];
let particles = [];
let boss = null;
let powerups = []; // Collected
let lastSpawn = 0;
let waveTimer = 0;
let keys = {};
let animationId;
let screenShake = 0;
let pauseMenuOpen = false;
let selectedHotbar = 0;

// Weapons
const WEAPONS = {
    sword: { damage: 25, range: 60, rate: 150, cost: 0, color: '#0f0', key: 1 },
    pistol: { damage: 35, range: 180, rate: 250, cost: 50, color: '#00f', key: 2 },
    shotgun: { damage: 18, range: 120, rate: 350, cost: 150, color: '#f0f', aoe: true, key: 3 },
    laser: { damage: 50, range: 350, rate: 180, cost: 300, color: '#f00', pierce: true, key: 4 }
};
const weaponList = Object.keys(WEAPONS);

// Power-ups types
const POWERUPS = {
    speed: { duration: 5000, effect: () => player.speed = 8 },
    shield: { duration: 5000, effect: () => player.shielded = true },
    bomb: { effect: () => explodeScreen() }
};

// Player
const player = {
    x: WIDTH / 2, y: HEIGHT / 2, size: 18, speed: 5, lastShot: 0, shielded: false
};

// Save/Load
function saveGame() {
    const save = { level, weapon, points, score, highScore: Math.max(score, localStorage.getItem('ninjaHigh') || 0) };
    localStorage.setItem('ninjaSave', JSON.stringify(save));
    console.log('💾 Saved:', save);
}
function loadGame() {
    const save = JSON.parse(localStorage.getItem('ninjaSave') || '{}');
    level = save.level || 1;
    weapon = save.weapon || 'sword';
    points = save.points || 0;
    score = save.score || 0;
    localStorage.setItem('ninjaHigh', Math.max(score, localStorage.getItem('ninjaHigh') || 0));
    updateHUD();
    updateShopScore();
    console.log('📂 Loaded:', save);
}

// Input
window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.key >= '1' && e.key <= '4') {
        selectedHotbar = parseInt(e.key) - 1;
        weapon = weaponList[selectedHotbar];
        updateHotbar();
        updateHUD();
    }
    if (e.key.toLowerCase() === 'f' && powerups.length > 0) usePowerup();
    if (e.key.toLowerCase() === 'p') toggleShop();
    if (e.key === 'Escape') togglePauseMenu();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// DOM Ready
window.addEventListener('DOMContentLoaded', () => {
    loadGame(); // Load progress
    document.querySelectorAll('.item, .hotkey').forEach(btn => {
        btn.addEventListener('click', () => {
            const w = btn.dataset.weapon;
            const cost = parseInt(btn.dataset.cost || 0);
            if (points >= cost) {
                points -= cost;
                weapon = w;
                updateHotbar();
                updateHUD();
                updateShopScore();
                btn.classList.add('active');
                setTimeout(() => btn.classList.remove('active'), 500);
            }
        });
    });
    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('restartBtn').addEventListener('click', restartGame);
    document.getElementById('resumeBtn').addEventListener('click', togglePauseMenu);
    document.getElementById('leaveBtn').addEventListener('click', () => location.reload());
    document.getElementById('saveBtn').addEventListener('click', saveGame);
    document.getElementById('backBtn').addEventListener('click', () => {
        document.getElementById('settings').classList.add('hidden');
        document.getElementById('pauseMenu').classList.remove('hidden');
    });
    updateHUD();
    requestAnimationFrame(gameLoop);
});

// Game Loop
function gameLoop() {
    CTX.clearRect(0, 0, WIDTH, HEIGHT);
    if (gameState === 'playing' && !pauseMenuOpen) {
        updatePlayer();
        spawnEnemies(Date.now());
        updateEnemies();
        updateBullets();
        updateParticles();
        updatePowerups();
        checkCollisions();
        waveTimer++;
        if (waveTimer > 8000) { // Faster waves
            wave++;
            if (wave % 10 === 0) level++;
            if (level % 5 === 0 && !boss) spawnBoss();
            waveTimer = 0;
            score += 20 * level;
        }
        draw();
    } else if (gameState === 'playing') {
        draw(); // Draw static while paused
    }
    updateHUD();
    animationId = requestAnimationFrame(gameLoop);
}

// Movement + Auto-attack
function updatePlayer() {
    // Movement
    if (keys['w'] || keys['arrowup']) player.y = Math.max(player.size, player.y - player.speed);
    if (keys['s'] || keys['arrowdown']) player.y = Math.min(HEIGHT - player.size, player.y + player.speed);
    if (keys['a'] || keys['arrowleft']) player.x = Math.max(player.size, player.x - player.speed);
    if (keys['d'] || keys['arrowright']) player.x = Math.min(WIDTH - player.size, player.x + player.speed);

    // Shield expire
    if (player.shielded && Date.now() - (player.shieldStart || 0) > POWERUPS.shield.duration) player.shielded = false;

    // Auto-attack
    const nearest = findNearestEnemy();
    if (nearest && Date.now() - player.lastShot > WEAPONS[weapon].rate) {
        if (weapon === 'sword') {
            const dist = Math.hypot(player.x - nearest.x, player.y - nearest.y);
            if (dist < WEAPONS.sword.range) {
                nearest.health -= WEAPONS.sword.damage;
                if (nearest.health <= 0) {
                    score += 10 * level;
                    explodeKill(nearest.x, nearest.y, 12, '#0f0');
                    removeEnemy(nearest);
                }
                player.lastShot = Date.now();
            }
        } else {
            shoot(nearest);
            player.lastShot = Date.now();
        }
    }
}

// Spawns, updates, collisions (optimized loops, boss rage, powerup drops)
function spawnEnemies(timestamp) {
    const delay = Math.max(150, 800 / level);
    if (timestamp - lastSpawn > delay) {
        // Spawn logic same as before...
        const side = Math.floor(Math.random() * 4);
        let x = 0, y = 0;
        if (side === 0) { x = Math.random() * WIDTH; y = -30; }
        else if (side === 1) { x = WIDTH + 30; y = Math.random() * HEIGHT; }
        else if (side === 2) { x = Math.random() * WIDTH; y = HEIGHT + 30; }
        else { x = -30; y = Math.random() * HEIGHT; }
        enemies.push({ x, y, size: 12 + Math.random() * 8, speed: 1.2 + level * 0.4, health: 25 + level * 12, maxHealth: 25 + level * 12, color: '#f22' });
        lastSpawn = timestamp;
    }
}

function spawnBoss() {
    boss = { x: WIDTH / 2, y: -60, size: 55, speed: 1.8, health: 250 + level * 60, maxHealth: 250 + level * 60, color: '#900', lastShot: 0 };
}

function updateEnemies() {
    // Chase + offscreen remove (reverse loops)
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const dist = Math.hypot(dx, dy);
        e.x += (dx / dist) * e.speed;
        e.y += (dy / dist) * e.speed;
        if (e.x < -50 || e.x > WIDTH + 50 || e.y < -50 || e.y > HEIGHT + 50) enemies.splice(i, 1);
    }
    if (boss) {
        const bdx = player.x - boss.x;
        const bdy = player.y - boss.y;
        const bdist = Math.hypot(bdx, bdy);
        boss.x += (bdx / bdist) * boss.speed * (boss.health < boss.maxHealth * 0.5 ? 1.5 : 1); // Rage faster
        boss.y += (bdy / bdist) * boss.speed * (boss.health < boss.maxHealth * 0.5 ? 1.5 : 1);
        // Rage shoot
        if (boss.health < boss.maxHealth * 0.5 && Date.now() - boss.lastShot > 700) {
            const bdxn = bdx / bdist;
            const bdyn = bdy / bdist;
            bullets.push({ x: boss.x, y: boss.y, vx: bdxn * 7, vy: bdyn * 7, damage: 8, color: '#f50', range: 0 });
            boss.lastShot = Date.now();
        }
    }
}

// Shoot, bullets, particles, collisions (with explodeKill, 5% powerup drop)
function shoot(target) {
    const w = WEAPONS[weapon];
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const angle = Math.atan2(dy, dx);
    if (w.aoe) {
        for (let i = -3; i <= 3; i++) {
            bullets.push({
                x: player.x, y: player.y,
                vx: Math.cos(angle + i * 0.15) * 11,
                vy: Math.sin(angle + i * 0.15) * 11,
                damage: w.damage, color: w.color
            });
        }
    } else {
        bullets.push({
            x: player.x, y: player.y,
            vx: (dx / Math.hypot(dx, dy)) * 9,
            vy: (dy / Math.hypot(dx, dy)) * 9,
            damage: w.pierce ? w.damage * 1.8 : w.damage,
            color: w.color, distTraveled: 0, range: w.range
        });
    }
}

function explodeKill(x, y, count, color) {
    createParticles(x, y, count, color);
    screenShake = 18;
    if (Math.random() < 0.05) { // 5% drop
        const types = Object.keys(POWERUPS);
        const type = types[Math.floor(Math.random() * types.length)];
        powerups.push(type);
        updatePowerupsUI();
    }
}

function removeEnemy(enemy) {
    const idx = enemies.indexOf(enemy);
    if (idx > -1) enemies.splice(idx, 1);
    if (enemy === boss) boss = null;
}

// Powerups
function updatePowerups() {
    powerups.forEach(p => {
        if (Date.now() - (p.start || 0) > POWERUPS[p.type].duration) powerups.splice(powerups.indexOf(p), 1);
    });
    updatePowerupsUI();
}

function usePowerup() {
    if (powerups.length === 0) return;
    const pu = powerups.shift();
    POWERUPS[pu.type].effect();
    pu.start = Date.now();
    updatePowerupsUI();
}

function explodeScreen() {
    enemies.forEach(e => {
        explodeKill(e.x, e.y, 8, '#f00');
        e.health = 0;
    });
    if (boss) {
        boss.health = 0;
        explodeKill(boss.x, boss.y, 40, '#900');
    }
    score += 500;
}

function updatePowerupsUI() {
    const ui = document.getElementById('powerupsUI');
    ui.innerHTML = powerups.map(p => `<div class="powerup-icon ${p.type}"></div>`).join('');
}

// Collisions (bullets/enemies/player + shield)
function checkCollisions() {
    // Bullets vs enemies/boss (reverse nested loops)
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
        const b = bullets[bi];
        b.x += b.vx; b.y += b.vy;
        if (b.x < 0 || b.x > WIDTH || b.y < 0 || b.y > HEIGHT || b.distTraveled > (b.range || 999)) {
            bullets.splice(bi, 1); continue;
        }
        b.distTraveled += Math.hypot(b.vx, b.vy);

        for (let ei = enemies.length - 1; ei >= 0; ei--) {
            const e = enemies[ei];
            if (Math.hypot(b.x - e.x, b.y - e.y) < e.size + 4) {
                e.health -= b.damage;
                bullets.splice(bi, 1);
                if (e.health <= 0) {
                    score += 10 * level;
                    explodeKill(e.x, e.y, 15, '#f44');
                    enemies.splice(ei, 1);
                }
                if (!WEAPONS[weapon].pierce) break;
            }
        }
        if (boss && Math.hypot(b.x - boss.x, b.y - boss.y) < boss.size + 4) {
            boss.health -= b.damage;
            bullets.splice(bi, 1);
            if (boss.health <= 0) {
                score += 150 * level;
                explodeKill(boss.x, boss.y, 35, '#b44');
                boss = null;
                level++;
            }
        }
    }

    // Touch damage (shield blocks)
    enemies.forEach(e => {
        if (Math.hypot(player.x - e.x, player.y - e.y) < player.size + e.size) {
            if (!player.shielded) health -= 1.5;
            if (health <= 0) endGame();
        }
    });
    if (boss && Math.hypot(player.x - boss.x, player.y - boss.y) < player.size + boss.size) {
        if (!player.shielded) health -= 3;
        if (health <= 0) endGame();
    }
}

function findNearestEnemy() {
    let nearest = null, minDist = Infinity;
    enemies.forEach(e => {
        const dist = Math.hypot(player.x - e.x, player.y - e.y);
        if (dist < minDist && dist < WEAPONS[weapon].range) {
            minDist = dist;
            nearest = e;
        }
    });
    if (boss) {
        const dist = Math.hypot(player.x - boss.x, player.y - boss.y);
        if (dist < minDist && dist < WEAPONS[weapon].range) nearest = boss;
    }
    return nearest;
}

function createParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12,
            life: 40, color
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life--;
        p.vx *= 0.98; p.vy *= 0.98;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

// DRAW (SHAKE + GLOW + RAGE PULSE)
function draw() {
    // Shake
    CTX.save();
    if (screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * screenShake;
        const shakeY = (Math.random() - 0.5) * screenShake;
        CTX.translate(shakeX, shakeY);
        screenShake *= 0.92;
    }

    // Player glow
    CTX.shadowBlur = player.shielded ? 25 : 15;
    CTX.shadowColor = player.shielded ? '#0ff' : '#0f0';
    CTX.fillStyle = player.shielded ? '#0ff' : '#0f0';
    CTX.beginPath();
    CTX.moveTo(player.x, player.y - player.size);
    CTX.lineTo(player.x - player.size, player.y + player.size);
    CTX.lineTo(player.x + player.size, player.y + player.size);
    CTX.closePath();
    CTX.fill();
    CTX.shadowBlur = 0;

    // Enemies + bars
    enemies.forEach(e => {
        CTX.fillStyle = e.color;
        CTX.beginPath();
        CTX.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        CTX.fill();
        const bw = e.size * 2.5;
        CTX.fillStyle = '#333';
        CTX.fillRect(e.x - bw/2, e.y - e.size - 12, bw, 6);
        CTX.fillStyle = '#f00';
        CTX.fillRect(e.x - bw/2, e.y - e.size - 12, bw, 6);
        CTX.fillStyle = '#0f0';
        CTX.fillRect(e.x - bw/2, e.y - e.size - 12, (e.health / e.maxHealth) * bw, 6);
    });

    // Boss rage
    if (boss) {
        const rage = boss.health < boss.maxHealth * 0.5;
        CTX.shadowBlur = rage ? 30 : 0;
        CTX.shadowColor = '#f00';
        CTX.fillStyle = rage ? '#f44' : '#900';
        CTX.beginPath();
        CTX.arc(boss.x, boss.y, boss.size, 0, Math.PI * 2);
        CTX.fill();
        if (rage) {
            CTX.strokeStyle = '#f00';
            CTX.lineWidth = 4 + Math.sin(Date.now() * 0.02) * 3;
            CTX.beginPath();
            CTX.arc(boss.x, boss.y, boss.size + 12, 0, Math.PI * 2);
            CTX.stroke();
        }
        CTX.shadowBlur = 0;
        // Boss bar
        const bbw = boss.size * 3.2;
        CTX.fillStyle = '#333';
        CTX.fillRect(boss.x - bbw/2, boss.y - boss.size - 22, bbw, 12);
        CTX.fillStyle = '#f00';
        CTX.fillRect(boss.x - bbw/2, boss.y - boss.size - 22, bbw, 12);
        CTX.fillStyle = '#0f0';
        CTX.fillRect(boss.x - bbw/2, boss.y - boss.size - 22, (boss.health / boss.maxHealth) * bbw, 12);
    }

    // Bullets + particles
    bullets.forEach(b => {
        CTX.fillStyle = b.color;
        CTX.shadowBlur = 10;
        CTX.shadowColor = b.color;
        CTX.beginPath();
        CTX.arc(b.x, b.y, 4, 0, Math.PI * 2);
        CTX.fill();
    });
    CTX.shadowBlur = 0;

    particles.forEach(p => {
        CTX.globalAlpha = p.life / 40;
        CTX.fillStyle = p.color;
        CTX.beginPath();
        CTX.arc(p.x, p.y, 4, 0, Math.PI * 2);
        CTX.fill();
    });
    CTX.globalAlpha = 1;
    CTX.restore();
}

// UI Updates
function updateHUD() {
    document.getElementById('level').textContent = level;
    document.getElementById('score').textContent = score;
    document.getElementById('wave').textContent = wave;
    document.getElementById('health').textContent = Math.floor(health);
    document.getElementById('weapon').textContent = weapon.charAt(0).toUpperCase() + weapon.slice(1);
    document.getElementById('healthFill').style.width = health + '%';
    document.getElementById('healthFill').className = health < 30 ? 'health-fill low' : 'health-fill';
    document.getElementById('levelFill').style.width = ((wave % 10) / 10 * 100) + '%';
}

function updateHotbar() {
    document.querySelectorAll('.hotkey').forEach((hk, i) => {
        hk.classList.toggle('active', weaponList[i] === weapon);
    });
}

function updateShopScore() {
    document.getElementById('shopScore').textContent = points;
}

function toggleShop() {
    const shop = document.getElementById('shop');
    shop.classList.toggle('hidden');
}

function togglePauseMenu() {
    pauseMenuOpen = !pauseMenuOpen;
    const menu = document.getElementById('pauseMenu');
    menu.classList.toggle('hidden');
    gameState = pauseMenuOpen ? 'paused' : 'playing';
}

// States
function startGame() {
    gameState = 'playing';
    document.getElementById('shop').classList.add('hidden');
    health = 100;
    enemies = []; bullets = []; particles = []; boss = null; powerups = [];
    wave = 1; waveTimer = 0; lastSpawn = 0;
    updatePowerupsUI();
}

function endGame() {
    gameState = 'gameOver';
    points = score;
    saveGame(); // Auto-save
    updateShopScore();
    document.getElementById('finalScore').textContent = score;
    document.getElementById('gameOver').classList.remove('hidden');
    document.getElementById('shop').classList.remove('hidden');
}

function restartGame() {
    location.reload(); // Easy reset
}
