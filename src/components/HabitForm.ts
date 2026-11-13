import {
  HABIT_TYPES,
  MASTERY_TARGETS,
  MAX_CAPSULE_LEN,
  MAX_HABIT_TITLE_LEN,
  SCHEDULE_TYPES,
  SPHERES,
  type HabitType,
  type ScheduleType,
  type Sphere
} from '../constants';
import type { CreateHabitInput } from '../core/factory';
import { storage } from '../storage';
import { telegram } from '../telegram';
import { modalManager } from '../ui/modal';
import { escapeHtml } from '../utils';
import { HABIT_TEMPLATES, type HabitTemplate } from './HabitLibrary';

const EMOJI_PALETTE = [
  '✨', '💧', '🤸', '📚', '🎯', '🧘', '🚶', '💪',
  '🧠', '📝', '🌱', '🌙', '☀️', '🍎', '🎸', '💎'
] as const;

export function renderHabitPreviewHTML(data: {
  title: string;
  icon: string;
  sphere: Sphere;
  trigger: string;
  norm: string;
  planB: string;
  keystone: boolean;
}): string {
  return `
    <div class="habit-card ${data.keystone ? 'keystone-card' : ''}" style="margin-bottom: 4px; pointer-events: none;" aria-hidden="true">
      <div class="habit-card-header">
        <div class="habit-icon">${escapeHtml(data.icon || '✨')}</div>
        <div class="habit-info">
          <div class="habit-title-row">
            <div class="habit-title">${escapeHtml(data.title || 'Название твоей привычки')}</div>
            <span class="habit-sphere-tag" data-sphere="${escapeHtml(data.sphere)}">${escapeHtml(data.sphere)}</span>
          </div>
          <div class="habit-trigger">${escapeHtml(data.trigger || 'После утреннего кофе → начну с лёгкого шага')}</div>
        </div>
      </div>
      <div class="habit-actions">
        <span class="habit-action-btn amber">${escapeHtml(data.planB || 'План Б (2 мин)')}</span>
        <span class="habit-action-btn primary">${escapeHtml(data.norm || 'Норма')}</span>
      </div>
    </div>
  `;
}

