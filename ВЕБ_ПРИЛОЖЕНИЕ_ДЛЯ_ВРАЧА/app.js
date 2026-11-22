/**
 * SIMURGFARM MINIMAL CLINICAL CALCULATOR (СППР ВРАЧА)
 * Designed for interns and physicians: 6 core parameters, 0 clutter.
 * Architecture: 100% Pure Vanilla Web (HTML5 Canvas 60 FPS, Web Audio API Synth, Confetti Engine)
 */

// ============================================================================
// 1. STATE & CLINICAL PRESETS
// ============================================================================

let currentPrediction = null;
let currentSimData = null;
let debounceTimer = null;
let isAudioMuted = false;
let audioCtx = null;

const PATIENT_PRESETS = [
  {
    name: "Слайд 12 (65 лет, 78 кг, сепсис)",
    data: {
      weight_kg: 78.0, age: 65, scr_umol_l: 52,
      albumin_g_l: 28, sepsis_status: 1, oat_variant: "Normal"
    }
  },
  {
    name: "Септический шок + гипоальбуминемия (72 г., 62 кг)",
    data: {
      weight_kg: 62.0, age: 72, scr_umol_l: 75,
      albumin_g_l: 22, sepsis_status: 1, oat_variant: "Normal"
    }
  },
  {
    name: "Молодой с гиперклиренсом (34 г., 85 кг, OAT Rapid)",
    data: {
      weight_kg: 85.0, age: 34, scr_umol_l: 60,
      albumin_g_l: 44, sepsis_status: 0, oat_variant: "Rapid"
    }
  },
  {
    name: "Пожилая с ХБП (81 г., 55 кг, креатинин 160)",
    data: {
      weight_kg: 55.0, age: 81, scr_umol_l: 160,
      albumin_g_l: 36, sepsis_status: 0, oat_variant: "Slow"
    }
  }
];

// ============================================================================
// 2. PROCEDURAL SOUND SYNTHESIZER (Web Audio API)
// ============================================================================

function initAudio() {
  const savedSound = localStorage.getItem("weblab-sound");
  if (savedSound !== null) {
    isAudioMuted = savedSound === "false";
  }
  updateSoundIcon();

  const toggleBtn = document.getElementById("soundToggleBtn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      isAudioMuted = !isAudioMuted;
      localStorage.setItem("weblab-sound", !isAudioMuted);
      updateSoundIcon();
      if (!isAudioMuted) {
        playUiSound(580, 0.05, "triangle");
        showToast("Звук включен");
      } else {
        showToast("Звук выключен");
      }
    });
  }
}

function updateSoundIcon() {
  const icon = document.getElementById("soundIcon");
  if (icon) {
    icon.textContent = isAudioMuted ? "🔇" : "🔊";
  }
}

function playUiSound(freq = 440, duration = 0.04, type = "sine") {
  if (isAudioMuted) return;
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (err) {}
}

function playClickSound() {
  playUiSound(480, 0.03, "sine");
}

function playSliderSound(value) {
  const freq = 260 + (value / 1500) * 440;
  playUiSound(freq, 0.02, "triangle");
}

function playSuccessChime() {
  playUiSound(523.25, 0.06, "sine");
  setTimeout(() => playUiSound(659.25, 0.09, "sine"), 60);
}

function playWarningTone() {
  playUiSound(220, 0.12, "sawtooth");
}

// ============================================================================
// 3. THEME CONTROLLER (Dark / Light)
// ============================================================================

function initTheme() {
  const toggleBtn = document.getElementById("themeToggleBtn");
  const savedTheme = localStorage.getItem("weblab-theme");

  if (savedTheme === "light") {
    document.body.classList.add("light-theme");
  }
  updateThemeIcon();

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("light-theme");
      localStorage.setItem("weblab-theme", isLight ? "light" : "dark");
      updateThemeIcon();
      playUiSound(isLight ? 480 : 320, 0.04);
      showToast(isLight ? "Светлая клиническая тема" : "Тёмная кибер-тема");
      if (currentSimData) drawPkChart(currentSimData);
    });
  }
}

