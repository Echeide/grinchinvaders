// Game Constants
const KEYS = {
    LEFT: 'ArrowLeft',
    RIGHT: 'ArrowRight',
    SPACE: ' '
};

const GAME_CONFIG = {
    PLAYER_SPEED: 5,
    PROJECTILE_SPEED: 7,
    INVADER_SPEED: 1, // Horizontal speed
    INVADER_DROP: 20, // Vertical drop on edge hit
    INVADER_ROWS: 4,
    INVADER_COLS: 8,
    INVADER_SPACING: 60,
    SANTA_SPEED: 3,
    SANTA_SPAWN_RATE: 0.002, // Chance per frame (approx every 8-10s at 60fps)
    PLAYER_COOLDOWN: 40 // Frames between shots
};

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;

        this.state = 'START'; // START, PLAYING, GAMEOVER
        this.score = 0;
        this.lives = 3;
        this.lastTime = 0;

        this.player = null;
        this.invaders = [];
        this.projectiles = [];
        this.particles = [];
        this.stars = [];
        this.powerups = [];
        this.santa = null; // Santa instance
        this.invaderDirection = 1; // 1 = right, -1 = left

        this.keys = {};
        this.tilt = 0; // Initialize tilt

        this.resize();

        // Create stars
        for (let i = 0; i < 100; i++) {
            this.stars.push(new Star(this));
        }

        window.addEventListener('resize', () => this.resize());
        this.setupInputs();
        this.setupGlobalTouch(); // One-time setup
        this.setupUI();
    }

    resize() {
        this.canvas.width = this.canvas.parentElement.clientWidth;
        this.canvas.height = this.canvas.parentElement.clientHeight;
        this.width = this.canvas.width;
        this.height = this.canvas.height;

        // Redistribute stars if they exist
        if (this.stars && this.stars.length > 0) {
            this.stars.forEach(star => {
                star.reset(true);
            });
        }
    }

    setupInputs() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space' && this.state === 'PLAYING') { // Use e.code for space
                this.player.shoot();
            }
        });
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);
    }

    setupUI() {
        document.getElementById('start-btn').addEventListener('click', async () => {
            // Unlock AudioContext on user interaction
            window.gameAssets.resumeAudioContext();
            window.gameAssets.playAudio('music', 0.5, true);

            const useGyro = document.getElementById('gyro-toggle').checked;

            if (useGyro) {
                const granted = await this.requestMotionPermission();
                if (granted) {
                    this.startGame(true); // useGyro = true
                }
            } else {
                this.startGame(false); // useGyro = false
            }
        });

        // Toggle Instructions Logic
        const gyroToggle = document.getElementById('gyro-toggle');
        const updateInstructions = () => {
            const text = document.getElementById('instructions-text');
            if (gyroToggle.checked) {
                text.textContent = 'Inclina tu dispositivo para moverte y pulsa sobre la pantalla para disparar';
            } else {
                text.textContent = 'Utiliza los controles para controlar el cohete';
            }
        };

        gyroToggle.addEventListener('change', updateInstructions);
        // Initialize logic
        updateInstructions();

        document.getElementById('restart-btn').addEventListener('click', () => this.showStartScreen());
        document.getElementById('save-score-btn').addEventListener('click', () => this.saveScore());
    }

    async init() {
        await window.gameAssets.loadAll((percent) => {
            const progressBar = document.getElementById('progress-bar');
            const loadingText = document.getElementById('loading-text');
            if (progressBar && loadingText) {
                progressBar.style.width = `${percent}%`;
                loadingText.textContent = `${percent}%`;
            }
        });

        // Hide loading screen
        document.getElementById('loading-screen').classList.remove('active');

        this.showStartScreen();
        requestAnimationFrame((t) => this.loop(t));
    }



    setupMobileControls(useGyro) {
        // Reset: Hide controls first
        document.getElementById('mobile-controls').style.display = 'none';

        // Check if mobile (width check) AND config says NO gyro
        if (this.width < 800 && !useGyro) {
            document.getElementById('mobile-controls').style.display = 'flex';
        }

        const leftBtn = document.getElementById('btn-left');
        const rightBtn = document.getElementById('btn-right');
        const shootBtn = document.getElementById('btn-shoot');

        const handleTouch = (key, state) => (e) => {
            e.preventDefault(); // Prevent scrolling/mouse emulation
            e.stopPropagation(); // Stop it from firing shoot
            this.keys[key] = state;
        };

        const handleShoot = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.player.shoot();
        };

        // Reset previous listeners? Ideally we should clean up but simple overwriting works if we are careful.
        // Actually, adding multiple listeners is bad if called multiple times.
        // setupMobileControls should be called once or carefully managed. 
        // We'll call it in startGame() instead of constructor to respect the toggle.

        // Clear clones to remove listeners (hacky but effective for this scale)
        const replaceWithClone = (el) => {
            const newEl = el.cloneNode(true);
            el.parentNode.replaceChild(newEl, el);
            return newEl;
        }

        const newLeftBtn = replaceWithClone(leftBtn);
        const newRightBtn = replaceWithClone(rightBtn);
        const newShootBtn = replaceWithClone(shootBtn);

        ['touchstart', 'mousedown'].forEach(evt => {
            newLeftBtn.addEventListener(evt, handleTouch(KEYS.LEFT, true), { passive: false });
            newRightBtn.addEventListener(evt, handleTouch(KEYS.RIGHT, true), { passive: false });
            newShootBtn.addEventListener(evt, handleShoot, { passive: false });
        });

        ['touchend', 'mouseup', 'mouseleave'].forEach(evt => {
            newLeftBtn.addEventListener(evt, handleTouch(KEYS.LEFT, false));
            newRightBtn.addEventListener(evt, handleTouch(KEYS.RIGHT, false));
        });

        // Shoot on touch anywhere ELSE (only if Gyro is ON? Or standard fallback?)
        // If we have on-screen controls, maybe disable global touch shoot to avoid accidental fires when missing buttons?
        // Let's allow global tap ONLY if useGyro is ON.

        // Remove old global listener if exists? Hard to track.
        // Let's rely on a flag or just add it once.
        // We moved this call to startGame, so we should separate one-time setup from per-game setup.
        // Actually, let's just use a flag in the global listener.
        this.useGyro = useGyro;
    }

    setupGlobalTouch() {
        window.addEventListener('touchstart', (e) => {
            // If playing and NOT touching a button
            // If Gyro is OFF, we have a shoot button, so maybe disable global tap? 
            // The user asked for "one more button for shoot", implying specific control.
            // Let's allow global tap ONLY if useGyro is true (no buttons).

            if (this.state === 'PLAYING' && !e.target.closest('.control-btn') && e.target.tagName !== 'BUTTON') {
                if (this.useGyro) {
                    e.preventDefault();
                    this.player.shoot();
                }
            }
        }, { passive: false });

        // Gyroscope
        window.addEventListener('deviceorientation', (e) => {
            if (this.useGyro) this.handleOrientation(e);
        });
    }


    handleOrientation(e) {
        // Gamma is left/right tilt in degrees (-90 to 90)
        // We clamp it to -30 to 30 for full speed
        const gamma = e.gamma;
        if (gamma === null) return;

        let tilt = gamma;

        const orientation = window.screen.orientation ? window.screen.orientation.type : (window.orientation || 'portrait-primary');

        if (orientation.includes('landscape')) {
            tilt = e.beta;
        }

        // Clamp and normalize
        const maxTilt = 30;
        this.tilt = Math.max(-1, Math.min(1, tilt / maxTilt));
    }

    async requestMotionPermission() {
        // iOS 13+ requires permission
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const response = await DeviceOrientationEvent.requestPermission();
                if (response === 'granted') {
                    return true;
                } else {
                    alert('Permiso de giroscopio denegado.');
                    return false;
                }
            } catch (e) {
                console.error(e);
                return false;
            }
        }
        return true;
    }

    showStartScreen() {
        this.state = 'START';
        this.switchView('start-screen');
    }

    startGame(useGyro = false) {
        this.state = 'PLAYING';
        this.useGyro = useGyro;

        this.switchView('game-screen');
        this.resize();

        // Re-distribute stars now that we have correct dimensions
        this.stars.forEach(star => {
            star.x = Math.random() * this.width;
            star.y = Math.random() * this.height;
        });

        this.score = 0;
        this.lives = 3;
        this.level = 1; // Start at Level 1
        this.projectiles = [];
        this.particles = [];
        this.powerups = [];
        this.santa = null;
        this.updateUI();

        // Reset Game Config & Tune for Mobile
        const isMobile = this.width < 600;
        GAME_CONFIG.INVADER_SPEED = isMobile ? 0.5 : 1; // Slower on mobile
        GAME_CONFIG.INVADER_DROP = isMobile ? 10 : 20; // Smaller drop on mobile

        this.invaderDirection = 1;

        // Initialize Player
        this.player = new Player(this);

        // Setup Controls (After player exists)
        this.setupMobileControls(useGyro);

        // Initialize Invaders
        this.createInvaders();
    }

    triggerVictorySequence() {
        const msg = document.getElementById('level-message');
        msg.textContent = "¡MISIÓN COMPLETADA!";
        msg.classList.add('active');

        setTimeout(() => {
            msg.classList.remove('active');
            this.gameWin();
        }, 4000);
    }

    gameWin() {
        this.state = 'WIN';
        document.getElementById('final-score-display').textContent = this.score;
        document.querySelector('.game-over-title').textContent = "¡FELIZ NAVIDAD!"; // Win message
        this.loadHighScores();
        this.switchView('score-screen');
    }

    gameOver() {
        this.state = 'GAMEOVER';
        document.getElementById('final-score-display').textContent = this.score;
        this.loadHighScores();
        this.switchView('score-screen');
    }

    switchView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
    }

    createInvaders() {
        this.invaders = [];
        const startY = 80;

        if (this.level === 1) {
            // Rectangle Formation
            // Calculate max columns that fit
            const maxCols = Math.floor((this.width - 20) / GAME_CONFIG.INVADER_SPACING);
            const cols = Math.min(GAME_CONFIG.INVADER_COLS, maxCols);

            const startX = (this.width - (cols * GAME_CONFIG.INVADER_SPACING)) / 2;

            for (let row = 0; row < GAME_CONFIG.INVADER_ROWS; row++) {
                for (let col = 0; col < cols; col++) {
                    const type = (row % 3) + 1;
                    const x = startX + col * GAME_CONFIG.INVADER_SPACING;
                    const y = startY + row * GAME_CONFIG.INVADER_SPACING;
                    this.invaders.push(new Invader(this, x, y, type));
                }
            }
        } else if (this.level === 2) {
            // Diamond (Rombo) Formation
            const centerX = this.width / 2;
            // Scale spacing if needed
            const spacing = this.width < 450 ? 45 : GAME_CONFIG.INVADER_SPACING;

            const rows = 7;
            for (let row = 0; row < rows; row++) {
                // 1, 3, 5, 7, 5, 3, 1 items per row
                const itemsInRow = row < 4 ? 1 + row * 2 : 1 + (6 - row) * 2;
                const rowWidth = itemsInRow * spacing;
                const startX = centerX - rowWidth / 2 + (spacing / 2); // Center align

                for (let col = 0; col < itemsInRow; col++) {
                    const type = (row % 3) + 1;
                    const x = startX + col * spacing;
                    const y = startY + row * spacing;
                    this.invaders.push(new Invader(this, x, y, type));
                }
            }
        } else if (this.level === 3) {
            // Circle Formation
            const centerX = this.width / 2;
            // Scale radius
            const radius = Math.min(150, this.width / 2 - 40);
            const centerY = startY + radius;
            const count = 20;

            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const radius = Math.min(150, this.width / 2 - 40);
                const x = centerX + Math.cos(angle) * radius - 20; // -20 to center sprite
                const y = centerY + Math.sin(angle) * radius - 20;
                const type = (i % 3) + 1;
                const invader = new Invader(this, x, y, type);
                // Custom properties for rotation
                invader.angle = angle;
                invader.radius = radius;
                invader.centerX = centerX;
                invader.centerY = centerY;
                invader.isRotating = true;
                this.invaders.push(invader);
            }
            // Add a center piece
            const centerInvader = new Invader(this, centerX - 20, centerY - 20, 3);
            centerInvader.angle = 0;
            centerInvader.radius = 0;
            centerInvader.centerX = centerX;
            centerInvader.centerY = centerY;
            centerInvader.isRotating = true; // Treated as rotating so it stays relative to center (radius 0)
            this.invaders.push(centerInvader);
        }
    }

    update(dt) {
        // Always update stars for background effect
        this.stars.forEach(star => star.update());

        // Always update particles for explosion effect
        this.particles.forEach((p, i) => {
            p.update();
            if (p.life <= 0) this.particles.splice(i, 1);
        });

        if (this.state === 'WIN') {
            // Random Fireworks
            if (Math.random() < 0.05) {
                const x = Math.random() * this.width;
                const y = Math.random() * (this.height / 2);
                const colors = ['#FF0000', '#00FF00', '#FFFF00', '#00FFFF', '#FF00FF', '#FFFFFF'];
                const color = colors[Math.floor(Math.random() * colors.length)];
                this.createExplosion(x, y, color, true);
            }
            return;
        }

        if (this.state !== 'PLAYING') return;

        // Player
        this.player.update();

        // Projectiles
        this.projectiles.forEach((p, i) => {
            p.update();
            if (p.y < 0 || p.y > this.height) this.projectiles.splice(i, 1);
        });

        // Powerups
        this.powerups.forEach((p, i) => {
            p.update();
            if (p.y > this.height) this.powerups.splice(i, 1);
        });

        // Santa Logic
        if (this.santa) {
            this.santa.update();
            if (this.santa.isDead) {
                this.santa = null;
            }
        } else {
            if (Math.random() < GAME_CONFIG.SANTA_SPAWN_RATE) {
                this.spawnSanta();
            }
        }

        // Kamikaze Logic
        if (Math.random() < 0.005 && this.state === 'PLAYING') { // 0.5% chance per frame
            const idleInvaders = this.invaders.filter(inv => inv.state === 'IDLE');
            if (idleInvaders.length > 0) {
                const randomInvader = idleInvaders[Math.floor(Math.random() * idleInvaders.length)];
                randomInvader.activate();
            }
        }

        // Invaders Logic
        let hitEdge = false;
        this.invaders.forEach(invader => {
            invader.update(this.invaderDirection);
            if (invader.state === 'IDLE' &&
                ((this.invaderDirection === 1 && invader.x + invader.width > this.width) ||
                    (this.invaderDirection === -1 && invader.x < 0))) {
                hitEdge = true;
            }
        });

        if (hitEdge) {
            this.invaderDirection *= -1;
            this.invaders.forEach(invader => {
                if (invader.state === 'IDLE') invader.y += GAME_CONFIG.INVADER_DROP;
            });
        }

        // Collisions
        this.checkCollisions();

        // Particles (Moved to top to run during DYING state)
        /*
        this.particles.forEach((p, i) => {
            p.update();
            if (p.life <= 0) this.particles.splice(i, 1);
        });
        */

        // Check Level Clear
        if (this.invaders.length === 0) {
            this.level++;
            if (this.level > 3) {
                this.triggerVictorySequence();
            } else {
                this.createInvaders();
                GAME_CONFIG.INVADER_SPEED += 0.5;
                // Reset invader direction
                this.invaderDirection = 1;
            }
        }

        if (this.invaders.some(inv => inv.state === 'IDLE' && inv.y + inv.height >= this.height)) {
            this.lives = 0;
            this.updateUI();
            this.triggerDeathSequence();
        }
    }

    triggerDeathSequence() {
        if (this.state === 'DYING') return;
        this.state = 'DYING';

        // Big Explosion
        for (let i = 0; i < 150; i++) {
            this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, i % 2 === 0 ? '#D42426' : '#ffd53e', true);
        }
        window.gameAssets.playAudio('explosion');

        // Delay Game Over
        setTimeout(() => {
            this.gameOver();
        }, 1500);
    }

    spawnSanta() {
        const direction = Math.random() > 0.5 ? 1 : -1;
        const x = direction === 1 ? -100 : this.width + 100;
        this.santa = new Santa(this, x, direction);
        window.gameAssets.playAudio('hohoho');
    }

    checkCollisions() {
        // Projectile vs Invader/Santa/Player
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];

            // Player Projectile hitting Enemies
            if (p.dy < 0) {
                // Check Santa
                if (this.santa && this.rectIntersect(p, this.santa)) {
                    this.createExplosion(p.x, p.y, '#D42426'); // Hit effect
                    this.santa.health--;

                    if (this.santa.health <= 0) {
                        this.createExplosion(this.santa.x + this.santa.width / 2, this.santa.y + this.santa.height / 2, '#D42426'); // Big explosion
                        this.score += 500; // Bonus points for kill
                        // Drop Powerup
                        this.dropPowerUp(this.santa.x + this.santa.width / 2, this.santa.y + this.santa.height / 2);
                        this.santa = null;
                    } else {
                        this.score += 50; // Points for hit
                    }

                    this.updateUI();
                    this.projectiles.splice(i, 1);
                    continue;
                }

                // Check Invaders
                for (let j = this.invaders.length - 1; j >= 0; j--) {
                    const inv = this.invaders[j];
                    if (this.rectIntersect(p, inv)) {
                        // Hit!
                        this.createExplosion(inv.x + inv.width / 2, inv.y + inv.height / 2, '#ffd53e');
                        window.gameAssets.playAudio('rotura');
                        this.score += inv.scoreValue;
                        this.updateUI();
                        this.invaders.splice(j, 1);
                        this.projectiles.splice(i, 1);
                        break; // Projectile used
                    }
                }
            }
            // Enemy Projectile hitting Player
            else {
                if (this.rectIntersect(p, this.player)) {
                    this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#D42426');
                    window.gameAssets.playAudio('danio');
                    this.lives--;
                    this.updateUI();
                    this.projectiles.splice(i, 1);
                    if (this.lives <= 0) this.triggerDeathSequence();
                }
            }
        }

        // Invader (Kamikaze) vs Player
        this.invaders.forEach(inv => {
            if (inv.state === 'ATTACKING' && this.rectIntersect(inv, this.player)) {
                this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#D42426');
                window.gameAssets.playAudio('danio');
                this.lives--;
                this.updateUI();
                inv.reset();
                if (this.lives <= 0) this.triggerDeathSequence();
            }
        });

        // Powerup vs Player
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const p = this.powerups[i];
            if (this.rectIntersect(p, this.player)) {
                this.applyPowerUp(p.type);
                this.powerups.splice(i, 1);
            }
        }
    }

    dropPowerUp(x, y) {
        window.gameAssets.playAudio('caida_regalos');
        const rand = Math.random();
        let type;
        if (rand < 0.6) type = 'fast'; // 60%
        else if (rand < 0.8) type = 'life'; // 20%
        else type = 'slow'; // 20%

        this.powerups.push(new PowerUp(x, y, type));
    }

    applyPowerUp(type) {
        window.gameAssets.playAudio('powerup');
        if (type === 'life') {
            this.lives++;
            this.updateUI();
            this.createExplosion(this.player.x, this.player.y, '#FF0000');
        } else if (type === 'fast') {
            this.player.setCooldownModifier(0.5, 600); // Half time for 10s (60fps * 10)
            this.createExplosion(this.player.x, this.player.y, '#FFFF00');
        } else if (type === 'slow') {
            this.player.setCooldownModifier(2.0, 600); // Double time for 10s
            this.createExplosion(this.player.x, this.player.y, '#000000');
        }
    }

    rectIntersect(r1, r2) {
        return !(r2.x > r1.x + r1.width ||
            r2.x + r2.width < r1.x ||
            r2.y > r1.y + r1.height ||
            r2.y + r2.height < r1.y);
    }

    createExplosion(x, y, color, isBig = false) {
        const count = isBig ? 1 : 10; // If big, we call this many times in loop, but here we just create particles
        // Actually, the loop in triggerDeathSequence calls this 150 times.
        // But for normal hits, we call it once.
        // Let's adjust: createExplosion creates ONE batch.

        // Wait, the previous code was:
        // for (let i = 0; i < 10; i++) this.particles.push(...)
        // So let's keep that structure but pass 'isBig' to particle or handle speed here.

        const particleCount = isBig ? 1 : 10;
        // If isBig is true, we are calling this inside a loop of 150, so we create 1 particle per call? 
        // No, triggerDeathSequence calls createExplosion 150 times. 
        // But createExplosion creates 10 particles per call? That would be 1500 particles! Too many.

        // Let's change createExplosion to just create particles.
        // If it's a big explosion (death), we want high speed.
        // If it's a small hit, low speed.

        if (isBig) {
            // Called from loop, create 1 high-speed particle
            this.particles.push(new Particle(x, y, color, true));
        } else {
            // Normal hit, create batch
            for (let i = 0; i < 8; i++) {
                this.particles.push(new Particle(x, y, color, false));
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Draw stars background
        this.stars.forEach(star => star.draw(this.ctx));

        if (this.state === 'WIN') {
            this.particles.forEach(p => p.draw(this.ctx));
            return;
        }

        if (this.state === 'PLAYING' || this.state === 'DYING') {
            if (this.state === 'PLAYING') this.player.draw(this.ctx);
            if (this.santa) this.santa.draw(this.ctx);
            this.powerups.forEach(p => p.draw(this.ctx));
            this.invaders.forEach(inv => inv.draw(this.ctx));
            this.projectiles.forEach(p => p.draw(this.ctx));
            this.particles.forEach(p => p.draw(this.ctx));
        }
    }

    loop(timestamp) {
        const dt = timestamp - this.lastTime;
        this.lastTime = timestamp;

        this.update(dt);
        this.draw();

        requestAnimationFrame((t) => this.loop(t));
    }

    updateUI() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('lives').textContent = this.lives;
        // Optional: Show Level
    }

    saveScore() {
        const initials = document.getElementById('initials').value.toUpperCase() || 'AAA';
        const highScores = JSON.parse(localStorage.getItem('christmas_invaders_scores') || '[]');
        highScores.push({ name: initials, score: this.score });
        highScores.sort((a, b) => b.score - a.score);
        highScores.splice(5); // Keep top 5
        localStorage.setItem('christmas_invaders_scores', JSON.stringify(highScores));

        // Reset to start screen
        this.switchView('start-screen');
    }

    loadHighScores() {
        const scores = JSON.parse(localStorage.getItem('christmas_invaders_scores') || '[]');
        const list = document.getElementById('high-scores-list');
        list.innerHTML = scores.map(s => `<li><span>${s.name}</span><span>${s.score}</span></li>`).join('');
    }


}

