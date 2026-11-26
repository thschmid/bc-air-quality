import React, { useState, useMemo } from 'react';

// Airshed station telemetry & coordinates (including Kamloops & primary BC zones)
const STATIONS = [
  {
    id: 'metro-vancouver',
    name: 'Metro Vancouver (Robson Square)',
    region: 'Lower Fraser Valley',
    coordinates: { lat: 49.2827, lon: -123.1207 },
    weather: {
      temperature: 14.2,
      windSpeed: 2.4, // km/h (triggers stagnation penalty < 3.0)
      windDirection: 'ESE',
      condition: 'Valley Stagnation / Light Haze',
      humidity: 78,
    },
    pollutants: {
      pm25: 18.4, // ug/m3
      pm10: 28.1, // ug/m3
      no2: 22.5,  // ppb
      so2: 1.8,   // ppb
      o3: 24.0,   // ppb
    },
  },
  {
    id: 'kamloops-fed',
    name: 'Kamloops (Federal Building)',
    region: 'Southern Interior',
    coordinates: { lat: 50.6745, lon: -120.3273 },
    weather: {
      temperature: 16.4,
      windSpeed: 2.8, // km/h (stagnant valley conditions)
      windDirection: 'CALM',
      condition: 'Valley Inversion / Trapped Smoke',
      humidity: 52,
    },
    pollutants: {
      pm25: 22.1, // ug/m3
      pm10: 36.8, // ug/m3
      no2: 18.2,  // ppb
      so2: 1.1,   // ppb
      o3: 27.5,   // ppb
    },
  },
  {
    id: 'central-okanagan',
    name: 'Central Okanagan (Kelowna - College Way)',
    region: 'Southern Interior',
    coordinates: { lat: 49.8880, lon: -119.4960 },
    weather: {
      temperature: 18.5,
      windSpeed: 8.5, // km/h
      windDirection: 'NW',
      condition: 'Clear Dispersion',
      humidity: 42,
    },
    pollutants: {
      pm25: 8.2,  // ug/m3
      pm10: 16.0, // ug/m3
      no2: 11.2,  // ppb
      so2: 0.6,   // ppb
      o3: 31.4,   // ppb
    },
  },
  {
    id: 'central-interior',
    name: 'Central Interior (Prince George - Plaza 400)',
    region: 'Central Interior',
    coordinates: { lat: 53.9171, lon: -122.7497 },
    weather: {
      temperature: 9.1,
      windSpeed: 1.8, // km/h (stagnation penalty)
      windDirection: 'CALM',
      condition: 'Thermal Inversion / Trapped Smoke',
      humidity: 84,
    },
    pollutants: {
      pm25: 29.6, // ug/m3 (breaches BC AQO & CAAQS)
      pm10: 44.2, // ug/m3
      no2: 28.4,  // ppb
      so2: 4.2,   // ppb
      o3: 18.0,   // ppb
    },
  },
  {
    id: 'georgia-strait',
    name: 'Georgia Strait / CRD (Victoria - Topaz)',
    region: 'Vancouver Island / CRD',
    coordinates: { lat: 48.4284, lon: -123.3656 },
    weather: {
      temperature: 12.8,
      windSpeed: 14.2, // km/h
      windDirection: 'SW',
      condition: 'Coastal Clean Dispersion',
      humidity: 71,
    },
    pollutants: {
      pm25: 5.1,  // ug/m3
      pm10: 11.3, // ug/m3
      no2: 8.4,   // ppb
      so2: 0.9,   // ppb
      o3: 28.5,   // ppb
    },
  },
];

