/* ==========================================================
   마이핏 코치 - 식단관리 앱 스크립트
   ========================================================== */
const STORAGE_KEY = 'myfit_profile_v1';
const MEALS_KEY = 'myfit_meals_v1';
const WEIGHTS_KEY = 'myfit_weights_v1';
const CHAT_KEY = 'myfit_chat_v1';

const MEAL_TYPES = [
  { id: 'breakfast', label: '아침', icon: '🌅' },
  { id: 'lunch', label: '점심', icon: '☀️' },
  { id: 'dinner', label: '저녁', icon: '🌙' },
  { id: 'snack', label: '간식', icon: '🍪' },
];

const ACTIVITY_LABELS = {
  '1.2': '거의 안 움직여요',
  '1.375': '가볍게 활동해요',
  '1.55': '활동적이에요',
  '1.725': '매우 활동적이에요',
};
const GOAL_LABELS = { lose: '체중 감량', maintain: '체중 유지', gain: '근육 증량' };
const DIET_LABELS = { normal: '일반식', lowcarb: '저탄고지', keto: '키토', vegan: '비건' };

let state = {
  profile: null,
  meals: {},   // { 'YYYY-MM-DD': { breakfast: [food,...], lunch: [...], ... } }
  weights: [], // [{date, value}]
  chat: [],
  onboardStep: 1,
  onboardData: { gender: 'female', activity: '1.2', goal: 'lose', dietStyle: 'normal' },
  activeMealForModal: null,
};

/* ---------------- 유틸 ---------------- */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtDateKr(dateStr) {
  const d = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}
