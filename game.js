const CANVAS_W = 1280;
const CANVAS_H = 720;
const GROUND_Y = 580;
const GRAVITY = 0.7;
const STAGE_LEFT = 50;
const STAGE_RIGHT = 1230;
const ROUND_TIME = 99;
const FPS = 60;

// 画面サイズに合わせて#game-container(1280x720固定)を拡縮し、
// どんな画面幅でも全体が欠けずに収まるようにする。
(function setupResponsiveScale() {
    let rafId = null;
    function applyScale() {
        rafId = null;
        const container = document.getElementById('game-container');
        if (!container) return;
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        const scale = Math.min(vw / CANVAS_W, vh / CANVAS_H);
        container.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
    function requestScale() {
        if (rafId === null) rafId = requestAnimationFrame(applyScale);
    }
    window.addEventListener('resize', requestScale);
    window.addEventListener('orientationchange', requestScale);
    applyScale();
})();

class SoundManager {
    constructor() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.muted = false;


        this.bgm = new Audio();
        this.bgm.loop = true;
        this.bgm.volume = 0.45;

        this.kishinBgm = new Audio();
        this.kishinBgm.loop = true;
        this.kishinBgm.volume = 1.0;

        this.currentDifficulty = 'normal';


        this.titleBgm = new Audio();
        this.titleBgm.loop = true;
        this.titleBgm.volume = 0.75;

        this.loadBGMAudio('A_fight_one_can', this.bgm, 'A_fight_one_can.ogg');
        this.loadBGMAudio('Phantom Clash', this.kishinBgm, 'Phantom Clash.ogg');
        this.loadBGMAudio('title_bgm', this.titleBgm, 'title_bgm.ogg');
    }

    // 公開先の環境で.oggを直接アップロードできないため、BGMをbase64+XOR暗号化して
    // audio_1.js等のJSファイル(window.AUDIO_ASSETS)経由で読み込む運用になっている。
    // それが無ければ通常の.oggファイルを読みにいく（ローカル動作用のフォールバック）。
    loadBGMAudio(keyName, audioObj, fallbackSrc) {
        if (window.AUDIO_ASSETS && window.AUDIO_ASSETS[keyName]) {
            try {
                const b64 = window.AUDIO_ASSETS[keyName];
                const binaryString = atob(b64);
                const view = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    view[i] = binaryString.charCodeAt(i) ^ 123;
                }
                const blob = new Blob([view], { type: 'audio/ogg' });
                audioObj.src = URL.createObjectURL(blob);
                audioObj.load();
                return;
            } catch (e) {
                console.error('Error loading encrypted audio:', keyName, e);
            }
        }
        audioObj.src = fallbackSrc;
        audioObj.load();
    }

    toggleMute() {
        this.muted = !this.muted;
        this.masterGain.gain.value = this.muted ? 0 : 1;
        this.bgm.muted = this.muted;
        this.kishinBgm.muted = this.muted;
        this.titleBgm.muted = this.muted;
        return this.muted;
    }

    getActiveBGM() {
        return this.currentDifficulty === 'kishin' ? this.kishinBgm : this.bgm;
    }
    
    playBGM() {
        // フェードアウトの完了を待たず、鳴らす瞬間に必ずタイトルBGMを止めておく。
        // 処理が遅い端末だとフェードアウトが間に合わず、両方鳴ってしまうことがあるため。
        this.titleBgm.pause();
        const active = this.getActiveBGM();
        active.currentTime = 0;
        active.volume = active === this.kishinBgm ? 1.0 : 0.45;
        active.play().catch(() => {});
    }

    playTitleBGM() {
        this.bgm.pause();
        this.kishinBgm.pause();
        this.titleBgm.currentTime = 0;
        this.titleBgm.volume = 0.75;
        this.titleBgm.play().catch(() => {});
    }
    
    stopBGM(fadeOut = true) {
        if (fadeOut) {
            const active = this.getActiveBGM();
            const fadeStep = 0.02;
            const fadeInterval = setInterval(() => {
                if (active.volume > fadeStep) {
                    active.volume -= fadeStep;
                } else {
                    active.volume = 0;
                    active.pause();
                    active.currentTime = 0;
                    clearInterval(fadeInterval);
                }
            }, 50);
        } else {
            this.bgm.pause();
            this.bgm.currentTime = 0;
            this.bgm.volume = 0.45;
            this.kishinBgm.pause();
            this.kishinBgm.currentTime = 0;
            this.kishinBgm.volume = 1.0;
        }
    }
    
    stopTitleBGM(fadeOut = true) {
        if (fadeOut) {
            const fadeStep = 0.02;
            const fadeInterval = setInterval(() => {
                if (this.titleBgm.volume > fadeStep) {
                    this.titleBgm.volume -= fadeStep;
                } else {
                    this.titleBgm.volume = 0;
                    this.titleBgm.pause();
                    this.titleBgm.currentTime = 0;
                    clearInterval(fadeInterval);
                }
            }, 50);
        } else {
            this.titleBgm.pause();
            this.titleBgm.currentTime = 0;
            this.titleBgm.volume = 0.75;
        }
    }
    
    pauseBGM() {
        this.bgm.pause();
        this.kishinBgm.pause();
    }
    
    resumeBGM() {
        this.getActiveBGM().play().catch(() => {});
    }
    
    playNoise(duration, filterFreq, type = 'lowpass', vol = 1) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = filterFreq;
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        noise.start();
    }

    playOsc(type, freqStart, freqEnd, duration, vol = 1) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, this.ctx.currentTime);
        if (freqEnd) {
            osc.frequency.exponentialRampToValueAtTime(freqEnd, this.ctx.currentTime + duration);
        }
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playPunch() {
        this.playNoise(0.1, 1000, 'lowpass', 1.5);
    }
    
    playKick() {
        this.playNoise(0.15, 600, 'bandpass', 2);
    }
    
    playSpecial() {
        this.playOsc('sawtooth', 800, 100, 0.4, 0.5);
        this.playNoise(0.4, 2000, 'lowpass', 1);
    }
    
    playBlock() {
        this.playOsc('square', 1200, 2000, 0.1, 0.5);
    }
    
    playKO() {
        this.playOsc('sawtooth', 100, 20, 1.0, 1);
        this.playNoise(1.5, 400, 'lowpass', 3);
    }
    
    playRoundBell() {
        this.playOsc('sine', 880, 880, 1.5, 0.3);
        setTimeout(() => this.playOsc('sine', 880, 880, 1.5, 0.3), 300);
    }
    
    playCursor() {
        this.playOsc('sine', 600, 900, 0.08, 0.4);
    }
    
    playConfirm() {
        this.playOsc('sine', 500, 500, 0.08, 0.5);
        setTimeout(() => this.playOsc('sine', 750, 750, 0.12, 0.5), 80);
    }
    
    playTeleport() {
        this.playOsc('sine', 1500, 200, 0.15, 0.5);
    }
}

class Particle {
    constructor(x, y, vx, vy, color, size, life, type) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.size = size;
        this.life = life;
        this.maxLife = life;
        this.type = type;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.type !== 'special_proj') {
            this.size *= 0.95;
            this.life--;
        } else {
            this.life--;
        }
    }
    
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = this.color;
        
        if (this.type === 'spark') {
            ctx.beginPath();
            ctx.moveTo(this.x, this.y - this.size);
            ctx.lineTo(this.x + this.size/2, this.y - this.size/2);
            ctx.lineTo(this.x + this.size, this.y);
            ctx.lineTo(this.x + this.size/2, this.y + this.size/2);
            ctx.lineTo(this.x, this.y + this.size);
            ctx.lineTo(this.x - this.size/2, this.y + this.size/2);
            ctx.lineTo(this.x - this.size, this.y);
            ctx.lineTo(this.x - this.size/2, this.y - this.size/2);
            ctx.closePath();
            ctx.fill();
        } else if (this.type === 'teleport') {
            ctx.shadowBlur = 15;
            ctx.shadowColor = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
            ctx.fill();
            ctx.shadowBlur = 0;
        } else if (this.type === 'confetti') {
            ctx.translate(this.x, this.y);
            ctx.rotate(this.life * 0.1);
            ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size);
        } else if (this.type === 'special_proj') {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
            ctx.fill();
            ctx.shadowBlur = 20;
            ctx.shadowColor = this.color;
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size*0.6, 0, Math.PI*2);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    
    get isDead() { return this.life <= 0 || this.size < 0.5; }
}

class EffectManager {
    constructor() { 
        this.particles = []; 
        this.screenShake = {x:0, y:0, duration:0, intensity:0}; 
    }
    
    spawnTeleportEffect(x, y) {
        const colors = ['#aa00ff', '#ffffff'];
        for (let i = 0; i < 15; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            const p = new Particle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, colors[Math.floor(Math.random() * colors.length)], 5 + Math.random() * 8, 15 + Math.random() * 10, 'teleport');
            this.particles.push(p);
        }
    }
    
    spawnHitSparks(x, y, intensity) {
        const count = intensity * 10;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 10 + 2;
            this.particles.push(new Particle(
                x, y, 
                Math.cos(angle) * speed, Math.sin(angle) * speed, 
                '#FFDD44', Math.random() * 15 + 5, 20 + Math.random() * 10, 'spark'
            ));
        }
    }
    
    spawnBlockSparks(x, y) {
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 2;
            this.particles.push(new Particle(
                x, y, 
                Math.cos(angle) * speed, Math.sin(angle) * speed, 
                '#44DDFF', Math.random() * 10 + 3, 15 + Math.random() * 10, 'spark'
            ));
        }
    }
    
    spawnSpecialEffect(x, y, color, facing, owner) {
        const proj = new Particle(
            x, y,
            15 * facing, 0,
            color, 30, 40, 'special_proj'
        );
        proj.owner = owner;
        this.particles.push(proj);
        for (let i = 0; i < 30; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 2;
            this.particles.push(new Particle(
                x, y, 
                Math.cos(angle) * speed + (5 * facing), Math.sin(angle) * speed, 
                color, Math.random() * 15 + 5, 30 + Math.random() * 10, 'spark'
            ));
        }
    }
    
    spawnVictoryEffect(x, y) {
        const colors = ['#FF4444', '#44FF44', '#4444FF', '#FFFF44', '#FF44FF', '#44FFFF'];
        for (let i = 0; i < 100; i++) {
            this.particles.push(new Particle(
                x + (Math.random() - 0.5) * 600, 
                y - Math.random() * 400, 
                (Math.random() - 0.5) * 5, 
                Math.random() * 5 + 2, 
                colors[Math.floor(Math.random() * colors.length)], 
                Math.random() * 10 + 5, 
                100 + Math.random() * 100, 
                'confetti'
            ));
        }
    }
    
    triggerShake(intensity, duration) {
        this.screenShake.intensity = intensity;
        this.screenShake.duration = duration;
    }
    
    update() {
        this.particles.forEach(p => p.update());
        this.particles = this.particles.filter(p => !p.isDead);
        
        if (this.screenShake.duration > 0) {
            this.screenShake.duration--;
            this.screenShake.x = (Math.random() - 0.5) * this.screenShake.intensity * 2;
            this.screenShake.y = (Math.random() - 0.5) * this.screenShake.intensity * 2;
        } else {
            this.screenShake.x = 0;
            this.screenShake.y = 0;
        }
    }
    
    draw(ctx) {
        this.particles.forEach(p => p.draw(ctx));
    }
    
    getShakeOffset() {
        return {x: this.screenShake.x, y: this.screenShake.y};
    }
}

