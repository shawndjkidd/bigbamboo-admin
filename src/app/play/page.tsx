'use client'
import { useState, useEffect, useRef, useCallback } from "react";

/*
 * ════════════════════════════════════════════════════════════════
 *  BIGBAMBOO SCAN · TAP · WIN
 *  Whack-a-mole game → Slot machine reel → Prize reveal → Claim
 *  Brand: dark teal + warm cream + gold + tropical accents
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

// ─── Brand Palette ───
const B = {
  bg: "#0e2820",
  bgCard: "#1a4a3a",
  bgCardLight: "#1f4442",
  bgOverlay: "rgba(14,40,32,0.85)",
  teal: "#2a8a6a",
  tealBright: "#4aaa90",
  tealGlow: "rgba(74,170,144,0.25)",
  gold: "#f0a020",
  goldLight: "#f5c842",
  goldGlow: "rgba(240,160,50,0.3)",
  orange: "#e87830",
  orangeDeep: "#f09050",
  green: "#00b14f",
  greenDeep: "#0a7a30",
  cream: "#f5eed8",
  creamSoft: "rgba(245,238,216,0.75)",
  creamMuted: "rgba(245,238,216,0.4)",
  creamFaint: "rgba(245,238,216,0.15)",
  white: "#ffffff",
  dark: "#0e2820",
};

// ─── Font Shortcuts ───
const F = {
  display: { fontFamily: "'Sigmar', cursive", letterSpacing: "0.02em", lineHeight: 1.1 } as const,
  body: { fontFamily: "'DM Sans', sans-serif" } as const,
  label: { fontFamily: "'DM Sans', sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" as const } as const,
  mono: { fontFamily: "'DM Mono', monospace" } as const,
};

// ─── Button Styles ───
const S = {
  btnPrimary: {
    display: "inline-flex", alignItems: "center", gap: 10,
    background: `linear-gradient(135deg, ${B.orange}, ${B.orangeDeep})`,
    color: B.white, border: "none", borderRadius: 16,
    padding: "17px 36px", fontSize: 16, fontWeight: 700, cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    boxShadow: `0 8px 32px rgba(232,120,48,0.4), inset 0 1px 0 rgba(255,255,255,0.15)`,
  } as const,
  btnGhost: {
    background: `rgba(255,255,255,0.06)`, color: "rgba(255,255,255,0.5)",
    border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 14,
    padding: "13px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  } as const,
};

// ─── Game Constants ───
const GAME_DURATION = 15;

// ─── Mole Types ───
const MOLE_TYPES = [
  { id: 'hops', color: '#8DB850', points: 1, svg: '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M455.016 31.335c-7.352 27.563-11.672 51.534-29.666 70.475a132.12 132.12 0 0 1 10.89 14.457c21.859-21.479 31.27-55.32 36.444-81.483zm-365.77 86.553c26.53 23.311 75.437 43.214 128.588 50.441 8.93-54.446 25.763-101.262 78.663-111.742-87.441-32.988-169.736-14.856-207.25 61.3zm181.012-30.992c-23.32 17.537-33.49 55.18-35.172 93.896-1.561 35.96 3.991 71.655 9.075 90.1 18.466 5.08 54.205 10.628 90.213 9.068 38.762-1.68 76.457-11.845 94.011-35.137 26.195-44.685 11.365-102.657-21.504-136.447-35.854-30.649-96.195-50.896-136.623-21.48zM93.756 144.06c-21.448 19.766-37.77 47.077-44.715 84.466 29.077 14.704 53.089 19.928 81.481 23.61 19.863-23.625 28.623-48.967 39.228-75.043-29.084-7.861-55.342-19.184-75.994-33.033zm93.71 37.314c-13.41 45.213-43.135 138.013-19.993 166.121 20.996 20.505 122.712-2.301 166.324-19.967a359.482 359.482 0 0 1-5.027-29.386c-33.203-1.003-67.74-2.657-99.18-12.67-8.98-34.162-13.172-70.091-12.685-99.073a360.408 360.408 0 0 1-29.44-5.025zm271.243 37.24c-9.797 53.078-68.758 74.708-111.867 78.6 7.237 53.09 27.16 101.938 50.498 128.433 85.392-40.18 90.077-136.087 61.37-207.033zM59.217 254.495c-13.823 25.304-23.43 57.957-25.054 84.063 16.933 5.432 36.996 6.918 53.347 7.308 6.387-25.338 18.476-51.542 32.994-76.928-20.58-3.495-43.292-7.486-61.287-14.443zm88.59 3.938c-22.603 45.341-56.073 107.837-42.664 151.328 57.858 6.862 111.673-17.601 151.47-42.592-32.613 5.741-81.751 15.043-103.86-4.938-18.09-28.865-13.015-58.231-4.946-103.798zm190.277 86.802c-30.287 7.312-51.234 24.35-75.14 39.196 4.16 25.089 9.576 60.967 23.635 81.375 37.436-6.937 64.779-23.24 84.568-44.662-13.862-20.63-25.194-46.859-33.063-75.909zM46.331 360.267c-10.174 36.445-17.91 81.317-4.399 112.632 31.358 13.502 76.288 5.774 112.777-4.39-2.03-12.867-3.194-26.613-3.529-37.592-23.234 1.407-41.295.55-59.984-7.201-7.773-19.583-9.502-42.678-7.215-59.922-13.049-.685-25.974-1.445-37.65-3.527zm199.806 34.162c-25.42 14.508-51.66 26.588-77.03 32.968.398 20.603.666 38.958 7.315 53.268 31-3.247 58.572-10.692 84.17-25.025-7.523-22.172-11.492-40.957-14.455-61.211z"/></svg>' },
  { id: 'shotglass', color: '#F0A830', points: 1, svg: '<svg fill="currentColor" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="m11.37 9.85.87-6.4a1.22 1.22 0 0 0-.3-1A1.24 1.24 0 0 0 11 2H2.85a1.24 1.24 0 0 0-1.23 1.41l1.15 8.48A1.27 1.27 0 0 0 4 13h4.84a4.41 4.41 0 0 0 2.66 1h.14a3.9 3.9 0 0 0 2.76-1.12zM11 3.25l-.15 1.09H3l-.15-1.09zM7.23 9.72a4.28 4.28 0 0 0 .57 2H4l-.83-6.13h7.47l-.42 3.11-1.87-1.87a3.83 3.83 0 0 0-1.12 2.89zm4.31 3a3.18 3.18 0 0 1-2.12-.94 3.21 3.21 0 0 1-.95-2.13 2.71 2.71 0 0 1 .11-.86l1.91 1.92 1.91 1.91a2.73 2.73 0 0 1-.76.1z"/></svg>' },
  { id: 'beerpint', color: '#F5D623', points: 1, svg: '<svg fill="currentColor" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M399,99.29,394,16H118.45L113,99.26c-1.29,19.24-2.23,33.14,3.73,65.66,1.67,9.11,5.22,22.66,9.73,39.82,12.61,48,33.71,128.36,33.71,195.63V496H351.85V400.38c0-77.09,21.31-153.29,34-198.81,4.38-15.63,7.83-28,9.41-36.62C401.27,132.44,400.33,118.53,399,99.29ZM146.23,80l2-32H363.75l2,32Z"/></svg>' },
  { id: 'tiki', color: '#D44060', points: 1, svg: '<svg fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M142.4,42.9c2-4.3,6.6-8.3,14.6-11.5V14.6l8.7,13.8c2.9-0.9,6.3-1.6,9.3-2.2V9l9.8,15.8 c1.7-0.2,3.2-0.3,5.2-0.4V9l9.4,15.2c8.6,0.2,17.3,1.4,25.3,3.9C220.9,16,200.4,5,196.9,4.3c-35.7-10.9-68.8,20-69.4,28.3 C115.5-1,60.6,1,34.9,30.7c20.1-5.2,76.4-2.8,80.4,15.5c-12.6-2.8-60.7-31.6-87,48.5c52.3-30.9,76.1-42.3,81.9-38.2 c-39.1,13.8-25.6,52.1-25.6,52.1s13.7-32.1,30.1-35l2.8,0.2c-15.6,60.8-22.5,112-3.8,174H63v8h124v-8h-42.5 c-24.1-57-20.3-111-7.6-173.1l2.6,0.2c8.9,4.9,26.5,33.6,29.8,42.9c6.3-22.6-0.5-42.7-19.1-57.1c2.8-1.6,8.9-1.5,16.5-0.3l2.5-14 l7.3,15.8l-0.2,0c2.9,0.6,5.8,1.3,8.8,2.1l4.5-18l4.8,20.6c2.3,0.7,4.5,1.3,6.6,2l4.2-16.7l4.6,19.7c6.9,2.4,12.3,4.7,14.8,6.1 C223.3,61.5,201.4,21,142.4,42.9z"/></svg>' },
  { id: 'highball', color: '#4CAF50', points: 1, svg: '<svg fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 244"><path d="M2,2l30.42,219.36C34.06,233.16,44.53,242,56.48,242h146c11.89,0,22.42-8.79,24.11-20.53L258,2H2z M130,196 c0,3.31-2.69,6-6,6H72c-3.31,0-6-2.69-6-6v-44c0-3.31,2.69-6,6-6h52c3.31,0,6,2.69,6,6V196z M225.68,114H203l4.7,10.51 c1.27,3.06-0.19,6.57-3.26,7.83c0,0-48.07,19.81-48.07,19.81c-2.516,1.017-6.349,0.225-7.84-3.26L134,114h-27l-20.43,19.93 c-2.34,2.35-6.14,2.35-8.48,0L58,114H33.67L20.31,18h219.03L225.68,114z M117.684,102.821c2.343-2.343,2.343-6.142,0-8.485 l-36.77-36.77c-2.343-2.343-6.142-2.343-8.485,0L41.316,88.679c-2.343,2.343-2.343,6.142,0,8.485L58,114h49L117.684,102.821z M190.939,83.824c-1.263-3.064-4.77-4.524-7.834-3.261l-48.077,19.813c-3.064,1.263-4.524,4.77-3.261,7.834L134,114l69,0 L190.939,83.824z"/></svg>' },
  { id: 'pineapple', color: '#F5D623', points: 1, svg: '<svg fill="currentColor" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M60.07,20.359c-2.21,2.38-4.37,9.44-3.58,13.01c-7.32,0.97-16.16,6.09-19.63,10.01c0.59-3.48,1.52-7.64,4.29-8.8 c0.25-0.11,0.37-0.4,0.27-0.65c-0.11-0.26-0.41-0.38-0.66-0.27c-3.59,1.5-4.45,6.83-5.08,10.72c-0.23,1.4-0.54,3.32-0.82,3.53 c-6.78-2.43-6.9-8.71-6.56-10.25c0.22-0.98,0.81-1.74,1.76-2.27c1.08-0.6,2.19-0.64,2.39-0.56c0.14,0.05,0.3,0.04,0.43-0.04 s0.22-0.21,0.24-0.36c0.14-0.95,1.02-3.08,3.41-4.29c4.46-2.26,9.46-0.26,11.16,2.96c0.13,0.24,0.43,0.34,0.68,0.21 c0.24-0.13,0.33-0.43,0.21-0.68c-0.45-0.85-1.11-1.64-1.92-2.29c-0.17-0.48-1.22-3.84,2.55-7.42c3.77-3.57,10.12-3.83,11.01-2.95 C60.26,19.999,60.33,20.079,60.07,20.359z"/><path d="M32.8,48.099c-0.3,0.58-0.56,1.17-0.79,1.77c-1.12-0.91-2.88-1.45-4.78-1.45h-0.01c-1.58,0-4.57,0.39-6.91,2.97 c-0.8,0.88-1.52,1.06-2.13,0.54c-1.5-1.28-1.87-5.83,0.52-8.82c3.1-3.89,6.27-3.71,8.17-3.6l0.31,0.02h0.03 C27.36,42.089,28.56,45.869,32.8,48.099z"/><path d="M48.53,22.199c-3.07,2.91-3.29,5.72-3.08,7.3c-2.58-1.5-6.11-1.91-9.37-0.26c-2.41,1.23-3.5,3.3-3.85,4.56 c-0.71-0.01-1.72,0.21-2.6,0.69c-1.23,0.66-2.02,1.68-2.3,2.95c-0.06,0.29-0.11,0.66-0.13,1.09l-0.27-0.02 c-1.59-0.09-4.29-0.25-7.09,2.02c-2.53-3.16-7.35-3.91-9.67-4.28c-0.18-0.03-0.18-0.05-0.17-0.18c0.11-1.44,4.9-6.24,8.48-6.33 c2.13,1.98,4.46,3.57,6.75,5.06c0.08,0.05,0.18,0.08,0.27,0.08c0.17,0,0.33-0.08,0.42-0.23c0.15-0.23,0.09-0.54-0.15-0.69 c-4.1-2.67-8.35-5.68-11.19-10.62c-0.44-0.77-0.14-1.52,0.9-2.22c3.67-2.45,14.47-2.87,19.03,3.02c0.17,0.22,0.48,0.26,0.7,0.09 s0.26-0.48,0.09-0.7c-1.18-1.53-2.72-2.66-4.44-3.47c-0.01-0.02-0.01-0.03-0.02-0.04c-2.11-3.48-0.55-8.35,0.28-10.96 c0.14-0.43,0.26-0.8,0.34-1.1c1.19-0.11,5.54-0.05,9.71,5.96c0.03,0.05,0.07,0.08,0.11,0.11c-1.28,2.93-1.97,6.54-1.12,10.58 c0.05,0.23,0.26,0.39,0.49,0.39c0.03,0,0.07,0,0.1-0.01c0.27-0.05,0.44-0.32,0.39-0.59c-1.69-7.99,3.04-13.64,4.52-15.18 c1.43-1.48,2.6-2.13,3.05-2.21c0.18,2.09,1.59,10.09,3.49,12.81C50.87,20.389,49.6,21.179,48.53,22.199z"/><path d="M29.45,19.479c-3.65-1.3-7.82-1.32-10.99-0.59c-0.11-0.71-0.65-3.92-1.17-6.01c-0.01-0.05-0.01-0.08,0.08-0.14 c1.34-0.95,8.62,0.14,11.42,2.01c0.01,0.01,0.02,0.01,0.03,0.02C28.7,16.339,28.83,17.969,29.45,19.479z"/><path d="M86.08,59.209c-0.11-0.12-0.14-0.28-0.12-0.42c-0.01-0.2-0.21-1.42-2.56-7.19c-2.79-6.85-7.08-8.69-7.12-8.71 c-0.13-0.06-0.23-0.16-0.28-0.29c-1.66-4.54-7.8-8.48-11.57-8.48h-0.12c-1.18,0.03-1.91,0.46-2.17,1.3 c-0.09,0.26-0.37,0.41-0.63,0.32c-0.26-0.08-0.41-0.36-0.33-0.63c0.07-0.22,0.16-0.42,0.29-0.61c-7.99-1.98-22.64,6.47-24.91,10.98 c-0.02,0.03-0.04,0.06-0.06,0.09c-0.33,1.88-0.58,2.86-1.18,3.22c-0.15,0.08-0.3,0.12-0.46,0.12c-0.11,0-0.22-0.02-0.34-0.06 c-0.28-0.1-0.55-0.21-0.81-0.32c-3.14,6.08-2.38,13.16,2.16,20.55c0-1.07,0.21-1.5,0.45-1.76c0.21-0.24,0.51-0.35,0.84-0.32 c0.76,0.08,3.35,0.3,3.35,0.3l-0.09,1c0,0-2.6-0.23-3.36-0.3c-0.06,0.03-0.49,0.51,0.19,4.35c0.66,3.63,4.78,10.24,7.57,12.92 c2.95,3.75,5.93,5.73,9.7,6.47c0.07,0.02,0.13,0.04,0.19,0.09c1.72,1.23,6.24,1.33,8.75,1.02c6.86-0.87,11.44-5.06,11.63-5.23 c0.06-0.06,0.13-0.1,0.21-0.12c2.23-0.6,5.7-2.61,8.07-4.67c3.03-2.64,3.7-5.39,3.71-5.42c0.02-0.1,0.08-0.2,0.16-0.27 c0.03-0.02,2.8-2.46,2.76-7.89C89.95,63.749,86.12,59.249,86.08,59.209z M43.6,51.119c-0.05,0.24-0.26,0.41-0.49,0.41 c-0.04,0-0.07,0-0.1-0.01c-0.27-0.05-0.45-0.31-0.4-0.58c0.23-1.24,1.3-3.94,1.98-4.16c0.3-0.09,2.08-0.44,2.43-0.5 c0.26-0.06,0.53,0.12,0.58,0.39c0.06,0.28-0.12,0.54-0.39,0.59c-0.91,0.17-1.92,0.38-2.23,0.45 C44.68,48.079,43.84,49.789,43.6,51.119z M47.41,67.809h-0.03c-0.26,0-0.48-0.2-0.5-0.47c-0.07-0.87-0.11-2.96,0.89-3.4 c0.92-0.42,6.48-0.65,9.29-0.4c0.28,0.03,0.48,0.27,0.45,0.55c-0.02,0.27-0.26,0.47-0.54,0.45c-2.89-0.27-8.15,0.01-8.79,0.31 c-0.23,0.14-0.38,1.35-0.3,2.42C47.9,67.549,47.69,67.789,47.41,67.809z M58.01,85.129c-2.89-0.27-8.15,0.02-8.79,0.31 c-0.23,0.15-0.38,1.35-0.3,2.42c0.01,0.28-0.19,0.52-0.47,0.54h-0.03c-0.26,0-0.48-0.2-0.5-0.46c-0.07-0.88-0.11-2.97,0.89-3.41 c0.92-0.42,6.48-0.65,9.29-0.4c0.28,0.03,0.48,0.27,0.45,0.55C58.53,84.949,58.29,85.159,58.01,85.129z M70.55,42.159 c-0.07,0.27-0.34,0.43-0.61,0.36c-0.97-0.25-2.9,0-3.51,0.14c-0.27,0.24-1.01,2.61-1.13,5.16c-0.01,0.27-0.24,0.48-0.5,0.48 c-0.01,0-0.02,0-0.02,0c-0.28-0.02-0.49-0.25-0.48-0.53c0.07-1.52,0.65-5.79,1.91-6.08c0.63-0.15,2.75-0.46,3.98-0.14 C70.46,41.619,70.62,41.889,70.55,42.159z M84.18,66.009c-0.05,0.23-0.26,0.39-0.49,0.39c-0.03,0-0.07,0-0.11-0.01 c-0.63-0.14-1.24-0.28-1.83-0.41c-3.36-0.77-6.26-1.43-7.03-0.27c-0.15,0.23-0.46,0.29-0.69,0.13c-0.23-0.15-0.29-0.46-0.14-0.69 c1.16-1.73,4.06-1.06,8.08-0.15c0.59,0.14,1.2,0.28,1.83,0.41C84.07,65.469,84.24,65.739,84.18,66.009z"/></svg>' },
  { id: 'chicken', color: '#E84430', points: 2, svg: '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M365.852 31.858c-10.152 2.474-24.915 7.073-37.437 13.602-9.2 4.797-17.277 10.575-21.928 16.19-4.65 5.618-6.05 9.96-4.416 15.587l3.556 12.254-12.736-.76c-3.048-.183-4.944-.117-7.364-.262-2.42-.146-5.405-.706-8.27-1.87-3.86-1.568-9.082-4.65-16.085-8.91-.366 4.63-.58 10.108-.407 16.006.38 12.915 2.02 27.945 4.82 41.17 1.328 6.27 3.007 12.134 4.805 17.13 2.992-4.705 6.264-9.202 9.84-13.368 17.022-19.818 40.47-41.586 69.867-43.697 14.423-1.037 29.333 5.324 42.554 12.41 3.997-7.635 10.257-13.963 16.617-19.67 6.403-5.748 13.146-11.018 18.95-15.97-9.552-6.72-16.81-10.074-23.02-10.855-7.936-.998-16.028 1.45-28.835 8.828l-15.21 8.762 4.7-46.577zm-12.796 80.995a16.57 16.57 0 0 0-1.672.03c-20.817 1.494-41.72 19.098-57.5 37.47-13.842 16.117-23.36 41.13-28.65 61.556 6.866 1.127 14.21 2.21 21.564 2.43 10.95.33 20.46-1.593 25.334-5.83l7.04-6.114 5.862 7.25c4.956 6.128 10.802 14.087 14.32 23.476 1.78 4.75 2.88 10.128 2.698 15.607 12.487-2.64 23.93-7.162 28.884-12.86l5.256-6.043 6.614 4.52c10.006 6.838 19.827 14.582 26.634 25.236 1.033-3.752 1.935-7.666 2.416-11.75 1.503-12.738-.18-25.93-6.636-35.494-10.232-11.257-22.116-22.055-24.93-37.03-1.066-5.675.69-10.02 2.78-14.29 2.092-4.27 4.972-8.467 8.35-12.593 3.803-4.644 8.228-9.1 12.948-13.05-4.015-2.658-8.39-5.55-13.877-8.665-12.77-7.256-28.594-13.592-37.434-13.86zM48.52 128.626c-6.353-.037-9.976.466-9.976 1.576 2.82 12.857 7.998 26.53 15.432 39.48 26.005-3.718 53.01-5.705 80.652-5.488 26.75 8.66 54.68 16.02 80.83 25.338-25.477-4.52-50.737-6.842-75.512-7.3a489.987 489.987 0 0 0-11.82-.073c-28.5.16-56.26 2.772-82.938 7.17 4.785 32.48 20.097 79.06 50.397 120.476 32.95 45.036 82.958 84.022 156.976 94.457 58.185 8.202 107.473-4.926 132.47-31.346 12.5-13.21 19.395-29.548 19.23-49.768-.157-18.958-6.877-41.526-22.327-67.106-1.133-.884-2.3-1.766-3.52-2.654-13.164 10.368-31.666 13.752-47.895 15.322l-18.392 1.78 9.94-15.58c2.974-4.66 2.76-9.265.433-15.474-1.486-3.962-4.016-8.048-6.75-11.992-9.13 4.418-19.634 5.185-29.495 4.887-12.977-.392-25.546-2.913-33.66-4.262l-9.268-1.538 1.936-9.193c2.894-13.746 7.735-30.663 15.19-46.902-46.584-23.24-175.11-41.595-211.933-41.812zm303.762.088c8.852 0 16.186 7.384 16.186 16.213 0 8.83-7.334 16.213-16.186 16.213-8.85 0-16.187-7.384-16.187-16.213 0-8.83 7.336-16.213 16.187-16.213zm73.906 13.47l-1.707.936c-5.958 3.275-13.704 10.08-19.133 16.71-2.715 3.316-4.887 6.612-6.11 9.108-.885 1.807-1.032 3.154-1.13 3.35 1.295 5.8 10.486 16.914 20.966 28.522l.387.427.326.473a54.88 54.88 0 0 1 4.754 8.342c11.47.563 23.966-.753 38.652-3.727l-41.35-30.937s37.437.748 51.126-1.635c4.696-.818-25.494-22.228-46.78-31.57z"/></svg>' },
  { id: 'pig', color: '#8B5E3C', points: 2, svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M205.794,300.871c-11.656,0-21.109,9.453-21.109,21.094c0,11.656,9.453,21.109,21.109,21.109 c11.641,0,21.094-9.453,21.094-21.109C226.888,310.324,217.435,300.871,205.794,300.871z"/><path fill="currentColor" d="M306.216,300.871c-11.656,0-21.094,9.453-21.094,21.094c0,11.656,9.438,21.109,21.094,21.109 s21.094-9.453,21.094-21.109C327.31,310.324,317.872,300.871,306.216,300.871z"/><path fill="currentColor" d="M411.794,178.98c16.063,9.188,29.438,11.734,40.703,10.688c41.156-9.328,67.906-52.328,57.094-59.219 c-15.266-9.703-58.313-66.641-94.422-70.797c-29.375-3.406-58.75,30-76.906,47.031c-25.188-7.969-53-12-82.266-12 c-29.25,0-57.078,4.031-82.25,12C155.591,89.652,126.2,56.246,96.825,59.652c-36.094,4.156-79.141,61.094-94.422,70.797 c-10.797,6.891,15.953,49.891,57.109,59.219c11.25,1.047,24.625-1.5,40.703-10.688c3.219-1.609-10.031,15.766-37.234,25.219 c-8.063,20.344-12.484,43.5-12.484,69.438c0,118.609,92.016,178.954,205.5,178.954c113.5,0,205.5-60.344,205.5-178.954 c0-25.938-4.406-49.094-12.469-69.438C421.825,194.746,408.575,177.371,411.794,178.98z M333.356,194.324 c10.734,0,19.438,8.703,19.438,19.438c0,10.75-8.703,19.453-19.438,19.453s-19.438-8.703-19.438-19.453 C313.919,203.027,322.622,194.324,333.356,194.324z M178.653,194.324c10.734,0,19.438,8.703,19.438,19.438 c0,10.75-8.703,19.453-19.438,19.453s-19.438-8.703-19.438-19.453C159.216,203.027,167.919,194.324,178.653,194.324z M306.216,377.761c-22.094,0-41.172-12.828-50.219-31.453c-9.047,18.625-28.125,31.453-50.203,31.453 c-30.828,0-55.797-24.969-55.797-55.797c0-30.797,24.969-55.781,55.797-55.781h100.422c30.813,0,55.781,24.984,55.781,55.781 C361.997,352.792,337.028,377.761,306.216,377.761z"/></svg>' },
];

// ─── Prize Types (from Supabase) ───
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

// ─── Play Decay (defaults, overridden by Supabase game_config) ───
const DEFAULT_DECAY = [
  { big: 5, medium: 25, small: 40, none: 30 },   // 1st play: 70% win
  { big: 2, medium: 15, small: 33, none: 50 },   // 2nd play: 50% win
  { big: 0, medium: 5, small: 25, none: 70 },    // 3rd play: 30% win
  { big: 0, medium: 2, small: 13, none: 85 },    // 4th+:    15% win
];

function pickPrize(prizes: Prize[], playCount: number, decayTable: typeof DEFAULT_DECAY): Prize {
  const decay = decayTable[Math.min(playCount, decayTable.length - 1)];
  const roll = Math.random() * 100;
  const { big, medium, small } = decay;
  let tier: string;
  if (roll < big) tier = "big";
  else if (roll < big + medium) tier = "medium";
  else tier = "small"; // Everyone wins — no "none" outcome
  const pool = prizes.filter((p) => p.tier === tier);
  if (pool.length === 0) {
    // Fallback: if tier pool is empty, pick from small, then any
    const fallback = prizes.filter((p) => p.tier === "small");
    const any = fallback.length > 0 ? fallback : prizes;
    const tw = any.reduce((s, p) => s + p.weight, 0);
    let w = Math.random() * tw;
    for (const p of any) { w -= p.weight; if (w <= 0) return p; }
    return any[any.length - 1];
  }
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
    particles.current = Array.from({ length: 120 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 120,
      y: H * 0.42, vx: (Math.random() - 0.5) * 18, vy: -Math.random() * 18 - 6,
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
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 40 }} />;
}

// ─── Jungle Background ───
function JungleBG() {
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, background: B.bg }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 0,
        background: "url('https://bigbamboo.app/images/bbb-img-1.png') center/cover" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 0,
        background: `linear-gradient(180deg, rgba(14,40,32,0.6) 0%, rgba(14,40,32,0.4) 40%, rgba(14,40,32,0.55) 70%, rgba(10,28,20,0.88) 100%)` }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 0,
        background: "radial-gradient(ellipse, transparent 40%, rgba(8,20,16,0.6) 100%)" }} />
    </>
  );
}

// ─── Screen Wrapper ───
function Screen({ active, children, scrollable }: { active: boolean; children: React.ReactNode; scrollable?: boolean }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: scrollable ? "flex-start" : "center",
      padding: scrollable ? "40px 20px 24px" : "24px 20px",
      opacity: active ? 1 : 0, pointerEvents: active ? "auto" : "none",
      transition: "opacity 0.5s",
      overflowY: scrollable ? "auto" : "hidden",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {children}
    </div>
  );
}

// ─── Main Game Component ───
export default function PlayPage() {
  // ─── State ───
  const [screen, setScreen] = useState<'landing' | 'countdown' | 'playing' | 'reel' | 'reveal' | 'claim'>('landing');
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [playCount, setPlayCount] = useState(0);
  const [decayTable, setDecayTable] = useState(DEFAULT_DECAY);
  const [existingClaim, setExistingClaim] = useState<any>(null);
  const [showRules, setShowRules] = useState(false);
  const [checkingContact, setCheckingContact] = useState(false);

  // Game state
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [countdownNum, setCountdownNum] = useState(3);
  const [moles, setMoles] = useState<(null | { type: typeof MOLE_TYPES[0]; up: boolean; hit: boolean })[]>(
    Array(9).fill(null)
  );
  const [scorePops, setScorePops] = useState<{ id: number; idx: number; points: number }[]>([]);
  const [hitFlash, setHitFlash] = useState<number[]>([]);

  // Reel state
  const [reelPrize, setReelPrize] = useState<Prize | null>(null);
  const [reelStatus, setReelStatus] = useState('');
  const [reelLanded, setReelLanded] = useState(false);

  // Prize/claim state
  const [currentPrize, setCurrentPrize] = useState<Prize | null>(null);
  const [claimCode, setClaimCode] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [contactMode, setContactMode] = useState<'phone' | 'email'>('phone');
  const [contactValue, setContactValue] = useState('');
  const [contactError, setContactError] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Refs
  const sessionId = useRef<string>('');
  const gameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameRunning = useRef(false);
  const popIdRef = useRef(0);
  const reelStripRef = useRef<HTMLDivElement>(null);
  const timeLeftRef = useRef(GAME_DURATION);

  // ─── Load prizes ───
  useEffect(() => {
    sessionId.current = getSessionId();
    async function init() {
      try {
        const prizesData = await sbFetch('game_prizes', { query: '?active=eq.true&order=weight.desc' });
        if (prizesData && prizesData.length > 0) {
          setPrizes(prizesData);
        } else {
          setPrizes([
            { id: '1', prize_id: "any_cocktail", label: "Free Cocktail", emoji: "", tier: "big", weight: 3, prize_type: "item" },
            { id: '2', prize_id: "sandwich", label: "Free Slamwich", emoji: "", tier: "big", weight: 5, prize_type: "item" },
            { id: '3', prize_id: "sparkling_sangria", label: "Free Sparkling Sangria", emoji: "", tier: "medium", weight: 10, prize_type: "item" },
            { id: '4', prize_id: "vodka_earl_grey", label: "Free Vodka Earl Grey Lemonade", emoji: "", tier: "medium", weight: 10, prize_type: "item" },
            { id: '5', prize_id: "huda", label: "Free Huda Draft", emoji: "", tier: "medium", weight: 15, prize_type: "item" },
            { id: '6', prize_id: "15_off_food", label: "15% Off Food", emoji: "", tier: "small", weight: 25, prize_type: "discount", discount_pct: 15, max_discount: 200000 },
            { id: '7', prize_id: "10_off", label: "10% Off Your Bill", emoji: "", tier: "small", weight: 32, prize_type: "discount", discount_pct: 10, max_discount: 100000 },
          ]);
        }
        // Fetch dynamic decay settings
        const configData = await sbFetch('site_settings', { query: '?key=eq.game_config&select=value' });
        if (configData && configData.length > 0) {
          try {
            const cfg = JSON.parse(configData[0].value);
            if (cfg.decay && Array.isArray(cfg.decay)) setDecayTable(cfg.decay);
          } catch (e) { console.error('Bad game_config:', e); }
        }

        const today = new Date().toISOString().split('T')[0];
        const plays = await sbFetch('game_plays', {
          query: `?session_id=eq.${sessionId.current}&played_at=gte.${today}T00:00:00&select=id`
        });
        if (plays) setPlayCount(plays.length);
      } catch (e) { console.error('Init error:', e); }
      setLoading(false);
    }
    init();
  }, []);

  // ─── Record play & create claim ───
  async function recordPlay(won: boolean, prize: Prize | null) {
    // Only record the game play — claim is created later when contact info is collected
    const code = won && prize ? generateClaimCode() : null;
    await sbFetch('game_plays', {
      method: 'POST',
      body: { session_id: sessionId.current, won, prize_id: prize?.prize_id || null, claim_code: code },
    });
    return code;
  }

  // ─── Begin Game (countdown) ───
  function beginGame() {
    setScreen('countdown');
    setScore(0);
    scoreRef.current = 0;
    setTimeLeft(GAME_DURATION);
    timeLeftRef.current = GAME_DURATION;
    setMoles(Array(9).fill(null));
    setCountdownNum(3);

    let count = 3;
    if (navigator.vibrate) navigator.vibrate(50);
    const cdInterval = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdownNum(count);
        if (navigator.vibrate) navigator.vibrate(50);
      } else {
        clearInterval(cdInterval);
        setCountdownNum(0);
        if (navigator.vibrate) navigator.vibrate([50, 30, 80]);
        setTimeout(() => startGame(), 500);
      }
    }, 700);
  }

  // ─── Start Game ───
  function startGame() {
    setScreen('playing');
    gameRunning.current = true;

    // Timer
    const startTime = Date.now();
    gameTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, GAME_DURATION - elapsed);
      timeLeftRef.current = remaining;
      setTimeLeft(remaining);
      if (remaining <= 0) {
        endGame();
      }
    }, 100);

    // Start spawning
    scheduleSpawn();
  }

  // ─── Spawn Logic ───
  function scheduleSpawn() {
    if (!gameRunning.current) return;
    const elapsed = GAME_DURATION - timeLeftRef.current;
    const speedFactor = 1 - (elapsed / GAME_DURATION) * 0.5;
    const delay = (600 + Math.random() * 400) * speedFactor;

    spawnTimerRef.current = setTimeout(() => {
      if (!gameRunning.current) return;
      spawnMole();
      // After 40% elapsed, 30% chance of double spawn
      if (elapsed / GAME_DURATION > 0.4 && Math.random() < 0.3) {
        setTimeout(() => { if (gameRunning.current) spawnMole(); }, 150);
      }
      scheduleSpawn();
    }, delay);
  }

  function spawnMole() {
    setMoles(prev => {
      const available = prev.map((m, i) => (!m || (!m.up && !m.hit)) ? i : -1).filter(i => i >= 0);
      if (available.length === 0) return prev;
      const idx = available[Math.floor(Math.random() * available.length)];

      // Rare items (chicken, pig - 2pt) appear 20% of the time
      const isRare = Math.random() < 0.2;
      const pool = isRare ? MOLE_TYPES.filter(m => m.points >= 2) : MOLE_TYPES.filter(m => m.points === 1);
      const type = pool[Math.floor(Math.random() * pool.length)];

      const next = [...prev];
      next[idx] = { type, up: true, hit: false };

      // Auto-hide after a duration based on speed
      const elapsed = GAME_DURATION - timeLeftRef.current;
      const speedFactor = 1 - (elapsed / GAME_DURATION) * 0.5;
      const upTime = (800 + Math.random() * 600) * speedFactor;

      setTimeout(() => {
        setMoles(p => {
          const n = [...p];
          if (n[idx] && n[idx]!.up && !n[idx]!.hit) {
            n[idx] = null;
          }
          return n;
        });
      }, upTime);

      return next;
    });
  }

  // ─── Whack Mole ───
  function whackMole(idx: number) {
    if (!gameRunning.current) return;
    setMoles(prev => {
      if (!prev[idx] || !prev[idx]!.up || prev[idx]!.hit) return prev;
      const next = [...prev];
      const mole = next[idx]!;
      const points = mole.type.points;
      next[idx] = { ...mole, up: false, hit: true };

      // Score
      setScore(s => { const n = s + points; scoreRef.current = n; return n; });

      // Hit flash
      setHitFlash(f => [...f, idx]);
      setTimeout(() => setHitFlash(f => f.filter(i => i !== idx)), 350);

      // Score popup
      const popId = popIdRef.current++;
      setScorePops(p => [...p, { id: popId, idx, points }]);
      setTimeout(() => setScorePops(p => p.filter(sp => sp.id !== popId)), 600);

      // Haptic
      if (navigator.vibrate) navigator.vibrate(15);

      // Remove mole after bonk animation
      setTimeout(() => {
        setMoles(p => { const n = [...p]; if (n[idx]?.hit) n[idx] = null; return n; });
      }, 300);

      return next;
    });
  }

  // ─── End Game ───
  function endGame() {
    gameRunning.current = false;
    if (gameTimerRef.current) clearInterval(gameTimerRef.current);
    if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
    setMoles(Array(9).fill(null));
    if (navigator.vibrate) navigator.vibrate([50, 30, 80]);

    // Pick prize — everyone wins!
    const prize = pickPrize(prizes, playCount, decayTable);
    setCurrentPrize(prize);
    setReelPrize(prize);

    // Transition to reel
    setTimeout(() => {
      setScreen('reel');
      startReel(prize);
    }, 1500);
  }

  // ─── Prize Reel ───
  function startReel(prize: Prize) {
    setReelLanded(false);
    setReelStatus('Mixing your prizes...');

    // Build reel items from prizes
    const reelItems = [...prizes.map(p => p.label)];
    const winnerLabel = prize.label;

    // We'll animate by manipulating the strip ref directly
    setTimeout(() => {
      const strip = reelStripRef.current;
      if (!strip) return;

      const cellH = 100;
      const cycles = 4;
      const totalCells = reelItems.length * cycles + 1;

      // Build cells
      strip.innerHTML = '';
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';

      for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.style.cssText = `height:${cellH}px;display:flex;align-items:center;justify-content:center;font-family:'Sigmar',cursive;font-size:clamp(16px,4.5vw,24px);color:#fff;text-shadow:0 2px 12px rgba(0,0,0,0.6);padding:0 20px;text-align:center;line-height:1.2;word-wrap:break-word;overflow-wrap:break-word;`;
        if (i === totalCells - 1) {
          cell.textContent = winnerLabel;
          cell.dataset.winner = 'true';
        } else {
          cell.textContent = reelItems[i % reelItems.length];
        }
        strip.appendChild(cell);
      }

      // Trigger spin
      requestAnimationFrame(() => {
        const targetY = -(totalCells - 1) * cellH;
        const duration = 3500;
        strip.style.transition = `transform ${duration}ms cubic-bezier(0.15, 0.6, 0.25, 1)`;
        strip.style.transform = `translateY(${targetY}px)`;

        // Vibration during spin
        let vibCount = 0;
        const vibInterval = setInterval(() => {
          if (navigator.vibrate) navigator.vibrate(4);
          if (++vibCount > 30) clearInterval(vibInterval);
        }, 100);

        setTimeout(() => setReelStatus('Slowing down...'), duration * 0.5);

        setTimeout(() => {
          clearInterval(vibInterval);
          setReelLanded(true);
          setReelStatus('');

          // Highlight winner
          const winnerCell = strip.querySelector('[data-winner]') as HTMLElement;
          if (winnerCell) {
            winnerCell.style.color = B.gold;
            winnerCell.style.textShadow = `0 0 30px ${B.goldGlow}`;
          }

          if (navigator.vibrate) navigator.vibrate([50, 30, 80]);

          if (prize) {
            setShowConfetti(true);
          }

          // Record to Supabase
          recordPlay(!!prize, prize).then(code => {
            if (code) setClaimCode(code);
          });

          // Go to reveal
          setTimeout(() => setScreen('reveal'), 1500);
        }, duration + 100);
      });
    }, 200);
  }

  // ─── Check contact & claim prize (after game) ───
  async function checkAndClaim() {
    setContactError('');
    const val = contactValue.trim();

    if (contactMode === 'phone') {
      if (val.replace(/\D/g, '').length < 8) {
        setContactError('Please enter a valid phone number');
        return;
      }
    } else {
      if (!val || !val.includes('@') || !val.includes('.')) {
        setContactError('Please enter a valid email');
        return;
      }
    }

    setCheckingContact(true);

    // Check if this contact already has a claim from the game
    const existing = await sbFetch('promo_claims', {
      query: `?contact_value=eq.${encodeURIComponent(val)}&source_code=eq.SCAN_TAP_WIN&select=*&order=issued_at.desc&limit=1`
    });

    if (existing && existing.length > 0) {
      // They already played before — show their existing claim instead
      setExistingClaim(existing[0]);
      setCheckingContact(false);
      return; // Stay on reveal screen, shows "You already have a prize" message
    }

    // No duplicate — create the claim now with contact info included
    if (claimCode && currentPrize) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14);
      await sbFetch('promo_claims', {
        method: 'POST',
        body: {
          claim_code: claimCode,
          source_code: 'SCAN_TAP_WIN',
          contact_type: contactMode,
          contact_value: val,
          marketing_opt_in: marketingOptIn,
          club_opt_in: marketingOptIn,
          prize_type: currentPrize.prize_type === 'discount' ? 'discount' : 'freebie',
          prize_label: currentPrize.label,
          prize_item_ref: currentPrize.prize_id,
          discount_percent: currentPrize.discount_pct || null,
          max_discount_vnd: currentPrize.max_discount || null,
          status: 'active',
          expires_at: expiresAt.toISOString(),
        },
      });
    }

    setCheckingContact(false);
    setScreen('claim');
  }

  // ─── Reset ───
  function resetGame() {
    setScreen('landing');
    setCurrentPrize(null);
    setClaimCode(null);
    setShowConfetti(false);
    setContactValue('');
    setContactError('');
    setMarketingOptIn(false);
    setReelLanded(false);
    setPlayCount(p => p + 1);
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: B.bg, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", border: `3px solid ${B.tealBright}`, borderTopColor: "transparent", margin: "0 auto 20px", animation: "spin 0.8s linear infinite" }} />
          <div style={{ ...F.body, color: B.creamMuted }}>Loading...</div>
        </div>
        <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  const timerPct = (timeLeft / GAME_DURATION) * 100;
  const isWarning = timeLeft <= 5;

  return (
    <div style={{
      position: "relative", width: "100%", height: "100vh", overflow: "hidden",
      fontFamily: "'DM Sans', sans-serif",
      userSelect: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent",
    }}>
      <JungleBG />
      <Confetti active={showConfetti} />

      {/* ═══ LANDING ═══ */}
      <Screen active={screen === 'landing'}>
        <img src="https://bigbamboo.app/images/bbb-img-5.png" alt="BigBamBoo"
          style={{ width: "70vw", maxWidth: 300, marginBottom: 20,
            filter: "drop-shadow(0 8px 30px rgba(0,0,0,0.4))", borderRadius: 28 }} />
        <div style={{ ...F.display, fontSize: "clamp(32px,8vw,48px)", color: B.gold,
          textAlign: "center", lineHeight: 1.05, marginBottom: 8,
          textShadow: `0 4px 24px ${B.goldGlow}, 0 2px 40px rgba(0,0,0,0.5)` }}>
          Scan. Tap. Win.
        </div>
        <div style={{ ...F.body, fontSize: "clamp(13px,3.2vw,16px)", color: "rgba(255,255,255,0.55)",
          textAlign: "center", lineHeight: 1.5, maxWidth: 320, marginBottom: 32 }}>
          Whack the drinks. Spin the reel. Every player wins something.
        </div>
        <button onClick={beginGame} style={{
          ...S.btnPrimary, borderRadius: 20, padding: "20px 44px",
          fontSize: "clamp(16px,4vw,20px)", animation: "ctaPulse 2s ease-in-out infinite",
        }}>
          Tap to play
        </button>
        <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", lineHeight: 1.5 }}>
          By playing you confirm you are 18+ and agree to the{' '}
          <span onClick={() => setShowRules(true)} style={{ textDecoration: "underline", cursor: "pointer", color: "rgba(255,255,255,0.45)" }}>
            rules &amp; terms
          </span>
        </div>
        <div style={{ position: "absolute", bottom: 16, fontSize: 9, color: "rgba(255,255,255,0.15)",
          letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}>
          An Phu &middot; Saigon
        </div>
      </Screen>

      {/* ═══ COUNTDOWN ═══ */}
      <Screen active={screen === 'countdown'}>
        <div style={{ ...F.display, fontSize: "clamp(80px,25vw,140px)", color: B.gold,
          textShadow: `0 4px 40px ${B.goldGlow}, 0 8px 60px rgba(0,0,0,0.5)`,
          animation: "countIn 0.6s cubic-bezier(0.34,1.56,0.64,1)",
        }} key={countdownNum}>
          {countdownNum > 0 ? countdownNum : 'GO!'}
        </div>
      </Screen>

      {/* ═══ WHACK-A-MOLE GAME ═══ */}
      <Screen active={screen === 'playing'}>
        {/* HUD */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          width: "100%", maxWidth: 360, marginBottom: 12, padding: "0 4px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ ...F.label, fontSize: 9, color: "rgba(255,255,255,0.3)" }}>SCORE</div>
            <div style={{ ...F.display, fontSize: "clamp(22px,5vw,28px)", color: B.gold,
              textShadow: `0 2px 12px ${B.goldGlow}` }}>{score}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ ...F.label, fontSize: 9, color: "rgba(255,255,255,0.3)" }}>TIME</div>
            <div style={{ ...F.display, fontSize: "clamp(22px,5vw,28px)",
              color: isWarning ? "#f08060" : B.tealBright,
              textShadow: isWarning ? "0 2px 12px rgba(240,80,80,0.3)" : `0 2px 12px ${B.tealGlow}`,
              animation: isWarning ? "timerPulse 0.5s ease-in-out infinite" : "none",
            }}>{Math.ceil(timeLeft)}</div>
          </div>
        </div>

        {/* Timer bar */}
        <div style={{ width: "100%", maxWidth: 360, height: 4, borderRadius: 2,
          background: "rgba(255,255,255,0.06)", marginBottom: 14, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 2, width: `${timerPct}%`,
            background: isWarning
              ? "linear-gradient(90deg, #f08060, #e84430)"
              : `linear-gradient(90deg, ${B.tealBright}, ${B.teal})`,
            transition: "width 0.3s linear",
          }} />
        </div>

        {/* Mole Grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: "clamp(10px,2.5vw,16px)", width: "100%", maxWidth: 360, aspectRatio: "1/1",
        }}>
          {moles.map((mole, idx) => (
            <div key={idx} onClick={() => whackMole(idx)} style={{
              position: "relative", borderRadius: "50%", overflow: "hidden", aspectRatio: "1/1",
              cursor: "pointer", WebkitTapHighlightColor: "transparent",
              background: "radial-gradient(ellipse at 50% 70%, rgba(14,40,32,0.7), rgba(8,24,18,0.9))",
              border: "2px solid rgba(255,255,255,0.06)",
              boxShadow: hitFlash.includes(idx)
                ? `inset 0 4px 12px rgba(240,160,50,0.25), 0 0 40px 10px rgba(240,160,50,0.15)`
                : "inset 0 8px 20px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)",
              transition: "box-shadow 0.15s",
            }}>
              {/* Hole shadow at bottom */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "35%",
                background: "linear-gradient(0deg, rgba(14,40,32,0.95), transparent)",
                borderRadius: "0 0 50% 50%", pointerEvents: "none", zIndex: 3 }} />

              {/* Mole item */}
              {mole && (
                <div style={{
                  position: "absolute", inset: "10%", zIndex: 2,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: mole.type.color,
                  transform: mole.up
                    ? "translateY(0) scale(1)"
                    : mole.hit
                      ? "translateY(10%) scale(0.85) rotate(15deg)"
                      : "translateY(100%) scale(0.6)",
                  opacity: mole.up ? 1 : mole.hit ? 0.5 : 0,
                  transition: mole.hit
                    ? "transform 0.1s, opacity 0.1s"
                    : "transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.15s",
                  pointerEvents: "none",
                }}>
                  <div style={{ width: "80%", height: "80%",
                    filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.3))" }}
                    dangerouslySetInnerHTML={{ __html: mole.type.svg }} />
                </div>
              )}

              {/* Score popups */}
              {scorePops.filter(p => p.idx === idx).map(pop => (
                <div key={pop.id} style={{
                  position: "absolute", top: "20%", left: "50%", zIndex: 10,
                  transform: "translateX(-50%)", ...F.display, fontSize: 24, color: B.gold,
                  textShadow: `0 2px 10px ${B.goldGlow}`,
                  animation: "scorePop 0.6s ease-out forwards", pointerEvents: "none",
                }}>
                  +{pop.points}
                </div>
              ))}
            </div>
          ))}
        </div>
      </Screen>

      {/* ═══ SLOT MACHINE REEL ═══ */}
      <Screen active={screen === 'reel'}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: 20 }}>
          <div style={{ ...F.display, fontSize: "clamp(18px,5vw,24px)", color: B.cream,
            marginBottom: 8, textAlign: "center" }}>
            Your Score: <span style={{ color: B.gold }}>{score}</span>
          </div>

          {/* Slot window */}
          <div style={{
            width: "85vw", maxWidth: 360, height: 100, borderRadius: 20, overflow: "hidden",
            position: "relative", border: `2px solid rgba(240,160,50,0.25)`,
            boxShadow: `0 16px 60px rgba(0,0,0,0.5), 0 0 40px rgba(240,160,50,0.06), inset 0 2px 20px rgba(0,0,0,0.4)`,
            background: `linear-gradient(170deg, rgba(26,74,58,0.6), rgba(14,40,32,0.9))`,
          }}>
            {/* Top/bottom fade */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 28, zIndex: 3,
              background: "linear-gradient(to bottom, rgba(14,40,32,0.95), transparent)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 28, zIndex: 3,
              background: "linear-gradient(to top, rgba(14,40,32,0.95), transparent)", pointerEvents: "none" }} />

            {/* Pointers */}
            <div style={{ position: "absolute", right: -2, top: "50%", transform: "translateY(-50%)",
              width: 0, height: 0, borderTop: "10px solid transparent", borderBottom: "10px solid transparent",
              borderRight: `12px solid ${B.gold}`, zIndex: 4,
              filter: `drop-shadow(-2px 0 4px ${B.goldGlow})` }} />
            <div style={{ position: "absolute", left: -2, top: "50%", transform: "translateY(-50%)",
              width: 0, height: 0, borderTop: "10px solid transparent", borderBottom: "10px solid transparent",
              borderLeft: `12px solid ${B.gold}`, zIndex: 4,
              filter: `drop-shadow(2px 0 4px ${B.goldGlow})` }} />

            {/* Strip */}
            <div ref={reelStripRef} style={{ position: "absolute", left: 0, right: 0 }} />
          </div>

          <div style={{ ...F.body, fontSize: 16, fontWeight: 600, color: B.gold,
            textAlign: "center", minHeight: 28 }}>
            {reelStatus}
          </div>
        </div>
      </Screen>

      {/* ═══ PRIZE REVEAL + CONTACT GATE ═══ */}
      <Screen active={screen === 'reveal'} scrollable>
        <div style={{ textAlign: "center", width: "100%", maxWidth: 380 }}>
          {currentPrize ? (
            <>
              {/* Prize hero */}
              <div style={{
                padding: "28px 20px", marginBottom: 20, borderRadius: 20,
                background: `linear-gradient(170deg, rgba(240,160,50,0.12), rgba(26,74,58,0.3))`,
                border: `1px solid rgba(240,160,50,0.2)`,
                boxShadow: `0 16px 50px rgba(0,0,0,0.3), 0 0 60px rgba(240,160,50,0.06)`,
                animation: "prizeGlow 2s ease-in-out infinite alternate",
              }}>
                <div style={{ ...F.display, fontSize: "clamp(24px,7vw,36px)", color: B.gold,
                  marginBottom: 6, lineHeight: 1.1,
                  textShadow: `0 4px 24px ${B.goldGlow}` }}>
                  {currentPrize.label}
                </div>
              </div>

              {/* Claim code */}
              {claimCode && (
                <div style={{
                  background: `${B.gold}12`, border: `1px dashed ${B.gold}40`,
                  borderRadius: 14, padding: "12px 20px", marginBottom: 16,
                }}>
                  <div style={{ ...F.label, fontSize: 9, color: B.creamMuted, marginBottom: 6 }}>YOUR CLAIM CODE</div>
                  <div style={{ ...F.mono, fontSize: 26, color: B.gold, fontWeight: 700, letterSpacing: "0.1em" }}>{claimCode}</div>
                </div>
              )}

              {/* Contact gate — required to claim */}
              {existingClaim ? (
                <div style={{
                  background: "rgba(74,170,144,0.08)", border: "1px solid rgba(74,170,144,0.2)",
                  borderRadius: 16, padding: 20, marginBottom: 16,
                }}>
                  <div style={{ ...F.body, fontSize: 14, fontWeight: 600, color: B.tealBright, marginBottom: 6 }}>
                    You already have a prize!
                  </div>
                  <div style={{ ...F.body, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                    Your existing prize: {existingClaim.prize_label}
                  </div>
                  <div style={{ ...F.mono, fontSize: 18, color: B.gold, fontWeight: 700, marginTop: 8 }}>
                    {existingClaim.claim_code}
                  </div>
                </div>
              ) : (
                <div style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 20, padding: 20, textAlign: "left",
                }}>
                  <div style={{ ...F.body, fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
                    {contactMode === 'phone' ? 'Enter your phone to claim your prize' : 'Enter your email to claim your prize'}
                  </div>
                  <input
                    type={contactMode === 'phone' ? 'tel' : 'email'}
                    inputMode={contactMode === 'phone' ? 'tel' : 'email'}
                    placeholder={contactMode === 'phone' ? '+84 xxx xxx xxxx' : 'you@example.com'}
                    value={contactValue}
                    onChange={e => { setContactValue(e.target.value); setContactError(''); }}
                    style={{
                      width: "100%", padding: 16, borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.06)",
                      color: "#fff", fontSize: 16, fontFamily: "'DM Sans', sans-serif",
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                  <button onClick={() => { setContactMode(m => m === 'phone' ? 'email' : 'phone'); setContactValue(''); setContactError(''); }}
                    style={{ fontSize: 12, color: `${B.gold}aa`, cursor: "pointer", marginTop: 8,
                      display: "inline-block", border: "none", background: "none",
                      fontFamily: "'DM Sans', sans-serif", textDecoration: "underline",
                      textUnderlineOffset: 2 }}>
                    {contactMode === 'phone' ? 'Use email instead' : 'Use phone instead'}
                  </button>

                  {contactError && (
                    <div style={{ fontSize: 12, color: "#f08060", marginTop: 8 }}>{contactError}</div>
                  )}

                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 14 }}>
                    <input type="checkbox" checked={marketingOptIn}
                      onChange={e => setMarketingOptIn(e.target.checked)}
                      style={{ width: 18, height: 18, marginTop: 1, accentColor: B.gold, flexShrink: 0, cursor: "pointer" }} />
                    <label style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.4, cursor: "pointer" }}
                      onClick={() => setMarketingOptIn(v => !v)}>
                      Send me deals, events & happy hour alerts from BigBamBoo
                    </label>
                  </div>

                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 10, lineHeight: 1.5 }}>
                    Your info is only used to verify your prize.{' '}
                    <span onClick={() => setShowRules(true)} style={{ textDecoration: "underline", cursor: "pointer" }}>
                      See rules &amp; terms
                    </span>
                  </div>

                  <button onClick={checkAndClaim} disabled={checkingContact}
                    style={{
                      width: "100%", marginTop: 16, padding: 17, borderRadius: 16, border: "none",
                      background: `linear-gradient(135deg, ${B.orange}, ${B.orangeDeep})`,
                      color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                      boxShadow: "0 6px 24px rgba(232,120,48,0.35)",
                      opacity: checkingContact ? 0.5 : 1,
                    }}>
                    {checkingContact ? 'Checking...' : 'Get My Prize'}
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      </Screen>

      {/* ═══ CLAIM SCREEN ═══ */}
      <Screen active={screen === 'claim'} scrollable>
        {currentPrize && claimCode && (
          <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
            {/* Live indicator */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
              textTransform: "uppercase", color: B.tealBright, marginBottom: 14,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%", background: B.tealBright,
                animation: "livePulse 1.5s ease-in-out infinite",
              }} />
              ACTIVE
            </div>

            {/* Badge */}
            <div style={{
              display: "inline-block", padding: "6px 20px", borderRadius: 100,
              background: "rgba(74,170,144,0.15)", color: B.tealBright,
              border: "1px solid rgba(74,170,144,0.2)",
              ...F.label, fontSize: 11, marginBottom: 12,
            }}>
              WINNER
            </div>

            {/* Prize name */}
            <div style={{ ...F.display, fontSize: "clamp(24px,6vw,34px)", color: "#fff",
              marginBottom: 6, lineHeight: 1.1 }}>
              {currentPrize.label}
            </div>

            {/* QR box */}
            <div style={{
              background: `linear-gradient(170deg, rgba(26,74,58,0.85), rgba(14,40,32,0.92))`,
              border: "1px solid rgba(240,160,50,0.12)", borderRadius: 24, padding: 24,
              marginTop: 20, marginBottom: 16,
              boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            }}>
              {/* QR Code via API */}
              <div style={{
                background: "rgba(255,255,255,0.95)", borderRadius: 14, padding: 12,
                display: "inline-block", marginBottom: 12,
                boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
              }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                    JSON.stringify({ code: claimCode, prize: currentPrize.prize_id, name: currentPrize.label })
                  )}&color=1a4a3a`}
                  alt="QR Code" width={160} height={160}
                  style={{ display: "block", borderRadius: 4 }}
                />
              </div>

              {/* Claim code */}
              <div style={{ ...F.mono, fontSize: 22, color: B.gold,
                letterSpacing: "0.1em", fontWeight: 700, marginBottom: 6 }}>
                {claimCode}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.4 }}>
                Show this screen to your server to redeem
              </div>
            </div>

            {/* Details */}
            <div style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16, padding: 16, textAlign: "left", marginBottom: 16,
            }}>
              {[
                ['Status', 'Active'],
                ['Issued', new Date().toLocaleDateString()],
                ['Expires', new Date(Date.now() + 14 * 86400000).toLocaleDateString()],
                ['Location', 'BigBamBoo, An Phu'],
              ].map(([label, value], i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", padding: "8px 0",
                  borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)",
                    textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Tip */}
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)",
              fontWeight: 500, letterSpacing: "0.02em", marginBottom: 16 }}>
              Take a screenshot to save your prize
            </div>

            {/* 18+ warning */}
            <div style={{
              fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.5,
              marginBottom: 40, padding: "0 12px",
            }}>
              Must be 18 or older to redeem. One prize per person. Subject to{' '}
              <span onClick={() => setShowRules(true)} style={{ textDecoration: "underline", cursor: "pointer", color: "rgba(255,255,255,0.45)" }}>
                rules &amp; terms
              </span>.
            </div>
          </div>
        )}

      </Screen>

      {/* ═══ RULES & TERMS POPUP ═══ */}
      {showRules && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }} onClick={() => setShowRules(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#1a3a38", borderRadius: 20, padding: "28px 24px",
            maxWidth: 400, width: "100%", maxHeight: "80vh", overflowY: "auto",
            border: "1px solid rgba(245,238,216,0.1)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: B.gold,
              letterSpacing: "0.04em", marginBottom: 16 }}>
              Rules &amp; Terms
            </div>
            <div style={{ fontSize: 13, color: "rgba(245,238,216,0.7)", lineHeight: 1.7 }}>
              <p style={{ margin: "0 0 12px", fontWeight: 700, color: "#f08060" }}>
                You must be 18 years or older to play.
              </p>
              <p style={{ margin: "0 0 10px" }}>1. One prize per person. Duplicate entries will show your existing prize.</p>
              <p style={{ margin: "0 0 10px" }}>2. Prizes must be redeemed in-store at BigBamBoo An Phu, Saigon.</p>
              <p style={{ margin: "0 0 10px" }}>3. Prizes are non-transferable and have no cash value.</p>
              <p style={{ margin: "0 0 10px" }}>4. Show your QR code or screenshot to staff at the bar to redeem.</p>
              <p style={{ margin: "0 0 10px" }}>5. Management reserves the right to refuse or withdraw any prize at their discretion.</p>
              <p style={{ margin: "0 0 10px" }}>6. Your phone number or email is collected solely to verify your prize claim. If you opt in to marketing, we may send you promotions and event updates from BigBamBoo.</p>
              <p style={{ margin: "0 0 0" }}>7. BigBamBoo reserves the right to modify or end this promotion at any time.</p>
            </div>
            <button onClick={() => setShowRules(false)} style={{
              width: "100%", marginTop: 20, padding: 14, borderRadius: 14, border: "none",
              background: `linear-gradient(135deg, ${B.teal}, ${B.tealBright})`,
              color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}>
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ═══ GLOBAL STYLES ═══ */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sigmar&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300&family=DM+Mono:wght@400;500&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; overflow: hidden; }
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @keyframes ctaPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
        @keyframes countIn { 0%{transform:scale(2);opacity:0} 60%{transform:scale(0.95);opacity:1} 100%{transform:scale(1)} }
        @keyframes timerPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
        @keyframes scorePop { 0%{opacity:1;transform:translateX(-50%) translateY(0) scale(1)} 100%{opacity:0;transform:translateX(-50%) translateY(-40px) scale(1.3)} }
        @keyframes prizeGlow { 0%{box-shadow:0 16px 50px rgba(0,0,0,0.3),0 0 40px rgba(240,160,50,0.04)} 100%{box-shadow:0 16px 50px rgba(0,0,0,0.3),0 0 80px rgba(240,160,50,0.1)} }
        @keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.8)} }
        @keyframes prizePop { 0%{transform:scale(0) rotate(-10deg)} 60%{transform:scale(1.2) rotate(3deg)} 100%{transform:scale(1) rotate(0)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