function updateThemeIcon() {
  const icon = document.getElementById("themeIcon");
  if (icon) {
    const isLight = document.body.classList.contains("light-theme");
    icon.textContent = isLight ? "🌙" : "☀️";
  }
}

function showToast(message) {
  const toast = document.getElementById("appToast");
  const toastText = document.getElementById("toastMessage");
  if (!toast || !toastText) return;

  toastText.textContent = message;
  toast.classList.add("show");

  clearTimeout(toast.toastTimer);
  toast.toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

// ============================================================================
// 4. CANVAS CONFETTI ENGINE
// ============================================================================

let confettiCanvas = null;
let confettiCtx = null;
let particlesList = [];
let isConfettiLoopActive = false;

function initConfettiEngine() {
  confettiCanvas = document.getElementById("confettiCanvas");
  if (!confettiCanvas) return;
  confettiCtx = confettiCanvas.getContext("2d");

  function resizeConfetti() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resizeConfetti, { passive: true });
  resizeConfetti();
}

function triggerConfetti(startX, startY) {
  if (!confettiCanvas || !confettiCtx) return;

  const originX = startX || window.innerWidth / 2;
  const originY = startY || window.innerHeight / 2;
  const colors = ["#0284c7", "#06b6d4", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b"];
  const count = 48;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 4 + Math.random() * 8;
    particlesList.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2.5,
      size: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      decay: 0.012 + Math.random() * 0.015,
      gravity: 0.22,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10
    });
  }

  if (!isConfettiLoopActive) {
    isConfettiLoopActive = true;
    requestAnimationFrame(renderConfettiFrame);
  }
}

function renderConfettiFrame() {
  if (!confettiCtx || particlesList.length === 0) {
    if (confettiCtx && confettiCanvas) {
      confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
    isConfettiLoopActive = false;
    return;
  }

  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

  for (let i = particlesList.length - 1; i >= 0; i--) {
    const p = particlesList[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.alpha -= p.decay;
    p.rotation += p.rotSpeed;

    if (p.alpha <= 0 || p.y > confettiCanvas.height) {
      particlesList.splice(i, 1);
      continue;
    }

    confettiCtx.save();
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate((p.rotation * Math.PI) / 180);
    confettiCtx.globalAlpha = Math.max(0, p.alpha);
    confettiCtx.fillStyle = p.color;
    confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    confettiCtx.restore();
  }

  requestAnimationFrame(renderConfettiFrame);
}

// ============================================================================
// 5. THE 6 CORE INPUT CONTROLS & TOGGLES
// ============================================================================

function setSepsis(val) {
  playClickSound();
  document.getElementById("inp-sepsis").value = val;
  const btnYes = document.getElementById("btn-sepsis-yes");
  const btnNo = document.getElementById("btn-sepsis-no");

  if (val === 1) {
    btnYes.classList.add("active");
    btnNo.classList.remove("active");
  } else {
    btnNo.classList.add("active");
    btnYes.classList.remove("active");
  }
  updateDerivedMetrics();
  debouncedPrediction();
}

function setOat(val) {
  playClickSound();
  document.getElementById("inp-oat").value = val;
  const btnNormal = document.getElementById("btn-oat-normal");
  const btnSlow = document.getElementById("btn-oat-slow");
  const btnRapid = document.getElementById("btn-oat-rapid");

  [btnNormal, btnSlow, btnRapid].forEach(b => b && b.classList.remove("active"));
  if (val === "Normal" && btnNormal) btnNormal.classList.add("active");
  if (val === "Slow" && btnSlow) btnSlow.classList.add("active");
  if (val === "Rapid" && btnRapid) btnRapid.classList.add("active");

  updateDerivedMetrics();
  debouncedPrediction();
}

function loadPresetQuick(idx) {
  playSuccessChime();
  const p = PATIENT_PRESETS[idx].data;

  // Set 6 Core inputs
  document.getElementById("inp-weight").value = p.weight_kg;
  document.getElementById("inp-age").value = p.age;
  document.getElementById("inp-scr").value = p.scr_umol_l;
  document.getElementById("inp-albumin").value = p.albumin_g_l;
  setSepsis(p.sepsis_status);
  setOat(p.oat_variant);

  // Update preset chip styling
  const chips = document.querySelectorAll(".preset-chip");
  chips.forEach((c, i) => {
    if (i === idx) c.classList.add("active");
    else c.classList.remove("active");
  });

  showToast(`Загружен: ${PATIENT_PRESETS[idx].name}`);
}

function updateDerivedMetrics() {
  const age = parseFloat(document.getElementById("inp-age").value) || 65;
  const wt = parseFloat(document.getElementById("inp-weight").value) || 78;
  const scr = parseFloat(document.getElementById("inp-scr").value) || 52;
  const ht = 175; // Standard clinical default height

  // Cockcroft-Gault CrCl
  const scr_mg = scr / 88.42;
  const crcl = ((140.0 - age) * wt) / (72.0 * scr_mg);
  const crclEl = document.getElementById("disp-crcl");
  if (crclEl) crclEl.textContent = `${Math.round(crcl)} мл/мин`;

  // BMI
  const bmi = wt / Math.pow(ht / 100, 2);
  const bmiEl = document.getElementById("disp-bmi");
  if (bmiEl) bmiEl.textContent = bmi.toFixed(1);
}

function initFormEvents() {
  const numInputs = ["inp-weight", "inp-age", "inp-scr", "inp-albumin"];
  numInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => {
        updateDerivedMetrics();
        debouncedPrediction();
      });
      el.addEventListener("change", () => {
        playClickSound();
        updateDerivedMetrics();
        debouncedPrediction();
      });
    }
  });

  // Slider synchronization
  const slider = document.getElementById("slider-dose");
  const numInput = document.getElementById("inp-custom-dose");

  if (slider && numInput) {
    slider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      numInput.value = Math.round(val);
      playSliderSound(val);
      debouncedCustomDoseSim(val);
    });

    numInput.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) {
        slider.value = Math.min(1200, Math.max(150, val));
        debouncedCustomDoseSim(val);
      }
    });

    numInput.addEventListener("change", () => {
      playClickSound();
    });
  }
}

