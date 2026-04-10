/**
 * ═══════════════════════════════════════════════════════════════
 * NutriSense — Health Monitor API Route
 * POST /api/health-monitor
 *
 * "Order Tracking" style meal lifecycle tracker.
 * Treats each meal goal like a Swiggy delivery with 3 stages:
 *   1. PLANNED   — Pre-meal planning / goal set
 *   2. DIGESTING — Eating window / active absorption phase
 *   3. ABSORBED  — Nutrients fully processed, Efficiency Score updated
 *
 * Real-time progress bar & next-fuel countdown are computed
 * server-side and returned as a percentage (0-100) so the
 * front-end can render them without additional math.
 * ═══════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

// ── Types ─────────────────────────────────────────────────────
type MealStage = 'planned' | 'digesting' | 'absorbed';

interface StageInfo {
  stage:        MealStage;
  label:        string;         // Display label for UI
  emoji:        string;         // Icon hint for front-end
  description:  string;        // Tooltip / status line
}

interface HealthMonitorResponse {
  user_id:              string;
  current_stage:        StageInfo;
  progress_pct:         number;           // 0-100, drives the Swiggy-style bar
  next_fuel_minutes:    number | null;    // Minutes until next optimal eating window
  next_fuel_label:      string;           // e.g. "1h 42m"
  efficiency_score:     number;           // 0-100, updated on ABSORBED
  efficiency_delta:     number | null;    // Change vs. yesterday (e.g. +4, -3)
  today_compliance_pct: number;
  last_meal: {
    food_name:  string;
    logged_at:  string;
    minutes_ago: number;
  } | null;
  theme_accent: string;        // CSS variable value — neon-cyan or amber
}

// ── Constants ─────────────────────────────────────────────────
/** Minutes after a meal before entering the ABSORBED stage */
const DIGESTION_MINUTES = 90;

/** Minutes between meals = optimal fueling interval */
const FUELING_INTERVAL_MINUTES = 180;

/** Eating cutoff hour (24h) — after this, no new fueling windows today */
const EATING_CUTOFF_HOUR = 21;