function saveAll() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.profile));
  localStorage.setItem(MEALS_KEY, JSON.stringify(state.meals));
  localStorage.setItem(WEIGHTS_KEY, JSON.stringify(state.weights));
  localStorage.setItem(CHAT_KEY, JSON.stringify(state.chat));
}
function loadAll() {
  try { state.profile = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { state.profile = null; }
  try { state.meals = JSON.parse(localStorage.getItem(MEALS_KEY)) || {}; } catch (e) { state.meals = {}; }
  try { state.weights = JSON.parse(localStorage.getItem(WEIGHTS_KEY)) || []; } catch (e) { state.weights = []; }
  try { state.chat = JSON.parse(localStorage.getItem(CHAT_KEY)) || []; } catch (e) { state.chat = []; }
}
function getTodayMeals() {
  const key = todayStr();
  if (!state.meals[key]) {
    state.meals[key] = { breakfast: [], lunch: [], dinner: [], snack: [] };
  }
  return state.meals[key];
}

/* ---------------- 칼로리/영양소 계산 ---------------- */
function calcBmr(profile) {
  const { gender, weight, height, age } = profile;
  const base = 10 * weight + 6.25 * height - 5 * age;
  return gender === 'male' ? base + 5 : base - 161;
}
function calcTdee(bmr, activity) {
  return bmr * parseFloat(activity);
}
function calcTargetKcal(tdee, goal) {
  if (goal === 'lose') return Math.round(tdee - 450);
  if (goal === 'gain') return Math.round(tdee + 350);
  return Math.round(tdee);
}
function calcMacros(targetKcal, dietStyle) {
  let carbPct = 0.5, proteinPct = 0.3, fatPct = 0.2;
  if (dietStyle === 'lowcarb') { carbPct = 0.25; proteinPct = 0.35; fatPct = 0.4; }
  else if (dietStyle === 'keto') { carbPct = 0.08; proteinPct = 0.32; fatPct = 0.6; }
  else if (dietStyle === 'vegan') { carbPct = 0.55; proteinPct = 0.25; fatPct = 0.2; }
  return {
    carb: Math.round((targetKcal * carbPct) / 4),
    protein: Math.round((targetKcal * proteinPct) / 4),
    fat: Math.round((targetKcal * fatPct) / 9),
  };
}
function buildDerivedProfile(p) {
  const bmr = calcBmr(p);
  const tdee = calcTdee(bmr, p.activity);
  const targetKcal = calcTargetKcal(tdee, p.goal);
  const macros = calcMacros(targetKcal, p.dietStyle);
  return { ...p, bmr: Math.round(bmr), tdee: Math.round(tdee), targetKcal, macros };
}

/* ==========================================================
   온보딩
   ========================================================== */
const TOTAL_STEPS = 5;

function initOnboardingEvents() {
  document.getElementById('genderGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    setActiveInGroup('genderGroup', btn);
    state.onboardData.gender = btn.dataset.value;
  });
  document.getElementById('activityGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('.choice-item');
    if (!btn) return;
    setActiveInGroup('activityGroup', btn);
    state.onboardData.activity = btn.dataset.value;
  });
  document.getElementById('goalGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('.choice-item');
    if (!btn) return;
    setActiveInGroup('goalGroup', btn);
    state.onboardData.goal = btn.dataset.value;
  });
  document.getElementById('dietGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('.choice-item');
    if (!btn) return;
    setActiveInGroup('dietGroup', btn);
    state.onboardData.dietStyle = btn.dataset.value;
  });

  document.getElementById('obNext').addEventListener('click', onObNext);
  document.getElementById('obPrev').addEventListener('click', onObPrev);
}
function setActiveInGroup(groupId, btn) {
  document.querySelectorAll(`#${groupId} .seg-btn, #${groupId} .choice-item`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
function validateStep(step) {
  if (step === 1) {
    const name = document.getElementById('inputName').value.trim();
    const age = document.getElementById('inputAge').value;
    if (!name) { alert('이름을 입력해주세요.'); return false; }
    if (!age || age <= 0) { alert('나이를 입력해주세요.'); return false; }
    return true;
  }
  if (step === 2) {
    const h = document.getElementById('inputHeight').value;
    const w = document.getElementById('inputWeight').value;
    const tw = document.getElementById('inputTargetWeight').value;
    if (!h || h <= 0) { alert('키를 입력해주세요.'); return false; }
    if (!w || w <= 0) { alert('현재 몸무게를 입력해주세요.'); return false; }
    if (!tw || tw <= 0) { alert('목표 몸무게를 입력해주세요.'); return false; }
    return true;
  }
  return true;
}
function onObNext() {
  if (!validateStep(state.onboardStep)) return;
  if (state.onboardStep < TOTAL_STEPS) {
    if (state.onboardStep === TOTAL_STEPS - 1) {
      finalizeOnboardResult();
    }
    goToObStep(state.onboardStep + 1);
  } else {
    completeOnboarding();
  }
}
function onObPrev() {
  if (state.onboardStep > 1) goToObStep(state.onboardStep - 1);
}
function goToObStep(step) {
  state.onboardStep = step;
  document.querySelectorAll('.ob-step').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.step) === step);
  });
  document.querySelectorAll('.step-dot').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.step) <= step);
  });
  document.getElementById('obPrev').style.visibility = step === 1 ? 'hidden' : 'visible';
  document.getElementById('obNext').textContent = step === TOTAL_STEPS ? '시작하기' : '다음';
}
function collectOnboardProfile() {
  return {
    name: document.getElementById('inputName').value.trim(),
    age: Number(document.getElementById('inputAge').value),
    gender: state.onboardData.gender,
    height: Number(document.getElementById('inputHeight').value),
    weight: Number(document.getElementById('inputWeight').value),
    targetWeight: Number(document.getElementById('inputTargetWeight').value),
    activity: state.onboardData.activity,
    goal: state.onboardData.goal,
    dietStyle: state.onboardData.dietStyle,
  };
}
function finalizeOnboardResult() {
  const raw = collectOnboardProfile();
  const derived = buildDerivedProfile(raw);
  document.getElementById('resultName').textContent = `${raw.name}님, 분석이 끝났어요!`;
  document.getElementById('resultBmr').textContent = `${derived.bmr} kcal`;
  document.getElementById('resultTdee').textContent = `${derived.tdee} kcal`;
  document.getElementById('resultTarget').textContent = `${derived.targetKcal} kcal`;
  document.getElementById('resultCarb').textContent = `${derived.macros.carb}g`;
  document.getElementById('resultProtein').textContent = `${derived.macros.protein}g`;
  document.getElementById('resultFat').textContent = `${derived.macros.fat}g`;
  state._pendingProfile = derived;
}
function completeOnboarding() {
  state.profile = state._pendingProfile || buildDerivedProfile(collectOnboardProfile());
  if (!state.weights.length) {
    state.weights.push({ date: todayStr(), value: state.profile.weight });
  }
  if (!state.chat.length) {
    state.chat.push({ from: 'coach', text: `${state.profile.name}님, 반가워요! 저는 앞으로 함께할 다이어트 PT 선생님이에요. 오늘부터 차근차근 목표를 향해 가봐요 💪` });
  }
  saveAll();
  document.getElementById('onboarding').classList.remove('active');
  document.getElementById('app').style.display = 'flex';
  renderAll();
}
function startOnboardingFresh() {
  document.getElementById('onboarding').classList.add('active');
  document.getElementById('app').style.display = 'none';
  state.onboardStep = 1;
  goToObStep(1);
}

