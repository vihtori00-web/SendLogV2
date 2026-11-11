// ============================================================================
// SendLog v2.1 - Adaptive Climbing Session Planner & Readiness Engine
// Grounded in EWMA ACWR, 48-72h tendon remodeling, style-affinity profiling,
// and intra-session autoregulation.
// ============================================================================

const Planner = (function () {
    const GRADES = [
        '<4', '4', '4+', '5', '5+', '6A', '6A+', '6B', '6B+',
        '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+',
        '8A', '8A+', '8B', '8B+', '8C', '8C+', '9A'
    ];

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

    const ALL_STYLES = Object.keys(STYLE_STRESS);

    // Off-the-wall exercise definitions and science-backed presets
    const EXERCISES_ANTAGONIST = [
        { id: 'pushups', name: 'Pushups / Diamond Pushups', sets: 3, reps: '15 reps', restSeconds: 60, desc: 'Engage serratus anterior and chest antagonists to balance pulling volume.' },
        { id: 'reverse_curls', name: 'Reverse Wrist Curls', sets: 3, reps: '15 reps', restSeconds: 60, desc: 'Extensor tendon strengthening for elbow & forearm tendon balance.' },
        { id: 'band_pullaparts', name: 'Resistance Band Pull-Aparts', sets: 3, reps: '20 reps', restSeconds: 45, desc: 'Rear delts and rhomboids for posture and scapular retraction.' },
        { id: 'extensor_bands', name: 'Finger Extensor Rubber Bands', sets: 3, reps: '25 reps', restSeconds: 45, desc: 'Balance flexor pulleys and prevent finger overload.' }
    ];

    const EXERCISES_MOBILITY = [
        { id: 'hip_90_90', name: '90/90 Hip Switches', sets: 3, reps: '10 switches', restSeconds: 45, desc: 'Internal and external rotation of hip capsules for closer hip placement.' },
        { id: 'frog_stretch', name: 'Deep Frog Stretch', sets: 3, reps: '45s hold', restSeconds: 45, desc: 'Adductor opening for wide dropknees and smear stems.' },
        { id: 'thoracic_rotation', name: 'Thoracic Spine Rotations', sets: 3, reps: '10 reps / side', restSeconds: 45, desc: 'T-spine mobility for reach and rotational compression.' },
        { id: 'shoulder_dislocates', name: 'Shoulder Dislocates (Band)', sets: 3, reps: '15 slow reps', restSeconds: 45, desc: 'Restore overhead shoulder mobility and open chest.' }
    ];

    const EXERCISES_CORE = [
        { id: 'hollow_hold', name: 'Hollow Body Holds', sets: 3, reps: '30s hold', restSeconds: 60, desc: 'Lower back pinned firmly to the mat; maintain full-body tension.' },
        { id: 'l_sit', name: 'L-Sit / Tuck L-Sit', sets: 3, reps: '20s hold', restSeconds: 60, desc: 'Depress shoulders strongly on parallettes or floor.' },
        { id: 'side_plank', name: 'Side Planks with Hip Dip', sets: 3, reps: '30s / side', restSeconds: 45, desc: 'Oblique activation for heel hooks and steep overhangs.' },
        { id: 'bird_dog', name: 'Bird-Dog (3s Hold)', sets: 3, reps: '10 reps / side', restSeconds: 45, desc: 'Posterior chain, glute, and rotational stabilization.' }
    ];

    const EXERCISES_BENCH_PRESS = [
        { id: 'bench_press_barbell', name: 'Barbell Bench Press', sets: 4, reps: '6 reps', restSeconds: 180, desc: 'Full range of motion, touch chest with control, drive upward with active scapular retraction.', trackWeight: true, defaultWeight: 60, defaultReps: 6 },
        { id: 'incline_db_press', name: 'Incline Dumbbell Press', sets: 3, reps: '10 reps', restSeconds: 90, desc: 'Upper chest and anterior deltoid strength for compression moves on steep walls.', trackWeight: true, defaultWeight: 20, defaultReps: 10 },
        { id: 'overhead_press', name: 'Overhead Press (OHP)', sets: 3, reps: '8 reps', restSeconds: 90, desc: 'Vertical push strength, shoulder stability, and thoracic extension.', trackWeight: true, defaultWeight: 40, defaultReps: 8 },
        { id: 'dips', name: 'Chest / Tricep Dips', sets: 3, reps: '10 reps', restSeconds: 90, desc: 'Lockout tricep power for mantels, topouts, and deep compression.', trackWeight: true, defaultWeight: 0, defaultReps: 10 }
    ];

    const WORKOUT_PRESETS = [
        {
            id: 'bench_press',
            name: 'Bench Press & Antagonist Power',
            shortName: 'Bench Press',
            category: 'strength',
            icon: '🏋️',
            badge: 'Strength',
            durationMinutes: 25,
            desc: 'Heavy push strength to balance climbing pull muscles, stabilize shoulders, and build chest/tricep compression power.',
            exercises: EXERCISES_BENCH_PRESS
        },
        {
            id: 'antagonist_armor',
            name: 'Antagonist Armor (Joint & Tendon Prehab)',
            shortName: 'Antagonist Armor',
            category: 'prehab',
            icon: '🛡️',
            badge: 'Prehab',
            durationMinutes: 25,
            desc: 'Strengthen extensors, shoulders, and chest to balance pulling volume and prevent climber elbow.',
            exercises: EXERCISES_ANTAGONIST
        },
        {
            id: 'repeaters_7_3',
            name: 'Lattice 7:3 Repeaters (Finger Aerobic Power)',
            shortName: '7:3 Repeaters',
            category: 'hangboard',
            icon: '⚡',
            badge: 'Hangboard',
            durationMinutes: 20,
            desc: 'Classic Lattice finger endurance protocol: 6 reps of 7s on / 3s off per set on a 20mm edge.',
            hangConfig: {
                isHang: true,
                hangSeconds: 7,
                repRestSeconds: 3,
                repsPerSet: 6,
                prepSeconds: 5,
                setRestSeconds: 150
            },
            exercises: [
                { id: 'rep_set_1', name: 'Set 1: 7:3 Repeaters (6 reps)', sets: 1, reps: '6 reps (7s on / 3s off)', restSeconds: 150, isHang: true, hangSeconds: 7, repRestSeconds: 3, repsPerSet: 6, prepSeconds: 5, desc: 'Half-crimp or open-hand on 20mm edge at bodyweight. Strict audio interval.' },
                { id: 'rep_set_2', name: 'Set 2: 7:3 Repeaters (6 reps)', sets: 1, reps: '6 reps (7s on / 3s off)', restSeconds: 150, isHang: true, hangSeconds: 7, repRestSeconds: 3, repsPerSet: 6, prepSeconds: 5, desc: 'Maintain open chest and active scapular retraction.' },
                { id: 'rep_set_3', name: 'Set 3: 7:3 Repeaters (6 reps)', sets: 1, reps: '6 reps (7s on / 3s off)', restSeconds: 150, isHang: true, hangSeconds: 7, repRestSeconds: 3, repsPerSet: 6, prepSeconds: 5, desc: 'Do not crimp with thumb wrap. Strict form.' },
                { id: 'rep_set_4', name: 'Set 4: 7:3 Repeaters (6 reps)', sets: 1, reps: '6 reps (7s on / 3s off)', restSeconds: 150, isHang: true, hangSeconds: 7, repRestSeconds: 3, repsPerSet: 6, prepSeconds: 5, desc: 'Final round of aerobic recruitment.' }
            ]
        },
        {
            id: 'max_hangs',
            name: 'Eva López Max Hangs (Max Recruitment)',
            shortName: 'Max Hangs',
            category: 'hangboard',
            icon: '🧗',
            badge: 'Hangboard',
            durationMinutes: 25,
            desc: '5 sets of 10s hangs at 85-90% max load on 18-20mm edge with full 3m neural recovery between hangs.',
            hangConfig: {
                isHang: true,
                hangSeconds: 10,
                repRestSeconds: 0,
                repsPerSet: 1,
                prepSeconds: 5,
                setRestSeconds: 180,
                trackWeight: true
            },
            exercises: [
                { id: 'max_hang_1', name: 'Hang 1 (10s @ Max Effort)', sets: 1, reps: '10s hang', restSeconds: 180, isHang: true, hangSeconds: 10, repRestSeconds: 0, repsPerSet: 1, prepSeconds: 5, trackWeight: true, defaultWeight: 0, defaultReps: 1, desc: 'Strict half-crimp on 18–20mm edge. Full 3m rest.' },
                { id: 'max_hang_2', name: 'Hang 2 (10s @ Max Effort)', sets: 1, reps: '10s hang', restSeconds: 180, isHang: true, hangSeconds: 10, repRestSeconds: 0, repsPerSet: 1, prepSeconds: 5, trackWeight: true, defaultWeight: 0, defaultReps: 1, desc: 'Maintain scapular engagement throughout.' },
                { id: 'max_hang_3', name: 'Hang 3 (10s @ Max Effort)', sets: 1, reps: '10s hang', restSeconds: 180, isHang: true, hangSeconds: 10, repRestSeconds: 0, repsPerSet: 1, prepSeconds: 5, trackWeight: true, defaultWeight: 0, defaultReps: 1, desc: 'Maximum motor unit recruitment.' },
                { id: 'max_hang_4', name: 'Hang 4 (10s @ Max Effort)', sets: 1, reps: '10s hang', restSeconds: 180, isHang: true, hangSeconds: 10, repRestSeconds: 0, repsPerSet: 1, prepSeconds: 5, trackWeight: true, defaultWeight: 0, defaultReps: 1, desc: 'Discontinue immediately if form slips.' },
                { id: 'max_hang_5', name: 'Hang 5 (10s @ Max Effort)', sets: 1, reps: '10s hang', restSeconds: 180, isHang: true, hangSeconds: 10, repRestSeconds: 0, repsPerSet: 1, prepSeconds: 5, trackWeight: true, defaultWeight: 0, defaultReps: 1, desc: 'Final neural recruitment repetition.' }
            ]
        },
        {
            id: 'climber_core',
            name: 'Climber Core & Body Tension Circuit',
            shortName: 'Climber Core',
            category: 'core',
            icon: '💪',
            badge: 'Core',
            durationMinutes: 20,
            desc: 'Build toe-to-finger anterior chain tension for steep overhangs and board problems.',
            exercises: EXERCISES_CORE
        },
        {
            id: 'mobility_flow',
            name: 'Hip & Thoracic Mobility Flow',
            shortName: 'Hip Mobility',
            category: 'mobility',
            icon: '🧘',
            badge: 'Mobility',
            durationMinutes: 20,
            desc: 'Unlock high steps, frog positions, and closer-to-wall body mechanics.',
            exercises: EXERCISES_MOBILITY
        }
    ];

    // ------------------------------------------------------------------------
    // STATE & LOCALSTORAGE HELPERS
    // ------------------------------------------------------------------------
    function getCalibration() {
        try {
            const saved = localStorage.getItem('sendlog_v2_calibration');
            if (saved) return JSON.parse(saved);
        } catch (e) { }
        return {
            capacityScalar: 1.0,
            fatigueSensitivity: 1.0,
            feedbackHistory: []
        };
    }

    function saveCalibration(calib) {
        try {
            localStorage.setItem('sendlog_v2_calibration', JSON.stringify(calib));
        } catch (e) { }
    }

    function loadCheckin() {
        try {
            const saved = localStorage.getItem('boulderCheckin');
            if (saved) {
                const parsed = JSON.parse(saved);
                return {
                    fingers: ['fresh', 'stiff', 'tweaky'].includes(parsed.fingers) ? parsed.fingers : 'fresh',
                    skin: ['good', 'thin', 'split'].includes(parsed.skin) ? parsed.skin : 'good',
                    time: [45, 90, 120].includes(Number(parsed.time)) ? Number(parsed.time) : 90
                };
            }
        } catch (e) { }
        return { fingers: 'fresh', skin: 'good', time: 90 };
    }

    let preSessionCheckin = loadCheckin();

    function setCheckin(keyOrObj, value) {
        preSessionCheckin = loadCheckin();
        if (typeof keyOrObj === 'object' && keyOrObj !== null) {
            preSessionCheckin = { ...preSessionCheckin, ...keyOrObj };
        } else if (typeof keyOrObj === 'string') {
            preSessionCheckin[keyOrObj] = value;
        }
        try {
            localStorage.setItem('boulderCheckin', JSON.stringify(preSessionCheckin));
        } catch (e) { }
        return { ...preSessionCheckin };
    }

    function getCheckin() {
        preSessionCheckin = loadCheckin();
        return { ...preSessionCheckin };
    }

    function getStoredHistory() {
        const candidateKeys = ['sendlog_history', 'boulderHistory', 'sessions', 'climbingHistory'];
        for (const key of candidateKeys) {
            try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) return parsed;
                }
            } catch (e) { }
        }
        return [];
    }

    function isSend(climb) {
        if (!climb) return false;
        return Boolean(
            climb.isTop ||
            climb.isFlash ||
            climb.statusText === 'Top' ||
            climb.statusText === 'Flash'
        );
    }

    function isFlash(climb) {
        if (!climb) return false;
        return Boolean(climb.isFlash || climb.statusText === 'Flash');
    }

    // Normalize session climbs so index 0 = oldest, index length-1 = most recent
    function normalizeChronological(climbs = []) {
        if (!Array.isArray(climbs) || climbs.length <= 1) return [...(climbs || [])];
        const copy = [...climbs];

        // 1. If timestamps or numeric IDs exist, sort ascending
        const firstTs = copy[0].timestamp || copy[0].createdAt || copy[0].id;
        const lastTs = copy[copy.length - 1].timestamp || copy[copy.length - 1].createdAt || copy[copy.length - 1].id;
        if (typeof firstTs === 'number' && typeof lastTs === 'number' && firstTs !== lastTs) {
            return copy.sort((a, b) => {
                const tA = a.timestamp || a.createdAt || a.id || 0;
                const tB = b.timestamp || b.createdAt || b.id || 0;
                return tA - tB;
            });
        }

        // 2. Heuristic fallback: if index 0 is much harder than the last index, UI is unshifting (newest-first)
        const firstGrade = GRADES.indexOf(copy[0].gradeStr);
        const lastGrade = GRADES.indexOf(copy[copy.length - 1].gradeStr);
        if (firstGrade - lastGrade >= 2) {
            return copy.reverse();
        }
        return copy;
    }

    // ------------------------------------------------------------------------
    // 1. TRAINING LOAD (TL) CALCULATION
    // ------------------------------------------------------------------------
    function calculateClimbLoad(climb, maxGradeIdx) {
        const gradeIdx = GRADES.indexOf(climb.gradeStr);
        const effectiveGrade = gradeIdx >= 0 ? gradeIdx : Math.max(0, maxGradeIdx - 4);
        const relIntensity = effectiveGrade - maxGradeIdx;

        const intensityFactor = Math.pow(1.35, relIntensity);

        let outcomeFactor = 0.9;
        if (isFlash(climb)) outcomeFactor = 1.1;
        else if (!isSend(climb)) outcomeFactor = 0.85;

        let styleMult = 1.0;
        if (climb.tags && Array.isArray(climb.tags) && climb.tags.length > 0) {
            const tagSum = climb.tags.reduce((sum, t) => sum + (STYLE_STRESS[t] || 1.0), 0);
            styleMult = tagSum / climb.tags.length;
        }

        const tries = Math.max(1, parseInt(climb.tries, 10) || 1);
        return (tries * intensityFactor * outcomeFactor * styleMult) * 10;
    }

    function calculateSessionLoad(session, maxGradeIdx) {
        let totalLoad = 0;
        if (session.climbs && session.climbs.length > 0) {
            session.climbs.forEach(c => {
                totalLoad += calculateClimbLoad(c, maxGradeIdx);
            });
        }

        if (session.workouts && session.workouts.length > 0) {
            session.workouts.forEach(w => {
                let workoutLoad = 0;
                if (w.exercises && Array.isArray(w.exercises)) {
                    w.exercises.forEach(ex => {
                        const completed = parseInt(ex.completedSets, 10) || 0;
                        const category = (w.category || '').toLowerCase();
                        const perSetFactor = category.includes('hang') ? 25 : category.includes('strength') ? 20 : 15;
                        workoutLoad += completed * perSetFactor;
                    });
                }
                if (workoutLoad === 0) {
                    const dur = w.durationMinutes || 20;
                    workoutLoad = dur * 4;
                }
                totalLoad += workoutLoad;
            });
        }

        if (totalLoad === 0) return 0;

        const durationMin = Math.round((session.duration || 3600) / 60);
        const durationFactor = Math.min(1.5, Math.max(0.7, durationMin / 75));

        return Math.round(totalLoad * durationFactor);
    }

    // ------------------------------------------------------------------------
    // 2. DAILY EWMA ACWR & READINESS ENGINE (Fixes Frequency Bug)
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

        // Bucket total load per day over the last 28 days (0 = today, 27 = 27 days ago)
        const dailyLoads = new Array(28).fill(0);
        history.forEach(s => {
            const timestamp = s.timestamp || now;
            const daysAgo = Math.floor(Math.max(0, (now - timestamp) / MS_PER_DAY));
            if (daysAgo < 28) {
                dailyLoads[daysAgo] += calculateSessionLoad(s, maxGradeIdx);
            }
        });

        // Compute weekly equivalent loads with exponential decay across all 28 calendar days
        const acuteDecay = 4.5 / (calib.capacityScalar || 1.0);
        const chronicDecay = 18.0;

        let acuteWeightedSum = 0, acuteWeightTotal = 0;
        let chronicWeightedSum = 0, chronicWeightTotal = 0;

        for (let day = 0; day < 28; day++) {
            const load = dailyLoads[day];
            if (day < 7) {
                const wA = Math.exp(-day / acuteDecay);
                acuteWeightedSum += load * wA;
                acuteWeightTotal += wA;
            }
            const wC = Math.exp(-day / chronicDecay);
            chronicWeightedSum += load * wC;
            chronicWeightTotal += wC;
        }

        // Convert daily EWMA into 7-day rolling workload equivalents
        const acuteLoad = acuteWeightTotal > 0 ? (acuteWeightedSum / acuteWeightTotal) * 3.5 : 0;
        const chronicLoad = chronicWeightTotal > 0 ? (chronicWeightedSum / chronicWeightTotal) * 3.5 : 100;

        const effectiveChronic = Math.max(80, chronicLoad);
        const rawAcwr = effectiveChronic > 0 ? (acuteLoad / effectiveChronic) : 1.0;
        const acwr = Math.round(rawAcwr * 100) / 100;

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

        return {
            acuteLoad: Math.round(acuteLoad),
            chronicLoad: Math.round(chronicLoad),
            acwr,
            statusText,
            statusColor,
            statusCategory
        };
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
        let heavyLoadScore = 0;
        const heavyTagsFound = new Set();

        for (let i = history.length - 1; i >= 0; i--) {
            const s = history[i];
            const climbs = s.climbs || [];
            let sessionCrimpLoad = 0;

            climbs.forEach(c => {
                const gIdx = GRADES.indexOf(c.gradeStr);
                const isNearMax = gIdx >= (maxGradeIdx - 2);
                const hasHighStrainTag = c.tags && c.tags.some(t => t === 'crimp' || t === 'board' || t === 'powerful');

                if (isNearMax && hasHighStrainTag) {
                    const weight = (c.tags.includes('crimp') || c.tags.includes('board')) ? 1.25 : 0.85;
                    sessionCrimpLoad += (c.tries || 1) * weight;
                    (c.tags || []).forEach(t => {
                        if (t === 'crimp' || t === 'board' || t === 'powerful') heavyTagsFound.add(t);
                    });
                }
            });

            if (sessionCrimpLoad >= 3) {
                lastHeavySessionTime = s.timestamp || (now - 24 * 60 * 60 * 1000);
                heavyLoadScore = sessionCrimpLoad;
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
        // Scale target remodeling window between 48h (moderate) and 64h (heavy board/crimp session)
        const recoveryTargetHours = heavyLoadScore >= 8 ? 64 : 48;
        const recoveryPct = Math.min(100, Math.round((hoursElapsed / recoveryTargetHours) * 100));
        const hoursLeft = Math.max(0, recoveryTargetHours - hoursElapsed);

        let status = '100% Ready';
        let color = 'emerald';
        let advice = 'Tendon collagen fully remodeled.';

        if (recoveryPct < 55) {
            status = `Rebuilding (${hoursLeft}h left)`;
            color = 'red';
            advice = 'High pulley/tendon strain. Avoid crimps and board sessions today.';
        } else if (recoveryPct < 100) {
            status = `Recovering (${hoursLeft}h left)`;
            color = 'amber';
            advice = 'Tendon remodeling underway. Sub-maximal climbing or open-hand recommended.';
        }

        return { recoveryPct, hoursElapsed, status, color, heavyTags: Array.from(heavyTagsFound), advice };
    }

    // ------------------------------------------------------------------------
    // 4. STYLE AFFINITY & WEAKNESS PROFILER (New)
    // ------------------------------------------------------------------------
    function computeStyleProfile(history = [], maxGradeIdx = 7) {
        const stats = {};
        ALL_STYLES.forEach(style => {
            stats[style] = { attempts: 0, climbs: 0, sends: 0, flashes: 0, nearMaxSends: 0, score: 0.5 };
        });

        const recentSessions = (history || []).slice(-20);
        recentSessions.forEach(s => {
            (s.climbs || []).forEach(c => {
                const gIdx = GRADES.indexOf(c.gradeStr);
                const sent = isSend(c);
                const flashed = isFlash(c);
                const tries = Math.max(1, parseInt(c.tries, 10) || 1);

                (c.tags || []).forEach(tag => {
                    if (!stats[tag]) return;
                    stats[tag].climbs += 1;
                    stats[tag].attempts += tries;
                    if (sent) stats[tag].sends += 1;
                    if (flashed) stats[tag].flashes += 1;
                    if (sent && gIdx >= maxGradeIdx - 1) stats[tag].nearMaxSends += 1;
                });
            });
        });

        ALL_STYLES.forEach(style => {
            const st = stats[style];
            if (st.climbs === 0) {
                st.score = 0.45; // Untested / under-climbed bias
            } else {
                const sendRate = st.sends / st.climbs;
                const flashRate = st.flashes / st.climbs;
                const maxBonus = Math.min(0.25, st.nearMaxSends * 0.06);
                st.score = Math.min(1.0, (sendRate * 0.55) + (flashRate * 0.25) + maxBonus);
            }
        });

        const sortedByScore = [...ALL_STYLES].sort((a, b) => stats[b].score - stats[a].score);
        const strongStyles = sortedByScore.slice(0, 3);
        const weakStyles = [...ALL_STYLES]
            .sort((a, b) => (stats[a].score + stats[a].climbs * 0.02) - (stats[b].score + stats[b].climbs * 0.02))
            .slice(0, 3);

        return { stats, strongStyles, weakStyles };
    }

    // ------------------------------------------------------------------------
    // 5. GRADE BREAKTHROUGH READINESS MODEL
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

        const maxSends = atMaxClimbs.filter(isSend);
        const subMaxSends = atSubMaxClimbs.filter(isSend);
        const subMaxFlashes = atSubMaxClimbs.filter(isFlash);

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
        const allocatedTime = Number(checkin.time) || 90;

        const warmupEntryIdx = Math.max(0, maxGradeIdx - 6);
        const warmupMidIdx = Math.max(0, maxGradeIdx - 4);
        const warmupPeakIdx = Math.max(0, maxGradeIdx - 3);
        const cnsPrimeIdx = Math.max(0, maxGradeIdx - 2);
        const projectTargetIdx = gradeReadiness.readyForBreakthrough ? Math.min(GRADES.length - 1, maxGradeIdx + 1) : maxGradeIdx;
        const volumeCircuitIdx = Math.max(0, maxGradeIdx - 3);
        const coolDownIdx = Math.max(0, maxGradeIdx - 8);

        const warmupEntryStr = GRADES[warmupEntryIdx];
        const warmupMidStr = GRADES[warmupMidIdx];
        const warmupPeakStr = GRADES[warmupPeakIdx];
        const cnsPrimeStr = GRADES[cnsPrimeIdx];
        const volumeCircuitStr = GRADES[volumeCircuitIdx];
        const projectTargetStr = GRADES[projectTargetIdx];
        const coolDownStr = GRADES[coolDownIdx];

        let baseReadiness = 85;
        if (workload.statusCategory === 'high_risk') baseReadiness = 30;
        else if (workload.statusCategory === 'elevated') baseReadiness = 55;
        else if (workload.statusCategory === 'undertrained') baseReadiness = 75;
        else baseReadiness = 90;

        if (tendon.recoveryPct < 50) baseReadiness -= 30;
        else if (tendon.recoveryPct < 100) baseReadiness -= 15;

        if (checkin.fingers === 'tweaky') baseReadiness = Math.min(baseReadiness, 40);
        else if (checkin.fingers === 'stiff') baseReadiness = Math.min(baseReadiness, 60);
        if (checkin.skin === 'split') baseReadiness -= 15;

        const compositeScore = Math.max(10, Math.min(99, baseReadiness));

        let mode = 'LIMIT';
        let title = '';
        let badgeColor = 'emerald';
        let rationale = '';
        let phases = [];
        let exitRule = '';
        let targetTags = [];
        let forbiddenTags = [];

        if (checkin.fingers === 'tweaky' || compositeScore < 45 || workload.statusCategory === 'high_risk') {
            mode = 'REST';
            badgeColor = 'red';
            rationale = checkin.fingers === 'tweaky'
                ? 'Tweaky fingers reported. Prioritize tendon health to prevent pulley injury.'
                : 'Acute fatigue spike detected. Climbing today risks acute injury with negative training yield.';

            if (allocatedTime <= 45) {
                title = '🛑 Express Antagonist Recovery (45m)';
                phases = [
                    {
                        name: 'Antagonist Care (20m)',
                        title: 'Antagonist Care',
                        type: 'workout',
                        desc: 'Reverse wrist curls, pushups, finger extensor bands (3x15).',
                        durationMinutes: 20,
                        restSeconds: 60,
                        targetGradeIdx: null,
                        targetGradeStr: null,
                        targetTags: [],
                        exercises: EXERCISES_ANTAGONIST
                    },
                    {
                        name: 'Mobility & Hips (25m)',
                        title: 'Mobility & Hips',
                        type: 'workout',
                        desc: 'Hip openers, thoracic spine rotations, shoulder dislocates.',
                        durationMinutes: 25,
                        restSeconds: 45,
                        targetGradeIdx: null,
                        targetGradeStr: null,
                        targetTags: [],
                        exercises: EXERCISES_MOBILITY
                    }
                ];
            } else if (allocatedTime >= 120) {
                title = '🛑 Deep Recovery & Structural Care (2h)';
                phases = [
                    {
                        name: 'Antagonist & Push (30m)',
                        title: 'Antagonist & Push',
                        type: 'workout',
                        desc: 'Reverse wrist curls, pushups, ring dips, extensor bands (4x15).',
                        durationMinutes: 30,
                        restSeconds: 60,
                        targetGradeIdx: null,
                        targetGradeStr: null,
                        targetTags: [],
                        exercises: EXERCISES_ANTAGONIST
                    },
                    {
                        name: 'Deep Myofascial & Mobility (45m)',
                        title: 'Deep Myofascial & Mobility',
                        type: 'workout',
                        desc: 'Foam rolling, hip capsule openers, thoracic rotation, shoulder mobility.',
                        durationMinutes: 45,
                        restSeconds: 45,
                        targetGradeIdx: null,
                        targetGradeStr: null,
                        targetTags: [],
                        exercises: EXERCISES_MOBILITY
                    },
                    {
                        name: 'Core & Scapular Stability (45m)',
                        title: 'Core & Scapular Stability',
                        type: 'workout',
                        desc: 'Planks, hollow holds, serratus slides, bird-dogs.',
                        durationMinutes: 45,
                        restSeconds: 45,
                        targetGradeIdx: null,
                        targetGradeStr: null,
                        targetTags: [],
                        exercises: EXERCISES_CORE
                    }
                ];
            } else {
                title = '🛑 Rest & Antagonist Recovery (90m)';
                phases = [
                    {
                        name: 'Zero Climbing',
                        title: 'Rest & Recover',
                        type: 'info',
                        desc: 'No hanging or climbing. Allow tendon collagen to rebuild.',
                        durationMinutes: 0,
                        restSeconds: 0,
                        targetGradeIdx: null,
                        targetGradeStr: null,
                        targetTags: []
                    },
                    {
                        name: 'Antagonist Care (25m)',
                        title: 'Antagonist Care',
                        type: 'workout',
                        desc: 'Reverse wrist curls, pushups, finger extensor bands (3x15).',
                        durationMinutes: 25,
                        restSeconds: 60,
                        targetGradeIdx: null,
                        targetGradeStr: null,
                        targetTags: [],
                        exercises: EXERCISES_ANTAGONIST
                    },
                    {
                        name: 'Deep Mobility & Tissue Work (35m)',
                        title: 'Deep Mobility & Tissue Work',
                        type: 'workout',
                        desc: 'Hip openers, thoracic spine rotations, shoulder dislocates.',
                        durationMinutes: 35,
                        restSeconds: 45,
                        targetGradeIdx: null,
                        targetGradeStr: null,
                        targetTags: [],
                        exercises: EXERCISES_MOBILITY
                    },
                    {
                        name: 'Core & Stability (30m)',
                        title: 'Core & Stability',
                        type: 'workout',
                        desc: 'Hollow holds, side planks, bird-dogs.',
                        durationMinutes: 30,
                        restSeconds: 45,
                        targetGradeIdx: null,
                        targetGradeStr: null,
                        targetTags: [],
                        exercises: EXERCISES_CORE
                    }
                ];
            }
            exitRule = 'Rest day complete. Stay hydrated and get 8h sleep.';
        } else if (compositeScore < 65 || tendon.recoveryPct < 80) {
            mode = 'VOLUME';
            badgeColor = 'amber';
            rationale = checkin.fingers === 'stiff'
                ? 'Stiff fingers reported. Protecting pulleys with open-hand volume, slopers, and movement flow.'
                : tendon.recoveryPct < 80
                ? `Tendons still remodeling from recent ${tendon.heavyTags.join('/')} loading (${tendon.hoursElapsed}h elapsed). Protect pulleys with open-hand & compression.`
                : 'Elevated acute load. Build base endurance and movement flow without testing limits.';
            targetTags = ['slab', 'sloper', 'technical', 'pinch'];
            forbiddenTags = ['crimp', 'board'];

            if (allocatedTime <= 45) {
                title = '⚡ Express Volume & Density (45m)';
                phases = [
                    {
                        name: 'Movement Warmup (10m)',
                        title: 'Movement Warmup',
                        type: 'climb',
                        desc: `Build easily from ${warmupEntryStr} to ${warmupMidStr}. Focus on silent feet and precision.`,
                        durationMinutes: 10,
                        restSeconds: 60,
                        targetGradeIdx: warmupEntryIdx,
                        targetGradeStr: warmupEntryStr,
                        targetTags: ['slab', 'sloper']
                    },
                    {
                        name: 'Density Volume Ladder (30m)',
                        title: 'Density Volume Ladder',
                        type: 'climb',
                        desc: `Complete 6–8 boulders strictly between ${warmupMidStr} and ${volumeCircuitStr} with 90s rest.`,
                        durationMinutes: 30,
                        restSeconds: 90,
                        targetGradeIdx: volumeCircuitIdx,
                        targetGradeStr: volumeCircuitStr,
                        targetTags: ['sloper', 'pinch', 'technical']
                    },
                    {
                        name: 'Cool Down (5m)',
                        title: 'Cool Down',
                        type: 'climb',
                        desc: `2 easy movement slabs at ${coolDownStr} or below.`,
                        durationMinutes: 5,
                        restSeconds: 60,
                        targetGradeIdx: coolDownIdx,
                        targetGradeStr: coolDownStr,
                        targetTags: ['slab']
                    }
                ];
            } else if (allocatedTime >= 120) {
                title = '🧗 Extended Two-Block Volume Mastery (2h)';
                phases = [
                    {
                        name: 'Movement Warmup (20m)',
                        title: 'Movement Warmup',
                        type: 'climb',
                        desc: `Build gradually from ${warmupEntryStr} to ${warmupMidStr}. Focus on silent feet and precision.`,
                        durationMinutes: 20,
                        restSeconds: 60,
                        targetGradeIdx: warmupEntryIdx,
                        targetGradeStr: warmupEntryStr,
                        targetTags: ['slab', 'sloper']
                    },
                    {
                        name: 'Block 1: Volume Circuit (45m)',
                        title: 'Volume Circuit (Block 1)',
                        type: 'climb',
                        desc: `8–10 boulders strictly between ${warmupMidStr} and ${volumeCircuitStr}. Rest 2 min between sends.`,
                        durationMinutes: 45,
                        restSeconds: 120,
                        targetGradeIdx: volumeCircuitIdx,
                        targetGradeStr: volumeCircuitStr,
                        targetTags: ['sloper', 'pinch', 'technical']
                    },
                    {
                        name: 'Mid-Session System Flush (10m)',
                        title: 'Mid-Session System Flush',
                        type: 'info',
                        desc: 'Active walk, rehydrate, and shake out forearm tissues. Zero climbing.',
                        durationMinutes: 10,
                        restSeconds: 0,
                        targetGradeIdx: null,
                        targetGradeStr: null,
                        targetTags: []
                    },
                    {
                        name: 'Block 2: Technical Precision (35m)',
                        title: 'Technical Flow (Block 2)',
                        type: 'climb',
                        desc: `6–8 boulders on slabs and slopers at ${warmupMidStr} with silent feet and zero re-gripping.`,
                        durationMinutes: 35,
                        restSeconds: 90,
                        targetGradeIdx: warmupMidIdx,
                        targetGradeStr: warmupMidStr,
                        targetTags: ['slab', 'technical']
                    },
                    {
                        name: 'Cool Down & Antagonists (10m)',
                        title: 'Cool Down & Antagonists',
                        type: 'workout',
                        desc: `2 easy slabs at ${coolDownStr} plus light pushups and extensor bands.`,
                        durationMinutes: 10,
                        restSeconds: 60,
                        targetGradeIdx: coolDownIdx,
                        targetGradeStr: coolDownStr,
                        targetTags: ['slab', 'sloper'],
                        exercises: EXERCISES_ANTAGONIST.slice(0, 2)
                    }
                ];
            } else {
                title = '🧗 Sub-Max Volume & Capacity (90m)';
                phases = [
                    {
                        name: 'Movement Warmup (20m)',
                        title: 'Movement Warmup',
                        type: 'climb',
                        desc: `Build gradually from ${warmupEntryStr} to ${warmupMidStr}. Focus on silent feet and precision.`,
                        durationMinutes: 20,
                        restSeconds: 60,
                        targetGradeIdx: warmupEntryIdx,
                        targetGradeStr: warmupEntryStr,
                        targetTags: ['slab', 'sloper']
                    },
                    {
                        name: 'Volume Circuit (50m)',
                        title: 'Volume Circuit',
                        type: 'climb',
                        desc: `Complete 10–14 boulders strictly between ${warmupMidStr} and ${volumeCircuitStr}. Rest 2 min between sends.`,
                        durationMinutes: 50,
                        restSeconds: 120,
                        targetGradeIdx: volumeCircuitIdx,
                        targetGradeStr: volumeCircuitStr,
                        targetTags: ['sloper', 'pinch', 'technical']
                    },
                    {
                        name: 'Technical Drill (15m)',
                        title: 'Technical Drill',
                        type: 'climb',
                        desc: `Practice 3 slab or dynamic balance boulders at ${warmupMidStr} with zero re-gripping.`,
                        durationMinutes: 15,
                        restSeconds: 90,
                        targetGradeIdx: warmupMidIdx,
                        targetGradeStr: warmupMidStr,
                        targetTags: ['slab', 'technical']
                    },
                    {
                        name: 'Cool Down (5m)',
                        title: 'Cool Down',
                        type: 'climb',
                        desc: `2 easy slabs at ${coolDownStr} or below.`,
                        durationMinutes: 5,
                        restSeconds: 60,
                        targetGradeIdx: coolDownIdx,
                        targetGradeStr: coolDownStr,
                        targetTags: ['slab']
                    }
                ];
            }
            exitRule = 'End session as soon as pump outlasts 2 minutes or form degrades.';
        } else {
            mode = 'LIMIT';
            badgeColor = 'emerald';
            rationale = `Fresh condition (ACWR ${workload.acwr}) and fully recovered tendons. Ideal window for maximum recruitment and neurological adaptation.`;
            targetTags = ['crimp', 'board', 'powerful', 'technical'];

            if (allocatedTime <= 45) {
                title = `⚡ Express Limit Session (${projectTargetStr}) - 45m`;
                phases = [
                    {
                        name: 'Warmup Pyramid (12m)',
                        title: 'Warmup Pyramid',
                        type: 'climb',
                        desc: `1x ${warmupEntryStr}, 1x ${warmupMidStr}, 1x ${warmupPeakStr}. Crisp movement with 75s rest.`,
                        durationMinutes: 12,
                        restSeconds: 75,
                        targetGradeIdx: warmupEntryIdx,
                        targetGradeStr: warmupEntryStr,
                        targetTags: ['slab', 'sloper']
                    },
                    {
                        name: 'CNS Priming (5m)',
                        title: 'CNS Priming',
                        type: 'climb',
                        desc: `1 single crisp flash attempt on ${cnsPrimeStr} to potentiate recruitment.`,
                        durationMinutes: 5,
                        restSeconds: 90,
                        targetGradeIdx: cnsPrimeIdx,
                        targetGradeStr: cnsPrimeStr,
                        targetTags: ['powerful', 'crimp']
                    },
                    {
                        name: 'Laser Project Phase (23m)',
                        title: 'Laser Project Phase',
                        type: 'climb',
                        desc: `Work 1 specific project at ${projectTargetStr}. Exactly 4 high-quality burns with 3.5m rest.`,
                        durationMinutes: 23,
                        restSeconds: 210,
                        targetGradeIdx: projectTargetIdx,
                        targetGradeStr: projectTargetStr,
                        targetTags: ['crimp', 'board', 'powerful']
                    },
                    {
                        name: 'Cool Down (5m)',
                        title: 'Cool Down',
                        type: 'climb',
                        desc: `Easy slab at ${coolDownStr} or below and antagonist stretching.`,
                        durationMinutes: 5,
                        restSeconds: 60,
                        targetGradeIdx: coolDownIdx,
                        targetGradeStr: coolDownStr,
                        targetTags: ['slab']
                    }
                ];
            } else if (allocatedTime >= 120) {
                title = `🚀 Extended 2h Limit Projecting (${projectTargetStr})`;
                phases = [
                    {
                        name: 'Comprehensive Warmup (25m)',
                        title: 'Comprehensive Warmup',
                        type: 'climb',
                        desc: `1x ${warmupEntryStr}, 2x ${warmupMidStr}, 1x ${warmupPeakStr}. Full 3m rest after last warmup.`,
                        durationMinutes: 25,
                        restSeconds: 90,
                        targetGradeIdx: warmupEntryIdx,
                        targetGradeStr: warmupEntryStr,
                        targetTags: ['slab', 'sloper']
                    },
                    {
                        name: 'CNS Priming & Potentiation (15m)',
                        title: 'CNS Priming & Potentiation',
                        type: 'climb',
                        desc: `2 single-burn high-tension attempts on ${cnsPrimeStr} with 2.5m rest.`,
                        durationMinutes: 15,
                        restSeconds: 150,
                        targetGradeIdx: cnsPrimeIdx,
                        targetGradeStr: cnsPrimeStr,
                        targetTags: ['powerful', 'crimp']
                    },
                    {
                        name: 'Primary Limit Project (40m)',
                        title: 'Primary Limit Project',
                        type: 'climb',
                        desc: `4–5 max-effort burns on your main project at ${projectTargetStr}. Strict 4.5m ATP-CP recovery rest between burns.`,
                        durationMinutes: 40,
                        restSeconds: 270,
                        targetGradeIdx: projectTargetIdx,
                        targetGradeStr: projectTargetStr,
                        targetTags: ['crimp', 'board', 'powerful']
                    },
                    {
                        name: 'Secondary Style Project (30m)',
                        title: 'Secondary Style Project',
                        type: 'climb',
                        desc: `3–4 burns on a contrasting problem style at ${cnsPrimeStr} or ${projectTargetStr}. 4m rest between burns.`,
                        durationMinutes: 30,
                        restSeconds: 240,
                        targetGradeIdx: cnsPrimeIdx,
                        targetGradeStr: cnsPrimeStr,
                        targetTags: ['sloper', 'pinch', 'technical']
                    },
                    {
                        name: 'Structural Care & Cooldown (10m)',
                        title: 'Structural Care & Cooldown',
                        type: 'workout',
                        desc: `2 recovery slabs at ${coolDownStr} plus pushups and extensor bands.`,
                        durationMinutes: 10,
                        restSeconds: 60,
                        targetGradeIdx: coolDownIdx,
                        targetGradeStr: coolDownStr,
                        targetTags: ['slab', 'sloper'],
                        exercises: EXERCISES_ANTAGONIST.slice(0, 2)
                    }
                ];
            } else {
                title = `🚀 Limit Projecting Day (${projectTargetStr}) - 90m`;
                phases = [
                    {
                        name: 'Warmup Pyramid (25m)',
                        title: 'Warmup Pyramid',
                        type: 'climb',
                        desc: `1x ${warmupEntryStr}, 2x ${warmupMidStr}, 1x ${warmupPeakStr}. Full 3m rest after last warmup.`,
                        durationMinutes: 25,
                        restSeconds: 90,
                        targetGradeIdx: warmupEntryIdx,
                        targetGradeStr: warmupEntryStr,
                        targetTags: ['slab', 'sloper']
                    },
                    {
                        name: 'CNS Priming (10m)',
                        title: 'CNS Priming',
                        type: 'climb',
                        desc: `1 high-effort flash attempt on ${cnsPrimeStr} to activate recruitment.`,
                        durationMinutes: 10,
                        restSeconds: 120,
                        targetGradeIdx: cnsPrimeIdx,
                        targetGradeStr: cnsPrimeStr,
                        targetTags: ['powerful', 'crimp']
                    },
                    {
                        name: 'Limit Project Phase (45m)',
                        title: 'Limit Project Phase',
                        type: 'climb',
                        desc: `Work 1-2 projects at ${projectTargetStr}. Take 4 minutes full rest between burns. Max 5 burns total.`,
                        durationMinutes: 45,
                        restSeconds: 240,
                        targetGradeIdx: projectTargetIdx,
                        targetGradeStr: projectTargetStr,
                        targetTags: ['crimp', 'board', 'powerful']
                    },
                    {
                        name: 'Cool Down & Antagonists (10m)',
                        title: 'Cool Down & Antagonists',
                        type: 'workout',
                        desc: `2 very easy slabs at ${coolDownStr} or below and light antagonist stretching.`,
                        durationMinutes: 10,
                        restSeconds: 60,
                        targetGradeIdx: coolDownIdx,
                        targetGradeStr: coolDownStr,
                        targetTags: ['slab', 'sloper'],
                        exercises: EXERCISES_ANTAGONIST.slice(0, 2)
                    }
                ];
            }
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

    function resolveMaxGradeIdx(history) {
        const stored = localStorage.getItem('boulderMaxGradeIndex');
        let highestSendIdx = -1;
        if (Array.isArray(history)) {
            for (const session of history) {
                if (!session || !Array.isArray(session.climbs)) continue;
                for (const climb of session.climbs) {
                    if (isSend(climb)) {
                        const idx = GRADES.indexOf(climb.gradeStr);
                        if (idx > highestSendIdx) {
                            highestSendIdx = idx;
                        }
                    }
                }
            }
        }

        if (stored !== null && stored !== undefined && stored !== '') {
            const parsed = parseInt(stored, 10);
            if (!isNaN(parsed) && parsed >= 0 && parsed < GRADES.length) {
                if (parsed === 14 && highestSendIdx >= 0 && highestSendIdx < 14) {
                    return highestSendIdx;
                }
                return parsed;
            }
        }

        if (highestSendIdx >= 0) {
            return highestSendIdx;
        }

        return 7; // Default 6B
    }

    function getTodayPlan() {
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem('boulderHistory')) || [];
        } catch (e) {
            history = [];
        }
        const maxGradeIdx = resolveMaxGradeIdx(history);
        return generateDailyPlan(history, maxGradeIdx);
    }

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

    // ------------------------------------------------------------------------
    // 6. INTRA-SESSION DYNAMIC ADAPTATION ENGINE
    // ------------------------------------------------------------------------
    function evaluateIntraSessionAdaptation(chronologicalClimbs = [], maxGradeIdx = 7, checkin = { fingers: 'fresh', skin: 'good', time: 90 }) {
        if (!chronologicalClimbs || chronologicalClimbs.length === 0) {
            return { gradeDelta: 0, mode: 'standard', reason: null };
        }

        // Check for hot streak: flashed max-1 or sent max in <= 2 tries recently
        const recent = chronologicalClimbs.slice(-3);
        const flashedSubMax = recent.some(c => GRADES.indexOf(c.gradeStr) >= (maxGradeIdx - 1) && isFlash(c));
        const quickMaxSend = recent.some(c => GRADES.indexOf(c.gradeStr) >= maxGradeIdx && isSend(c) && (c.tries || 1) <= 2);

        if ((flashedSubMax || quickMaxSend) && checkin.fingers === 'fresh' && checkin.skin !== 'split') {
            return {
                gradeDelta: 1,
                mode: 'hot_streak',
                reason: 'High neural recruitment detected from clean sends. Stepping target intensity up.'
            };
        }

        // Check for volume flash-pump: multiple tries on sub-max boulders without sending
        const subMaxStruggles = recent.filter(c => {
            const gIdx = GRADES.indexOf(c.gradeStr);
            return gIdx <= (maxGradeIdx - 1) && gIdx >= (maxGradeIdx - 2) && !isSend(c) && (c.tries || 1) >= 3;
        });

        if (subMaxStruggles.length >= 2) {
            return {
                gradeDelta: -1,
                mode: 'flash_pump',
                reason: 'Sub-maximal attempt efficiency dropping. Shifting to technical consolidation.'
            };
        }

        return { gradeDelta: 0, mode: 'standard', reason: null };
    }

    // ------------------------------------------------------------------------
    // 7. LIVE IN-SESSION CLIMB RECOMMENDATION ENGINE (Upgraded)
    // ------------------------------------------------------------------------
    function recommendNextClimb(sessionClimbs = [], maxGradeIdx = 7, elapsedMinutes = 0, altIndex = 0, optionalHistory = null) {
        const climbs = normalizeChronological(sessionClimbs);
        const climbCount = climbs.length;
        const totalTries = climbs.reduce((acc, c) => acc + (parseInt(c.tries, 10) || 1), 0);

        const checkin = loadCheckin();
        const history = Array.isArray(optionalHistory) ? optionalHistory : getStoredHistory();
        const tendon = computeTendonRecovery(history, maxGradeIdx);
        const workload = computeWorkloadMetrics(history, maxGradeIdx);
        const readiness = computeGradeReadiness(history, maxGradeIdx);
        const styleProfile = computeStyleProfile(history, maxGradeIdx);
        const adaptation = evaluateIntraSessionAdaptation(climbs, maxGradeIdx, checkin);

        // Deterministic seed that changes every time a climb or burn is logged, or altIndex changes
        const daySeed = Math.floor(Date.now() / (1000 * 60 * 60 * 12));
        const rotationSeed = climbCount * 7 + totalTries * 3 + altIndex * 11 + daySeed;

        // Gather recently used tags (last 2 climbs) to prevent repetitive style recommendations
        const recentTags = new Set(climbs.slice(-2).flatMap(c => c.tags || []));

        // Determine banned tags from finger/tendon/skin state
        const bannedTags = new Set();
        const protectPulleys = (
            checkin.fingers === 'tweaky' ||
            tendon.recoveryPct < 60 ||
            workload.statusCategory === 'high_risk'
        );
        if (protectPulleys) {
            bannedTags.add('crimp');
            bannedTags.add('board');
        } else if (checkin.fingers === 'stiff' || tendon.recoveryPct < 85) {
            bannedTags.add('board');
        }
        if (checkin.skin === 'split') {
            bannedTags.add('crimp');
            bannedTags.add('dyno');
        }

        // Helper to pick a diverse pair of tags tailored to the current phase
        function selectStylePair(candidatePool, preferWeakness = false) {
            const valid = candidatePool.filter(t => !bannedTags.has(t));
            const pool = valid.length >= 2 ? valid : ALL_STYLES.filter(t => !bannedTags.has(t));

            const scored = pool.map((tag, idx) => {
                let score = 1.0;
                if (recentTags.has(tag)) score -= 0.45; // Rotate away from last 2 climbs
                const profScore = styleProfile.stats[tag] ? styleProfile.stats[tag].score : 0.5;
                score += preferWeakness ? (1.0 - profScore) * 0.4 : profScore * 0.4;
                const jitter = ((rotationSeed + idx * 17) % 10) * 0.045;
                return { tag, total: score + jitter };
            }).sort((a, b) => b.total - a.total);

            if (scored.length === 0) return ['technical', 'slab'];
            if (scored.length === 1) return [scored[0].tag];
            return [scored[0].tag, scored[1].tag];
        }

        // Dynamic session cutoff thresholds scaled by check-in time (45, 90, 120m)
        const timeLimit = Math.round((checkin.time || 90) * 0.82);
        const burnLimit = checkin.time === 45 ? 14 : checkin.time === 120 ? 26 : 20;

        // 1. Cooldown Check (Dynamic time or burn cap reached)
        if (elapsedMinutes >= timeLimit || totalTries >= burnLimit) {
            const coolTags = selectStylePair(['slab', 'technical', 'sloper'], true);
            const targetIdx = Math.max(0, maxGradeIdx - 3);
            return {
                stage: 'cooldown',
                category: 'Cool-Down',
                targetGradeStr: GRADES[targetIdx],
                targetGradeIdx: targetIdx,
                targetTags: coolTags,
                title: 'Cool-Down Flow',
                advice: `Session cap reached (${elapsedMinutes}m / ${totalTries} burns). Flush forearm metabolites with relaxed open-hand flow.`,
                icon: '🧘'
            };
        }

        // 2. High Strain Warning: Check the LAST 2–3 climbs for consecutive crimp/board loading
        let recentHighStrainCount = 0;
        let recentHighStrainTries = 0;
        for (let i = climbs.length - 1; i >= Math.max(0, climbs.length - 3); i--) {
            const c = climbs[i];
            if (c.tags && c.tags.some(t => t === 'crimp' || t === 'board')) {
                recentHighStrainCount++;
                recentHighStrainTries += (parseInt(c.tries, 10) || 1);
            } else {
                break; // Resets as soon as user logs a non-crimp/board climb!
            }
        }

        if (recentHighStrainCount >= 3 || (recentHighStrainCount >= 2 && recentHighStrainTries >= 6)) {
            const targetIdx = Math.max(0, maxGradeIdx - 1);
            return {
                stage: 'strain_pivot',
                category: 'Pulley Reset',
                targetGradeStr: GRADES[targetIdx],
                targetGradeIdx: targetIdx,
                targetTags: selectStylePair(['sloper', 'pinch', 'technical', 'slab'], true),
                title: 'Pulley Deload Pivot',
                advice: `${recentHighStrainTries} high-strain crimp/board burns logged back-to-back. Pivot to open-hand or compression for 1–2 climbs.`,
                icon: '🛡️'
            };
        }

        // 3. Non-Sticky Rule of 3: Trigger ONLY if the most recent climb (or last 2) was a stalled project
        const lastClimb = climbs[climbs.length - 1];
        const prevClimb = climbs[climbs.length - 2];
        const isStalledBurn = (c) => c && !isSend(c) && (parseInt(c.tries, 10) || 1) >= 4 && (!c.completionPct || c.completionPct < 75);
        const consecutiveProjectFails = climbs.slice(-3).length === 3 && climbs.slice(-3).every(c => !isSend(c) && GRADES.indexOf(c.gradeStr) >= maxGradeIdx - 1);

        if (isStalledBurn(lastClimb) || (isStalledBurn(prevClimb) && !isSend(lastClimb) && GRADES.indexOf(lastClimb.gradeStr) >= maxGradeIdx - 1) || consecutiveProjectFails) {
            const targetIdx = Math.max(0, maxGradeIdx - 2);
            const burnsLogged = lastClimb ? (lastClimb.tries || 3) : 4;
            return {
                stage: 'rule_of_3',
                category: 'Power Reset',
                targetGradeStr: GRADES[targetIdx],
                targetGradeIdx: targetIdx,
                targetTags: selectStylePair(['sloper', 'technical', 'slab'], true),
                title: 'Rule of 3: Neural Reset',
                advice: `${burnsLogged}+ heavy attempts without a send. Take 4m rest and log 1 sub-maximal flow boulder to clear the alert.`,
                icon: '⏱️'
            };
        }

        // 4. Progressive Warm-up Phase (Checks actual grades climbed, not just climbCount < 2)
        const highestGradeClimbed = climbs.reduce((maxG, c) => Math.max(maxG, GRADES.indexOf(c.gradeStr)), -1);
        const warmupTargetFloor = Math.max(0, maxGradeIdx - 2);

        if (climbCount < 2 || highestGradeClimbed < Math.max(0, maxGradeIdx - 3)) {
            const stepOffset = climbCount === 0 ? 3 : 2;
            const targetIdx = Math.max(0, maxGradeIdx - stepOffset);
            const warmTags = selectStylePair(['slab', 'technical', 'sloper'], true);
            return {
                stage: 'warmup',
                category: 'Warmup',
                targetGradeStr: GRADES[targetIdx],
                targetGradeIdx: targetIdx,
                targetTags: warmTags,
                title: climbCount === 0 ? 'Warmup: Synovial Flow' : 'Warmup: Progressive Recruitment',
                advice: 'Elevate tendon temperature and hip mobility with deliberate, quiet footwork before pulling hard.',
                icon: '🌱'
            };
        }

        // 5. Pyramid Ramp (Ensures climber has touched at least maxGradeIdx - 1 or 2 ramp climbs before peak projecting)
        const hasRampedNearMax = climbs.some(c => GRADES.indexOf(c.gradeStr) >= (maxGradeIdx - 1));
        if (climbCount < 4 && !hasRampedNearMax) {
            const targetIdx = Math.max(0, maxGradeIdx - 1);
            const rampTags = selectStylePair(['sloper', 'powerful', 'pinch', 'technical', 'dyno'], false);
            return {
                stage: 'pyramid',
                category: 'Pyramid Ramp',
                targetGradeStr: GRADES[targetIdx],
                targetGradeIdx: targetIdx,
                targetTags: rampTags,
                title: 'Potentiation Ramp',
                advice: `Flash or 2nd-go target at ${GRADES[targetIdx]}. Move fast through the crux to prime high-threshold motor units.`,
                icon: '⚡'
            };
        }

        // 6. Autoregulated Main Session Phase (Adapts to Readiness, Check-in, Hot Streaks, and Weaknesses)
        // 6A: Recovery / Elevated Fatigue / Tweaky Fingers -> Volume Consolidation & Weakness Targeting
        if (protectPulleys || workload.statusCategory === 'elevated' || adaptation.mode === 'flash_pump') {
            const offset = (protectPulleys || adaptation.mode === 'flash_pump') ? 2 : 1;
            const targetIdx = Math.max(0, maxGradeIdx - offset);
            const weakTags = selectStylePair(styleProfile.weakStyles.concat(['sloper', 'technical', 'pinch', 'slab']), true);
            return {
                stage: 'volume_consolidation',
                category: 'Volume & Technique',
                targetGradeStr: GRADES[targetIdx],
                targetGradeIdx: targetIdx,
                targetTags: weakTags,
                title: protectPulleys ? 'Tendon-Safe Technical Volume' : 'Pyramid Base Consolidation',
                advice: `${adaptation.reason || tendon.advice} Focus on 1st/2nd-go execution in your less-climbed styles (${weakTags.join(' + ')}).`,
                icon: '📐'
            };
        }

        // 6B: Breakthrough Push (Unlocked when Grade Readiness >= 75% OR Intra-Session Hot Streak)
        if ((readiness.readyForBreakthrough || adaptation.mode === 'hot_streak') && climbCount <= 7 && totalTries <= 14) {
            const targetIdx = Math.min(GRADES.length - 1, maxGradeIdx + 1);
            const strongTags = selectStylePair(styleProfile.strongStyles.concat(['powerful', 'crimp', 'sloper']), false);
            return {
                stage: 'breakthrough',
                category: 'Breakthrough Project',
                targetGradeStr: GRADES[targetIdx],
                targetGradeIdx: targetIdx,
                targetTags: strongTags,
                title: `Breakthrough Window (${GRADES[targetIdx]})`,
                advice: `${adaptation.reason || readiness.verdict} Pick a ${strongTags.join('/')} line that suits your strengths and give 3–5 min rest per burn.`,
                icon: '🚀'
            };
        }

        // 6C: Alternate between Peak Project (Strengths) and Sub-Max Weakness Builder every few climbs
        const isWeaknessSlot = ((climbCount + altIndex) % 3 === 1);
        if (isWeaknessSlot) {
            const targetIdx = Math.max(0, maxGradeIdx - 1);
            const weakTags = selectStylePair(styleProfile.weakStyles, true);
            return {
                stage: 'weakness_target',
                category: 'Style Expansion',
                targetGradeStr: GRADES[targetIdx],
                targetGradeIdx: targetIdx,
                targetTags: weakTags,
                title: `Anti-Style Drill (${weakTags[0] || 'technical'})`,
                advice: `Your historical send rate on ${weakTags.join('/')} is lower than your peak styles. Aim for a clean send within 2 tries.`,
                icon: '🧭'
            };
        }

        // 6D: Standard Peak Project Window
        const targetIdx = Math.min(GRADES.length - 1, Math.max(0, maxGradeIdx + adaptation.gradeDelta));
        const projTags = selectStylePair(['crimp', 'powerful', 'sloper', 'board', 'pinch', 'dyno'], false);
        return {
            stage: 'project',
            category: 'Peak Project',
            targetGradeStr: GRADES[targetIdx],
            targetGradeIdx: targetIdx,
            targetTags: projTags,
            title: 'Limit Project Window',
            advice: `Peak CNS window. Commit 100% on ${projTags.join(' + ')} movement with full 3–5 min ATP-CP recovery between attempts.`,
            icon: '🎯'
        };
    }

    // ------------------------------------------------------------------------
    // 8. LIVE INTRA-SESSION FATIGUE / CUTOFF EVALUATOR
    // ------------------------------------------------------------------------
    function evaluateLiveFatigue(activeClimbs, sessionElapsedSeconds) {
        const climbs = normalizeChronological(activeClimbs);
        if (!climbs || climbs.length < 3) {
            return { fatigueDetected: false, alertMessage: null };
        }

        // Check the 3 MOST RECENT climbs in chronological order
        const recentThree = climbs.slice(-3);
        const consecutiveProjectFails = recentThree.every(c => !isSend(c) && (c.statusText === 'Project' || (c.tries || 1) >= 3));

        if (consecutiveProjectFails) {
            return {
                fatigueDetected: true,
                severity: 'warning',
                alertMessage: '⚠️ Rule of 3 Triggered: 3 consecutive failed project blocks. Neuromuscular power has dropped—switch to sub-max flow or wrap up to protect pulleys.'
            };
        }

        const checkin = loadCheckin();
        const elapsedMinutes = Math.round((sessionElapsedSeconds || 0) / 60);
        const warnTime = Math.round((checkin.time || 90) * 0.85);

        if (elapsedMinutes >= warnTime) {
            const recentPointsPerTry = recentThree.reduce((sum, c) => sum + ((c.points || 0) / Math.max(1, c.tries || 1)), 0) / 3;

            if (recentPointsPerTry < 4.0 && elapsedMinutes >= (checkin.time || 90)) {
                return {
                    fatigueDetected: true,
                    severity: 'critical',
                    alertMessage: `🛑 Session Fatigue Warning: ${elapsedMinutes}m elapsed with dropping attempt efficiency. Further limit burns create junk volume and spike pulley injury risk.`
                };
            }
        }

        return { fatigueDetected: false, alertMessage: null };
    }

    return {
        GRADES,
        STYLE_STRESS,
        ALL_STYLES,
        WORKOUT_PRESETS,
        getWorkoutPresets: () => WORKOUT_PRESETS,
        getWorkoutPreset: (id) => WORKOUT_PRESETS.find(p => p.id === id),
        setCheckin,
        getCheckin,
        resolveMaxGradeIdx,
        calculateClimbLoad,
        calculateSessionLoad,
        computeWorkloadMetrics,
        computeTendonRecovery,
        computeStyleProfile,
        computeGradeReadiness,
        generateDailyPlan,
        getTodayPlan,
        evaluateIntraSessionAdaptation,
        recommendNextClimb,
        evaluateLiveFatigue,
        recordFeedback,
        normalizeChronological
    };
})();

// Sync Session Check-in and Coach Recommendation UI
function renderPlannerUI() {
    try {
        if (typeof renderSessionCheckinUI === 'function') {
            renderSessionCheckinUI();
        }
        if (typeof updateCoachRecommendation === 'function') {
            updateCoachRecommendation();
        }
    } catch (e) {
        console.error('renderPlannerUI sync error:', e);
    }
}

// User check-in handler from UI
function setPlannerCheckin(key, value) {
    if (typeof Planner !== 'undefined' && typeof Planner.setCheckin === 'function') {
        Planner.setCheckin(key, value);
    }
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
