const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");

const modePill = document.getElementById("modePill");
const modeText = document.getElementById("modeText");
const headingText = document.getElementById("headingText");
const rangeText = document.getElementById("rangeText");
const lockText = document.getElementById("lockText");

const toggleModeBtn = document.getElementById("toggleModeBtn");
const resetBtn = document.getElementById("resetBtn");

const rangeSlider = document.getElementById("rangeSlider");
const beamSlider = document.getElementById("beamSlider");
const pingSpeedSlider = document.getElementById("pingSpeedSlider");
const pingRateSlider = document.getElementById("pingRateSlider");
const bgNoiseSlider = document.getElementById("bgNoiseSlider");
const turnSpeedSlider = document.getElementById("turnSpeedSlider");

const rangeValue = document.getElementById("rangeValue");
const beamValue = document.getElementById("beamValue");
const pingSpeedValue = document.getElementById("pingSpeedValue");
const pingRateValue = document.getElementById("pingRateValue");
const bgNoiseValue = document.getElementById("bgNoiseValue");
const turnSpeedValue = document.getElementById("turnSpeedValue");

const W = canvas.width;
const H = canvas.height;

const keys = {};
let lastTime = performance.now();
let sonarMode = "passive";
let backgroundNoise = 0.30;
let autoPingTimer = 0;
let contacts = [];
let pings = [];
let soundPulses = [];
let noiseSpecks = [];
let mappedCells = new Set();
let passiveTimer = 0;
let lockedContacts = [];

const settings = {
  sonarRange: 720,
  beamWidthDeg: 80,
  pingSpeed: 420,
  pingRate: 3.0,
  contactStability: 0.90,
  turnSpeedDeg: 55
};

const player = {
  x: W / 2,
  y: H / 2,
  vx: 0,
  vy: 0,
  heading: -Math.PI / 2,
  speed: 0,
  selfNoise: 0.08
};

const terrain = [
  { x: 1030, y: 220, r: 70, type: "Shipwreck", reflectivity: 0.9 },
  { x: 265, y: 660, r: 42, type: "Rocks", reflectivity: 0.75 },
  { x: 1040, y: 650, r: 76, type: "Seafloor ridge", reflectivity: 0.85 }
];

const objects = [
  {
    x: 190, y: 520, r: 22, type: "Moving vessel",
    soundLevel: 1.15, reflectivity: 0.65, moves: true, angle: 0.12, speed: 28,
    turnRate: 0, pulseTimer: 0.4
  },
  {
    x: 900, y: 390, r: 24, type: "Biological sound",
    soundLevel: 0.55, reflectivity: 0.25, moves: true, angle: 2.65, speed: 8,
    turnRate: 0, pulseTimer: 1.2
  }
];

function resetSim() {
  player.x = W / 2;
  player.y = H / 2;
  player.vx = 0;
  player.vy = 0;
  player.heading = -Math.PI / 2;
  player.speed = 0;
  player.selfNoise = 0.08;
  sonarMode = "passive";
  autoPingTimer = 0;
  passiveTimer = 0;
  contacts = [];
  pings = [];
  soundPulses = [];
  noiseSpecks = [];
  mappedCells = new Set();
  lockedContacts = [];

  objects[0].x = 190;
  objects[0].y = 520;
  objects[0].angle = 0.12;
  objects[0].speed = 28;
  objects[0].turnRate = 0;
  objects[0].pulseTimer = 0.4;

  objects[1].x = 900;
  objects[1].y = 390;
  objects[1].angle = 2.65;
  objects[1].speed = 8;
  objects[1].turnRate = 0;
  objects[1].pulseTimer = 1.2;
}

function angleTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function angleDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function updateSliders() {
  settings.sonarRange = Number(rangeSlider.value);
  settings.beamWidthDeg = Number(beamSlider.value);
  settings.pingSpeed = Number(pingSpeedSlider.value);
  settings.pingRate = Number(pingRateSlider.value);
  backgroundNoise = Number(bgNoiseSlider.value) / 100;
  settings.turnSpeedDeg = Number(turnSpeedSlider.value);

  rangeValue.textContent = `${settings.sonarRange} m`;
  beamValue.textContent = `${settings.beamWidthDeg}°`;
  pingSpeedValue.textContent = `${settings.pingSpeed} m/s`;
  pingRateValue.textContent = `${settings.pingRate.toFixed(1)} s`;
  bgNoiseValue.textContent = `${Math.round(backgroundNoise * 100)}%`;
  turnSpeedValue.textContent = `${settings.turnSpeedDeg}°/s`;
}

