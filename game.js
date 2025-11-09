// --- Thiết lập Canvas và Context ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Kích thước game cố định (sẽ được scale trên mobile)
const W = 800; 
const H = 600;

canvas.width = W;
canvas.height = H;

// --- DOM Elements ---
const uiOverlay = document.getElementById('uiOverlay');
const startButton = document.getElementById('startButton');
const gameOverMessage = document.getElementById('gameOverMessage');
const mainTitle = document.getElementById('mainTitle');
const instructions = document.getElementById('instructions');

const guideButton = document.getElementById('guideButton');
const guideScreen = document.getElementById('guideScreen');
const backButton = document.getElementById('backButton');
const guideContent = guideScreen.querySelector('.guide-content');

// --- THÊM BIẾN CHO JOYSTICK VÀ NÚT MOBILE ---
const mobileControls = document.getElementById('mobileControls');
const shootBtn = document.getElementById('shootBtn');
const reloadBtn = document.getElementById('reloadBtn');

const joystickBase = document.getElementById('joystickBase');
const joystickStick = document.getElementById('joystickStick');
let joystickActive = false;
let joystickCenter = { x: 0, y: 0 };
let canvasScale = 1; 

// --- HẰNG SỐ VŨ KHÍ & GAME ---
const SHOTGUN_RANGE_MULTIPLIER = 6; 
const POWERUP_DROP_RATE = 0.10;      
const HP_DROP_RATE = 0.15;           
const POWERUP_LIFETIME = 30000;      
const MAX_POWERUPS = 5;              

const BOSS_SPAWN_INTERVAL = 90000;   

const WEAPONS = {
    PISTOL: { name: 'Pistol', damage: 1, fireRate: 250, clipSize: 12, reloadTime: 1750, bulletSpeed: 8, bulletsPerShot: 1, spread: 0, range: Infinity }, 
    SHOTGUN: { name: 'Shotgun', damage: 1, fireRate: 800, clipSize: 10, reloadTime: 3000, bulletSpeed: 6, bulletsPerShot: 6, spread: 0.5, range: 'SHORT_RANGE' }, 
    RIFLE: { name: 'Rifle', damage: 1, fireRate: 100, clipSize: 30, reloadTime: 1500, bulletSpeed: 10, bulletsPerShot: 1, spread: 0.05, range: Infinity } 
};

// --- Biến Trạng thái Game ---
let gameRunning = false;
let score = 0;
let lastTime = 0;
let gameTime = 0; 
let zombieSpawnTimer = 0;
let bossSpawnTimer = 0; 
const INITIAL_SPAWN_INTERVAL = 1500; 

// --- Danh sách các đối tượng game ---
let player;
let bullets = [];
let zombies = [];
let powerups = [];

// --- Lớp Vũ khí (Weapon Class) ---
class Weapon {
    constructor(type) {
        this.type = type;
        this.config = WEAPONS[type];
        this.clip = this.config.clipSize;
        this.isReloading = false;
        this.reloadTimer = 0;
        this.lastShotTime = 0;
    }

    canShoot(now) {
        return !this.isReloading && this.clip > 0 && (now - this.lastShotTime > this.config.fireRate);
    }
    
    startReload() {
        if (this.clip < this.config.clipSize && !this.isReloading) {
            this.isReloading = true;
            this.reloadTimer = this.config.reloadTime;
        }
    }

    update(delta) {
        if (this.isReloading) {
            this.reloadTimer -= delta;
            if (this.reloadTimer <= 0) {
                this.isReloading = false;
                this.clip = this.config.clipSize;
            }
        }
    }
}

// --- Lớp Người chơi (Player Class) ---
class Player {
    constructor() {
        this.x = W / 2;
        this.y = H / 2;
        this.radius = 15;
        this.color = 'blue';
        this.hp = 3;
        this.speed = 1.2; 
        this.rotation = 0; 
        this.weapon = new Weapon('PISTOL'); 
        this.lastShotTime = 0;
        this.moving = { 
            up: false, down: false, left: false, right: false,
            angle: 0, force: 0 
        }; 
        this.maxHp = 5; 
    }