/* ==========================================================
   탭 네비게이션
   ========================================================== */
function initTabEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.goto));
  });
}
function switchTab(tabId) {
  document.querySelectorAll('.tab-screen').forEach(el => el.classList.toggle('active', el.id === tabId));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.toggle('active', el.dataset.tab === tabId));
  if (tabId === 'tab-weight') renderWeightTab();
  if (tabId === 'tab-my') renderMyTab();
  if (tabId === 'tab-coach') renderChat();
}

/* ==========================================================
   렌더링: 전체
   ========================================================== */
function renderAll() {
  if (!state.profile) return;
  renderHome();
  renderDietTab();
  renderMyTab();
  renderChat();
}

function sumMealNutrients() {
  const meals = getTodayMeals();
  let kcal = 0, carb = 0, protein = 0, fat = 0;
  MEAL_TYPES.forEach(mt => {
    (meals[mt.id] || []).forEach(f => {
      kcal += Number(f.kcal) || 0;
      carb += Number(f.carb) || 0;
      protein += Number(f.protein) || 0;
      fat += Number(f.fat) || 0;
    });
  });
  return { kcal, carb, protein, fat };
}

/* ---------------- 홈 탭 ---------------- */
function renderHome() {
  const p = state.profile;
  document.getElementById('homeUserName').textContent = p.name;
  document.getElementById('homeDateStr').textContent = fmtDateKr(todayStr()) + ' · 오늘도 화이팅이에요!';

  const totals = sumMealNutrients();
  const target = p.targetKcal;
  const remain = Math.max(target - totals.kcal, 0);

  document.getElementById('kcalEatenLabel').textContent = totals.kcal;
  document.getElementById('kcalTargetLabel').textContent = target;
  document.getElementById('kcalRemain').textContent = remain;

  const ratio = Math.min(totals.kcal / target, 1) || 0;
  const circumference = 326.7;
  document.getElementById('ringFg').style.strokeDashoffset = String(circumference * (1 - ratio));

  const macroTarget = p.macros;
  setBarWidth('barCarb', totals.carb, macroTarget.carb);
  setBarWidth('barProtein', totals.protein, macroTarget.protein);
  setBarWidth('barFat', totals.fat, macroTarget.fat);

  document.getElementById('homeCurWeight').textContent = `${getLatestWeight()} kg`;
  const toGoal = (getLatestWeight() - p.targetWeight);
  document.getElementById('homeToGoal').textContent = `${toGoal >= 0 ? toGoal.toFixed(1) : (-toGoal).toFixed(1)} kg`;

  document.getElementById('coachHomeMsg').textContent = buildHomeCoachMsg(totals, target);
  document.getElementById('homeStreak').textContent = calcRecordStreak();
  document.getElementById('mascotQuote').textContent = pickVariant('mascot_quote', MASCOT_QUOTES);

  renderHomeMealSummary();
}
const MASCOT_QUOTES = [
  '오늘도 저와 함께 건강한 하루 보내요! 🐶',
  '멍! 물 한 잔 마시는 거 잊지 마세요 💧',
  '식단 기록하는 습관, 벌써 대단해요!',
  '작은 실천이 큰 변화를 만들어요 🐾',
  '오늘 컨디션 어때요? 무리하지 말아요!',
  '꾸준함이 최고의 다이어트 비법이에요.',
];
function calcRecordStreak() {
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dayMeals = state.meals[key];
    const hasRecord = dayMeals && Object.values(dayMeals).some(list => list && list.length > 0);
    if (hasRecord) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
function setBarWidth(elId, value, target) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  document.getElementById(elId).style.width = pct + '%';
}
function getLatestWeight() {
  if (!state.weights.length) return state.profile.weight;
  return state.weights[state.weights.length - 1].value;
}
function buildHomeCoachMsg(totals, target) {
  if (totals.kcal === 0) return '아직 오늘 식단 기록이 없어요. 첫 끼니를 기록해볼까요? 🍽️';
  if (totals.kcal < target * 0.5) return '오늘 아직 섭취량이 부족해요. 균형 잡힌 식사를 챙겨주세요!';
  if (totals.kcal <= target) return '아주 좋아요! 목표 칼로리 안에서 잘 관리하고 있어요 👍';
  return '오늘 목표 칼로리를 초과했어요. 내일은 조금 더 가볍게 먹어볼까요?';
}
function renderHomeMealSummary() {
  const meals = getTodayMeals();
  const wrap = document.getElementById('homeMealSummary');
  wrap.innerHTML = '';
  let any = false;
  MEAL_TYPES.forEach(mt => {
    const list = meals[mt.id] || [];
    if (!list.length) return;
    any = true;
    list.forEach(f => {
      const row = document.createElement('div');
      row.className = 'meal-summary-item';
      row.innerHTML = `<span class="msi-name">${mt.icon} ${f.name}</span><span class="msi-kcal">${f.kcal} kcal</span>`;
      wrap.appendChild(row);
    });
  });
  if (!any) {
    wrap.innerHTML = '<p class="empty-hint">오늘 기록된 식단이 없어요</p>';
  }
}

