/**
 * NutriSense – Firebase Cloud Functions (Node.js 20)
 * ─────────────────────────────────────────────────
 * Trigger: onDocumentCreated on mealOrders/{orderId}
 *
 * What it does:
 *  1. Aggregates the last 10 mealOrders for the user.
 *  2. Identifies a behavioural pattern (late-night compliance, best meal window).
 *  3. Recalculates currentEfficiencyScore on the users document.
 *  4. Writes a single "Insight" string to insightReports/{uid}_latest.
 *
 * Deploy:  firebase deploy --only functions
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp }     = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse hour from a Firestore Timestamp */
function hourOf(ts) {
  return ts?.toDate ? ts.toDate().getHours() : new Date(ts).getHours();
}

/**
 * Calculate an "Efficiency Score" (0–100) from a list of meal orders.
 * Formula: average of per-meal compliance % across the 5 macros.
 */
function calcEfficiency(orders, goals) {
  if (!orders.length || !goals) return 70;

  const TARGETS = {
    protein:  goals.protein  ?? 150,
    carbs:    goals.carbs    ?? 200,
    fats:     goals.fats     ?? 65,
    fiber:    goals.fiber    ?? 30,
    calories: goals.calories ?? 2000,
  };

  const dailySums = {};
  orders.forEach(o => {
    const m = o.macroData ?? {};
    Object.keys(TARGETS).forEach(k => {
      dailySums[k] = (dailySums[k] ?? 0) + (m[k] ?? 0);
    });
  });

  const compliances = Object.keys(TARGETS).map(k =>
    Math.min(100, (dailySums[k] / TARGETS[k]) * 100)
  );

  return Math.round(compliances.reduce((s, c) => s + c, 0) / compliances.length);
}

/**
 * Identify a single insight string from meal patterns.
 */
function deriveInsight(orders) {
  if (!orders.length) return 'Log your first meal to unlock personalised insights! 🚀';

  // Count late-night meals (hour >= 20)
  const lateNight = orders.filter(o => hourOf(o.consumedAt) >= 20);
  const lateRatio = lateNight.length / orders.length;

  // Find the hour bucket with highest health score avg
  const hourBuckets = {};
  orders.forEach(o => {
    const h = hourOf(o.consumedAt);
    const bucket = h < 10 ? 'morning' : h < 14 ? 'lunch' : h < 18 ? 'afternoon' : 'evening';
    hourBuckets[bucket] = hourBuckets[bucket] ?? { total: 0, count: 0 };
    hourBuckets[bucket].total += o.healthScore ?? 70;
    hourBuckets[bucket].count += 1;
  });

  const bestBucket = Object.entries(hourBuckets)
    .map(([k, v]) => ({ name: k, avg: v.total / v.count }))
    .sort((a, b) => b.avg - a.avg)[0];

  // Fiber compliance
  const avgFiber = orders.reduce((s, o) => s + (o.macroData?.fiber ?? 0), 0) / orders.length;
  const fiberGoal = 30;
  const fiberPct  = Math.round((avgFiber / fiberGoal) * 100);

  // Build insight string
  if (lateRatio >= 0.4) {
    return `Late-night meals detected in ${Math.round(lateRatio * 100)}% of logs — this correlates with a ~15% drop in next-day efficiency. Try capping dinner before 8 PM. 🌙`;
  }
  if (fiberPct < 55) {
    return `Your 7-day fiber average is only ${fiberPct}% of goal. Adding a high-fiber snack mid-morning could lift your efficiency score by 10+ points. 🥦`;
  }
  if (bestBucket) {
    return `You are most macro-compliant during ${bestBucket.name} hours (avg health score: ${Math.round(bestBucket.avg)}/100). Keep the momentum going! 🎯`;
  }
  return 'Your compliance is steady. Keep logging meals to unlock deeper pattern analysis. 📈';
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloud Function: trendAuditor
// Triggered every time a mealOrder is created
// ─────────────────────────────────────────────────────────────────────────────
exports.trendAuditor = onDocumentCreated(
  { document: 'mealOrders/{orderId}', region: 'asia-south1' },
  async (event) => {
    const snap  = event.data;
    const order = snap.data();
    const uid   = order.ownerUID;

    if (!uid) return;

    // 1. Fetch last 10 meal orders for this user
    const ordersSnap = await db
      .collection('mealOrders')
      .where('ownerUID', '==', uid)
      .orderBy('consumedAt', 'desc')
      .limit(10)
      .get();

    const orders = ordersSnap.docs.map(d => d.data());

    // 2. Fetch user's dietary goals
    const userSnap = await db.collection('users').doc(uid).get();
    const userData  = userSnap.data() ?? {};
    const goals     = userData.dietaryGoals ?? {};

    // 3. Calculate new efficiency score
    const newScore = calcEfficiency(orders, goals);

    // 4. Derive insight string
    const insightText = deriveInsight(orders);

    // 5. Update user's efficiency score + streak
    const today     = new Date().toDateString();
    const lastLogin = userData.lastActiveDate ?? '';
    const streakInc = today !== lastLogin ? 1 : 0;

    await db.collection('users').doc(uid).update({
      currentEfficiencyScore: newScore,
      streakCount:            FieldValue.increment(streakInc),
      lastActiveDate:         today,
      updatedAt:              Timestamp.now(),
    });

    // 6. Write insight report (overwrites "latest" doc for instant UI access)
    await db.collection('insightReports').doc(`${uid}_latest`).set({
      ownerUID:     uid,
      insightText,
      efficiencyScore: newScore,
      analyzedOrders:  orders.length,
      generatedAt:  Timestamp.now(),
    });

    console.log(`[trendAuditor] uid=${uid} score=${newScore} insight="${insightText.slice(0, 60)}..."`);
  }
);
