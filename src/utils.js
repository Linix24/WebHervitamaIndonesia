export function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtDate(dateStr) {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch (e) { return dateStr; }
}

export function initials(name) {
  return (name || "HI").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();
}

export function minutesOf(t) {
  if (!t || !String(t).includes(":")) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function durationLabel(mins) {
  mins = Math.max(0, Math.round(mins || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}j ${m}m`;
  if (h) return `${h}j`;
  return `${m}m`;
}

export function cryptoId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now();
}

export function makePhotoData(name, time, project, initialsFn) {
  const ini = initialsFn(name);
  const bgA = "#1f6feb";
  const bgB = "#0f9f8f";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="560" viewBox="0 0 840 560">
    <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${bgA}"/><stop offset="1" stop-color="${bgB}"/></linearGradient></defs>
    <rect width="840" height="560" rx="40" fill="url(#g)"/>
    <circle cx="420" cy="210" r="92" fill="rgba(255,255,255,.22)"/>
    <text x="420" y="235" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="white">${ini}</text>
    <text x="420" y="350" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="white">${name}</text>
    <text x="420" y="395" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,.82)">${project} • ${time} • ${fmtDate(todayKey())}</text>
    <rect x="245" y="430" width="350" height="52" rx="26" fill="rgba(255,255,255,.18)"/>
    <text x="420" y="464" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="white">Foto Absensi Simulasi</text>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

export function makeDemoLocation(offset = 0) {
  const coords = [
    [-6.914744, 107.609810, "Bandung, Jawa Barat"],
    [-6.175392, 106.827153, "Jakarta / Client Site"],
    [-6.303333, 106.333333, "Project Site Cilegon"],
    [-6.305000, 107.300000, "Karawang, Jawa Barat"],
    [-7.257472, 112.752090, "Surabaya / Dinas"]
  ];
  const c = coords[offset % coords.length];
  const lat = c[0] + (Math.random() * 0.004 - 0.002);
  const lng = c[1] + (Math.random() * 0.004 - 0.002);
  return { lat: lat.toFixed(6), lng: lng.toFixed(6), address: c[2], mapUrl: `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}` };
}