function targetInsideBeam(origin, target, heading, beamWidthDeg) {
  if (beamWidthDeg >= 359) return true;
  const half = (beamWidthDeg * Math.PI / 180) / 2;
  return Math.abs(angleDiff(angleTo(origin, target), heading)) <= half;
}

function addContact(type, x, y, confidence, source, mode) {
  const existing = contacts.find(c => c.source === source);

  // The visible moving vessel should not have a contact marker trailing behind it.
  // Keep its display contact close to the current detection so the sonar visual matches the vessel.
  const stability = source && source.type === "Moving vessel" ? 0.18 : settings.contactStability;
  const rangeFromPlayer = Math.hypot(source.x - player.x, source.y - player.y);

  if (existing) {
    existing.x = existing.x * stability + x * (1 - stability);
    existing.y = existing.y * stability + y * (1 - stability);
    existing.confidence = clamp(existing.confidence + confidence * 0.15, 0, 1);
    existing.age = 0;
    existing.mode = mode;
    existing.type = type;
    existing.distanceMeters = rangeFromPlayer;

    // Lock-on is only allowed for moving targets, not static terrain/rocks/wrecks.
    if (mode === "active" && source && source.moves && existing.confidence > 0.62) {
      addLockedContact(existing);
    }
    return;
  }

  const contact = {
    type,
    x,
    y,
    confidence: clamp(confidence, 0, 1),
    age: 0,
    source,
    mode,
    distanceMeters: rangeFromPlayer
  };

  contacts.push(contact);

  // Lock-on is only allowed for moving targets, not static terrain/rocks/wrecks.
  if (mode === "active" && source && source.moves && contact.confidence > 0.62) {
    addLockedContact(contact);
  }
}

function addLockedContact(contact) {
  // Save the last known active-sonar position.
  // After this, the target can move, but the saved lock point stays fixed
  // until another active ping updates it.
  contact.lockX = contact.x;
  contact.lockY = contact.y;
  contact.lockDistanceMeters = Math.hypot(contact.lockX - player.x, contact.lockY - player.y);

  if (!lockedContacts.includes(contact)) {
    lockedContacts.push(contact);
  }
}