// ============================================================================
// 6. BACKEND API CALL & DOCTOR'S RECOMMENDATION
// ============================================================================

function getFormPayload() {
  return {
    weight_kg: parseFloat(document.getElementById("inp-weight")?.value) || 78,
    age: parseFloat(document.getElementById("inp-age")?.value) || 65,
    scr_umol_l: parseFloat(document.getElementById("inp-scr")?.value) || 52,
    albumin_g_l: parseFloat(document.getElementById("inp-albumin")?.value) || 28,
    sepsis_status: parseInt(document.getElementById("inp-sepsis")?.value) || 1,
    oat_variant: document.getElementById("inp-oat")?.value || "Normal",
    // Standard defaults for non-critical fields
    sex: "M",
    height_cm: 176,
    infection_type: "Нозокомиальная пневмония (ВАП)",
    pathogen: "Pseudomonas aeruginosa",
    mic: 2.0,
    crp_mg_l: 54.0,
    lactate_mmol_l: 2.1,
    race: "White"
  };
}

function debouncedPrediction() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => triggerPrediction(), 180);
}

function debouncedCustomDoseSim(doseMg) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => triggerPrediction(doseMg), 80);
}

async function triggerPrediction(customDose = null) {
  const payload = getFormPayload();
  if (customDose !== null && customDose > 0) {
    payload.custom_dose = customDose;
  }

  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    currentPrediction = data;
    currentSimData = data.simulation;
    renderDoctorPrescription(data, customDose);
  } catch (err) {
    console.warn("Using offline PopPK calculation:", err);
    renderLocalPopPKFallback(payload, customDose);
  }
}