class Fighter {
    constructor(config) {
        this.name = config.name;
        this.x = config.x;
        this.y = config.y || GROUND_Y;
        this.facing = config.facing || 1; 
        this.vx = 0;
        this.vy = 0;
        this.width = 70; 
        this.height = 140; 
        
        this.hp = 1000;
        this.maxHp = 1000;
        this.energy = 0; 
        this.maxEnergy = 100;
        
        this.state = 'idle'; 
        this.stateTimer = 0;
        this.animFrame = 0;
        
        this.isGrounded = true;
        this.isBlocking = false;
        this.isCrouching = false;
        this.comboCount = 0;
        this.comboTimer = 0;
        this.hitStun = 0; 
        this.attackHitConnected = false; 
        
        this.roundsWon = 0;
        this.colors = config.colors; 
        
        this.walkSpeed = config.walkSpeed || 5;
        this.jumpPower = config.jumpPower || -15;
        this.attacks = config.attacks;
    }
    
    setState(newState) {
        if (this.state === newState) return;
        this.state = newState;
        this.stateTimer = 0;
        this.animFrame = 0;
        this.attackHitConnected = false;
    }
    
    update(opponent) {
        this.stateTimer++;
        this.animFrame = Math.floor(this.stateTimer / 4); 
        
        if (!this.isGrounded) {
            this.vy += GRAVITY;
            this.y += this.vy;
            if (this.y >= GROUND_Y) {
                this.y = GROUND_Y;
                this.vy = 0;
                this.isGrounded = true;
                if (this.state === 'jump') this.setState('idle');
                if (['jumpPunch', 'jumpKick'].includes(this.state)) this.setState('idle');
            }
        }
        
        this.x += this.vx;
        this.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, this.x));
        
        if (this.hitStun > 0) this.hitStun--;
        
        if (this.comboTimer > 0) {
            this.comboTimer--;
            if (this.comboTimer <= 0) this.comboCount = 0;
        }
        
        if (['punch','kick','special','crouchPunch','crouchKick','jumpPunch','jumpKick'].includes(this.state)) {
            const atkData = this.getAttackData();
            if (atkData && this.stateTimer >= atkData.duration) {
                this.setState(this.isGrounded ? (this.isCrouching ? 'crouch' : 'idle') : 'jump');
            }
        }
        
        if (this.state === 'hit' && this.stateTimer >= 20) {
            this.setState(this.isCrouching ? 'crouch' : 'idle');
        }
        if (this.state === 'knockdown' && this.stateTimer >= 60) {
            this.setState('idle');
        }
        
        if (['idle','walk','crouch'].includes(this.state)) {
            this.facing = opponent.x > this.x ? 1 : -1;
        }
    }
    
    getAttackData() {
        return this.attacks[this.state] || null;
    }
    
    getHitbox() {
        const atk = this.getAttackData();
        if (!atk) return null;
        if (this.stateTimer < atk.startup || this.stateTimer >= atk.startup + atk.active) return null;
        return {
            x: this.x + atk.hitbox.x * this.facing - (this.facing===-1 ? atk.hitbox.w : 0),
            y: this.y + atk.hitbox.y - this.height,
            w: atk.hitbox.w,
            h: atk.hitbox.h
        };
    }
    
    getHurtbox() {
        let h = this.height;
        let yOffset = 0;
        if (this.isCrouching || this.state === 'crouch' || this.state === 'crouchBlock' || this.state === 'crouchPunch' || this.state === 'crouchKick') {
            h = this.height * 0.6;
            yOffset = this.height * 0.4;
        }
        return {
            x: this.x - this.width/2,
            y: this.y - this.height + yOffset,
            w: this.width,
            h: h
        };
    }
        
    takeDamage(damage, knockback, isSpecial, isOverhead = false, isLow = false) {
        let effectivelyBlocking = this.isBlocking;
        
        if (isOverhead && this.isCrouching) {
            effectivelyBlocking = false;
        }
        
        if (isLow && !this.isCrouching) {
            effectivelyBlocking = false;
        }
        
        if (effectivelyBlocking) {
            this.hp -= Math.floor(damage * 0.1); 
            this.energy = Math.min(this.maxEnergy, this.energy + 3);
            this.hitStun = 10;
            this.setState(this.isCrouching ? 'crouchBlock' : 'block');
            return 'blocked';
        }
        
        this.hp -= damage;
        this.energy = Math.min(this.maxEnergy, this.energy + 8);
        this.vx = knockback * (this.facing * -1);
        
        if (isSpecial || this.hp <= 0) {
            this.setState('knockdown');
            this.vy = -8;
            this.isGrounded = false;
        } else {
            this.setState('hit');
            this.hitStun = 15;
        }
        
        if (this.hp < 0) this.hp = 0;
        return 'hit';
    }
    
    reset(x) {
        this.x = x;
        this.y = GROUND_Y;
        this.vx = 0;
        this.vy = 0;
        this.hp = this.maxHp;
        this.energy = 0;
        this.state = 'idle';
        this.stateTimer = 0;
        this.isGrounded = true;
        this.isBlocking = false;
        this.isCrouching = false;
        this.comboCount = 0;
        this.hitStun = 0;
    }
    
    canAct() {
        return ['idle','walk','crouch','block','crouchBlock'].includes(this.state) && this.hitStun <= 0;
    }
    
    canAttack() {
        return this.canAct() || (this.state === 'jump' && this.isGrounded === false && this.hitStun <= 0);
    }
}

const RYUJI_CONFIG = {
    name: '賢一',
    walkSpeed: 5,
    jumpPower: -15,
    colors: {
        skin: '#E8B87A',
        hair: '#1C1510',
        outfit: '#2A2D45',      
        pants: '#5C5840',       
        glasses: '#3A3A3A',     
        accent: '#D42020'
    },
    attacks: {
        punch: { damage: 60, startup: 3, active: 5, duration: 18, knockback: 3, hitbox: {x: 35, y: -35, w: 90, h: 40} },
        kick: { damage: 90, startup: 5, active: 6, duration: 25, knockback: 6, hitbox: {x: 40, y: -25, w: 105, h: 45} },
        crouchPunch: { damage: 50, startup: 3, active: 4, duration: 16, knockback: 2, hitbox: {x: 30, y: 50, w: 85, h: 35} },
        crouchKick: { damage: 70, startup: 5, active: 5, duration: 22, knockback: 4, hitbox: {x: 35, y: 60, w: 100, h: 30} },
        jumpPunch: { damage: 70, startup: 3, active: 7, duration: 20, knockback: 3, hitbox: {x: 25, y: 0, w: 80, h: 130} },
        jumpKick: { damage: 85, startup: 4, active: 6, duration: 22, knockback: 5, hitbox: {x: 35, y: 10, w: 90, h: 130} },
        special: { damage: 180, startup: 10, active: 10, duration: 45, knockback: 3, hitbox: {x: 40, y: -50, w: 140, h: 80}, isSpecial: true, energyCost: 50, color: '#44AAFF' }
    }
};

const KAGE_CONFIG = {
    name: 'こころ', 
    walkSpeed: 6, 
    jumpPower: -16,
    colors: {
        isKokoro: true, 
        skin: '#E8D5B7',
        hair: '#1A1A2E',
        outfit: '#3D1F6D',
        mask: '#2D1854',
        scarf: '#6B3FA0',
        accent: '#9B59B6'
    },
    attacks: {
        punch: { damage: 50, startup: 2, active: 4, duration: 15, knockback: 2, hitbox: {x: 30, y: -35, w: 85, h: 38} },
        kick: { damage: 80, startup: 4, active: 5, duration: 22, knockback: 5, hitbox: {x: 35, y: -25, w: 100, h: 40} },
        crouchPunch: { damage: 45, startup: 2, active: 4, duration: 14, knockback: 2, hitbox: {x: 25, y: 50, w: 80, h: 32} },
        crouchKick: { damage: 65, startup: 4, active: 5, duration: 20, knockback: 4, hitbox: {x: 30, y: 60, w: 95, h: 28} },
        jumpPunch: { damage: 60, startup: 2, active: 6, duration: 18, knockback: 3, hitbox: {x: 22, y: 0, w: 75, h: 130} },
        jumpKick: { damage: 75, startup: 3, active: 6, duration: 20, knockback: 5, hitbox: {x: 30, y: 10, w: 85, h: 130} },
        special: { damage: 160, startup: 8, active: 12, duration: 40, knockback: 2.5, hitbox: {x: 35, y: -45, w: 130, h: 75}, isSpecial: true, energyCost: 50, color: '#9B59B6' }
    }
};

class PlayerController {
    constructor() {
        this.keys = {};
        this.prevKeys = {};
        this.justPressed = {};
        window.addEventListener('keydown', e => {
            this.keys[e.key.toLowerCase()] = true;
            if (['w','a','s','d','j','k','l',' '].includes(e.key.toLowerCase())) e.preventDefault();
        });
        window.addEventListener('keyup', e => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }
    
    update(fighter) {
        
        for (const key in this.keys) {
            this.justPressed[key] = this.keys[key] && !this.prevKeys[key];
        }
        this.prevKeys = { ...this.keys };

        if (!fighter.canAct() && !fighter.canAttack()) return;
        
        fighter.isBlocking = (this.keys[' '] || false) && fighter.isGrounded;
        if (fighter.isBlocking && fighter.canAct()) {
            fighter.vx = 0;
            if (this.keys['s']) {
                fighter.isCrouching = true;
                fighter.setState('crouchBlock');
            } else {
                fighter.isCrouching = false;
                fighter.setState('block');
            }
            return;
        }
        
        fighter.isCrouching = this.keys['s'] || false;
        
        if (fighter.canAttack()) {
            if (this.justPressed['l'] && fighter.energy >= (fighter.attacks.special?.energyCost || 50)) {
                fighter.energy -= fighter.attacks.special.energyCost;
                fighter.setState('special');
                fighter.vx = 0;
                return;
            }
            if (this.justPressed['j']) {
                if (!fighter.isGrounded) fighter.setState('jumpPunch');
                else if (fighter.isCrouching) fighter.setState('crouchPunch');
                else fighter.setState('punch');
                fighter.vx = 0;
                return;
            }
            if (this.justPressed['k']) {
                if (!fighter.isGrounded) fighter.setState('jumpKick');
                else if (fighter.isCrouching) fighter.setState('crouchKick');
                else fighter.setState('kick');
                fighter.vx = 0;
                return;
            }
        }
        
        if (fighter.canAct()) {
            if (this.keys['a'] && !fighter.isCrouching) {
                fighter.vx = -fighter.walkSpeed;
                fighter.setState('walk');
            } else if (this.keys['d'] && !fighter.isCrouching) {
                fighter.vx = fighter.walkSpeed;
                fighter.setState('walk');
            } else {
                fighter.vx = 0;
                if (fighter.isCrouching) fighter.setState('crouch');
                else if (fighter.state !== 'idle') fighter.setState('idle');
            }
            
            if (this.keys['w'] && fighter.isGrounded) {
                fighter.vy = fighter.jumpPower;
                fighter.isGrounded = false;
                fighter.setState('jump');
                fighter.isCrouching = false;
                if (this.keys['a']) fighter.vx = -fighter.walkSpeed * 0.8;
                else if (this.keys['d']) fighter.vx = fighter.walkSpeed * 0.8;
            }
        }
    }
}

class CPUController {
    constructor(difficulty) {
        this.difficulty = difficulty; 
        this.actionTimer = 0;
        this.hasReactedToAttack = false; 
        this.opponentSpamCount = 0; 
        this.spamAttackType = null; 
        
        this.reactionTime = difficulty === 'very_easy' ? 40 : difficulty === 'easy' ? 15 : difficulty === 'normal' ? 12 : difficulty === 'hard' ? 10 : 1;
        this.aggressiveness = difficulty === 'very_easy' ? 0.25 : difficulty === 'easy' ? 0.4 : difficulty === 'normal' ? 0.6 : difficulty === 'hard' ? 0.8 : 1.0;
        this.blockChance = difficulty === 'very_easy' ? 0.0 : difficulty === 'easy' ? 0.3 : difficulty === 'normal' ? 0.5 : difficulty === 'hard' ? 0.75 : 0.95;
        this.jumpChance = difficulty === 'very_easy' ? 0.01 : difficulty === 'easy' ? 0.1 : difficulty === 'normal' ? 0.15 : difficulty === 'hard' ? 0.2 : 0.3;
        this.canCrouch = difficulty === 'hard' || difficulty === 'kishin';
    }
    