    update(delta) {
        // Kiểm tra xem có phải màn hình lớn (> 850px) không
        const isMobile = !window.matchMedia('(min-width: 850px)').matches;
        
        // 1. LOGIC DI CHUYỂN PC (Khi dùng phím W/A/S/D)
        if (!isMobile) {
            if (this.moving.up) this.y -= this.speed;
            if (this.moving.down) this.y += this.speed;
            if (this.moving.left) this.x -= this.speed;
            if (this.moving.right) this.x += this.speed;
        }
        
        // 2. LOGIC DI CHUYỂN MOBILE (Dùng force từ Joystick)
        if (isMobile && this.moving.force > 0) {
            const moveSpeed = this.speed * this.moving.force; 
            this.x += Math.cos(this.moving.angle) * moveSpeed;
            this.y += Math.sin(this.moving.angle) * moveSpeed;
        }

        // Giới hạn vị trí
        this.x = Math.max(this.radius, Math.min(W - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(H - this.radius, this.y));
        
        this.weapon.update(delta); 
    }
    
    changeWeapon(weaponType) {
        if (weaponType !== this.weapon.type) {
             this.weapon = new Weapon(weaponType);
        }
    }
    
    heal(amount = 1) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
    }

    // Vẽ Player (Thiết kế Neon)
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // 1. Vẽ Thân người chơi (Hình thoi/kim cương)
        ctx.fillStyle = '#ff00ff'; // Hồng neon
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff00ff'; // Lóa sáng cho Player

        ctx.beginPath();
        ctx.moveTo(this.radius, 0);
        ctx.lineTo(0, this.radius);
        ctx.lineTo(-this.radius, 0);
        ctx.lineTo(0, -this.radius);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // 2. Vẽ Súng 
        ctx.strokeStyle = this.weapon.type === 'SHOTGUN' ? '#ffcc00' : this.weapon.type === 'RIFLE' ? '#00ffff' : '#ff00ff';
        ctx.lineWidth = 6; 
        ctx.shadowColor = this.weapon.type === 'SHOTGUN' ? '#ffcc00' : this.weapon.type === 'RIFLE' ? '#00ffff' : '#ff00ff';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(this.radius + 15, 0); 
        ctx.stroke();

        ctx.restore();
        ctx.shadowBlur = 0; // Tắt shadow

        // 3. Vẽ HP (Thanh HP)
        const hpBarWidth = 40;
        const hpBarHeight = 6;
        const hpRatio = this.hp / this.maxHp;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x - hpBarWidth / 2, this.y + this.radius + 15, hpBarWidth, hpBarHeight);

        ctx.fillStyle = hpRatio > 0.5 ? '#00ff00' : hpRatio > 0.25 ? '#ffcc00' : '#ff0000';
        ctx.fillRect(this.x - hpBarWidth / 2, this.y + this.radius + 15, hpBarWidth * hpRatio, hpBarHeight);
    }
}

// --- Lớp Zombie (Cơ sở cho cả thường và Boss) ---
class Zombie {
    constructor(x, y, isBoss = false) {
        this.x = x;
        this.y = y;
        this.isBoss = isBoss;
        
        if (isBoss) {
            this.radius = 60; 
            this.color = 'purple';
            this.speed = 1.0; 
            this.hp = 100; 
        } else {
            this.radius = 12;
            this.color = '#00ff00'; // Xanh lá neon
            const timeDecrease = Math.floor(gameTime / 10000) * 0.05;
            const baseSpeed = 1.0 + Math.random() * 0.1; 
            this.speed = baseSpeed + timeDecrease; 
            this.hp = 1; 
        }
        this.maxHp = this.hp;
    }

    update() {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        this.x += (dx / distance) * this.speed;
        this.y += (dy / distance) * this.speed;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10; // Thêm lóa sáng cho Zombie
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0; // Tắt shadow cho UI Boss
        if (this.isBoss) {
            const currentHp = this.hp;
            const hpRatio = currentHp / this.maxHp;
            const barWidth = 100;
            const barHeight = 10;
            
            ctx.fillStyle = '#333';
            ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 20, barWidth, barHeight);
            
            ctx.fillStyle = hpRatio > 0.5 ? '#00ff00' : hpRatio > 0.2 ? '#ffcc00' : '#ff0000';
            ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 20, barWidth * hpRatio, barHeight);
            