function renderDoctorPrescription(data, customDose) {
  const dos = data.dosing;
  const sim = data.simulation;
  const ev = data.evaluation;

  const recDose = Math.round(dos.recommended_dose_mg);
  const activeDose = customDose ? Math.round(customDose) : Math.round(dos.selected_dose_mg);
  const activeDoseG = (activeDose / 1000).toFixed(2);

  // 1. Hero Dose Output
  document.getElementById("heroDoseVal").textContent = activeDose;
  document.getElementById("heroDoseG").textContent = activeDoseG;

  // Synchronize inputs if not focused
  const slider = document.getElementById("slider-dose");
  const numInput = document.getElementById("inp-custom-dose");
  if (slider && document.activeElement !== slider) slider.value = activeDose;
  if (numInput && document.activeElement !== numInput) numInput.value = activeDose;

  // 2. Safety Traffic Light
  const trafficPill = document.getElementById("trafficPill");
  const trafficTitle = document.getElementById("trafficTitle");
  const heroBox = document.getElementById("heroPrescription");
  const dangerAlert = document.getElementById("dangerAlert");
  const ptPeak = document.getElementById("pt-peak");
  const ptAvg = document.getElementById("pt-avg");
  const mainStatus = document.getElementById("mainStatusBadge");

  document.getElementById("disp-peak").textContent = sim.c_peak_05.toFixed(1);
  document.getElementById("disp-cavg").textContent = sim.c_avg_0_12.toFixed(1);
  document.getElementById("disp-pta").textContent = `${Math.round(ev.pta_percent)}%`;
  document.getElementById("btnRecDoseText").textContent = recDose;

  if (ev.is_peak_safe) {
    // SAFE STATE
    trafficPill.className = "traffic-light-pill success";
    trafficPill.querySelector(".traffic-gem").textContent = "✓";
    trafficTitle.textContent = "Безопасно для пациента";

    heroBox.classList.remove("danger-glow");
    dangerAlert.style.display = "none";
    mainStatus.textContent = "Готово к введению";
    mainStatus.className = "badge-status-success";

    ptPeak.classList.remove("danger");
    ptPeak.querySelector(".point-icon").textContent = "✓";
  } else {
    // DANGEROUS STATE
    trafficPill.className = "traffic-light-pill danger";
    trafficPill.querySelector(".traffic-gem").textContent = "⚠️";
    trafficTitle.textContent = "ОПАСНО: Высокая токсичность!";

    heroBox.classList.add("danger-glow");
    dangerAlert.style.display = "flex";
    mainStatus.textContent = "Опасный пик!";
    mainStatus.className = "badge-status-accent badge-danger";

    ptPeak.classList.add("danger");
    ptPeak.querySelector(".point-icon").textContent = "✕";
    playWarningTone();
  }

  // 3. Render Canvas PK Curve
  drawPkChart(sim);
}

function applyRecommendedDose() {
  playSuccessChime();
  if (currentPrediction && currentPrediction.dosing) {
    const rec = Math.round(currentPrediction.dosing.recommended_dose_mg);
    document.getElementById("slider-dose").value = rec;
    document.getElementById("inp-custom-dose").value = rec;
    triggerPrediction(rec);
    showToast(`Возвращена безопасная доза: ${rec} мг`);
  }
}

function savePrescriptionScheme() {
  if (!currentPrediction) return;
  playSuccessChime();
  triggerConfetti();

  const p = currentPrediction.patient;
  const d = currentPrediction.dosing;
  const scheme = {
    timestamp: new Date().toISOString(),
    patient: p,
    dose_mg: d.selected_dose_mg,
    pta_pct: currentPrediction.evaluation.pta_percent
  };

  try {
    localStorage.setItem("simurg_saved_scheme", JSON.stringify(scheme));
    showToast(`Назначение сохранено: Экзампломицин ${Math.round(d.selected_dose_mg)} мг`);
  } catch (e) {
    showToast("Назначение рассчитано");
  }
}

