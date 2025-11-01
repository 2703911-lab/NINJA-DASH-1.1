// === NINJA BALL ANNIHILATOR: ULTIMATE ===
const CANVAS = document.getElementById('gameCanvas');
const CTX = CANVAS.getContext('2d');
const WIDTH = 800, HEIGHT = 600;

let gameState = 'shop', score = 0, level = 1, wave = 1, health = 100, weapon = 'sword', points = 0;
let enemies = [], bullets = [], particles = [], boss = null, powerups = [];
let lastSpawn = 0, waveTimer = 0, keys = {}, animationId, screenShake = 0;
let pauseMenuOpen = false;

// === WEAPONS ===
const WEAPONS = {
    sword: { damage: 25, range: 60, rate: 150, cost: 0, color: '#0f0' },
    pistol: { damage: 35, range: 180, rate: 250, cost: 50, color: '#00f' },
    shotgun: { damage: 18, range: 120, rate: 350, cost: 150, color: '#f0f', aoe: true },
    laser: { damage: 50, range: 350, rate: 180, cost: 300, color: '#f00', pierce: true }
};
const weaponList = ['sword', 'pistol', 'shotgun', 'laser'];

// === POWER-UPS ===
const POWERUPS = {
    speed: { duration: 5000, effect: () => player.speed = 9 },
    shield: { duration: 5000, effect: () => { player.shielded = true; player.shieldStart = Date.now(); } },
    bomb: { effect: () => explodeScreen() }
};

// === PLAYER ===
const player = { x: WIDTH/2, y: HEIGHT/2, size: 18, speed: 5, lastShot: 0, shielded: false };

// === SAVE/LOAD ===
function saveGame() {
    const save = { level, weapon, points, score };
    localStorage.setItem('ninjaSave', JSON.stringify(save));
}
function loadGame() {
    const save = JSON.parse(localStorage.getItem('ninjaSave') || '{}');
    level = save.level || 1; weapon = save.weapon || 'sword'; points = save.points || 0; score = save.score || 0;
    updateHUD(); updateShopScore(); updateHotbar();
}

// === INPUT ===
window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key >= '1' && e.key <= '4') { weapon = weaponList[e.key-1]; updateHotbar(); updateHUD(); }
    if (e.key.toLowerCase() === 'f' && powerups.length) usePowerup();
    if (e.key.toLowerCase() === 'p') toggleShop();
    if (e.key === 'Escape') togglePauseMenu();
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// === DOM READY ===
window.addEventListener('DOMContentLoaded', () => {
    loadGame();
    document.querySelectorAll('.item, .hotkey').forEach(btn => {
        btn.onclick = () => {
            const w = btn.dataset.weapon, cost = parseInt(btn.dataset.cost || 0);
            if (points >= cost) { points -= cost; weapon = w; updateHotbar(); updateHUD(); updateShopScore(); }
        };
    });
    document.getElementById('startBtn').onclick = startGame;
    document.getElementById('restartBtn').onclick = () => location.reload();
    document.getElementById('resumeBtn').onclick = togglePauseMenu;
    document.getElementById('saveBtn').onclick = saveGame;
    document.getElementById('leaveBtn').onclick = () => location.href = 'about:blank';
    updateHUD(); updateHotbar();
    requestAnimationFrame(gameLoop);
});

// === GAME LOOP ===
function gameLoop() {
    CTX.fillStyle = '#000'; CTX.fillRect(0, 0, WIDTH, HEIGHT);
    if (screenShake > 0) { CTX.save(); CTX.translate((Math.random()-0.5)*screenShake, (Math.random()-0.5)*screenShake); screenShake *= 0.92; }

    if (gameState === 'playing' && !pauseMenuOpen) {
        updatePlayer();
        spawnEnemies(Date.now());
        updateEnemies();
        updateBullets();
        updateParticles();
        checkCollisions();
        if (++waveTimer > 8000) { wave++; if (wave % 10 === 0) level++; if (level % 5 === 0 && !boss) spawnBoss(); waveTimer = 0; score += 20 * level; }
        draw();
    } else { draw(); }

    updateHUD();
    if (screenShake > 0) CTX.restore();
    animationId = requestAnimationFrame(gameLoop);
}

// === REST OF LOGIC (same as before) ===
// [Include all functions: updatePlayer, spawnEnemies, shoot, explodeKill, etc.]
// → Paste from previous full script.js (all the functions below gameLoop)

requestAnimationFrame(gameLoop);