            ctx.fillStyle = '#ff00ff'; 
            ctx.font = 'bold 14px Consolas';
            ctx.textAlign = 'center';
            ctx.fillText(`BOSS: ${Math.round(currentHp)}`, this.x, this.y - this.radius - 25);
        }
    }
}

// --- Lớp Đạn (Bullet Class) ---
class Bullet {
    constructor(x, y, angle, speed, damage, range) {
        this.startX = x; 
        this.startY = y;
        this.x = x;
        this.y = y;
        this.radius = 3;
        this.color = 'red';
        this.speed = speed;
        this.damage = damage;
        this.range = range; 
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        const angle = Math.atan2(this.vy, this.vx);
        ctx.rotate(angle);

        ctx.fillStyle = '#ff00ff'; // Màu đạn hồng neon
        ctx.shadowBlur = 8; // Lóa sáng cho đạn
        ctx.shadowColor = '#ff00ff';
        
        ctx.fillRect(0, -1.5, 8, 3); 

        ctx.restore();
    }

    isOffScreenOrExpired() {
        if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) {
            return true;
        }
        
        const distanceTraveled = Math.sqrt(
            (this.x - this.startX) ** 2 + (this.y - this.startY) ** 2
        );

        if (this.range !== Infinity && distanceTraveled > this.range) {
            return true;
        }
        
        return false;
    }
}

// --- Lớp PowerUp ---
class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.radius = 10;
        this.type = type; 
        this.color = type === 'SHOTGUN' ? '#ffcc00' : type === 'RIFLE' ? '#00ffff' : '#ff00ff'; 
        this.symbol = type === 'SHOTGUN' ? 'S' : type === 'RIFLE' ? 'R' : '+';
        this.spawnTime = gameTime; 
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10; // Lóa sáng cho PowerUp
        ctx.shadowColor = this.color;
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'white'; 
        ctx.font = 'bold 14px Consolas';
        ctx.textAlign = 'center';
        ctx.fillText(this.symbol, this.x, this.y + 5);
        
        const timeLeft = Math.ceil((this.spawnTime + POWERUP_LIFETIME - gameTime) / 1000);
        ctx.fillStyle = '#00ffff'; 
        ctx.font = '10px Consolas';
        ctx.fillText(timeLeft + 's', this.x, this.y - 15);
    }
}

// --- Hàm Khởi tạo Trò chơi ---
function initGame() {
    player = new Player();
    bullets = [];
    zombies = [];
    powerups = [];
    score = 0;
    gameTime = 0; 
    zombieSpawnTimer = 0;
    bossSpawnTimer = 0; 
    gameRunning = true;
    
    uiOverlay.style.display = 'none';
    guideScreen.style.display = 'none'; 
    ctx.clearRect(0, 0, W, H); 

    initializeJoystick(); 
}

// --- Hàm Cập nhật Logic Game ---
function update(delta) {
    gameTime += delta;
    
    player.update(delta); 
    
    bullets.forEach((bullet, index) => {
        bullet.update();
        if (bullet.isOffScreenOrExpired()) {
            bullets.splice(index, 1);
        }
    });

    zombies.forEach(zombie => zombie.update());
    
    for (let pIndex = powerups.length - 1; pIndex >= 0; pIndex--) {
        const powerup = powerups[pIndex];
        if (gameTime - powerup.spawnTime > POWERUP_LIFETIME) {
            powerups.splice(pIndex, 1);
        }
    }

    zombieSpawnTimer += delta;
    const timeDecrease = Math.floor(gameTime / 10000) * 100;
    const spawnInterval = Math.max(300, INITIAL_SPAWN_INTERVAL - timeDecrease); 

    if (zombieSpawnTimer >= spawnInterval) {
        spawnZombie();
        zombieSpawnTimer = 0;
    }
    
    bossSpawnTimer += delta;
    if (bossSpawnTimer >= BOSS_SPAWN_INTERVAL) {
        spawnBoss();
        bossSpawnTimer = 0; 
    }

    checkCollisions();

    if (player.hp <= 0) {
        endGame();
    }
}