class Player {
    constructor(game) {
        this.game = game;
        this.width = 60;
        this.height = 60;
        this.x = game.width / 2 - this.width / 2;
        this.y = game.height - 80;
        this.image = window.gameAssets.getImage('player');
        this.cooldown = 0;
        this.cooldownModifier = 1.0;
        this.modifierTimer = 0;

        // Physics
        this.vx = 0;
        this.friction = 0.92;
        this.acceleration = 0.8;
    }

    update() {
        // Acceleration (Keyboard)
        if (this.game.keys[KEYS.LEFT]) this.vx -= this.acceleration;
        if (this.game.keys[KEYS.RIGHT]) this.vx += this.acceleration;

        // Acceleration (Gyroscope)
        if (this.game.useGyro && Math.abs(this.game.tilt) > 0.1) { // Deadzone
            this.vx += this.game.tilt * this.acceleration;
        }

        // Friction
        this.vx *= this.friction;

        // Apply velocity
        this.x += this.vx;

        // Clamp to screen and stop velocity on collision
        if (this.x < 0) {
            this.x = 0;
            this.vx = 0;
        }
        if (this.x > this.game.width - this.width) {
            this.x = this.game.width - this.width;
            this.vx = 0;
        }

        // Cooldown
        if (this.cooldown > 0) this.cooldown--;

        // Modifier Timer
        if (this.modifierTimer > 0) {
            this.modifierTimer--;
            if (this.modifierTimer <= 0) {
                this.cooldownModifier = 1.0; // Reset
            }
        }
    }