// Fallback if offline
function renderLocalPopPKFallback(p, customDose) {
  const wt = p.weight_kg;
  const age = p.age;
  const scr = Math.max(30.0, p.scr_umol_l);
  const male = (p.sex === 'M' || p.sex === 'Male') ? 1.0 : 0.0;
  const rapid = p.oat_variant === 'Rapid' ? 1.0 : 0.0;
  const slow = p.oat_variant === 'Slow' ? 1.0 : 0.0;
  const sepsis = p.sepsis_status;
  const alb = p.albumin_g_l || 39.3;

  // PopPK Closed-Form Equations (CV MAPE CL: 13.66%, Vd: 9.56%, Score: 90.02)
  const ln_cl = (1.47760 + 0.76378 * Math.log(wt) - 0.00082 * age - 0.0000783 * (age * age)
                 - 0.69587 * Math.log(scr) + 0.09807 * male + 0.31498 * rapid - 0.38910 * slow);
  const cl_pred = 0.9704 * Math.exp(ln_cl);

  const ln_vd = -0.47743 + 0.86610 * Math.log(wt) + 0.24059 * sepsis - 0.00726 * alb;
  const vd_pred = 0.9859 * Math.exp(ln_vd);

  const k_elim = cl_pred / vd_pred;
  const t_half = Math.log(2.0) / k_elim;
  const cl_ml_min = (cl_pred * 1000.0) / 60.0;
  const vd_l_kg = vd_pred / wt;

  // Dosing boundaries
  const exp_12k = Math.max(1.0 - Math.exp(-12.0 * k_elim), 1e-9);
  const d_min_avg = (6.0 * 12.0 * cl_pred) / exp_12k;
  const d_max_avg = (12.0 * 12.0 * cl_pred) / exp_12k;
  const d_max_peak = 25.5 * vd_pred * Math.exp(0.5 * k_elim);
  const d_upper = Math.min(d_max_avg, d_max_peak);

  // Recommended robust dose
  let rec_dose = (d_min_avg <= d_upper) ? (d_min_avg + 0.52 * (d_upper - d_min_avg)) : d_max_peak;
  if (k_elim > 0.45025) rec_dose = d_max_peak;
  rec_dose = Math.max(10.0, rec_dose);

  const sel_dose = (customDose !== null && customDose > 0) ? customDose : rec_dose;

  // Curve simulation
  const time_points = [];
  const concentrations = [];
  for (let t = 0; t <= 24.0; t += 0.2) {
    time_points.push(parseFloat(t.toFixed(1)));
    concentrations.push(parseFloat(((sel_dose / vd_pred) * Math.exp(-k_elim * t)).toFixed(2)));
  }

  const c_peak_05 = (sel_dose / vd_pred) * Math.exp(-k_elim * 0.5);
  const c_avg_0_12 = (sel_dose / (12.0 * cl_pred)) * (1.0 - Math.exp(-12.0 * k_elim));
  const c_avg_0_24 = (sel_dose / (24.0 * cl_pred)) * (1.0 - Math.exp(-24.0 * k_elim));

  const is_peak_safe = c_peak_05 <= 26.0 + 1e-3;
  const is_avg_in_range = c_avg_0_12 >= 6.0 - 1e-3 && c_avg_0_12 <= 12.0 + 1e-3;
  const is_avg_in_broad = c_avg_0_12 >= 6.0 - 1e-3 && c_avg_0_12 <= 26.0 + 1e-3;

  let pta = 95.0;
  if (!is_peak_safe) pta = Math.max(10.0, 95.0 - (c_peak_05 - 26.0) * 15.0);
  else if (!is_avg_in_range) {
    if (c_avg_0_12 < 6.0) pta = Math.max(20.0, 95.0 - (6.0 - c_avg_0_12) * 20.0);
    else pta = Math.max(40.0, 95.0 - (c_avg_0_12 - 12.0) * 8.0);
  }

  const fallbackData = {
    patient: p,
    pk_predictions: { cl_l_h: cl_pred, cl_ml_min: cl_ml_min, vd_l: vd_pred, vd_l_kg: vd_l_kg, t_half_h: t_half, k_elim: k_elim },
    dosing: { recommended_dose_mg: rec_dose, selected_dose_mg: sel_dose, d_min_avg_mg: d_min_avg, d_max_avg_mg: d_max_avg, d_max_peak_mg: d_max_peak, d_upper_mg: d_upper },
    simulation: { time_points: time_points, concentrations: concentrations, c_peak_05: c_peak_05, c_avg_0_12: c_avg_0_12, c_avg_0_24: c_avg_0_24 },
    evaluation: { pta_percent: pta, is_peak_safe: is_peak_safe, is_avg_in_range_12: is_avg_in_range, is_avg_in_broad_range: is_avg_in_broad, status: is_peak_safe ? (is_avg_in_range ? 'OPTIMAL' : 'WARNING') : 'DANGER_PEAK' }
  };

  currentPrediction = fallbackData;
  currentSimData = fallbackData.simulation;
  renderDoctorPrescription(fallbackData, customDose);
}