/* ---------------- 식단 기록 탭 ---------------- */
function renderDietTab() {
  const p = state.profile;
  const totals = sumMealNutrients();
  document.getElementById('dietEaten').textContent = totals.kcal;
  document.getElementById('dietTarget').textContent = p.targetKcal;
  const pct = Math.min((totals.kcal / p.targetKcal) * 100, 100) || 0;
  document.getElementById('dietTotalBar').style.width = pct + '%';

  const meals = getTodayMeals();
  const wrap = document.getElementById('mealSections');
  wrap.innerHTML = '';
  MEAL_TYPES.forEach(mt => {
    const list = meals[mt.id] || [];
    const sumKcal = list.reduce((s, f) => s + (Number(f.kcal) || 0), 0);
    const section = document.createElement('div');
    section.className = 'meal-section';
    let itemsHtml = list.map((f, idx) => `
      <div class="food-item">
        <div>
          <div class="fi-name">${f.name}</div>
          <div class="fi-macro">탄 ${f.carb || 0}g · 단 ${f.protein || 0}g · 지 ${f.fat || 0}g</div>
        </div>
        <div style="display:flex;align-items:center;">
          <span class="fi-kcal">${f.kcal} kcal</span>
          <button class="fi-del" data-meal="${mt.id}" data-idx="${idx}">✕</button>
        </div>
      </div>
    `).join('');
    if (!list.length) itemsHtml = '<p class="empty-hint">🐾 아직 기록된 음식이 없어요</p>';
    section.innerHTML = `
      <div class="meal-section-head">
        <h4>${mt.icon} ${mt.label}</h4>
        <span class="meal-kcal-sum">${sumKcal} kcal</span>
      </div>
      ${itemsHtml}
      <button class="add-food-btn" data-meal="${mt.id}">+ 음식 추가하기</button>
    `;
    wrap.appendChild(section);
  });

  wrap.querySelectorAll('.add-food-btn').forEach(btn => {
    btn.addEventListener('click', () => openFoodModal(btn.dataset.meal));
  });
  wrap.querySelectorAll('.fi-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const meals2 = getTodayMeals();
      meals2[btn.dataset.meal].splice(Number(btn.dataset.idx), 1);
      saveAll();
      renderDietTab();
      renderHome();
    });
  });
}

/* ---------------- 음식 추가 모달 ---------------- */
function openFoodModal(mealId) {
  state.activeMealForModal = mealId;
  const mt = MEAL_TYPES.find(m => m.id === mealId);
  document.getElementById('modalMealTitle').textContent = `${mt.icon} ${mt.label}에 음식 추가`;
  document.getElementById('foodName').value = '';
  document.getElementById('foodKcal').value = '';
  document.getElementById('foodCarb').value = '';
  document.getElementById('foodProtein').value = '';
  document.getElementById('foodFat').value = '';
  document.getElementById('foodModal').classList.add('active');
}
function closeFoodModal() {
  document.getElementById('foodModal').classList.remove('active');
  state.activeMealForModal = null;
}
function saveFoodFromModal() {
  const name = document.getElementById('foodName').value.trim();
  const kcal = Number(document.getElementById('foodKcal').value);
  if (!name) { alert('음식 이름을 입력해주세요.'); return; }
  if (!kcal || kcal <= 0) { alert('칼로리를 입력해주세요.'); return; }
  const food = {
    name,
    kcal,
    carb: Number(document.getElementById('foodCarb').value) || 0,
    protein: Number(document.getElementById('foodProtein').value) || 0,
    fat: Number(document.getElementById('foodFat').value) || 0,
  };
  const meals = getTodayMeals();
  meals[state.activeMealForModal].push(food);
  saveAll();
  closeFoodModal();
  renderDietTab();
  renderHome();
}
function initFoodModalEvents() {
  document.getElementById('foodCancelBtn').addEventListener('click', closeFoodModal);
  document.getElementById('foodSaveBtn').addEventListener('click', saveFoodFromModal);
  document.getElementById('foodModal').addEventListener('click', (e) => {
    if (e.target.id === 'foodModal') closeFoodModal();
  });
}

