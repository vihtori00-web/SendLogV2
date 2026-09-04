// ============================================================================
// SendLog v2 - Intelligent Climbing Session Planner & Readiness Engine
// Grounded in climbing physiology, ACWR (Acute:Chronic Workload Ratio),
// Eric Hörst's 48-72h tendon remodeling, and Lattice / Climb Strong principles.
// ============================================================================

const Planner = (function () {
    // Grade definitions matching app.js
    const GRADES = [
        '<4', '4', '4+', '5', '5+', '6A', '6A+', '6B', '6B+',
        '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+',
        '8A', '8A+', '8B', '8B+', '8C', '8C+', '9A'
    ];

    // Style-specific neurological and connective tissue stress multipliers
    const STYLE_STRESS = {
        crimp: 1.45,      // Highest A2/A4 pulley and flexor tendon strain
        board: 1.40,      // System/Moon/Kilter board: extreme finger recruitment
        powerful: 1.25,   // High shoulder, elbow, and explosive tendon loading
        dyno: 1.20,       // Dynamic shock-loading on joints
        pinch: 1.15,      // Thenar and extrinsic flexor loading
        technical: 0.95,  // Precision, footwork-heavy
        sloper: 0.90,     // Wrist extensor and open hand (low pulley strain)
        slab: 0.80        // Footwork, core, very low tendon stress
    };

    // User calibration settings stored in localStorage
    function getCalibration() {
        try {
            const saved = localStorage.getItem('sendlog_v2_calibration');
            if (saved) return JSON.parse(saved);
        } catch (e) { }
        return {
            capacityScalar: 1.0, // Multiplier on work capacity (higher = recovers faster)
            fatigueSensitivity: 1.0,
            feedbackHistory: []
        };
    }

    function saveCalibration(calib) {
        try {
            localStorage.setItem('sendlog_v2_calibration', JSON.stringify(calib));
        } catch (e) { }
    }

    // Context check-in state (temporary in-memory, defaults to fresh/90m)
    let preSessionCheckin = {
        fingers: 'fresh', // 'fresh', 'stiff', 'tweaky'
        skin: 'good',     // 'good', 'thin', 'split'
        time: 90          // 45, 90, 120 (minutes)
    };

    // ------------------------------------------------------------------------
    // 1. TRAINING LOAD (TL) CALCULATION
    // ------------------------------------------------------------------------
    function calculateClimbLoad(climb, maxGradeIdx) {
        const gradeIdx = GRADES.indexOf(climb.gradeStr);
        const effectiveGrade = gradeIdx >= 0 ? gradeIdx : Math.max(0, maxGradeIdx - 4);
        const relIntensity = effectiveGrade - maxGradeIdx; // e.g. -2, -1, 0, +1

        // Exponential intensity factor: each grade jump increases strain significantly
        const intensityFactor = Math.pow(1.35, relIntensity);

        // Outcome factor
        let outcomeFactor = 0.9;
        if (climb.statusText === 'Flash') outcomeFactor = 1.1; // Peak power & execution
        else if (climb.statusText === 'Project') outcomeFactor = 0.85; // Multiple burns without send

        // Style multiplier based on logged tags
        let styleMult = 1.0;
        if (climb.tags && Array.isArray(climb.tags) && climb.tags.length > 0) {
            let tagSum = 0;
            climb.tags.forEach(t => {
                tagSum += (STYLE_STRESS[t] || 1.0);
            });
            styleMult = tagSum / climb.tags.length;
        }

        const tries = Math.max(1, parseInt(climb.tries) || 1);
        return tries * 10 * intensityFactor * outcomeFactor * styleMult;
    }

    function calculateSessionLoad(session, maxGradeIdx) {
        if (!session.climbs || session.climbs.length === 0) return 0;
        let totalLoad = 0;
        session.climbs.forEach(c => {
            totalLoad += calculateClimbLoad(c, maxGradeIdx);
        });

        // Duration multiplier: prolonged sessions induce more CNS fatigue
        const durationMin = Math.round((session.duration || 3600) / 60);
        const durationFactor = Math.min(1.5, Math.max(0.7, durationMin / 75));

        return Math.round(totalLoad * durationFactor);
    }

    // ------------------------------------------------------------------------
    // 2. ACWR & FATIGUE / FITNESS ENGINE
    // ------------------------------------------------------------------------
    function computeWorkloadMetrics(history, maxGradeIdx) {
        if (!history || history.length === 0) {
            return {
                acuteLoad: 0,
                chronicLoad: 0,
                acwr: 1.0,
                statusText: 'Fresh (No recent history)',
                statusColor: 'emerald',
                statusCategory: 'fresh'
            };
        }

        const now = Date.now();
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        const calib = getCalibration();

        // Calculate load for each session in history
        const sessionLoads = history.map(s => {
            const timestamp = s.timestamp || now;
            const daysAgo = Math.max(0, (now - timestamp) / MS_PER_DAY);
            const load = calculateSessionLoad(s, maxGradeIdx);
            return { timestamp, daysAgo, load, session: s };
        });

        // Exponential weights:
        // Acute: 7-day half-life decay
        // Chronic: 28-day half-life decay
        let acuteNumerator = 0, acuteDenominator = 0;
        let chronicNumerator = 0, chronicDenominator = 0;

        sessionLoads.forEach(item => {
            if (item.daysAgo <= 28) {
                // Acute weighting (7 days)
                if (item.daysAgo <= 7) {
                    const acuteWeight = Math.exp(-item.daysAgo / (4.5 / calib.capacityScalar));
                    acuteNumerator += item.load * acuteWeight;
                    acuteDenominator += acuteWeight;
                }
                // Chronic weighting (28 days)
                const chronicWeight = Math.exp(-item.daysAgo / 18);
                chronicNumerator += item.load * chronicWeight;
                chronicDenominator += chronicWeight;
            }
        });

        const acuteLoad = acuteDenominator > 0 ? (acuteNumerator / acuteDenominator) : 0;
        const chronicLoad = chronicDenominator > 0 ? (chronicNumerator / chronicDenominator) : 100;

        // ACWR calculation with smoothing baseline
        const effectiveChronic = Math.max(80, chronicLoad);
        const rawAcwr = effectiveChronic > 0 ? (acuteLoad / effectiveChronic) : 1.0;
        const acwr = Math.round(rawAcwr * 100) / 100;

        // Categorize ACWR according to sports science zones
        let statusCategory = 'sweet_spot';
        let statusText = 'Optimal Readiness (Sweet Spot)';
        let statusColor = 'emerald';

        if (acwr > 1.45) {
            statusCategory = 'high_risk';
            statusText = 'High Fatigue Spike (Injury Risk)';
            statusColor = 'red';
        } else if (acwr > 1.25) {
            statusCategory = 'elevated';
            statusText = 'Elevated Fatigue (Volume only)';
            statusColor = 'amber';
        } else if (acwr >= 0.8) {
            statusCategory = 'sweet_spot';
            statusText = 'Prime Condition (Ready to Project)';
            statusColor = 'emerald';
        } else {
            statusCategory = 'undertrained';
            statusText = 'Fresh / Deloaded (Build Fitness)';
            statusColor = 'blue';
        }

        return { acuteLoad: Math.round(acuteLoad), chronicLoad: Math.round(chronicLoad), acwr, statusText, statusColor, statusCategory };
    }

    // ------------------------------------------------------------------------
    // 3. TENDON & CONNECTIVE TISSUE REMODELING TRACKER (48-72h)
    // ------------------------------------------------------------------------
    function computeTendonRecovery(history, maxGradeIdx) {
        if (!history || history.length === 0) {
            return {
                recoveryPct: 100,
                hoursElapsed: 999,
                status: 'Fresh',
                color: 'emerald',
                heavyTags: [],
                advice: 'Connective tissues fully remodeled.'
            };
        }

        const now = Date.now();
        let lastHeavySessionTime = 0;
        let heavyTagsFound = new Set();

        for (let i = history.length - 1; i >= 0; i--) {
            const s = history[i];
            const climbs = s.climbs || [];
            let sessionCrimpLoad = 0;

            climbs.forEach(c => {
                const gIdx = GRADES.indexOf(c.gradeStr);
                const isNearMax = gIdx >= (maxGradeIdx - 2);
                const hasHighStrainTag = c.tags && c.tags.some(t => t === 'crimp' || t === 'board' || t === 'powerful');

                if (isNearMax && hasHighStrainTag) {
                    sessionCrimpLoad += (c.tries || 1);
                    (c.tags || []).forEach(t => {
                        if (t === 'crimp' || t === 'board' || t === 'powerful') heavyTagsFound.add(t);
                    });
                }
            });

            if (sessionCrimpLoad >= 3) {
                lastHeavySessionTime = s.timestamp || (now - 24 * 60 * 60 * 1000);
                break;
            }
        }

        if (!lastHeavySessionTime) {
            return {
                recoveryPct: 100,
                hoursElapsed: 999,
                status: '100% Ready',
                color: 'emerald',
                heavyTags: [],
                advice: 'No recent heavy crimp/board strain logged.'
            };
        }

        const hoursElapsed = Math.max(0, Math.floor((now - lastHeavySessionTime) / (1000 * 60 * 60)));
        const recoveryTargetHours = 48; // Baseline 48h collagen remodeling
        const recoveryPct = Math.min(100, Math.round((hoursElapsed / recoveryTargetHours) * 100));

        let status = '100% Ready';
        let color = 'emerald';
        let advice = 'Tendon collagen fully remodeled.';

        if (recoveryPct < 50) {
            status = `Rebuilding (${48 - hoursElapsed}h left)`;
            color = 'red';
            advice = 'High pulley/tendon strain. Avoid crimps and board sessions today.';
        } else if (recoveryPct < 100) {
            status = `Recovering (${48 - hoursElapsed}h left)`;
            color = 'amber';
            advice = 'Tendon remodeling underway. Sub-maximal climbing or open-hand recommended.';
        }

        return {
            recoveryPct,
            hoursElapsed,
            status,
            color,
            heavyTags: Array.from(heavyTagsFound),
            advice
        };
    }

    // ------------------------------------------------------------------------
    // 4. GRADE BREAKTHROUGH READINESS MODEL (ML / Statistical)
    // ------------------------------------------------------------------------
    function computeGradeReadiness(history, maxGradeIdx) {
        if (!history || history.length === 0) {
            return {
                readinessPct: 20,
                currentMaxGrade: GRADES[maxGradeIdx] || '6C',
                targetGrade: GRADES[Math.min(GRADES.length - 1, maxGradeIdx + 1)] || '6C+',
                readyForBreakthrough: false,
                pyramidSends: 0,
                pyramidTarget: 5,
                flashRateSubMax: 0,
                avgTriesAtMax: 0,
                verdict: 'Log more sessions to establish your climbing pyramid.'
            };
        }

        const recentSessions = history.slice(-20);
        const allRecentClimbs = recentSessions.flatMap(s => s.climbs || []);

        const atMaxClimbs = allRecentClimbs.filter(c => GRADES.indexOf(c.gradeStr) === maxGradeIdx);
        const atSubMaxClimbs = allRecentClimbs.filter(c => GRADES.indexOf(c.gradeStr) === (maxGradeIdx - 1));

        const maxSends = atMaxClimbs.filter(c => c.statusText === 'Top' || c.statusText === 'Flash');
        const subMaxSends = atSubMaxClimbs.filter(c => c.statusText === 'Top' || c.statusText === 'Flash');
        const subMaxFlashes = atSubMaxClimbs.filter(c => c.statusText === 'Flash');

        const pyramidRatio = Math.min(1.0, maxSends.length / 5);
        const flashRateSubMax = subMaxSends.length > 0 ? (subMaxFlashes.length / subMaxSends.length) : 0;
        const flashScore = Math.min(1.0, flashRateSubMax / 0.55);

        let avgTries = 4;
        if (maxSends.length > 0) {
            const sumTries = maxSends.reduce((sum, c) => sum + (c.tries || 1), 0);
            avgTries = sumTries / maxSends.length;
        }
        const efficiencyScore = Math.max(0, Math.min(1.0, (4.5 - avgTries) / 2.5));
        const sendTags = new Set(maxSends.flatMap(c => c.tags || []));
        const diversityScore = Math.min(1.0, sendTags.size / 3.5);

        const rawReadiness = (pyramidRatio * 0.40) + (flashScore * 0.35) + (efficiencyScore * 0.15) + (diversityScore * 0.10);
        const readinessPct = Math.min(99, Math.max(15, Math.round(rawReadiness * 100)));

        const targetGrade = GRADES[Math.min(GRADES.length - 1, maxGradeIdx + 1)];
        const readyForBreakthrough = readinessPct >= 75;

        let verdict = '';
        if (readyForBreakthrough) {
            verdict = `Your base at ${GRADES[maxGradeIdx]} is solidified! You are primed to project ${targetGrade}.`;
        } else if (maxSends.length < 3) {
            verdict = `Build your base: log ${3 - maxSends.length} more send(s) at ${GRADES[maxGradeIdx]} before stepping up.`;
        } else if (flashRateSubMax < 0.4) {
            verdict = `Solidify sub-max grades: increase your flash rate on ${GRADES[maxGradeIdx - 1]} routes.`;
        } else {
            verdict = `Close to breakthrough: refine attempt efficiency on ${GRADES[maxGradeIdx]}.`;
        }

        return {
            readinessPct,
            currentMaxGrade: GRADES[maxGradeIdx],
            targetGrade,
            readyForBreakthrough,
            pyramidSends: maxSends.length,
            pyramidTarget: 5,
            flashRateSubMax: Math.round(flashRateSubMax * 100),
            avgTriesAtMax: Math.round(avgTries * 10) / 10,
            verdict
        };
    }

    // ------------------------------------------------------------------------
    // 5. SESSION BLUEPRINT GENERATOR (Adaptive Planner)
    // ------------------------------------------------------------------------
    function generateDailyPlan(history, maxGradeIdx) {
        const workload = computeWorkloadMetrics(history, maxGradeIdx);
        const tendon = computeTendonRecovery(history, maxGradeIdx);
        const gradeReadiness = computeGradeReadiness(history, maxGradeIdx);
        const checkin = preSessionCheckin;

        const warmupBaseIdx = Math.max(0, maxGradeIdx - 4);
        const volumeGradeIdx = Math.max(0, maxGradeIdx - 2);
        const subMaxGradeIdx = Math.max(0, maxGradeIdx - 1);
        const projectTargetIdx = gradeReadiness.readyForBreakthrough ? Math.min(GRADES.length - 1, maxGradeIdx + 1) : maxGradeIdx;

        const maxGradeStr = GRADES[maxGradeIdx] || '6C';
        const subMaxGradeStr = GRADES[subMaxGradeIdx];
        const volumeGradeStr = GRADES[volumeGradeIdx];
        const warmupBaseStr = GRADES[warmupBaseIdx];
        const nextGradeStr = GRADES[Math.min(GRADES.length - 1, maxGradeIdx + 1)];
        const projectTargetStr = GRADES[projectTargetIdx];

        let baseReadiness = 85;
        if (workload.statusCategory === 'high_risk') baseReadiness = 30;
        else if (workload.statusCategory === 'elevated') baseReadiness = 55;
        else if (workload.statusCategory === 'undertrained') baseReadiness = 75;
        else baseReadiness = 90;

        if (tendon.recoveryPct < 50) baseReadiness -= 30;
        else if (tendon.recoveryPct < 100) baseReadiness -= 15;

        if (checkin.fingers === 'tweaky') baseReadiness = Math.min(baseReadiness, 40);
        else if (checkin.fingers === 'stiff') baseReadiness -= 10;
        if (checkin.skin === 'split') baseReadiness -= 15;

        const compositeScore = Math.max(10, Math.min(99, baseReadiness));

        let mode = 'LIMIT';
        let title = '🚀 Limit Projecting Day (Go Hard)';
        let badgeColor = 'emerald';
        let rationale = '';
        let phases = [];
        let exitRule = '';
        let targetTags = [];
        let forbiddenTags = [];

        if (checkin.fingers === 'tweaky' || compositeScore < 45 || workload.statusCategory === 'high_risk') {
            mode = 'REST';
            title = '🛑 Rest & Antagonist Recovery';
            badgeColor = 'red';
            rationale = checkin.fingers === 'tweaky'
                ? 'Tweaky fingers reported. Prioritize tendon health to prevent pulley injury.'
                : 'Acute fatigue spike detected. Climbing today risks acute injury with negative training yield.';
            phases = [
                {
                    name: 'Zero Climbing',
                    title: 'Rest & Recover',
                    desc: 'No hanging or climbing. Allow tendon collagen to rebuild.',
                    durationMinutes: 0,
                    restSeconds: 0,
                    targetGradeIdx: null,
                    targetGradeStr: null,
                    targetTags: []
                },
                {
                    name: 'Antagonist Care (15m)',
                    title: 'Antagonist Care',
                    desc: 'Reverse wrist curls, pushups, finger extensor bands (3x15).',
                    durationMinutes: 15,
                    restSeconds: 60,
                    targetGradeIdx: null,
                    targetGradeStr: null,
                    targetTags: []
                },
                {
                    name: 'Mobility & Hips (15m)',
                    title: 'Mobility & Hips',
                    desc: 'Hip openers, thoracic spine rotations, shoulder dislocates.',
                    durationMinutes: 15,
                    restSeconds: 60,
                    targetGradeIdx: null,
                    targetGradeStr: null,
                    targetTags: []
                }
            ];
            exitRule = 'Rest day complete. Stay hydrated and get 8h sleep.';
        } else if (compositeScore < 65 || tendon.recoveryPct < 80) {
            mode = 'VOLUME';
            title = '🧗 Sub-Max Volume & Capacity';
            badgeColor = 'amber';
            rationale = tendon.recoveryPct < 80
                ? `Tendons still remodeling from recent ${tendon.heavyTags.join('/')} loading (${tendon.hoursElapsed}h elapsed). Protect pulleys with open-hand & compression.`
                : 'Elevated acute load. Build base endurance and movement flow without testing limits.';
            targetTags = ['slab', 'sloper', 'technical', 'pinch'];
            forbiddenTags = ['crimp', 'board'];
            phases = [
                {
                    name: 'Warmup (20m)',
                    title: 'Movement Warmup',
                    desc: `Build gradually from ${warmupBaseStr} to ${volumeGradeStr}. Focus on silent feet and precision.`,
                    durationMinutes: 20,
                    restSeconds: 60,
                    targetGradeIdx: warmupBaseIdx,
                    targetGradeStr: warmupBaseStr,
                    targetTags: ['slab', 'sloper']
                },
                {
                    name: 'Volume Circuit (45m)',
                    title: 'Volume Circuit',
                    desc: `Complete 8–12 boulders strictly at ${volumeGradeStr} and ${subMaxGradeStr}. Rest 2 min between sends.`,
                    durationMinutes: 45,
                    restSeconds: 120,
                    targetGradeIdx: volumeGradeIdx,
                    targetGradeStr: volumeGradeStr,
                    targetTags: ['sloper', 'pinch', 'technical']
                },
                {
                    name: 'Technical Drill (15m)',
                    title: 'Technical Drill',
                    desc: 'Practice 3 slab or dynamic balance boulders with zero re-gripping.',
                    durationMinutes: 15,
                    restSeconds: 90,
                    targetGradeIdx: subMaxGradeIdx,
                    targetGradeStr: subMaxGradeStr,
                    targetTags: ['slab', 'technical']
                }
            ];
            exitRule = 'End session as soon as pump outlasts 2 minutes or form degrades.';
        } else if (checkin.time <= 45) {
            mode = 'DENSITY';
            title = '⚡ High-Density Flash Session';
            badgeColor = 'blue';
            rationale = 'Short time window (45m). Optimize for rapid movement density and warmup efficiency.';
            phases = [
                {
                    name: 'Dynamic Warmup (10m)',
                    title: 'Dynamic Warmup',
                    desc: `Continuous easy movement on ${warmupBaseStr} to 5+.`,
                    durationMinutes: 10,
                    restSeconds: 60,
                    targetGradeIdx: warmupBaseIdx,
                    targetGradeStr: warmupBaseStr,
                    targetTags: ['dynamic']
                },
                {
                    name: 'Flash Ladder (25m)',
                    title: 'Flash Ladder',
                    desc: `Attempt 5-6 boulders at ${volumeGradeStr} to ${subMaxGradeStr} with 90s rest.`,
                    durationMinutes: 25,
                    restSeconds: 90,
                    targetGradeIdx: volumeGradeIdx,
                    targetGradeStr: volumeGradeStr,
                    targetTags: ['powerful', 'dynamic']
                },
                {
                    name: 'Power Burn (10m)',
                    title: 'Power Burn',
                    desc: `2 crisp burns on a familiar ${maxGradeStr}.`,
                    durationMinutes: 10,
                    restSeconds: 180,
                    targetGradeIdx: maxGradeIdx,
                    targetGradeStr: maxGradeStr,
                    targetTags: ['powerful', 'crimp']
                }
            ];
            exitRule = 'Stop at minute 45 sharp.';
        } else {
            mode = 'LIMIT';
            title = `🚀 Limit Projecting (${projectTargetStr})`;
            badgeColor = 'emerald';
            rationale = `Fresh condition (ACWR ${workload.acwr}) and fully recovered tendons. Ideal window for maximum recruitment and neurological adaptation.`;
            targetTags = ['crimp', 'board', 'powerful', 'technical'];
            phases = [
                {
                    name: 'Warmup Pyramid (25m)',
                    title: 'Warmup Pyramid',
                    desc: `1x ${warmupBaseStr}, 2x ${volumeGradeStr}, 1x ${subMaxGradeStr}. Full 3m rest after last warmup.`,
                    durationMinutes: 25,
                    restSeconds: 90,
                    targetGradeIdx: warmupBaseIdx,
                    targetGradeStr: warmupBaseStr,
                    targetTags: ['slab', 'sloper']
                },
                {
                    name: 'CNS Priming (10m)',
                    title: 'CNS Priming',
                    desc: `1 high-effort flash attempt on ${subMaxGradeStr} to activate recruitment.`,
                    durationMinutes: 10,
                    restSeconds: 120,
                    targetGradeIdx: subMaxGradeIdx,
                    targetGradeStr: subMaxGradeStr,
                    targetTags: ['powerful', 'crimp']
                },
                {
                    name: 'Limit Project Phase (40m)',
                    title: 'Limit Project Phase',
                    desc: `Work 1 specific project at ${projectTargetStr}. Take 3–4 minutes full rest between burns. Max 5 burns total.`,
                    durationMinutes: 40,
                    restSeconds: 210,
                    targetGradeIdx: projectTargetIdx,
                    targetGradeStr: projectTargetStr,
                    targetTags: ['crimp', 'board', 'powerful']
                },
                {
                    name: 'Cool Down (10m)',
                    title: 'Cool Down',
                    desc: '2 very easy slabs below 5+ and light antagonist stretching.',
                    durationMinutes: 10,
                    restSeconds: 60,
                    targetGradeIdx: warmupBaseIdx,
                    targetGradeStr: warmupBaseStr,
                    targetTags: ['slab', 'sloper']
                }
            ];
            exitRule = 'Steve Bechtel Rule of 3: Stop projecting immediately if you fail 2 times below your previous high point.';
        }

        return {
            mode,
            title,
            badgeColor,
            compositeScore,
            rationale,
            phases,
            exitRule,
            targetTags,
            forbiddenTags,
            workload,
            tendon,
            gradeReadiness,
            timeAllocated: checkin.time
        };
    }

    // ------------------------------------------------------------------------
    // 6. INTRA-SESSION FATIGUE DETECTOR (Live in session)
    // ------------------------------------------------------------------------
    function evaluateLiveFatigue(activeClimbs, sessionElapsedSeconds) {
        if (!activeClimbs || activeClimbs.length < 3) {
            return { fatigueDetected: false, alertMessage: null };
        }

        // Rule of 3: 3 consecutive failed project burns
        let consecutiveProjectFails = 0;
        for (let i = 0; i < Math.min(4, activeClimbs.length); i++) {
            const c = activeClimbs[i];
            if (c.statusText === 'Project') {
                consecutiveProjectFails++;
            } else {
                break;
            }
        }

        if (consecutiveProjectFails >= 3) {
            return {
                fatigueDetected: true,
                severity: 'warning',
                alertMessage: '⚠️ Rule of 3 Triggered: 3 consecutive failed project burns. Neuromuscular power has dropped. Switch to easy volume or wrap up to protect pulleys.'
            };
        }

        const elapsedMinutes = Math.round((sessionElapsedSeconds || 0) / 60);
        if (elapsedMinutes >= 75) {
            const recentClimbs = activeClimbs.slice(0, 3);
            const recentPointsPerTry = recentClimbs.reduce((sum, c) => sum + ((c.points || 0) / (c.tries || 1)), 0) / recentClimbs.length;

            if (recentPointsPerTry < 4.0 && elapsedMinutes >= 90) {
                return {
                    fatigueDetected: true,
                    severity: 'critical',
                    alertMessage: '🛑 Session Fatigue Warning: 90m+ elapsed with low efficiency. Further limit attempts create junk volume and spike injury risk.'
                };
            }
        }

        return { fatigueDetected: false, alertMessage: null };
    }

    // ------------------------------------------------------------------------
    // 7. INTRA-SESSION PERFORMANCE ADAPTATION (Dynamic Coach)
    // ------------------------------------------------------------------------
    function evaluateIntraSessionAdaptation(activeClimbs, currentPhaseIndex, coachPlan, inProgressClimb) {
        if (!coachPlan || !coachPlan.phases || !coachPlan.phases[currentPhaseIndex]) {
            return null;
        }

        const phase = coachPlan.phases[currentPhaseIndex];
        const phaseTitle = (phase.title || phase.name || '').toLowerCase();
        const targetGradeIdx = phase.targetGradeIdx;
        const targetGradeStr = phase.targetGradeStr;

        // 0. LIVE IN-PROGRESS WORKING BOULDER CHECKS (Before climb is logged)
        if (inProgressClimb && inProgressClimb.tries) {
            const currentTries = inProgressClimb.tries;
            const currentGradeIdx = GRADES.indexOf(inProgressClimb.gradeStr);
            const isNearTarget = targetGradeIdx !== null && currentGradeIdx >= (targetGradeIdx - 1);

            // Live Limit Projecting Checks
            const isProjectPhase = phaseTitle.includes('project') || phaseTitle.includes('limit') || phaseTitle.includes('main');
            if (isProjectPhase && isNearTarget) {
                if (currentTries >= 5) {
                    return {
                        id: `live_burn_cap_${currentTries}`,
                        type: 'burn_cap',
                        title: '🛑 Limit Burn Cap Reached',
                        message: `${currentTries} burns on this boulder. Fast-twitch motor recruitment degrades after 5 max burns. Advance to cool down to protect pulleys.`,
                        badgeColor: 'amber',
                        actions: [
                            {
                                label: 'Advance to Cool Down ⏭️',
                                action: 'advance_phase',
                                primary: true
                            }
                        ]
                    };
                }
                if (currentTries >= 3 && inProgressClimb.status !== 'topped') {
                    return {
                        id: `live_rule_of_3_${currentTries}`,
                        type: 'rule_of_3',
                        title: '⚠️ Rule of 3 (In Progress)',
                        message: `${currentTries} burns on this project problem. Rate of force development is dropping. Consider resting 4m or wrapping up limit burns.`,
                        badgeColor: 'amber',
                        actions: [
                            {
                                label: 'Advance to Cool Down ⏭️',
                                action: 'advance_phase',
                                primary: true
                            },
                            {
                                label: '⏱️ +2m Rest',
                                action: 'add_rest',
                                restSeconds: 120,
                                primary: false
                            }
                        ]
                    };
                }
            }

            // Live Warmup Struggle
            const isWarmupPhase = phaseTitle.includes('warmup') || phaseTitle.includes('movement');
            if (isWarmupPhase && currentTries >= 2 && inProgressClimb.status !== 'topped') {
                return {
                    id: `live_warmup_struggle_${currentTries}`,
                    type: 'warmup_struggle',
                    title: '⚠️ Warmup Taking Extra Burns',
                    message: `Warmup boulder has taken ${currentTries} burns. Connective tissues need extra time to warm up. Take 2m rest before ramping up intensity.`,
                    badgeColor: 'amber',
                    actions: [
                        {
                            label: '⏱️ +2m Warmup Rest',
                            action: 'add_rest',
                            restSeconds: 120,
                            primary: true
                        }
                    ]
                };
            }
        }

        // Filter climbs logged in this session that belong to this phase or recent climbs
        const phaseClimbs = (activeClimbs || []).filter(c => {
            if (c.phaseName) {
                return c.phaseName.toLowerCase() === (phase.title || phase.name || '').toLowerCase();
            }
            return true;
        });

        if (phaseClimbs.length === 0) return null;

        // 1. EARLY PROJECT SEND (Limit Project Phase)
        const isProjectPhase = phaseTitle.includes('project') || phaseTitle.includes('limit') || phaseTitle.includes('main');
        if (isProjectPhase && targetGradeIdx !== null && targetGradeIdx !== undefined) {
            const sendAtTarget = phaseClimbs.find(c => 
                (c.statusText === 'Top' || c.statusText === 'Flash') &&
                GRADES.indexOf(c.gradeStr) >= targetGradeIdx
            );

            if (sendAtTarget) {
                const sendGradeIdx = GRADES.indexOf(sendAtTarget.gradeStr);
                const nextGradeIdx = Math.min(GRADES.length - 1, sendGradeIdx + 1);
                const nextGradeStr = GRADES[nextGradeIdx];

                if (nextGradeIdx > sendGradeIdx) {
                    return {
                        id: `early_send_${sendAtTarget.id}`,
                        type: 'early_send',
                        title: '🚀 Project Sent!',
                        message: `Sent ${sendAtTarget.gradeStr} in ${sendAtTarget.tries} burn${sendAtTarget.tries > 1 ? 's' : ''}! Power reserve is high today.`,
                        badgeColor: 'emerald',
                        actions: [
                            {
                                label: `🔥 Bump to ${nextGradeStr}`,
                                action: 'bump_grade',
                                newGradeIdx: nextGradeIdx,
                                newGradeStr: nextGradeStr,
                                primary: true
                            },
                            {
                                label: '🏁 Cool Down',
                                action: 'advance_phase',
                                primary: false
                            }
                        ]
                    };
                }
            }

            // 2. PROJECT BURN CAP (5 Limit Burns)
            const totalProjectBurns = phaseClimbs.reduce((acc, c) => acc + (c.tries || 1), 0);
            if (totalProjectBurns >= 5) {
                return {
                    id: `burn_cap_${totalProjectBurns}`,
                    type: 'burn_cap',
                    title: '🛑 Limit Burn Cap Reached',
                    message: `${totalProjectBurns} limit burns logged. Neuromuscular recruitment degrades after 5 max attempts.`,
                    badgeColor: 'amber',
                    actions: [
                        {
                            label: 'Advance Phase ⏭️',
                            action: 'advance_phase',
                            primary: true
                        }
                    ]
                };
            }
        }

        // 3. CNS PRIMING STRUGGLE / FAILURE
        const isPrimingPhase = phaseTitle.includes('priming') || phaseTitle.includes('cns');
        if (isPrimingPhase && targetGradeIdx !== null && targetGradeIdx !== undefined) {
            const latestClimb = phaseClimbs[0];
            if (latestClimb && (latestClimb.statusText === 'Project' || (latestClimb.tries && latestClimb.tries >= 3))) {
                const softerTargetIdx = Math.max(0, targetGradeIdx - 1);
                const softerTargetStr = GRADES[softerTargetIdx];
                return {
                    id: `priming_struggle_${latestClimb.id}`,
                    type: 'priming_struggle',
                    title: '⚠️ Priming Heavy',
                    message: 'High-threshold recruitment feels sluggish. Ease limit target by -1 to protect fingers and consolidate.',
                    badgeColor: 'amber',
                    actions: [
                        {
                            label: `🛡️ Adjust Target (${softerTargetStr})`,
                            action: 'drop_grade',
                            newGradeIdx: softerTargetIdx,
                            newGradeStr: softerTargetStr,
                            primary: true
                        },
                        {
                            label: '⏱️ +2m Rest',
                            action: 'add_rest',
                            restSeconds: 120,
                            primary: false
                        }
                    ]
                };
            }
        }

        // 4. RULE OF 3 DETECTED
        let consecutiveProjectFails = 0;
        for (let i = 0; i < Math.min(3, phaseClimbs.length); i++) {
            if (phaseClimbs[i].statusText === 'Project') {
                consecutiveProjectFails++;
            } else {
                break;
            }
        }
        if (consecutiveProjectFails >= 3) {
            return {
                id: `rule_of_3_${phaseClimbs[0]?.id}`,
                type: 'rule_of_3',
                title: '⚠️ Rule of 3 Triggered',
                message: '3 consecutive project fails. Fast-twitch power has peaked for this session.',
                badgeColor: 'amber',
                actions: [
                    {
                        label: 'Advance to Cool Down ⏭️',
                        action: 'advance_phase',
                        primary: true
                    }
                ]
            };
        }

        // 5. WARMUP STRUGGLE / MULTIPLE ATTEMPTS
        const isWarmupPhase = phaseTitle.includes('warmup') || phaseTitle.includes('movement');
        if (isWarmupPhase) {
            const heavyWarmup = phaseClimbs.find(c => (c.tries && c.tries >= 2) || c.statusText === 'Project');
            if (heavyWarmup) {
                return {
                    id: `warmup_struggle_${heavyWarmup.id}`,
                    type: 'warmup_struggle',
                    title: '⚠️ Warmup Taking Extra Burns',
                    message: `Warmup problem took ${heavyWarmup.tries} attempt${heavyWarmup.tries > 1 ? 's' : ''}. Connective tissues need extra time to warm up. Take 2m rest before ramping up intensity.`,
                    badgeColor: 'amber',
                    actions: [
                        {
                            label: '⏱️ +2m Warmup Rest',
                            action: 'add_rest',
                            restSeconds: 120,
                            primary: true
                        }
                    ]
                };
            }
        }

        return null;
    }

    // ------------------------------------------------------------------------
    // 8. POST-SESSION CALIBRATION FEEDBACK
    // ------------------------------------------------------------------------
    function recordFeedback(rating) {
        const calib = getCalibration();
        if (rating === 'easy') {
            calib.capacityScalar = Math.min(1.4, Math.round((calib.capacityScalar + 0.05) * 100) / 100);
        } else if (rating === 'hard') {
            calib.capacityScalar = Math.max(0.7, Math.round((calib.capacityScalar - 0.05) * 100) / 100);
        }
        calib.feedbackHistory.push({ date: Date.now(), rating });
        saveCalibration(calib);
    }

    function setCheckin(key, value) {
        preSessionCheckin[key] = value;
    }

    function getCheckin() {
        return { ...preSessionCheckin };
    }

    function getTodayPlan() {
        const history = JSON.parse(localStorage.getItem('boulderHistory')) || [];
        const maxGradeIdx = parseInt(localStorage.getItem('boulderMaxGradeIndex')) || 14;
        return generateDailyPlan(history, maxGradeIdx);
    }

    return {
        GRADES,
        STYLE_STRESS,
        calculateSessionLoad,
        computeWorkloadMetrics,
        computeTendonRecovery,
        computeGradeReadiness,
        generateDailyPlan,
        getTodayPlan,
        evaluateLiveFatigue,
        evaluateIntraSessionAdaptation,
        recordFeedback,
        setCheckin,
        getCheckin
    };
})();