export function getHabitFormHTML(habitId?: string): string {
  const existing = habitId
    ? storage.getState().habits.find((h) => h.id === habitId)
    : undefined;
  const otherHabits = storage.getHabits().filter((h) => h.id !== habitId);

  const curIcon = existing?.icon ?? '✨';
  const curSphere = existing?.sphere ?? SPHERES.BODY;
  const curType = existing?.type ?? HABIT_TYPES.BINARY;
  const curSched = existing?.schedule?.type ?? SCHEDULE_TYPES.DAILY;
  const curEnergy = existing?.energyCost ?? 2;
  const curMastery = existing?.masteryTargetDays ?? 60;
  const capsuleVal = existing?.capsule ?? '';

  return `
    <form id="habitForm" class="habit-form" novalidate>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <h3 class="modal-title" id="modalDialogTitle" style="margin-bottom:0;">
          ${existing ? 'Редактировать привычку' : 'Конструктор привычки'}
        </h3>
        ${
          !existing
            ? `<button type="button" id="openTemplatePickerBtn" class="undo-inline-btn">Шаблоны (${HABIT_TEMPLATES.length})</button>`
            : ''
        }
      </div>

      <div id="templateDrawerBox" style="display:none;" class="section-card">
        <div class="form-field" style="margin-bottom:8px;">
          <label for="tplSearchInput">Быстрый выбор готовой привычки</label>
          <input type="text" id="tplSearchInput" placeholder="Поиск: вода, чтение, фокус, сон...">
        </div>
        <div id="tplListContainer" style="display:flex; flex-direction:column; gap:6px; max-height:190px; overflow-y:auto;"></div>
      </div>

      <div id="habitLivePreviewBox">
        ${renderHabitPreviewHTML({
          title: existing?.title ?? '',
          icon: curIcon,
          sphere: curSphere,
          trigger: existing?.trigger ?? '',
          norm: existing?.norm ?? 'Выполнено',
          planB: existing?.planB ?? 'Минимум 2 мин',
          keystone: existing?.keystone ?? false
        })}
      </div>

      <div class="form-field">
        <label for="habitTitleInput">Название привычки *</label>
        <input
          type="text"
          id="habitTitleInput"
          name="title"
          maxlength="${MAX_HABIT_TITLE_LEN}"
          placeholder="Например: Чтение 20 страниц"
          value="${escapeHtml(existing?.title ?? '')}"
          aria-describedby="habitTitleError"
          required
        >
        <div id="habitTitleError" class="field-error-msg" role="alert"></div>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label for="habitIconInput">Иконка</label>
          <input
            type="text"
            id="habitIconInput"
            name="icon"
            maxlength="4"
            aria-label="Иконка привычки"
            value="${escapeHtml(curIcon)}"
          >
        </div>
        <div class="form-field">
          <label for="habitSphereSelect">Сфера жизни</label>
          <select id="habitSphereSelect" name="sphere">
            ${Object.values(SPHERES)
              .map(
                (s) =>
                  `<option value="${escapeHtml(s)}" ${curSphere === s ? 'selected' : ''}>${escapeHtml(s)}</option>`
              )
              .join('')}
          </select>
        </div>
      </div>

      <div class="emoji-picker-grid" role="group" aria-label="Быстрый выбор иконки">
        ${EMOJI_PALETTE.map(
          (em) =>
            `<button type="button" class="emoji-pick-btn ${curIcon === em ? 'selected' : ''}" data-pick-emoji="${em}" aria-label="Выбрать ${em}">${em}</button>`
        ).join('')}
      </div>

      <div class="form-row">
        <div class="form-field">
          <label for="habitTypeSelect">Механика учёта</label>
          <select id="habitTypeSelect" name="type">
            <option value="binary" ${curType === 'binary' ? 'selected' : ''}>Да / План Б (бинарная)</option>
            <option value="counter" ${curType === 'counter' ? 'selected' : ''}>Количественный счётчик</option>
            <option value="timer" ${curType === 'timer' ? 'selected' : ''}>На время (с таймером)</option>
          </select>
        </div>
        <div class="form-field">
          <label for="habitScheduleSelect">Расписание</label>
          <select id="habitScheduleSelect" name="scheduleType">
            <option value="daily" ${curSched === 'daily' ? 'selected' : ''}>Каждый день</option>
            <option value="weekdays" ${curSched === 'weekdays' ? 'selected' : ''}>Только будни (Пн–Пт)</option>
            <option value="weekends" ${curSched === 'weekends' ? 'selected' : ''}>Выходные (Сб–Вс)</option>
          </select>
        </div>
      </div>

      <div id="counterFieldsRow" class="form-row" style="${curType === 'counter' ? '' : 'display:none;'}">
        <div class="form-field">
          <label for="habitTargetInput">Дневная цель (число)</label>
          <input type="number" id="habitTargetInput" name="targetValue" inputmode="numeric" min="1" max="10000" step="1" value="${existing?.targetValue ?? 8}">
        </div>
        <div class="form-field">
          <label for="habitUnitInput">Единица и шаг (+1)</label>
          <div style="display:grid; grid-template-columns:1fr 68px; gap:6px;">
            <input type="text" id="habitUnitInput" name="unit" maxlength="16" placeholder="ст. / стр." value="${escapeHtml(existing?.unit ?? 'ст.')}">
            <input type="number" id="habitStepInput" name="stepValue" inputmode="numeric" min="1" max="500" step="1" aria-label="Шаг счётчика" value="${existing?.stepValue ?? 1}">
          </div>
        </div>
      </div>

      <div id="timerFieldsRow" class="form-field" style="${curType === 'timer' ? '' : 'display:none;'}">
        <label for="habitTimerMinInput">Длительность фокус-таймера (минут)</label>
        <input type="number" id="habitTimerMinInput" name="timerMinutes" inputmode="numeric" min="1" max="240" step="1" value="${existing?.timerMinutes ?? 20}">
      </div>

      <div class="form-field">
        <label for="habitTriggerInput">Намерение реализации (После чего / Где)</label>
        <input
          type="text"
          id="habitTriggerInput"
          name="trigger"
          maxlength="200"
          placeholder="После утреннего кофе на кухне..."
          value="${escapeHtml(existing?.trigger ?? '')}"
        >
      </div>

      <div class="form-row">
        <div class="form-field">
          <label for="habitNormInput">Полная норма (100%)</label>
          <input type="text" id="habitNormInput" name="norm" maxlength="50" placeholder="30 мин / 20 стр." value="${escapeHtml(existing?.norm ?? 'Выполнено')}">
        </div>
        <div class="form-field">
          <label for="habitPlanBInput">План Б (правило 2 минут)</label>
          <input type="text" id="habitPlanBInput" name="planB" maxlength="50" placeholder="2 мин / 2 стр." value="${escapeHtml(existing?.planB ?? 'Минимум 2 мин')}">
        </div>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label for="habitEnergyCostSelect">Энергозатратность</label>
          <select id="habitEnergyCostSelect" name="energyCost">
            <option value="1" ${curEnergy === 1 ? 'selected' : ''}>⚡ Лёгкая (1 ед.)</option>
            <option value="2" ${curEnergy === 2 ? 'selected' : ''}>⚡⚡ Средняя (2 ед.)</option>
            <option value="3" ${curEnergy === 3 ? 'selected' : ''}>⚡⚡⚡ Ресурсная (3 ед.)</option>
          </select>
        </div>
        <div class="form-field">
          <label for="habitMasterySelect">Порог автоматизма</label>
          <select id="habitMasterySelect" name="masteryTargetDays">
            ${MASTERY_TARGETS.map(
              (d) => `<option value="${d}" ${curMastery === d ? 'selected' : ''}>${d} дней до Мастерства</option>`
            ).join('')}
          </select>
        </div>
      </div>

      ${
        otherHabits.length > 0
          ? `<div class="form-field">
              <label for="habitStackSelect">Цепочка привычек (Habit Stacking — выполнять после)</label>
              <select id="habitStackSelect" name="stackAfterId">
                <option value="">Без привязки к другой привычке</option>
                ${otherHabits
                  .map(
                    (oh) =>
                      `<option value="${escapeHtml(oh.id)}" ${existing?.stackAfterId === oh.id ? 'selected' : ''}>${escapeHtml(oh.icon)} ${escapeHtml(oh.title)}</option>`
                  )
                  .join('')}
              </select>
            </div>`
          : ''
      }

      <label class="toggle-check-row" for="habitKeystoneCheck">
        <div>
          <div style="font-weight:700; color:var(--text-primary);">Ключевая привычка-якорь ⭐</div>
          <div class="settings-desc">Влияет на остальные сферы дня и подсвечивается золотым контуром</div>
        </div>
        <input type="checkbox" id="habitKeystoneCheck" name="keystone" ${existing?.keystone ? 'checked' : ''}>
      </label>

      <label class="toggle-check-row" for="habitIncognitoCheck">
        <div>
          <div style="font-weight:700; color:var(--text-primary);">Приватный режим (Инкогнито) 🕶️</div>
          <div class="settings-desc">Автоматически скрывается с PNG-постеров и публичного шеринга</div>
        </div>
        <input type="checkbox" id="habitIncognitoCheck" name="incognito" ${existing?.incognito ? 'checked' : ''}>
      </label>

      <div class="form-field">
        <div style="display:flex; justify-content:space-between;">
          <label for="habitCapsuleInput">Капсула времени (письмо себе на случай спада)</label>
          <span id="capsuleCharCounter">${capsuleVal.length}/${MAX_CAPSULE_LEN}</span>
        </div>
        <textarea
          id="habitCapsuleInput"
          name="capsule"
          maxlength="${MAX_CAPSULE_LEN}"
          rows="2"
          placeholder="Напиши себе честную причину: ради какого состояния ты начинаешь эту привычку..."
        >${escapeHtml(capsuleVal)}</textarea>
      </div>

      <div class="form-actions">
        ${
          existing
            ? `<button type="button" id="archiveHabitBtn" class="habit-action-btn">В архив</button>
               <button type="button" id="duplicateHabitBtn" class="habit-action-btn">Копия</button>
               <button type="button" id="deleteHabitBtn" class="habit-action-btn danger">В корзину</button>`
            : ''
        }
        <button type="submit" id="saveHabitSubmitBtn" class="habit-action-btn primary">
          ${existing ? 'Сохранить изменения' : 'Создать привычку'}
        </button>
      </div>
    </form>
  `;
}