// --- Hàm Vẽ Đồ họa Game ---
function draw() {
    ctx.clearRect(0, 0, W, H);

    player.draw();

    bullets.forEach(bullet => bullet.draw());

    zombies.forEach(zombie => zombie.draw());
    
    powerups.forEach(p => p.draw());

    ctx.shadowBlur = 0; 

    ctx.fillStyle = '#ff00ff'; 
    ctx.font = 'bold 24px Consolas';
    ctx.textAlign = 'left';
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#ff00ff';
    ctx.fillText(`Điểm: ${score}`, 10, 30);

    const minutes = Math.floor(gameTime / 60000);
    const seconds = Math.floor((gameTime % 60000) / 1000).toString().padStart(2, '0');
    ctx.shadowColor = '#00ffff'; 
    ctx.fillStyle = '#00ffff';
    ctx.fillText(`Thời gian: ${minutes}:${seconds}`, 10, 60);
    
    const weapon = player.weapon;
    const reloadText = weapon.isReloading ? `ĐANG NẠP: ${Math.ceil(weapon.reloadTimer / 1000)}s` : `Đạn: ${weapon.clip}/${weapon.config.clipSize}`;
    
    ctx.shadowBlur = 5; 
    ctx.textAlign = 'right';
    ctx.font = 'bold 24px Consolas';
    ctx.fillStyle = weapon.isReloading ? '#ffcc00' : '#ff00ff'; 
    ctx.shadowColor = weapon.isReloading ? '#ffcc00' : '#ff00ff';
    ctx.fillText(`Vũ Khí: ${weapon.config.name}`, W - 10, 30);
    ctx.font = '20px Consolas';
    ctx.fillStyle = weapon.isReloading ? '#ffcc00' : '#00ffff'; 
    ctx.shadowColor = weapon.isReloading ? '#ffcc00' : '#00ffff';
    ctx.fillText(reloadText, W - 10, 60);
    
    ctx.shadowBlur = 0; 
}

// --- Vòng lặp Trò chơi Chính (Game Loop) ---
function gameLoop(timestamp) {
    if (!gameRunning) return;

    const delta = timestamp - lastTime;
    lastTime = timestamp;

    update(delta);
    draw();

    requestAnimationFrame(gameLoop);
}


// --- Các Hàm Hỗ Trợ ---
function spawnBoss() {
    let x, y;
    const edge = Math.floor(Math.random() * 4); 
    switch (edge) {
        case 0: x = Math.random() * W; y = -100; break;
        case 1: x = Math.random() * W; y = H + 100; break;
        case 2: x = -100; y = Math.random() * H; break;
        case 3: x = W + 100; y = Math.random() * H; break;
    }
    zombies.push(new Zombie(x, y, true)); 
}

function spawnZombie() {
    let x, y;
    const edge = Math.floor(Math.random() * 4); 
    switch (edge) {
        case 0: x = Math.random() * W; y = -20; break;
        case 1: x = Math.random() * W; y = H + 20; break;
        case 2: x = -20; y = Math.random() * H; break;
        case 3: x = W + 20; y = Math.random() * H; break;
    }
    zombies.push(new Zombie(x, y, false));
}

function dropPowerUp(x, y) {
    if (Math.random() < HP_DROP_RATE) {
        let newPowerup = new PowerUp(x, y, 'HP');
        if (powerups.length >= MAX_POWERUPS) {
            powerups.shift(); 
        }
        powerups.push(newPowerup);
        return; 
    }
    if (Math.random() < POWERUP_DROP_RATE) { 
        const types = ['SHOTGUN', 'RIFLE'];
        const randomType = types[Math.floor(Math.random() * types.length)];
        let newPowerup = new PowerUp(x, y, randomType);
        
        if (powerups.length >= MAX_POWERUPS) {
            powerups.shift(); 
        }
        powerups.push(newPowerup);
    }
}