function updatePlayer(dt) {
  const turnSpeed = settings.turnSpeedDeg * Math.PI / 180;
  if (keys["a"] || keys["ArrowLeft"]) player.heading -= turnSpeed * dt;
  if (keys["d"] || keys["ArrowRight"]) player.heading += turnSpeed * dt;

  const fast = keys["Shift"];
  const thrust = fast ? 220 : 140;
  const reverse = 90;
  const maxSpeed = fast ? 185 : 115;

  if (keys["w"] || keys["ArrowUp"]) {
    player.vx += Math.cos(player.heading) * thrust * dt;
    player.vy += Math.sin(player.heading) * thrust * dt;
  }
  if (keys["s"] || keys["ArrowDown"]) {
    player.vx -= Math.cos(player.heading) * reverse * dt;
    player.vy -= Math.sin(player.heading) * reverse * dt;
  }

  player.vx *= Math.pow(0.22, dt);
  player.vy *= Math.pow(0.22, dt);

  const speed = Math.hypot(player.vx, player.vy);
  if (speed > maxSpeed) {
    player.vx = (player.vx / speed) * maxSpeed;
    player.vy = (player.vy / speed) * maxSpeed;
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.x = clamp(player.x, 30, W - 30);
  player.y = clamp(player.y, 30, H - 30);
  player.speed = Math.hypot(player.vx, player.vy);
  player.selfNoise = clamp(0.08 + player.speed / 250, 0.08, 0.85);
}

function updateObjects(dt) {
  for (const obj of objects) {
    if (!obj.moves) continue;

    // Make the vessel wander more realistically/randomly instead of moving in a simple line.
    if (obj.type === "Moving vessel") {
      obj.turnRate += (Math.random() - 0.5) * 0.9 * dt;
      obj.turnRate = clamp(obj.turnRate, -1.1, 1.1);
      obj.angle += obj.turnRate * dt;
      obj.speed += (Math.random() - 0.5) * 18 * dt;
      obj.speed = clamp(obj.speed, 16, 42);
    } else {
      obj.angle += Math.sin(performance.now() / 2200 + obj.x * 0.01) * 0.0008;
    }

    obj.x += Math.cos(obj.angle) * obj.speed * dt;
    obj.y += Math.sin(obj.angle) * obj.speed * dt;

    if (obj.x < 80 || obj.x > W - 80) {
      obj.angle = Math.PI - obj.angle + (Math.random() - 0.5) * 0.7;
      obj.x = clamp(obj.x, 80, W - 80);
    }
    if (obj.y < 80 || obj.y > H - 80) {
      obj.angle = -obj.angle + (Math.random() - 0.5) * 0.7;
      obj.y = clamp(obj.y, 80, H - 80);
    }

    // Passive sonar visualization: sound-making objects emit faint expanding sound waves.
    obj.pulseTimer -= dt;
    const interval = obj.type === "Moving vessel" ? 1.15 : 1.9;
    if (obj.pulseTimer <= 0) {
      soundPulses.push({
        x: obj.x,
        y: obj.y,
        r: 0,
        maxR: obj.type === "Moving vessel" ? 420 : 300,
        source: obj,
        age: 0
      });
      obj.pulseTimer = interval + Math.random() * 0.8;
    }
  }
}

function updateSoundPulses(dt) {
  for (const pulse of soundPulses) {
    pulse.r += 165 * dt;
    pulse.age += dt;
  }
  soundPulses = soundPulses.filter(p => p.r < p.maxR && p.age < 3.5);
}

function updateBackgroundNoise(dt) {
  // Background noise appears as drifting, expanding translucent circles.
  // These are not sonar pings; they represent random ocean noise masking passive sonar.
  const spawnRate = 1.5 + backgroundNoise * 7.5;
  const expected = spawnRate * dt;
  const count = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);

  for (let i = 0; i < count; i++) {
    noiseSpecks.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 8 + Math.random() * 35,
      age: 0,
      life: 1.4 + Math.random() * 2.4,
      driftX: (Math.random() - 0.5) * 32,
      driftY: (Math.random() - 0.5) * 32,
      grow: 28 + Math.random() * 60
    });
  }

  for (const n of noiseSpecks) {
    n.age += dt;
    n.x += n.driftX * dt;
    n.y += n.driftY * dt;
    n.r += n.grow * dt;
  }

  noiseSpecks = noiseSpecks.filter(n => n.age < n.life);
}

