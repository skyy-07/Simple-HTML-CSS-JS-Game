// Cosmic Miner - HTML5 Canvas Game
// Nil-deps, procedural art, responsive fit

(() => {
  // Config
  const CONFIG = {
    width: 800,
    height: 600,
    initialLives: 3,
    crystalSpawnMs: 2000,
    initialAsteroids: 3,
    difficultyIntervalMs: 30000,
    ship: { speed: 5, size: 20, invFrames: 120 }, // 120 frames ~2s at 60fps
    asteroidTypes: [
      { size: 30, speed: 2 },
      { size: 45, speed: 1.5 },
      { size: 60, speed: 1.0 }
    ],
    crystalTypes: [
      { color: "blue", points: 10, size: 15 },
      { color: "purple", points: 20, size: 18 },
      { color: "green", points: 15, size: 16 }
    ]
  };

  // Canvas
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // UI
  const hudScore = document.getElementById("score");
  const hudLevel = document.getElementById("level");
  const hudLives = document.getElementById("lives");

  const menu = document.getElementById("menu");
  const pauseOverlay = document.getElementById("pause");
  const gameoverOverlay = document.getElementById("gameover");
  const btnPlay = document.getElementById("btnPlay");
  const btnResume = document.getElementById("btnResume");
  const btnRestart = document.getElementById("btnRestart");
  const finalScoreEl = document.getElementById("finalScore");

  // State
  const STATE = {
    running: false,
    paused: false,
    over: false,
    score: 0,
    lives: CONFIG.initialLives,
    level: 1,
    tick: 0,
    lastCrystalMs: 0,
    lastDifficultyMs: 0,
  };

  // Input
  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
    keys.add(e.code);
    if (e.code === "Space") togglePause();
    if (e.code === "Enter" && STATE.over) restart();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  // Entities
  const entities = {
    ship: null,
    asteroids: [],
    crystals: [],
    particles: []
  };

  // Utility
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => Math.random() * (b - a) + a;
  const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function reset() {
    STATE.running = false;
    STATE.paused = false;
    STATE.over = false;
    STATE.score = 0;
    STATE.lives = CONFIG.initialLives;
    STATE.level = 1;
    STATE.tick = 0;
    STATE.lastCrystalMs = 0;
    STATE.lastDifficultyMs = 0;
    entities.asteroids.length = 0;
    entities.crystals.length = 0;
    entities.particles.length = 0;
    entities.ship = new Ship(CONFIG.width / 2, CONFIG.height * 0.75);
    for (let i = 0; i < CONFIG.initialAsteroids; i++) {
      spawnAsteroid(true);
    }
    updateHUD();
  }

  class Ship {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.size = CONFIG.ship.size;
      this.speed = CONFIG.ship.speed;
      this.inv = 0;
      this.blink = 0;
    }
    update() {
      let dx = 0, dy = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) dy -= 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) dy += 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) dx -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) dx += 1;
      if (dx !== 0 || dy !== 0) {
        const mag = Math.hypot(dx, dy);
        dx /= mag; dy /= mag;
        this.x += dx * this.speed;
        this.y += dy * this.speed;
      }
      this.x = clamp(this.x, this.size, CONFIG.width - this.size);
      this.y = clamp(this.y, this.size, CONFIG.height - this.size);

      if (this.inv > 0) {
        this.inv--;
        this.blink = (this.blink + 1) % 10;
      }
    }
    draw(ctx) {
      // Futuristic triangular ship with neon outline
      const s = this.size;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.atan2(mouse.y - this.y, mouse.x - this.x) + Math.PI/2);
      if (this.inv > 0 && this.blink < 5) { ctx.globalAlpha = 0.4; }
      // Glow
      ctx.shadowColor = "#7af0ff";
      ctx.shadowBlur = 12;
      // Body
      ctx.fillStyle = "#1a234a";
      ctx.strokeStyle = "#7af0ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -s);       // tip
      ctx.lineTo(s*0.7, s);    // right
      ctx.lineTo(0, s*0.6);    // bottom mid
      ctx.lineTo(-s*0.7, s);   // left
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Cockpit
      ctx.shadowBlur = 0;
      const grad = ctx.createLinearGradient(0,-s,0,s);
      grad.addColorStop(0,"#9be7ff");
      grad.addColorStop(1,"#3b6bb8");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, -s*0.3, s*0.25, s*0.35, 0, 0, Math.PI*2);
      ctx.fill();
      // Thruster
      const flame = Math.sin(STATE.tick/5)*4 + 8;
      const thrGrad = ctx.createLinearGradient(0,s*0.6,0,s*0.6+flame);
      thrGrad.addColorStop(0,"#7af0ff");
      thrGrad.addColorStop(1,"#00ffc6");
      ctx.fillStyle = thrGrad;
      ctx.beginPath();
      ctx.moveTo(-s*0.2, s*0.6);
      ctx.lineTo(0, s*0.6 + flame);
      ctx.lineTo(s*0.2, s*0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    hit() {
      if (this.inv > 0) return;
      STATE.lives--;
      spawnExplosion(this.x, this.y, "#ff5f7a");
      if (STATE.lives <= 0) {
        gameOver();
      } else {
        // Respawn invincibility
        this.inv = CONFIG.ship.invFrames;
        this.x = CONFIG.width / 2;
        this.y = CONFIG.height * 0.75;
      }
      updateHUD();
    }
    bounds() {
      const r = this.size * 0.8;
      return { x: this.x, y: this.y, r };
    }
  }

  class Asteroid {
    constructor(x, y, vx, vy, size, wave=false) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.size = size;
      this.wave = wave;
      this.phase = rand(0, Math.PI*2);
      this.hp = Math.ceil(size/30);
      this.rot = rand(0, Math.PI*2);
      this.spin = rand(-0.02, 0.02);
      // color variation
      this.hue = choice([20,30,40,0]);
      this.light = choice([30,35,40]);
    }
    update() {
      this.rot += this.spin;
      if (this.wave) {
        this.x += this.vx + Math.sin(STATE.tick/30 + this.phase) * 0.9;
        this.y += this.vy + Math.cos(STATE.tick/45 + this.phase) * 0.6;
      } else {
        this.x += this.vx; this.y += this.vy;
      }
      // wrap
      if (this.x < -this.size-20) this.x = CONFIG.width + this.size+20;
      if (this.x > CONFIG.width + this.size+20) this.x = -this.size-20;
      if (this.y < -this.size-20) this.y = CONFIG.height + this.size+20;
      if (this.y > CONFIG.height + this.size+20) this.y = -this.size-20;
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      const s = this.size;
      // rocky polygon
      ctx.fillStyle = `hsl(${this.hue} 30% ${this.light}%)`;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const verts = 10;
      for (let i=0;i<verts;i++){
        const ang = (i/verts)*Math.PI*2;
        const rad = s * (0.7 + Math.sin(i*1.7 + this.phase)*0.18 + Math.random()*0.06);
        const px = Math.cos(ang)*rad;
        const py = Math.sin(ang)*rad;
        i===0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    bounds() {
      return { x: this.x, y: this.y, r: this.size*0.8 };
    }
  }

  class Crystal {
    constructor(x, y, type) {
      this.x = x; this.y = y; this.type = type;
      this.t = 0;
      this.spin = rand(-0.03,0.03);
      this.rot = rand(0, Math.PI*2);
    }
    update() {
      this.t++;
      this.rot += this.spin;
      this.y += Math.sin(this.t/40)*0.2;
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      const s = this.type.size;
      const colorMap = { blue:"#6ecbff", purple:"#b08cff", green:"#6bffc6" };
      const glowMap = { blue:"#82e6ff", purple:"#d3b6ff", green:"#9effe0" };
      ctx.shadowColor = glowMap[this.type.color] || "#9ff";
      ctx.shadowBlur = 12;
      ctx.fillStyle = colorMap[this.type.color] || "#9ff";
      ctx.strokeStyle = "rgba(255,255,255,.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      // diamond shape
      ctx.moveTo(0, -s);
      ctx.lineTo(s*0.7, -s*0.2);
      ctx.lineTo(0, s);
      ctx.lineTo(-s*0.7, -s*0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // inner shine
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(0, -s*0.5, s*0.25, s*0.12, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    bounds(){ return { x:this.x, y:this.y, r:this.type.size*0.65 }; }
  }

  class Particle {
    constructor(x,y, color, life=40, speed=rand(1,3)) {
      this.x=x; this.y=y; this.life=life; this.t=0; this.color=color;
      const ang = rand(0, Math.PI*2);
      this.vx = Math.cos(ang)*speed;
      this.vy = Math.sin(ang)*speed;
      this.size = rand(1,3);
    }
    update(){
      this.t++;
      this.x += this.vx; this.y += this.vy;
    }
    draw(ctx){
      const a = 1 - this.t/this.life;
      if (a <= 0) return;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x, this.y, this.size, this.size);
      ctx.restore();
    }
    dead(){ return this.t >= this.life; }
  }

  // Mouse (for ship orientation only, optional)
  const mouse = { x: CONFIG.width/2, y: CONFIG.height/2 };
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mouse.x = (e.clientX - rect.left) * scaleX;
    mouse.y = (e.clientY - rect.top) * scaleY;
  });

  // Spawners
  function spawnAsteroid(offscreen=false){
    const t = choice(CONFIG.asteroidTypes);
    let x,y;
    if (offscreen){
      const edge = Math.floor(rand(0,4));
      if (edge===0){ x = -t.size-20; y = rand(0, CONFIG.height); }
      if (edge===1){ x = CONFIG.width + t.size+20; y = rand(0, CONFIG.height); }
      if (edge===2){ x = rand(0, CONFIG.width); y = -t.size-20; }
      if (edge===3){ x = rand(0, CONFIG.width); y = CONFIG.height + t.size+20; }
    } else {
      x = rand(0, CONFIG.width); y = rand(0, CONFIG.height*0.5);
    }
    const angle = Math.atan2(CONFIG.height/2 - y, CONFIG.width/2 - x) + rand(-0.7,0.7);
    const speed = t.speed + rand(-0.3,0.3) + STATE.level*0.1;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const wave = Math.random() < Math.min(0.4, 0.15 + STATE.level*0.03);
    entities.asteroids.push(new Asteroid(x,y,vx,vy,t.size,wave));
  }

  function spawnCrystal(){
    const type = choice(CONFIG.crystalTypes);
    const margin = 40;
    const x = rand(margin, CONFIG.width - margin);
    const y = rand(margin, CONFIG.height - margin*2);
    entities.crystals.push(new Crystal(x,y,type));
  }

  function spawnExplosion(x,y, color){
    for (let i=0;i<30;i++){
      entities.particles.push(new Particle(x,y,color, rand(28,48), rand(1,4)));
    }
  }
  function spawnSparkle(x,y, color){
    for (let i=0;i<18;i++){
      entities.particles.push(new Particle(x,y,color, rand(18,30), rand(0.8,2.5)));
    }
  }

  // Collision
  function hit(a,b){
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const rr = a.r + b.r;
    return dx*dx + dy*dy <= rr*rr;
  }

  // HUD
  function updateHUD(){
    hudScore.textContent = `Score: ${STATE.score}`;
    hudLevel.textContent = `Level: ${STATE.level}`;
    // Lives hearts
    hudLives.innerHTML = "";
    for (let i=0;i<CONFIG.initialLives;i++){
      const div = document.createElement("div");
      div.className = "heart" + (i < STATE.lives ? "" : " empty");
      hudLives.appendChild(div);
    }
  }

  // Flow
  function start(){
    menu.classList.remove("visible");
    STATE.running = true;
    STATE.paused = false;
    STATE.over = false;
  }
  function togglePause(){
    if (!STATE.running || STATE.over) return;
    STATE.paused = !STATE.paused;
    pauseOverlay.classList.toggle("visible", STATE.paused);
  }
  function gameOver(){
    STATE.over = true;
    STATE.running = false;
    finalScoreEl.textContent = `Final Score: ${STATE.score}`;
    gameoverOverlay.classList.add("visible");
  }
  function restart(){
    gameoverOverlay.classList.remove("visible");
    reset();
    start();
  }

  // Buttons
  btnPlay.addEventListener("click", () => { reset(); start(); });
  btnResume.addEventListener("click", () => togglePause());
  btnRestart.addEventListener("click", () => restart());

  // Timing
  let lastTime = performance.now();
  function loop(now){
    const dt = now - lastTime;
    lastTime = now;
    if (!STATE.paused && STATE.running) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt){
    STATE.tick++;
    // Difficulty ramp
    if (performance.now() - STATE.lastDifficultyMs >= CONFIG.difficultyIntervalMs){
      STATE.lastDifficultyMs = performance.now();
      STATE.level++;
      // add more asteroids on level up
      for (let i=0;i<1+Math.min(STATE.level,3);i++) spawnAsteroid(true);
      updateHUD();
    }
    // Spawn crystals
    if (performance.now() - STATE.lastCrystalMs >= CONFIG.crystalSpawnMs){
      STATE.lastCrystalMs = performance.now();
      spawnCrystal();
    }

    // Update entities
    entities.ship.update();
    entities.asteroids.forEach(a => a.update());
    entities.crystals.forEach(c => c.update());
    entities.particles.forEach(p => p.update());
    // Clean particles
    entities.particles = entities.particles.filter(p => !p.dead());

    // Collisions: ship-asteroid
    const sb = entities.ship.bounds();
    for (const a of entities.asteroids){
      const ab = a.bounds();
      if (hit(sb, ab)){
        entities.ship.hit();
        break;
      }
    }
    // Collisions: ship-crystal
    for (let i = entities.crystals.length-1; i>=0; i--){
      const c = entities.crystals[i];
      if (hit(sb, c.bounds())){
        STATE.score += c.type.points;
        updateHUD();
        spawnSparkle(c.x, c.y, "#aaf8ff");
        entities.crystals.splice(i,1);
      }
    }
    // Maintain asteroid count rising with level
    const target = CONFIG.initialAsteroids + Math.floor(STATE.level*0.8);
    if (entities.asteroids.length < target){
      spawnAsteroid(true);
    }
  }

  function render(){
    // Clear
    ctx.clearRect(0,0,canvas.width, canvas.height);

    // Subtle vignette
    const g = ctx.createRadialGradient(
      CONFIG.width/2, CONFIG.height*0.6, 50,
      CONFIG.width/2, CONFIG.height/2, Math.max(CONFIG.width, CONFIG.height)*0.8
    );
    g.addColorStop(0,"rgba(10,14,40,0)");
    g.addColorStop(1,"rgba(7,7,18,0.45)");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,canvas.width, canvas.height);

    // Draw order: crystals, asteroids, ship, particles on top
    entities.crystals.forEach(c => c.draw(ctx));
    entities.asteroids.forEach(a => a.draw(ctx));
    entities.ship.draw(ctx);
    entities.particles.forEach(p => p.draw(ctx));

    // Pause overlay hint text inside canvas (subtle)
    if (STATE.paused && !STATE.over){
      ctx.save();
      ctx.fillStyle = "rgba(200,230,255,.85)";
      ctx.font = "700 28px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Paused", CONFIG.width/2, CONFIG.height/2);
      ctx.restore();
    }
  }

  // Handle device pixel ratio scaling for crisp canvas
  function resizeCanvas(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CONFIG.width * dpr;
    canvas.height = CONFIG.height * dpr;
    canvas.style.width = CONFIG.width + "px";
    canvas.style.height = CONFIG.height + "px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // Boot to menu
  reset();
  menu.classList.add("visible");
  requestAnimationFrame(loop);
})();