function checkCollisions() {
    // 1. Va chạm Đạn - Zombie 
    for (let bIndex = bullets.length - 1; bIndex >= 0; bIndex--) {
        const bullet = bullets[bIndex];
        let hit = false;
        for (let zIndex = zombies.length - 1; zIndex >= 0; zIndex--) {
            const zombie = zombies[zIndex];
            const dx = bullet.x - zombie.x;
            const dy = bullet.y - zombie.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < bullet.radius + zombie.radius) {
                zombie.hp -= bullet.damage;
                if (zombie.hp <= 0) {
                    dropPowerUp(zombie.x, zombie.y); 
                    zombies.splice(zIndex, 1);
                    score += zombie.isBoss ? 10 : 1;
                }
                hit = true;
                break; 
            }
        }
        if (hit) {
            bullets.splice(bIndex, 1); 
        }
    }

    // 2. Va chạm Zombie - Người chơi (THÊM RUNG MÀN HÌNH)
    for (let zIndex = zombies.length - 1; zIndex >= 0; zIndex--) {
        const zombie = zombies[zIndex];
        const dx = player.x - zombie.x;
        const dy = player.y - zombie.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < player.radius + zombie.radius) {
            const damage = zombie.isBoss ? 3 : 1;
            player.hp -= damage;
            
            // LOGIC RUNG MÀN HÌNH KHI BỊ THƯƠNG
            canvas.classList.add('shake');
            setTimeout(() => {
                canvas.classList.remove('shake');
            }, 200);
            
            zombies.splice(zIndex, 1);
        }
    }
    
    // 3. Va chạm Power-up - Người chơi
    for (let pIndex = powerups.length - 1; pIndex >= 0; pIndex--) {
        const powerup = powerups[pIndex];
        const dx = player.x - powerup.x;
        const dy = player.y - powerup.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < player.radius + powerup.radius) {
            if (powerup.type === 'HP') {
                player.heal(1); 
            } else {
                player.changeWeapon(powerup.type); 
            }
            powerups.splice(pIndex, 1); 
        }
    }
}

function endGame() {
    gameRunning = false;
    uiOverlay.style.display = 'flex';
    const finalMinutes = Math.floor(gameTime / 60000);
    const finalSeconds = Math.floor((gameTime % 60000) / 1000).toString().padStart(2, '0');

    mainTitle.innerHTML = `GAME OVER!<br>Điểm cuối cùng: ${score}`;
    gameOverMessage.textContent = `Thời gian sống sót: ${finalMinutes}:${finalSeconds}`;
    gameOverMessage.style.display = 'block';
    startButton.textContent = 'Chơi Lại';
    guideButton.style.display = 'block'; 
}

function populateGuideContent() {
    guideContent.innerHTML = `
        <h3>🧭 Điều khiển cơ bản</h3>
        <ul>
            <li><strong>Di chuyển</strong>: Sử dụng các phím <strong>W, A, S, D</strong> (PC) hoặc kéo thả <strong>Joystick ảo</strong> (Mobile). Joystick cho phép di chuyển 360 độ.</li>
            <li><strong>Nhắm & Bắn</strong>: Di chuyển và click chuột (PC) hoặc nút <strong>BẮN</strong> (Mobile). Súng sẽ luôn hướng về phía chuột (PC) hoặc hướng di chuyển (Mobile).</li>
            <li><strong>Nạp đạn</strong>: Nhấn phím <strong>R</strong> (PC) hoặc nút <strong>NẠP</strong> (Mobile).</li>
        </ul>
        
        <h3>🧟 Kẻ thù của bạn</h3>
        
        <h4>Zombie Thường (Màu Xanh lá)</h4>
        <ul>
            <li><strong>HP</strong>: 1.</li>
            <li><strong>Damage</strong>: <strong>-1 HP</strong> (Khi chạm vào người chơi).</li>
        </ul>
        
        <h4>Boss Zombie (Màu Tím)</h4>
        <ul>
            <li><strong>HP</strong>: 100.</li>
            <li><strong>Damage</strong>: <strong>-3 HP</strong> (Khi chạm vào người chơi).</li>
        </ul>
        
        <h3>💊 Power-ups (Vật phẩm hỗ trợ)</h3>
        <p>Các vật phẩm hỗ trợ (Power-ups) sẽ rơi ra ngẫu nhiên khi tiêu diệt zombie và chỉ tồn tại trong <strong>30 giây</strong>.</p>
        <ul>
            <li><strong>+ (Màu Hồng Neon)</strong>: Hồi <strong>1 HP</strong> cho người chơi (HP tối đa là 5).</li>
            <li><strong>S (Shotgun - Màu Cam)</strong>: Thay đổi vũ khí sang <strong>Shotgun</strong> (Đạn chùm, tầm ngắn).</li>
            <li><strong>R (Rifle - Màu Xanh Cyan)</strong>: Thay đổi vũ khí sang <strong>Rifle</strong> (Tốc độ bắn nhanh, sát thương cao).</li>
        </ul>
        
        <h3>🔫 Vũ khí</h3>
        <ul>
            <li><strong>Pistol</strong>: Cơ bản, đạn 12 viên, nạp 1.75s.</li>
            <li><strong>Shotgun</strong>: 10 viên, nạp 3s, bắn 6 viên đạn cùng lúc.</li>
            <li><strong>Rifle</strong>: 30 viên, nạp 1.5s, tốc độ bắn cực nhanh.</li>
        </ul>
    `;
}