    update(fighter, opponent, effects, sound) {
        if (!fighter.canAct() && !fighter.canAttack()) return;
        
        const dist = Math.abs(fighter.x - opponent.x);
        const isOpponentAttacking = ['punch','kick','special','crouchPunch','crouchKick','jumpPunch','jumpKick'].includes(opponent.state);
        
        if (!isOpponentAttacking || 
            opponent.state !== this.lastOpponentState || 
            opponent.stateTimer < this.lastOpponentStateTimer) {
            this.hasReactedToAttack = false;
            this.willCounterAttack = null;
            
            if (isOpponentAttacking && (opponent.state === 'punch' || opponent.state === 'kick' || opponent.state === 'crouchPunch' || opponent.state === 'crouchKick')) {
                if (this.spamAttackType === opponent.state) {
                    this.opponentSpamCount++;
                } else {
                    this.spamAttackType = opponent.state;
                    this.opponentSpamCount = 1;
                }
                
                if (this.opponentSpamCount >= 3 && this.difficulty !== 'very_easy' && this.difficulty !== 'easy' && fighter.canAct()) {
                    this.opponentSpamCount = 0; 
                    
                    let shouldTeleport = false;
                    let teleportDistance = 200;
                    
                    if (this.difficulty === 'kishin' || this.difficulty === 'hard') {
                        if (opponent.state === 'crouchPunch' || opponent.state === 'crouchKick') {
                            shouldTeleport = true;
                        } else if (this.difficulty === 'kishin' && (opponent.state === 'punch' || opponent.state === 'kick')) {
                            shouldTeleport = Math.random() < 0.5;
                        }
                        
                        if (this.difficulty === 'hard') {
                            teleportDistance = 400;
                        }
                    }

                    if (shouldTeleport) {
                        effects.spawnTeleportEffect(fighter.x, fighter.y - 70);
                        
                        fighter.x -= teleportDistance * fighter.facing;
                        fighter.x = Math.max(50, Math.min(1280 - 50, fighter.x));
                        
                        effects.spawnTeleportEffect(fighter.x, fighter.y - 70);
                        if (sound) sound.playTeleport();
                        
                        fighter.energy = Math.min(fighter.maxEnergy, fighter.energy + 50);
                        
                        if (fighter.energy >= fighter.attacks.special.energyCost) {
                            fighter.energy -= fighter.attacks.special.energyCost;
                            fighter.setState('special');
                            fighter.vx = 0;
                            this.actionTimer = 15;
                            return;
                        }
                    }
                    
                    if (fighter.energy >= 50) {
                        fighter.energy -= fighter.attacks.special.energyCost;
                        fighter.setState('special');
                        fighter.vx = 0;
                        fighter.isBlocking = false;
                        this.actionTimer = 20;
                        return;
                    } else {
                        fighter.isCrouching = true;
                        fighter.vx = 0;
                        fighter.isBlocking = false;
                        fighter.setState(Math.random() < 0.5 ? 'crouchKick' : 'crouchPunch');
                        this.actionTimer = 15;
                        return;
                    }
                }
            } else if (isOpponentAttacking) {
                this.opponentSpamCount = 0;
                this.spamAttackType = null;
            }
        }
        
        this.lastOpponentState = opponent.state;
        this.lastOpponentStateTimer = opponent.stateTimer;

        if (isOpponentAttacking && dist < 150 && !this.hasReactedToAttack && fighter.isGrounded) {
            this.hasReactedToAttack = true;
            this.willCounterAttack = Math.random() < 0.75; 
            
            this.counterAttackDelay = Math.random() < 0.5 ? 0 : Math.floor(Math.random() * 15) + 5;
            
            let currentBlockChance = this.blockChance;
            if (this.actionTimer > 0) {
                currentBlockChance *= (this.difficulty === 'kishin' ? 0.75 : 0.5); 
            }

            if (Math.random() < currentBlockChance) {
                if (this.difficulty === 'kishin' && (opponent.state === 'punch' || opponent.state === 'kick') && Math.random() < 0.7) {
                    fighter.isBlocking = false;
                    fighter.isCrouching = true;
                    fighter.setState('crouch');
                    fighter.vx = 0;
                    this.actionTimer = 25; 
                    return;
                }
                
                fighter.isBlocking = true;
                
                let shouldCrouch = false;
                if (this.canCrouch) {
                    if (this.difficulty === 'kishin') {
                        shouldCrouch = opponent.state === 'crouchKick' || opponent.state === 'crouchPunch' || Math.random() < 0.5;
                    } else if (this.difficulty === 'hard') {
                        shouldCrouch = Math.random() < 0.25; 
                    }
                }

                if (shouldCrouch) {
                    fighter.isCrouching = true;
                    fighter.setState('crouchBlock');
                } else {
                    fighter.isCrouching = false;
                    fighter.setState('block');
                }
                fighter.vx = 0;
                this.actionTimer = this.difficulty === 'very_easy' ? 20 : this.difficulty === 'easy' ? 15 : this.difficulty === 'normal' ? 10 : this.difficulty === 'hard' ? 5 : 0;
                return;
            }
        }
        
        let isOpponentInRecovery = false;
        if (isOpponentAttacking) {
            const opponentAtk = opponent.attacks[opponent.state];
            if (opponentAtk && opponent.stateTimer >= opponentAtk.startup + opponentAtk.active) {
                isOpponentInRecovery = true;
            }
        }

        if (fighter.isBlocking && isOpponentAttacking && !isOpponentInRecovery) {
            return;
        }

        if (this.difficulty === 'kishin' || this.difficulty === 'hard') {
            if (opponent.state === 'jump' || opponent.state === 'jumpPunch' || opponent.state === 'jumpKick') {
                if (fighter.isGrounded && fighter.canAct()) {
                    if (opponent.vy > 0 && opponent.y > GROUND_Y - 120 && dist < 140) {
                        fighter.vx = 0;
                        fighter.setState(Math.random() < 0.5 ? 'punch' : 'kick');
                        fighter.isBlocking = false;
                        this.actionTimer = 15;
                        return;
                    } else if (dist < 180) {
                        fighter.vx = 0;
                        fighter.setState('idle');
                        this.actionTimer = 2;
                        return;
                    }
                }
            }
        }

        if (this.difficulty === 'kishin' && effects && effects.particles) {
            const incomingProj = effects.particles.find(p => p.type === 'special_proj' && p.owner === opponent);
            if (incomingProj) {
                const projDist = Math.abs(fighter.x - incomingProj.x);
                if (projDist < 250 && projDist > 50 && fighter.isGrounded && fighter.state !== 'jump' && fighter.canAct()) {
                    fighter.vy = fighter.jumpPower;
                    fighter.isGrounded = false;
                    fighter.setState('jump');
                    fighter.isBlocking = false;
                    this.actionTimer = 20;
                    return;
                }
            }
        }
        
        if (this.difficulty === 'kishin' && isOpponentAttacking && fighter.canAct() && this.willCounterAttack) {
            if (isOpponentInRecovery) {
                if (this.counterAttackDelay > 0) {
                    this.counterAttackDelay--; 
                } else if (dist < 130) {
                    fighter.vx = 0;
                    fighter.setState(Math.random() < 0.5 ? 'punch' : 'kick'); 
                    fighter.isBlocking = false;
                    fighter.isCrouching = false;
                    this.actionTimer = 15;
                    this.willCounterAttack = false; 
                    return;
                }
            }
        }
        
        this.actionTimer--;
        if (this.actionTimer > 0) {
            fighter.isBlocking = false;
            fighter.isCrouching = false;
            return;
        }
        
        fighter.isBlocking = false;
        fighter.isCrouching = false;
        
        if (!fighter.isGrounded) {
            if (fighter.state === 'jump') {
                let attackChance = 0.05;
                if (fighter.vy > 4 && fighter.y > 480) {
                    attackChance = dist < 150 ? 0.8 : 0.4;
                    if (opponent.isCrouching) attackChance = 0.95; 
                }
                
                if (Math.random() < attackChance) {
                    fighter.setState(Math.random() < 0.5 ? 'jumpPunch' : 'jumpKick');
                    this.actionTimer = 20;
                }
            }
            return;
        }
        
        if (dist < 120) {
            if (Math.random() < this.aggressiveness) {
                if (opponent.isCrouching) {
                    const crouchMixup = Math.random();
                    if (crouchMixup < 0.25) {
                        fighter.vy = fighter.jumpPower;
                        fighter.isGrounded = false;
                        fighter.vx = fighter.walkSpeed * 0.5 * fighter.facing;
                        fighter.setState('jump');
                        this.actionTimer = 15;
                        return;
                    } else if (crouchMixup < 0.55 && this.canCrouch) {
                        fighter.vx = 0;
                        fighter.isCrouching = true;
                        fighter.setState(Math.random() < 0.6 ? 'crouchKick' : 'crouchPunch');
                        this.actionTimer = 15;
                        return;
                    } else if (crouchMixup < 0.75) {
                        fighter.vx = (Math.random() < 0.5 ? 1 : -1) * fighter.walkSpeed * fighter.facing;
                        fighter.setState('walk');
                        this.actionTimer = 10;
                        return;
                    }
                }

                if (fighter.energy >= 50 && Math.random() < 0.3) {
                    fighter.energy -= fighter.attacks.special.energyCost;
                    fighter.setState('special');
                } else {
                    let useLowAttack = false;
                    if ((this.difficulty === 'kishin' || this.difficulty === 'hard') && opponent.isBlocking && !opponent.isCrouching) {
                        useLowAttack = Math.random() < 0.7; 
                    }                    
                    if (useLowAttack) {
                        fighter.vx = 0;
                        fighter.isCrouching = true;
                        fighter.setState(Math.random() < 0.5 ? 'crouchKick' : 'crouchPunch');
                    } else {
                        const rand = Math.random();
                        if (rand < 0.3) {
                            fighter.setState('punch');
                        } else if (rand < 0.6) {
                            fighter.setState('kick');
                        } else if (fighter.isGrounded) {
                            fighter.vy = fighter.jumpPower;
                            fighter.isGrounded = false;
                            fighter.vx = fighter.walkSpeed * 0.5 * fighter.facing;
                            fighter.setState('jump');
                        } else {
                            fighter.setState(Math.random() < 0.5 ? 'punch' : 'kick');
                        }
                    }
                }
                
                if (fighter.state !== 'jump') {
                    fighter.vx = 0;
                }
                
                let baseDelay = this.difficulty === 'kishin' ? 5 : this.difficulty === 'hard' ? 10 : 20;
                this.actionTimer = Math.random() < 0.3 ? 0 : baseDelay + Math.floor(Math.random() * 30);
            } else {
                const rand = Math.random();
                if (rand < 0.3) {
                    fighter.vx = -fighter.walkSpeed * fighter.facing;
                    fighter.setState('walk');
                    this.actionTimer = 10 + Math.floor(Math.random() * 30);
                } else if (rand < 0.6 && this.canCrouch) {
                    fighter.vx = 0;
                    fighter.isCrouching = true;
                    fighter.setState('crouch');
                    this.actionTimer = 15 + Math.floor(Math.random() * 20);
                } else {
                    fighter.vx = 0;
                    fighter.setState('idle');
                    this.actionTimer = 10 + Math.floor(Math.random() * 20);
                }
            }
        } else if (dist < 300) {
            if (Math.random() < this.aggressiveness) {
                fighter.vx = fighter.walkSpeed * fighter.facing;
                fighter.setState('walk');
                this.actionTimer = 10 + Math.floor(Math.random() * 15);
            } else if (Math.random() < this.jumpChance && fighter.isGrounded) {
                fighter.vy = fighter.jumpPower;
                fighter.isGrounded = false;
                fighter.vx = fighter.walkSpeed * 0.8 * fighter.facing;
                fighter.setState(Math.random() < 0.5 ? 'jumpKick' : 'jumpPunch');
                this.actionTimer = 25;
            } else {
                if (Math.random() < 0.4 && this.canCrouch) {
                    fighter.vx = 0;
                    fighter.isCrouching = true;
                    fighter.setState('crouch');
                    this.actionTimer = 15 + Math.floor(Math.random() * 20);
                } else {
                    fighter.vx = 0;
                    fighter.setState('idle');
                    this.actionTimer = 5 + Math.floor(Math.random() * 10);
                }
            }
        } else {
            fighter.vx = fighter.walkSpeed * fighter.facing;
            fighter.setState('walk');
            this.actionTimer = 15 + Math.floor(Math.random() * 20);
        }
    }
}

class Renderer {
    constructor(ctx) {
        this.ctx = ctx;

        this.bgImage = new Image();
        this.bgImage.src = 'bg_wharf.jpg';
    }
    