/* ==========================================================
   PT 선생님 (AI 코치 채팅)
   ========================================================== */
const COACH_AVATAR = '🐶';
function renderChat() {
  const win = document.getElementById('chatWindow');
  win.innerHTML = state.chat.map(m => `
    <div class="chat-msg ${m.from}">
      <div class="chat-avatar">${m.from === 'coach' ? COACH_AVATAR : '🙋'}</div>
      <div class="chat-bubble">${escapeHtml(m.text)}</div>
    </div>
  `).join('');
  win.scrollTop = win.scrollHeight;
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function addChatMsg(from, text) {
  state.chat.push({ from, text });
  saveAll();
  renderChat();
}
function showTyping() {
  const win = document.getElementById('chatWindow');
  const el = document.createElement('div');
  el.className = 'chat-msg coach';
  el.id = 'typingIndicator';
  el.innerHTML = `<div class="chat-avatar">${COACH_AVATAR}</div><div class="chat-bubble typing"><span></span><span></span><span></span></div>`;
  win.appendChild(el);
  win.scrollTop = win.scrollHeight;
}
function hideTyping() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

/* ==========================================================
   셔플백(Shuffle-bag) 방식 랜덤 선택기
   - 전체 문장을 한 번씩 다 사용한 뒤에야 다시 섞어서 재사용
   - 같은 카테고리라도 훨씬 오래, 훨씬 다양하게 반복 없이 순환됨
   ========================================================== */
const shuffleBags = {};
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickVariant(key, list) {
  if (list.length === 1) return list[0];
  if (!shuffleBags[key] || shuffleBags[key].length === 0) {
    shuffleBags[key] = shuffleArray(list.map((_, i) => i));
  }
  const idx = shuffleBags[key].pop();
  return list[idx];
}
/* 인트로 문구를 랜덤으로 붙여 같은 본문도 다르게 느껴지도록 함 (챗봇 다양화) */
const INTROS = ['', '', '음, ', '그러게요! ', '좋은 질문이에요! ', '흠~ '];
function withRandomIntro(text) {
  const intro = pickVariant('intro_pool', INTROS);
  return intro ? intro + text : text;
}

function coachReply(userText) {
  const p = state.profile;
  const totals = sumMealNutrients();
  const text = userText.toLowerCase();
  let reply;

  if (text.includes('식단')) {
    if (totals.kcal === 0) {
      reply = pickVariant('diet_empty', [
        '아직 오늘 기록된 식단이 없어요! 식단 탭에서 첫 끼니를 기록해보세요 🍽️',
        '오늘 드신 게 아직 없네요? 간단한 거라도 기록해두면 제가 더 정확하게 코칭해드릴 수 있어요!',
        `${p.name}님, 오늘 식사 기록이 비어있어요. 지금 뭘 드셨는지 한번 적어볼까요? 📝`,
        '기록이 있어야 저도 도와드릴 수 있어요! 식단 탭에서 아침부터 차근차근 기록해봐요.',
      ]);
    } else if (totals.kcal > p.targetKcal) {
      reply = pickVariant('diet_over', [
        `오늘 ${totals.kcal}kcal를 섭취했는데, 목표(${p.targetKcal}kcal)보다 조금 초과했어요. 저녁은 가볍게 먹어볼까요?`,
        `목표보다 ${totals.kcal - p.targetKcal}kcal 더 드셨네요. 내일은 산책이나 가벼운 운동으로 균형을 맞춰봐요!`,
        '오늘은 칼로리가 조금 높아요. 그래도 괜찮아요, 하루 정도는 큰 영향 없으니 내일부터 다시 조절해봐요 😊',
        `${p.name}님, 초과분은 물을 많이 마시고 활동량을 늘리면 충분히 만회할 수 있어요!`,
      ]);
    } else {
      reply = pickVariant('diet_ok', [
        `오늘 ${totals.kcal}kcal 섭취했어요! 목표(${p.targetKcal}kcal)까지 ${p.targetKcal - totals.kcal}kcal 남았으니 잘 관리되고 있어요 👍`,
        '지금까지 딱 좋은 페이스예요! 이대로만 유지해봐요.',
        `훌륭해요 ${p.name}님, 목표 범위 안에서 잘 드시고 계세요. 남은 끼니도 균형있게 챙겨보세요 🥗`,
        '칼로리 관리 아주 잘하고 계시네요! 단백질도 충분히 챙기고 있는지 한번 확인해봐요.',
      ]);
    }
  } else if (text.includes('운동')) {
    const recsByGoal = {
      lose: [
        '유산소 30분(빠르게 걷기, 줄넘기)과 전신 근력운동을 함께 해보세요!',
        '오늘은 인터벌 걷기(빠르게 3분 + 천천히 2분 반복) 20분 어때요? 지방 연소에 효과적이에요.',
        '홈트로 버피, 스쿼트, 플랭크를 각 1분씩 3세트 돌려보는 걸 추천해요!',
        '계단 오르기나 자전거 타기 같은 유산소 위주로 30분 정도 움직여볼까요?',
      ],
      maintain: [
        '주 3회 정도 좋아하는 운동으로 활동량을 유지해보세요!',
        '오늘은 가볍게 요가나 스트레칭으로 몸을 풀어주는 것도 좋아요.',
        '평소 즐기시던 운동에 10분만 더 추가해보는 건 어떨까요?',
        '유지 단계에서는 무리하지 않고 꾸준함이 핵심이에요. 산책 30분도 충분해요!',
      ],
      gain: [
        '단백질 섭취를 늘리고 스쿼트, 데드리프트 같은 근력운동을 추천해요!',
        '오늘은 상체 운동(벤치프레스, 푸시업) 위주로 근력을 키워볼까요?',
        '근성장을 위해 세트당 8~12회, 3~4세트 무게운동을 해보세요!',
        '운동 후 30분 이내에 단백질을 섭취하면 근육 회복에 도움이 돼요.',
      ],
    };
    reply = pickVariant('exercise_' + p.goal, recsByGoal[p.goal] || recsByGoal.maintain);
  } else if (text.includes('동기') || text.includes('힘들') || text.includes('포기') || text.includes('지쳐') || text.includes('지친')) {
    /* 3개의 독립 문장 풀(공감→격려→다음행동)을 조합해 사실상 반복이 거의 안 느껴지게 구성 */
    const empathy = pickVariant('mot_empathy', [
      `${p.name}님, 지금까지 정말 잘 해오셨어요.`,
      '힘든 날도 있는 게 당연해요.',
      '포기하고 싶은 마음이 들 때가 가장 크게 성장하는 순간이래요.',
      '작심삼일이어도 다시 시작하면 그건 실패가 아니에요.',
      `${p.name}님이 시작했다는 것 자체가 이미 대단한 거예요.`,
      '누구나 흔들리는 순간이 있어요, 저도 알아요.',
      '오늘 컨디션이 안 좋은가 봐요, 무리하지 않아도 괜찮아요.',
    ]);
    const encourage = pickVariant('mot_encourage', [
      '작은 변화가 쌓여 결국 큰 결과가 됩니다.',
      '완벽하지 않아도 꾸준하기만 하면 충분해요.',
      '지금까지 온 것만으로도 이미 절반은 성공한 거예요.',
      '결과보다 과정 속의 나를 칭찬해줘도 좋아요.',
      '느려도 멈추지만 않으면 결국 도착해요.',
      '어제보다 오늘 한 걸음이면 충분해요.',
    ]);
    const action = pickVariant('mot_action', [
      '오늘 하루도 저와 함께 가봐요 🔥',
      '지금 물 한 잔부터 마셔볼까요? 💧',
      '잠깐 쉬었다가 다시 천천히 가도 괜찮아요 🌱',
      '가벼운 산책이라도 5분만 나가볼까요?',
      '오늘 목표는 딱 하나만 정해봐요!',
      '내일 아침에 다시 새로운 마음으로 시작해봐요 ☀️',
    ]);
    reply = `${empathy} ${encourage} ${action}`;
  } else if (text.includes('야식') || text.includes('스트레스') || text.includes('먹고싶')) {
    reply = pickVariant('stress_eat', [
      '스트레스 받을 땐 다들 그래요! 물이나 차 한 잔으로 잠깐 참아보는 건 어때요? 🍵',
      '정 먹고 싶으면 양을 줄여서 조금만 즐겨보세요. 죄책감 갖지 않아도 돼요!',
      '오늘 못 참았다고 실패한 게 아니에요. 내일부터 다시 페이스를 찾으면 돼요.',
      `${p.name}님, 야식 대신 따뜻한 우유나 저칼로리 간식은 어떨까요?`,
      '스트레스의 원인을 잠깐 적어보는 것도 식욕을 가라앉히는 데 도움이 돼요.',
    ]);
  } else if (text.includes('잠') || text.includes('수면')) {
    reply = pickVariant('sleep', [
      '수면 부족은 다이어트의 적이에요! 하루 7시간 이상 자보는 걸 목표로 해봐요.',
      '자기 전 스마트폰을 조금만 멀리 두면 숙면에 도움이 돼요.',
      `${p.name}님, 잠을 잘 자야 식욕 호르몬도 안정돼요. 오늘은 일찍 주무세요!`,
      '규칙적인 수면 패턴이 체중 관리에도 큰 영향을 줘요.',
    ]);
  } else if (text.includes('체중') || text.includes('몸무게')) {
    const latest = getLatestWeight();
    const diff = (latest - p.targetWeight).toFixed(1);
    if (Number(diff) <= 0) {
      reply = pickVariant('weight_reached', [
        '축하해요! 이미 목표 체중에 도달하셨어요 🎉 유지 관리에 신경 써봐요.',
        `대단해요 ${p.name}님! 목표를 달성하셨네요. 이제는 요요 없이 잘 유지하는 게 중요해요.`,
        '목표 체중 달성! 여기서 만족하지 말고 건강한 습관을 계속 이어가봐요 👏',
      ]);
    } else {
      reply = pickVariant('weight_progress', [
        `현재 ${latest}kg이고 목표까지 ${diff}kg 남았어요. 꾸준히 기록하면 곧 도달할 거예요!`,
        `${diff}kg만 더 감량하면 목표예요! 조금씩 줄어들고 있으니 힘내봐요 💪`,
        '체중은 매일 조금씩 오르내릴 수 있어요. 그래프의 큰 흐름을 보면서 꾸준히 가봐요.',
        `${p.name}님, 목표까지 얼마 안 남았어요! 식단이랑 운동 기록 계속 이어가봐요.`,
      ]);
    }
  } else if (text.includes('안녕') || text.includes('하이') || text.includes('hi')) {
    reply = pickVariant('greeting', [
      `안녕하세요 ${p.name}님! 오늘 컨디션은 어떠세요? 😊`,
      `반가워요 ${p.name}님! 오늘도 목표를 향해 함께 가봐요.`,
      '어서오세요! 오늘 식단이나 운동 관련해서 궁금한 거 있으면 편하게 물어보세요.',
    ]);
  } else if (text.includes('고마') || text.includes('감사')) {
    reply = pickVariant('thanks', [
      '천만에요! 언제든 편하게 물어보세요 😊',
      '별말씀을요! 저는 항상 여기 있으니 필요할 때 불러주세요.',
      `${p.name}님이 열심히 하시니까 저도 힘이 나요! 계속 함께 해봐요.`,
    ]);
  } else {
    reply = pickVariant('generic', [
      '좋아요! 오늘도 목표 칼로리 안에서 균형 잡힌 식사를 해보세요.',
      '궁금한 점이 있으면 "식단 어때요?", "운동 추천해줘요" 처럼 물어봐주세요!',
      '꾸준함이 가장 중요해요. 오늘 하루도 화이팅입니다 💪',
      `${p.name}님, 물은 충분히 드시고 계신가요? 하루 1.5~2L 정도가 좋아요.`,
      '오늘 컨디션은 어떠세요? 몸 상태에 맞춰서 무리하지 않는 게 중요해요.',
      '작은 목표부터 하나씩 이뤄나가는 게 다이어트 성공의 지름길이에요!',
      '조금 더 구체적으로 말씀해주시면 제가 더 잘 도와드릴 수 있어요 🐾',
      '오늘 하루는 어떠셨어요? 편하게 이야기해주세요.',
      '기록이 쌓일수록 저도 더 정확한 조언을 드릴 수 있어요!',
    ]);
  }
  addChatMsg('coach', reply);
}
function initChatEvents() {
  document.getElementById('chatSend').addEventListener('click', sendChatFromInput);
  document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatFromInput();
  });
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      addChatMsg('user', btn.dataset.msg);
      triggerCoachReply(btn.dataset.msg);
    });
  });
}
function triggerCoachReply(userText) {
  showTyping();
  const delay = 500 + Math.random() * 700; /* 챗지피티처럼 타이핑 시간을 랜덤화 */
  setTimeout(() => {
    hideTyping();
    coachReply(userText);
  }, delay);
}
function sendChatFromInput() {
  const input = document.getElementById('chatInput');
  const val = input.value.trim();
  if (!val) return;
  addChatMsg('user', val);
  input.value = '';
  triggerCoachReply(val);
}