// ============================================================================
// 7. NATIVE 60 FPS CANVAS PK CHART
// ============================================================================

let pkCanvas = null;
let pkCtx = null;
let chartStageWrap = null;
let chartTooltip = null;
let chartMetrics = {
  paddingLeft: 38,
  paddingRight: 14,
  paddingTop: 16,
  paddingBottom: 24,
  pixelRatio: 1
};
let mouseState = { isHovered: false, x: 0, y: 0 };

function initPkCanvas() {
  pkCanvas = document.getElementById("pkCanvas");
  chartStageWrap = document.getElementById("chartStageWrap");
  chartTooltip = document.getElementById("chartTooltip");
  if (!pkCanvas) return;

  pkCtx = pkCanvas.getContext("2d");
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas, { passive: true });

  pkCanvas.addEventListener("mousemove", (e) => {
    const rect = pkCanvas.getBoundingClientRect();
    mouseState.isHovered = true;
    mouseState.x = e.clientX - rect.left;
    mouseState.y = e.clientY - rect.top;
    if (currentSimData) drawPkChart(currentSimData);
  });

  pkCanvas.addEventListener("mouseleave", () => {
    mouseState.isHovered = false;
    if (chartTooltip) chartTooltip.style.opacity = "0";
    if (currentSimData) drawPkChart(currentSimData);
  });
}

function resizeCanvas() {
  if (!chartStageWrap || !pkCanvas) return;
  const rect = chartStageWrap.getBoundingClientRect();
  chartMetrics.pixelRatio = window.devicePixelRatio || 1;

  const displayWidth = Math.floor(rect.width || 550);
  const displayHeight = 180;

  pkCanvas.width = displayWidth * chartMetrics.pixelRatio;
  pkCanvas.height = displayHeight * chartMetrics.pixelRatio;
  pkCanvas.style.width = `${displayWidth}px`;
  pkCanvas.style.height = `${displayHeight}px`;

  if (currentSimData) drawPkChart(currentSimData);
}

function resizeCanvasOnAccordion() {
  resizeCanvas();
}