    drawBackground() {
        const ctx = this.ctx;
        if (this.bgImage.complete && this.bgImage.naturalWidth !== 0) {
            ctx.drawImage(this.bgImage, 0, 0, CANVAS_W, CANVAS_H);
        } else {
            // 背景画像の読み込み完了前の数フレームだけ表示される。
            // 以前はここで別デザインの背景（月など）を描画しており、起動直後に一瞬だけ
            // 見えてしまっていたため、単色で塗りつぶすだけにしている。
            ctx.fillStyle = '#0a0a12';
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        }
    }

    drawFighter(fighter) {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(fighter.x, fighter.y);
        ctx.scale(fighter.facing, 1); 
        
        if ((fighter.state === 'hit' || fighter.state === 'knockdown') && Math.floor(fighter.stateTimer / 2) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        const isKenichi = !!fighter.colors.glasses;
        if (isKenichi) {
            if (!this.kenichiSprite) {
                this.kenichiSprite = new Image();
                this.kenichiSprite.src = 'kenichi_sprite.png';
            }
            if (!this.kenichiCrouchKickSprite) {
                this.kenichiCrouchKickSprite = new Image();
                this.kenichiCrouchKickSprite.src = 'kenichi_crouch_kick.png';
            }
            if (!this.kenichiCrouchBlockSprite) {
                this.kenichiCrouchBlockSprite = new Image();
                this.kenichiCrouchBlockSprite.src = 'kenichi_crouch_guard.png';
            }
            if (!this.kenichiCrouchPunchSprite) {
                this.kenichiCrouchPunchSprite = new Image();
                this.kenichiCrouchPunchSprite.src = 'kenichi_crouch_punch.png';
            }
            if (this.kenichiSprite.complete && this.kenichiSprite.width > 0) {
                const cols = 3;
                const rows = 3;
                const fw = this.kenichiSprite.width / cols;
                const fh = this.kenichiSprite.height / rows;
                
                let c = 0, r = 0;
                const st = fighter.state;
                if (st === 'idle') { c = 0; r = 0; }
                else if (st === 'walk') {
                    c = (Math.floor(fighter.stateTimer / 10) % 2 === 0) ? 0 : 1;
                    r = 0;
                }
                else if (st === 'crouch') { c = 0; r = 1; }
                else if (st === 'crouchBlock') { /* Handled separately below */ }
                else if (st === 'punch' || st === 'jumpPunch') { c = 1; r = 1; }
                else if (st === 'crouchPunch') { /* Handled separately below */ }
                else if (st === 'kick' || st === 'jumpKick') { c = 2; r = 1; }
                else if (st === 'crouchKick') { /* Handled separately below */ }
                else if (st === 'jump') { c = 0; r = 2; }
                else if (st === 'hit' || st === 'knockdown' || st === 'lose') { c = 1; r = 2; }
                else if (st === 'block') { c = 2; r = 0; }
                else if (st === 'special' || st === 'win') { c = 2; r = 2; }
                
                let ox = 0, oy = 0;
                if (st === 'idle') oy = Math.sin(fighter.stateTimer * 0.1) * 3;
                if (st === 'walk') {
                    oy = -Math.abs(Math.sin(fighter.stateTimer * 0.2)) * 5;
                    ox = Math.sin(fighter.stateTimer * 0.2) * 2;
                }
                
                const drawH = 195;
                const drawW = drawH * (fw / fh);
                
                if (st === 'special') {
                    ctx.filter = 'drop-shadow(0 0 15px rgba(100, 200, 255, 1)) brightness(1.5)';
                }
                
                if (st === 'crouchKick' && this.kenichiCrouchKickSprite.complete && this.kenichiCrouchKickSprite.width > 0) {
                    const cfw = this.kenichiCrouchKickSprite.width;
                    const cfh = this.kenichiCrouchKickSprite.height;
                    const cdrawH = 185;
                    const cdrawW = cdrawH * (cfw / cfh);
                    ctx.drawImage(this.kenichiCrouchKickSprite, 0, 0, cfw, cfh, -cdrawW/2 + ox, -cdrawH + oy, cdrawW, cdrawH);
                } else if (st === 'crouchBlock' && this.kenichiCrouchBlockSprite.complete && this.kenichiCrouchBlockSprite.width > 0) {
                    const cfw = this.kenichiCrouchBlockSprite.width;
                    const cfh = this.kenichiCrouchBlockSprite.height;
                    const cdrawH = 125;
                    const cdrawW = cdrawH * (cfw / cfh);
                    ctx.drawImage(this.kenichiCrouchBlockSprite, 0, 0, cfw, cfh, -cdrawW/2 + ox, -cdrawH + oy, cdrawW, cdrawH);
                } else if (st === 'crouchPunch' && this.kenichiCrouchPunchSprite.complete && this.kenichiCrouchPunchSprite.width > 0) {
                    const cfw = this.kenichiCrouchPunchSprite.width;
                    const cfh = this.kenichiCrouchPunchSprite.height;
                    const cdrawH = 155;
                    const cdrawW = cdrawH * (cfw / cfh);
                    ctx.drawImage(this.kenichiCrouchPunchSprite, 0, 0, cfw, cfh, -cdrawW/2 + ox, -cdrawH + oy, cdrawW, cdrawH);
                } else {
                    ctx.drawImage(this.kenichiSprite, c * fw, r * fh, fw, fh, -drawW/2 + ox, -drawH + oy, drawW, drawH);
                }
                
                if (st === 'special') {
                    ctx.filter = 'none';
                }
            }
            ctx.restore();
            return;
        }

        const isKokoro = !!fighter.colors.isKokoro;
        if (isKokoro) {
            if (!this.kokoroSprite) {
                this.kokoroSprite = new Image();
                this.kokoroSprite.src = 'kokoro_sprite.png';
            }
            if (!this.kokoroCrouchKickSprite) {
                this.kokoroCrouchKickSprite = new Image();
                this.kokoroCrouchKickSprite.src = 'kokoro_crouch_kick.png';
            }
            if (!this.kokoroCrouchPunchSprite) {
                this.kokoroCrouchPunchSprite = new Image();
                this.kokoroCrouchPunchSprite.src = 'kokoro_crouch_punch.png';
            }
            if (!this.kokoroCrouchBlockSprite) {
                this.kokoroCrouchBlockSprite = new Image();
                this.kokoroCrouchBlockSprite.src = 'kokoro_crouch_guard.png';
            }
            if (this.kokoroSprite.complete && this.kokoroSprite.width > 0) {
                const cols = 3;
                const rows = 3;
                const fw = this.kokoroSprite.width / cols;
                const fh = this.kokoroSprite.height / rows;
                
                let c = 0, r = 0;
                const st = fighter.state;
                if (st === 'idle') { c = 0; r = 0; }
                else if (st === 'walk') {
                    c = (Math.floor(fighter.stateTimer / 10) % 2 === 0) ? 0 : 1;
                    r = 0;
                }
                else if (st === 'crouch') { c = 2; r = 0; }
                else if (st === 'crouchBlock') { /* Handled separately below */ }
                else if (st === 'punch' || st === 'jumpPunch') { c = 0; r = 1; }
                else if (st === 'crouchPunch') { /* Handled separately below */ }
                else if (st === 'kick' || st === 'jumpKick') { c = 1; r = 1; }
                else if (st === 'crouchKick') { /* Handled separately below */ }
                else if (st === 'jump') { c = 2; r = 1; }
                else if (st === 'hit' || st === 'knockdown' || st === 'lose') { c = 0; r = 2; }
                else if (st === 'block') { c = 1; r = 2; }
                else if (st === 'special' || st === 'win') { c = 2; r = 2; }
                
                let ox = 0, oy = 0;
                if (st === 'idle') oy = Math.sin(fighter.stateTimer * 0.1) * 3;
                if (st === 'walk') {
                    oy = -Math.abs(Math.sin(fighter.stateTimer * 0.2)) * 5;
                    ox = Math.sin(fighter.stateTimer * 0.2) * 2;
                }
                
                
                const drawH = 160; 
                const drawW = drawH * (fw / fh);
                
                if (st === 'special') {
                    ctx.filter = 'drop-shadow(0 0 15px rgba(255, 100, 200, 1)) brightness(1.5)';
                }
                
                if (st === 'crouchKick' && this.kokoroCrouchKickSprite.complete && this.kokoroCrouchKickSprite.width > 0) {
                    const cfw = this.kokoroCrouchKickSprite.width;
                    const cfh = this.kokoroCrouchKickSprite.height;
                    const cdrawH = 170;
                    const cdrawW = cdrawH * (cfw / cfh);
                    ctx.drawImage(this.kokoroCrouchKickSprite, 0, 0, cfw, cfh, -cdrawW/2 + ox, -cdrawH + oy, cdrawW, cdrawH);
                } else if (st === 'crouchPunch' && this.kokoroCrouchPunchSprite.complete && this.kokoroCrouchPunchSprite.width > 0) {
                    const cfw = this.kokoroCrouchPunchSprite.width;
                    const cfh = this.kokoroCrouchPunchSprite.height;
                    const cdrawH = 170;
                    const cdrawW = cdrawH * (cfw / cfh);
                    ctx.drawImage(this.kokoroCrouchPunchSprite, 0, 0, cfw, cfh, -cdrawW/2 + ox, -cdrawH + oy, cdrawW, cdrawH);
                } else if (st === 'crouchBlock' && this.kokoroCrouchBlockSprite.complete && this.kokoroCrouchBlockSprite.width > 0) {
                    const cfw = this.kokoroCrouchBlockSprite.width;
                    const cfh = this.kokoroCrouchBlockSprite.height;
                    const cdrawH = 170;
                    const cdrawW = cdrawH * (cfw / cfh);
                    ctx.drawImage(this.kokoroCrouchBlockSprite, 0, 0, cfw, cfh, -cdrawW/2 + ox, -cdrawH + oy, cdrawW, cdrawH);
                } else {
                    ctx.drawImage(this.kokoroSprite, c * fw, r * fh, fw, fh, -drawW/2 + ox, -drawH + oy, drawW, drawH);
                }
                
                if (st === 'special') {
                    ctx.filter = 'none';
                }
            }
            ctx.restore();
            return;
        }
        
        switch(fighter.state) {
            case 'idle': this.drawFighterIdle(fighter); break;
            case 'walk': this.drawFighterWalk(fighter); break;
            case 'jump': this.drawFighterJump(fighter); break;
            case 'crouch': this.drawFighterCrouch(fighter); break;
            case 'punch': this.drawFighterPunch(fighter); break;
            case 'kick': this.drawFighterKick(fighter); break;
            case 'crouchPunch': this.drawFighterCrouchPunch(fighter); break;
            case 'crouchKick': this.drawFighterCrouchKick(fighter); break;
            case 'jumpPunch': this.drawFighterJumpPunch(fighter); break;
            case 'jumpKick': this.drawFighterJumpKick(fighter); break;
            case 'special': this.drawFighterSpecial(fighter); break;
            case 'hit': this.drawFighterHit(fighter); break;
            case 'knockdown': this.drawFighterKnockdown(fighter); break;
            case 'block': this.drawFighterBlock(fighter); break;
            case 'crouchBlock': this.drawFighterCrouchBlock(fighter); break;
            case 'win': this.drawFighterWin(fighter); break;
            case 'lose': this.drawFighterLose(fighter); break;
            default: this.drawFighterIdle(fighter); break;
        }
        
        ctx.restore();
    }
    
    drawFighterIdle(fighter) {
        const breathe = Math.sin(fighter.stateTimer * 0.08) * 2;
        this.drawBody(fighter, 0, breathe, 0, 0, 0, 0);
    }
    
    drawFighterWalk(fighter) {
        const legSwing = Math.sin(fighter.stateTimer * 0.2) * 20;
        this.drawBody(fighter, 0, -Math.abs(legSwing)*0.2, 0, 0, legSwing, -legSwing);
    }
    
    drawFighterJump(fighter) {
        this.drawBody(fighter, 0, 0, -20, 20, -30, 10, 'jump');
    }
    
    drawFighterCrouch(fighter) {
        this.drawBody(fighter, 0, 40, 0, 0, -40, 40, 'crouch');
    }
    
    drawFighterPunch(fighter) {
        const extend = Math.sin(Math.min(1, fighter.stateTimer / 5) * Math.PI);
        this.drawBody(fighter, 5 * extend, 0, extend * 50, -20, 10, -10, 'punch');
    }
    
    drawFighterKick(fighter) {
        const extend = Math.sin(Math.min(1, fighter.stateTimer / 6) * Math.PI);
        this.drawBody(fighter, -5, 0, -10, -10, extend * 70, -20, 'kick');
    }
    
    drawFighterCrouchPunch(fighter) {
        const extend = Math.sin(Math.min(1, fighter.stateTimer / 5) * Math.PI);
        this.drawBody(fighter, 5 * extend, 40, extend * 40, -10, -40, 40, 'punch');
    }

    drawFighterCrouchKick(fighter) {
        const extend = Math.sin(Math.min(1, fighter.stateTimer / 6) * Math.PI);
        this.drawBody(fighter, 0, 40, -10, -10, extend * 80, 40, 'kick');
    }

    drawFighterJumpPunch(fighter) {
        const extend = Math.sin(Math.min(1, fighter.stateTimer / 5) * Math.PI);
        this.drawBody(fighter, 10, 0, extend * 50, -20, -30, 10, 'punch');
    }

    drawFighterJumpKick(fighter) {
        const extend = Math.sin(Math.min(1, fighter.stateTimer / 6) * Math.PI);
        this.drawBody(fighter, 10, 0, -10, -10, extend * 70, 0, 'kick');
    }

    drawFighterSpecial(fighter) {
        const extend = Math.sin(Math.min(1, fighter.stateTimer / 10) * Math.PI);
        this.drawBody(fighter, 10 * extend, 10, extend * 60, extend * 40, -20, 20, 'special');
    }

    drawFighterHit(fighter) {
        this.drawBody(fighter, -10, 0, -30, -40, -10, -20, 'hit');
    }

    drawFighterKnockdown(fighter) {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(0, -20);
        ctx.rotate(-Math.PI / 2);
        this.drawBody(fighter, 0, 0, -40, -40, 0, 0, 'knockdown');
        ctx.restore();
    }

    drawFighterBlock(fighter) {
        this.drawBody(fighter, -5, 0, 40, 40, -10, 10, 'block');
    }

    drawFighterCrouchBlock(fighter) {
        this.drawBody(fighter, -5, 40, 40, 40, -40, 40, 'block');
    }

    drawFighterWin(fighter) {
        this.drawBody(fighter, 0, 0, 100, 100, 0, 0, 'win');
    }

    drawFighterLose(fighter) {
        this.drawBody(fighter, 0, 30, -20, -20, -40, 40, 'hit');
    }

    drawBody(fighter, bodyOffsetX, bodyOffsetY, frontArmExtend, backArmExtend, frontLegAngle, backLegAngle, pose) {
        const c = fighter.colors;
        const ctx = this.ctx;
        const isKenichi = !!c.glasses;
        
        const headY = -130 + bodyOffsetY;
        const shoulderY = -105 + bodyOffsetY;
        const hipY = -65 + bodyOffsetY;
        const headRadius = isKenichi ? 20 : 18;
        
        const armW = isKenichi ? 16 : 12;
        const armH1 = isKenichi ? 24 : 22;
        const armH2 = isKenichi ? 22 : 20;
        const forearmW = isKenichi ? 14 : 10;
        const fistW = isKenichi ? 16 : 12;
        const fistH = isKenichi ? 14 : 10;
        const legW = isKenichi ? 16 : 14;
        const legH1 = isKenichi ? 27 : 25;
        const legH2 = isKenichi ? 24 : 22;
        
        ctx.fillStyle = c.skin;
        ctx.save();
        ctx.translate(bodyOffsetX - 5, shoulderY);
        if (pose === 'block') {
            ctx.rotate(Math.PI * 0.8);
            ctx.fillRect(-armW/2, 0, armW, armH1);
            ctx.translate(0, armH1);
            ctx.rotate(-Math.PI * 0.6);
            ctx.fillRect(-forearmW/2, 0, forearmW, armH2);
        } else if (pose === 'special') {
            ctx.rotate(-Math.PI * 0.1 + (backArmExtend * 0.01));
            ctx.fillRect(-armW/2, 0, armW, armH1);
            ctx.translate(0, armH1);
            ctx.rotate(Math.PI * 0.4);
            ctx.fillRect(-forearmW/2, 0, forearmW, armH2 + backArmExtend*0.4);
        } else {
            ctx.rotate(Math.PI * 0.15 + (backArmExtend * 0.02));
            ctx.fillRect(-armW/2, 0, armW, armH1);
            ctx.translate(0, armH1);
            ctx.rotate(-Math.PI * 0.3);
            ctx.fillRect(-forearmW/2, 0, forearmW, armH2);
        }
        ctx.fillRect(-fistW/2, armH2 - 4, fistW, fistH);
        ctx.restore();
        
        if (isKenichi) {
            ctx.fillStyle = c.outfit;
            ctx.save();
            ctx.translate(bodyOffsetX - 5, shoulderY);
            ctx.rotate(Math.PI * 0.15 + (backArmExtend * 0.02));
            ctx.fillRect(-armW/2 - 1, -1, armW + 2, 12);
            ctx.restore();
        }
        
        ctx.save();
        ctx.translate(bodyOffsetX - 5, hipY);
        ctx.rotate((backLegAngle || 0) * Math.PI / 180);
        ctx.fillStyle = isKenichi ? c.pants : (c.outfit === '#FFFFFF' ? '#EEEEEE' : c.outfit);
        ctx.fillRect(-legW/2, 0, legW, legH1);
        ctx.translate(0, legH1);
        if (pose === 'crouch' || (pose === 'block' && fighter.isCrouching)) ctx.rotate(Math.PI * 0.4);
        ctx.fillRect(-legW/2 + 1, 0, legW - 2, legH2);
        if (isKenichi) {
            ctx.fillStyle = '#4D4B38';
            ctx.fillRect(-legW/2 + 2, 5, 8, 8);
        }
        ctx.fillStyle = isKenichi ? '#2A2A2A' : '#333';
        if (pose === 'crouch' || (pose === 'block' && fighter.isCrouching)) ctx.rotate(-Math.PI * 0.4);
        ctx.fillRect(-legW/2 - 1, legH2 - 2, legW + 2, 10);
        ctx.restore();
        
        ctx.fillStyle = c.outfit;
        const shoulderW = isKenichi ? 28 : 22;
        const hipW = isKenichi ? 20 : 16;
        ctx.beginPath();
        ctx.moveTo(bodyOffsetX - shoulderW, shoulderY);
        ctx.lineTo(bodyOffsetX + shoulderW, shoulderY);
        ctx.lineTo(bodyOffsetX + hipW, hipY);
        ctx.lineTo(bodyOffsetX - hipW, hipY);
        ctx.closePath();
        ctx.fill();
        
        if (isKenichi) {
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bodyOffsetX, shoulderY + 10);
            ctx.lineTo(bodyOffsetX, hipY - 2);
            ctx.stroke();
            for (let i = 0; i < 3; i++) {
                const ly = shoulderY + 14 + i * 10;
                ctx.beginPath();
                ctx.moveTo(bodyOffsetX - 10, ly);
                ctx.lineTo(bodyOffsetX + 10, ly);
                ctx.stroke();
            }
            ctx.fillStyle = c.skin;
            ctx.beginPath();
            ctx.arc(bodyOffsetX, shoulderY - 2, 10, 0, Math.PI, false);
            ctx.fill();
        }
        
        if (!isKenichi && c.belt) {
            ctx.fillStyle = c.belt;
            ctx.fillRect(bodyOffsetX - hipW - 1, hipY - 8, (hipW + 1) * 2, 6);
        }
        
        ctx.save();
        ctx.translate(bodyOffsetX + 5, hipY);
        ctx.rotate((frontLegAngle || 0) * Math.PI / 180);
        ctx.fillStyle = isKenichi ? c.pants : (c.outfit === '#FFFFFF' ? '#F0F0F0' : c.outfit);
        ctx.fillRect(-legW/2, 0, legW, legH1);
        ctx.translate(0, legH1);
        if (pose === 'kick') { }
        else if (pose === 'crouch' || (pose === 'block' && fighter.isCrouching)) ctx.rotate(Math.PI * 0.4);
        ctx.fillRect(-legW/2 + 1, 0, legW - 2, legH2);
        if (isKenichi) {
            ctx.fillStyle = '#4D4B38';
            ctx.fillRect(legW/2 - 10, 3, 8, 8);
        }
        ctx.fillStyle = isKenichi ? '#2A2A2A' : '#333';
        if (pose === 'crouch' || (pose === 'block' && fighter.isCrouching)) ctx.rotate(-Math.PI * 0.4);
        ctx.fillRect(-legW/2 - 1, legH2 - 2, legW + 2, 10);
        ctx.restore();
        
        ctx.fillStyle = c.skin;
        ctx.save();
        ctx.translate(bodyOffsetX + 5, shoulderY);
        if (pose === 'punch') {
            ctx.rotate(-Math.PI * 0.05);
            ctx.fillRect(-armW/2, 0, armW, armH1);
            ctx.translate(0, armH1);
            ctx.rotate(Math.PI * 0.1);
            const extendLen = armH2 + frontArmExtend * 0.6;
            ctx.fillRect(-forearmW/2, 0, forearmW, extendLen);
            ctx.fillRect(-fistW/2, extendLen - 2, fistW, fistH);
        } else if (pose === 'special') {
            ctx.rotate(-Math.PI * 0.3);
            ctx.fillRect(-armW/2, 0, armW, armH1);
            ctx.translate(0, armH1);
            ctx.rotate(Math.PI * 0.2);
            const extendLen = armH2 + frontArmExtend * 0.6;
            ctx.fillRect(-forearmW/2, 0, forearmW, extendLen);
            ctx.fillRect(-fistW/2, extendLen - 2, fistW, fistH);
        } else if (pose === 'block') {
            ctx.rotate(Math.PI * 0.6);
            ctx.fillRect(-armW/2, 0, armW, armH1);
            ctx.translate(0, armH1);
            ctx.rotate(-Math.PI * 0.8);
            ctx.fillRect(-forearmW/2, 0, forearmW, armH2);
            ctx.fillRect(-fistW/2, armH2 - 4, fistW, fistH);
        } else if (pose === 'win') {
            ctx.rotate(-Math.PI * 0.8);
            ctx.fillRect(-armW/2, 0, armW, armH1);
            ctx.translate(0, armH1);
            ctx.fillRect(-forearmW/2, 0, forearmW, armH2);
            ctx.fillRect(-fistW/2, armH2 - 4, fistW, fistH);
        } else {
            ctx.rotate(-Math.PI * 0.15);
            ctx.fillRect(-armW/2, 0, armW, armH1);
            ctx.translate(0, armH1);
            ctx.rotate(Math.PI * 0.3);
            ctx.fillRect(-forearmW/2, 0, forearmW, armH2);
            ctx.fillRect(-fistW/2, armH2 - 4, fistW, fistH);
        }
        ctx.restore();
        
        if (isKenichi) {
            ctx.fillStyle = c.outfit;
            ctx.save();
            ctx.translate(bodyOffsetX + 5, shoulderY);
            if (pose === 'punch') ctx.rotate(-Math.PI * 0.05);
            else if (pose === 'special') ctx.rotate(-Math.PI * 0.3);
            else if (pose === 'block') ctx.rotate(Math.PI * 0.6);
            else if (pose === 'win') ctx.rotate(-Math.PI * 0.8);
            else ctx.rotate(-Math.PI * 0.15);
            ctx.fillRect(-armW/2 - 1, -1, armW + 2, 12);
            ctx.restore();
        }
        
        if (pose === 'hit') ctx.translate(-10, 5);
        
        ctx.fillStyle = c.hair;
        ctx.beginPath();
        ctx.arc(bodyOffsetX, headY, headRadius + 3, -Math.PI, 0);
        ctx.fill();
        if (isKenichi) {
            for (let i = -3; i <= 3; i++) {
                const sx = bodyOffsetX + i * 6;
                const sy = headY - headRadius - 2;
                const spikeH = 6 + Math.abs(i) * 2 + Math.sin(fighter.stateTimer * 0.05 + i) * 2;
                ctx.fillRect(sx - 2, sy - spikeH, 5, spikeH + 3);
            }
        }
        
        ctx.fillStyle = c.skin;
        ctx.beginPath();
        ctx.arc(bodyOffsetX, headY, headRadius, 0, Math.PI * 2);
        ctx.fill();
        
        if (isKenichi) {
            ctx.fillStyle = c.hair;
            ctx.fillRect(bodyOffsetX + 3, headY - 8, 10, 3);
            ctx.fillRect(bodyOffsetX - 10, headY - 8, 9, 3);
        }
        
        ctx.fillStyle = '#222';
        if (isKenichi) {
            ctx.fillRect(bodyOffsetX + 5, headY - 4, 6, 5);
            ctx.fillRect(bodyOffsetX - 8, headY - 4, 6, 5);
            ctx.fillStyle = '#FFF';
            ctx.fillRect(bodyOffsetX + 8, headY - 3, 2, 2);
            ctx.fillRect(bodyOffsetX - 5, headY - 3, 2, 2);
        } else {
            ctx.fillRect(bodyOffsetX + 5, headY - 4, 7, 4);
        }
        
        if (isKenichi) {
            ctx.strokeStyle = c.glasses;
            ctx.lineWidth = 2;
            ctx.strokeRect(bodyOffsetX + 3, headY - 7, 11, 9);
            ctx.strokeRect(bodyOffsetX - 11, headY - 7, 11, 9);
            ctx.beginPath();
            ctx.moveTo(bodyOffsetX + 3, headY - 3);
            ctx.lineTo(bodyOffsetX, headY - 3);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(bodyOffsetX - 11, headY - 4);
            ctx.lineTo(bodyOffsetX - headRadius + 1, headY - 2);
            ctx.stroke();
        }
        
        if (pose === 'hit' || pose === 'knockdown') {
            ctx.fillStyle = '#222';
            ctx.fillRect(bodyOffsetX + 2, headY + 7, 10, 6);
        } else if (pose === 'special') {
            ctx.fillStyle = '#222';
            ctx.beginPath();
            ctx.arc(bodyOffsetX + 6, headY + 9, 4, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = '#222';
            ctx.fillRect(bodyOffsetX + 4, headY + 7, 8, 2);
        }
        
        if (isKenichi) {
            ctx.fillStyle = 'rgba(40,30,20,0.3)';
            ctx.fillRect(bodyOffsetX + 1, headY + 10, 12, 5);
        }
        
        if (c.headband) {
            ctx.fillStyle = c.headband;
            ctx.fillRect(bodyOffsetX - headRadius - 2, headY - 5, headRadius * 2 + 10, 6);
            ctx.save();
            ctx.translate(bodyOffsetX - headRadius - 2, headY - 2);
            const wave = Math.sin(fighter.stateTimer * 0.1) * 5;
            ctx.fillRect(-15, wave - 3, 15, 5);
            ctx.fillRect(-25, wave + 2, 12, 4);
            ctx.restore();
        }
        
        if (c.mask) {
            ctx.fillStyle = c.mask;
            ctx.beginPath();
            ctx.moveTo(bodyOffsetX - headRadius + 3, headY + 2);
            ctx.lineTo(bodyOffsetX + headRadius - 3, headY + 2);
            ctx.lineTo(bodyOffsetX + headRadius - 5, headY + headRadius);
            ctx.lineTo(bodyOffsetX - headRadius + 5, headY + headRadius);
            ctx.closePath();
            ctx.fill();
        }
        
        if (c.scarf) {
            ctx.fillStyle = c.scarf;
            const scarfWave = Math.sin(fighter.stateTimer * 0.08) * 8;
            ctx.save();
            ctx.translate(bodyOffsetX - 10, shoulderY - 5);
            ctx.fillRect(-5, 0, 10, 8);
            ctx.fillRect(-20, scarfWave, 18, 6);
            ctx.fillRect(-35, scarfWave + 5, 15, 5);
            ctx.restore();
        }
    }
}

class HUD {
    constructor(ctx) { this.ctx = ctx; this.displayedHp = [1000, 1000]; }
    