/* ==========================================================
   체중 기록 탭
   ========================================================== */
function renderWeightTab() {
  const p = state.profile;
  const startWeight = state.weights.length ? state.weights[0].value : p.weight;
  const latest = getLatestWeight();
  const totalToLose = startWeight - p.targetWeight;
  const lostSoFar = startWeight - latest;
  let rate = 0;
  if (totalToLose !== 0) rate = Math.max(0, Math.min(100, Math.round((lostSoFar / totalToLose) * 100)));
  document.getElementById('goalRateLabel').textContent = `달성률 ${rate}%`;

  renderWeightChart();
  renderWeightHistory();
}
function renderWeightChart() {
  const svg = document.getElementById('weightChart');
  const data = state.weights;
  if (!data.length) { svg.innerHTML = ''; return; }
  const values = data.map(d => d.value);
  const min = Math.min(...values) - 1;
  const max = Math.max(...values) + 1;
  const w = 300, h = 140, padX = 16, padY = 16;
  const stepX = data.length > 1 ? (w - padX * 2) / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = padX + stepX * i;
    const y = padY + (h - padY * 2) * (1 - (d.value - min) / (max - min || 1));
    return [x, y];
  });
  const pathD = points.map((pt, i) => (i === 0 ? `M${pt[0]},${pt[1]}` : `L${pt[0]},${pt[1]}`)).join(' ');
  const dots = points.map(pt => `<circle cx="${pt[0]}" cy="${pt[1]}" r="3.5" fill="#22c58b"></circle>`).join('');
  svg.innerHTML = `<path d="${pathD}" fill="none" stroke="#22c58b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>${dots}`;
}
function renderWeightHistory() {
  const wrap = document.getElementById('weightHistoryList');
  const data = [...state.weights].reverse();
  if (!data.length) { wrap.innerHTML = '<p class="empty-hint">🐾 기록이 없어요</p>'; return; }
  wrap.innerHTML = data.map(d => `
    <div class="history-item">
      <span class="hi-date">${fmtDateKr(d.date)}</span>
      <span class="hi-weight">${d.value} kg</span>
    </div>
  `).join('');
}
function initWeightEvents() {
  document.getElementById('weightAddBtn').addEventListener('click', () => {
    const input = document.getElementById('weightInput');
    const val = Number(input.value);
    if (!val || val <= 0) { alert('몸무게를 입력해주세요.'); return; }
    const today = todayStr();
    const existingIdx = state.weights.findIndex(w => w.date === today);
    if (existingIdx >= 0) state.weights[existingIdx].value = val;
    else state.weights.push({ date: today, value: val });
    input.value = '';
    saveAll();
    renderWeightTab();
    renderHome();
  });
}

