type Theme = {
  font_family: string;
  primary_color: string;
  danger_color: string;
  bg_color: string;
  text_color: string;
  radius_px: number;
};

type WidgetConfig = {
  external_trip_id: string;
  speed_min_kn: number;
  speed_max_kn: number;
  speed_default_kn: number;
  max_reduction_pct: number;
  theme: Theme;
};

type InitOptions = {
  container?: string | HTMLElement;
  externalTripId?: string;
  apiBaseUrl: string;
  onIntentCreated?: (intent: { intent_id: string; reduction_pct: number }) => void;
};

type InternalState = {
  config: WidgetConfig;
  value: number;
  intentTimer?: number;
};

const DEFAULT_THEME: Theme = {
  font_family: "Inter, system-ui",
  primary_color: "#10b981",
  danger_color: "#ef4444",
  bg_color: "#ffffff",
  text_color: "#0f172a",
  radius_px: 16,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function mixColor(a: string, b: string, t: number) {
  const parse = (hex: string) => {
    const chunk = hex.replace("#", "");
    return [
      parseInt(chunk.substring(0, 2), 16),
      parseInt(chunk.substring(2, 4), 16),
      parseInt(chunk.substring(4, 6), 16),
    ];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b2 = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, b2]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

function hexToRgba(hex: string, alpha: number) {
  const chunk = hex.replace("#", "");
  const r = parseInt(chunk.substring(0, 2), 16);
  const g = parseInt(chunk.substring(2, 4), 16);
  const b = parseInt(chunk.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function moodColor(value: number, max: number, theme: Theme) {
  const ratio = max > 0 ? clamp(value / max, 0, 1) : 0;
  if (ratio <= 0.5) {
    return mixColor(theme.danger_color, "#f59e0b", ratio / 0.5);
  }
  return mixColor("#f59e0b", theme.primary_color, (ratio - 0.5) / 0.5);
}

function moodLabel(value: number, max: number) {
  const ratio = max > 0 ? clamp(value / max, 0, 1) : 0;
  if (ratio > 0.66) return "Plenty of time";
  if (ratio > 0.33) return "Balanced";
  return "Keep schedule";
}

function ensureStylesInjected() {
  const id = "pacectrl-widget-styles";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .pc-card { background: var(--pc-card-bg, linear-gradient(180deg, rgba(16,185,129,0.08) 0%, #ffffff 72%)); color: var(--pc-text); border: 1px solid #e5e7eb; border-radius: var(--pc-radius); padding: 18px 18px 16px; font-family: var(--pc-font); box-shadow: 0 14px 32px rgba(15, 23, 42, 0.12); max-width: 420px; position: relative; overflow: hidden; }
    .pc-card::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 18% -12%, rgba(239, 68, 68, 0.12), transparent 40%), radial-gradient(ellipse at 82% 0%, rgba(16, 185, 129, 0.14), transparent 45%); }
    .pc-header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; position: relative; z-index: 1; }
    .pc-title { font-weight: 800; letter-spacing: -0.01em; font-size: 18px; }
    .pc-trip { font-size: 12px; color: #6b7280; text-align: right; }
    .pc-mood { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.7); border: 1px solid #e2e8f0; margin-bottom: 12px; position: relative; z-index: 1; }
    .pc-mood-label { font-size: 12px; color: #475569; }
    .pc-mood-value { font-weight: 800; letter-spacing: -0.01em; }
    .pc-slider-block { position: relative; z-index: 1; background: rgba(255,255,255,0.85); border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; }
    .pc-slider-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .pc-slider-label { font-weight: 700; font-size: 14px; }
    .pc-value { font-weight: 800; min-width: 64px; text-align: right; font-variant-numeric: tabular-nums; }
    .pc-slider { width: 100%; accent-color: var(--pc-primary); }
    .pc-slider::-webkit-slider-thumb { appearance: none; width: 18px; height: 18px; border-radius: 999px; background: currentColor; border: 2px solid #fff; box-shadow: 0 3px 12px rgba(0,0,0,0.18); }
    .pc-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 999px; background: currentColor; border: 2px solid #fff; box-shadow: 0 3px 12px rgba(0,0,0,0.18); }
    .pc-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; position: relative; z-index: 1; }
    .pc-metric { background: rgba(255,255,255,0.9); border-radius: 12px; padding: 10px; border: 1px solid #e2e8f0; min-height: 70px; display: grid; gap: 4px; }
    .pc-label { font-size: 12px; color: #475569; margin-bottom: 2px; }
    .pc-strong { font-weight: 800; color: var(--pc-text); font-variant-numeric: tabular-nums; }
    .pc-status { font-size: 12px; color: #475569; margin-top: 10px; min-height: 18px; position: relative; z-index: 1; }
  `;
  document.head.appendChild(style);
}

function applyTheme(container: HTMLElement, theme: Theme) {
  container.style.setProperty("--pc-bg", theme.bg_color);
  container.style.setProperty("--pc-text", theme.text_color);
  container.style.setProperty("--pc-primary", theme.primary_color);
  container.style.setProperty("--pc-danger", theme.danger_color);
  container.style.setProperty("--pc-radius", `${theme.radius_px}px`);
  container.style.setProperty("--pc-font", theme.font_family);
}

async function fetchConfig(apiBaseUrl: string, externalTripId: string): Promise<WidgetConfig> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/api/v1/public/widget/config?external_trip_id=${encodeURIComponent(
    externalTripId
  )}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Config fetch failed (${res.status})`);
  }
  return res.json();
}

function createMarkup(container: HTMLElement, state: InternalState) {
  container.innerHTML = `
    <div class="pc-card pc-card--mood">
      <div class="pc-header">
        <div>
          <div class="pc-title">PaceCtrl</div>
          <div class="pc-label">Trip speed vote</div>
        </div>
        <div class="pc-trip">${state.config.external_trip_id}</div>
      </div>

      <div class="pc-mood">
        <div class="pc-mood-label">Mood</div>
        <div class="pc-mood-value pc-mood-text">Balanced</div>
      </div>

      <div class="pc-slider-block">
        <div class="pc-slider-top">
          <span class="pc-slider-label">Adjust trip pace</span>
          <span class="pc-value"><span class="pc-percent">${state.value.toFixed(1)}%</span></span>
        </div>
        <input type="range" min="0" max="${state.config.max_reduction_pct}" step="0.5" value="${state.value}" class="pc-slider" aria-label="Choose speed reduction percentage" />
      </div>

      <div class="pc-metrics">
        <div class="pc-metric">
          <div class="pc-label">Added time</div>
          <div class="pc-strong pc-delay">+0 min</div>
        </div>
        <div class="pc-metric">
          <div class="pc-label">Impact</div>
          <div class="pc-strong pc-saved">0 kg CO₂</div>
        </div>
        <div class="pc-metric">
          <div class="pc-label">Your pace</div>
          <div class="pc-strong pc-choice">0.0% slower</div>
        </div>
      </div>
      <div class="pc-status" role="status"></div>
    </div>
  `;
}

function nearestForm(el: HTMLElement | null) {
  let current: HTMLElement | null = el;
  while (current) {
    if (current.tagName === "FORM") return current as HTMLFormElement;
    current = current.parentElement;
  }
  return null;
}

function updateUI(container: HTMLElement, state: InternalState) {
  const slider = container.querySelector<HTMLInputElement>(".pc-slider");
  const percentEl = container.querySelector<HTMLElement>(".pc-percent");
  const delayEl = container.querySelector<HTMLElement>(".pc-delay");
  const savedEl = container.querySelector<HTMLElement>(".pc-saved");
  const moodEl = container.querySelector<HTMLElement>(".pc-mood-text");
  const choiceEl = container.querySelector<HTMLElement>(".pc-choice");
  const cardEl = container.querySelector<HTMLElement>(".pc-card");

  if (!slider || !percentEl || !delayEl || !savedEl || !moodEl || !choiceEl || !cardEl) return;

  slider.value = state.value.toString();
  const color = moodColor(state.value, state.config.max_reduction_pct, state.config.theme);
  slider.style.color = color;
  const ratio = state.config.max_reduction_pct > 0 ? state.value / state.config.max_reduction_pct : 0;
  const percent = clamp(ratio * 100, 0, 100);
  slider.style.background = `linear-gradient(90deg, ${state.config.theme.danger_color} 0%, ${color} ${percent}%, #e5e7eb ${Math.min(percent + 0.1, 100)}%)`;
  cardEl.style.setProperty("--pc-card-bg", `linear-gradient(180deg, ${hexToRgba(color, 0.14)} 0%, #ffffff 70%)`);

  percentEl.textContent = `${state.value.toFixed(1)}%`;
  moodEl.textContent = moodLabel(state.value, state.config.max_reduction_pct);

  const delayMinutes = Math.round(ratio * 25);
  const savedKg = Math.round(ratio * 300);

  delayEl.textContent = `+${delayMinutes} min`;
  savedEl.textContent = `${savedKg} kg CO₂`;
  choiceEl.textContent = state.value > 0 ? `${state.value.toFixed(1)}% slower` : "Keep schedule";
}

async function handleConfirm(
  container: HTMLElement,
  state: InternalState,
  apiBaseUrl: string,
  onIntentCreated?: (intent: { intent_id: string; reduction_pct: number }) => void
) {
  const statusEl = container.querySelector<HTMLElement>(".pc-status");
  if (!statusEl) return;

  statusEl.textContent = "Sending choice...";

  const url = `${apiBaseUrl.replace(/\/$/, "")}/api/v1/public/choice-intents`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        external_trip_id: state.config.external_trip_id,
        reduction_pct: state.value,
      }),
    });
    if (!res.ok) {
      throw new Error(`Intent creation failed (${res.status})`);
    }
    const data = await res.json();
    statusEl.textContent = `Intent created: ${data.intent_id}`;

    const form = nearestForm(container);
    if (form) {
      let input = form.querySelector<HTMLInputElement>('input[name="pacectrl_intent_id"]');
      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.name = "pacectrl_intent_id";
        form.appendChild(input);
      }
      input.value = data.intent_id;
    }

    if (onIntentCreated) {
      onIntentCreated({ intent_id: data.intent_id, reduction_pct: state.value });
    }
  } catch (err) {
    statusEl.textContent = err instanceof Error ? err.message : "Failed to send choice";
  }
}

function scheduleIntent(
  container: HTMLElement,
  state: InternalState,
  apiBaseUrl: string,
  onIntentCreated?: (intent: { intent_id: string; reduction_pct: number }) => void
) {
  if (state.intentTimer) {
    window.clearTimeout(state.intentTimer);
  }
  state.intentTimer = window.setTimeout(() => {
    handleConfirm(container, state, apiBaseUrl, onIntentCreated);
  }, 400);
}

async function init(options: InitOptions) {
  if (!options || !options.apiBaseUrl) {
    throw new Error("apiBaseUrl is required");
  }

  const container =
    typeof options.container === "string"
      ? (document.querySelector(options.container) as HTMLElement | null)
      : (options.container as HTMLElement | null) || document.querySelector("#pacectrl-widget");

  if (!container) {
    throw new Error("Widget container not found");
  }

  const externalTripId = options.externalTripId || container.getAttribute("data-external-trip-id");
  if (!externalTripId) {
    throw new Error("externalTripId is required (pass prop or data-external-trip-id)");
  }

  ensureStylesInjected();

  const config = await fetchConfig(options.apiBaseUrl, externalTripId);
  const initialValue = Math.round((config.max_reduction_pct / 2) * 10) / 10;
  const state: InternalState = { config, value: initialValue };

  applyTheme(container, { ...DEFAULT_THEME, ...config.theme });
  createMarkup(container, state);
  updateUI(container, state);
  scheduleIntent(container, state, options.apiBaseUrl, options.onIntentCreated);

  const slider = container.querySelector<HTMLInputElement>(".pc-slider");
  if (slider) {
    slider.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      state.value = parseFloat(target.value);
      updateUI(container, state);
      scheduleIntent(container, state, options.apiBaseUrl, options.onIntentCreated);
    });
  }

  return state;
}

const api = { init };

// Expose globally for UMD usage.
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).PaceCtrlWidget = api;
}

export { init };
export default api;