    draw(player, cpu, timer, roundsToWin) {
        const ctx = this.ctx;
        const barWidth = 450;
        const barHeight = 30;
        const barY = 30;
        
        ctx.font = 'bold 18px Orbitron, sans-serif';
        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'left';
        ctx.fillText(player.name, 60, barY - 5);
        ctx.textAlign = 'right';
        ctx.fillText(cpu.name, CANVAS_W - 60, barY - 5);
        
        ctx.fillStyle = '#333';
        ctx.fillRect(55, barY, barWidth, barHeight); 
        ctx.fillRect(CANVAS_W - 55 - barWidth, barY, barWidth, barHeight); 
        
        const pHpRatio = player.hp / player.maxHp;
        const cHpRatio = cpu.hp / cpu.maxHp;
        
        this.displayedHp[0] += (player.hp - this.displayedHp[0]) * 0.1;
        this.displayedHp[1] += (cpu.hp - this.displayedHp[1]) * 0.1;
        const pDelayRatio = this.displayedHp[0] / player.maxHp;
        const cDelayRatio = this.displayedHp[1] / cpu.maxHp;
        
        ctx.fillStyle = '#AA2222';
        ctx.fillRect(55, barY, barWidth * pDelayRatio, barHeight);
        ctx.fillRect(CANVAS_W - 55 - barWidth * cDelayRatio, barY, barWidth * cDelayRatio, barHeight);
        
        const pGrad = ctx.createLinearGradient(55, barY, 55, barY + barHeight);
        pGrad.addColorStop(0, '#44FF44');
        pGrad.addColorStop(0.5, '#22CC22');
        pGrad.addColorStop(1, '#118811');
        ctx.fillStyle = pGrad;
        ctx.fillRect(55, barY, barWidth * pHpRatio, barHeight);
        
        const cGrad = ctx.createLinearGradient(0, barY, 0, barY + barHeight);
        cGrad.addColorStop(0, '#44FF44');
        cGrad.addColorStop(0.5, '#22CC22');
        cGrad.addColorStop(1, '#118811');
        ctx.fillStyle = cGrad;
        ctx.fillRect(CANVAS_W - 55 - barWidth * cHpRatio, barY, barWidth * cHpRatio, barHeight);
        
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(55, barY, barWidth, barHeight);
        ctx.strokeRect(CANVAS_W - 55 - barWidth, barY, barWidth, barHeight);
        
        const energyBarW = 200;
        const energyBarH = 10;
        const energyY = barY + barHeight + 8;
        
        ctx.fillStyle = '#222';
        ctx.fillRect(55, energyY, energyBarW, energyBarH);
        const eGrad = ctx.createLinearGradient(55, energyY, 55 + energyBarW, energyY);
        eGrad.addColorStop(0, '#0088FF');
        eGrad.addColorStop(1, '#00CCFF');
        ctx.fillStyle = eGrad;
        ctx.fillRect(55, energyY, energyBarW * (player.energy / player.maxEnergy), energyBarH);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.strokeRect(55, energyY, energyBarW, energyBarH);
        
        ctx.fillStyle = '#222';
        ctx.fillRect(CANVAS_W - 55 - energyBarW, energyY, energyBarW, energyBarH);
        ctx.fillStyle = eGrad;
        ctx.fillRect(CANVAS_W - 55 - energyBarW * (cpu.energy / cpu.maxEnergy), energyY, energyBarW * (cpu.energy / cpu.maxEnergy), energyBarH);
        ctx.strokeRect(CANVAS_W - 55 - energyBarW, energyY, energyBarW, energyBarH);
        
        ctx.font = 'bold 48px Orbitron, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'center';
        ctx.fillText(String(Math.ceil(timer)).padStart(2, '0'), CANVAS_W / 2, barY + 38);
        
        if (roundsToWin === Infinity) {
            ctx.font = 'bold 24px Orbitron, sans-serif';
            ctx.fillStyle = '#FFD700';
            ctx.textAlign = 'left';
            ctx.fillText(`WINS: ${player.roundsWon}`, 60, barY + 58);
            ctx.textAlign = 'right';
            ctx.fillText(`WINS: ${cpu.roundsWon}`, CANVAS_W - 60, barY + 58);
        } else {
            for (let i = 0; i < roundsToWin; i++) {
                ctx.beginPath();
                ctx.arc(CANVAS_W/2 - 50 - i * 25, barY + 50, 8, 0, Math.PI * 2);
                ctx.fillStyle = i < player.roundsWon ? '#FFD700' : '#555';
                ctx.fill();
                ctx.strokeStyle = '#FFF';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            for (let i = 0; i < roundsToWin; i++) {
                ctx.beginPath();
                ctx.arc(CANVAS_W/2 + 50 + i * 25, barY + 50, 8, 0, Math.PI * 2);
                ctx.fillStyle = i < cpu.roundsWon ? '#FFD700' : '#555';
                ctx.fill();
                ctx.strokeStyle = '#FFF';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
        
        if (player.comboCount >= 2) {
            ctx.font = 'bold 36px Orbitron';
            ctx.fillStyle = '#FF6600';
            ctx.textAlign = 'left';
            ctx.fillText(`${player.comboCount} HIT COMBO!`, 60, CANVAS_H - 80);
        }
        if (cpu.comboCount >= 2) {
            ctx.font = 'bold 36px Orbitron';
            ctx.fillStyle = '#FF6600';
            ctx.textAlign = 'right';
            ctx.fillText(`${cpu.comboCount} HIT COMBO!`, CANVAS_W - 60, CANVAS_H - 80);
        }
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) return; 
        this.ctx = this.canvas.getContext('2d');
        this.state = 'title'; 
        this.difficulty = 'normal';
        this.round = 1;
        this.roundsToWin = 2;
        this.timer = ROUND_TIME;
        this.timerInterval = null;
        
        this.player = new Fighter(RYUJI_CONFIG);
        this.cpu = new Fighter(KAGE_CONFIG);
        this.playerController = new PlayerController();
        this.cpuController = null;
        this.renderer = new Renderer(this.ctx);
        this.hud = new HUD(this.ctx);
        this.effects = new EffectManager();
        this.sound = new SoundManager();
        
        this.setupUI();
        this.menuParticleInterval = null;
        this.setupMenuParticles();
        this.showScreen('title');
        this.gameLoop();
    }
    
    setupUI() {
        this.menuButtons = {
            title: ['btn-start', 'btn-controls'],
            controls: ['btn-back-from-controls'],
            round: ['round-1', 'round-2', 'round-3', 'round-Infinity', 'btn-back-to-title-from-round'],
            difficulty: ['difficulty-very_easy', 'difficulty-easy', 'difficulty-normal', 'difficulty-hard', 'difficulty-kishin', 'btn-back-title'],
            matchResult: ['btn-rematch', 'btn-to-title'],
            paused: ['btn-resume', 'btn-quit']
        };
        this.focusIndex = 0;
        
        document.querySelectorAll('.round-btn').forEach(btn => {
            btn.id = 'round-' + btn.dataset.rounds;
            btn.onclick = () => {
                this.roundsToWin = btn.dataset.rounds === 'Infinity' ? Infinity : parseInt(btn.dataset.rounds);
                this.showScreen('difficulty');
            };
        });
        
        const btnBackToTitleRound = document.getElementById('btn-back-to-title-from-round');
        if (btnBackToTitleRound) btnBackToTitleRound.onclick = () => this.showScreen('title');
        
        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            btn.id = 'difficulty-' + btn.dataset.difficulty;
            btn.onclick = () => {
                this.difficulty = btn.dataset.difficulty;
                this.sound.currentDifficulty = this.difficulty;
                this.startMatch();
            };
        });
        
        const btnStart = document.getElementById('btn-start');
        if (btnStart) btnStart.onclick = () => this.showScreen('round');
        
        const btnControls = document.getElementById('btn-controls');
        if (btnControls) btnControls.onclick = () => this.showScreen('controls');
        
        const btnBackFromControls = document.getElementById('btn-back-from-controls');
        if (btnBackFromControls) btnBackFromControls.onclick = () => this.showScreen('title');
        
        const btnBackTitle = document.getElementById('btn-back-title');
        if (btnBackTitle) btnBackTitle.onclick = () => this.showScreen('round');
        
        const btnRematch = document.getElementById('btn-rematch');
        if (btnRematch) btnRematch.onclick = () => this.startMatch();
        
        const btnToTitle = document.getElementById('btn-to-title');
        if (btnToTitle) btnToTitle.onclick = () => this.showScreen('title');
        
        const btnResume = document.getElementById('btn-resume');
        if (btnResume) btnResume.onclick = () => this.resume();
        
        const btnQuit = document.getElementById('btn-quit');
        if (btnQuit) btnQuit.onclick = () => this.showScreen('title');

        const btnMute = document.getElementById('btn-mute');
        if (btnMute) {
            btnMute.onclick = () => {
                const muted = this.sound.toggleMute();
                btnMute.textContent = muted ? '🔇' : '🔊';
                btnMute.classList.toggle('muted', muted);
            };
        }

        this.bindMenuControls();
    }