    setCooldownModifier(modifier, duration) {
        this.cooldownModifier = modifier;
        this.modifierTimer = duration;
    }

    draw(ctx) {
        if (this.image) {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = 'red';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }

        // Draw Cooldown Bar
        const barWidth = this.width;
        const barHeight = 5;
        const barX = this.x;
        const barY = this.y + this.height + 5;

        // Background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Progress
        if (this.cooldown > 0) {
            const maxCooldown = GAME_CONFIG.PLAYER_COOLDOWN * this.cooldownModifier;
            const progress = 1 - (this.cooldown / maxCooldown);
            ctx.fillStyle = '#3B82F6'; // Blue charging
            ctx.fillRect(barX, barY, barWidth * progress, barHeight);
        } else {
            if (this.cooldownModifier < 1.0) ctx.fillStyle = '#00FFFF'; // Fast (Cyan)
            else if (this.cooldownModifier > 1.0) ctx.fillStyle = '#555555'; // Slow (Grey)
            else ctx.fillStyle = '#FFFFFF'; // Normal (White)

            ctx.fillRect(barX, barY, barWidth, barHeight);
        }
    }

    shoot() {
        if (this.cooldown > 0) return;

        this.game.projectiles.push(new Projectile(this.x + this.width / 2, this.y, -GAME_CONFIG.PROJECTILE_SPEED, 0, 'player'));
        window.gameAssets.playAudio('shoot', 0.5); // 50% volume
        this.cooldown = GAME_CONFIG.PLAYER_COOLDOWN * this.cooldownModifier;
    }
}