// ── Helpers ───────────────────────────────────────────────────
function minutesSince(isoTimestamp: string): number {
  return (Date.now() - new Date(isoTimestamp).getTime()) / 60_000;
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return 'Now';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function deriveStage(minsSinceLast: number, lastMeal: boolean): MealStage {
  if (!lastMeal) return 'planned';
  if (minsSinceLast < DIGESTION_MINUTES) return 'digesting';
  return 'absorbed';
}

function stageInfo(stage: MealStage): StageInfo {
  const map: Record<MealStage, StageInfo> = {
    planned: {
      stage:       'planned',
      label:       'Preparing',
      emoji:       '📋',
      description: 'Your meal plan is ready. Time to fuel up!',
    },
    digesting: {
      stage:       'digesting',
      label:       'On the Way',
      emoji:       '⚡',
      description: 'Nutrients are being absorbed. Stay hydrated!',
    },
    absorbed: {
      stage:       'absorbed',
      label:       'Delivered',
      emoji:       '✅',
      description: 'Nutrients absorbed. Efficiency Score updated.',
    },
  };
  return map[stage];
}

/**
 * Calculates the 0-100 progress bar value.
 * PLANNED    → 0-33  (based on how close to eating time)
 * DIGESTING  → 33-66 (linearly over DIGESTION_MINUTES)
 * ABSORBED   → 66-100 (linearly over the rest of FUELING_INTERVAL)
 */
function calcProgress(stage: MealStage, minsSinceLast: number): number {
  if (stage === 'planned') return 10;
  if (stage === 'digesting') {
    const pct = Math.min(minsSinceLast / DIGESTION_MINUTES, 1);
    return Math.round(33 + pct * 33);
  }
  // absorbed
  const extra = minsSinceLast - DIGESTION_MINUTES;
  const remaining = FUELING_INTERVAL_MINUTES - DIGESTION_MINUTES;
  const pct = Math.min(extra / remaining, 1);
  return Math.round(66 + pct * 34);
}

/**
 * Computes next optimal fueling window in minutes.
 * Returns null if the eating cutoff has passed for the day.
 */
function calcNextFuelMinutes(
  stage: MealStage,
  minsSinceLast: number,
): number | null {
  const now = new Date();
  if (now.getHours() >= EATING_CUTOFF_HOUR) return null;

  if (stage === 'planned') return 0;  // fuel now

  const minutesRemaining = FUELING_INTERVAL_MINUTES - minsSinceLast;
  return minutesRemaining > 0 ? minutesRemaining : 0;
}

/**
 * Calculates an Efficiency Score from today's meals vs. goals.
 * Score formula: weighted average of macro attainment (capped at 100).
 * Weights: Protein 30%, Fiber 25%, Calories 25%, Carbs+Fats 20%
 */
function calcEfficiencyScore(
  totals: { calories: number; protein: number; fiber: number; carbs: number; fats: number },
  goals:  { calories_target: number; protein_g: number; fiber_g: number; carbs_g: number; fats_g: number },
): number {
  const proteinPct  = Math.min(totals.protein  / goals.protein_g,        1) * 30;
  const fiberPct    = Math.min(totals.fiber     / goals.fiber_g,          1) * 25;
  const calPct      = Math.min(totals.calories  / goals.calories_target,  1) * 25;
  const carbsFatPct = Math.min(
    ((totals.carbs / goals.carbs_g) + (totals.fats / goals.fats_g)) / 2, 1,
  ) * 20;

  return Math.round(proteinPct + fiberPct + calPct + carbsFatPct);
}

// ── Route Handler ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  const body = await req.json().catch(() => ({}));
  const { user_id } = body as { user_id?: string };

  if (!user_id) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
  }

  // ── 1. Fetch user goals ──────────────────────────────────────
  const { data: goals, error: goalsErr } = await supabase
    .from('goals')
    .select('calories_target, protein_g, fiber_g, carbs_g, fats_g')
    .eq('user_id', user_id)
    .single();

  if (goalsErr || !goals) {
    return NextResponse.json(
      { error: 'Goals not found. Please complete onboarding.' },
      { status: 404 },
    );
  }

  // ── 2. Fetch today's meals ───────────────────────────────────
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: todayMeals, error: mealsErr } = await supabase
    .from('meals')
    .select('food_name, logged_at, calories, protein_g, fiber_g, carbs_g, fats_g')
    .eq('user_id', user_id)
    .gte('logged_at', todayStart.toISOString())
    .order('logged_at', { ascending: false });

  if (mealsErr) {
    return NextResponse.json({ error: mealsErr.message }, { status: 500 });
  }

  // ── 3. Compute macro totals ──────────────────────────────────
  const totals = (todayMeals ?? []).reduce(
    (acc, m) => ({
      calories: acc.calories + (m.calories  ?? 0),
      protein:  acc.protein  + (m.protein_g ?? 0),
      fiber:    acc.fiber    + (m.fiber_g   ?? 0),
      carbs:    acc.carbs    + (m.carbs_g   ?? 0),
      fats:     acc.fats     + (m.fats_g    ?? 0),
    }),
    { calories: 0, protein: 0, fiber: 0, carbs: 0, fats: 0 },
  );

  // ── 4. Last meal metadata ────────────────────────────────────
  const lastMeal = todayMeals?.[0] ?? null;
  const minsSinceLast = lastMeal ? minutesSince(lastMeal.logged_at) : 9999;

  // ── 5. Determine stage ───────────────────────────────────────
  const stage      = deriveStage(minsSinceLast, !!lastMeal);
  const info       = stageInfo(stage);
  const progressPct = calcProgress(stage, minsSinceLast);

  // ── 6. Next fueling window ───────────────────────────────────
  const nextFuelMins  = calcNextFuelMinutes(stage, minsSinceLast);
  const nextFuelLabel = nextFuelMins === null ? 'Eating window closed'
                      : nextFuelMins === 0    ? 'Fuel Now'
                      : formatMinutes(nextFuelMins);

  // ── 7. Efficiency score (current) ────────────────────────────
  const efficiencyScore = calcEfficiencyScore(totals, goals);

  // ── 8. Yesterday's efficiency for delta ──────────────────────
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const yesterdayEnd   = new Date(todayStart.getTime() - 1);

  const { data: yesterdayMeals } = await supabase
    .from('meals')
    .select('calories, protein_g, fiber_g, carbs_g, fats_g')
    .eq('user_id', user_id)
    .gte('logged_at', yesterdayStart.toISOString())
    .lte('logged_at', yesterdayEnd.toISOString());

  let efficiencyDelta: number | null = null;
  if (yesterdayMeals && yesterdayMeals.length > 0) {
    const yTotals = yesterdayMeals.reduce(
      (acc, m) => ({
        calories: acc.calories + (m.calories  ?? 0),
        protein:  acc.protein  + (m.protein_g ?? 0),
        fiber:    acc.fiber    + (m.fiber_g   ?? 0),
        carbs:    acc.carbs    + (m.carbs_g   ?? 0),
        fats:     acc.fats     + (m.fats_g    ?? 0),
      }),
      { calories: 0, protein: 0, fiber: 0, carbs: 0, fats: 0 },
    );
    const yesterdayScore = calcEfficiencyScore(yTotals, goals);
    efficiencyDelta = efficiencyScore - yesterdayScore;
  }

  // ── 9. Compliance percentage ─────────────────────────────────
  const compliancePct = Math.round(
    Math.min(
      (totals.calories / goals.calories_target +
       totals.protein  / goals.protein_g       +
       totals.fiber    / goals.fiber_g         ) / 3,
      1,
    ) * 100,
  );

  // ── 10. Persist to Supabase if stage = absorbed ──────────────
  //    This triggers the Realtime listener on the front-end,
  //    which immediately patches the --neon-cyan CSS variable.
  if (stage === 'absorbed' && lastMeal) {
    await supabase
      .from('reports')
      .upsert(
        {
          user_id,
          period_start:       todayStart.toISOString().slice(0, 10),
          period_end:         todayStart.toISOString().slice(0, 10),
          avg_compliance_pct: compliancePct,
          theme_accent:       efficiencyScore >= 75 ? '#00F2FF' : '#F59E0B',
          correlations:       JSON.stringify({ efficiency_score: efficiencyScore }),
        },
        {
          onConflict: 'user_id,period_start',
          ignoreDuplicates: false,
        },
      );
  }

  // ── 11. Theme accent ─────────────────────────────────────────
  const themeAccent = efficiencyScore >= 75 ? '#00F2FF' : '#F59E0B';

  // ── 12. Build response ────────────────────────────────────────
  const response: HealthMonitorResponse = {
    user_id,
    current_stage:        info,
    progress_pct:         progressPct,
    next_fuel_minutes:    nextFuelMins,
    next_fuel_label:      nextFuelLabel,
    efficiency_score:     efficiencyScore,
    efficiency_delta:     efficiencyDelta,
    today_compliance_pct: compliancePct,
    last_meal: lastMeal
      ? {
          food_name:   lastMeal.food_name,
          logged_at:   lastMeal.logged_at,
          minutes_ago: Math.round(minsSinceLast),
        }
      : null,
    theme_accent: themeAccent,
  };

  return NextResponse.json(response);
}
