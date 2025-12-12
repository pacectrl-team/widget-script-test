"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';

type Intent = {
  intent_id: string;
  external_trip_id: string;
  reduction_pct: number;
  created_at: string;
};

type Confirmation = {
  booking_id: number;
  intent_id: string;
  external_trip_id: string;
  reduction_pct: number;
  confirmed_at: string;
};

type TripAverage = {
  external_trip_id: string;
  count: number;
  average_reduction_pct: number;
};

type StreamPayload = {
  intents: Intent[];
  confirmations: Confirmation[];
  trip_averages: TripAverage[];
};

const API_BASE = 'https://widget-script-test-production.up.railway.app';
const trips = [
  { id: 'HEL-TLL-2025-12-12', label: 'Helsinki → Tallinn' },
  { id: 'VAA-UME-2025-12-15', label: 'Vaasa → Umeå' },
];

export default function Page() {
  const [selectedTrip, setSelectedTrip] = useState(trips[0].id);
  const [speedKn, setSpeedKn] = useState(17);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [averages, setAverages] = useState<TripAverage[]>([]);
  const lastIntentId = useRef<string | null>(null);
  const widgetLoaded = useRef(false);

  const selectedTripLabel = useMemo(() => trips.find(t => t.id === selectedTrip)?.label ?? selectedTrip, [selectedTrip]);

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/v1/admin/stream`);
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as StreamPayload;
        setIntents(data.intents ?? []);
        setConfirmations(data.confirmations ?? []);
        setAverages(data.trip_averages ?? []);
      } catch (err) {
        console.warn('SSE parse error', err);
      }
    };
    es.onerror = (err) => {
      console.warn('SSE error', err);
    };
    return () => es.close();
  }, []);

  const initWidget = (tripId: string) => {
    if (!(window as any).PaceCtrlWidget) return;
    const container = document.getElementById('pacectrl-widget');
    if (container) container.innerHTML = '';
    lastIntentId.current = null;
    (window as any).PaceCtrlWidget.init({
      container: '#pacectrl-widget',
      apiBaseUrl: API_BASE,
      externalTripId: tripId,
      onIntentCreated: (intent: { intent_id: string }) => {
        lastIntentId.current = intent.intent_id;
      },
    });
  };

  useEffect(() => {
    if (widgetLoaded.current) {
      initWidget(selectedTrip);
    }
  }, [selectedTrip]);

  const handleScriptLoaded = () => {
    widgetLoaded.current = true;
    initWidget(selectedTrip);
  };

  const handlePay = async () => {
    if (!lastIntentId.current) {
      alert('Create an intent first.');
      return;
    }
    const bookingId = Math.floor(Math.random() * (50000 - 10000 + 1)) + 10000;
    try {
      const res = await fetch(`${API_BASE}/api/v1/public/choice-confirmations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, intent_id: lastIntentId.current }),
      });
      if (!res.ok) throw new Error(`Confirm failed (${res.status})`);
      await res.json();
      alert(`Confirmed booking ${bookingId}`);
    } catch (err) {
      console.error(err);
      alert('Failed to confirm choice. Check console.');
    }
  };

  const sumBar = (value: number, max: number) => `${Math.min(Math.max(value / max, 0), 1) * 100}%`;
  const sentimentMaxPct = 20;
  const surveyMaxPct = 15;
  const surveyScenarios = [
    { label: 'Overnight ferry to Germany', value: 9.25, labelLines: ['Overnight ferry', 'to Germany'] },
    { label: 'Stockholm weekend getaway', value: 4.7, labelLines: ['Stockholm weekend', 'getaway'] },
    { label: 'Tallinn daytrip', value: 10.3, labelLines: ['Tallinn', 'daytrip'] },
    { label: 'Tankar Lighthouse overnight', value: 14.5, labelLines: ['Tankar Lighthouse', 'overnight'] },
    { label: 'Sunday night home to Vaasa', value: 1.37, labelLines: ['Sunday night home', 'to Vaasa'] },
    { label: 'Winter evening to Tallinn', value: 10.3, labelLines: ['Winter evening', 'to Tallinn'] },
  ];

  const minSpeed = 0;
  const maxSpeed = 20;
  const typicalSpeed = 18;
  const clampSpeed = (v: number) => Math.min(Math.max(v, minSpeed), maxSpeed);
  const normalizedSpeed = clampSpeed(speedKn);
  const emissionPct = Math.pow(normalizedSpeed / typicalSpeed, 3) * 100;

  const scaleX = (s: number) => 50 + ((s - minSpeed) / (maxSpeed - minSpeed)) * 320;
  const scaleY = (e: number) => 380 - (e / 100) * 260;

  const curvePath = useMemo(() => {
    const steps = 20;
    const pts = Array.from({ length: steps + 1 }, (_, i) => {
      const s = minSpeed + ((maxSpeed - minSpeed) * i) / steps;
      const e = Math.pow(s / typicalSpeed, 3) * 100;
      return `${scaleX(s)},${scaleY(e)}`;
    });
    return `M ${pts.join(' L ')}`;
  }, []);

  return (
    <div className="min-h-screen bg-foam">
      <Script src={`${API_BASE}/widget.js`} strategy="afterInteractive" onLoad={handleScriptLoaded} />
      <header className="bg-gradient-to-r from-kelp to-tide text-white px-6 py-10 shadow-card">
        <div className="max-w-6xl mx-auto flex flex-col gap-4">
          <p className="text-sm uppercase tracking-[0.2em] text-foamDark">Live demo / prototype</p>
          <h1 className="text-3xl sm:text-4xl font-semibold">Since we can't be there with you right now…</h1>
          <p className="text-foamDark text-lg max-w-3xl">
            We decided to set up a site that explains what we are trying to solve, what we are building, and lets you experience it live.
            The site tries to simulate the full experience of PaceCtrl in action during a ferry booking
          </p>
          <p className="text-foamDark text-lg max-w-3xl">
            This site now uses API calls to fetch min/max speed values, shows a working widget, streams live intents and confirmations,
            and lets you "confirm" a booking that sends data back to the system.
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        <section className="grid gap-6">
          <div className="bg-white border border-foamDark/40 rounded-2xl p-6 shadow-card space-y-4">
            <h2 className="text-xl font-semibold">What we're solving</h2>
            <p className="text-slate-600 leading-relaxed">
              What we've learned during the project course is that speed has a big impact on the emissions of a ferry. The fuel use is roughly the cube of the speed,
              so even a small reduction can have a big effect.
            </p>
            <p className="text-slate-600 leading-relaxed">
              Our idea is to give passengers a voice in the speed choice, within safe limits set by the operator. So for example, a trip from Helsinki to Tallinn
              that typically goes at 18 knots could allow passengers to nudge it down to 16 knots if they wish. This would reduce fuel consumption and emissions by about 30%.
            </p>
            <p className="text-slate-600 leading-relaxed">
                Note that this is not about making the ferry "slow"—it's about optimizing speed for sustainability while respecting schedules - and giving passengers a say in that balance.

            </p>
            <p className="text-slate-600 leading-relaxed">
                Underneath you can test out how big of an impact the speed actually has on emissions. Move the slider.
            </p>
            <div className="bg-foam rounded-xl p-4 border border-foamDark/40">
              <div className="flex items-center justify-between mb-2 text-sm text-slate-700">
                <span>Speed vs emissions (cube rule)</span>
                <span className="font-semibold">{normalizedSpeed.toFixed(1)} kn · {emissionPct.toFixed(0)}% vs typical</span>
              </div>
              <div className="text-xs text-slate-600 mb-2">Emissions ∝ (speed³). Even a small nudge left drops fuel burn fast.</div>
              <svg viewBox="0 0 420 460" className="w-full h-[34rem] sm:h-[28rem]">
                <rect x="0" y="0" width="420" height="460" fill="white" rx="12" />
                <line x1="50" y1="380" x2="370" y2="380" stroke="#94a3b8" strokeWidth="1" />
                <line x1="50" y1="80" x2="50" y2="380" stroke="#94a3b8" strokeWidth="1" />
                {[0, 25, 50, 75, 100].map((e) => (
                  <g key={e}>
                    <line x1="44" y1={scaleY(e)} x2="50" y2={scaleY(e)} stroke="#94a3b8" strokeWidth="1" />
                    <text x="18" y={scaleY(e) + 4} fontSize="10" fill="#475569">{e}%</text>
                  </g>
                ))}
                {[0, 5, 10, 15, 20].map((s) => (
                  <g key={s}>
                    <line x1={scaleX(s)} y1="380" x2={scaleX(s)} y2="386" stroke="#94a3b8" strokeWidth="1" />
                    <text x={scaleX(s) - 6} y="402" fontSize="10" fill="#475569">{s}</text>
                  </g>
                ))}
                <path d={curvePath} fill="none" stroke="#0b7a57" strokeWidth="3" />
                <line
                  x1={scaleX(normalizedSpeed)}
                  y1={scaleY(emissionPct)}
                  x2="50"
                  y2={scaleY(emissionPct)}
                  stroke="#cbd5e1"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <line
                  x1={scaleX(typicalSpeed)}
                  y1={scaleY(100)}
                  x2="50"
                  y2={scaleY(100)}
                  stroke="#cbd5e1"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <circle cx={scaleX(normalizedSpeed)} cy={scaleY(emissionPct)} r="7" fill="#0b7a57" />
                <text x={scaleX(normalizedSpeed) + 8} y={scaleY(emissionPct) - 8} fontSize="11" fill="#0b7a57">You</text>
                <circle cx={scaleX(typicalSpeed)} cy={scaleY(100)} r="7" fill="#0ea5e9" />
                <text x={scaleX(typicalSpeed) + 8} y={scaleY(100) - 8} fontSize="11" fill="#0ea5e9">Typical</text>
                <text x="330" y="340" fontSize="11" fill="#475569">Speed (kn)</text>
                <text x="58" y="58" fontSize="11" fill="#475569">Emissions vs typical (%)</text>
                <text x="210" y="26" fontSize="11" fill="#475569">Emissions = (speed / {typicalSpeed})³ × 100</text>
              </svg>
              <div className="mt-4 space-y-2">
                <input
                  type="range"
                  min={minSpeed}
                  max={maxSpeed}
                  step={0.1}
                  value={normalizedSpeed}
                  onChange={(e) => setSpeedKn(parseFloat(e.target.value))}
                  className="w-full accent-kelp h-3"
                />
                <div className="text-xs text-slate-600">100% = typical burn at {typicalSpeed} kn. Slide left to see how little it takes to drop fuel.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border border-foamDark/40 rounded-2xl p-6 shadow-card">
          <h2 className="text-xl font-semibold mb-2">Our idea</h2>
          <ul className="space-y-2 text-slate-700 list-disc list-inside">
            <li>Give operators and easy way to implement a speed voting mechanism.</li>
            <li>All it takes is a few lines of code. A script to get the widget working, and a few lines in the backend to get the passenger decisions actually confirmed.</li>
            <li>Passengers would see in the booking flow (for example when booking on Tallink) a slider widget (as seen below)</li>
            <li>Passengers shouldn't even know that it's actually part of a separate system</li>
          </ul>
        </section>

        <section className="bg-white border rounded-2xl p-6 shadow-card grid gap-6 lg:grid-cols-[360px,1fr] items-start">
          <div className="text-foam rounded-xl p-4 space-y-3">
            <div>
              <label className="text-sm text-black" htmlFor="trip-select">Trip</label>
              <select
                id="trip-select"
                value={selectedTrip}
                onChange={(e) => setSelectedTrip(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/40  text-black px-3 py-2"
              >
                {trips.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div id="pacectrl-widget" data-external-trip-id={selectedTrip} className="bg-foam/5 rounded-lg min-h-[280px]"></div>
            <button
              onClick={handlePay}
              className="w-full rounded-lg bg-kelp text-white font-semibold py-2 hover:brightness-105"
            >
              Pay & confirm
            </button>
          </div>
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-wide text-kelp font-semibold">Mock booking flow</p>
            <h3 className="text-2xl font-semibold">{selectedTripLabel}</h3>
            <p className="text-slate-700">Adjust speed in the widget, then hit Pay to confirm. Everyone on this page sees the updates instantly.</p>
            <div className="grid sm:grid-cols-2 gap-3 text-sm text-slate-700">
              <div className="p-3 bg-foam rounded-lg border border-foamDark/60">
                <div className="text-slate-500 text-xs">Embed simplicity</div>
                <div className="font-semibold">Drop one script + init call.</div>
              </div>
              <div className="p-3 bg-foam rounded-lg border border-foamDark/60">
                <div className="text-slate-500 text-xs">Operator control</div>
                <div className="font-semibold">Bounds set per trip; captain decides final speed.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border border-foamDark/40 rounded-2xl p-6 shadow-card">
                    <h3 className="text-xl font-semibold mb-4">Two example sailings (mock booking)</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="border border-foamDark/40 rounded-xl p-4 bg-foam">
                        <div className="flex items-center gap-3 mb-2">
                          <img src="https://upload.wikimedia.org/wikipedia/commons/6/68/Wasaline-logo.png" alt="Wasaline" className="h-8 object-contain" />
                          <span className="text-sm text-slate-600">Vaasa → Umeå</span>
                        </div>
                        <div className="flex justify-between text-sm font-semibold text-tide mb-1">
                          <span>Depart 13:00</span><span>Arrive 16:30</span>
                        </div>
                        <div className="text-xs text-slate-600 mb-3">Port of Vaasa → Port of Umeå · Leisure sailing</div>
                        <div className="bg-white rounded-lg p-3 border border-foamDark/50">
                          <div className="text-xs text-slate-500 mb-1">Widget sits inline here</div>
                          <div className="h-24 rounded-md bg-foamDark/20 border border-foamDark/30 flex items-center justify-center text-sm text-slate-600">
                            Mood slider (live in real flow)
                          </div>
                        </div>
                      </div>
                      <div className="border border-foamDark/40 rounded-xl p-4 bg-foam">
                        <div className="flex items-center gap-3 mb-2">
                          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Tallink_logo.svg/1200px-Tallink_logo.svg.png" alt="Tallink" className="h-6 object-contain" />
                          <span className="text-sm text-slate-600">Helsinki → Turku</span>
                        </div>
                        <div className="flex justify-between text-sm font-semibold text-tide mb-1">
                          <span>Depart 08:00</span><span>Arrive 11:45</span>
                        </div>
                        <div className="text-xs text-slate-600 mb-3">Olympia Terminal → Port of Turku · Select sailings only</div>
                        <div className="bg-white rounded-lg p-3 border border-foamDark/50">
                          <div className="text-xs text-slate-500 mb-1">Widget sits inline here</div>
                          <div className="h-24 rounded-md bg-foamDark/20 border border-foamDark/30 flex items-center justify-center text-sm text-slate-600">
                            Mood slider (live in real flow)
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-slate-600 text-sm mt-3">We'd only use the widget on certain tourism-focused sailings; freight-dominant departures remain untouched.</p>
                  </section>

                  <section className="bg-white border border-foamDark/40 rounded-2xl p-6 shadow-card">
                    <h3 className="text-xl font-semibold mb-3">Embedding the widget is minimal</h3>
                    <pre className="bg-foam text-tide text-sm p-4 rounded-lg overflow-auto"><code>{`<div id="pacectrl-widget" data-external-trip-id="HEL-TLL-2025-12-12"></div>
          <script src="${API_BASE}/widget.js"></script>
          <script>
            window.PaceCtrlWidget.init({
              container: '#pacectrl-widget',
              apiBaseUrl: '${API_BASE}',
              externalTripId: 'HEL-TLL-2025-12-12'
            });
          </script>`}</code></pre>
                    <p className="text-slate-700 mt-3">Provide trip id + API base. The bundle handles theme, validation, and posting intents.</p>
                  </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="bg-white border border-foamDark/40 rounded-2xl p-6 shadow-card">
            <h3 className="text-lg font-semibold">Intents (live)</h3>
            <p className="text-slate-600 text-sm mb-3">Updates in real time from the SSE feed.</p>
            <div className="overflow-auto max-h-72">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr><th className="py-1">Intent</th><th>Trip</th><th>Reduction %</th><th>Created</th></tr>
                </thead>
                <tbody>
                  {intents.length === 0 && (
                    <tr><td colSpan={4} className="py-2 text-slate-500">No data</td></tr>
                  )}
                  {intents.map((r) => (
                    <tr key={r.intent_id} className="border-b border-foamDark/40 last:border-b-0">
                      <td className="py-1">{r.intent_id}</td>
                      <td>{r.external_trip_id}</td>
                      <td>{r.reduction_pct.toFixed(1)}%</td>
                      <td className="text-slate-500">{r.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-white border border-foamDark/40 rounded-2xl p-6 shadow-card">
            <h3 className="text-lg font-semibold">Confirmed choices (live)</h3>
            <p className="text-slate-600 text-sm mb-3">Also streams from the same SSE channel.</p>
            <div className="overflow-auto max-h-72">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr><th className="py-1">Booking</th><th>Intent</th><th>Trip</th><th>Reduction %</th><th>Confirmed</th></tr>
                </thead>
                <tbody>
                  {confirmations.length === 0 && (
                    <tr><td colSpan={5} className="py-2 text-slate-500">No data</td></tr>
                  )}
                  {confirmations.map((r) => (
                    <tr key={`${r.booking_id}-${r.intent_id}`} className="border-b border-foamDark/40 last:border-b-0">
                      <td className="py-1">{r.booking_id}</td>
                      <td>{r.intent_id}</td>
                      <td>{r.external_trip_id}</td>
                      <td>{r.reduction_pct.toFixed(1)}%</td>
                      <td className="text-slate-500">{r.confirmed_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="bg-white border border-foamDark/40 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <p className="text-sm uppercase tracking-wide text-kelp font-semibold">Trip sentiment</p>
              <h3 className="text-xl font-semibold">Live averages per trip</h3>
              <p className="text-slate-600 text-sm">This is what people have voted during the pitching event on 12th of December 2025.</p>
            </div>
            <div className="text-slate-600 text-sm">Chart updates as confirmations arrive.</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {averages.length === 0 && <div className="text-slate-500">No confirmations yet.</div>}
            {averages.length > 0 && (
              <div className="sm:col-span-2 bg-foam rounded-xl border border-foamDark/60 p-4">
                <svg viewBox="0 0 560 320" className="w-full h-80">
                  <rect x="0" y="0" width="560" height="320" fill="white" rx="12" />
                  <line x1="60" y1="260" x2="520" y2="260" stroke="#94a3b8" strokeWidth="1" />
                  <line x1="60" y1="40" x2="60" y2="260" stroke="#94a3b8" strokeWidth="1" />
                  {[0, 5, 10, 15, 20].map((tick) => (
                    <g key={tick}>
                      <line x1="56" y1={260 - (tick / sentimentMaxPct) * 200} x2="60" y2={260 - (tick / sentimentMaxPct) * 200} stroke="#94a3b8" strokeWidth="1" />
                      <text x="34" y={264 - (tick / sentimentMaxPct) * 200} fontSize="10" fill="#475569">{tick}%</text>
                    </g>
                  ))}
                  {averages.map((a, idx) => {
                    const capped = Math.min(a.average_reduction_pct, sentimentMaxPct);
                    const band = 440 / Math.max(averages.length, 1);
                    const barWidth = Math.max(band * 0.5, 30);
                    const x = 60 + band * idx + (band - barWidth) / 2;
                    const barH = (capped / sentimentMaxPct) * 200;
                    const y = 260 - barH;
                    return (
                      <g key={a.external_trip_id}>
                        <rect x={x} y={y} width={barWidth} height={barH} rx="6" fill="#0b7a57" />
                        <text x={x + barWidth / 2} y={y - 6} fontSize="11" fill="#0b7a57" textAnchor="middle">{capped.toFixed(1)}%</text>
                        <text x={x + barWidth / 2} y="276" fontSize="10" fill="#475569" textAnchor="middle">{a.external_trip_id}</text>
                        <text x={x + barWidth / 2} y="292" fontSize="10" fill="#475569" textAnchor="middle">{a.count} conf.</text>
                      </g>
                    );
                  })}
                  <text x="470" y="308" fontSize="11" fill="#475569">0–{sentimentMaxPct}% scale</text>
                </svg>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white border border-foamDark/40 rounded-2xl p-6 shadow-card space-y-3">
          <h3 className="text-xl font-semibold">What people picked in our scenario form</h3>
          <p className="text-slate-700">We gathered feedback via a simple form where people could see different trip setups and pick how much they would be willing to slow down the ferry for each.
            We got in total 25 responses.</p>
          <p className="text-slate-700">
            Scenarios included short daytrips, weekend getaways, and overnight ferries. People could pick from about +10% (boat sped up) to -20% (quite a bit slower).
            On average, people were willing to shave a few percent off speed.</p>
          <a
            className="text-tide font-semibold underline"
            href="https://pacectrl-widgets.netlify.app/"
            target="_blank"
            rel="noreferrer"
          >
            Try the form yourself ↗
          </a>
          <div className="bg-foam rounded-xl border border-foamDark/60 p-4">
            <div className="overflow-x-auto">
              <svg viewBox="0 0 760 420" className="min-w-[640px] w-[720px] max-w-none h-96">
              <rect x="0" y="0" width="760" height="420" fill="white" rx="12" />
              <line x1="100" y1="60" x2="100" y2="340" stroke="#94a3b8" strokeWidth="1" />
              <line x1="100" y1="340" x2="700" y2="340" stroke="#94a3b8" strokeWidth="1" />
              {[0, 5, 10, 15].map((tick) => {
                const y = 340 - (tick / surveyMaxPct) * 240;
                return (
                  <g key={tick}>
                    <line x1="96" y1={y} x2="100" y2={y} stroke="#94a3b8" strokeWidth="1" />
                    <text x="80" y={y + 4} fontSize="10" fill="#475569" textAnchor="end">{tick}%</text>
                  </g>
                );
              })}
              {surveyScenarios.map((s, idx) => {
                const capped = Math.min(s.value, surveyMaxPct);
                const band = 600 / Math.max(surveyScenarios.length, 1);
                const barWidth = Math.max(band * 0.5, 48);
                const x = 100 + band * idx + (band - barWidth) / 2;
                const barH = (capped / surveyMaxPct) * 240;
                const y = 340 - barH;
                const labelX = x + barWidth / 2;
                return (
                  <g key={s.label}>
                    <rect x={x} y={y} width={barWidth} height={barH} rx="6" fill="#0b7a57" />
                    <text x={labelX} y={y - 8} fontSize="11" fill="#0b7a57" textAnchor="middle">{capped.toFixed(2)}%</text>
                    <text x={labelX} y="358" fontSize="10" fill="#475569" textAnchor="middle">
                      {s.labelLines.map((line, i) => (
                        <tspan key={line} x={labelX} dy={i === 0 ? 0 : 12}>{line}</tspan>
                      ))}
                    </text>
                  </g>
                );
              })}
              </svg>
            </div>
          </div>
        </section>

        <section className="bg-white border border-foamDark/40 rounded-2xl p-6 shadow-card space-y-3">
          <h3 className="text-xl font-semibold">What we've done so far, and what needs to be done</h3>
          <ul className="list-disc list-inside text-slate-700 space-y-2">
            <li>Gathered initial passenger feedback on multiple scenarios.</li>
            <li>Discussed feasibility and operational concerns with Wasaline.</li>
            <li>Started implementing backend and frontend; MVP backend is live for demo use.</li>
            <li>MVP backend is intentionally a dummy (no auth) for this demo.</li>
            <li>Planned the database structure, but it is not yet implemented.</li>
            <li>First version of frontend, backend and a dummy database is hosted on railway. But nothing worth showing yet. Hence this demo site only.</li>
          </ul>
          <p className="text-slate-700 text-sm">MVP backend with API endpoints: <a className="text-tide underline font-semibold" href="https://widget-script-test-production.up.railway.app/docs" target="_blank" rel="noreferrer">https://widget-script-test-production.up.railway.app/docs</a></p>
        </section>

        <section className="bg-white border border-foamDark/40 rounded-2xl p-6 shadow-card space-y-3">
          <h3 className="text-xl font-semibold">Guardrails</h3>
          <ul className="list-disc list-inside text-slate-700 space-y-2">
            <li>Captains always decide final speed; the widget only reflects passenger preference.</li>
            <li>Max/min reductions stay within operator-set bounds per trip.</li>
            <li>PaceCtrl Portal lets operators manage trips, set limits, and view aggregated data. Still to be implemented</li>
            <li>Transport-heavy routes (lorries and stuff) are out of scope; tourism sailings are the sweet spot. This is something we learned after having a meeting with Wasaline.</li>
          </ul>
        </section>

        <section className="bg-white border border-foamDark/40 rounded-2xl p-6 shadow-card space-y-3">
          <h3 className="text-xl font-semibold">After the voyage</h3>
          <p className="text-slate-700">
            When operators send their post-cruise “Thanks for choosing us” message, they can embed a small visual:
            typical CO₂ for the route, average requested reduction, and estimated CO₂ saved. A quick, clear close to the story.
          </p>
        </section>
      </main>
    </div>
  );
}