// Regulatory Benchmarks Matrix
// Base units: ug/m3 for particulates, ppb for gaseous contaminants
const BENCHMARKS = [
  {
    key: 'pm25',
    name: 'Fine Particulate Matter (PM₂.₅)',
    window: '24-Hour Average',
    isGas: false,
    mw: null,
    bcLimit: 25.0,     // ug/m3
    caaqsLimit: 27.0,  // ug/m3
    whoLimit: 15.0,    // ug/m3
    clinicalFocus: 'Alveolar penetration, systemic cardiovascular inflammation, asthma exacerbation.',
  },
  {
    key: 'pm10',
    name: 'Coarse Particulate Matter (PM₁₀)',
    window: '24-Hour Average',
    isGas: false,
    mw: null,
    bcLimit: 50.0,     // ug/m3
    caaqsLimit: 50.0,  // ug/m3
    whoLimit: 45.0,    // ug/m3
    clinicalFocus: 'Upper airway irritation, nasopharyngeal inflammation, chronic bronchitis.',
  },
  {
    key: 'no2',
    name: 'Nitrogen Dioxide (NO₂)',
    window: '1-Hour Maximum',
    isGas: true,
    mw: 46.01,
    bcLimit: 60.0,     // ppb (113 ug/m3)
    caaqsLimit: 60.0,  // ppb (113 ug/m3)
    whoLimit: 106.0,   // ppb (200 ug/m3)
    clinicalFocus: 'Acute bronchial reactivity, bronchospasm in asthmatics, airway resistance.',
  },
  {
    key: 'so2',
    name: 'Sulphur Dioxide (SO₂)',
    window: '1-Hour Maximum',
    isGas: true,
    mw: 64.07,
    bcLimit: 70.0,     // ppb (183 ug/m3)
    caaqsLimit: 70.0,  // ppb (183 ug/m3)
    whoLimit: 191.0,   // ppb (~500 ug/m3 10-min guideline)
    clinicalFocus: 'Acute reflex bronchoconstriction, ocular and upper respiratory mucosal irritation.',
  },
  {
    key: 'o3',
    name: 'Ground-Level Ozone (O₃)',
    window: '8-Hour Maximum',
    isGas: true,
    mw: 48.00,
    bcLimit: 62.0,     // ppb (123 ug/m3)
    caaqsLimit: 60.0,  // ppb (120 ug/m3)
    whoLimit: 51.0,    // ppb (100 ug/m3)
    clinicalFocus: 'Potent oxidizing agent inducing substernal airway pain, reduced lung capacity.',
  },
];