function drawPkChart(sim) {
  if (!pkCanvas || !pkCtx || !sim) return;

  const dpr = chartMetrics.pixelRatio || 1;
  const w = pkCanvas.width / dpr;
  const h = pkCanvas.height / dpr;
  const pL = chartMetrics.paddingLeft;
  const pR = chartMetrics.paddingRight;
  const pT = chartMetrics.paddingTop;
  const pB = chartMetrics.paddingBottom;
  const plotW = w - pL - pR;
  const plotH = h - pT - pB;

  pkCtx.save();
  pkCtx.scale(dpr, dpr);
  pkCtx.clearRect(0, 0, w, h);

  const isLight = document.body.classList.contains("light-theme");
  const gridColor = isLight ? "rgba(100, 116, 139, 0.12)" : "rgba(255, 255, 255, 0.06)";
  const textMuted = isLight ? "#64748b" : "#94a3b8";

  const maxSimConc = Math.max(...sim.concentrations);
  const maxConc = Math.max(30.0, Math.ceil(maxSimConc * 1.25 / 5) * 5);

  const getX = (t) => pL + (t / 24.0) * plotW;
  const getY = (c) => pT + plotH - (c / maxConc) * plotH;

  // Y-axis grid & labels
  pkCtx.font = "10px 'JetBrains Mono', monospace";
  pkCtx.textAlign = "right";
  pkCtx.textBaseline = "middle";

  for (let c = 0; c <= maxConc; c += (maxConc > 45 ? 10 : 5)) {
    const yPos = getY(c);
    pkCtx.strokeStyle = gridColor;
    pkCtx.lineWidth = 1;
    pkCtx.beginPath();
    pkCtx.moveTo(pL, yPos);
    pkCtx.lineTo(w - pR, yPos);
    pkCtx.stroke();

    pkCtx.fillStyle = textMuted;
    pkCtx.fillText(c.toString(), pL - 5, yPos);
  }

  // X-axis time marks
  pkCtx.textAlign = "center";
  pkCtx.textBaseline = "top";
  for (let t = 0; t <= 24; t += 6) {
    const xPos = getX(t);
    pkCtx.fillText(`${t}ч`, xPos, pT + plotH + 5);
  }

  // Safe band (6 - 26)
  const y26 = getY(26.0);
  const y6 = getY(6.0);
  pkCtx.fillStyle = isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.07)";
  pkCtx.fillRect(pL, y26, plotW, y6 - y26);

  // Red line 26 mg/L
  pkCtx.strokeStyle = "#ef4444";
  pkCtx.lineWidth = 1.5;
  pkCtx.setLineDash([4, 4]);
  pkCtx.beginPath();
  pkCtx.moveTo(pL, y26);
  pkCtx.lineTo(w - pR, y26);
  pkCtx.stroke();

  // Gradient under curve
  pkCtx.setLineDash([]);
  const gradient = pkCtx.createLinearGradient(0, pT, 0, pT + plotH);
  gradient.addColorStop(0, isLight ? "rgba(2, 132, 199, 0.28)" : "rgba(6, 182, 212, 0.35)");
  gradient.addColorStop(1, "rgba(2, 132, 199, 0.0)");

  pkCtx.beginPath();
  pkCtx.moveTo(getX(sim.time_points[0]), getY(sim.concentrations[0]));
  for (let i = 1; i < sim.time_points.length; i++) {
    pkCtx.lineTo(getX(sim.time_points[i]), getY(sim.concentrations[i]));
  }
  pkCtx.lineTo(getX(24), getY(0));
  pkCtx.lineTo(getX(0), getY(0));
  pkCtx.closePath();
  pkCtx.fillStyle = gradient;
  pkCtx.fill();

  // Curve stroke
  pkCtx.strokeStyle = isLight ? "#0284c7" : "#06b6d4";
  pkCtx.lineWidth = 2.6;
  pkCtx.beginPath();
  sim.time_points.forEach((t, i) => {
    const x = getX(t);
    const y = getY(sim.concentrations[i]);
    if (i === 0) pkCtx.moveTo(x, y);
    else pkCtx.lineTo(x, y);
  });
  pkCtx.stroke();

  // Peak Dot at 0.5h
  const peakTimeIdx = sim.time_points.findIndex((t) => Math.abs(t - 0.5) < 0.15);
  if (peakTimeIdx >= 0) {
    const peakX = getX(sim.time_points[peakTimeIdx]);
    const peakY = getY(sim.concentrations[peakTimeIdx]);
    const isPeakDanger = sim.concentrations[peakTimeIdx] > 26.0;

    pkCtx.fillStyle = isPeakDanger ? "#ef4444" : (isLight ? "#0284c7" : "#38bdf8");
    pkCtx.strokeStyle = "#ffffff";
    pkCtx.lineWidth = 2;
    pkCtx.beginPath();
    pkCtx.arc(peakX, peakY, 4.5, 0, Math.PI * 2);
    pkCtx.fill();
    pkCtx.stroke();
  }

  // Crosshair
  if (mouseState.isHovered && mouseState.x >= pL && mouseState.x <= w - pR) {
    const hoveredTime = ((mouseState.x - pL) / plotW) * 24.0;
    let closestIdx = 0;
    let minDiff = Infinity;
    sim.time_points.forEach((t, i) => {
      const diff = Math.abs(t - hoveredTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });

    const activeT = sim.time_points[closestIdx];
    const activeC = sim.concentrations[closestIdx];
    const markerX = getX(activeT);
    const markerY = getY(activeC);

    pkCtx.strokeStyle = isLight ? "rgba(2, 132, 199, 0.6)" : "rgba(6, 182, 212, 0.7)";
    pkCtx.lineWidth = 1.2;
    pkCtx.setLineDash([3, 3]);
    pkCtx.beginPath();
    pkCtx.moveTo(markerX, pT);
    pkCtx.lineTo(markerX, pT + plotH);
    pkCtx.stroke();

    pkCtx.fillStyle = isLight ? "#0284c7" : "#06b6d4";
    pkCtx.beginPath();
    pkCtx.arc(markerX, markerY, 4.5, 0, Math.PI * 2);
    pkCtx.fill();

    if (chartTooltip) {
      const isDanger = activeC > 26.0;
      chartTooltip.innerHTML = `
        <div style="font-size: 11px;">t = <strong>${activeT.toFixed(1)} ч</strong></div>
        <div style="font-size: 13px; font-weight: 700; color: ${isDanger ? '#ef4444' : (isLight ? '#0f172a' : '#f8fafc')}">${activeC.toFixed(1)} мг/л</div>
      `;
      chartTooltip.style.opacity = "1";
      chartTooltip.style.left = `${Math.min(plotW - 60, Math.max(10, markerX - 40))}px`;
      chartTooltip.style.top = `${Math.max(10, markerY - 45)}px`;
    }
  }

  pkCtx.restore();
}