function handleShooting(rotation) {
    const now = performance.now();
    const weapon = player.weapon;

    if (weapon.canShoot(now)) {
        weapon.clip--;
        weapon.lastShotTime = now;
        
        const { bulletsPerShot, spread, bulletSpeed, damage, range } = weapon.config;
        
        let finalRange = range;
        if (range === 'SHORT_RANGE') {
            finalRange = player.radius * SHOTGUN_RANGE_MULTIPLIER;
        }

        for (let i = 0; i < bulletsPerShot; i++) {
            const angleOffset = (Math.random() - 0.5) * spread; 
            const finalAngle = rotation + angleOffset;

            const startX = player.x + Math.cos(finalAngle) * (player.radius + 10);
            const startY = player.y + Math.sin(finalAngle) * (player.radius + 10);
            
            bullets.push(new Bullet(startX, startY, finalAngle, bulletSpeed, damage, finalRange));
        }

        if (weapon.clip === 0) {
            weapon.startReload();
        }
    } else if (weapon.clip === 0 && !weapon.isReloading) {
        weapon.startReload();
    }
}


// --- Xử lý Input PC (Mouse: Nhắm và Bắn) ---
canvas.addEventListener('mousemove', (e) => {
    // Chỉ hoạt động trên PC (màn hình lớn hơn 850px)
    if (!gameRunning || !player || !window.matchMedia('(min-width: 850px)').matches) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Tính toán lại tỷ lệ
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const canvasX = mouseX * scaleX;
    const canvasY = mouseY * scaleY;

    const dx = canvasX - player.x;
    const dy = canvasY - player.y;
    player.rotation = Math.atan2(dy, dx);
});

canvas.addEventListener('click', (e) => {
    // Chỉ hoạt động trên PC
    if (!gameRunning || !player || !window.matchMedia('(min-width: 850px)').matches) return;
    handleShooting(player.rotation);
});


// --- Xử lý Input PC (Keyboard: Di chuyển W/A/S/D và Nạp đạn R) ---
document.addEventListener('keydown', (e) => {
    if (!gameRunning || !player) return;
    // Chỉ áp dụng logic 4 phím di chuyển trên PC
    if (!window.matchMedia('(min-width: 850px)').matches && ['w', 'a', 's', 'd'].includes(e.key.toLowerCase())) return;

    switch (e.key.toLowerCase()) {
        case 'w': player.moving.up = true; break;
        case 's': player.moving.down = true; break;
        case 'a': player.moving.left = true; break;
        case 'd': player.moving.right = true; break;
        case 'r': player.weapon.startReload(); break;
    }
});

document.addEventListener('keyup', (e) => {
    if (!gameRunning || !player) return;
    if (!window.matchMedia('(min-width: 850px)').matches && ['w', 'a', 's', 'd'].includes(e.key.toLowerCase())) return;

    switch (e.key.toLowerCase()) {
        case 'w': player.moving.up = false; break;
        case 's': player.moving.down = false; break;
        case 'a': player.moving.left = false; break;
        case 'd': player.moving.right = false; break;
    }
});


// --- XỬ LÝ JOYSTICK 360 ĐỘ (MOBILE) ---