/* ==========================================================
   마이 탭
   ========================================================== */
function renderMyTab() {
  const p = state.profile;
  document.getElementById('myName').textContent = p.name;
  document.getElementById('myGoalText').textContent = `목표: ${GOAL_LABELS[p.goal]} · ${p.targetWeight}kg`;
  document.getElementById('myGender').textContent = p.gender === 'male' ? '남성' : '여성';
  document.getElementById('myAge').textContent = `${p.age}세`;
  document.getElementById('myHeight').textContent = `${p.height} cm`;
  document.getElementById('myWeight').textContent = `${getLatestWeight()} kg`;
  document.getElementById('myTargetWeight').textContent = `${p.targetWeight} kg`;
  document.getElementById('myActivity').textContent = ACTIVITY_LABELS[p.activity];
  document.getElementById('myDietStyle').textContent = DIET_LABELS[p.dietStyle];
  document.getElementById('myTargetKcal').textContent = `${p.targetKcal} kcal`;
}
function initMyTabEvents() {
  document.getElementById('editProfileBtn').addEventListener('click', () => {
    if (confirm('프로필을 다시 설정할까요? 기존 프로필 정보는 유지되며 새로 입력한 값으로 갱신됩니다.')) {
      startOnboardingFresh();
    }
  });
  document.getElementById('resetAllBtn').addEventListener('click', () => {
    if (confirm('모든 기록(프로필, 식단, 체중, 대화)이 삭제됩니다. 계속할까요?')) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(MEALS_KEY);
      localStorage.removeItem(WEIGHTS_KEY);
      localStorage.removeItem(CHAT_KEY);
      location.reload();
    }
  });
}

/* ==========================================================
   초기화
   ========================================================== */
function init() {
  loadAll();
  initOnboardingEvents();
  initTabEvents();
  initFoodModalEvents();
  initChatEvents();
  initWeightEvents();
  initMyTabEvents();

  if (state.profile) {
    document.getElementById('onboarding').classList.remove('active');
    document.getElementById('app').style.display = 'flex';
    renderAll();
  } else {
    document.getElementById('app').style.display = 'none';
    goToObStep(1);
  }
}

document.addEventListener('DOMContentLoaded', init);