class Invader {
    constructor(game, x, y, type) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.originalX = x; // Relative to group
        this.originalY = y; // Relative to group
        this.width = 40;
        this.height = 40;
        this.type = type;
        this.image = window.gameAssets.getImage(`invader${type}`);
        this.scoreValue = type * 10;

        this.state = 'IDLE'; // IDLE, ATTACKING, RETURNING
        this.attackTimer = 0;
        this.flashTimer = 0;
    }

    activate() {
        this.state = 'ATTACKING';
        window.gameAssets.playAudio('caida');
        this.attackTimer = 0;
        // Visual flash effect
        this.game.createExplosion(this.x + this.width / 2, this.y + this.height / 2, '#FFFFFF');
    }

    reset() {
        this.state = 'RETURNING';
        this.y = -50; // Start from top
        // Teleport effect
        this.game.createExplosion(this.x + this.width / 2, this.y + this.height / 2, '#00FF00');
    }

    update(direction) {
        if (this.state === 'IDLE') {
            if (this.isRotating) {
                // Rotation Logic (Level 3)
                this.angle += 0.01; // Rotation speed
                this.x = this.centerX + Math.cos(this.angle) * this.radius - this.width / 2;
                this.y = this.centerY + Math.sin(this.angle) * this.radius - this.height / 2;
                // Note: We ignore 'direction' and standard movement for rotating invaders
            } else {
                // Standard Linear Movement
                this.x += GAME_CONFIG.INVADER_SPEED * direction;
            }
        } else if (this.state === 'ATTACKING') {
            this.y += 3; // Fall speed
            this.x += Math.sin(this.attackTimer * 0.1) * 3; // Zig-zag
            this.attackTimer++;

            // Check if off screen
            if (this.y > this.game.height) {
                this.reset();
            }
        } else if (this.state === 'RETURNING') {
            // Find a leader to sync with
            const leader = this.game.invaders.find(inv => inv.state === 'IDLE' && inv !== this);

            if (leader) {
                // Calculate fleet offset based on leader's current vs original position
                const offsetX = leader.x - leader.originalX;
                const offsetY = leader.y - leader.originalY;

                // Snap back to formation
                this.x = this.originalX + offsetX;
                this.y = this.originalY + offsetY;

                this.state = 'IDLE';
                // Teleport effect
                this.game.createExplosion(this.x + this.width / 2, this.y + this.height / 2, '#00FFFF');
            } else {
                // If no leader (everyone attacking?), just wait or reset to top
                // But to be safe, let's just become IDLE at current pos if reasonable, or wait.
                // For now, if we are the only one, we define the fleet.
                // But we need to be careful about X.
                // Let's just reset to original X and top Y if we are alone.
                if (this.game.invaders.every(inv => inv.state !== 'IDLE')) {
                    this.x = this.originalX;
                    this.y = 80; // Reset fleet?
                    this.state = 'IDLE';
                }
            }
        }

        // Flash effect
        if (this.state === 'ATTACKING') {
            this.flashTimer++;
        }
    }

    draw(ctx) {
        if (this.state === 'ATTACKING' && Math.floor(this.flashTimer / 5) % 2 === 0) {
            ctx.globalCompositeOperation = 'lighter'; // Glow
        }

        if (this.image) {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = 'green';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }

        ctx.globalCompositeOperation = 'source-over'; // Reset
    }
}