export function bindHabitFormModal(
  container: HTMLElement,
  signal: AbortSignal,
  habitId: string | undefined,
  onSaved: (message: string) => void
): void {
  const form = container.querySelector('#habitForm') as HTMLFormElement | null;
  if (!form) return;

  const titleInput = container.querySelector('#habitTitleInput') as HTMLInputElement;
  const titleErr = container.querySelector('#habitTitleError') as HTMLElement;
  const iconInput = container.querySelector('#habitIconInput') as HTMLInputElement;
  const sphereSelect = container.querySelector('#habitSphereSelect') as HTMLSelectElement;
  const typeSelect = container.querySelector('#habitTypeSelect') as HTMLSelectElement;
  const triggerInput = container.querySelector('#habitTriggerInput') as HTMLInputElement;
  const normInput = container.querySelector('#habitNormInput') as HTMLInputElement;
  const planBInput = container.querySelector('#habitPlanBInput') as HTMLInputElement;
  const keystoneCheck = container.querySelector('#habitKeystoneCheck') as HTMLInputElement;
  const capsuleInput = container.querySelector('#habitCapsuleInput') as HTMLTextAreaElement;
  const capsuleCounter = container.querySelector('#capsuleCharCounter') as HTMLElement;
  const previewBox = container.querySelector('#habitLivePreviewBox') as HTMLElement;
  const counterRow = container.querySelector('#counterFieldsRow') as HTMLElement;
  const timerRow = container.querySelector('#timerFieldsRow') as HTMLElement;
  const submitBtn = container.querySelector('#saveHabitSubmitBtn') as HTMLButtonElement;

  const refreshPreview = (): void => {
    if (!previewBox) return;
    previewBox.innerHTML = renderHabitPreviewHTML({
      title: titleInput.value.trim(),
      icon: iconInput.value.trim() || '✨',
      sphere: (sphereSelect.value as Sphere) || SPHERES.BODY,
      trigger: triggerInput.value.trim(),
      norm: normInput.value.trim() || 'Выполнено',
      planB: planBInput.value.trim() || 'Минимум 2 мин',
      keystone: keystoneCheck.checked
    });
  };

  [titleInput, iconInput, sphereSelect, triggerInput, normInput, planBInput, keystoneCheck].forEach((el) => {
    el?.addEventListener('input', refreshPreview, { signal });
    el?.addEventListener('change', refreshPreview, { signal });
  });

  capsuleInput?.addEventListener(
    'input',
    () => {
      if (capsuleCounter) {
        capsuleCounter.textContent = `${capsuleInput.value.length}/${MAX_CAPSULE_LEN}`;
      }
    },
    { signal }
  );

  typeSelect?.addEventListener(
    'change',
    () => {
      const t = typeSelect.value as HabitType;
      if (counterRow) counterRow.style.display = t === 'counter' ? '' : 'none';
      if (timerRow) timerRow.style.display = t === 'timer' ? '' : 'none';
    },
    { signal }
  );

  container.querySelectorAll<HTMLButtonElement>('[data-pick-emoji]').forEach((btn) => {
    btn.addEventListener(
      'click',
      () => {
        const em = btn.dataset['pickEmoji'] ?? '✨';
        iconInput.value = em;
        container.querySelectorAll('[data-pick-emoji]').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        telegram.hapticSelection();
        refreshPreview();
      },
      { signal }
    );
  });

  // Библиотека готовых шаблонов с живым поиском
  const tplBtn = container.querySelector('#openTemplatePickerBtn');
  const tplDrawer = container.querySelector('#templateDrawerBox') as HTMLElement | null;
  const tplSearch = container.querySelector('#tplSearchInput') as HTMLInputElement | null;
  const tplList = container.querySelector('#tplListContainer') as HTMLElement | null;

  const renderTemplates = (query = ''): void => {
    if (!tplList) return;
    const q = query.trim().toLowerCase();
    const filtered = HABIT_TEMPLATES.filter(
      (t) =>
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.sphere.toLowerCase().includes(q) ||
        t.trigger.toLowerCase().includes(q)
    );
    tplList.innerHTML = filtered
      .map(
        (t) => `
        <button type="button" class="context-menu-item" data-apply-tpl="${t.id}" style="justify-content:space-between; background:var(--glass-surface-2);">
          <span>${escapeHtml(t.icon)} ${escapeHtml(t.title)}</span>
          <span class="habit-sphere-tag" data-sphere="${escapeHtml(t.sphere)}">${escapeHtml(t.sphere)}</span>
        </button>
      `
      )
      .join('');

    tplList.querySelectorAll<HTMLButtonElement>('[data-apply-tpl]').forEach((b) => {
      b.addEventListener(
        'click',
        () => {
          const tpl: HabitTemplate | undefined = HABIT_TEMPLATES.find(
            (x) => x.id === b.dataset['applyTpl']
          );
          if (!tpl) return;
          titleInput.value = tpl.title;
          iconInput.value = tpl.icon;
          sphereSelect.value = tpl.sphere;
          typeSelect.value = tpl.type;
          triggerInput.value = tpl.trigger;
          normInput.value = tpl.norm;
          planBInput.value = tpl.planB;
          keystoneCheck.checked = Boolean(tpl.keystone);
          capsuleInput.value = tpl.capsule;
          if (capsuleCounter) capsuleCounter.textContent = `${tpl.capsule.length}/${MAX_CAPSULE_LEN}`;
          const targetInp = container.querySelector('#habitTargetInput') as HTMLInputElement | null;
          const unitInp = container.querySelector('#habitUnitInput') as HTMLInputElement | null;
          const stepInp = container.querySelector('#habitStepInput') as HTMLInputElement | null;
          const timerInp = container.querySelector('#habitTimerMinInput') as HTMLInputElement | null;
          if (targetInp && tpl.targetValue) targetInp.value = String(tpl.targetValue);
          if (unitInp && tpl.unit) unitInp.value = tpl.unit;
          if (stepInp && tpl.stepValue) stepInp.value = String(tpl.stepValue);
          if (timerInp && tpl.timerMinutes) timerInp.value = String(tpl.timerMinutes);
          typeSelect.dispatchEvent(new Event('change'));
          if (tplDrawer) tplDrawer.style.display = 'none';
          telegram.haptic('light');
          refreshPreview();
        },
        { signal }
      );
    });
  };

  tplBtn?.addEventListener(
    'click',
    () => {
      if (!tplDrawer) return;
      const open = tplDrawer.style.display === 'none';
      tplDrawer.style.display = open ? 'block' : 'none';
      if (open) renderTemplates(tplSearch?.value ?? '');
    },
    { signal }
  );

  tplSearch?.addEventListener(
    'input',
    () => {
      renderTemplates(tplSearch.value);
    },
    { signal }
  );

  const submitLogic = (): void => {
    const title = titleInput.value.trim();
    if (!title) {
      titleInput.setAttribute('aria-invalid', 'true');
      if (titleErr) titleErr.textContent = 'Пожалуйста, укажите название привычки';
      titleInput.focus();
      telegram.hapticNotification('error');
      return;
    }

    titleInput.removeAttribute('aria-invalid');
    if (titleErr) titleErr.textContent = '';
    if (submitBtn) submitBtn.disabled = true;

    const fd = new FormData(form);
    const chosenType = (String(fd.get('type') ?? 'binary') as HabitType);
    const schedType = (String(fd.get('scheduleType') ?? 'daily') as ScheduleType);
    const energyCostNum = Number(fd.get('energyCost') ?? 2);
    const masteryNum = Number(fd.get('masteryTargetDays') ?? 60);
    const stackAfter = String(fd.get('stackAfterId') ?? '').trim();

    const payload: CreateHabitInput = {
      title,
      icon: String(fd.get('icon') ?? '✨').trim() || '✨',
      sphere: (String(fd.get('sphere') ?? SPHERES.BODY) as Sphere),
      type: chosenType,
      trigger: String(fd.get('trigger') ?? '').trim(),
      norm: String(fd.get('norm') ?? '').trim() || 'Выполнено',
      planB: String(fd.get('planB') ?? '').trim() || 'Минимум 2 мин',
      energyCost: energyCostNum === 1 || energyCostNum === 3 ? energyCostNum : 2,
      masteryTargetDays: masteryNum === 30 || masteryNum === 90 ? masteryNum : 60,
      schedule: { type: schedType },
      keystone: fd.get('keystone') === 'on',
      incognito: fd.get('incognito') === 'on',
      capsule: String(fd.get('capsule') ?? '').trim(),
      ...(chosenType === 'counter'
        ? {
            targetValue: Math.max(1, Number(fd.get('targetValue') ?? 8)),
            unit: String(fd.get('unit') ?? 'раз').trim() || 'раз',
            stepValue: Math.max(1, Number(fd.get('stepValue') ?? 1))
          }
        : {}),
      ...(chosenType === 'timer'
        ? {
            timerMinutes: Math.max(1, Number(fd.get('timerMinutes') ?? 20))
          }
        : {}),
      ...(stackAfter ? { stackAfterId: stackAfter } : {})
    };

    if (habitId) {
      storage.updateHabit(habitId, payload);
      telegram.hapticNotification('success');
      modalManager.close();
      onSaved('Привычка обновлена ✓');
    } else {
      storage.addHabit(payload);
      telegram.hapticNotification('success');
      modalManager.close();
      onSaved('Привычка добавлена ✨');
    }
  };

  form.addEventListener(
    'submit',
    (e) => {
      e.preventDefault();
      submitLogic();
    },
    { signal }
  );

  telegram.showMainButton(habitId ? 'Сохранить изменения' : 'Создать привычку', submitLogic);

  container.querySelector('#archiveHabitBtn')?.addEventListener(
    'click',
    () => {
      if (!habitId) return;
      storage.archiveHabit(habitId, true);
      modalManager.close();
      onSaved('Привычка перенесена в архив');
    },
    { signal }
  );

  container.querySelector('#duplicateHabitBtn')?.addEventListener(
    'click',
    () => {
      if (!habitId) return;
      storage.duplicateHabit(habitId);
      modalManager.close();
      onSaved('Создана копия привычки');
    },
    { signal }
  );

  container.querySelector('#deleteHabitBtn')?.addEventListener(
    'click',
    () => {
      if (!habitId) return;
      modalManager.close();
      void modalManager
        .confirm({
          title: 'Переместить в корзину?',
          message: 'Привычка скроется с главного экрана, но вы сможете восстановить её из корзины в течение 30 дней.',
          confirmLabel: 'В корзину',
          danger: true
        })
        .then((confirmed) => {
          if (confirmed) {
            storage.deleteHabit(habitId, false);
            onSaved('Привычка перемещена в корзину');
          }
        });
    },
    { signal }
  );
}