    bindMenuControls() {
        const checkTitleAudio = () => {
            if (this.state === 'title' && this.sound.titleBgm.paused) {
                this.sound.playTitleBGM();
            }
        };
        document.addEventListener('click', checkTitleAudio, {once: true});
        document.addEventListener('keydown', checkTitleAudio, {once: true});
        
        window.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if (this.state === 'fighting' || this.state === 'roundIntro' || this.state === 'roundResult') this.pause();
                else if (this.state === 'paused') this.resume();
                else if (this.state === 'controls' || this.state === 'round') {
                    this.sound.playConfirm();
                    this.showScreen('title');
                }
                else if (this.state === 'difficulty') {
                    this.sound.playConfirm();
                    this.showScreen('round');
                }
            }
            
            const btns = this.menuButtons[this.state];
            if (!btns || btns.length === 0) return;
            
            const keyLower = e.key.toLowerCase();
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || keyLower === 's' || keyLower === 'd') {
                e.preventDefault();
                this.focusIndex = (this.focusIndex + 1) % btns.length;
                this.updateMenuFocus();
                this.sound.playCursor();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || keyLower === 'w' || keyLower === 'a') {
                e.preventDefault();
                this.focusIndex = (this.focusIndex - 1 + btns.length) % btns.length;
                this.updateMenuFocus();
                this.sound.playCursor();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const btnId = btns[this.focusIndex];
                const btn = document.getElementById(btnId);
                if (btn) {
                    this.sound.playConfirm();
                    btn.click();
                }
            }
        });
        
        document.querySelectorAll('.menu-btn').forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                const btns = this.menuButtons[this.state];
                if (!btns) return;
                const idx = btns.indexOf(btn.id);
                if (idx !== -1) {
                    this.focusIndex = idx;
                    this.updateMenuFocus();
                    this.sound.playCursor();
                }
            });
            btn.addEventListener('click', () => {
                this.sound.playConfirm();
            });
        });
    }
    
    updateMenuFocus() {
        document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('focused'));
        const btns = this.menuButtons[this.state];
        if (btns && btns.length > 0) {
            const btn = document.getElementById(btns[this.focusIndex]);
            if (btn) btn.classList.add('focused');
        }
    }
    
    showScreen(screen) {
        document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('focused'));
        this.state = screen;
        
        const menuBg = document.getElementById('menu-background');
        const controlsHint = document.getElementById('controls-hint');
        if (['title', 'controls', 'round', 'difficulty'].includes(screen)) {
            if (menuBg) menuBg.classList.add('active');
            if (controlsHint) controlsHint.classList.remove('in-game');
            this.startMenuParticles();
        } else {
            if (menuBg) menuBg.classList.remove('active');
            if (controlsHint) controlsHint.classList.add('in-game');
            this.stopMenuParticles();
        }
        
        if (screen === 'title') {
            this.sound.stopBGM(false);
            this.sound.playTitleBGM();
        }
        
        switch(screen) {
            case 'title': {
                const el = document.getElementById('title-screen');
                if(el) el.classList.add('active'); 
                break;
            }
            case 'controls': {
                const el = document.getElementById('controls-screen');
                if(el) el.classList.add('active');
                break;
            }
            case 'round': {
                const el = document.getElementById('round-screen');
                if(el) el.classList.add('active');
                break;
            }
            case 'difficulty': {
                const el = document.getElementById('difficulty-screen');
                if(el) el.classList.add('active');
                break;
            }
            case 'paused': {
                const el = document.getElementById('pause-screen');
                if(el) el.classList.add('active');
                break;
            }
        }
        
        this.focusIndex = 0;
        this.updateMenuFocus();
    }
    
    setupMenuParticles() {
        const menuBg = document.getElementById('menu-background');
        if (!menuBg) return;
        this.menuParticleContainer = document.createElement('div');
        this.menuParticleContainer.className = 'menu-particles';
        menuBg.appendChild(this.menuParticleContainer);
    }
    
    spawnMenuParticle() {
        if (!this.menuParticleContainer) return;
        
        const particle = document.createElement('div');
        particle.className = 'menu-particle';
        
        // ランダムなサイズ（2〜6px）
        const size = 2 + Math.random() * 4;
        // 開始位置: 下端付近から湧き上がる
        const startFromBottom = Math.random() < 0.7;
        let startX, startY;
        if (startFromBottom) {
            startX = Math.random() * 100;
            startY = 100 + Math.random() * 5;
        } else {
            startX = 100 + Math.random() * 5;
            startY = 40 + Math.random() * 60;
        }
        
        // 斜め上方向への移動量
        const travel = 600 + Math.random() * 300; // 縦方向の移動距離（上向き）
        const drift = -(100 + Math.random() * 200);  // 横方向のドリフト（左向き）
        const duration = 4 + Math.random() * 6;     // 4〜10秒
        
        // 色のバリエーション（暖色系の発光）
        const colors = [
            'rgba(255, 180, 100, 0.8)',  // アンバー
            'rgba(255, 140, 60, 0.7)',   // オレンジ
            'rgba(255, 220, 150, 0.9)',  // ウォームイエロー
            'rgba(255, 100, 60, 0.6)',   // レッドオレンジ
            'rgba(255, 200, 180, 0.7)',  // ピーチ
            'rgba(200, 160, 255, 0.5)',  // 淡いパープル
        ];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const glowColor = color.replace(/[\d.]+\)$/, '0.6)');
        
        particle.style.cssText = `
            left: ${startX}%;
            top: ${startY}%;
            width: ${size}px;
            height: ${size}px;
            background: ${color};
            box-shadow: 0 0 ${size * 2}px ${size}px ${glowColor},
                        0 0 ${size * 4}px ${size * 1.5}px ${glowColor};
            --drift: ${drift}px;
            --travel: ${travel}px;
            animation-duration: ${duration}s;
        `;
        
        this.menuParticleContainer.appendChild(particle);
        
        // アニメーション終了後に削除
        particle.addEventListener('animationend', () => {
            particle.remove();
        });
    }
    
    startMenuParticles() {
        if (this.menuParticleInterval) return; // 既に動作中
        
        // 初回にいくつかすぐ生成（画面が寂しくないように）
        for (let i = 0; i < 12; i++) {
            setTimeout(() => this.spawnMenuParticle(), i * 200);
        }
        
        // 定期的に新しいパーティクルを生成
        this.menuParticleInterval = setInterval(() => {
            this.spawnMenuParticle();
        }, 400);
    }
    
    stopMenuParticles() {
        if (this.menuParticleInterval) {
            clearInterval(this.menuParticleInterval);
            this.menuParticleInterval = null;
        }
        // 既存のパーティクルはアニメーション終了後に自然消滅
    }
    
    startMatch() {
        this.sound.stopTitleBGM(true);
        this.cpuController = new CPUController(this.difficulty);
        this.player.roundsWon = 0;
        this.cpu.roundsWon = 0;
        this.round = 1;
        this.startRound();
    }
    
    startRound() {
        this.player.reset(350);
        this.cpu.reset(930);
        this.cpu.facing = -1;
        this.hud.displayedHp = [this.player.maxHp, this.cpu.maxHp];
        this.effects.particles = [];
        this.effects.screenShake.duration = 0;
        
        this.showScreen('roundIntro');
        const introEl = document.getElementById('round-intro');
        if (introEl) introEl.classList.add('active');
        
        const roundText = document.getElementById('round-text');
        const fightText = document.getElementById('fight-text');
        if (roundText) {
            roundText.textContent = `ROUND ${this.round}`;
            roundText.style.animation = 'none';
        }
        if (fightText) {
            fightText.style.animation = 'none';
            fightText.style.opacity = '0';
        }
        
        this.introTimer = 0;
    }
    
    endRound() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.state = 'roundResult';
        
        let winner;
        if (this.player.hp <= 0) winner = 'cpu';
        else if (this.cpu.hp <= 0) winner = 'player';
        else winner = this.player.hp >= this.cpu.hp ? 'player' : 'cpu';
        
        if (winner === 'player') {
            this.player.roundsWon++;
            this.player.setState('win');
            this.cpu.setState('lose');
        } else {
            this.cpu.roundsWon++;
            this.cpu.setState('win');
            this.player.setState('lose');
        }
        
        const resultEl = document.getElementById('round-result');
        const resultText = document.getElementById('result-text');
        if (resultText) resultText.textContent = (this.player.hp <= 0 || this.cpu.hp <= 0) ? 'K.O.' : 'TIME UP';
        if (resultEl) resultEl.classList.add('active');
        this.sound.playKO();
        this.effects.triggerShake(10, 30);
        
        const winnerFighter = winner === 'player' ? this.player : this.cpu;
        this.effects.spawnVictoryEffect(winnerFighter.x, winnerFighter.y - 70);
        
        this.resultTimer = 0;
    }
    
    endMatch() {
        this.state = 'matchResult';
        this.sound.stopBGM(true);
        const isPlayerWin = this.player.roundsWon >= this.roundsToWin;
        
        const matchEl = document.getElementById('match-result');
        const winnerText = document.getElementById('winner-text');
        const statsEl = document.getElementById('match-stats');
        
        if (winnerText) {
            winnerText.textContent = isPlayerWin ? 'YOU WIN!' : 'YOU LOSE...';
            winnerText.style.color = isPlayerWin ? '#FFD700' : '#6688CC';
        }
        
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="stat-line">ROUND ${this.round}</div>
                <div class="stat-line">Difficulty: ${this.difficulty.toUpperCase()}</div>
            `;
        }
        
        if (matchEl) matchEl.classList.add('active');
        
        if (isPlayerWin) {
            this.effects.spawnVictoryEffect(CANVAS_W/2, CANVAS_H/2);
        }
        
        this.focusIndex = 0;
        this.updateMenuFocus();
    }
    
    pause() {
        this.prevState = this.state;
        this.state = 'paused';
        this.sound.pauseBGM();
        const el = document.getElementById('pause-screen');
        if (el) el.classList.add('active');
        this.focusIndex = 0;
        this.updateMenuFocus();
    }
    
    resume() {
        const el = document.getElementById('pause-screen');
        if (el) el.classList.remove('active');
        this.state = this.prevState || 'fighting';
        
        if (!(this.state === 'roundIntro' && this.round === 1)) {
            this.sound.resumeBGM();
        }
    }
    
    checkCollisions() {
        this.checkAttackHit(this.player, this.cpu);
        this.checkAttackHit(this.cpu, this.player);
        this.checkProjectileHits();
        
        const overlap = this.getBodyOverlap(this.player, this.cpu);
        if (overlap > 0) {
            const push = overlap / 2;
            if (this.player.x < this.cpu.x) {
                this.player.x -= push;
                this.cpu.x += push;
            } else {
                this.player.x += push;
                this.cpu.x -= push;
            }
        }
    }
    
    checkAttackHit(attacker, defender) {
        if (attacker.attackHitConnected) return; 
        const atkData = attacker.getAttackData();
        if (!atkData) return;
        
        if (atkData.isSpecial) {
            if (attacker.stateTimer === atkData.startup) {
                
                this.effects.spawnSpecialEffect(attacker.x + 50 * attacker.facing, attacker.y - 70, atkData.color, attacker.facing, attacker);
                this.sound.playSpecial();
            }
            return; 
        }

        const hitbox = attacker.getHitbox();
        if (!hitbox) return;
        const hurtbox = defender.getHurtbox();
        
        if (this.rectOverlap(hitbox, hurtbox)) {
            attacker.attackHitConnected = true;
            
            const isOverhead = (attacker.state === 'jumpPunch' || attacker.state === 'jumpKick');
            const isLow = (attacker.state === 'crouchPunch' || attacker.state === 'crouchKick');
            const result = defender.takeDamage(
                atkData.damage * (1 + attacker.comboCount * 0.1), 
                atkData.knockback,
                false,
                isOverhead,
                isLow
            );
            
            attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + 5);
            
            if (result === 'hit') {
                attacker.comboCount++;
                attacker.comboTimer = 60;
                
                const hitX = (hitbox.x + hitbox.w/2 + hurtbox.x + hurtbox.w/2) / 2;
                const hitY = (hitbox.y + hitbox.h/2 + hurtbox.y + hurtbox.h/2) / 2;
                this.effects.spawnHitSparks(hitX, hitY, 1);
                
                if (atkData.damage >= 80) {
                    this.effects.triggerShake(5, 10);
                    this.sound.playKick();
                } else {
                    this.sound.playPunch();
                }
                
                if (defender.hp <= 0) {
                    this.endRound();
                }
            } else if (result === 'blocked') {
                const hitX = (hitbox.x + hurtbox.x) / 2;
                const hitY = (hitbox.y + hurtbox.y) / 2;
                this.effects.spawnBlockSparks(hitX, hitY);
                this.sound.playBlock();
            }
        }
    }
    
    checkProjectileHits() {
        for (let p of this.effects.particles) {
            if (p.type === 'special_proj' && p.owner && !p.hitConnected) {
                const defender = p.owner === this.player ? this.cpu : this.player;
                const hitbox = {x: p.x - p.size/2, y: p.y - p.size/2, w: p.size, h: p.size};
                const hurtbox = defender.getHurtbox();
                
                if (this.rectOverlap(hitbox, hurtbox)) {
                    p.hitConnected = true;
                    
                    const atkData = p.owner.attacks['special'];
                    const result = defender.takeDamage(atkData.damage, atkData.knockback, true);
                    p.owner.energy = Math.min(p.owner.maxEnergy, p.owner.energy + 5);
                    
                    if (result === 'hit') {
                        p.owner.comboCount++;
                        p.owner.comboTimer = 60;
                        this.effects.spawnHitSparks(p.x, p.y, 3);
                        this.effects.triggerShake(12, 20);
                        this.sound.playSpecial();
                        if (defender.hp <= 0) this.endRound();
                    } else if (result === 'blocked') {
                        this.effects.spawnBlockSparks(p.x, p.y);
                        this.sound.playBlock();
                    }
                    p.life = 0; 
                }
            }
        }
    }
    
    rectOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }
    
    getBodyOverlap(a, b) {
        const aLeft = a.x - a.width/2;
        const aRight = a.x + a.width/2;
        const bLeft = b.x - b.width/2;
        const bRight = b.x + b.width/2;
        return Math.max(0, Math.min(aRight, bRight) - Math.max(aLeft, bLeft));
    }
    
    gameLoop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }
    
    update() {
        if (this.state === 'roundIntro') {
            if (this.introTimer === 0) {
                const roundText = document.getElementById('round-text');
                if (roundText) roundText.style.animation = 'slideInLeft 0.5s ease-out forwards';
                this.sound.playRoundBell();
            }
            this.introTimer++;
            
            if (this.introTimer === 72) {
                const fightText = document.getElementById('fight-text');
                if (fightText) {
                    fightText.style.opacity = '1';
                    fightText.style.animation = 'zoomIn 0.5s ease-out forwards';
                }
            }
            
            if (this.introTimer >= 132) {
                const introEl = document.getElementById('round-intro');
                if (introEl) introEl.classList.remove('active');
                this.state = 'fighting';
                this.timer = ROUND_TIME;
                
                if (this.round === 1) this.sound.playBGM();
                if (this.timerInterval) clearInterval(this.timerInterval);
                this.timerInterval = setInterval(() => {
                    if (this.state === 'fighting') {
                        this.timer -= 1;
                        if (this.timer <= 0) {
                            this.timer = 0;
                            this.endRound();
                        }
                    }
                }, 1000);
            }
            return;
        }

        if (this.state === 'roundResult') {
            this.resultTimer++;
            if (this.resultTimer >= 150) { // 2.5s @ 60fps
                const resultEl = document.getElementById('round-result');
                if (resultEl) resultEl.classList.remove('active');
                
                if (this.player.roundsWon >= this.roundsToWin || this.cpu.roundsWon >= this.roundsToWin) {
                    this.endMatch();
                } else {
                    this.round++;
                    this.startRound();
                }
            }
            return;
        }

        if (this.state !== 'fighting') return;
        
        /*
        const vPressed = this.playerController.keys['v'];
        if (vPressed && !this.vWasPressed) {
            this.isAntigravityMode = !this.isAntigravityMode;
            if (this.isAntigravityMode && !this.antigravityController) {
                this.antigravityController = new CPUController('kishin');
            }
            if (this.isAntigravityMode) {
                this.sound.playConfirm();
            }
        }
        this.vWasPressed = vPressed;
        
        if (this.isAntigravityMode && this.antigravityController) {
            this.antigravityController.update(this.player, this.cpu, this.effects);
        } else {
            this.playerController.update(this.player);
        }
        */
        
        this.playerController.update(this.player);
        
        this.cpuController.update(this.cpu, this.player, this.effects, this.sound);
        this.player.update(this.cpu);
        this.cpu.update(this.player);
        this.checkCollisions();
        this.effects.update();
    }
    
    draw() {
        const ctx = this.ctx;
        if (!ctx) return;
        const shake = this.effects.getShakeOffset();
        
        ctx.save();
        ctx.translate(shake.x, shake.y);
        
        this.renderer.drawBackground();
        
        this.renderer.drawFighter(this.player);
        this.renderer.drawFighter(this.cpu);
        
        this.effects.draw(ctx);
        
        ctx.restore();
        
        if (this.state === 'fighting' || this.state === 'roundResult') {
            this.hud.draw(this.player, this.cpu, this.timer, this.roundsToWin);
        }
    }
}

window.addEventListener('load', () => {
    const game = new Game();
});
