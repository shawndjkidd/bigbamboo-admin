'use client'
import { useState, useEffect, useRef, useCallback } from "react";

/*
 * ════════════════════════════════════════════════════════════════
 *  BIGBAMBOO SCAN · TAP · WIN
 *  Brand: dark teal + warm cream + gold + tropical accents
 *  Palette sourced from bigbamboo.app live site
 *  Logo: bigbamboo.app/images/bbb-img-5.png
 * ════════════════════════════════════════════════════════════════
 */

// ─── Supabase Config ───
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function sbFetch(table: string, opts: { method?: string; body?: any; query?: string } = {}) {
  const url = `${SB_URL}/rest/v1/${table}${opts.query || ''}`;
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: SB_HEADERS,
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Supabase error [${table}]:`, res.status, text);
    return null;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ─── Session & Claim Code Helpers ───
function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let sid = sessionStorage.getItem('stw_session');
  if (!sid) {
    sid = 'stw_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('stw_session', sid);
  }
  return sid;
}

function generateClaimCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'BB-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ─── Brand Palette (from live site) ───
const B = {
  bg: "#0a1614",
  bgCard: "#1a3a38",
  bgCardLight: "#1f4442",
  bgOverlay: "rgba(10,22,20,0.85)",
  teal: "#2a8a86",
  tealBright: "#3aa8a4",
  tealGlow: "rgba(58,168,164,0.25)",
  gold: "#e8a820",
  goldLight: "#f5c842",
  goldGlow: "rgba(232,168,32,0.3)",
  orange: "#fa832e",
  orangeDeep: "#f7654b",
  green: "#00b14f",
  greenDeep: "#0a7a30",
  cream: "#f5eed8",
  creamSoft: "rgba(245,238,216,0.75)",
  creamMuted: "rgba(245,238,216,0.4)",
  creamFaint: "rgba(245,238,216,0.15)",
  white: "#ffffff",
  dark: "#0a1614",
};

// ─── Prize Types ───
interface Prize {
  id: string;
  prize_id: string;
  label: string;
  emoji: string;
  tier: string;
  weight: number;
  prize_type: string;
  discount_pct?: number;
  max_discount?: number;
}

// ─── Play Decay (decreasing win odds with more plays) ───
const PLAY_DECAY = [
  { weights: { big: 10, medium: 30, small: 60, none: 0 } },
  { weights: { big: 0, medium: 25, small: 50, none: 25 } },
  { weights: { big: 0, medium: 5, small: 40, none: 55 } },
  { weights: { big: 0, medium: 0, small: 25, none: 75 } },
];

function pickPrize(prizes: Prize[], playCount: number): Prize | null {
  const decay = PLAY_DECAY[Math.min(playCount, PLAY_DECAY.length - 1)];
  const roll = Math.random() * 100;
  const { big, medium, small } = decay.weights;
  let tier: string;
  if (roll < big) tier = "big";
  else if (roll < big + medium) tier = "medium";
  else if (roll < big + medium + small) tier = "small";
  else return null;
  const pool = prizes.filter((p) => p.tier === tier);
  if (pool.length === 0) return null;
  const tw = pool.reduce((s, p) => s + p.weight, 0);
  let w = Math.random() * tw;
  for (const p of pool) { w -= p.weight; if (w <= 0) return p; }
  return pool[pool.length - 1];
}

// ─── Confetti ───
function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<any[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W * 2;
    canvas.height = H * 2;
    ctx.scale(2, 2);
    const colors = [B.gold, B.goldLight, B.tealBright, B.teal, B.orange, B.green, B.cream, "#a855f7", "#ec4899"];
    particles.current = Array.from({ length: 90 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 80,
      y: H * 0.42, vx: (Math.random() - 0.5) * 15, vy: -Math.random() * 16 - 5,
      size: Math.random() * 7 + 3, color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 360, rotV: (Math.random() - 0.5) * 14, life: 1,
      shape: Math.random() > 0.4 ? "rect" : "circle",
    }));
    function animate() {
      ctx.clearRect(0, 0, W, H);
      let alive = false;
      for (const p of particles.current) {
        if (p.life <= 0) continue;
        alive = true; p.x += p.vx; p.y += p.vy; p.vy += 0.38; p.vx *= 0.98;
        p.rot += p.rotV; p.life -= 0.011;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rot * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color;
        if (p.shape === "circle") { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.55);
        ctx.restore();
      }
      if (alive) animRef.current = requestAnimationFrame(animate);
    }
    animate();
    return () => cancelAnimationFrame(animRef.current);
  }, [active]);
  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 30 }} />;
}

// ─── Tropical Background ───
function TropicalBG() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: `
        radial-gradient(ellipse 130% 70% at 50% 120%, ${B.teal}18 0%, transparent 60%),
        radial-gradient(ellipse 90% 50% at 15% 0%, ${B.green}12 0%, transparent 50%),
        radial-gradient(ellipse 80% 50% at 85% 5%, ${B.teal}10 0%, transparent 50%),
        linear-gradient(175deg, ${B.bg} 0%, #0d1f1c 30%, #0e221e 50%, #0b1a18 80%, ${B.bg} 100%)
      `}} />
      <div style={{
        position: "absolute", top: "25%", left: "50%", transform: "translateX(-50%)",
        width: 460, height: 460, borderRadius: "50%",
        background: `radial-gradient(circle, ${B.gold}12 0%, ${B.teal}08 40%, transparent 70%)`,
        animation: "glowPulse 5s ease-in-out infinite",
      }} />
      <svg style={{ position: "absolute", top: -30, left: -50, opacity: 0.05, width: 380, height: 420 }} viewBox="0 0 380 420">
        <path d="M60 420 C60 420 35 270 90 160 C145 50 220 15 280 5 C220 40 160 110 130 195 C100 280 90 370 60 420Z" fill={B.tealBright} />
        <path d="M95 420 C95 420 115 300 180 195 C245 90 310 45 370 25 C315 55 250 130 210 215 C170 300 135 370 95 420Z" fill={B.teal} />
        <path d="M25 370 C25 370 15 235 55 140 C95 45 140 10 185 0 C150 30 110 95 85 170 C60 245 40 315 25 370Z" fill={B.greenDeep} />
      </svg>
      <svg style={{ position: "absolute", top: -15, right: -60, opacity: 0.04, width: 320, height: 370, transform: "scaleX(-1)" }} viewBox="0 0 320 370">
        <path d="M45 370 C45 370 28 235 75 140 C122 45 185 15 240 5 C195 35 140 100 115 175 C90 250 65 310 45 370Z" fill={B.tealBright} />
        <path d="M80 370 C80 370 95 260 155 170 C215 80 270 40 320 20 C280 50 225 115 185 190 C145 265 115 320 80 370Z" fill={B.teal} />
      </svg>
      <div style={{ position: "absolute", left: 10, top: "5%", height: "65%", width: 3.5, borderRadius: 2, background: `linear-gradient(180deg, ${B.teal}20, ${B.teal}08, transparent)` }} />
      <div style={{ position: "absolute", left: 20, top: "8%", height: "50%", width: 2.5, borderRadius: 1.5, background: `linear-gradient(180deg, ${B.green}15, ${B.green}05, transparent)` }} />
      <div style={{ position: "absolute", left: 9, top: "18%", width: 5.5, height: 2, borderRadius: 1, background: `${B.teal}25` }} />
      <div style={{ position: "absolute", left: 9, top: "32%", width: 5.5, height: 2, borderRadius: 1, background: `${B.teal}18` }} />
      <div style={{ position: "absolute", right: 12, top: "6%", height: "60%", width: 3.5, borderRadius: 2, background: `linear-gradient(180deg, ${B.teal}18, ${B.teal}06, transparent)` }} />
      <div style={{ position: "absolute", right: 22, top: "10%", height: "45%", width: 2.5, borderRadius: 1.5, background: `linear-gradient(180deg, ${B.green}12, ${B.green}04, transparent)` }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 180, background: `linear-gradient(0deg, ${B.teal}08, transparent)` }} />
      <div style={{ position: "absolute", inset: 0, opacity: 0.025, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />
    </div>
  );
}

// ─── Premium Coconut ───
function CoconutSVG({ crackStage, shaking, tapFlash }: { crackStage: number; shaking: boolean; tapFlash: boolean }) {
  const splitAmt = crackStage >= 3 ? 24 : 0;
  const glowVal = [0, 0.12, 0.28, 0.6][crackStage];
  const glowHex = Math.round(glowVal * 255).toString(16).padStart(2, "0");

  return (
    <div style={{ position: "relative", width: 230, height: 230 }}>
      {tapFlash && (
        <div style={{
          position: "absolute", inset: -35, borderRadius: "50%",
          background: `radial-gradient(circle, ${B.gold}40 0%, transparent 70%)`,
          animation: "impactFlash 0.35s ease-out forwards", zIndex: 5,
        }} />
      )}
      <div style={{
        position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
        width: 150, height: 150, borderRadius: "50%",
        background: `radial-gradient(circle, ${B.gold}${glowHex}, transparent 70%)`,
        transition: "all 0.4s", filter: `blur(${14 + crackStage * 5}px)`,
      }} />
      <div style={{
        position: "relative", width: 230, height: 230,
        animation: shaking ? "coconutShake 0.06s infinite alternate" : "coconutFloat 3.5s ease-in-out infinite",
        filter: `drop-shadow(0 12px 35px rgba(0,0,0,0.55)) drop-shadow(0 0 ${crackStage * 18}px ${B.goldGlow})`,
        transition: "filter 0.3s",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          transform: crackStage >= 3 ? `translateX(-${splitAmt}px) rotate(-14deg)` : "none",
          transition: "transform 0.75s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}>
          <svg viewBox="0 0 230 230" width="230" height="230">
            <defs>
              <radialGradient id="cBody" cx="36%" cy="30%" r="65%">
                <stop offset="0%" stopColor="#A07828" />
                <stop offset="30%" stopColor="#846018" />
                <stop offset="65%" stopColor="#5C4008" />
                <stop offset="100%" stopColor="#3A2804" />
              </radialGradient>
              <radialGradient id="cInner" cx="48%" cy="42%" r="58%">
                <stop offset="0%" stopColor="#FFFEF5" />
                <stop offset="55%" stopColor="#F2E4C4" />
                <stop offset="100%" stopColor="#E0CDA0" />
              </radialGradient>
              <radialGradient id="cSheen" cx="50%" cy="35%" r="50%">
                <stop offset="0%" stopColor="white" stopOpacity={0.12} />
                <stop offset="100%" stopColor="white" stopOpacity={0} />
              </radialGradient>
              <filter id="iShadow">
                <feGaussianBlur in="SourceAlpha" stdDeviation="3.5" />
                <feOffset dx="0" dy="3" />
                <feComposite in2="SourceAlpha" operator="arithmetic" k2={-1} k3={1} />
                <feFlood floodColor="#1a0f00" floodOpacity="0.45" />
                <feComposite in2="SourceGraphic" operator="in" />
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              {crackStage >= 3 && <clipPath id="lClip"><rect x="0" y="0" width="115" height="230" /></clipPath>}
            </defs>
            <g clipPath={crackStage >= 3 ? "url(#lClip)" : undefined}>
              <ellipse cx="115" cy="120" rx="90" ry="93" fill="url(#cBody)" filter="url(#iShadow)" />
              {Array.from({ length: 48 }, (_, i) => {
                const a = (i / 48) * Math.PI * 2;
                const r1 = 76 + (i % 4) * 2.5;
                const r2 = 88 + (i % 3) * 1.8;
                return <line key={`f${i}`} x1={115 + Math.cos(a) * r1} y1={120 + Math.sin(a) * (r1 + 2)} x2={115 + Math.cos(a) * r2} y2={120 + Math.sin(a) * (r2 + 2)} stroke="#7A5C1A" strokeWidth={0.8 + (i % 3) * 0.5} opacity={0.15 + (i % 4) * 0.04} strokeLinecap="round" />;
              })}
              <path d="M65 48 Q95 82 88 168 Q85 200 72 218" fill="none" stroke="#5C4008" strokeWidth="0.8" opacity="0.12" />
              <path d="M165 48 Q135 82 142 168 Q145 200 158 218" fill="none" stroke="#5C4008" strokeWidth="0.8" opacity="0.12" />
              <path d="M115 28 Q112 105 115 180 Q116 205 115 222" fill="none" stroke="#5C4008" strokeWidth="0.6" opacity="0.08" />
              <path d="M85 38 Q98 95 90 175" fill="none" stroke="#4A3506" strokeWidth="0.5" opacity="0.08" />
              <path d="M145 38 Q132 95 140 175" fill="none" stroke="#4A3506" strokeWidth="0.5" opacity="0.08" />
              <g transform="translate(115, 58)">
                <ellipse cx="-18" cy="0" rx="8" ry="9" fill="#3D2800" />
                <ellipse cx="-18" cy="0" rx="5" ry="6" fill="#2A1D00" opacity="0.6" />
                <ellipse cx="-18" cy="-2" rx="2.5" ry="2" fill="#5C4008" opacity="0.3" />
                <ellipse cx="18" cy="0" rx="8" ry="9" fill="#3D2800" />
                <ellipse cx="18" cy="0" rx="5" ry="6" fill="#2A1D00" opacity="0.6" />
                <ellipse cx="18" cy="-2" rx="2.5" ry="2" fill="#5C4008" opacity="0.3" />
                <ellipse cx="0" cy="20" rx="7" ry="8" fill="#3D2800" opacity="0.85" />
                <ellipse cx="0" cy="20" rx="4" ry="5" fill="#2A1D00" opacity="0.5" />
              </g>
              <ellipse cx="82" cy="72" rx="28" ry="18" fill="url(#cSheen)" transform="rotate(-28 82 72)" />
              <ellipse cx="88" cy="68" rx="14" ry="8" fill="white" opacity="0.06" transform="rotate(-28 88 68)" />
              <ellipse cx="115" cy="120" rx="90" ry="93" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1.5" />
              {crackStage >= 2 && (
                <g>
                  <ellipse cx="115" cy="120" rx="72" ry="75" fill="url(#cInner)" />
                  <ellipse cx="115" cy="125" rx="55" ry="48" fill="white" opacity="0.06" />
                </g>
              )}
              {crackStage >= 1 && (
                <g style={{ animation: "crackAppear 0.25s ease-out" }}>
                  <path d="M115 27 L112 55 L118 78 L112 98 L116 120 L110 148 L114 175 L117 208" fill="none" stroke="#1a0f00" strokeWidth="3.2" strokeLinecap="round" />
                  <path d="M115 27 L112 55 L118 78 L112 98 L116 120 L110 148 L114 175 L117 208" fill="none" stroke={B.gold} strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
                </g>
              )}
              {crackStage >= 2 && (
                <g style={{ animation: "crackAppear 0.25s ease-out" }}>
                  <path d="M112 55 L88 64 L82 80" fill="none" stroke="#1a0f00" strokeWidth="2.8" strokeLinecap="round" />
                  <path d="M112 55 L88 64 L82 80" fill="none" stroke={B.gold} strokeWidth="1" opacity="0.35" strokeLinecap="round" />
                  <path d="M116 120 L142 108 L148 122" fill="none" stroke="#1a0f00" strokeWidth="2.8" strokeLinecap="round" />
                  <path d="M116 120 L142 108 L148 122" fill="none" stroke={B.gold} strokeWidth="1" opacity="0.35" strokeLinecap="round" />
                  <path d="M110 148 L84 158 L78 172" fill="none" stroke="#1a0f00" strokeWidth="2.8" strokeLinecap="round" />
                  <path d="M110 148 L84 158 L78 172" fill="none" stroke={B.gold} strokeWidth="1" opacity="0.35" strokeLinecap="round" />
                  <path d="M115 27 L112 55 L118 78 L112 98 L116 120 L110 148 L114 175 L117 208" fill="none" stroke={B.gold} strokeWidth="8" strokeLinecap="round" opacity="0.12" style={{ filter: "blur(5px)" }} />
                </g>
              )}
            </g>
          </svg>
        </div>
        {crackStage >= 3 && (
          <div style={{
            position: "absolute", inset: 0,
            transform: `translateX(${splitAmt}px) rotate(14deg)`,
            transition: "transform 0.75s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}>
            <svg viewBox="0 0 230 230" width="230" height="230">
              <defs><clipPath id="rClip"><rect x="115" y="0" width="115" height="230" /></clipPath></defs>
              <g clipPath="url(#rClip)">
                <ellipse cx="115" cy="120" rx="90" ry="93" fill="url(#cBody)" />
                <ellipse cx="115" cy="120" rx="72" ry="75" fill="url(#cInner)" />
                {Array.from({ length: 24 }, (_, i) => {
                  const a = (i / 24) * Math.PI * 2;
                  return <line key={`rf${i}`} x1={115 + Math.cos(a) * 78} y1={120 + Math.sin(a) * 81} x2={115 + Math.cos(a) * 89} y2={120 + Math.sin(a) * 92} stroke="#7A5C1A" strokeWidth="1.2" opacity="0.18" strokeLinecap="round" />;
                })}
                <ellipse cx="82" cy="72" rx="28" ry="18" fill="white" opacity="0.06" transform="rotate(-28 82 72)" />
                <ellipse cx="115" cy="125" rx="55" ry="48" fill="white" opacity="0.05" />
              </g>
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Progress Ring ───
function ProgressRing({ progress }: { progress: number }) {
  const size = 270, r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - progress);
  const color = progress < 0.33 ? B.teal : progress < 0.66 ? B.tealBright : B.gold;
  return (
    <svg width={size} height={size} style={{ position: "absolute", inset: 0, margin: "auto", transform: "rotate(-90deg)", pointerEvents: "none", zIndex: 2 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={B.creamFaint} strokeWidth="2.5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.2s ease-out, stroke 0.3s" }} />
    </svg>
  );
}

// ─── Prize Card ───
function PrizeCard({ prize, claimCode, onAddToWallet, onPlayAgain }: { prize: Prize | null; claimCode: string | null; onAddToWallet: () => void; onPlayAgain: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => { setTimeout(() => setShow(true), 150); }, []);

  const tierInfo = prize ? {
    big: { label: "JACKPOT", color: B.gold },
    medium: { label: "NICE WIN", color: B.tealBright },
    small: { label: "WINNER", color: B.green },
  }[prize.tier] : null;

  if (!prize) {
    return (
      <div style={{ textAlign: "center", opacity: show ? 1 : 0, transform: show ? "translateY(0) scale(1)" : "translateY(30px) scale(0.9)", transition: "all 0.6s cubic-bezier(0.34,1.56,0.64,1)" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>{"\u{1F965}"}</div>
        <div style={{ ...F.display, fontSize: 30, color: B.cream, marginBottom: 8 }}>No Prize This Time!</div>
        <div style={{ ...F.body, color: B.creamSoft, marginBottom: 28 }}>Better luck next time!</div>
        <button onClick={onPlayAgain} style={S.btnGhost}>Play Again</button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", opacity: show ? 1 : 0, transform: show ? "translateY(0) scale(1)" : "translateY(30px) scale(0.9)", transition: "all 0.6s cubic-bezier(0.34,1.56,0.64,1)", maxWidth: 330 }}>
      {tierInfo && (
        <div style={{
          display: "inline-block", padding: "5px 18px", borderRadius: 100,
          background: `${tierInfo.color}15`, border: `1px solid ${tierInfo.color}30`,
          ...F.label, fontSize: 11, color: tierInfo.color, marginBottom: 16, letterSpacing: "0.14em",
        }}>
          {tierInfo.label}
        </div>
      )}

      <div style={{ fontSize: 76, marginBottom: 10, animation: "prizePop 0.6s cubic-bezier(0.34,1.56,0.64,1)" }}>{prize.emoji}</div>
      <div style={{ ...F.display, fontSize: 28, color: B.gold, marginBottom: 6, textShadow: `0 2px 20px ${B.goldGlow}` }}>{prize.label}</div>

      {/* Claim Code Display */}
      {claimCode && (
        <div style={{
          background: `${B.gold}12`, border: `1px dashed ${B.gold}40`, borderRadius: 14,
          padding: "12px 20px", margin: "14px auto 6px", maxWidth: 260,
        }}>
          <div style={{ ...F.label, fontSize: 9, color: B.creamMuted, marginBottom: 6, letterSpacing: "0.15em" }}>YOUR CLAIM CODE</div>
          <div style={{ ...F.display, fontSize: 32, color: B.gold, letterSpacing: "0.08em" }}>{claimCode}</div>
        </div>
      )}

      <div style={{ ...F.body, fontSize: 13, color: B.creamMuted, marginBottom: 30 }}>Show this screen to your server to redeem</div>

      <button onClick={onAddToWallet} style={S.btnPrimary}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
        </svg>
        Save to Wallet & Claim
      </button>

      <div style={{ ...F.body, fontSize: 11, color: B.creamMuted, marginTop: 10, lineHeight: 1.5, maxWidth: 280, margin: "10px auto 0" }}>
        Adds your BigBamBoo loyalty card — stamps, rewards & exclusive offers
      </div>

      <button onClick={onPlayAgain} style={{ ...S.btnGhost, marginTop: 22 }}>Play Again</button>
    </div>
  );
}

// ─── Wallet Modal ───
function WalletModal({ prize, onClose }: { prize: Prize | null; onClose: () => void }) {
  const [step, setStep] = useState("choose");
  function handleAdd() { setStep("adding"); setTimeout(() => setStep("done"), 2000); }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,18,16,0.82)", backdropFilter: "blur(14px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: `linear-gradient(170deg, ${B.bgCardLight}, ${B.bg})`, borderRadius: 24, padding: "36px 28px",
        maxWidth: 380, width: "100%", textAlign: "center", border: `1px solid ${B.teal}25`,
        boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 50px ${B.tealGlow}`,
      }}>
        {step === "choose" && (<>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: `${B.teal}20`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", border: `1px solid ${B.teal}30` }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={B.tealBright} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
          </div>
          <div style={{ ...F.display, fontSize: 26, color: B.cream, marginBottom: 10 }}>Join the Club</div>
          <div style={{ ...F.body, fontSize: 14, color: B.creamSoft, marginBottom: 28, lineHeight: 1.6 }}>
            Save your loyalty card to claim <strong style={{ color: B.gold }}>{prize?.label}</strong> and start earning drink stamps
          </div>
          <button onClick={handleAdd} style={{ ...S.walletBtn, marginBottom: 10, background: `${B.cream}0d` }}>
            <span style={{ fontSize: 18 }}>{"\uF8FF"}</span> Add to Apple Wallet
          </button>
          <button onClick={handleAdd} style={S.walletBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.45 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Add to Google Wallet
          </button>
          <button onClick={onClose} style={{ ...F.body, marginTop: 18, background: "none", border: "none", color: B.creamMuted, fontSize: 13, cursor: "pointer", padding: "8px 16px" }}>Maybe later</button>
        </>)}

        {step === "adding" && (
          <div style={{ padding: "20px 0" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", border: `3px solid ${B.tealBright}`, borderTopColor: "transparent", margin: "0 auto 20px", animation: "spin 0.8s linear infinite" }} />
            <div style={{ ...F.display, fontSize: 22, color: B.cream, marginBottom: 8 }}>Creating Your Card</div>
            <div style={{ ...F.body, fontSize: 13, color: B.creamMuted }}>Setting up your BigBamBoo pass...</div>
          </div>
        )}

        {step === "done" && (<>
          <div style={{ fontSize: 52, marginBottom: 16, animation: "prizePop 0.6s cubic-bezier(0.34,1.56,0.64,1)" }}>{"\u2705"}</div>
          <div style={{ ...F.display, fontSize: 26, color: B.cream, marginBottom: 8 }}>You're In!</div>
          <div style={{ ...F.body, fontSize: 14, color: B.creamSoft, marginBottom: 20, lineHeight: 1.5 }}>Your BigBamBoo loyalty card is now in your wallet.</div>
          <div style={{ background: `${B.gold}12`, border: `1px solid ${B.gold}22`, borderRadius: 16, padding: "16px 20px", marginBottom: 20 }}>
            <div style={{ ...F.label, color: B.creamMuted, marginBottom: 6, fontSize: 10 }}>YOUR PRIZE</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: B.gold }}>{prize?.emoji} {prize?.label}</div>
            <div style={{ ...F.body, fontSize: 12, color: B.creamMuted, marginTop: 4 }}>Show your wallet pass to redeem</div>
          </div>
          <div style={{ background: `${B.cream}06`, borderRadius: 14, padding: "16px 18px", marginBottom: 24, textAlign: "left" as const }}>
            <div style={{ ...F.label, color: B.creamSoft, marginBottom: 12, fontSize: 10 }}>YOUR CARD INCLUDES</div>
            {["Drink stamp card — buy 10, get 1 free", "Exclusive member offers & events", "Birthday rewards", "Early access to event tickets"].map((item, i) => (
              <div key={i} style={{ ...F.body, fontSize: 13, color: B.creamSoft, marginBottom: 7, display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ color: B.tealBright, fontSize: 9 }}>{"\u2726"}</span>{item}
              </div>
            ))}
          </div>
          <button onClick={onClose} style={S.btnPrimary}>Done</button>
        </>)}
      </div>
    </div>
  );
}