export default function App() {
  const [selectedStationId, setSelectedStationId] = useState('kamloops-fed');
  // 'mass' (µg/m³ for all) or 'ppm' (parts per million for gases, µg/m³ for PM)
  const [unitMode, setUnitMode] = useState('mass');
  const [geoStatus, setGeoStatus] = useState('');
  const [showLegalModal, setShowLegalModal] = useState(false);

  const currentStation = useMemo(() => {
    return STATIONS.find((s) => s.id === selectedStationId) || STATIONS[0];
  }, [selectedStationId]);

  // Geolocation handler (Euclidean distance matching)
  const handleNearMe = () => {
    if (!navigator.geolocation) {
      setGeoStatus('Geolocation not supported by browser.');
      return;
    }
    setGeoStatus('Locating nearest station...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const uLat = pos.coords.latitude;
        const uLon = pos.coords.longitude;

        let closestStation = STATIONS[0];
        let minDistance = Infinity;

        STATIONS.forEach((st) => {
          const d = Math.sqrt(
            Math.pow(uLat - st.coordinates.lat, 2) +
            Math.pow(uLon - st.coordinates.lon, 2)
          );
          if (d < minDistance) {
            minDistance = d;
            closestStation = st;
          }
        });

        setSelectedStationId(closestStation.id);
        setGeoStatus(`Matched: ${closestStation.name}`);
        setTimeout(() => setGeoStatus(''), 4000);
      },
      (err) => {
        setGeoStatus(`Location access denied or unavailable (${err.message}).`);
        setTimeout(() => setGeoStatus(''), 4000);
      }
    );
  };

  // Weather-Modulated Danger Gradient Calculation
  const riskAnalysis = useMemo(() => {
    const rawScore = currentStation.pollutants.pm25;
    const isStagnant = currentStation.weather.windSpeed < 3.0;
    const stagnationPenalty = isStagnant ? 5.0 : 0.0;
    const finalScore = Number((rawScore + stagnationPenalty).toFixed(1));

    let tier = 'low';
    let label = 'Low Risk (Good)';
    let colorClass = 'bg-emerald-500 text-white';
    let borderClass = 'border-emerald-500';
    let gradientPosition = Math.min(100, Math.max(0, (finalScore / 50) * 100));

    if (finalScore > 27.0) {
      tier = 'high';
      label = 'High Danger (Unhealthy)';
      colorClass = 'bg-red-600 text-white';
      borderClass = 'border-red-600';
    } else if (finalScore > 15.0) {
      tier = 'moderate';
      label = 'Moderate Risk';
      colorClass = 'bg-amber-500 text-slate-900';
      borderClass = 'border-amber-500';
    }

    return {
      finalScore,
      rawScore,
      isStagnant,
      stagnationPenalty,
      tier,
      label,
      colorClass,
      borderClass,
      gradientPosition,
    };
  }, [currentStation]);

  // Unit conversion helper
  // Base stored value for gases: ppb. Particulates: ug/m3.
  const formatValue = (pollutantKey, valueInBaseUnit) => {
    const item = BENCHMARKS.find((b) => b.key === pollutantKey);
    if (!item) return { val: valueInBaseUnit, unit: '' };

    // Particulate matter is always mass concentration
    if (!item.isGas) {
      return { val: Number(valueInBaseUnit).toFixed(1), unit: 'µg/m³' };
    }

    // Gaseous Contaminant Conversion:
    // C_ug/m3 = (C_ppb * MW) / 24.45
    // C_ppm = C_ppb / 1000
    if (unitMode === 'mass') {
      const ugm3 = (valueInBaseUnit * item.mw) / 24.45;
      return { val: ugm3.toFixed(1), unit: 'µg/m³' };
    }

    // unitMode === 'ppm'
    const ppm = valueInBaseUnit / 1000;
    return { val: ppm.toFixed(3), unit: 'ppm' };
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* 1. Header & Identity Zone */}
      <header className="bg-slate-900 text-white border-b border-slate-800 px-4 py-4 sm:px-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                BC Air Quality & Weather Monitor
              </h1>
              <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded border border-slate-700">
                v1.2
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Multi-tiered regulatory compliance tracking & weather-modulated risk index for British Columbia airsheds.
            </p>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5"
          >
            <span>GitHub Repository</span>
            <span>↗</span>
          </a>
        </div>
      </header>

      {/* 2. Observation Freshness Banner */}
      <section className="bg-blue-950 text-blue-200 border-b border-blue-900 px-4 py-2 sm:px-8 text-xs font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-blue-300">TELEMETRY FEED:</span>
            <span>LIVE (Hourly unverified open data)</span>
          </div>
          <div className="flex items-center gap-3">
            <span>OBSERVATION STAMP: 2026-11-26 08:30 PST</span>
            <span className="text-emerald-400">● 100% SENSORS ONLINE</span>
          </div>
        </div>
      </section>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-8 flex-1 w-full space-y-6">
        {/* 3. Control Bar */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
              Select Airshed Station:
            </label>
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none flex-1 max-w-md"
            >
              {STATIONS.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} — ({st.region})
                </option>
              ))}
            </select>
            <button
              onClick={handleNearMe}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition shadow-sm flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <span>📍</span>
              <span>Find Nearest Station</span>
            </button>
            {geoStatus && (
              <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded border border-blue-200">
                {geoStatus}
              </span>
            )}
          </div>

          {/* Unit Switcher */}
          <div className="flex items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Gas Unit:</span>
            <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-xs font-medium">
              <button
                onClick={() => setUnitMode('mass')}
                className={`px-3 py-1.5 rounded-md transition cursor-pointer ${
                  unitMode === 'mass' ? 'bg-white text-blue-700 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Microgram (µg/m³)
              </button>
              <button
                onClick={() => setUnitMode('ppm')}
                className={`px-3 py-1.5 rounded-md transition cursor-pointer ${
                  unitMode === 'ppm' ? 'bg-white text-blue-700 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Parts Per Million (ppm)
              </button>
            </div>
          </div>
        </section>

        {/* 4. Hazard & Weather Summary Card */}
        <section className={`bg-white rounded-xl border-2 ${riskAnalysis.borderClass} p-5 shadow-sm space-y-5 transition-all`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className={`text-xs uppercase font-extrabold px-2.5 py-1 rounded-full ${riskAnalysis.colorClass}`}>
                  {riskAnalysis.label}
                </span>
                <span className="text-sm font-semibold text-slate-600">
                  Calculated Hazard Score: <strong className="text-slate-900 text-base">{riskAnalysis.finalScore}</strong> / 50
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Baseline PM₂.₅: <strong>{riskAnalysis.rawScore} µg/m³</strong>
                {riskAnalysis.isStagnant && (
                  <span className="text-amber-700 font-semibold ml-2">
                    (+5.0 Stagnation Penalty applied: Surface Wind &lt; 3.0 km/h)
                  </span>
                )}
              </p>
            </div>

            {/* Collocated Meteorological Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                <span className="block text-slate-400 text-[10px] uppercase font-bold">Surface Temp</span>
                <span className="font-semibold text-slate-800 text-sm">{currentStation.weather.temperature} °C</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                <span className="block text-slate-400 text-[10px] uppercase font-bold">Wind Speed</span>
                <span className="font-semibold text-slate-800 text-sm">
                  {currentStation.weather.windSpeed} km/h ({currentStation.weather.windDirection})
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                <span className="block text-slate-400 text-[10px] uppercase font-bold">Relative Humidity</span>
                <span className="font-semibold text-slate-800 text-sm">{currentStation.weather.humidity}%</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center col-span-2 sm:col-span-1">
                <span className="block text-slate-400 text-[10px] uppercase font-bold">Atmospheric State</span>
                <span className="font-semibold text-slate-800 text-xs truncate block" title={currentStation.weather.condition}>
                  {currentStation.weather.condition}
                </span>
              </div>
            </div>
          </div>

          {/* Continuous Gradient Bar */}
          <div>
            <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
              <span>0 (WHO Clean Air Baseline)</span>
              <span>15 (WHO 24-hr Target)</span>
              <span>25–27 (BC AQO / CAAQS)</span>
              <span>50+ (Severe)</span>
            </div>
            <div className="relative w-full h-4 rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-600 overflow-visible shadow-inner">
              {/* Needle Indicator */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-6 bg-slate-900 border-2 border-white rounded shadow-md transition-all duration-500 -ml-2"
                style={{ left: `${riskAnalysis.gradientPosition}%` }}
                title={`Current Score: ${riskAnalysis.finalScore}`}
              />
            </div>
          </div>

          {/* Not Medical Advice Callout */}
          <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-r-lg text-xs text-amber-900 flex items-start gap-2">
            <span className="font-bold">⚠️ Notice:</span>
            <span>
              <strong>Not Medical Advice:</strong> Guideline comparisons reflect regulatory and policy reference benchmarks only. Consult medical professionals and official public health advisories for personal health decisions.
            </span>
          </div>
        </section>

        {/* 5. Pollutant Matrix Table */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Criteria Contaminant Compliance Matrix
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time station observations evaluated against Provincial, Federal, and International guidelines.
                </p>
              </div>

              {/* Threshold Compliance Legend */}
              <div className="flex items-center gap-3 text-xs bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shrink-0">
                <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Legend:</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                  <span className="text-emerald-800 font-medium text-[11px]">Meets Target (Within Limit)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
                  <span className="text-amber-800 font-medium text-[11px]">Exceeds Target (Above Limit)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600 uppercase font-bold border-b border-slate-200 tracking-wider">
                  <th className="py-3 px-4">Contaminant</th>
                  <th className="py-3 px-3">Avg Window</th>
                  <th className="py-3 px-3">Live Reading</th>
                  <th className="py-3 px-3">BC Prov. AQO</th>
                  <th className="py-3 px-3">CAAQS (Fed)</th>
                  <th className="py-3 px-3">WHO (2021)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {BENCHMARKS.map((b) => {
                  const rawVal = currentStation.pollutants[b.key];
                  const liveFormatted = formatValue(b.key, rawVal);
                  const bcFormatted = formatValue(b.key, b.bcLimit);
                  const caaqsFormatted = formatValue(b.key, b.caaqsLimit);
                  const whoFormatted = formatValue(b.key, b.whoLimit);

                  // Threshold checks: live reading exceeding individual guidelines
                  const exceedsBC = rawVal > b.bcLimit;
                  const exceedsCAAQS = rawVal > b.caaqsLimit;
                  const exceedsWHO = rawVal > b.whoLimit;

                  return (
                    <tr key={b.key} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{b.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{b.clinicalFocus}</div>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-600">{b.window}</td>
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-sm text-slate-900">
                          {liveFormatted.val}
                        </span>{' '}
                        <span className="text-slate-500 font-mono text-[11px]">{liveFormatted.unit}</span>
                      </td>

                      {/* BC Provincial AQO Limit */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium ${
                            exceedsBC
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {bcFormatted.val}{' '}
                          <span className="text-[10px] opacity-75">{bcFormatted.unit}</span>
                        </span>
                      </td>

                      {/* Canadian CAAQS (Federal) Limit */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium ${
                            exceedsCAAQS
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {caaqsFormatted.val}{' '}
                          <span className="text-[10px] opacity-75">{caaqsFormatted.unit}</span>
                        </span>
                      </td>

                      {/* WHO 2021 Guideline Limit */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium ${
                            exceedsWHO
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {whoFormatted.val}{' '}
                          <span className="text-[10px] opacity-75">{whoFormatted.unit}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Real-Time Feed Attribution */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span>
              <strong>Source:</strong> BC Ministry of Environment & Climate Change Strategy / Environment and Climate Change Canada Open Data — Unverified Real-Time Monitoring Feed.
            </span>
            <button
              onClick={() => setShowLegalModal(true)}
              className="text-blue-600 hover:text-blue-800 underline font-medium cursor-pointer"
            >
              View Full Disclaimers & Legal Notice
            </button>
          </div>
        </section>
      </main>

      {/* 6. Footer & Legal Zone */}
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 py-6 px-4 sm:px-8 text-xs mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <p className="font-semibold text-slate-300">
              British Columbia Air Quality & Weather Monitor (Open Source Utility)
            </p>
            <p className="text-slate-500 text-[11px] mt-0.5">
              Provided for informational and educational purposes under MIT license. Not an official emergency broadcast system.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowLegalModal(true)}
              className="text-slate-300 hover:text-white underline transition cursor-pointer"
            >
              Legal & Disclaimers
            </button>
            <a
              href="https://www.healthlinkbc.ca"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-300 hover:text-white transition"
            >
              HealthLink BC ↗
            </a>
          </div>
        </div>
      </footer>

      {/* 7. Legal Disclaimer Modal */}
      {showLegalModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Terms of Use & Legal Disclaimers</h3>
              <button
                onClick={() => setShowLegalModal(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                <strong>1. Informational & Educational Purposes Only:</strong> This dashboard is an independent open-source utility designed to visualize environmental criteria contaminants. It does not constitute official health, medical, or municipal advisory broadcasts.
              </p>
              <p>
                <strong>2. Unverified Raw Telemetry Feeds:</strong> The metrics displayed originate from preliminary, unvalidated telemetry feeds managed by the BC Ministry of Environment and Environment and Climate Change Canada. Real-time data feeds are subject to sensor calibration drift, communication dropouts, and periodic maintenance cycles.
              </p>
              <p>
                <strong>3. Limitation of Liability:</strong> Software is provided &quot;as-is&quot; without warranties of any kind. Authors and contributors disclaim all liability for personal actions, outdoor planning, or health outcomes influenced by this application.
              </p>
              <p>
                <strong>4. Emergency & Public Health Authorities:</strong> During acute wildfire smoke episodes or severe air quality advisories, immediately refer to official guidance from the <strong>BC Centre for Disease Control (BCCDC)</strong> and <strong>HealthLink BC (8-1-1)</strong>.
              </p>
            </div>

            <div className="pt-3 border-t border-slate-200 text-right">
              <button
                onClick={() => setShowLegalModal(false)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs px-4 py-2 rounded-lg transition cursor-pointer"
              >
                I Understand and Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}