function initializeJoystick() {
    // Chỉ chạy trên mobile
    if (window.matchMedia('(min-width: 850px)').matches) return;
    
    // Tính toán vị trí trung tâm của Joystick Base (trên màn hình thực)
    const rect = joystickBase.getBoundingClientRect();
    joystickCenter.x = rect.left + rect.width / 2;
    joystickCenter.y = rect.top + rect.height / 2;
}

// Hàm xử lý Di chuyển chính (tính góc và lực)
function handleMove(touchX, touchY) {
    const maxDistance = joystickBase.clientWidth / 2;
    const dx = touchX - joystickCenter.x;
    const dy = touchY - joystickCenter.y;
    const distance = Math.min(maxDistance, Math.sqrt(dx * dx + dy * dy));
    
    const currentAngle = Math.atan2(dy, dx);
    
    // Tính toán vị trí Stick (đảm bảo không vượt ra khỏi Base)
    const stickX = Math.cos(currentAngle) * distance;
    const stickY = Math.sin(currentAngle) * distance;
    
    joystickStick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;
    
    // Cập nhật Player (góc xoay và lực đẩy)
    player.rotation = currentAngle; 
    player.moving.angle = currentAngle;
    player.moving.force = distance / maxDistance;
    
    joystickStick.classList.add('active'); // Thêm class active cho hiệu ứng neon (CSS)
}

// 1. Chạm bắt đầu
joystickBase.addEventListener('touchstart', (e) => {
    e.preventDefault(); 
    if (!gameRunning || !player) return;
    
    // Cập nhật center nếu màn hình thay đổi kích thước
    initializeJoystick();
    
    joystickActive = true;
    // Lấy tọa độ của touch đầu tiên
    handleMove(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

// 2. Kéo chạm
joystickBase.addEventListener('touchmove', (e) => {
    e.preventDefault(); 
    if (!gameRunning || !player || !joystickActive) return;
    
    // FIX: Tìm touch ID khớp với touchStart nếu cần multi-touch (mặc định chỉ dùng touch[0])
    handleMove(e.touches[0].clientX, e.touches[0].clientY); 
}, { passive: false });

// 3. Nhả chạm
joystickBase.addEventListener('touchend', (e) => {
    e.preventDefault(); 
    if (!gameRunning || !player) return;
    
    // FIX: Chỉ reset nếu không còn touch nào đang giữ joystick
    if (e.touches.length === 0) { 
        joystickActive = false;
        // Đặt Stick về trung tâm và ngừng di chuyển
        joystickStick.style.transform = `translate(-50%, -50%)`;
        player.moving.force = 0; 
        joystickStick.classList.remove('active'); // Xóa class active 
    }
}, { passive: false });


// --- Xử lý nút Nạp đạn và Bắn (Mobile) ---
// **Quan trọng:** Dùng touchstart cho nút Bắn/Nạp để xử lý tốt multi-touch (vừa di chuyển vừa bắn)
reloadBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); 
    if (!gameRunning || !player) return;
    player.weapon.startReload();
});

shootBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); 
    if (!gameRunning || !player) return;
    // Bắn theo góc xoay (góc di chuyển)
    handleShooting(player.rotation); 
});


// --- Xử lý Nút Hướng dẫn và Quay lại ---

guideButton.addEventListener('click', () => {
    uiOverlay.style.display = 'none';
    guideScreen.style.display = 'flex';
    populateGuideContent();
});

backButton.addEventListener('click', () => {
    guideScreen.style.display = 'none';
    uiOverlay.style.display = 'flex';
    mainTitle.innerHTML = 'UNDEAD SHOOTER'; 
    gameOverMessage.style.display = 'none';
    startButton.textContent = 'BẮT ĐẦU CHƠI';
    instructions.style.display = 'block';
    guideButton.style.display = 'block';
});

// --- Khởi động Game ---
startButton.addEventListener('click', () => {
    initGame();
    requestAnimationFrame(gameLoop); 
});

document.addEventListener('DOMContentLoaded', () => {
    gameOverMessage.style.display = 'none';
});

// Cập nhật lại vị trí Joystick Center nếu cửa sổ thay đổi kích thước (hữu ích khi xoay màn hình)
window.addEventListener('resize', () => {
    if (!window.matchMedia('(min-width: 850px)').matches) {
        initializeJoystick();
    }
});