function drawBackgroundNoise() {
  if (backgroundNoise <= 0.02) return;

  ctx.save();

  for (const n of noiseSpecks) {
    const life = 1 - n.age / n.life;
    const alpha = life * (0.035 + backgroundNoise * 0.16);

    // Large translucent filled circles.
    ctx.fillStyle = `rgba(64, 223, 255, ${alpha * 0.45})`;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fill();

    // Brighter circular edge.
    ctx.strokeStyle = `rgba(64, 223, 255, ${alpha})`;
    ctx.lineWidth = 2 + backgroundNoise * 3;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function updatePassive(dt) {
  if (sonarMode !== "passive") return;

  passiveTimer += dt;
  if (passiveTimer < 0.7) return;
  passiveTimer = 0;

  for (const obj of objects) {
    const d = Math.max(1, Math.hypot(player.x - obj.x, player.y - obj.y));
    const signal = (obj.soundLevel * 155000) / (d * d);
    const quality = signal - player.selfNoise * 0.7 - backgroundNoise * 1.65;

    if (quality > 0.10 + backgroundNoise * 0.46) {
      const bearing = angleTo(player, obj);
      const bearingNoise = clamp((backgroundNoise + player.selfNoise) * 0.24, 0.010, 0.30);
      const rangeNoise = clamp(90 - quality * 18 + backgroundNoise * 220, 35, 260);
      const guessedRange = d + (Math.random() - 0.5) * rangeNoise;
      const guessedAngle = bearing + (Math.random() - 0.5) * bearingNoise;

      const displayX = obj.type === "Moving vessel" ? obj.x : player.x + Math.cos(guessedAngle) * guessedRange;
      const displayY = obj.type === "Moving vessel" ? obj.y : player.y + Math.sin(guessedAngle) * guessedRange;

      addContact(
        obj.type,
        displayX,
        displayY,
        clamp(quality / 2.6, 0.08, 0.62),
        obj,
        "passive"
      );
    }
  }

  // At higher background noise, passive sonar occasionally shows weak false clutter.
  if (backgroundNoise > 0.75 && Math.random() < backgroundNoise * 0.012) {
    const fakeAngle = Math.random() * Math.PI * 2;
    const fakeRange = 130 + Math.random() * 420;
    contacts.push({
      type: "Background noise",
      x: player.x + Math.cos(fakeAngle) * fakeRange,
      y: player.y + Math.sin(fakeAngle) * fakeRange,
      confidence: 0.06 + backgroundNoise * 0.10,
      age: 0,
      source: { moves: false },
      mode: "passive",
      distanceMeters: fakeRange
    });
  }
}

function sendPing() {
  pings.push({
    x: player.x,
    y: player.y,
    heading: player.heading,
    beamWidthDeg: settings.beamWidthDeg,
    r: 0,
    maxR: settings.sonarRange,
    age: 0,
    hitSources: new Set()
  });
}

function updateAutoPing(dt) {
  if (sonarMode !== "active") {
    autoPingTimer = 0;
    return;
  }

  autoPingTimer += dt;
  if (autoPingTimer >= settings.pingRate) {
    sendPing();
    autoPingTimer = 0;
  }
}

function updatePings(dt) {
  for (const ping of pings) {
    ping.r += settings.pingSpeed * dt;
    ping.age += dt;

    const allTargets = [...objects, ...terrain];
    for (const target of allTargets) {
      if (ping.hitSources.has(target)) continue;
      if (!targetInsideBeam(ping, target, ping.heading, ping.beamWidthDeg)) continue;

      const d = Math.hypot(target.x - ping.x, target.y - ping.y);
      if (Math.abs(d - ping.r) < 8 + target.r * 0.25) {
        ping.hitSources.add(target);

        const strength = clamp((target.reflectivity * target.r * 65) / Math.max(80, d), 0.15, 1);
        const noise = (1 - strength) * 14;
        const angle = angleTo(ping, target) + (Math.random() - 0.5) * 0.018;
        const range = d + (Math.random() - 0.5) * noise;

        const contactX = target.type === "Moving vessel" ? target.x : ping.x + Math.cos(angle) * range;
        const contactY = target.type === "Moving vessel" ? target.y : ping.y + Math.sin(angle) * range;

        addContact(
          target.type || "Hard object",
          contactX,
          contactY,
          strength,
          target,
          "active"
        );
        revealMapAround(target.x, target.y, target.r + 35);
      }
    }

    revealMapRing(ping.x, ping.y, ping.r, ping.heading, ping.beamWidthDeg);
  }

  pings = pings.filter(p => p.r < p.maxR && p.age < 3.2);
}

function revealMapRing(cx, cy, r, heading, beamWidthDeg) {
  const cell = 25;
  const full = beamWidthDeg >= 359;
  const half = (beamWidthDeg * Math.PI / 180) / 2;

  for (let a = 0; a < Math.PI * 2; a += 0.08) {
    if (!full && Math.abs(angleDiff(a, heading)) > half) continue;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    mappedCells.add(`${Math.floor(x / cell)},${Math.floor(y / cell)}`);
  }
}

function revealMapAround(cx, cy, radius) {
  const cell = 25;
  for (let x = cx - radius; x <= cx + radius; x += cell) {
    for (let y = cy - radius; y <= cy + radius; y += cell) {
      if (Math.hypot(x - cx, y - cy) <= radius) {
        mappedCells.add(`${Math.floor(x / cell)},${Math.floor(y / cell)}`);
      }
    }
  }
}

function updateContacts(dt) {
  for (const c of contacts) {
    c.age += dt;
    c.confidence *= Math.pow(0.95, dt);

    // If this is a locked active contact, keep the distance updated from the
    // player's current position to the LAST KNOWN active-sonar point.
    // Do not chase the moving target while in passive mode.
    if (lockedContacts.includes(c) && Number.isFinite(c.lockX) && Number.isFinite(c.lockY)) {
      c.lockDistanceMeters = Math.hypot(c.lockX - player.x, c.lockY - player.y);
      c.distanceMeters = c.lockDistanceMeters;
    } else if (c.source && Number.isFinite(c.source.x) && Number.isFinite(c.source.y)) {
      c.distanceMeters = Math.hypot(c.x - player.x, c.y - player.y);
    }
  }

  contacts = contacts.filter(c => c.age < 13 && c.confidence > 0.04);

  // Keep only locks on moving targets. Static objects do not lock.
  lockedContacts = lockedContacts.filter(c => contacts.includes(c) && c.source && c.source.moves);
}

function updateUI() {
  updateSliders();

  modeText.textContent = sonarMode === "passive" ? "Passive" : "Active";
  modePill.textContent = sonarMode === "passive" ? "Passive Sonar" : "Active Sonar";
  const deg = ((player.heading * 180 / Math.PI) + 360) % 360;
  headingText.textContent = `${Math.round(deg)}°`;
  rangeText.textContent = `${settings.sonarRange} m`;

  if (lockedContacts.length > 0) {
    lockText.textContent = lockedContacts
      .map(c => `${Math.round(Number.isFinite(c.lockDistanceMeters) ? c.lockDistanceMeters : c.distanceMeters)} m`)
      .join(" / ");
  } else {
    lockText.textContent = "None";
  }
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(120,210,255,0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMappedCells() {
  ctx.save();
  ctx.fillStyle = "rgba(70, 145, 255, 0.10)";
  for (const key of mappedCells) {
    const [cx, cy] = key.split(",").map(Number);
    ctx.fillRect(cx * 25, cy * 25, 25, 25);
  }
  ctx.restore();
}

function drawTerrain() {
  for (const t of terrain) {
    const cellKey = `${Math.floor(t.x / 25)},${Math.floor(t.y / 25)}`;
    if (!mappedCells.has(cellKey)) continue;
    ctx.save();
    ctx.fillStyle = "rgba(112, 137, 255, 0.18)";
    ctx.strokeStyle = "rgba(112, 137, 255, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(t.x, t.y, t.r * 1.2, t.r * 0.65, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawMovingObjects() {
  // Sound emitters are intentionally hidden.
  // Passive sonar shows their sound waves and bearing/contact clues instead.
}

function drawSoundPulses() {
  if (sonarMode !== "passive") return;

  ctx.save();
  for (const pulse of soundPulses) {
    const alpha = clamp(1 - pulse.r / pulse.maxR, 0, 1);
    const noiseMask = Math.max(0.04, Math.pow(1 - backgroundNoise, 2.2));
    const color = pulse.source.type === "Moving vessel"
      ? `rgba(64, 223, 255, ${alpha * 0.32 * noiseMask})`
      : `rgba(120, 255, 190, ${alpha * 0.25 * noiseMask})`;

    ctx.strokeStyle = color;
    ctx.lineWidth = pulse.source.type === "Moving vessel" ? 3 : 2;
    ctx.beginPath();
    ctx.arc(pulse.x, pulse.y, pulse.r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = pulse.source.type === "Moving vessel"
      ? `rgba(64, 223, 255, ${alpha * 0.10 * noiseMask})`
      : `rgba(120, 255, 190, ${alpha * 0.08 * noiseMask})`;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(pulse.x, pulse.y, pulse.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPassiveBearings() {
  if (sonarMode !== "passive") return;

  ctx.save();
  for (const c of contacts.filter(c => c.mode === "passive")) {
    const a = angleTo(player, c);
    const alpha = clamp(c.confidence, 0.08, 0.42);

    ctx.strokeStyle = `rgba(64, 223, 255, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + Math.cos(a) * 680, player.y + Math.sin(a) * 680);
    ctx.stroke();

    ctx.fillStyle = `rgba(64, 223, 255, ${alpha * 0.42})`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 20 + (1 - c.confidence) * 24, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBeamGuide() {
  if (sonarMode !== "active") return;

  const full = settings.beamWidthDeg >= 359;
  const half = (settings.beamWidthDeg * Math.PI / 180) / 2;

  ctx.save();
  ctx.fillStyle = "rgba(64, 223, 255, 0.035)";
  ctx.strokeStyle = "rgba(64, 223, 255, 0.18)";
  ctx.beginPath();
  if (full) {
    ctx.arc(player.x, player.y, settings.sonarRange, 0, Math.PI * 2);
  } else {
    ctx.moveTo(player.x, player.y);
    ctx.arc(player.x, player.y, settings.sonarRange, player.heading - half, player.heading + half);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPings() {
  ctx.save();
  for (const p of pings) {
    const alpha = clamp(1 - p.r / p.maxR, 0, 1);
    const full = p.beamWidthDeg >= 359;
    const half = (p.beamWidthDeg * Math.PI / 180) / 2;

    ctx.strokeStyle = `rgba(64, 223, 255, ${alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (full) {
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    } else {
      ctx.arc(p.x, p.y, p.r, p.heading - half, p.heading + half);
    }
    ctx.stroke();

    ctx.strokeStyle = `rgba(64, 223, 255, ${alpha * 0.25})`;
    ctx.lineWidth = 12;
    ctx.beginPath();
    if (full) {
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    } else {
      ctx.arc(p.x, p.y, p.r, p.heading - half, p.heading + half);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawContacts() {
  ctx.save();
  for (const c of contacts) {
    const alpha = clamp(c.confidence, 0.12, 0.8);
    const radius = c.mode === "active" ? 13 + (1 - c.confidence) * 10 : 20 + (1 - c.confidence) * 24;

    ctx.fillStyle = c.mode === "active"
      ? `rgba(255, 184, 74, ${alpha * 0.5})`
      : `rgba(64, 223, 255, ${alpha * 0.22})`;
    ctx.strokeStyle = c.mode === "active"
      ? `rgba(255, 184, 74, ${alpha})`
      : `rgba(64, 223, 255, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (lockedContacts.includes(c)) {
      const lockX = Number.isFinite(c.lockX) ? c.lockX : c.x;
      const lockY = Number.isFinite(c.lockY) ? c.lockY : c.y;
      c.lockDistanceMeters = Math.hypot(lockX - player.x, lockY - player.y);
      c.distanceMeters = c.lockDistanceMeters;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.lineWidth = 2;
      const s = radius + 12;
      ctx.beginPath();
      ctx.moveTo(lockX - s, lockY - s * 0.55);
      ctx.lineTo(lockX - s, lockY - s);
      ctx.lineTo(lockX - s * 0.55, lockY - s);
      ctx.moveTo(lockX + s, lockY - s * 0.55);
      ctx.lineTo(lockX + s, lockY - s);
      ctx.lineTo(lockX + s * 0.55, lockY - s);
      ctx.moveTo(lockX - s, lockY + s * 0.55);
      ctx.lineTo(lockX - s, lockY + s);
      ctx.lineTo(lockX - s * 0.55, lockY + s);
      ctx.moveTo(lockX + s, lockY + s * 0.55);
      ctx.lineTo(lockX + s, lockY + s);
      ctx.lineTo(lockX + s * 0.55, lockY + s);
      ctx.stroke();
    }

    if (c.confidence > 0.30) {
      ctx.fillStyle = "rgba(216, 243, 255, 0.9)";
      ctx.font = "14px Arial";
      ctx.fillText(c.type, c.x + radius + 6, c.y + 4);

      if (Number.isFinite(c.distanceMeters)) {
        ctx.fillStyle = c.mode === "active" ? "rgba(255, 184, 74, 0.95)" : "rgba(64, 223, 255, 0.95)";
        ctx.font = "13px Arial";
        const shownDistance = lockedContacts.includes(c) && Number.isFinite(c.lockDistanceMeters)
          ? c.lockDistanceMeters
          : c.distanceMeters;
        const prefix = c.mode === "active" || lockedContacts.includes(c) ? "Range" : "~";
        const suffix = c.mode === "active" || lockedContacts.includes(c) ? " m" : " m away";
        ctx.fillText(`${prefix}${Math.round(shownDistance)}${suffix}`, c.x + radius + 6, c.y + 22);
      }
    }
  }
  ctx.restore();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.heading);

  ctx.fillStyle = "rgba(56, 240, 160, 0.9)";
  ctx.strokeStyle = "rgba(216, 255, 240, 0.8)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(25, 0);
  ctx.lineTo(-19, -12);
  ctx.lineTo(-12, 0);
  ctx.lineTo(-19, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(216, 255, 240, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(28, 0);
  ctx.lineTo(52, 0);
  ctx.stroke();

  ctx.restore();

  ctx.save();
  ctx.strokeStyle = `rgba(255, 184, 74, ${player.selfNoise * 0.35})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(player.x, player.y, 23 + player.selfNoise * 40, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawLockLine() {
  if (lockedContacts.length === 0) return;

  ctx.save();

  for (const contact of lockedContacts) {
    if (!contact || contact.mode !== "active") continue;

    // Use the saved last-known active-sonar point.
    // This point only changes when active sonar hits the target again.
    const targetX = Number.isFinite(contact.lockX) ? contact.lockX : contact.x;
    const targetY = Number.isFinite(contact.lockY) ? contact.lockY : contact.y;
    const liveTarget = { x: targetX, y: targetY };

    contact.lockDistanceMeters = Math.hypot(targetX - player.x, targetY - player.y);
    contact.distanceMeters = contact.lockDistanceMeters;

    ctx.strokeStyle = "rgba(255, 184, 74, 0.72)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Split-beam look: draw a narrow beam wedge around each locked target.
    const bearing = angleTo(player, liveTarget);
    const range = contact.distanceMeters;
    const splitHalf = 7 * Math.PI / 180;

    ctx.fillStyle = "rgba(255, 184, 74, 0.045)";
    ctx.strokeStyle = "rgba(255, 184, 74, 0.22)";
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.arc(player.x, player.y, range, bearing - splitHalf, bearing + splitHalf);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const midX = (player.x + targetX) / 2;
    const midY = (player.y + targetY) / 2;
    ctx.fillStyle = "rgba(2, 10, 17, 0.75)";
    ctx.fillRect(midX - 40, midY - 13, 80, 22);
    ctx.fillStyle = "rgba(255, 184, 74, 0.98)";
    ctx.font = "14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(contact.distanceMeters)} m`, midX, midY + 4);
    ctx.textAlign = "left";
  }

  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawBackgroundNoise();
  drawMappedCells();
  drawTerrain();
  drawMovingObjects();
  drawSoundPulses();
  drawBeamGuide();
  drawPassiveBearings();
  drawPings();
  drawContacts();
  drawLockLine();
  drawPlayer();
}

function toggleMode() {
  sonarMode = sonarMode === "passive" ? "active" : "passive";
  autoPingTimer = settings.pingRate; // fire an active ping quickly after switching
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  updateSliders();
  updatePlayer(dt);
  updateObjects(dt);
  updateSoundPulses(dt);
  updateBackgroundNoise(dt);
  updatePassive(dt);
  updateAutoPing(dt);
  updatePings(dt);
  updateContacts(dt);

  render();
  updateUI();

  requestAnimationFrame(loop);
}

window.addEventListener("keydown", e => {
  if (["Tab", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
  }

  if (e.code === "Tab") toggleMode();
  else if (e.key.toLowerCase() === "r") resetSim();

  keys[e.key] = true;
  keys[e.code] = true;
});

window.addEventListener("keyup", e => {
  keys[e.key] = false;
  keys[e.code] = false;
});

toggleModeBtn.addEventListener("click", toggleMode);
resetBtn.addEventListener("click", resetSim);

resetSim();
requestAnimationFrame(loop);