// ============================================================================
// 8. MEDICAL REPORT & PRINTING
// ============================================================================

function openModal(id) {
  playClickSound();
  const el = document.getElementById(id);
  if (!el) return;
  if (typeof el.showModal === "function") el.showModal();
  else el.classList.add("show");
}

function closeModal(id) {
  playClickSound();
  const el = document.getElementById(id);
  if (!el) return;
  if (typeof el.close === "function") el.close();
  else el.classList.remove("show");
}

document.addEventListener("click", (e) => {
  if (e.target.tagName === "DIALOG") e.target.close();
});

function openReportModal() {
  if (!currentPrediction) triggerPrediction();
  populateReportData();
  openModal("report-modal");
}

function populateReportData() {
  if (!currentPrediction) return;
  const p = currentPrediction.patient;
  const d = currentPrediction.dosing;
  const sim = currentPrediction.simulation;

  const dateStr = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  document.getElementById("rep-date").textContent = `Дата: ${dateStr} | Карта больного: № PAT_${Math.floor(Math.random() * 8999 + 1000)}`;
  document.getElementById("rep-wt").textContent = `${p.weight_kg} кг`;
  document.getElementById("rep-age").textContent = `${p.age} лет`;
  document.getElementById("rep-scr").textContent = `${p.scr_umol_l} мкмоль/л`;
  document.getElementById("rep-crcl").textContent = document.getElementById("disp-crcl")?.textContent || "108 мл/мин";
  document.getElementById("rep-alb").textContent = `${p.albumin_g_l} г/л`;
  document.getElementById("rep-sepsis").textContent = p.sepsis_status === 1 ? "Да (Сепсис)" : "Нет";
  document.getElementById("rep-oat").textContent = p.oat_variant === "Rapid" ? "Rapid (Ускоренный)" : (p.oat_variant === "Slow" ? "Slow (Замедленный)" : "Normal (Стандартный)");

  const doseMg = Math.round(d.selected_dose_mg);
  const doseG = (d.selected_dose_mg / 1000).toFixed(2);
  document.getElementById("rep-final-dose").textContent = `Экзампломицин ${doseMg} мг (${doseG} г) внутривенно, 1 раз в сутки`;
  document.getElementById("rep-details").innerHTML = `
    Способ введения: флакон развести в 100 мл 0.9% раствора натрия хлорида. Вводить внутривенно капельно в течение 30 минут.<br>
    Ожидаемый пик C(0.5): <strong>${sim.c_peak_05.toFixed(1)} мг/л</strong> (порог безопасности ≤ 26.0 мг/л). Средняя концентрация: <strong>${sim.c_avg_0_12.toFixed(1)} мг/л</strong> (окно 6.0–26.0 мг/л).
  `;
}

function printReportDocument() {
  triggerConfetti();
  playSuccessChime();
  window.print();
}

// ============================================================================
// 9. INITIALIZATION
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  initAudio();
  initTheme();
  initConfettiEngine();
  initPkCanvas();
  initFormEvents();

  // Load Initial Slide 12 Patient
  loadPresetQuick(0);
});