// Global renderer for the Planner UI in index.html
function renderPlannerUI() {
    try {
        const history = JSON.parse(localStorage.getItem('boulderHistory')) || [];
        const maxGradeIdx = parseInt(localStorage.getItem('boulderMaxGradeIndex')) || 14;
        const plan = Planner.generateDailyPlan(history, maxGradeIdx);
        const checkin = Planner.getCheckin();

        // 1. Readiness Battery & Score
        const readinessEl = document.getElementById('plannerReadinessScore');
        const readinessGauge = document.getElementById('plannerReadinessGauge');
        const readinessTitle = document.getElementById('plannerReadinessTitle');
        const readinessDesc = document.getElementById('plannerReadinessDesc');

        if (readinessEl) readinessEl.innerText = `${plan.compositeScore}%`;
        if (readinessGauge) {
            readinessGauge.style.width = `${plan.compositeScore}%`;
            readinessGauge.className = `h-full rounded-full transition-all duration-500 ${
                plan.compositeScore >= 75 ? 'bg-emerald-500' : plan.compositeScore >= 50 ? 'bg-amber-500' : 'bg-red-500'
            }`;
        }
        if (readinessTitle) readinessTitle.innerText = plan.title;
        if (readinessDesc) readinessDesc.innerText = plan.rationale;

        // 2. Metrics Cards: ACWR & Tendons
        const acwrVal = document.getElementById('plannerACWRVal');
        const acwrBadge = document.getElementById('plannerACWRBadge');
        if (acwrVal) acwrVal.innerText = plan.workload.acwr;
        if (acwrBadge) {
            acwrBadge.innerText = plan.workload.statusText;
            acwrBadge.className = `text-[9px] font-bold px-2 py-0.5 rounded-md ${
                plan.workload.statusCategory === 'sweet_spot' ? 'bg-emerald-500/20 text-emerald-400' :
                plan.workload.statusCategory === 'elevated' ? 'bg-amber-500/20 text-amber-400' :
                plan.workload.statusCategory === 'high_risk' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
            }`;
        }

        const tendonVal = document.getElementById('plannerTendonVal');
        const tendonBadge = document.getElementById('plannerTendonBadge');
        const tendonDesc = document.getElementById('plannerTendonDesc');
        if (tendonVal) tendonVal.innerText = `${plan.tendon.recoveryPct}%`;
        if (tendonBadge) {
            tendonBadge.innerText = plan.tendon.status;
            tendonBadge.className = `text-[9px] font-bold px-2 py-0.5 rounded-md ${
                plan.tendon.recoveryPct >= 90 ? 'bg-emerald-500/20 text-emerald-400' :
                plan.tendon.recoveryPct >= 60 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'
            }`;
        }
        if (tendonDesc) tendonDesc.innerText = plan.tendon.advice;

        // 3. Today's Structured Session Blueprint Phases
        const phasesContainer = document.getElementById('plannerPhasesList');
        if (phasesContainer) {
            phasesContainer.innerHTML = plan.phases.map((p, idx) => `
                <div class="flex items-start gap-3 bg-neutral-900/70 p-3 rounded-2xl border border-neutral-800">
                    <span class="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-black text-neutral-400 shrink-0 mt-0.5">${idx + 1}</span>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-2">
                            <p class="text-xs font-bold text-white">${p.name}</p>
                            ${p.targetGradeStr ? `<span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-400 border border-orange-500/30 shrink-0">Target: ${p.targetGradeStr}</span>` : ''}
                        </div>
                        <p class="text-[11px] text-neutral-400 leading-snug mt-0.5">${p.desc}</p>
                        ${p.targetTags && p.targetTags.length > 0 ? `
                        <div class="flex gap-1 mt-1.5 flex-wrap">
                            ${p.targetTags.map(t => `<span class="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">${t}</span>`).join('')}
                        </div>` : ''}
                    </div>
                </div>
            `).join('');
        }

        // Update Today's Coach Card in Session Tab
        const scTitle = document.getElementById('sessionCardCoachTitle');
        const scSub = document.getElementById('sessionCardCoachSubtitle');
        if (scTitle) scTitle.innerText = plan.title;
        if (scSub) {
            const firstTarget = plan.phases.find(p => p.targetGradeStr);
            const gradeInfo = firstTarget ? ` · Target ${firstTarget.targetGradeStr}` : '';
            scSub.innerText = `${plan.phases.length} Guided Phases${gradeInfo} · Tap to start`;
        }

        // Target / Forbidden Tags
        const tagsContainer = document.getElementById('plannerTargetTags');
        if (tagsContainer) {
            let html = '';
            if (plan.targetTags.length > 0) {
                html += plan.targetTags.map(t => `<span class="px-2 py-1 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-[9px] font-black uppercase tracking-wider">${t}</span>`).join('');
            }
            if (plan.forbiddenTags.length > 0) {
                html += plan.forbiddenTags.map(t => `<span class="px-2 py-1 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-[9px] font-black uppercase tracking-wider line-through">NO ${t}</span>`).join('');
            }
            tagsContainer.innerHTML = html || '<span class="text-neutral-500 text-[10px]">All movement styles fine</span>';
        }

        // Exit Rule
        const exitRuleEl = document.getElementById('plannerExitRule');
        if (exitRuleEl) exitRuleEl.innerText = plan.exitRule;

        // 4. Grade Breakthrough Meter
        const gr = plan.gradeReadiness;
        const grScore = document.getElementById('plannerGradeReadinessScore');
        const grTarget = document.getElementById('plannerGradeTarget');
        const grBar = document.getElementById('plannerGradeBar');
        const grVerdict = document.getElementById('plannerGradeVerdict');
        const grPyramid = document.getElementById('plannerGradePyramid');
        const grFlash = document.getElementById('plannerGradeFlash');

        if (grScore) grScore.innerText = `${gr.readinessPct}%`;
        if (grTarget) grTarget.innerText = gr.targetGrade;
        if (grBar) {
            grBar.style.width = `${gr.readinessPct}%`;
            grBar.className = `h-full rounded-full transition-all duration-500 ${gr.readyForBreakthrough ? 'bg-emerald-400' : 'bg-blue-400'}`;
        }
        if (grVerdict) grVerdict.innerText = gr.verdict;
        if (grPyramid) grPyramid.innerText = `${gr.pyramidSends} / ${gr.pyramidTarget} sends at ${gr.currentMaxGrade}`;
        if (grFlash) grFlash.innerText = `${gr.flashRateSubMax}% flash rate at ${Planner.GRADES[Math.max(0, maxGradeIdx - 1)]}`;

        // 5. Update Context Checkin UI buttons state
        ['fresh', 'stiff', 'tweaky'].forEach(f => {
            const btn = document.getElementById(`checkin-finger-${f}`);
            if (btn) {
                if (checkin.fingers === f) {
                    btn.classList.replace('bg-neutral-900', f === 'tweaky' ? 'bg-red-500/30' : 'bg-emerald-500/30');
                    btn.classList.replace('text-neutral-400', f === 'tweaky' ? 'text-red-400' : 'text-emerald-400');
                    btn.classList.add('border-emerald-500/50');
                } else {
                    btn.classList.remove('bg-emerald-500/30', 'bg-red-500/30', 'text-emerald-400', 'text-red-400', 'border-emerald-500/50');
                    btn.classList.add('bg-neutral-900', 'text-neutral-400');
                }
            }
        });

        [45, 90, 120].forEach(t => {
            const btn = document.getElementById(`checkin-time-${t}`);
            if (btn) {
                if (checkin.time === t) {
                    btn.classList.replace('bg-neutral-900', 'bg-emerald-500/30');
                    btn.classList.replace('text-neutral-400', 'text-emerald-400');
                    btn.classList.add('border-emerald-500/50');
                } else {
                    btn.classList.remove('bg-emerald-500/30', 'text-emerald-400', 'border-emerald-500/50');
                    btn.classList.add('bg-neutral-900', 'text-neutral-400');
                }
            }
        });

    } catch (e) {
        console.error('renderPlannerUI error:', e);
    }
}

// User check-in handler from UI
function setPlannerCheckin(key, value) {
    Planner.setCheckin(key, value);
    renderPlannerUI();
}

// Calibration feedback button handler
function handleSessionFeedback(rating) {
    Planner.recordFeedback(rating);
    const feedbackBox = document.getElementById('sessionFeedbackContainer');
    if (feedbackBox) {
        feedbackBox.innerHTML = `
            <div class="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
                <p class="text-xs font-bold text-emerald-400">Feedback Saved</p>
                <p class="text-[10px] text-neutral-400 mt-0.5">Your recovery parameters have been calibrated.</p>
            </div>
        `;
    }
}

// Auto-initialize Planner UI on load
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => renderPlannerUI());
    } else {
        setTimeout(renderPlannerUI, 50);
    }
}