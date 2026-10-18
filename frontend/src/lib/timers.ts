// Minutniki: szukamy w treści kroku czasów typu "10 min", "1 godz.", "20-25 minut", "30 sekund".

export interface Duration {
  label: string; // tekst z przepisu, np. "10 min"
  seconds: number;
}

const DURATION = /(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*(godz\w*|h\b|min\w*|sek\w*|s\b)/gi;

export function findDurations(text: string): Duration[] {
  const found: Duration[] = [];
  for (const match of text.matchAll(DURATION)) {
    // Przy zakresie "20-25 min" bierzemy górną wartość - łatwiej sprawdzić wcześniej niż przypalić
    const value = Number((match[2] ?? match[1]).replace(",", "."));
    const unit = match[3].toLowerCase();
    const multiplier = unit.startsWith("g") || unit === "h" ? 3600 : unit.startsWith("s") ? 1 : 60;
    if (value > 0) found.push({ label: match[0], seconds: Math.round(value * multiplier) });
  }
  return found;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

// Krótki sygnał dźwiękowy (Web Audio). Działa na iPhonie, jeśli minutnik
// został uruchomiony dotknięciem, a telefon nie jest wyciszony.
let audio: AudioContext | null = null;

export function unlockSound() {
  audio ??= new AudioContext();
  if (audio.state === "suspended") audio.resume();
}

export function beep() {
  navigator.vibrate?.([300, 150, 300, 150, 300]);
  if (!audio) return;
  for (let i = 0; i < 3; i++) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.3;
    oscillator.connect(gain).connect(audio.destination);
    const start = audio.currentTime + i * 0.5;
    oscillator.start(start);
    oscillator.stop(start + 0.3);
  }
}