// ─── Main Game ───
export default function PlayPage() {
  const [gameState, setGameState] = useState("ready");
  const [crackStage, setCrackStage] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [tapFlash, setTapFlash] = useState(false);
  const [currentPrize, setCurrentPrize] = useState<Prize | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [playCount, setPlayCount] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [screenShake, setScreenShake] = useState(false);
  const [claimCode, setClaimCode] = useState<string | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const sessionId = useRef<string>('');
  const TAPS = 9;

  // ─── Load prizes from Supabase on mount ───
  useEffect(() => {
    sessionId.current = getSessionId();

    // Load today's play count from Supabase for this session
    async function init() {
      try {
        // Fetch active prizes
        const prizesData = await sbFetch('game_prizes', { query: '?active=eq.true&order=weight.desc' });
        if (prizesData && prizesData.length > 0) {
          setPrizes(prizesData);
        } else {
          // Fallback to hardcoded prizes if DB fetch fails
          setPrizes([
            { id: '1', prize_id: "free-cocktail", label: "Free Signature Cocktail", emoji: "\u{1F379}", tier: "big", weight: 5, prize_type: "item" },
            { id: '2', prize_id: "free-beer", label: "Free Craft Beer", emoji: "\u{1F37A}", tier: "big", weight: 5, prize_type: "item" },
            { id: '3', prize_id: "free-appetizer", label: "Free Appetizer", emoji: "\u{1F960}", tier: "medium", weight: 12, prize_type: "item" },
            { id: '4', prize_id: "bogo-cocktail", label: "Buy 1 Get 1 Cocktail", emoji: "\u{1F378}", tier: "medium", weight: 15, prize_type: "item" },
            { id: '5', prize_id: "bogo-beer", label: "Buy 1 Get 1 Beer", emoji: "\u{1F37B}", tier: "medium", weight: 13, prize_type: "item" },
            { id: '6', prize_id: "20-off", label: "20% Off Your Bill", emoji: "\u{1F4B0}", tier: "small", weight: 20, prize_type: "discount", discount_pct: 20, max_discount: 200000 },
            { id: '7', prize_id: "10-off", label: "10% Off Your Bill", emoji: "\u{1F389}", tier: "small", weight: 30, prize_type: "discount", discount_pct: 10, max_discount: 100000 },
          ]);
        }

        // Get play count for this session today
        const today = new Date().toISOString().split('T')[0];
        const plays = await sbFetch('game_plays', {
          query: `?session_id=eq.${sessionId.current}&played_at=gte.${today}T00:00:00&select=id`
        });
        if (plays) {
          setPlayCount(plays.length);
        }
      } catch (e) {
        console.error('Init error:', e);
      }
      setLoading(false);
    }
    init();
  }, []);

  // ─── Record play & create claim ───
  async function recordPlay(won: boolean, prize: Prize | null) {
    const code = won && prize ? generateClaimCode() : null;

    // Record the play
    await sbFetch('game_plays', {
      method: 'POST',
      body: {
        session_id: sessionId.current,
        won,
        prize_id: prize?.prize_id || null,
        claim_code: code,
      },
    });

    // If won, create a promo_claims entry
    if (won && prize && code) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

      await sbFetch('promo_claims', {
        method: 'POST',
        body: {
          claim_code: code,
          source_code: 'SCAN_TAP_WIN',
          contact_type: 'anonymous',
          contact_value: sessionId.current,
          prize_type: prize.prize_type === 'discount' ? 'discount' : 'freebie',
          prize_label: prize.label,
          prize_item_ref: prize.prize_id,
          discount_percent: prize.discount_pct || null,
          max_discount_vnd: prize.max_discount || null,
          status: 'active',
          expires_at: expiresAt.toISOString(),
        },
      });
    }

    return code;
  }

  const handleTap = useCallback(() => {
    if (gameState === "reveal" || loading) return;
    const next = tapCount + 1;
    setTapCount(next);
    setShaking(true); setTapFlash(true); setScreenShake(true);
    setTimeout(() => setShaking(false), 120);
    setTimeout(() => setTapFlash(false), 300);
    setTimeout(() => setScreenShake(false), 150);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(40);

    if (next >= TAPS) {
      setCrackStage(3); setGameState("reveal");
      const prize = pickPrize(prizes, playCount);
      setCurrentPrize(prize);
      if (prize) setTimeout(() => setShowConfetti(true), 400);

      // Record to Supabase
      recordPlay(!!prize, prize).then(code => {
        if (code) setClaimCode(code);
      });
    } else if (next >= 6) setCrackStage(2);
    else if (next >= 3) setCrackStage(1);
  }, [tapCount, gameState, playCount, prizes, loading]);

  function resetGame() {
    setGameState("ready"); setCrackStage(0); setTapCount(0);
    setCurrentPrize(null); setShowConfetti(false); setClaimCode(null);
    setPlayCount(p => p + 1);
  }

  const progress = Math.min(tapCount / TAPS, 1);
  const hitsLeft = TAPS - tapCount;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: B.bg, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", border: `3px solid ${B.tealBright}`, borderTopColor: "transparent", margin: "0 auto 20px", animation: "spin 0.8s linear infinite" }} />
          <div style={{ ...F.body, color: B.creamSoft }}>Loading...</div>
        </div>
        <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column",
      overflow: "hidden", fontFamily: "'DM Sans', sans-serif",
      userSelect: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent",
      transform: screenShake ? "translate(2px, 1px)" : "none",
      transition: screenShake ? "none" : "transform 0.1s",
    }}>
      <TropicalBG />
      <Confetti active={showConfetti} />
      {showWalletModal && <WalletModal prize={currentPrize} onClose={() => setShowWalletModal(false)} />}

      <div style={{ position: "relative", zIndex: 10, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "36px 20px 24px", maxWidth: 420, margin: "0 auto", width: "100%" }}>

        {/* Logo header */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <img src="https://bigbamboo.app/images/bbb-img-5.png" alt="BigBamBoo" style={{ width: 80, height: 80, borderRadius: 20, objectFit: "cover", marginBottom: 10, boxShadow: `0 4px 20px rgba(0,0,0,0.4)` }} />
          <div style={{ ...F.display, fontSize: 14, color: B.creamMuted, letterSpacing: "0.22em" }}>SCAN · TAP · WIN</div>
        </div>

        {/* Game area */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, width: "100%", cursor: gameState !== "reveal" ? "pointer" : "default", position: "relative" }}
          onClick={gameState !== "reveal" ? handleTap : undefined}>
          {gameState !== "reveal" && <ProgressRing progress={progress} />}
          {gameState !== "reveal" ? (
            <CoconutSVG crackStage={crackStage} shaking={shaking} tapFlash={tapFlash} />
          ) : (
            <div style={{ animation: "fadeInUp 0.5s ease-out" }}>
              <PrizeCard prize={currentPrize} claimCode={claimCode} onAddToWallet={() => setShowWalletModal(true)} onPlayAgain={resetGame} />
            </div>
          )}
        </div>

        {/* Hint + counter */}
        {gameState !== "reveal" && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <div style={{ ...F.body, fontSize: 15, fontWeight: 500, color: B.creamSoft, animation: tapCount === 0 ? "pulse 2.5s ease-in-out infinite" : "none" }}>
              {crackStage === 0 && "Tap to play!"}
              {crackStage === 1 && "Keep going..."}
              {crackStage === 2 && "Almost there!"}
            </div>
            {tapCount > 0 && (
              <div style={{ ...F.body, fontSize: 12, color: B.creamMuted, marginTop: 6 }}>
                {hitsLeft} {hitsLeft === 1 ? "hit" : "hits"} left
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 24, textAlign: "center" }}>
          <div style={{ ...F.body, fontSize: 11, color: B.creamMuted, letterSpacing: "0.05em" }}>bigbamboo.app &middot; An Phu, Saigon</div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes coconutFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes coconutShake { 0%{transform:translateX(-4px) rotate(-3deg)} 100%{transform:translateX(4px) rotate(3deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes prizePop { 0%{transform:scale(0) rotate(-10deg)} 60%{transform:scale(1.2) rotate(3deg)} 100%{transform:scale(1) rotate(0)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @keyframes glowPulse { 0%,100%{opacity:1;transform:translateX(-50%) scale(1)} 50%{opacity:0.65;transform:translateX(-50%) scale(1.06)} }
        @keyframes impactFlash { 0%{opacity:1;transform:scale(0.8)} 100%{opacity:0;transform:scale(1.6)} }
        @keyframes crackAppear { from{opacity:0} to{opacity:1} }
      `}</style>
    </div>
  );
}

// ─── Font Shortcuts ───
const F = {
  display: { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em", lineHeight: 1.1 } as const,
  body: { fontFamily: "'DM Sans', sans-serif" } as const,
  label: { fontFamily: "'DM Sans', sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" as const } as const,
};

// ─── Button Styles ───
const S = {
  btnPrimary: {
    display: "inline-flex", alignItems: "center", gap: 10,
    background: `linear-gradient(135deg, ${B.teal}, ${B.tealBright})`,
    color: B.cream, border: "none", borderRadius: 14,
    padding: "15px 30px", fontSize: 15, fontWeight: 600, cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    boxShadow: `0 6px 24px ${B.tealGlow}, inset 0 1px 0 rgba(255,255,255,0.12)`,
  },
  btnGhost: {
    background: `${B.cream}0a`, color: B.creamSoft,
    border: `1px solid ${B.cream}12`, borderRadius: 12,
    padding: "11px 24px", fontSize: 14, fontWeight: 500, cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  },
  walletBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    width: "100%", background: `${B.cream}08`, color: B.cream,
    border: `1px solid ${B.cream}12`, borderRadius: 14,
    padding: "15px 20px", fontSize: 15, fontWeight: 500, cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  },
};