class Projectile {
    constructor(x, y, dy, dx, type) {
        this.x = x - 5;
        this.y = y;
        this.dy = dy;
        this.dx = dx || 0;
        this.width = 15;
        this.height = 15;
        this.type = type; // 'player' or 'enemy'
        this.image = window.gameAssets.getImage(type === 'player' ? 'projectile' : 'gift');
        this.angle = 0;
        this.spinSpeed = (Math.random() - 0.5) * 0.2;
    }

    update() {
        this.y += this.dy;
        this.x += this.dx;
        if (this.type === 'enemy') {
            this.angle += this.spinSpeed;
        }
    }

    draw(ctx) {
        if (this.image) {
            if (this.type === 'enemy') {
                ctx.save();
                ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
                ctx.rotate(this.angle);
                ctx.drawImage(this.image, -this.width / 2, -this.height / 2, this.width, this.height);
                ctx.restore();
            } else {
                ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
            }
        } else {
            ctx.fillStyle = this.type === 'player' ? 'white' : 'red';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

class Santa {
    constructor(game, x, direction) {
        this.game = game;
        this.x = x;
        this.y = 40; // Top area
        this.width = 80;
        this.height = 50;
        this.direction = direction;
        this.image = window.gameAssets.getImage('santa');
        this.isDead = false;
        this.shootTimer = 0;
        this.health = 1;
    }

    update() {
        this.x += GAME_CONFIG.SANTA_SPEED * this.direction;

        // Despawn if off screen
        if ((this.direction === 1 && this.x > this.game.width + 100) ||
            (this.direction === -1 && this.x < -100)) {
            this.isDead = true;
        }

        // Random shooting - Increased rate
        this.shootTimer++;
        if (this.shootTimer > 20 && Math.random() < 0.1) {
            this.shoot();
            this.shootTimer = 0;
        }
    }

    shoot() {
        // Randomize speed and trajectory
        const speed = 2 + Math.random() * 3; // Speed between 2 and 5
        const drift = (Math.random() - 0.5) * 2; // Horizontal drift between -1 and 1
        this.game.projectiles.push(new Projectile(this.x + this.width / 2, this.y + this.height, speed, drift, 'enemy'));
    }

    draw(ctx) {
        if (this.image) {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = 'red';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.type = type; // 'fast', 'life', 'slow'
        this.image = window.gameAssets.getImage(`powerup_${type}`);
        this.dy = 2;
    }

    update() {
        this.y += this.dy;
    }

    draw(ctx) {
        if (this.image) {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = 'purple';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

class Particle {
    constructor(x, y, color, isBig = false) {
        this.x = x;
        this.y = y;
        this.color = color;

        const angle = Math.random() * Math.PI * 2;
        const speed = isBig ? (Math.random() * 10 + 5) : (Math.random() * 3 + 1);

        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        this.life = 1.0;
        this.decay = isBig ? (Math.random() * 0.02 + 0.01) : 0.05; // Big particles last longer
        this.size = isBig ? (Math.random() * 4 + 2) : 3;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }

    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

class Star {
    constructor(game) {
        this.game = game;
        this.reset(true); // true = initial random placement
    }

    reset(initial = false) {
        this.size = Math.random() * 2 + 1;
        this.speed = (Math.random() * 2 + 0.5); // Parallax speed
        this.opacity = Math.random() * 0.5 + 0.3;

        if (initial) {
            this.x = Math.random() * this.game.width;
            this.y = Math.random() * this.game.height;
        } else {
            // Spawn at top or left edge
            if (Math.random() > 0.5) {
                // Top edge
                this.x = Math.random() * this.game.width;
                this.y = -10;
            } else {
                // Left edge
                this.x = -10;
                this.y = Math.random() * this.game.height;
            }
        }
    }

    update() {
        this.y += this.speed;
        this.x += this.speed * 0.5; // Slight diagonal

        if (this.y > this.game.height || this.x > this.game.width) {
            this.reset();
        }
    }

    draw(ctx) {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Start the game
window.onload = () => {
    const game = new Game();
    game.init();
};
