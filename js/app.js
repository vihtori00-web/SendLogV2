        const APP_VERSION = 'v2.2.0';

        // =============================================
        // EARLY OAUTH REDIRECT INTERCEPTOR
        // Must run BEFORE anything else to catch tokens
        // from Google OAuth redirects immediately.
        // =============================================
        (function earlyOAuthIntercept() {
            try {
                const fullUrl = window.location.href || document.URL || '';
                const hashPart = (window.location.hash || '').replace(/^#\/?\??/, '');
                const searchPart = (window.location.search || '').substring(1);
                const combined = hashPart + '&' + searchPart;
                const params = new URLSearchParams(combined);
                const token = params.get('access_token');
                const expiresIn = params.get('expires_in');

                if (token) {
                    // Save token immediately to localStorage before anything can go wrong
                    localStorage.setItem('gdrive_access_token', token);
                    localStorage.setItem('gdrive_token_expires_at', String(Date.now() + (parseInt(expiresIn || '3600') * 1000)));
                    localStorage.setItem('gdrive_connected', 'true');
                    localStorage.setItem('gdrive_early_token', 'true');
                    localStorage.removeItem('gdrive_auth_pending');
                    // Clean URL immediately
                    window.history.replaceState(null, null, window.location.pathname);
                    console.log('[SendLog] Early OAuth intercept: token captured and saved.');
                }
            } catch (e) {
                console.error('[SendLog] Early OAuth intercept failed:', e);
            }
        })();

        const DOM = {
            sessionTimerStr: document.getElementById('sessionTimerDisplay'),
            sessionScoreStr: document.getElementById('sessionScoreDisplay'),
            sessionBtn: document.getElementById('btnSessionAction'),
            timerText: document.getElementById('btnTimerText'),
            timerPulse: document.getElementById('headerTimerPulse'),
            timerCard: document.getElementById('headerTimer'),
            overlayMain: document.getElementById('restOverlay'),
            overlayTime: document.getElementById('restOverlayTime'),
            overlayFinished: document.getElementById('restOverlayFinished')
        };

        function toggleSessionButtonUI(isActive) {
            const btn = document.getElementById('btnSessionAction');
            if (btn) {
                if (isActive) {
                    btn.innerHTML = '<span>⏹</span><span>FINISH SESSION</span>';
                    btn.className = 'w-full py-1.5 px-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1 active:scale-95 transition-all shadow-sm';
                } else {
                    btn.innerHTML = '<span>▶</span><span>START SESSION</span>';
                    btn.className = 'w-full py-1.5 px-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1 active:scale-95 transition-all shadow-sm';
                }
            }
            const mainAddLabel = document.getElementById('btnMainAddLabel');
            if (mainAddLabel) {
                mainAddLabel.innerText = isActive ? '+ Add Climb / Workout' : 'Start Session / Add Climb';
            }
            updateSessionMetrics();
        }

        function handleMainAddClick() {
            if (!sessionStartTime) {
                startSession();
            }
            openAddModal('climb');
        }
        window.handleMainAddClick = handleMainAddClick;

        function updateSessionMetrics() {
            const sendsEl = document.getElementById('sessionSendsCount');
            const burnsEl = document.getElementById('sessionBurnsCount');
            const loadEl = document.getElementById('sessionLoadDisplay');
            const statusDot = document.getElementById('sessionStatusDot');
            const statusText = document.getElementById('sessionStatusText');

            const totalBurns = (sessionClimbs || []).reduce((acc, c) => acc + (c.tries || 1), 0);
            const totalSends = (sessionClimbs || []).filter(c => c.isTop || c.isFlash || c.statusText === 'Top' || c.statusText === 'Flash' || c.completionPct === 100).length;

            if (sendsEl) sendsEl.innerText = totalSends;
            if (burnsEl) burnsEl.innerText = totalBurns;

            if (loadEl) {
                const load = (typeof Planner !== 'undefined' && typeof Planner.calculateSessionLoad === 'function')
                    ? Math.round(Planner.calculateSessionLoad({ climbs: sessionClimbs, workouts: sessionWorkouts }, maxGradeIndex))
                    : 0;
                loadEl.innerText = `${load} TL`;
            }

            if (statusDot && statusText) {
                if (sessionStartTime) {
                    statusDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping';
                    statusText.innerText = 'Live';
                    statusText.className = 'text-emerald-400 font-bold';
                } else {
                    statusDot.className = 'w-1.5 h-1.5 rounded-full bg-neutral-500';
                    statusText.innerText = 'Ready';
                    statusText.className = 'text-neutral-400 font-bold';
                }
            }
        }
        window.updateSessionMetrics = updateSessionMetrics;

        const fontGrades = [
            '<4', '4', '4+', '5', '5+', '6A', '6A+', '6B', '6B+',
            '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+',
            '8A', '8A+', '8B', '8B+', '8C', '8C+', '9A'
        ];

        function resolveMaxGradeIndex(history) {
            const stored = localStorage.getItem('boulderMaxGradeIndex');
            let highestSendIdx = -1;
            if (Array.isArray(history)) {
                for (const session of history) {
                    if (!session || !Array.isArray(session.climbs)) continue;
                    for (const climb of session.climbs) {
                        if (climb.statusText === 'Top' || climb.statusText === 'Flash' || climb.isTop || climb.isFlash) {
                            const idx = fontGrades.indexOf(climb.gradeStr);
                            if (idx > highestSendIdx) {
                                highestSendIdx = idx;
                            }
                        }
                    }
                }
            }

            if (stored !== null && stored !== undefined && stored !== '') {
                const parsed = parseInt(stored, 10);
                if (!isNaN(parsed) && parsed >= 0 && parsed < fontGrades.length) {
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

        function safeJsonParse(str, fallback) {
            if (!str) return fallback;
            try {
                return JSON.parse(str);
            } catch (e) {
                console.warn("safeJsonParse fallback used:", e);
                return fallback;
            }
        }

        let boulderHistory = safeJsonParse(localStorage.getItem('boulderHistory'), []);
        let maxGradeIndex = resolveMaxGradeIndex(boulderHistory);
        let currentGradeIndex = maxGradeIndex;
        let tries = 1;
        let burnsRecorded = 0;
        let isTop = false;
        let isFlash = false;
        let sessionScore = 0;
        let sessionClimbs = [];
        let climbIdCounter = 0;
        let sessionWorkouts = [];
        let activeLogMode = 'climb';
        let activeWorkoutPreset = null;
        let activeWorkoutExIndex = 0;
        let selectedTags = [];
        window.historyViewMode = 'ALL';
        var historyViewMode = 'ALL';
        
        let tagsMigrated = false;
        boulderHistory.forEach(s => {
            if (s.climbs) {
                s.climbs.forEach(c => {
                    if (c.tags) {
                        const originalLength = c.tags.length;
                        c.tags = c.tags.filter(t => t !== 'overhang' && t !== 'comp');
                        if (c.tags.length !== originalLength) tagsMigrated = true;
                    }
                });
            }
        });
        if (tagsMigrated) {
            localStorage.setItem('boulderHistory', JSON.stringify(boulderHistory));
        }

        let boulderActiveSession = safeJsonParse(localStorage.getItem('boulderActiveSession'), null);
        if (boulderActiveSession) {
            let activeMigrated = false;
            (boulderActiveSession.climbs || []).forEach(c => {
                if (c.tags) {
                    const originalLength = c.tags.length;
                    c.tags = c.tags.filter(t => t !== 'overhang' && t !== 'comp');
                    if (c.tags.length !== originalLength) activeMigrated = true;
                }
            });
            if (activeMigrated) {
                localStorage.setItem('boulderActiveSession', JSON.stringify(boulderActiveSession));
            }
        }

        const tagList = ['crimp', 'sloper', 'pinch', 'slab', 'dyno', 'board', 'technical', 'powerful'];

        function getSessionStats(session) {
            let sends = 0, flashes = 0, sumGrades = 0, sendCount = 0;
            if (session.climbs && session.climbs.length > 0) {
                session.climbs.forEach(c => {
                    if (c.statusText === 'Top' || c.statusText === 'Flash') {
                        sends++;
                        sendCount++;
                        sumGrades += fontGrades.indexOf(c.gradeStr);
                        if (c.statusText === 'Flash') flashes++;
                    }
                });
            }
            const avgGrade = sendCount > 0 ? fontGrades[Math.round(sumGrades / sendCount)] : '-';
            return { sends, flashes, sumGrades, sendCount, avgGrade };
        }

        function getHistoryStats(historyArray) {
            let totalPoints = 0, totalSends = 0, totalFlashes = 0, totalProjTries = 0;
            let totalDuration = 0, sumGrades = 0, totalSuccessfulClimbs = 0;
            let totalAllClimbs = 0;
            historyArray.forEach(s => {
                totalPoints += s.score || 0;
                totalDuration += s.duration || 0;
                if (s.climbs) {
                    s.climbs.forEach(c => {
                        totalAllClimbs++;
                        if (c.statusText === 'Top' || c.statusText === 'Flash') {
                            totalSends++;
                            totalSuccessfulClimbs++;
                            sumGrades += fontGrades.indexOf(c.gradeStr);
                            if (c.statusText === 'Flash') totalFlashes++;
                        }
                        if (c.statusText === 'Project') totalProjTries += c.tries || 0;
                    });
                }
            });
            const flashRate = totalAllClimbs > 0 ? Math.round((totalFlashes / totalAllClimbs) * 100) : 0;
            const sessionsWithTime = historyArray.filter(s => (s.duration || 0) > 0);
            const avgDurDec = sessionsWithTime.length > 0 ? (totalDuration / sessionsWithTime.length) : 0;
            const avgDur = formatDuration(Math.round(avgDurDec));
            const sessionsWithClimbs = historyArray.filter(s => s.climbs && s.climbs.length > 0);
            const avgSends = sessionsWithClimbs.length > 0 ? (totalSends / sessionsWithClimbs.length).toFixed(1) : '0';
            const avgGradeScore = totalSuccessfulClimbs > 0 ? (sumGrades / totalSuccessfulClimbs) : 0;
            const avgGrade = totalSuccessfulClimbs > 0 ? fontGrades[Math.round(avgGradeScore)] : '-';
            return { totalPoints, totalSends, totalFlashes, totalProjTries, totalDuration, sumGrades, totalSuccessfulClimbs, flashRate, avgDur, avgSends, avgGrade, avgGradeScore };
        }

        function getPersonalRecords(historyArray) {
            let bestScore = 0, highestGradeIdx = -1, mostSends = 0, longestDuration = 0, highestLadderIdx = -1;
            historyArray.forEach(s => {
                if (s.score > bestScore) bestScore = s.score;
                if ((s.duration || 0) > longestDuration) longestDuration = s.duration;
                let sends = 0;
                (s.climbs || []).forEach(c => {
                    if (c.statusText === 'Top' || c.statusText === 'Flash') {
                        sends++;
                        const gIdx = fontGrades.indexOf(c.gradeStr);
                        if (gIdx > highestGradeIdx) highestGradeIdx = gIdx;
                        if (c.isLadderAscent && gIdx > highestLadderIdx) highestLadderIdx = gIdx;
                    }
                });
                if (sends > mostSends) mostSends = sends;
            });
            return {
                bestScore,
                highestGrade: highestGradeIdx >= 0 ? fontGrades[highestGradeIdx] : '-',
                mostSends: mostSends || '-',
                longestSession: longestDuration > 0 ? formatDuration(longestDuration) : '-',
                highestLadder: highestLadderIdx >= 0 ? fontGrades[highestLadderIdx] : '-'
            };
        }

        function getStreakData() {
            const sessionDates = [];
            boulderHistory.forEach(s => {
                if (s.timestamp) {
                    const d = new Date(s.timestamp);
                    d.setHours(0, 0, 0, 0);
                    const key = d.getTime();
                    if (!sessionDates.includes(key)) sessionDates.push(key);
                }
            });
            sessionDates.sort((a, b) => b - a); // most recent first

            if (sessionDates.length === 0) return { current: 0, longest: 0 };

            const DAY_MS = 86400000;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayMs = today.getTime();

            // Current streak: most recent session must be within 2 days of today
            let current = 0;
            if ((todayMs - sessionDates[0]) / DAY_MS <= 2) {
                current = 1;
                for (let i = 1; i < sessionDates.length; i++) {
                    if ((sessionDates[i - 1] - sessionDates[i]) / DAY_MS <= 2) {
                        current++;
                    } else break;
                }
            }

            // Longest streak ever
            let longest = 1, chain = 1;
            for (let i = 1; i < sessionDates.length; i++) {
                if ((sessionDates[i - 1] - sessionDates[i]) / DAY_MS <= 2) {
                    chain++;
                } else {
                    chain = 1;
                }
                if (chain > longest) longest = chain;
            }

            return { current, longest };
        }

        let heatmapCurrentMonthOffset = 0; // 0 is current month, -1 is last month, etc.

        function renderCalendarHeatmap() {
            const container = document.getElementById('heatmapGrid');
            const label = document.getElementById('heatmapMonthLabel');
            if (!container || !label) return;

            // Gather climb counts per day
            const dateCounts = {};
            boulderHistory.forEach(s => {
                if (s.timestamp) {
                    const d = new Date(s.timestamp);
                    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    dateCounts[key] = (dateCounts[key] || 0) + (s.climbs || []).length;
                }
            });

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Determine the target month to display based on the offset
            const targetDate = new Date();
            targetDate.setMonth(targetDate.getMonth() + heatmapCurrentMonthOffset);
            
            label.innerText = targetDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

            const year = targetDate.getFullYear();
            const month = targetDate.getMonth();

            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            
            // Adjust to Monday-start
            let firstDayIndex = firstDay.getDay() - 1;
            if (firstDayIndex < 0) firstDayIndex = 6; // Sunday becomes 6
            const daysInMonth = lastDay.getDate();

            let html = '';

            // Empty cells before the 1st
            for (let i = 0; i < firstDayIndex; i++) {
                html += `<div class="aspect-square rounded-sm bg-transparent"></div>`;
            }

            // Days of the month
            for (let day = 1; day <= daysInMonth; day++) {
                const cellDate = new Date(year, month, day);
                const key = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const count = dateCounts[key] || 0;
                const isFuture = cellDate > today;

                let bg = 'bg-neutral-800/40 border border-neutral-800/50';
                let txt = 'text-neutral-600';
                
                if (isFuture) {
                    bg = 'bg-transparent border border-dashed border-neutral-800/30';
                    txt = 'text-neutral-700/50';
                } else if (count >= 7) {
                    bg = 'bg-emerald-400 border border-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.3)]';
                    txt = 'text-black font-black';
                } else if (count >= 4) {
                    bg = 'bg-emerald-500/70 border border-emerald-400/50';
                    txt = 'text-black font-bold';
                } else if (count >= 1) {
                    bg = 'bg-emerald-700/60 border border-emerald-600/50';
                    txt = 'text-white/80 font-bold';
                }

                // Highlight today specifically if it's the current month
                const isToday = cellDate.getTime() === today.getTime();
                if (isToday && count === 0) {
                     bg += ' border-neutral-500/50 ring-1 ring-neutral-500/50';
                }

                let actionAttr = '';
                let cursorClass = count > 0 ? 'cursor-pointer active:scale-95' : 'pointer-events-none';
                if (count > 0) {
                    actionAttr = `onclick="openHeatmapSession('${key}')"`;
                }

                html += `<div ${actionAttr} class="aspect-square rounded-md ${bg} flex items-center justify-center text-[10px] ${txt} transition-all relative overflow-hidden ${cursorClass}" title="${key}: ${count} climbs">
                            <span class="z-10">${day}</span>
                            ${count > 0 ? `<div class="absolute bottom-0 left-0 right-0 h-1 bg-black/10"></div>` : ''}
                         </div>`;
            }

            // Empty cells to complete the grid (usually up to 42 cells total for a 6-row grid)
            const totalCells = firstDayIndex + daysInMonth;
            const remaining = (Math.ceil(totalCells / 7) * 7) - totalCells;
            for (let i = 0; i < remaining; i++) {
                html += `<div class="aspect-square rounded-sm bg-transparent"></div>`;
            }

            container.innerHTML = html;

        }
        
        function changeHeatmapMonth(delta) {
            heatmapCurrentMonthOffset += delta;
            
            // Prevent going into future months beyond current month
            if (heatmapCurrentMonthOffset > 0) heatmapCurrentMonthOffset = 0;
            
            // Re-render and add a small haptic bump
            renderCalendarHeatmap();
            if ('vibrate' in navigator) navigator.vibrate(10);
        }

        function openHeatmapSession(dateStr) {
            // Find the most recent session for this specific date
            for (let i = boulderHistory.length - 1; i >= 0; i--) {
                const s = boulderHistory[i];
                if (s.timestamp) {
                    const d = new Date(s.timestamp);
                    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    if (key === dateStr) {
                        openSessionDetail(i, true);
                        return;
                    }
                }
            }
        }

        function updateComparisonDeltas() {
            const ids = ['statFlashRateDelta', 'statAvgSendsDelta', 'statTotalPointsDelta'];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.classList.add('hidden'); el.innerText = ''; }
            });

            if (historyViewMode === 'ALL') return;

            const now = new Date();
            let currentFilter, prevFilter;

            if (historyViewMode === 'WEEK') {
                const startOfWeek = getStartOfWeek();
                const prevWeekStart = startOfWeek - 7 * 86400000;
                currentFilter = s => (s.timestamp || 0) >= startOfWeek;
                prevFilter = s => (s.timestamp || 0) >= prevWeekStart && (s.timestamp || 0) < startOfWeek;
            } else {
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
                const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
                currentFilter = s => (s.timestamp || 0) >= startOfMonth;
                prevFilter = s => (s.timestamp || 0) >= prevMonthStart && (s.timestamp || 0) < startOfMonth;
            }

            const current = getHistoryStats(boulderHistory.filter(currentFilter));
            const prev = getHistoryStats(boulderHistory.filter(prevFilter));

            function showDelta(elId, curVal, prevVal, suffix = '') {
                const el = document.getElementById(elId);
                if (!el) return;
                if (prevVal === 0 && curVal === 0) return;
                const diff = curVal - prevVal;
                if (diff === 0) return;
                const sign = diff > 0 ? '↑' : '↓';
                const color = diff > 0 ? 'text-emerald-400' : 'text-red-400';
                el.className = `text-[8px] font-bold mt-0.5 ${color}`;
                el.classList.remove('hidden');
                el.innerText = `${sign} ${Math.abs(diff).toFixed(suffix === '%' ? 0 : 1)}${suffix}`;
            }

            showDelta('statFlashRateDelta', current.flashRate, prev.flashRate, '%');
            showDelta('statAvgSendsDelta', parseFloat(current.avgSends), parseFloat(prev.avgSends));
            showDelta('statTotalPointsDelta', current.totalPoints, prev.totalPoints);
        }

        function renderTags() {
            try {
                const container = document.getElementById('tagContainer');
                if (!container) return;
                container.innerHTML = tagList.map(tag => `
                    <button onclick="toggleTag('${tag}')" id="tag-${tag}"
                        class="py-2 px-3 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 shadow-sm
                        ${selectedTags.includes(tag) ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'}">
                        <span>${tag}</span>
                    </button>
                `).join('');
            } catch (e) { console.error("renderTags failed:", e); }
        }

        // --- ACHIEVEMENTS & DATA ---
        const achievementDefinitions = [
            { id: "first_blood", name: "First Blood", desc: "Log your first climb.", icon: "🩸" },
            { id: "the_flash", name: "The Flash", desc: "Flash a climb at your Max Grade.", icon: "⚡" },
            { id: "crusher", name: "Crusher", desc: "Send a climb above your Max Grade.", icon: "💥" },
            { id: "dedication", name: "Dedication", desc: "Top a route after 5+ attempts.", icon: "🔥" },
            { id: "double_digits", name: "Double Digits", desc: "Get 10+ sends in a single session.", icon: "🔟" },
            { id: "volume_day", name: "Volume Day", desc: "Log 15+ climbs in a session.", icon: "💪" },
            { id: "hat_trick", name: "Hat Trick", desc: "Send 3 different grades in one session.", icon: "🎩" },
            { id: "all_rounder", name: "All-Rounder", desc: "Use all 8 style tags in one session.", icon: "🎯" },
            { id: "centurion", name: "Centurion", desc: "Reach 1,000 Total Points.", icon: "👑" },
            { id: "consistency", name: "Consistency", desc: "Complete 5 sessions.", icon: "📅" },
            { id: "marathon", name: "Marathon", desc: "Climb for over 3 hours.", icon: "⏱️" },
            { id: "sixty_seven", name: "The 67 Beers", desc: "Beat the secret minigame.", icon: "🍺" }
        ];

        let achievementsUnlocked = safeJsonParse(localStorage.getItem('boulderAchievements'), []);

        function renderAchievements() {
            const list = document.getElementById('achievementsList');
            if(!list) return;
            document.getElementById('achievementCount').innerText = `${achievementsUnlocked.length}/${achievementDefinitions.length}`;
            list.innerHTML = achievementDefinitions.map(def => {
                const isUnlocked = achievementsUnlocked.includes(def.id);
                const bgClass = isUnlocked ? "bg-emerald-900/40 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "bg-neutral-900/50 border-neutral-800 opacity-40 grayscale";
                const textClass = isUnlocked ? "text-emerald-400" : "text-neutral-500";
                return `
                <div class="${bgClass} border rounded-2xl p-3 flex flex-col items-center text-center transition-all duration-300">
                    <div class="text-3xl mb-1">${def.icon}</div>
                    <h4 class="text-[11px] font-black text-white uppercase tracking-wider mb-0.5">${def.name}</h4>
                    <p class="text-[9px] ${textClass} leading-tight">${def.desc}</p>
                </div>`;
            }).join('');
        }

        function unlockAchievement(id) {
            if (achievementsUnlocked.includes(id)) return;
            achievementsUnlocked.push(id);
            localStorage.setItem('boulderAchievements', JSON.stringify(achievementsUnlocked));
            
            if ('vibrate' in navigator) navigator.vibrate([100, 50, 100, 50, 200]);
            try { playDing(); } catch(e){}
            
            const def = achievementDefinitions.find(d => d.id === id);
            const toast = document.getElementById('toastAlert');
            if(toast) {
                document.getElementById('toastTitle').innerText = def.name;
                if (typeof confetti === 'function') {
                    confetti({ particleCount: 200, spread: 100, origin: { y: 0.1 }, zIndex: 300, colors: ['#10b981', '#fbbf24', '#ffffff'] });
                }
                toast.classList.remove('-translate-y-[150%]');
                setTimeout(() => toast.classList.add('-translate-y-[150%]'), 4000);
            }
            renderAchievements();
        }

        function exportData() {
            let calibData = null;
            try {
                const savedCalib = localStorage.getItem('sendlog_v2_calibration');
                if (savedCalib) calibData = JSON.parse(savedCalib);
            } catch(e) {}

            const data = {
                history: boulderHistory,
                maxGradeIndex: localStorage.getItem('boulderMaxGradeIndex'),
                playerName: localStorage.getItem('boulderPlayerName'),
                achievements: achievementsUnlocked,
                calibration: calibData
            };
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
            const node = document.createElement('a');
            node.setAttribute("href", dataStr);
            node.setAttribute("download", "sendlog_backup.json");
            document.body.appendChild(node);
            node.click();
            node.remove();
        }

        function importData(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.history) {
                        localStorage.setItem('boulderHistory', JSON.stringify(data.history));
                        boulderHistory = data.history;
                    }
                    if (data.maxGradeIndex !== undefined && data.maxGradeIndex !== null && data.maxGradeIndex !== 'null') {
                        localStorage.setItem('boulderMaxGradeIndex', data.maxGradeIndex);
                    }
                    if (data.playerName) localStorage.setItem('boulderPlayerName', data.playerName);
                    if (data.achievements) localStorage.setItem('boulderAchievements', JSON.stringify(data.achievements));
                    if (data.calibration) localStorage.setItem('sendlog_v2_calibration', JSON.stringify(data.calibration));
                    window.location.reload();
                } catch (err) { alert("Failed to parse Backup file."); }
            };
            reader.readAsText(file);
        }

        function openSettings(push = true) { 
            document.getElementById('settingsOverlay').classList.replace('hidden', 'flex'); 
            renderAchievements(); 
            renderMaxGradeSelect();
            if (push) history.pushState({ overlay: 'settings' }, '', '#settings');
        }

        function renderMaxGradeSelect() {
            const select = document.getElementById('vMax');
            if (!select) return;
            select.innerHTML = fontGrades.map((g, i) => `<option value="${i}" ${i == maxGradeIndex ? 'selected' : ''}>${g}</option>`).join('');
            select.onchange = (e) => {
                maxGradeIndex = parseInt(e.target.value);
                localStorage.setItem('boulderMaxGradeIndex', maxGradeIndex);
                if ('vibrate' in navigator) navigator.vibrate(10);
                updateAnalytics(); // Update stats if max grade baseline changes (for some achievements)
            };
        }
        function closeSettings(event, pop = true) { 
            document.getElementById('settingsOverlay').classList.replace('flex', 'hidden'); 
            if (pop) history.back();
        }

        // Session Timer
        let sessionStartTime = null;
        let sessionTimerInterval = null;

        function handleSessionAction() {
            if (!sessionStartTime) {
                startSession();
            } else {
                endSession();
            }
        }

        function startSession() {
            if (sessionStartTime) return; 
            sessionStartTime = Date.now();
            saveActiveSession();
            if (DOM.sessionTimerStr) DOM.sessionTimerStr.classList.remove('hidden');
            if (DOM.sessionScoreStr) DOM.sessionScoreStr.classList.add('animate-score-pulse');
            sessionTimerInterval = setInterval(updateSessionTimer, 1000);
            updateSessionTimer();
            
            toggleSessionButtonUI(true);
            if ('vibrate' in navigator) navigator.vibrate([10, 30, 10]);
        }

        function saveActiveSession() {
            try {
                const activeSession = {
                    sessionStartTime,
                    sessionScore,
                    sessionClimbs,
                    sessionWorkouts,
                    activeLogMode,
                    activeWorkoutPreset,
                    activeWorkoutExIndex
                };
                localStorage.setItem('boulderActiveSession', JSON.stringify(activeSession));
            } catch (e) {
                console.error('Failed to save session:', e);
            }
        }

        function loadActiveSession() {
            try {
                const data = localStorage.getItem('boulderActiveSession');
                if (!data) return;
                const active = JSON.parse(data);
                if (active.sessionStartTime || (active.sessionClimbs && active.sessionClimbs.length > 0) || (active.sessionWorkouts && active.sessionWorkouts.length > 0)) {
                    sessionStartTime = active.sessionStartTime || Date.now();
                    sessionScore = active.sessionScore || 0;
                    sessionClimbs = active.sessionClimbs || [];
                    sessionWorkouts = active.sessionWorkouts || [];
                    activeLogMode = active.activeLogMode || 'climb';
                    activeWorkoutPreset = active.activeWorkoutPreset || null;
                    activeWorkoutExIndex = active.activeWorkoutExIndex || 0;

                    // Restore climbIdCounter to avoid collisions
                    if (sessionClimbs.length > 0) {
                        climbIdCounter = Math.max(...sessionClimbs.map(c => c.id)) + 1;
                    }

                    if (sessionStartTime) {
                        DOM.sessionTimerStr.classList.remove('hidden');
                        DOM.sessionScoreStr.classList.add('animate-score-pulse');
                        if (sessionTimerInterval) clearInterval(sessionTimerInterval);
                        sessionTimerInterval = setInterval(updateSessionTimer, 1000);
                        updateSessionTimer();
                        toggleSessionButtonUI(true);
                    }

                    // Reconcile hang properties for restored workout presets from localStorage
                    if (sessionWorkouts && sessionWorkouts.length > 0) {
                        sessionWorkouts.forEach(w => {
                            if (typeof Planner !== 'undefined' && typeof Planner.getWorkoutPreset === 'function') {
                                const canon = Planner.getWorkoutPreset(w.id);
                                if (canon && Array.isArray(w.exercises)) {
                                    w.exercises.forEach((ex, idx) => {
                                        const canonEx = (canon.exercises || [])[idx] || ex;
                                        const cfg = getExerciseHangConfig(canon, canonEx);
                                        if (cfg.isHang) {
                                            ex.isHang = true;
                                            if (typeof ex.hangSeconds !== 'number' || ex.hangSeconds === 0) ex.hangSeconds = cfg.hangSeconds;
                                            if (typeof ex.repRestSeconds !== 'number') ex.repRestSeconds = cfg.repRestSeconds;
                                            if (typeof ex.repsPerSet !== 'number' || ex.repsPerSet === 0) ex.repsPerSet = cfg.repsPerSet;
                                            if (typeof ex.prepSeconds !== 'number' || ex.prepSeconds === 0) ex.prepSeconds = cfg.prepSeconds;
                                        }
                                    });
                                }
                            }
                        });
                    }
                    if (activeWorkoutPreset && typeof Planner !== 'undefined' && typeof Planner.getWorkoutPreset === 'function') {
                        const canon = Planner.getWorkoutPreset(activeWorkoutPreset.id);
                        if (canon && Array.isArray(activeWorkoutPreset.exercises)) {
                            activeWorkoutPreset.exercises.forEach((ex, idx) => {
                                const canonEx = (canon.exercises || [])[idx] || ex;
                                const cfg = getExerciseHangConfig(canon, canonEx);
                                if (cfg.isHang) {
                                    ex.isHang = true;
                                    if (typeof ex.hangSeconds !== 'number' || ex.hangSeconds === 0) ex.hangSeconds = cfg.hangSeconds;
                                    if (typeof ex.repRestSeconds !== 'number') ex.repRestSeconds = cfg.repRestSeconds;
                                    if (typeof ex.repsPerSet !== 'number' || ex.repsPerSet === 0) ex.repsPerSet = cfg.repsPerSet;
                                    if (typeof ex.prepSeconds !== 'number' || ex.prepSeconds === 0) ex.prepSeconds = cfg.prepSeconds;
                                }
                            });
                        }
                    }

                    if (activeLogMode === 'workout') {
                        switchLogMode('workout');
                    } else if (activeWorkoutPreset) {
                        renderWorkoutHUD();
                    }

                    sessionClimbs.forEach(c => {
                        if (!c.colorTag) c.colorTag = 'red';
                        if (!c.colorHex && typeof getColorObj === 'function') c.colorHex = getColorObj(c.colorTag).hex;
                        if (c.completionPct === undefined) {
                            c.completionPct = (c.isTop || c.isFlash || c.statusText === 'Top' || c.statusText === 'Flash') ? 100 : 0;
                        }
                    });

                    renderSessionList();
                    if (typeof updateCoachRecommendation === 'function') updateCoachRecommendation();
                    updateAnalytics();
                }
            } catch (e) {
                console.error('Failed to load session:', e);
            }
        }

        function formatDuration(seconds) {
            if (!seconds || seconds < 1) return "";
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            if (h > 0) return `${h}h ${m}m`;
            return `${m}m`;
        }

        function updateSessionTimer() {
            if (!sessionStartTime) return;
            const now = Date.now();
            const diff = Math.floor((now - sessionStartTime) / 1000);
            const h = Math.floor(diff / 3600);
            const m = Math.floor((diff % 3600) / 60);
            const s = diff % 60;
            const hStr = h > 0 ? h.toString().padStart(2, '0') + ':' : '';
            const mStr = m.toString().padStart(2, '0') + ':';
            const sStr = s.toString().padStart(2, '0');
            DOM.sessionTimerStr.innerText = hStr + mStr + sStr;
        }

        // Player Name for Leaderboard
        let playerName = localStorage.getItem('boulderPlayerName') || '';

        // Dreamlo API Configuration
        const DREAMLO_PUBLIC_KEY = "69bd7fc18f40bb2f60a8dc61";
        const DREAMLO_PRIVATE_KEY = "vfdYvMLvmEKb5Le5LgzVNAqTyA8CgKgkeIDHgEFN832w";

        const elGrade = document.getElementById('displayGrade');
        const elTries = document.getElementById('displayTries');
        const btnTop = document.getElementById('btnTop');
        const btnSubmit = document.getElementById('mainAddButton');
        const selectMax = document.getElementById('vMax');

        let flashManuallyDisabled = false;

        renderMaxGradeSelect();
        renderTags();

        if (elGrade) elGrade.innerText = fontGrades[currentGradeIndex];
        updateUI();
        updateSubmitButtonLabel();

        // -- LOGIC: INPUT --
        function adjGrade(dir) {
            if ('vibrate' in navigator) navigator.vibrate(15);
            currentGradeIndex = Math.max(0, Math.min(fontGrades.length - 1, currentGradeIndex + dir));
            if (elGrade) elGrade.innerText = fontGrades[currentGradeIndex];
            checkIntraSessionAdaptation();
        }

        function quickRecordBurn() {
            if ('vibrate' in navigator) navigator.vibrate(25);
            
            if (burnsRecorded === 0 && tries === 1) {
                // First burn recorded on this route: record 1st attempt
                burnsRecorded = 1;
                tries = 1;
            } else {
                burnsRecorded = Math.max(burnsRecorded + 1, tries + 1);
                tries = burnsRecorded;
            }

            if (elTries) elTries.innerText = tries;
            if (isTop && tries > 1) {
                isFlash = false;
            }

            if (typeof startRestTimer === 'function') {
                startRestTimer();
            }

            updateUI();
            updateSubmitButtonLabel();
            checkIntraSessionAdaptation();
        }
        window.quickRecordBurn = quickRecordBurn;

        function updateSubmitButtonLabel() {
            const btn = document.getElementById('mainAddButton');
            if (!btn) return;
            if (isFlash) {
                btn.innerHTML = `<span class="text-xl">⚡</span><span>LOG FLASH (+PTS)</span>`;
                btn.className = 'w-full h-16 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-black uppercase tracking-[0.25em] text-base sm:text-lg shadow-2xl shadow-amber-500/25 active:scale-[0.98] transition-all outline-none flex items-center justify-center gap-2.5';
            } else if (isTop) {
                btn.innerHTML = `<span class="text-xl">🧗</span><span>LOG SEND (${tries} ${tries > 1 ? 'TRIES' : 'TRY'})</span>`;
                btn.className = 'w-full h-16 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 text-black font-black uppercase tracking-[0.25em] text-base sm:text-lg shadow-2xl shadow-emerald-500/25 active:scale-[0.98] transition-all outline-none flex items-center justify-center gap-2.5';
            } else {
                btn.innerHTML = `<span class="text-lg">🧗</span><span>LOG PROJECT (${tries} ${tries > 1 ? 'BURNS' : 'BURN'})</span>`;
                btn.className = 'w-full h-16 rounded-2xl bg-neutral-900 border border-neutral-700 text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/50 font-black uppercase tracking-[0.2em] text-sm sm:text-base active:scale-[0.98] transition-all outline-none flex items-center justify-center gap-2.5';
            }
        }

        function adjTries(dir) {
            if ('vibrate' in navigator) navigator.vibrate(15);
            tries = Math.max(1, tries + dir);
            burnsRecorded = tries;
            if (elTries) elTries.innerText = tries;
            if (isTop) {
                if (tries === 1 && !flashManuallyDisabled) {
                    isFlash = true;
                } else {
                    isFlash = false;
                }
            } else {
                isFlash = false;
            }
            updateUI();
            updateSubmitButtonLabel();
            checkIntraSessionAdaptation();
        }

        function toggleTop() {
            if ('vibrate' in navigator) navigator.vibrate(15);
            isTop = !isTop;
            if (isTop) {
                if (tries === 1 && !flashManuallyDisabled) {
                    isFlash = true;
                } else {
                    isFlash = false;
                }
            } else {
                isFlash = false;
                flashManuallyDisabled = false;
            }
            if (elTries) elTries.innerText = tries;
            updateUI();
            updateSubmitButtonLabel();
            checkIntraSessionAdaptation();
        }
        window.toggleTop = toggleTop;

        function toggleFlashOverride(event) {
            if (event) event.stopPropagation();
            if ('vibrate' in navigator) navigator.vibrate(15);
            if (!isTop || tries !== 1) return;
            isFlash = !isFlash;
            flashManuallyDisabled = !isFlash;
            updateUI();
            updateSubmitButtonLabel();
            checkIntraSessionAdaptation();
        }
        window.toggleFlashOverride = toggleFlashOverride;

        function toggleFlash() {
            if ('vibrate' in navigator) navigator.vibrate(15);
            if (!isTop) {
                isTop = true;
                tries = 1;
                if (elTries) elTries.innerText = 1;
                isFlash = true;
                flashManuallyDisabled = false;
            } else {
                toggleFlashOverride();
            }
            updateUI();
            updateSubmitButtonLabel();
            checkIntraSessionAdaptation();
        }
        window.toggleFlash = toggleFlash;

        function updateUI() {
            const btn = document.getElementById('btnTop');
            if (btn) {
                if (!isTop) {
                    btn.className = "rounded-2xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white font-black uppercase tracking-wider text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md haptic-feedback h-full";
                    btn.innerHTML = `<span class="text-lg">🧗</span><span>Topped?</span>`;
                } else if (isFlash) {
                    btn.className = "rounded-2xl bg-amber-500/20 border border-amber-500/50 text-amber-400 font-black uppercase tracking-wider text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_0_20px_rgba(245,158,11,0.2)] haptic-feedback h-full";
                    btn.innerHTML = `<span class="text-lg">⚡</span><span>Flash!</span><span onclick="toggleFlashOverride(event)" title="Switch to regular send" class="ml-1 px-1.5 py-0.5 rounded bg-amber-500/30 text-[10px] text-amber-200 hover:bg-amber-500/50 border border-amber-400/40">Undo</span>`;
                } else {
                    btn.className = "rounded-2xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 font-black uppercase tracking-wider text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.2)] haptic-feedback h-full";
                    if (tries === 1) {
                        btn.innerHTML = `<span class="text-lg">🧗</span><span>Sent (1 try)</span><span onclick="toggleFlashOverride(event)" title="Mark as flash" class="ml-1 px-1.5 py-0.5 rounded bg-neutral-800 text-[10px] text-neutral-300 hover:text-amber-300 border border-neutral-700">⚡ Flash?</span>`;
                    } else {
                        btn.innerHTML = `<span class="text-lg">🧗</span><span>Sent (${tries} tries)</span>`;
                    }
                }
            }

            // Safe fallback if legacy btnFlash element is ever rendered
            const btnF = document.getElementById('btnFlash');
            if (btnF) {
                btnF.className = isFlash
                    ? "flex-1 rounded-2xl border text-sm font-black uppercase tracking-[0.15em] flex items-center justify-center transition-all haptic-feedback bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                    : "flex-1 rounded-2xl border text-sm font-black uppercase tracking-[0.15em] flex items-center justify-center transition-all haptic-feedback bg-neutral-900 border-neutral-800 text-neutral-500";
            }
        }

        function toggleTag(tag) {
            if ('vibrate' in navigator) navigator.vibrate(10);
            const idx = selectedTags.indexOf(tag);
            if (idx > -1) {
                selectedTags.splice(idx, 1);
            } else {
                selectedTags.push(tag);
            }
            renderTags();
        }

        // ==========================================
        // DUAL-MODE LOGGING: OFF-WALL WORKOUT TRACKER
        // ==========================================
        function switchLogMode(mode) {
            if (mode !== 'climb' && mode !== 'workout') return;
            activeLogMode = mode;

            const modeBtnClimb = document.getElementById('modeBtnClimb');
            const modeBtnWorkout = document.getElementById('modeBtnWorkout');
            const climbingWrapper = document.getElementById('climbingControlsWrapper');
            const workoutWrapper = document.getElementById('workoutModeContainer');

            if (mode === 'climb') {
                if (modeBtnClimb) {
                    modeBtnClimb.className = "px-5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all bg-emerald-500 text-black shadow-sm flex items-center gap-1.5";
                }
                if (modeBtnWorkout) {
                    modeBtnWorkout.className = "px-5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all text-neutral-400 hover:text-white flex items-center gap-1.5";
                }
                if (climbingWrapper) {
                    climbingWrapper.classList.remove('hidden');
                    climbingWrapper.classList.add('flex');
                }
                if (workoutWrapper) {
                    workoutWrapper.classList.remove('flex');
                    workoutWrapper.classList.add('hidden');
                }
            } else {
                if (modeBtnWorkout) {
                    modeBtnWorkout.className = "px-5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all bg-emerald-500 text-black shadow-sm flex items-center gap-1.5";
                }
                if (modeBtnClimb) {
                    modeBtnClimb.className = "px-5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all text-neutral-400 hover:text-white flex items-center gap-1.5";
                }
                if (climbingWrapper) {
                    climbingWrapper.classList.remove('flex');
                    climbingWrapper.classList.add('hidden');
                }
                if (workoutWrapper) {
                    workoutWrapper.classList.remove('hidden');
                    workoutWrapper.classList.add('flex');
                }

                // If no active workout preset loaded, load the default
                if (!activeWorkoutPreset) {
                    if (typeof Planner !== 'undefined' && typeof Planner.getWorkoutPresets === 'function') {
                        const presets = Planner.getWorkoutPresets();
                        if (presets && presets.length > 0) {
                            initWorkoutPreset(presets[0]);
                        }
                    }
                }
                renderWorkoutHUD();
            }

            saveActiveSession();
        }
        window.switchLogMode = switchLogMode;

        function getExerciseHangConfig(preset, ex) {
            const isRepeaters = (preset && preset.id === 'repeaters_7_3') || (ex && ex.id && ex.id.startsWith('rep_set_'));
            const isMaxHangs = (preset && preset.id === 'max_hangs') || (ex && ex.id && ex.id.startsWith('max_hang_'));
            const isHang = !!(ex && ex.isHang) || isRepeaters || isMaxHangs || !!(preset && preset.category === 'hangboard') || !!(preset && preset.hangConfig && preset.hangConfig.isHang);

            if (isRepeaters) {
                return {
                    isHang: true,
                    isRepeaters: true,
                    hangSeconds: (ex && typeof ex.hangSeconds === 'number' && ex.hangSeconds > 0) ? ex.hangSeconds : 7,
                    repRestSeconds: (ex && typeof ex.repRestSeconds === 'number') ? ex.repRestSeconds : 3,
                    repsPerSet: (ex && typeof ex.repsPerSet === 'number' && ex.repsPerSet > 0) ? ex.repsPerSet : 6,
                    prepSeconds: (ex && typeof ex.prepSeconds === 'number') ? ex.prepSeconds : 5,
                    setRestSeconds: (ex && typeof ex.restSeconds === 'number') ? ex.restSeconds : 150
                };
            }

            if (isMaxHangs) {
                return {
                    isHang: true,
                    isRepeaters: false,
                    hangSeconds: (ex && typeof ex.hangSeconds === 'number' && ex.hangSeconds > 0) ? ex.hangSeconds : 10,
                    repRestSeconds: 0,
                    repsPerSet: 1,
                    prepSeconds: (ex && typeof ex.prepSeconds === 'number') ? ex.prepSeconds : 5,
                    setRestSeconds: (ex && typeof ex.restSeconds === 'number') ? ex.restSeconds : 180
                };
            }

            return {
                isHang: isHang,
                isRepeaters: false,
                hangSeconds: (ex && typeof ex.hangSeconds === 'number' && ex.hangSeconds > 0) ? ex.hangSeconds : 10,
                repRestSeconds: (ex && typeof ex.repRestSeconds === 'number') ? ex.repRestSeconds : 0,
                repsPerSet: (ex && typeof ex.repsPerSet === 'number' && ex.repsPerSet > 0) ? ex.repsPerSet : 1,
                prepSeconds: (ex && typeof ex.prepSeconds === 'number') ? ex.prepSeconds : 5,
                setRestSeconds: (ex && typeof ex.restSeconds === 'number') ? ex.restSeconds : 60
            };
        }
        window.getExerciseHangConfig = getExerciseHangConfig;

        function initWorkoutPreset(preset) {
            if (!preset) return;
            // Check if already in sessionWorkouts
            let existing = sessionWorkouts.find(w => w.id === preset.id);
            if (existing) {
                activeWorkoutPreset = existing;
                // Reconcile missing or outdated properties from canonical preset
                if (preset.hangConfig) {
                    existing.hangConfig = { ...preset.hangConfig, ...(existing.hangConfig || {}) };
                }
                if (Array.isArray(existing.exercises) && Array.isArray(preset.exercises)) {
                    preset.exercises.forEach((pEx, idx) => {
                        if (existing.exercises[idx]) {
                            const ex = existing.exercises[idx];
                            const cfg = getExerciseHangConfig(preset, pEx);
                            if (cfg.isHang) {
                                ex.isHang = true;
                                if (typeof ex.hangSeconds !== 'number' || ex.hangSeconds === 0) ex.hangSeconds = cfg.hangSeconds;
                                if (typeof ex.repRestSeconds !== 'number') ex.repRestSeconds = cfg.repRestSeconds;
                                if (typeof ex.repsPerSet !== 'number' || ex.repsPerSet === 0) ex.repsPerSet = cfg.repsPerSet;
                                if (typeof ex.prepSeconds !== 'number' || ex.prepSeconds === 0) ex.prepSeconds = cfg.prepSeconds;
                            }
                        }
                    });
                }
            } else {
                // Clean up any previous unstarted workout (0 completed sets) so orphaned empty presets do not linger
                if (activeWorkoutPreset && activeWorkoutPreset.id !== preset.id) {
                    const hasCompleted = (activeWorkoutPreset.exercises || []).some(e => (e.completedSets || 0) > 0);
                    if (!hasCompleted) {
                        sessionWorkouts = sessionWorkouts.filter(w => w.id !== activeWorkoutPreset.id);
                    }
                }
                activeWorkoutPreset = {
                    id: preset.id,
                    name: preset.name,
                    shortName: preset.shortName || preset.name,
                    category: preset.category,
                    icon: preset.icon,
                    badge: preset.badge,
                    durationMinutes: preset.durationMinutes,
                    desc: preset.desc,
                    hangConfig: preset.hangConfig ? { ...preset.hangConfig } : null,
                    exercises: (preset.exercises || []).map(ex => {
                        const cfg = getExerciseHangConfig(preset, ex);
                        return {
                            id: ex.id,
                            name: ex.name,
                            sets: typeof ex.sets === 'number' ? ex.sets : 3,
                            reps: ex.reps || '10 reps',
                            restSeconds: ex.restSeconds || (cfg.isHang ? cfg.setRestSeconds : 60),
                            desc: ex.desc || '',
                            trackWeight: !!ex.trackWeight,
                            isHang: cfg.isHang,
                            hangSeconds: ex.hangSeconds !== undefined ? ex.hangSeconds : cfg.hangSeconds,
                            repRestSeconds: ex.repRestSeconds !== undefined ? ex.repRestSeconds : cfg.repRestSeconds,
                            repsPerSet: ex.repsPerSet !== undefined ? ex.repsPerSet : cfg.repsPerSet,
                            prepSeconds: ex.prepSeconds !== undefined ? ex.prepSeconds : cfg.prepSeconds,
                            defaultWeight: ex.defaultWeight !== undefined ? ex.defaultWeight : (ex.trackWeight ? 60 : 0),
                            defaultReps: ex.defaultReps !== undefined ? ex.defaultReps : 6,
                            activeWeight: ex.defaultWeight !== undefined ? ex.defaultWeight : (ex.trackWeight ? 60 : 0),
                            activeReps: ex.defaultReps !== undefined ? ex.defaultReps : 6,
                            completedSets: ex.completedSets || 0,
                            setsData: ex.setsData ? [...ex.setsData] : []
                        };
                    })
                };
                sessionWorkouts.push(activeWorkoutPreset);
            }
            activeWorkoutExIndex = 0;
        }

        function selectWorkoutPreset(presetId) {
            if (!presetId) return;
            if (!sessionStartTime) {
                startSession();
            }
            let preset = null;
            if (typeof Planner !== 'undefined' && typeof Planner.getWorkoutPreset === 'function') {
                preset = Planner.getWorkoutPreset(presetId);
            }
            if (!preset && typeof Planner !== 'undefined' && typeof Planner.getWorkoutPresets === 'function') {
                const list = Planner.getWorkoutPresets();
                preset = list.find(p => p.id === presetId) || list[0];
            }
            if (preset) {
                initWorkoutPreset(preset);
            }

            // Sync quick-chips active styles
            const chips = ['bench_press', 'antagonist_armor', 'repeaters_7_3', 'max_hangs', 'climber_core', 'mobility_flow'];
            chips.forEach(cid => {
                const el = document.getElementById('quickChip_' + cid);
                if (el) {
                    if (cid === presetId) {
                        el.className = 'px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap bg-emerald-500 text-black shadow-sm';
                    } else {
                        el.className = 'px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white';
                    }
                }
            });

            // Sync banner dropdown
            const dd = document.getElementById('workoutPresetDropdown');
            if (dd && dd.value !== presetId) {
                dd.value = presetId;
            }

            renderWorkoutHUD();
            saveActiveSession();
            if ('vibrate' in navigator) navigator.vibrate(15);
        }
        window.selectWorkoutPreset = selectWorkoutPreset;

        function adjWorkoutWeight(delta) {
            if (!activeWorkoutPreset || !activeWorkoutPreset.exercises) return;
            const currentEx = activeWorkoutPreset.exercises[activeWorkoutExIndex];
            if (!currentEx) return;

            let cur = typeof currentEx.activeWeight === 'number' ? currentEx.activeWeight : (currentEx.defaultWeight || 60);
            cur = Math.max(0, Math.round((cur + delta) * 10) / 10);
            currentEx.activeWeight = cur;

            const input = document.getElementById('workoutInputWeight');
            if (input) input.value = cur;

            renderWorkoutHUD();
            saveActiveSession();
        }
        window.adjWorkoutWeight = adjWorkoutWeight;

        function setWorkoutWeight(val) {
            if (!activeWorkoutPreset || !activeWorkoutPreset.exercises) return;
            const currentEx = activeWorkoutPreset.exercises[activeWorkoutExIndex];
            if (!currentEx) return;

            let cur = Math.max(0, parseFloat(val) || 0);
            currentEx.activeWeight = cur;
            renderWorkoutHUD();
            saveActiveSession();
        }
        window.setWorkoutWeight = setWorkoutWeight;

        function adjWorkoutReps(delta) {
            if (!activeWorkoutPreset || !activeWorkoutPreset.exercises) return;
            const currentEx = activeWorkoutPreset.exercises[activeWorkoutExIndex];
            if (!currentEx) return;

            let cur = typeof currentEx.activeReps === 'number' ? currentEx.activeReps : (currentEx.defaultReps || 6);
            cur = Math.max(1, cur + delta);
            currentEx.activeReps = cur;

            const input = document.getElementById('workoutInputReps');
            if (input) input.value = cur;

            renderWorkoutHUD();
            saveActiveSession();
        }
        window.adjWorkoutReps = adjWorkoutReps;

        function setWorkoutReps(val) {
            if (!activeWorkoutPreset || !activeWorkoutPreset.exercises) return;
            const currentEx = activeWorkoutPreset.exercises[activeWorkoutExIndex];
            if (!currentEx) return;

            let cur = Math.max(1, parseInt(val, 10) || 1);
            currentEx.activeReps = cur;
            renderWorkoutHUD();
            saveActiveSession();
        }
        window.setWorkoutReps = setWorkoutReps;

        function getExercisePR(exerciseId) {
            let maxWeight = 0;
            let repsAtMax = 0;
            let max1RM = 0;
            let totalSessions = 0;

            const scanSets = (sets) => {
                (sets || []).forEach(st => {
                    if (st && st.completed && typeof st.weight === 'number' && st.weight > 0) {
                        const w = st.weight;
                        const r = st.reps || 1;
                        const est1RM = Math.round(w * (1 + r / 30));
                        if (w > maxWeight) {
                            maxWeight = w;
                            repsAtMax = r;
                        }
                        if (est1RM > max1RM) {
                            max1RM = est1RM;
                        }
                    }
                });
            };

            // Scan history
            (boulderHistory || []).forEach(s => {
                let hasEx = false;
                (s.workouts || []).forEach(w => {
                    (w.exercises || []).forEach(ex => {
                        if (ex.id === exerciseId && ex.setsData && ex.setsData.length > 0) {
                            scanSets(ex.setsData);
                            hasEx = true;
                        }
                    });
                });
                if (hasEx) totalSessions++;
            });

            // Scan active session
            (sessionWorkouts || []).forEach(w => {
                (w.exercises || []).forEach(ex => {
                    if (ex.id === exerciseId && ex.setsData && ex.setsData.length > 0) {
                        scanSets(ex.setsData);
                    }
                });
            });

            return {
                weight: maxWeight,
                reps: repsAtMax,
                est1RM: max1RM,
                sessions: totalSessions
            };
        }
        window.getExercisePR = getExercisePR;

        function startPresetWorkout(presetId) {
            if (!sessionStartTime) {
                startSession();
            }
            selectWorkoutPreset(presetId);
            switchLogMode('workout');
            switchTab('log');
            if ('vibrate' in navigator) navigator.vibrate([20, 40, 20]);
        }
        window.startPresetWorkout = startPresetWorkout;

        // ==========================================
        // HANG TIMER ENGINE & PROTOCOL STATE MACHINE
        // ==========================================
        let hangTimerState = 'idle'; // 'idle' | 'prep' | 'hang' | 'rep_rest' | 'paused'
        let hangPreviousState = 'idle';
        let hangTimerInterval = null;
        let hangTargetEpoch = 0;
        let hangTimeRemaining = 0;
        let hangPhaseTotalDuration = 0;
        let hangCurrentRep = 1;
        let hangTotalReps = 1;
        let hangRemainingMsOnPause = 0;

        function setCustomHangSeconds(secs) {
            if (!activeWorkoutPreset || !activeWorkoutPreset.exercises) return;
            const currentEx = activeWorkoutPreset.exercises[activeWorkoutExIndex];
            if (!currentEx) return;
            currentEx.hangSeconds = secs;
            renderWorkoutHUD();
            saveActiveSession();
            if ('vibrate' in navigator) navigator.vibrate(15);
        }
        window.setCustomHangSeconds = setCustomHangSeconds;

        function updateHangOverlayUI() {
            const overlay = document.getElementById('hangTimerOverlay');
            if (!overlay || overlay.classList.contains('hidden')) return;

            const setLabel = document.getElementById('hangOverlaySetLabel');
            const phaseBadge = document.getElementById('hangOverlayPhaseBadge');
            const subtitle = document.getElementById('hangOverlaySubtitle');
            const digits = document.getElementById('hangOverlayDigits');
            const progress = document.getElementById('hangOverlayProgressBar');
            const repCounter = document.getElementById('hangOverlayRepCounter');
            const pauseIcon = document.getElementById('hangOverlayPauseIcon');
            const pauseText = document.getElementById('hangOverlayPauseText');

            if (!activeWorkoutPreset) return;
            const currentEx = activeWorkoutPreset.exercises[activeWorkoutExIndex];
            const cfg = getExerciseHangConfig(activeWorkoutPreset, currentEx);
            const isRepeaters = cfg.isRepeaters;

            if (setLabel) {
                setLabel.innerText = isRepeaters 
                    ? `Set ${activeWorkoutExIndex + 1} of ${activeWorkoutPreset.exercises.length}`
                    : `Hang ${activeWorkoutExIndex + 1} of ${activeWorkoutPreset.exercises.length}`;
            }

            if (repCounter) {
                if (hangTotalReps > 1) {
                    repCounter.style.display = 'block';
                    repCounter.innerText = `Rep ${hangCurrentRep} of ${hangTotalReps}`;
                } else {
                    repCounter.style.display = 'none';
                }
            }

            if (digits) {
                digits.innerText = hangTimeRemaining;
            }

            // Progress bar percentage
            if (progress && hangPhaseTotalDuration > 0) {
                const pct = Math.max(0, Math.min(100, (hangTimeRemaining / hangPhaseTotalDuration) * 100));
                progress.style.width = `${pct}%`;
            }

            // Phase-specific visuals
            if (hangTimerState === 'paused') {
                if (phaseBadge) {
                    phaseBadge.innerText = 'PAUSED';
                    phaseBadge.className = 'text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700';
                }
                if (subtitle) subtitle.innerText = 'Timer Paused · Tap Resume to Continue';
                if (digits) digits.className = 'text-[7.5rem] sm:text-[9.5rem] font-black tracking-tighter leading-none font-mono text-neutral-400 select-none';
                if (pauseIcon) pauseIcon.innerText = '▶️';
                if (pauseText) pauseText.innerText = 'Resume';
            } else if (hangTimerState === 'prep') {
                if (phaseBadge) {
                    phaseBadge.innerText = 'GET READY';
                    phaseBadge.className = 'text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40';
                }
                if (subtitle) subtitle.innerText = 'Hands on Board · Establish Grip';
                if (digits) digits.className = 'text-[7.5rem] sm:text-[9.5rem] font-black tracking-tighter leading-none font-mono text-amber-400 drop-shadow-[0_0_40px_rgba(245,158,11,0.35)] select-none';
                if (progress) progress.className = 'h-full bg-amber-400 transition-all duration-200';
                if (pauseIcon) pauseIcon.innerText = '⏸️';
                if (pauseText) pauseText.innerText = 'Pause';
            } else if (hangTimerState === 'hang') {
                if (phaseBadge) {
                    phaseBadge.innerText = 'HANG!';
                    phaseBadge.className = 'text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-pulse';
                }
                if (subtitle) subtitle.innerText = 'STRICT HALF-CRIMP · HOLD ON!';
                if (digits) digits.className = 'text-[7.5rem] sm:text-[9.5rem] font-black tracking-tighter leading-none font-mono text-emerald-400 drop-shadow-[0_0_40px_rgba(16,185,129,0.4)] select-none';
                if (progress) progress.className = 'h-full bg-emerald-500 transition-all duration-200';
                if (pauseIcon) pauseIcon.innerText = '⏸️';
                if (pauseText) pauseText.innerText = 'Pause';
            } else if (hangTimerState === 'rep_rest') {
                if (phaseBadge) {
                    phaseBadge.innerText = 'SHAKE';
                    phaseBadge.className = 'text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40';
                }
                if (subtitle) subtitle.innerText = 'SHAKE HANDS · CHALK UP';
                if (digits) digits.className = 'text-[7.5rem] sm:text-[9.5rem] font-black tracking-tighter leading-none font-mono text-cyan-400 drop-shadow-[0_0_40px_rgba(6,182,212,0.35)] select-none';
                if (progress) progress.className = 'h-full bg-cyan-400 transition-all duration-200';
                if (pauseIcon) pauseIcon.innerText = '⏸️';
                if (pauseText) pauseText.innerText = 'Pause';
            }
        }

        function startHangTimer() {
            if (!activeWorkoutPreset || !activeWorkoutPreset.exercises) return;
            const currentEx = activeWorkoutPreset.exercises[activeWorkoutExIndex];
            if (!currentEx) return;

            // Safety: close rest timer overlay if open
            if (typeof window.cancelRestTimer === 'function' && window.isRestTimerRunning && window.isRestTimerRunning()) {
                window.cancelRestTimer();
            }
            const restOverlay = document.getElementById('restOverlay');
            if (restOverlay) restOverlay.classList.replace('flex', 'hidden');
            const restFin = document.getElementById('restOverlayFinished');
            if (restFin) restFin.classList.replace('flex', 'hidden');

            const overlay = document.getElementById('hangTimerOverlay');
            if (overlay) {
                overlay.classList.remove('hidden');
                overlay.classList.add('flex');
            }

            if (typeof window.requestScreenWakeLock === 'function') {
                window.requestScreenWakeLock();
            }

            const cfg = getExerciseHangConfig(activeWorkoutPreset, currentEx);
            const prepSecs = cfg.prepSeconds;
            hangTotalReps = cfg.repsPerSet;
            hangCurrentRep = 1;

            transitionHangState('prep', prepSecs);
        }
        window.startHangTimer = startHangTimer;

        function transitionHangState(newState, durationSecs) {
            if (hangTimerInterval) {
                clearInterval(hangTimerInterval);
                hangTimerInterval = null;
            }

            hangTimerState = newState;
            hangPhaseTotalDuration = durationSecs;
            hangTimeRemaining = durationSecs;
            hangTargetEpoch = Date.now() + (durationSecs * 1000);

            if (newState === 'prep') {
                if (typeof window.playIntervalBeep === 'function') window.playIntervalBeep('prep');
                if (typeof window.playHangVibration === 'function') window.playHangVibration('prep');
            } else if (newState === 'hang') {
                if (typeof window.playIntervalBeep === 'function') window.playIntervalBeep('hang_start');
                if (typeof window.playHangVibration === 'function') window.playHangVibration('hang_start');
            } else if (newState === 'rep_rest') {
                if (typeof window.playIntervalBeep === 'function') window.playIntervalBeep('rep_rest');
                if (typeof window.playHangVibration === 'function') window.playHangVibration('prep');
            }

            updateHangOverlayUI();

            let lastSecondsTicked = hangTimeRemaining;

            hangTimerInterval = setInterval(() => {
                const remaining = Math.max(0, Math.ceil((hangTargetEpoch - Date.now()) / 1000));
                hangTimeRemaining = remaining;
                updateHangOverlayUI();

                // Audible countdown tick on last 3 seconds
                if (remaining <= 3 && remaining > 0 && remaining !== lastSecondsTicked) {
                    lastSecondsTicked = remaining;
                    if (typeof window.playIntervalBeep === 'function') window.playIntervalBeep('prep');
                    if (typeof window.playHangVibration === 'function') window.playHangVibration('prep');
                }

                if (remaining <= 0) {
                    clearInterval(hangTimerInterval);
                    hangTimerInterval = null;
                    handleHangPhaseComplete();
                }
            }, 100);
        }

        function handleHangPhaseComplete() {
            if (!activeWorkoutPreset) return;
            const currentEx = activeWorkoutPreset.exercises[activeWorkoutExIndex];
            if (!currentEx) return;

            const cfg = getExerciseHangConfig(activeWorkoutPreset, currentEx);
            const hangSecs = cfg.hangSeconds;
            const repRestSecs = cfg.repRestSeconds;

            if (hangTimerState === 'prep') {
                // Transition from prep into hang
                transitionHangState('hang', hangSecs);
            } else if (hangTimerState === 'hang') {
                // Hang duration fulfilled!
                // Loud release buzzer & distinct vibration
                if (typeof window.playIntervalBeep === 'function') window.playIntervalBeep('hang_stop');
                if (typeof window.playHangVibration === 'function') window.playHangVibration('hang_stop');

                // High-visibility release flash
                const flash = document.getElementById('hangOverlayReleaseFlash');
                if (flash) {
                    flash.classList.remove('hidden');
                    flash.classList.add('flex');
                    setTimeout(() => {
                        flash.classList.remove('flex');
                        flash.classList.add('hidden');
                    }, 1200);
                }

                if (hangCurrentRep < hangTotalReps) {
                    // Shakeout before next rep
                    transitionHangState('rep_rest', repRestSecs);
                } else {
                    // Entire set or hang completed!
                    completeHangSet();
                }
            } else if (hangTimerState === 'rep_rest') {
                // Shakeout completed: move to next rep
                hangCurrentRep++;
                transitionHangState('hang', hangSecs);
            }
        }

        function completeHangSet() {
            if (!activeWorkoutPreset || !activeWorkoutPreset.exercises) return;
            const currentEx = activeWorkoutPreset.exercises[activeWorkoutExIndex];
            if (!currentEx) return;

            const cfg = getExerciseHangConfig(activeWorkoutPreset, currentEx);
            const setRestSecs = cfg.setRestSeconds || currentEx.restSeconds || 150;

            if (typeof window.playIntervalBeep === 'function') window.playIntervalBeep('set_complete');
            if (typeof window.playHangVibration === 'function') window.playHangVibration('set_complete');

            // Mark set completed
            currentEx.completedSets = (currentEx.completedSets || 0) + 1;
            const activeW = typeof currentEx.activeWeight === 'number' ? currentEx.activeWeight : (currentEx.defaultWeight || 0);
            currentEx.setsData = currentEx.setsData || [];
            currentEx.setsData[currentEx.completedSets - 1] = {
                set: currentEx.completedSets,
                weight: currentEx.trackWeight ? activeW : 0,
                reps: cfg.repsPerSet,
                hangSeconds: cfg.hangSeconds,
                completed: true
            };

            saveActiveSession();
            recomputeSessionScore();
            renderSessionList();

            // Stop hang timer & hide overlay
            stopHangTimer(false);

            // If more hangs/sets exist in preset, advance to next
            const hasMoreSets = activeWorkoutExIndex < activeWorkoutPreset.exercises.length - 1;
            if (hasMoreSets) {
                activeWorkoutExIndex++;
            }
            renderWorkoutHUD();

            // Update rest overlay context and skip button before opening rest timer
            const contextLabel = document.getElementById('restOverlayContextLabel');
            const skipBtn = document.getElementById('restOverlaySkipToHangBtn');
            const skipLabel = document.getElementById('restOverlaySkipToHangLabel');

            if (hasMoreSets) {
                const nextNum = activeWorkoutExIndex + 1;
                const total = activeWorkoutPreset.exercises.length;
                if (contextLabel) {
                    contextLabel.innerText = cfg.isRepeaters 
                        ? `Resting Before Set ${nextNum} of ${total}` 
                        : `Resting Before Hang ${nextNum} of ${total}`;
                }
                if (skipBtn) {
                    skipBtn.classList.remove('hidden');
                }
                if (skipLabel) {
                    skipLabel.innerText = cfg.isRepeaters 
                        ? `Skip Rest & Start Set ${nextNum}` 
                        : `Skip Rest & Start Hang ${nextNum}`;
                }
            } else {
                if (contextLabel) {
                    contextLabel.innerText = 'All Sets Completed! Cool Down Rest';
                }
                if (skipBtn) {
                    skipBtn.classList.add('hidden');
                }
            }

            // Auto-transition into set rest countdown
            if (typeof window.startRestTimer === 'function') {
                window.startRestTimer(setRestSecs, true);
            }
        }

        function togglePauseHangTimer() {
            if (hangTimerState === 'paused') {
                // Resume
                hangTimerState = hangPreviousState;
                hangTargetEpoch = Date.now() + hangRemainingMsOnPause;
                transitionHangState(hangTimerState, Math.max(1, Math.ceil(hangRemainingMsOnPause / 1000)));
            } else if (hangTimerInterval) {
                // Pause
                clearInterval(hangTimerInterval);
                hangTimerInterval = null;
                hangRemainingMsOnPause = Math.max(0, hangTargetEpoch - Date.now());
                hangPreviousState = hangTimerState;
                hangTimerState = 'paused';
                updateHangOverlayUI();
            }
        }
        window.togglePauseHangTimer = togglePauseHangTimer;

        function skipHangPhase() {
            if (hangTimerInterval) {
                clearInterval(hangTimerInterval);
                hangTimerInterval = null;
            }
            handleHangPhaseComplete();
        }
        window.skipHangPhase = skipHangPhase;

        function stopHangTimer(releaseWakeLock = true) {
            if (hangTimerInterval) {
                clearInterval(hangTimerInterval);
                hangTimerInterval = null;
            }
            hangTimerState = 'idle';
            const overlay = document.getElementById('hangTimerOverlay');
            if (overlay) {
                overlay.classList.remove('flex');
                overlay.classList.add('hidden');
            }
            if (releaseWakeLock && typeof window.releaseScreenWakeLock === 'function') {
                window.releaseScreenWakeLock();
            }
        }
        window.stopHangTimer = stopHangTimer;
        window.getHangTimerState = () => hangTimerState;
        window.getHangTimeRemaining = () => hangTimeRemaining;
        window.getHangCurrentRep = () => hangCurrentRep;

        // Wall-clock recovery for hang timer
        function syncHangTimerFromWallClock() {
            if (hangTimerInterval && hangTimerState !== 'paused' && hangTimerState !== 'idle') {
                const remaining = Math.max(0, Math.ceil((hangTargetEpoch - Date.now()) / 1000));
                hangTimeRemaining = remaining;
                updateHangOverlayUI();
                if (remaining <= 0) {
                    clearInterval(hangTimerInterval);
                    hangTimerInterval = null;
                    handleHangPhaseComplete();
                }
            }
        }
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                syncHangTimerFromWallClock();
            }
        });
        window.addEventListener('focus', syncHangTimerFromWallClock);

        function skipRestAndStartNextHang() {
            if (typeof window.cancelRestTimer === 'function') {
                window.cancelRestTimer();
            }
            const overlay = document.getElementById('restOverlay');
            if (overlay) {
                overlay.classList.replace('flex', 'hidden');
            }
            const fin = document.getElementById('restOverlayFinished');
            if (fin) {
                fin.classList.replace('flex', 'hidden');
            }
            const skipBtn = document.getElementById('restOverlaySkipToHangBtn');
            if (skipBtn) {
                skipBtn.classList.add('hidden');
            }
            if ('vibrate' in navigator) navigator.vibrate([30, 50, 30]);
            startHangTimer();
        }
        window.skipRestAndStartNextHang = skipRestAndStartNextHang;

        function handleRestOverlayFinishedClick() {
            const fin = document.getElementById('restOverlayFinished');
            if (fin) fin.classList.replace('flex', 'hidden');
            const overlay = document.getElementById('restOverlay');
            if (overlay) overlay.classList.replace('flex', 'hidden');

            const skipBtn = document.getElementById('restOverlaySkipToHangBtn');
            if (skipBtn) skipBtn.classList.add('hidden');

            // If this was a hangboard workout and there are more sets, start next hang timer
            if (activeWorkoutPreset && activeWorkoutPreset.exercises) {
                const currentEx = activeWorkoutPreset.exercises[activeWorkoutExIndex];
                const cfg = getExerciseHangConfig(activeWorkoutPreset, currentEx);
                if (cfg.isHang && activeWorkoutExIndex < activeWorkoutPreset.exercises.length) {
                    const isFinishedAll = (currentEx.completedSets || 0) >= (currentEx.sets || 1) && activeWorkoutExIndex === activeWorkoutPreset.exercises.length - 1;
                    if (!isFinishedAll) {
                        if ('vibrate' in navigator) navigator.vibrate([40, 60, 40]);
                        startHangTimer();
                        return;
                    }
                }
            }
        }
        window.handleRestOverlayFinishedClick = handleRestOverlayFinishedClick;

        function onRestTimerFinished() {
            const title = document.getElementById('restFinishedTitle');
            const skipBtn = document.getElementById('restOverlaySkipToHangBtn');
            if (skipBtn) skipBtn.classList.add('hidden');

            if (activeWorkoutPreset && activeWorkoutPreset.exercises) {
                const currentEx = activeWorkoutPreset.exercises[activeWorkoutExIndex];
                const cfg = getExerciseHangConfig(activeWorkoutPreset, currentEx);
                if (cfg.isHang) {
                    const isLastEx = activeWorkoutExIndex >= activeWorkoutPreset.exercises.length - 1 && (currentEx.completedSets || 0) >= (currentEx.sets || 1);
                    if (isLastEx) {
                        if (title) {
                            title.innerHTML = `WORKOUT<br><span class="text-3xl sm:text-4xl">COMPLETE! 🏆</span>`;
                        }
                    } else {
                        const nextNum = activeWorkoutExIndex + 1;
                        const totalSets = activeWorkoutPreset.exercises.length;
                        const label = cfg.isRepeaters ? `SET ${nextNum}` : `HANG ${nextNum}`;
                        if (title) {
                            title.innerHTML = `<span class="text-sm uppercase tracking-widest text-black/70 font-black block mb-2">REST FINISHED!</span>TAP TO START<br><span class="text-4xl sm:text-5xl underline decoration-black decoration-4">${label} ▶</span><span class="text-xs uppercase tracking-widest text-black/70 font-bold block mt-3">(Set ${nextNum} of ${totalSets})</span>`;
                        }
                    }
                    return;
                }
            }

            // Default bouldering / general rest completion
            if (title) {
                title.innerHTML = 'GO<br>CLIMB!';
            }
        }
        window.onRestTimerFinished = onRestTimerFinished;

        function renderWorkoutHUD() {
            if (!activeWorkoutPreset || !activeWorkoutPreset.exercises || activeWorkoutPreset.exercises.length === 0) return;

            const exercises = activeWorkoutPreset.exercises;
            if (activeWorkoutExIndex < 0) activeWorkoutExIndex = 0;
            if (activeWorkoutExIndex >= exercises.length) activeWorkoutExIndex = exercises.length - 1;

            const currentEx = exercises[activeWorkoutExIndex];

            // Update banner
            const bannerIcon = document.getElementById('workoutBannerIcon');
            const bannerTitle = document.getElementById('workoutBannerTitle');
            if (bannerIcon) bannerIcon.innerText = activeWorkoutPreset.icon || '💪';
            if (bannerTitle) bannerTitle.innerText = activeWorkoutPreset.shortName || activeWorkoutPreset.name;

            // Sync quick-chips and dropdown
            const chips = ['bench_press', 'antagonist_armor', 'repeaters_7_3', 'max_hangs', 'climber_core', 'mobility_flow'];
            chips.forEach(cid => {
                const el = document.getElementById('quickChip_' + cid);
                if (el) {
                    if (cid === activeWorkoutPreset.id) {
                        el.className = 'px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap bg-emerald-500 text-black shadow-sm';
                    } else {
                        el.className = 'px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white';
                    }
                }
            });
            const dd = document.getElementById('workoutPresetDropdown');
            if (dd && dd.value !== activeWorkoutPreset.id) {
                dd.value = activeWorkoutPreset.id;
            }

            // Update Exercise Card
            const catBadge = document.getElementById('workoutExCategoryBadge');
            const exProgress = document.getElementById('workoutExProgress');
            const exTitle = document.getElementById('workoutExTitle');
            const exTarget = document.getElementById('workoutExTarget');
            const exDesc = document.getElementById('workoutExDesc');
            const restBtnLabel = document.getElementById('workoutRestBtnLabel');

            if (catBadge) catBadge.innerText = activeWorkoutPreset.badge || 'Workout';
            if (exProgress) exProgress.innerText = `Exercise ${activeWorkoutExIndex + 1} of ${exercises.length}`;
            if (exTitle) exTitle.innerText = currentEx.name;
            if (exTarget) exTarget.innerText = `${currentEx.sets} sets × ${currentEx.reps}`;
            if (exDesc) exDesc.innerText = currentEx.desc || '';
            if (restBtnLabel) restBtnLabel.innerText = `Rest ${currentEx.restSeconds || 60}s`;

            // Weight & Reps Stepper Handling
            const weightRepsContainer = document.getElementById('workoutWeightRepsContainer');
            if (weightRepsContainer) {
                if (currentEx.trackWeight) {
                    weightRepsContainer.classList.remove('hidden');
                    weightRepsContainer.classList.add('flex');

                    const activeW = typeof currentEx.activeWeight === 'number' ? currentEx.activeWeight : (currentEx.defaultWeight || 0);
                    const activeR = typeof currentEx.activeReps === 'number' ? currentEx.activeReps : (currentEx.defaultReps || 1);

                    const inputW = document.getElementById('workoutInputWeight');
                    const inputR = document.getElementById('workoutInputReps');
                    if (inputW && inputW !== document.activeElement) inputW.value = activeW;
                    if (inputR && inputR !== document.activeElement) inputR.value = activeR;

                    const prBadge = document.getElementById('workoutExPRBadge');
                    if (prBadge) {
                        const pr = getExercisePR(currentEx.id);
                        if (pr.weight > 0) {
                            prBadge.innerText = `🏆 PR: ${pr.weight} kg × ${pr.reps} (1RM: ${pr.est1RM} kg)`;
                        } else {
                            prBadge.innerText = `🏆 PR: No logs yet`;
                        }
                    }
                } else {
                    weightRepsContainer.classList.add('hidden');
                    weightRepsContainer.classList.remove('flex');
                }
            }

            // Hangboard Controller Handling
            const hangController = document.getElementById('workoutHangController');
            const setsPrompt = document.getElementById('workoutSetsPrompt');
            const cfg = getExerciseHangConfig(activeWorkoutPreset, currentEx);
            const isHangWorkout = cfg.isHang;
            if (hangController) {
                if (isHangWorkout) {
                    hangController.classList.remove('hidden');
                    hangController.classList.add('flex');
                    if (setsPrompt) setsPrompt.innerText = 'Or tap set to mark manually:';

                    const isRepeaters = cfg.isRepeaters;
                    const startBtnLabel = document.getElementById('btnStartHangLabel');
                    const helperPrompt = document.getElementById('hangHelperPrompt');
                    const protocolBadge = document.getElementById('hangPresetProtocolBadge');
                    const durationRow = document.getElementById('hangDurationChipsRow');

                    const hangSecs = currentEx.hangSeconds || cfg.hangSeconds;

                    if (isRepeaters) {
                        if (startBtnLabel) startBtnLabel.innerText = `START SET ${activeWorkoutExIndex + 1} (${cfg.repsPerSet} × ${cfg.hangSeconds}:${cfg.repRestSeconds})`;
                        if (helperPrompt) helperPrompt.innerText = `${cfg.prepSeconds}s Prep → ${cfg.repsPerSet} × (${cfg.hangSeconds}s Hang / ${cfg.repRestSeconds}s Shake) → Auto ${Math.round(cfg.setRestSeconds / 60 * 10) / 10}m Rest`;
                        if (protocolBadge) protocolBadge.innerText = `${cfg.hangSeconds}s/${cfg.repRestSeconds}s × ${cfg.repsPerSet}`;
                        if (durationRow) durationRow.classList.add('hidden');
                    } else {
                        if (startBtnLabel) startBtnLabel.innerText = `START HANG ${activeWorkoutExIndex + 1} (${hangSecs}s)`;
                        if (helperPrompt) helperPrompt.innerText = `${cfg.prepSeconds}s Prep Chime → ${hangSecs}s Hang → Release Buzzer`;
                        if (protocolBadge) protocolBadge.innerText = `${hangSecs}s @ Max`;
                        if (durationRow) durationRow.classList.remove('hidden');

                        [5, 7, 10, 15].forEach(s => {
                            const chip = document.getElementById('hangSecChip_' + s);
                            if (chip) {
                                if (s === hangSecs) {
                                    chip.className = 'px-2 py-0.5 rounded-lg text-[10px] font-black uppercase bg-emerald-500 text-black shadow-sm';
                                } else {
                                    chip.className = 'px-2 py-0.5 rounded-lg text-[10px] font-black uppercase bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white';
                                }
                            }
                        });
                    }
                } else {
                    hangController.classList.add('hidden');
                    hangController.classList.remove('flex');
                    if (setsPrompt) setsPrompt.innerText = 'Tap set to log weight & reps:';
                }
            }

            // Navigation Buttons
            const btnPrev = document.getElementById('btnPrevExercise');
            const btnNext = document.getElementById('btnNextExercise');
            if (btnPrev) {
                btnPrev.disabled = activeWorkoutExIndex === 0;
                btnPrev.style.opacity = activeWorkoutExIndex === 0 ? '0.4' : '1';
            }
            if (btnNext) {
                const isLast = activeWorkoutExIndex === exercises.length - 1;
                btnNext.innerText = isLast ? 'Done ✓' : 'Next ▶';
            }

            // Render Sets Grid
            const setsGrid = document.getElementById('workoutSetsGrid');
            if (setsGrid) {
                const totalSets = currentEx.sets || 3;
                const completedSets = currentEx.completedSets || 0;
                const setsData = currentEx.setsData || [];
                const activeW = typeof currentEx.activeWeight === 'number' ? currentEx.activeWeight : (currentEx.defaultWeight || 60);
                const activeR = typeof currentEx.activeReps === 'number' ? currentEx.activeReps : (currentEx.defaultReps || 6);

                let setsHtml = '';
                for (let s = 0; s < totalSets; s++) {
                    const isDone = s < completedSets;
                    const setData = setsData[s];
                    let setLabel = `Set ${s + 1}`;
                    if (currentEx.trackWeight) {
                        if (isDone && setData) {
                            setLabel = `Set ${s + 1}: ${setData.weight}kg × ${setData.reps}`;
                        } else {
                            setLabel = `Set ${s + 1} (${activeW}kg × ${activeR})`;
                        }
                    }

                    setsHtml += `
                        <button onclick="toggleWorkoutSet(${s})" class="py-2.5 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 active:scale-95 border ${
                            isDone
                                ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400 shadow-sm'
                                : 'bg-neutral-800/80 border-neutral-700/80 text-neutral-300 hover:border-neutral-500'
                        }">
                            <span>${isDone ? '✓' : '○'}</span>
                            <span class="truncate">${setLabel}</span>
                        </button>
                    `;
                }
                setsGrid.innerHTML = setsHtml;
            }
        }
        window.renderWorkoutHUD = renderWorkoutHUD;

        function toggleWorkoutSet(setIdx) {
            if (!activeWorkoutPreset || !activeWorkoutPreset.exercises) return;
            const currentEx = activeWorkoutPreset.exercises[activeWorkoutExIndex];
            if (!currentEx) return;

            currentEx.setsData = currentEx.setsData || [];
            const currentCompleted = currentEx.completedSets || 0;
            const activeW = typeof currentEx.activeWeight === 'number' ? currentEx.activeWeight : (currentEx.defaultWeight || 60);
            const activeR = typeof currentEx.activeReps === 'number' ? currentEx.activeReps : (currentEx.defaultReps || 6);

            if (setIdx === currentCompleted) {
                // Completing next set
                currentEx.setsData[setIdx] = {
                    set: setIdx + 1,
                    weight: currentEx.trackWeight ? activeW : 0,
                    reps: currentEx.trackWeight ? activeR : (parseInt(currentEx.reps) || 10),
                    completed: true
                };
                currentEx.completedSets = currentCompleted + 1;
                if ('vibrate' in navigator) navigator.vibrate([15, 30, 15]);
                if (typeof window.playIntervalBeep === 'function') window.playIntervalBeep('work');

                // Trigger chalk-friendly rest timer
                const restSecs = currentEx.restSeconds || 60;
                if (typeof window.startRestTimer === 'function') {
                    window.startRestTimer(restSecs, true);
                }
            } else if (setIdx < currentCompleted) {
                // Tapping an already completed set: undo back to this set
                currentEx.completedSets = setIdx;
                currentEx.setsData = currentEx.setsData.slice(0, setIdx);
                if ('vibrate' in navigator) navigator.vibrate(10);
            } else {
                // Tapping set ahead: mark up to this set
                for (let i = currentCompleted; i <= setIdx; i++) {
                    currentEx.setsData[i] = {
                        set: i + 1,
                        weight: currentEx.trackWeight ? activeW : 0,
                        reps: currentEx.trackWeight ? activeR : (parseInt(currentEx.reps) || 10),
                        completed: true
                    };
                }
                currentEx.completedSets = setIdx + 1;
                if ('vibrate' in navigator) navigator.vibrate([15, 30, 15]);
                const restSecs = currentEx.restSeconds || 60;
                if (typeof window.startRestTimer === 'function') {
                    window.startRestTimer(restSecs, true);
                }
            }

            if (!sessionStartTime) {
                startSession();
            }

            recomputeSessionScore();
            renderWorkoutHUD();
            renderSessionList();
            saveActiveSession();
        }
        window.toggleWorkoutSet = toggleWorkoutSet;

        function navWorkoutExercise(dir) {
            if (!activeWorkoutPreset || !activeWorkoutPreset.exercises) return;
            const exercises = activeWorkoutPreset.exercises;

            if (dir > 0 && activeWorkoutExIndex === exercises.length - 1) {
                // User pressed Done on final exercise
                if ('vibrate' in navigator) navigator.vibrate([20, 50, 20]);
                if (typeof confetti === 'function') {
                    confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 }, colors: ['#10b981', '#3b82f6'] });
                }
                switchTab('session');
                return;
            }

            activeWorkoutExIndex = Math.max(0, Math.min(exercises.length - 1, activeWorkoutExIndex + dir));
            if ('vibrate' in navigator) navigator.vibrate(15);
            renderWorkoutHUD();
            saveActiveSession();
        }
        window.navWorkoutExercise = navWorkoutExercise;

        function triggerWorkoutRest() {
            if (!activeWorkoutPreset || !activeWorkoutPreset.exercises) return;
            const currentEx = activeWorkoutPreset.exercises[activeWorkoutExIndex];
            const restSecs = (currentEx && currentEx.restSeconds) ? currentEx.restSeconds : 60;
            if (typeof window.startRestTimer === 'function') {
                window.startRestTimer(restSecs, true);
            }
        }
        window.triggerWorkoutRest = triggerWorkoutRest;

        function openWorkoutPresetPicker() {
            const dd = document.getElementById('workoutPresetDropdown');
            if (dd) {
                dd.focus();
                try { dd.showPicker(); } catch (e) {}
            } else {
                switchTab('planner');
            }
        }
        window.openWorkoutPresetPicker = openWorkoutPresetPicker;

        function recomputeSessionScore() {
            const climbPts = (sessionClimbs || []).reduce((acc, c) => acc + (c.points || 0), 0);
            const workoutPts = (sessionWorkouts || []).reduce((acc, w) => {
                return acc + (w.exercises || []).reduce((eAcc, ex) => eAcc + ((ex.completedSets || 0) * 10), 0);
            }, 0);
            sessionScore = climbPts + workoutPts;
            const scoreEl = document.getElementById('sessionScoreDisplay');
            if (scoreEl) scoreEl.innerText = sessionScore;
            updateSessionMetrics();
            return sessionScore;
        }
        window.recomputeSessionScore = recomputeSessionScore;
        window.getSessionWorkouts = () => sessionWorkouts;
        window.getActiveLogMode = () => activeLogMode;

        const tryPtsMap   = [1, 2, 3, 5, 8, 12, 18, 25];
        const topBonusMap = [3, 5, 8, 12, 22, 35, 55, 80];
        const flashBonusMap = [2, 3, 5, 8, 15, 25, 40, 60];

        function calculatePoints(delta, flashed, topped, attempts, completionPct = 0) {
            // Points mapping based on difficulty relative to max grade (delta)
            // Indices: -Infinity..-5, -4, -3, -2, -1, 0, 1, 2+
            const getMapValue = (valArray, d) => {
                const idx = d <= -5 ? 0 : d >= 2 ? 7 : d + 5;
                return valArray[idx];
            };
            const tryPts = getMapValue(tryPtsMap, delta);
            const topBonus = getMapValue(topBonusMap, delta);
            const flashBonus = getMapValue(flashBonusMap, delta);

            if (flashed) return tryPts + topBonus + flashBonus;
            if (topped)  return (attempts * tryPts) + topBonus;
            
            // Project points with partial completion bonus
            const basePts = Math.min(attempts, 8) * tryPts;
            const progressBonus = Math.round(topBonus * (completionPct / 100) * 0.4);
            return basePts + progressBonus;
        }

        function logClimb() {
            if ('vibrate' in navigator) navigator.vibrate(50);
            const delta = currentGradeIndex - maxGradeIndex;
            const points = calculatePoints(delta, isFlash, isTop, tries);

            let statusText = "Project";
            let color = "text-neutral-400";
            if (isFlash) { statusText = "Flash"; color = "text-amber-400"; }
            else if (isTop) { statusText = "Top"; color = "text-blue-400"; }

            // ACHIEVEMENT CHECKS
            if (isTop || isFlash) {
                unlockAchievement('first_blood');
                if (isFlash && delta === 0) unlockAchievement('the_flash');
                if (delta > 0) unlockAchievement('crusher');
                if (tries >= 5) unlockAchievement('dedication');
                const totalScoreNow = typeof getTotalScore === 'function' ? getTotalScore() : sessionScore;
                if (totalScoreNow + points >= 1000) unlockAchievement('centurion');

                if (currentGradeIndex > maxGradeIndex) {
                    maxGradeIndex = currentGradeIndex;
                    const selectMax = document.getElementById('vMax');
                    if (selectMax) selectMax.value = maxGradeIndex;
                    localStorage.setItem('boulderMaxGradeIndex', maxGradeIndex);
                    
                    // Cool animation for new max grade
                    if (typeof confetti === 'function') {
                        confetti({ particleCount: 300, spread: 160, origin: { y: 0.5 }, startVelocity: 45, colors: ['#ff0000', '#00ff00', '#3b82f6', '#fbbf24', '#10b981'] });
                    }
                    const displayGradeEl = document.getElementById('displayGrade') || document.getElementById('modalDisplayGrade');
                    if (displayGradeEl) {
                        displayGradeEl.classList.add('scale-150', 'text-amber-400', 'drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]');
                        setTimeout(() => {
                            displayGradeEl.classList.remove('scale-150', 'text-amber-400', 'drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]');
                        }, 1200);
                    }
                } else if (delta === 0) {
                    if (typeof confetti === 'function') {
                        confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 }, colors: ['#10b981'] });
                    }
                }
            }

            sessionScore += points;

            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

            sessionClimbs.unshift({
                id: climbIdCounter++,
                gradeStr: fontGrades[currentGradeIndex],
                statusText, color, tries, points,
                time: timeStr,
                tags: [...selectedTags]
            });

            if (!sessionStartTime) {
                startSession();
            }
            if (sessionClimbs.length >= 15) unlockAchievement('volume_day');

            // Check session-based achievements after adding climb
            const sendsInSession = sessionClimbs.filter(c => c.statusText === 'Top' || c.statusText === 'Flash').length;
            if (sendsInSession >= 10) unlockAchievement('double_digits');

            const uniqueSendGrades = new Set(sessionClimbs.filter(c => c.statusText === 'Top' || c.statusText === 'Flash').map(c => c.gradeStr));
            if (uniqueSendGrades.size >= 3) unlockAchievement('hat_trick');

            const allSessionTags = new Set(sessionClimbs.flatMap(c => c.tags || []));
            if (allSessionTags.size >= 8) unlockAchievement('all_rounder');

            renderSessionList();
            saveActiveSession();
            checkLiveFatigueAlert();
            checkIntraSessionAdaptation();
            if (btnSubmit) {
                btnSubmit.innerText = `+${points} ADDED`;
                btnSubmit.classList.add('bg-emerald-400', 'text-black', 'border-emerald-400');

                setTimeout(() => {
                    btnSubmit.classList.remove('bg-emerald-400', 'text-black', 'border-emerald-400');
                    updateSubmitButtonLabel();
                }, 800);
            }

            const wasSend = (isTop || isFlash);

            selectedTags = [];
            tries = 1;
            burnsRecorded = 0;
            if (elTries) elTries.innerText = 1;
            isTop = false;
            isFlash = false;
            flashManuallyDisabled = false;
            updateUI();
            renderTags();
        }

        // ============================================================================
        // COLOR PALETTE & GYM PRESETS
        // ============================================================================
        const COLOR_PALETTE = [
            { id: 'red', name: 'Red', hex: '#ef4444', border: '#b91c1c' },
            { id: 'blue', name: 'Blue', hex: '#3b82f6', border: '#1d4ed8' },
            { id: 'yellow', name: 'Yellow', hex: '#eab308', border: '#a16207' },
            { id: 'green', name: 'Green', hex: '#10b981', border: '#047857' },
            { id: 'black', name: 'Black', hex: '#171717', border: '#525252' },
            { id: 'white', name: 'White', hex: '#f5f5f5', border: '#a3a3a3' },
            { id: 'orange', name: 'Orange', hex: '#f97316', border: '#c2410c' },
            { id: 'purple', name: 'Purple', hex: '#a855f7', border: '#7e22ce' },
            { id: 'pink', name: 'Pink', hex: '#ec4899', border: '#be185d' },
            { id: 'grey', name: 'Grey', hex: '#737373', border: '#404040' }
        ];

        function getColorObj(id) {
            return COLOR_PALETTE.find(c => c.id === id) || COLOR_PALETTE[0];
        }

        // ============================================================================
        // MODAL STATE & CONTROLLER (CLIMB & WORKOUT ADD / EDIT)
        // ============================================================================
        let modalMode = 'climb'; // 'climb' | 'workout'
        let modalAction = 'add'; // 'add' | 'edit'
        let editingRouteId = null;
        let editingWorkoutId = null;
        let modalGradeIndex = 5; // default 6A
        let modalColorTag = 'red';
        let modalSelectedTags = [];
        let modalTries = 1;
        let modalCompletion = 0;

        let modalWorkoutPresetId = 'bench_press';
        let modalWorkoutWeight = 60;
        let modalWorkoutReps = 6;
        let modalWorkoutSets = [false, false, false, false];

        const WORKOUT_PRESET_ITEMS = [
            { id: 'bench_press', name: 'Barbell Bench Press', icon: '🏋️', badge: 'Strength', trackWeight: true, defaultWeight: 60, defaultReps: 6, repsUnit: 'reps', sets: 4, desc: 'Touch chest with control, drive upward with active scapular retraction.' },
            { id: 'max_hangs', name: 'Max Hangs', icon: '🧗', badge: 'Max Recruitment', trackWeight: true, defaultWeight: 0, defaultReps: 1, repsUnit: 'hang', sets: 5, desc: '10s maximum hang on 20mm edge with 3m rest.' },
            { id: 'repeaters_7_3', name: '7:3 Repeaters', icon: '⚡', badge: 'Finger Endurance', trackWeight: false, defaultWeight: 0, defaultReps: 6, repsUnit: 'reps', sets: 4, desc: '7 seconds on / 3 seconds off repeaters on 20mm edge.' },
            { id: 'antagonist_armor', name: 'Antagonist Armor', icon: '🛡️', badge: 'Prehab', trackWeight: false, defaultWeight: 0, defaultReps: 15, repsUnit: 'reps', sets: 3, desc: 'Pushups and reverse wrist curls to balance pull muscles.' },
            { id: 'climber_core', name: 'Climber Core', icon: '💪', badge: 'Core Tension', trackWeight: false, defaultWeight: 0, defaultReps: 10, repsUnit: 'reps', sets: 3, desc: 'Hollow body holds and L-sits for steep overhang compression.' },
            { id: 'mobility_flow', name: 'Mobility Flow', icon: '🧘', badge: 'Flexibility', trackWeight: false, defaultWeight: 0, defaultReps: 10, repsUnit: 'switches', sets: 3, desc: '90/90 hip switches and thoracic rotations for high feet.' }
        ];

        // AI Coach in-session recommendation state
        let coachAltIndex = 0;
        let currentCoachRec = null;

        function updateCoachRecommendation() {
            if (typeof Planner === 'undefined' || typeof Planner.recommendNextClimb !== 'function') return;
            const elapsedMinutes = sessionStartTime ? Math.max(0, Math.floor((Date.now() - sessionStartTime) / 60000)) : 0;
            const rec = Planner.recommendNextClimb(sessionClimbs, maxGradeIndex, elapsedMinutes, coachAltIndex);
            currentCoachRec = rec;

            const gradeEl = document.getElementById('coachRecGrade');
            const titleEl = document.getElementById('coachRecTitle');
            const adviceEl = document.getElementById('coachRecAdvice');
            const tagsEl = document.getElementById('coachRecTags');
            const catEl = document.getElementById('coachRecCategory');
            const iconEl = document.getElementById('coachRecIcon');

            if (gradeEl) gradeEl.innerText = rec.targetGradeStr;
            if (titleEl) titleEl.innerText = rec.title;
            if (adviceEl) adviceEl.innerText = rec.advice;
            if (catEl) catEl.innerText = rec.category || 'Coach Suggestion';
            if (iconEl) iconEl.innerText = rec.icon || '🤖';

            if (tagsEl && rec.targetTags) {
                tagsEl.innerHTML = rec.targetTags.map(t => `<span class="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">${t}</span>`).join('');
            }

            renderSessionCheckinUI();

            const detailModal = document.getElementById('coachDetailModal');
            if (detailModal && !detailModal.classList.contains('hidden')) {
                updateCoachDetailModal();
            }
        }

        function cycleCoachRecommendation() {
            coachAltIndex++;
            updateCoachRecommendation();
            if ('vibrate' in navigator) navigator.vibrate(10);
        }

        function renderSessionCheckinUI() {
            if (typeof Planner === 'undefined') return;
            const checkin = Planner.getCheckin ? Planner.getCheckin() : { fingers: 'fresh', skin: 'good', time: 90 };

            // 1. Fingers buttons
            const fingerBtns = {
                fresh: document.getElementById('btnCheckinFingerFresh'),
                stiff: document.getElementById('btnCheckinFingerStiff'),
                tweaky: document.getElementById('btnCheckinFingerTweaky')
            };
            Object.entries(fingerBtns).forEach(([val, btn]) => {
                if (!btn) return;
                const isSel = checkin.fingers === val;
                if (isSel) {
                    const col = val === 'tweaky' ? 'bg-red-500/25 border-red-500/50 text-red-400' :
                                val === 'stiff' ? 'bg-amber-500/25 border-amber-500/50 text-amber-400' :
                                'bg-emerald-500/25 border-emerald-500/50 text-emerald-400';
                    btn.className = `py-2 px-1 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1 border ${col} shadow-sm`;
                } else {
                    btn.className = 'py-2 px-1 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1 border bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white';
                }
            });

            // 2. Skin buttons
            const skinBtns = {
                good: document.getElementById('btnCheckinSkinGood'),
                thin: document.getElementById('btnCheckinSkinThin'),
                split: document.getElementById('btnCheckinSkinSplit')
            };
            Object.entries(skinBtns).forEach(([val, btn]) => {
                if (!btn) return;
                const isSel = checkin.skin === val;
                if (isSel) {
                    const col = val === 'split' ? 'bg-red-500/25 border-red-500/50 text-red-400' :
                                val === 'thin' ? 'bg-amber-500/25 border-amber-500/50 text-amber-400' :
                                'bg-emerald-500/25 border-emerald-500/50 text-emerald-400';
                    btn.className = `py-1.5 px-1 rounded-xl text-[9px] font-black transition-all flex items-center justify-center gap-1 border ${col} shadow-sm`;
                } else {
                    btn.className = 'py-1.5 px-1 rounded-xl text-[9px] font-bold transition-all flex items-center justify-center gap-1 border bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white';
                }
            });

            // 3. Time buttons
            const timeBtns = {
                45: document.getElementById('btnCheckinTime45'),
                90: document.getElementById('btnCheckinTime90'),
                120: document.getElementById('btnCheckinTime120')
            };
            Object.entries(timeBtns).forEach(([val, btn]) => {
                if (!btn) return;
                const isSel = Number(checkin.time) === Number(val);
                if (isSel) {
                    btn.className = 'py-1.5 px-1 rounded-xl text-[9px] font-black transition-all flex items-center justify-center gap-1 border bg-emerald-500/25 border-emerald-500/50 text-emerald-400 shadow-sm';
                } else {
                    btn.className = 'py-1.5 px-1 rounded-xl text-[9px] font-bold transition-all flex items-center justify-center gap-1 border bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white';
                }
            });

            // 4. Quick Finger & Skin pill on main Coach Recommendation Card
            const qIcon = document.getElementById('coachQuickFingerIcon');
            const qText = document.getElementById('coachQuickFingerText');
            if (qIcon && qText) {
                if (checkin.fingers === 'tweaky') {
                    qIcon.innerText = '🩹';
                    qText.innerText = checkin.skin === 'split' ? 'Tweaky · Split' : 'Tweaky';
                    qText.className = 'truncate text-red-400';
                } else if (checkin.skin === 'split') {
                    qIcon.innerText = '🩸';
                    qText.innerText = 'Split Skin';
                    qText.className = 'truncate text-red-400';
                } else if (checkin.fingers === 'stiff') {
                    qIcon.innerText = '🪵';
                    qText.innerText = checkin.skin === 'thin' ? 'Stiff · Thin' : 'Stiff';
                    qText.className = 'truncate text-amber-400';
                } else if (checkin.skin === 'thin') {
                    qIcon.innerText = '🧴';
                    qText.innerText = 'Thin Skin';
                    qText.className = 'truncate text-amber-400';
                } else {
                    qIcon.innerText = '⚡';
                    qText.innerText = 'Fresh';
                    qText.className = 'truncate text-emerald-400';
                }
            }

            // 5. Status Pill in modal header (reflects both fingers and skin)
            const statusPill = document.getElementById('checkinStatusPill');
            if (statusPill) {
                if (checkin.fingers === 'tweaky') {
                    statusPill.innerText = 'Pulleys Protected';
                    statusPill.className = 'text-[8px] font-black uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30';
                } else if (checkin.skin === 'split') {
                    statusPill.innerText = 'Skin Protection Mode';
                    statusPill.className = 'text-[8px] font-black uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30';
                } else if (checkin.fingers === 'stiff') {
                    statusPill.innerText = 'Open-Hand Focus';
                    statusPill.className = 'text-[8px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30';
                } else if (checkin.skin === 'thin') {
                    statusPill.innerText = 'Friction Caution';
                    statusPill.className = 'text-[8px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30';
                } else {
                    statusPill.innerText = '100% Ready';
                    statusPill.className = 'text-[8px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
                }
            }
        }
        window.renderSessionCheckinUI = renderSessionCheckinUI;

        function setSessionCheckin(key, value) {
            if (typeof Planner !== 'undefined' && typeof Planner.setCheckin === 'function') {
                Planner.setCheckin(key, value);
            }
            renderSessionCheckinUI();
            updateCoachRecommendation();
            if (typeof updateCoachDetailModal === 'function') {
                updateCoachDetailModal();
            }
            if ('vibrate' in navigator) navigator.vibrate(10);
        }
        window.setSessionCheckin = setSessionCheckin;

        function openCoachDetailModal() {
            if (!currentCoachRec) {
                updateCoachRecommendation();
            }
            renderSessionCheckinUI();
            updateCoachDetailModal();
            const modal = document.getElementById('coachDetailModal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
            if ('vibrate' in navigator) navigator.vibrate(10);
        }
        window.openCoachDetailModal = openCoachDetailModal;

        function closeCoachDetailModal() {
            const modal = document.getElementById('coachDetailModal');
            if (modal) {
                modal.classList.remove('flex');
                modal.classList.add('hidden');
            }
        }
        window.closeCoachDetailModal = closeCoachDetailModal;

        function updateCoachDetailModal() {
            if (!currentCoachRec) return;
            const rec = currentCoachRec;

            const catEl = document.getElementById('coachDetailCategory');
            const gradeEl = document.getElementById('coachDetailGrade');
            const deltaEl = document.getElementById('coachDetailGradeDelta');
            const iconEl = document.getElementById('coachDetailIcon');
            const titleEl = document.getElementById('coachDetailTitle');
            const tagsEl = document.getElementById('coachDetailTags');
            const ratEl = document.getElementById('coachDetailRationale');
            const restEl = document.getElementById('coachDetailRest');
            const volEl = document.getElementById('coachDetailVolume');

            if (catEl) catEl.innerText = rec.category || 'Coach Suggestion';
            if (gradeEl) gradeEl.innerText = rec.targetGradeStr || '6A';
            if (iconEl) iconEl.innerText = rec.icon || '🤖';
            if (titleEl) titleEl.innerText = rec.title || 'Recommended Climb';

            if (deltaEl) {
                const diff = (rec.targetGradeIdx !== undefined ? rec.targetGradeIdx : maxGradeIndex) - maxGradeIndex;
                deltaEl.innerText = diff === 0 ? '(Equal to Max)' : diff > 0 ? `(Max + ${diff})` : `(Max - ${Math.abs(diff)})`;
            }

            if (tagsEl && rec.targetTags) {
                tagsEl.innerHTML = rec.targetTags.map(t => `<span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-lg bg-neutral-800 text-emerald-400 border border-neutral-700">${t}</span>`).join('');
            }

            const STAGE_RATIONALES = {
                warmup: {
                    rationale: 'Gradual progressive loading increases synovial fluid viscosity in finger joints, primes forearm neuromuscular recruitment, and prepares A2/A4 annular pulleys for high shearing forces before peak strain.',
                    rest: '1–2 minutes',
                    volume: '2–4 clean sends'
                },
                pyramid: {
                    rationale: 'Moving dynamically on sub-maximal boulders primes high-threshold motor units (post-activation potentiation). Focus on explosive hip drive and clean momentum transfer rather than hanging passively.',
                    rest: '2–3 minutes',
                    volume: '2 quality attempts'
                },
                project: {
                    rationale: 'Maximum efforts rapidly deplete intracellular phosphocreatine (ATP-CP) stores. Full neural and metabolic recovery takes 3 to 5 minutes between burns. Cap attempts per boulder at 4–5 to protect annular pulleys.',
                    rest: '3–5 minutes',
                    volume: 'Max effort burns'
                },
                breakthrough: {
                    rationale: 'High pyramid base readiness or an intra-session flash streak indicates peak central nervous system potentiation. Channel this low-fatigue window into a supramaximal (+1 grade) boulder aligned with your strongest hold styles.',
                    rest: '4–5 minutes',
                    volume: '3–4 limit burns'
                },
                weakness_target: {
                    rationale: 'Targeting hold and movement styles with your lowest historical send efficiency at sub-maximal intensity (-1 grade) expands motor vocabulary without overloading finger tendons.',
                    rest: '2–3 minutes',
                    volume: '1–2 sends (<3 tries)'
                },
                volume_consolidation: {
                    rationale: 'When acute fatigue is elevated or connective tissue remodeling is incomplete, sub-maximal volume builds local forearm capillary density and technical economy while keeping pulley shear forces below the micro-trauma threshold.',
                    rest: '2 minutes',
                    volume: '4–6 sub-max sends'
                },
                rule_of_3: {
                    rationale: "Multiple consecutive failures without progress indicate neuromuscular fatigue. Steve Bechtel's Rule of 3 shows that continuing project attempts at this point rapidly elevates tendon injury risk. Reset with easy movement.",
                    rest: '4 minutes',
                    volume: '1–2 flow resets'
                },
                strain_pivot: {
                    rationale: 'High connective tissue strain detected from consecutive crimp/board attempts. Shifting to slopers, open-hand contact, or slabs allows active recovery of finger flexor tendons while maintaining training stimulus.',
                    rest: '3 minutes',
                    volume: 'Open-hand focus'
                },
                cooldown: {
                    rationale: 'Power threshold or session time cutoff reached. Easy sub-maximal movement flushes forearm metabolites, preserves connective tissue mobility, and reduces post-session tendon stiffness.',
                    rest: '1 minute',
                    volume: 'Light flow'
                }
            };
            window.STAGE_RATIONALES = STAGE_RATIONALES;

            const details = STAGE_RATIONALES[rec.stage] || {
                rationale: rec.advice || 'Follow structured rest intervals and focus on precise movement execution.',
                rest: '2–3 minutes',
                volume: 'Quality burns'
            };

            if (ratEl) ratEl.innerText = details.rationale;
            if (restEl) restEl.innerText = details.rest;
            if (volEl) volEl.innerText = details.volume;
        }
        window.updateCoachDetailModal = updateCoachDetailModal;

        function applyCoachRecommendation() {
            if (!currentCoachRec) updateCoachRecommendation();
            const rec = currentCoachRec;
            if (!rec) return;

            openAddModal('climb', {
                gradeStr: rec.targetGradeStr,
                tags: [...(rec.targetTags || [])]
            });
        }

        function openAddModal(mode = 'climb', prefill = null) {
            modalAction = 'add';
            editingRouteId = null;
            editingWorkoutId = null;
            modalMode = mode;

            if (prefill && prefill.gradeStr) {
                const idx = fontGrades.indexOf(prefill.gradeStr);
                modalGradeIndex = idx >= 0 ? idx : maxGradeIndex;
            } else {
                modalGradeIndex = maxGradeIndex;
            }

            modalColorTag = 'red';
            modalSelectedTags = (prefill && prefill.tags) ? [...prefill.tags] : [];
            modalTries = 1;
            modalCompletion = 0;

            modalWorkoutPresetId = 'bench_press';
            modalWorkoutWeight = 60;
            modalWorkoutReps = 6;
            modalWorkoutSets = [false, false, false, false];

            if (!sessionStartTime) {
                startSession();
            }

            renderModalUI();
            const modal = document.getElementById('climbLogModal');
            if (modal) modal.classList.replace('hidden', 'flex');
        }

        function openEditRouteModal(routeId) {
            const climb = (sessionClimbs || []).find(c => c.id === routeId);
            if (!climb) return;

            modalAction = 'edit';
            modalMode = 'climb';
            editingRouteId = routeId;
            editingWorkoutId = null;

            const gIdx = fontGrades.indexOf(climb.gradeStr);
            modalGradeIndex = gIdx >= 0 ? gIdx : maxGradeIndex;
            modalColorTag = climb.colorTag || 'red';
            modalSelectedTags = [...(climb.tags || [])];
            modalTries = climb.tries || 1;
            modalCompletion = climb.completionPct !== undefined ? climb.completionPct : (climb.isTop || climb.isFlash ? 100 : 0);

            renderModalUI();
            const modal = document.getElementById('climbLogModal');
            if (modal) modal.classList.replace('hidden', 'flex');
        }

        function openEditWorkoutModal(workoutId) {
            const workout = (sessionWorkouts || []).find(w => w.id === workoutId);
            if (!workout) return;

            modalAction = 'edit';
            modalMode = 'workout';
            editingWorkoutId = workoutId;
            editingRouteId = null;

            modalWorkoutPresetId = workout.id;
            modalWorkoutWeight = workout.weight || 60;
            modalWorkoutReps = workout.reps || 6;
            const completedSets = (workout.exercises || []).reduce((acc, ex) => acc + (ex.completedSets || 0), 0);
            const totalSets = (workout.exercises || []).reduce((acc, ex) => acc + (ex.sets || 0), 0) || 4;
            modalWorkoutSets = [];
            for (let i = 0; i < totalSets; i++) {
                modalWorkoutSets.push(i < completedSets);
            }

            renderModalUI();
            const modal = document.getElementById('climbLogModal');
            if (modal) modal.classList.replace('hidden', 'flex');
        }

        function closeLogModal() {
            const modal = document.getElementById('climbLogModal');
            if (modal) modal.classList.replace('flex', 'hidden');
            editingRouteId = null;
            editingWorkoutId = null;
        }

        function switchLogModalMode(mode) {
            modalMode = mode;
            renderModalUI();
        }

        function renderModalUI() {
            const titleEl = document.getElementById('climbLogModalTitle');
            const iconEl = document.getElementById('modalHeaderIcon');
            if (titleEl) {
                if (modalAction === 'edit') {
                    titleEl.innerText = modalMode === 'climb' ? 'Edit Route' : 'Edit Workout';
                } else {
                    titleEl.innerText = modalMode === 'climb' ? 'Add Route' : 'Add Workout';
                }
            }
            if (iconEl) iconEl.innerText = modalMode === 'climb' ? '🧗' : '💪';

            const btnClimb = document.getElementById('modalBtnClimb');
            const btnWorkout = document.getElementById('modalBtnWorkout');
            const climbCont = document.getElementById('modalClimbContainer');
            const workoutCont = document.getElementById('modalWorkoutContainer');

            if (modalMode === 'climb') {
                if (btnClimb) {
                    btnClimb.className = 'flex-1 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all bg-emerald-500 text-black shadow-sm flex items-center justify-center gap-1.5';
                }
                if (btnWorkout) {
                    btnWorkout.className = 'flex-1 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all text-neutral-400 hover:text-white flex items-center justify-center gap-1.5';
                }
                if (climbCont) climbCont.classList.remove('hidden');
                if (workoutCont) workoutCont.classList.add('hidden');
                renderModalClimbFields();
            } else {
                if (btnWorkout) {
                    btnWorkout.className = 'flex-1 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all bg-emerald-500 text-black shadow-sm flex items-center justify-center gap-1.5';
                }
                if (btnClimb) {
                    btnClimb.className = 'flex-1 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all text-neutral-400 hover:text-white flex items-center justify-center gap-1.5';
                }
                if (climbCont) climbCont.classList.add('hidden');
                if (workoutCont) workoutCont.classList.remove('hidden');
                renderModalWorkoutFields();
            }
        }

        function renderModalClimbFields() {
            const gEl = document.getElementById('modalDisplayGrade');
            if (gEl) gEl.innerText = fontGrades[modalGradeIndex] || '6A';

            renderModalColorPalette();
            renderModalStyleTags();

            const tEl = document.getElementById('modalDisplayTries');
            if (tEl) tEl.innerText = modalTries;

            const compEl = document.getElementById('modalCompletionDisplay');
            if (compEl) compEl.innerText = `${modalCompletion}%`;
            [0, 25, 50, 75, 100].forEach(p => {
                const btn = document.getElementById(`compBtn_${p}`);
                if (btn) {
                    if (modalCompletion === p) {
                        btn.className = 'py-2 rounded-xl text-[10px] font-black transition-all bg-emerald-500 text-black shadow-sm';
                    } else {
                        btn.className = 'py-2 rounded-xl text-[10px] font-black transition-all bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800';
                    }
                }
            });

            const addActions = document.getElementById('modalClimbActionsAdd');
            const editActions = document.getElementById('modalClimbActionsEdit');
            if (modalAction === 'edit') {
                if (addActions) addActions.classList.add('hidden');
                if (editActions) editActions.classList.remove('hidden');
            } else {
                if (addActions) addActions.classList.remove('hidden');
                if (editActions) editActions.classList.add('hidden');
            }
        }

        function renderModalColorPalette() {
            const container = document.getElementById('modalColorPalette');
            if (!container) return;
            const nameEl = document.getElementById('modalSelectedColorName');
            const selectedObj = getColorObj(modalColorTag);
            if (nameEl) nameEl.innerText = selectedObj.name;

            container.innerHTML = COLOR_PALETTE.map(col => {
                const isSel = col.id === modalColorTag;
                return `
                    <button type="button" onclick="setModalColorTag('${col.id}')" title="${col.name}" class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-90 ${
                        isSel ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-950 scale-110 shadow-lg' : 'hover:scale-105 opacity-80'
                    }" style="background-color: ${col.hex};">
                        ${isSel ? '<span class="text-xs font-black text-white drop-shadow-md">✓</span>' : ''}
                    </button>
                `;
            }).join('');
        }

        function setModalColorTag(colId) {
            modalColorTag = colId;
            renderModalColorPalette();
            if ('vibrate' in navigator) navigator.vibrate(10);
        }

        function renderModalStyleTags() {
            const container = document.getElementById('modalStyleTagsContainer');
            if (!container) return;
            container.innerHTML = tagList.map(tag => {
                const isSel = modalSelectedTags.includes(tag);
                return `
                    <button type="button" onclick="toggleModalStyleTag('${tag}')" class="px-2.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95 ${
                        isSel ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]' : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
                    }">
                        <span>${tag}</span>
                    </button>
                `;
            }).join('');
        }

        function toggleModalStyleTag(tag) {
            const idx = modalSelectedTags.indexOf(tag);
            if (idx > -1) {
                modalSelectedTags.splice(idx, 1);
            } else {
                modalSelectedTags.push(tag);
            }
            renderModalStyleTags();
            if ('vibrate' in navigator) navigator.vibrate(5);
        }

        function adjModalGrade(delta) {
            modalGradeIndex = Math.max(0, Math.min(fontGrades.length - 1, modalGradeIndex + delta));
            const gEl = document.getElementById('modalDisplayGrade');
            if (gEl) gEl.innerText = fontGrades[modalGradeIndex];
            if ('vibrate' in navigator) navigator.vibrate(10);
        }

        function adjModalTries(delta) {
            modalTries = Math.max(1, modalTries + delta);
            const tEl = document.getElementById('modalDisplayTries');
            if (tEl) tEl.innerText = modalTries;
            if ('vibrate' in navigator) navigator.vibrate(10);
        }

        function setModalCompletion(pct) {
            modalCompletion = pct;
            renderModalClimbFields();
            if ('vibrate' in navigator) navigator.vibrate(10);
        }

        function submitModalClimb(isQuickSend = false) {
            if ('vibrate' in navigator) navigator.vibrate(30);
            if (!sessionStartTime) {
                startSession();
            }
            const finalTries = isQuickSend ? 1 : modalTries;
            const finalCompletion = isQuickSend ? 100 : modalCompletion;
            const isSent = finalCompletion === 100;
            const isFl = isSent && (finalTries === 1);
            const isTp = isSent && !isFl;

            const delta = modalGradeIndex - maxGradeIndex;
            const pts = calculatePoints(delta, isFl, isTp, finalTries, finalCompletion);

            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            const colObj = getColorObj(modalColorTag);

            const newClimb = {
                id: climbIdCounter++,
                gradeStr: fontGrades[modalGradeIndex],
                colorTag: modalColorTag,
                colorHex: colObj.hex,
                statusText: isFl ? 'Flash' : isTp ? 'Top' : 'Project',
                color: isFl ? 'text-amber-400' : isTp ? 'text-blue-400' : 'text-neutral-400',
                tries: finalTries,
                completionPct: finalCompletion,
                isTop: isTp,
                isFlash: isFl,
                points: pts,
                time: timeStr,
                tags: [...modalSelectedTags]
            };

            sessionClimbs.unshift(newClimb);

            if (isSent) {
                unlockAchievement('first_blood');
                if (isFl && delta === 0) unlockAchievement('the_flash');
                if (delta > 0) unlockAchievement('crusher');
                if (finalTries >= 5) unlockAchievement('dedication');
                if (typeof confetti === 'function') {
                    confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 } });
                }
                if (modalGradeIndex > maxGradeIndex) {
                    maxGradeIndex = modalGradeIndex;
                    localStorage.setItem('boulderMaxGradeIndex', maxGradeIndex);
                }
            }

            renderSessionList();
            saveActiveSession();
            checkLiveFatigueAlert();
            updateCoachRecommendation();
            closeLogModal();
        }

        function saveModalClimbEdits() {
            if (editingRouteId === null) return;
            const climb = (sessionClimbs || []).find(c => c.id === editingRouteId);
            if (!climb) return;

            const isSent = modalCompletion === 100;
            const isFl = isSent && (modalTries === 1);
            const isTp = isSent && !isFl;
            const delta = modalGradeIndex - maxGradeIndex;
            const pts = calculatePoints(delta, isFl, isTp, modalTries, modalCompletion);
            const colObj = getColorObj(modalColorTag);

            climb.gradeStr = fontGrades[modalGradeIndex];
            climb.colorTag = modalColorTag;
            climb.colorHex = colObj.hex;
            climb.tries = modalTries;
            climb.completionPct = modalCompletion;
            climb.isTop = isTp;
            climb.isFlash = isFl;
            climb.statusText = isFl ? 'Flash' : isTp ? 'Top' : 'Project';
            climb.color = isFl ? 'text-amber-400' : isTp ? 'text-blue-400' : 'text-neutral-400';
            climb.points = pts;
            climb.tags = [...modalSelectedTags];

            if (isSent && typeof confetti === 'function') {
                confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
            }

            renderSessionList();
            saveActiveSession();
            checkLiveFatigueAlert();
            updateCoachRecommendation();
            closeLogModal();
        }

        function deleteModalClimb() {
            if (editingRouteId === null) return;
            if (confirm('Are you sure you want to delete this route from the session?')) {
                removeClimb(editingRouteId);
                closeLogModal();
            }
        }

        function renderModalWorkoutFields() {
            const chipsCont = document.getElementById('modalWorkoutPresetChips');
            if (chipsCont) {
                chipsCont.innerHTML = WORKOUT_PRESET_ITEMS.map(p => {
                    const isSel = p.id === modalWorkoutPresetId;
                    return `
                        <button type="button" onclick="selectModalWorkoutPreset('${p.id}')" class="p-2 rounded-xl text-left border transition-all ${
                            isSel ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400 shadow-sm' : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                        }">
                            <span class="text-sm block">${p.icon}</span>
                            <span class="text-[10px] font-black uppercase truncate block mt-0.5">${p.name}</span>
                        </button>
                    `;
                }).join('');
            }

            const curPreset = WORKOUT_PRESET_ITEMS.find(p => p.id === modalWorkoutPresetId) || WORKOUT_PRESET_ITEMS[0];
            const titleEl = document.getElementById('modalWorkoutExTitle');
            const catEl = document.getElementById('modalWorkoutExCategory');
            const descEl = document.getElementById('modalWorkoutExDesc');
            const wDisp = document.getElementById('modalWorkoutWeightDisplay');
            const rDisp = document.getElementById('modalWorkoutRepsDisplay');
            const weightCol = document.getElementById('modalWorkoutWeightCol');
            const repsCol = document.getElementById('modalWorkoutRepsCol');
            const repsLabel = document.getElementById('modalWorkoutRepsLabel');

            if (titleEl) titleEl.innerText = curPreset.name;
            if (catEl) catEl.innerText = curPreset.badge;
            if (descEl) descEl.innerText = curPreset.desc;

            // Handle whether this exercise tracks weight (e.g. Bench press / Weighted hangs vs Mobility / Core)
            if (curPreset.trackWeight) {
                if (weightCol) weightCol.classList.remove('hidden');
                if (repsCol) repsCol.className = 'p-3 bg-neutral-950/80 rounded-2xl border border-neutral-800 flex flex-col items-center col-span-1';
                if (wDisp) wDisp.innerText = `${modalWorkoutWeight} kg`;
            } else {
                if (weightCol) weightCol.classList.add('hidden');
                if (repsCol) repsCol.className = 'p-3 bg-neutral-950/80 rounded-2xl border border-neutral-800 flex flex-col items-center col-span-2';
            }

            if (repsLabel) repsLabel.innerText = curPreset.repsUnit === 'switches' ? 'Switches / Reps' : curPreset.repsUnit === 'hang' ? 'Hang Duration' : 'Reps';
            if (rDisp) rDisp.innerText = curPreset.repsUnit === 'hang' ? `${modalWorkoutReps * 10}s` : `${modalWorkoutReps} ${curPreset.repsUnit || 'reps'}`;

            const isHang = curPreset.id === 'repeaters_7_3' || curPreset.id === 'max_hangs';
            const isRepeaters = curPreset.id === 'repeaters_7_3';

            // Dedicated Hangboard Controller in Modal
            const hangController = document.getElementById('modalHangboardController');
            const hangIcon = document.getElementById('modalHangIcon');
            const hangTitle = document.getElementById('modalHangTitle');
            const hangSubtitle = document.getElementById('modalHangSubtitle');
            const hangDesc = document.getElementById('modalHangDesc');
            const hangBtnText = document.getElementById('modalBtnStartHangText');
            const setsHint = document.getElementById('modalWorkoutSetsHint');

            const nextIncompleteIdx = modalWorkoutSets.findIndex(s => !s);
            const nextSetNum = nextIncompleteIdx !== -1 ? (nextIncompleteIdx + 1) : 1;
            const allSetsCompleted = modalWorkoutSets.length > 0 && modalWorkoutSets.every(Boolean);

            if (hangController) {
                if (isHang) {
                    hangController.classList.remove('hidden');
                    hangController.classList.add('flex');
                    if (hangIcon) hangIcon.innerText = curPreset.icon;
                    if (hangTitle) hangTitle.innerText = isRepeaters ? '7:3 Repeaters Protocol' : 'Max Hangs Protocol';
                    if (hangSubtitle) hangSubtitle.innerText = isRepeaters ? '6 Reps × (7s Hang / 3s Rest)' : `${modalWorkoutReps * 10}s @ Max Effort`;
                    if (hangDesc) {
                        hangDesc.innerText = isRepeaters 
                            ? '5s Prep Chime → 6 × (7s Hang / 3s Shakeout) → Auto 2.5m Rest with audio beeps.'
                            : `5s Prep Countdown → ${modalWorkoutReps * 10}s Hang → Release Buzzer → 3m Rest.`;
                    }
                    if (hangBtnText) {
                        hangBtnText.innerText = allSetsCompleted 
                            ? (isRepeaters ? 'RE-RUN 7:3 TIMER (SET 1)' : 'RE-RUN HANG TIMER (SET 1)')
                            : (isRepeaters ? `START 7:3 TIMER (SET ${nextSetNum})` : `START HANG TIMER (HANG ${nextSetNum})`);
                    }
                    if (setsHint) setsHint.innerText = 'Tap set to run timer';
                } else {
                    hangController.classList.add('hidden');
                    hangController.classList.remove('flex');
                    if (setsHint) setsHint.innerText = 'Tap to mark done';
                }
            }

            const setsCont = document.getElementById('modalWorkoutSetsGrid');
            if (setsCont) {
                const totalSets = modalWorkoutSets.length > 0 ? modalWorkoutSets.length : (curPreset.sets || 4);
                setsCont.innerHTML = Array.from({ length: totalSets }).map((_, i) => {
                    const isDone = modalWorkoutSets[i] === true;
                    return `
                        <button type="button" onclick="${isHang ? `launchHangTimer('${curPreset.id}', ${i})` : `toggleModalWorkoutSet(${i})`}" class="py-2.5 px-2 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-1 active:scale-95 ${
                            isDone ? 'bg-emerald-500 text-black shadow-md' : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
                        }" title="${isHang ? `Launch timer for Set ${i + 1}` : `Toggle Set ${i + 1}`}">
                            <span>${isDone ? '✓' : isHang ? '▶️' : 'Set'} ${i + 1}</span>
                        </button>
                    `;
                }).join('');
            }

            // Sync left action button in Add mode
            const leftIcon = document.getElementById('modalWorkoutActionLeftIcon');
            const leftLabel = document.getElementById('modalWorkoutActionLeftLabel');
            if (leftIcon) leftIcon.innerText = isHang ? '⚡' : '⏱️';
            if (leftLabel) {
                if (isHang) {
                    leftLabel.innerText = allSetsCompleted ? 'Re-run Timer' : `Run Set ${nextSetNum} (${isRepeaters ? '7:3' : 'Hang'})`;
                } else {
                    leftLabel.innerText = 'Set & Rest (90s)';
                }
            }

            const addActions = document.getElementById('modalWorkoutActionsAdd');
            const editActions = document.getElementById('modalWorkoutActionsEdit');
            if (modalAction === 'edit') {
                if (addActions) addActions.classList.add('hidden');
                if (editActions) editActions.classList.remove('hidden');
            } else {
                if (addActions) addActions.classList.remove('hidden');
                if (editActions) editActions.classList.add('hidden');
            }
        }

        function handleModalWorkoutLeftAction() {
            const isHang = modalWorkoutPresetId === 'repeaters_7_3' || modalWorkoutPresetId === 'max_hangs';
            if (isHang) {
                launchHangTimer(modalWorkoutPresetId);
            } else {
                logWorkoutSetAndRest();
            }
        }
        window.handleModalWorkoutLeftAction = handleModalWorkoutLeftAction;

        function launchHangTimer(presetId = null, setIdx = null) {
            const targetId = presetId || modalWorkoutPresetId || 'repeaters_7_3';

            if (!sessionStartTime) {
                startSession();
            }

            // Prime/unlock audio engine on user interaction
            if (typeof window.initAudio === 'function') {
                try {
                    window.initAudio();
                } catch (e) { }
            }

            // Initialize canonical preset structure so exercises have full hangConfig
            selectWorkoutPreset(targetId);

            if (!activeWorkoutPreset || !activeWorkoutPreset.exercises || activeWorkoutPreset.exercises.length === 0) {
                console.warn('Could not initialize workout preset for hang timer:', targetId);
                return;
            }

            // Determine target set index
            if (typeof setIdx === 'number' && setIdx >= 0 && setIdx < activeWorkoutPreset.exercises.length) {
                activeWorkoutExIndex = setIdx;
            } else {
                const nextUnfinished = activeWorkoutPreset.exercises.findIndex(ex => (ex.completedSets || 0) < (ex.sets || 1));
                activeWorkoutExIndex = nextUnfinished !== -1 ? nextUnfinished : 0;
            }

            closeLogModal();
            startHangTimer();
        }
        window.launchHangTimer = launchHangTimer;

        function selectModalWorkoutPreset(pId) {
            modalWorkoutPresetId = pId;
            const curPreset = WORKOUT_PRESET_ITEMS.find(p => p.id === pId) || WORKOUT_PRESET_ITEMS[0];
            modalWorkoutWeight = curPreset.defaultWeight;
            modalWorkoutReps = curPreset.defaultReps;

            const existing = (sessionWorkouts || []).find(w => w.id === pId);
            if (existing && Array.isArray(existing.exercises)) {
                const totalSets = curPreset.sets || 4;
                const completedCount = existing.exercises.reduce((acc, ex) => acc + (ex.completedSets || 0), 0);
                modalWorkoutSets = Array.from({ length: totalSets }).map((_, i) => i < completedCount);
            } else {
                modalWorkoutSets = Array(curPreset.sets || 4).fill(false);
            }

            renderModalWorkoutFields();
            if ('vibrate' in navigator) navigator.vibrate(10);
        }

        function adjModalWorkoutWeight(delta) {
            modalWorkoutWeight = Math.max(0, modalWorkoutWeight + delta);
            const wDisp = document.getElementById('modalWorkoutWeightDisplay');
            if (wDisp) wDisp.innerText = `${modalWorkoutWeight} kg`;
            if ('vibrate' in navigator) navigator.vibrate(10);
        }

        function adjModalWorkoutReps(delta) {
            const curPreset = WORKOUT_PRESET_ITEMS.find(p => p.id === modalWorkoutPresetId) || WORKOUT_PRESET_ITEMS[0];
            modalWorkoutReps = Math.max(1, modalWorkoutReps + delta);
            const rDisp = document.getElementById('modalWorkoutRepsDisplay');
            if (rDisp) rDisp.innerText = curPreset.repsUnit === 'hang' ? `${modalWorkoutReps * 10}s` : `${modalWorkoutReps} ${curPreset.repsUnit || 'reps'}`;
            if ('vibrate' in navigator) navigator.vibrate(10);
        }

        function toggleModalWorkoutSet(setIdx) {
            if (!modalWorkoutSets[setIdx]) {
                modalWorkoutSets[setIdx] = true;
            } else {
                modalWorkoutSets[setIdx] = false;
            }
            renderModalWorkoutFields();
            if ('vibrate' in navigator) navigator.vibrate(10);
        }

        function logWorkoutSetAndRest() {
            const nextUnset = modalWorkoutSets.findIndex(s => !s);
            if (nextUnset !== -1) {
                modalWorkoutSets[nextUnset] = true;
            } else {
                modalWorkoutSets.push(true);
            }
            renderModalWorkoutFields();
            if (typeof startRestTimer === 'function') {
                startRestTimer(90, true);
            }
            if ('vibrate' in navigator) navigator.vibrate([20, 40, 20]);
        }

        function saveModalWorkoutToSession() {
            if (!sessionStartTime) {
                startSession();
            }
            const curPreset = WORKOUT_PRESET_ITEMS.find(p => p.id === modalWorkoutPresetId) || WORKOUT_PRESET_ITEMS[0];
            const completedSets = modalWorkoutSets.filter(Boolean).length;
            const totalSets = modalWorkoutSets.length || curPreset.sets || 4;
            const finalWeight = curPreset.trackWeight ? modalWorkoutWeight : 0;
            const isHang = curPreset.id === 'repeaters_7_3' || curPreset.id === 'max_hangs';

            if (isHang) {
                selectWorkoutPreset(curPreset.id);
                const target = (sessionWorkouts || []).find(w => w.id === curPreset.id);
                if (target && Array.isArray(target.exercises)) {
                    target.trackWeight = !!curPreset.trackWeight;
                    target.weight = finalWeight;
                    target.reps = modalWorkoutReps;
                    target.exercises.forEach((ex, idx) => {
                        ex.completedSets = modalWorkoutSets[idx] ? 1 : 0;
                        ex.sets = 1;
                        if (curPreset.trackWeight) {
                            ex.weight = finalWeight;
                            ex.trackWeight = true;
                        }
                    });
                }
            } else if (modalAction === 'edit' && editingWorkoutId) {
                const existing = (sessionWorkouts || []).find(w => w.id === editingWorkoutId);
                if (existing) {
                    existing.trackWeight = !!curPreset.trackWeight;
                    existing.weight = finalWeight;
                    existing.reps = modalWorkoutReps;
                    if (existing.exercises && existing.exercises[0]) {
                        existing.exercises[0].completedSets = completedSets;
                        existing.exercises[0].sets = totalSets;
                        existing.exercises[0].trackWeight = !!curPreset.trackWeight;
                        existing.exercises[0].weight = finalWeight;
                    }
                }
            } else {
                const existingIdx = (sessionWorkouts || []).findIndex(w => w.id === curPreset.id);
                const workoutObj = {
                    id: curPreset.id,
                    name: curPreset.name,
                    shortName: curPreset.name,
                    icon: curPreset.icon,
                    badge: curPreset.badge,
                    trackWeight: !!curPreset.trackWeight,
                    weight: finalWeight,
                    reps: modalWorkoutReps,
                    exercises: [{
                        id: curPreset.id,
                        name: curPreset.name,
                        sets: totalSets,
                        completedSets: completedSets,
                        trackWeight: !!curPreset.trackWeight,
                        weight: finalWeight,
                        reps: modalWorkoutReps
                    }]
                };
                if (existingIdx > -1) {
                    sessionWorkouts[existingIdx] = workoutObj;
                } else {
                    sessionWorkouts.push(workoutObj);
                }
            }

            renderSessionList();
            saveActiveSession();
            closeLogModal();
        }

        function deleteModalWorkout() {
            if (!editingWorkoutId) return;
            if (confirm('Delete this workout from the session?')) {
                const idx = (sessionWorkouts || []).findIndex(w => w.id === editingWorkoutId);
                if (idx > -1) {
                    sessionWorkouts.splice(idx, 1);
                    renderSessionList();
                    saveActiveSession();
                }
                closeLogModal();
            }
        }

        // ============================================================================
        // INLINE ACTIONS ON ROUTE CARDS (EDIT / BURN / COMPLETION)
        // ============================================================================
        function quickAdjustTries(routeId, delta) {
            const climb = (sessionClimbs || []).find(c => c.id === routeId);
            if (!climb) return;

            if (!sessionStartTime) startSession();

            climb.tries = Math.max(1, (climb.tries || 1) + delta);
            const gIdx = fontGrades.indexOf(climb.gradeStr);
            const deltaGrade = (gIdx >= 0 ? gIdx : maxGradeIndex) - maxGradeIndex;
            climb.points = calculatePoints(deltaGrade, climb.isFlash, climb.isTop, climb.tries, climb.completionPct || 0);

            renderSessionList();
            saveActiveSession();
            checkLiveFatigueAlert();
            updateCoachRecommendation();
            if ('vibrate' in navigator) navigator.vibrate(10);
        }

        function quickRecordRouteBurn(routeId) {
            quickAdjustTries(routeId, 1);
            if (typeof startRestTimer === 'function') {
                startRestTimer();
            }
        }

        function quickSetCompletion(routeId, pct) {
            const climb = (sessionClimbs || []).find(c => c.id === routeId);
            if (!climb) return;

            if (!sessionStartTime) startSession();

            const isSent = pct === 100;
            const isFl = isSent && (climb.tries === 1);
            const isTp = isSent && !isFl;

            climb.completionPct = pct;
            climb.isTop = isTp;
            climb.isFlash = isFl;
            climb.statusText = isFl ? 'Flash' : isTp ? 'Top' : 'Project';
            climb.color = isFl ? 'text-amber-400' : isTp ? 'text-blue-400' : 'text-neutral-400';

            const gIdx = fontGrades.indexOf(climb.gradeStr);
            const deltaGrade = (gIdx >= 0 ? gIdx : maxGradeIndex) - maxGradeIndex;
            climb.points = calculatePoints(deltaGrade, isFl, isTp, climb.tries, pct);

            if (isSent) {
                unlockAchievement('first_blood');
                if (isFl && deltaGrade === 0) unlockAchievement('the_flash');
                if (deltaGrade > 0) unlockAchievement('crusher');
                if (typeof confetti === 'function') {
                    confetti({ particleCount: 200, spread: 120, origin: { y: 0.5 } });
                }
                if (gIdx > maxGradeIndex) {
                    maxGradeIndex = gIdx;
                    localStorage.setItem('boulderMaxGradeIndex', maxGradeIndex);
                }
            }

            renderSessionList();
            saveActiveSession();
            checkLiveFatigueAlert();
            updateCoachRecommendation();
            if ('vibrate' in navigator) navigator.vibrate(25);
        }

        // ============================================================================
        // RENDER & MANAGE SESSION CLIMBS & WORKOUTS
        // ============================================================================
        function renderSessionList() {
            const listEl = document.getElementById('sessionList');
            if (!listEl) return;
            recomputeSessionScore();
            const scoreEl = document.getElementById('sessionScoreDisplay');
            if (scoreEl) scoreEl.innerText = sessionScore;

            const countEl = document.getElementById('sessionItemsCount');
            const totalCount = (sessionClimbs ? sessionClimbs.length : 0) + (sessionWorkouts ? sessionWorkouts.length : 0);
            if (countEl) countEl.innerText = `${totalCount} item${totalCount === 1 ? '' : 's'}`;

            const editIconSvg = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>`;

            let workoutItemsHtml = '';
            if (sessionWorkouts && sessionWorkouts.length > 0) {
                sessionWorkouts.forEach(w => {
                    const completedSetsCount = (w.exercises || []).reduce((acc, ex) => acc + (ex.completedSets || 0), 0);
                    const totalSetsCount = (w.exercises || []).reduce((acc, ex) => acc + (ex.sets || 0), 0);
                    const isHang = w.id === 'repeaters_7_3' || w.id === 'max_hangs' || w.category === 'hangboard';
                    const nextSetNum = completedSetsCount < totalSetsCount ? (completedSetsCount + 1) : 1;
                    const allDone = completedSetsCount >= totalSetsCount && totalSetsCount > 0;

                    workoutItemsHtml += `
                        <li class="flex items-center justify-between gap-2 px-3 py-2.5 bg-neutral-900/90 rounded-2xl border border-neutral-800 shadow-sm">
                            <div class="flex items-center gap-2 min-w-0">
                                <span class="text-base shrink-0">${w.icon || '💪'}</span>
                                <div class="flex flex-col min-w-0">
                                    <span class="text-xs font-black text-white truncate leading-tight">${w.shortName || w.name}</span>
                                    <span class="text-[9.5px] text-cyan-400 font-bold">${completedSetsCount}/${totalSetsCount} Sets ${(w.trackWeight && w.weight > 0) ? `· ${w.weight}kg` : ''}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-1.5 shrink-0">
                                ${isHang ? `
                                    <button type="button" onclick="launchHangTimer('${w.id}')" class="h-7 px-2.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 active:scale-95">
                                        <span>▶️</span>
                                        <span>${allDone ? 'Redo' : `Set ${nextSetNum}`}</span>
                                    </button>
                                ` : ''}
                                <span class="text-emerald-400 font-black text-xs">+${completedSetsCount * 10}</span>
                                <button type="button" onclick="openEditWorkoutModal('${w.id}')" class="p-1.5 rounded-lg text-neutral-400 hover:text-white bg-neutral-800/80 hover:bg-neutral-800 active:scale-90 transition-all" title="Edit Workout">
                                    ${editIconSvg}
                                </button>
                            </div>
                        </li>
                    `;
                });
            }

            if (sessionClimbs.length === 0 && !workoutItemsHtml) {
                listEl.innerHTML = `
                    <li class="text-neutral-500 text-center py-10 flex flex-col items-center justify-center gap-1.5 bg-neutral-900/40 rounded-2xl border border-neutral-800/60">
                        <span class="text-2xl">🧗</span>
                        <span class="text-xs font-bold text-neutral-400">No routes logged yet</span>
                        <span class="text-[10px] text-neutral-600">Tap "+ Add Climb" below or "+ Log" on the Coach banner.</span>
                    </li>`;
                return;
            }

            const climbsHtml = sessionClimbs.map(c => {
                const colObj = getColorObj(c.colorTag);
                const hex = c.colorHex || colObj.hex;
                const isSent = c.isTop || c.isFlash || c.statusText === 'Top' || c.statusText === 'Flash';
                const curPct = isSent ? 100 : (c.completionPct || 0);
                const tagsInline = (c.tags && c.tags.length > 0)
                    ? c.tags.map(t => `<span class="bg-neutral-950 text-neutral-400 border border-neutral-800 text-[8px] uppercase px-1.5 py-0.5 rounded font-bold whitespace-nowrap shrink-0">${t}</span>`).join('')
                    : '';

                // SENT CLIMBS: Ultra-clean 1-Row Compact Bar with Undo
                if (isSent) {
                    const badge = c.isFlash
                        ? `<span class="text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">⚡ FLASH</span>`
                        : `<span class="text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">✓ TOP · ${c.tries}t</span>`;

                    return `
                        <li class="px-3 py-2 bg-neutral-900/80 rounded-2xl border border-emerald-500/25 flex items-center justify-between gap-2 shadow-sm">
                            <div class="flex items-center gap-2 min-w-0 overflow-hidden">
                                <div class="w-5 h-5 rounded-full shrink-0 border-[3px]" style="border-color: ${hex}; background-color: ${hex}25;"></div>
                                <span class="text-base font-black text-white leading-none shrink-0">${c.gradeStr}</span>
                                ${badge}
                                ${tagsInline ? `<div class="flex items-center gap-1 overflow-hidden shrink min-w-0">${tagsInline}</div>` : ''}
                            </div>
                            <div class="flex items-center gap-1.5 shrink-0 ml-1">
                                <span class="text-emerald-400 font-black text-xs leading-none">+${c.points}</span>
                                <button type="button" onclick="quickSetCompletion(${c.id}, 75)" title="Undo Send" class="h-7 px-2 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-400 hover:text-white text-[10px] font-black active:scale-90 transition-all">↩</button>
                                <button type="button" onclick="openEditRouteModal(${c.id})" class="p-1.5 rounded-lg text-neutral-400 hover:text-white bg-neutral-800/80 hover:bg-neutral-800 active:scale-90 transition-all" title="Edit Route">
                                    ${editIconSvg}
                                </button>
                            </div>
                        </li>
                    `;
                }

                // ACTIVE PROJECTS: Clean 2-Row Card (No Duplicate Labels, Never Wraps)
                return `
                    <li class="p-2.5 bg-neutral-900/95 rounded-2xl border border-neutral-800 flex flex-col gap-2 shadow-sm">
                        <!-- Row 1: Identity Only (Hold Color Ring + Grade + Style Tags | +Pts + Edit) -->
                        <div class="flex items-center justify-between gap-2 min-w-0">
                            <div class="flex items-center gap-2 min-w-0 overflow-hidden">
                                <div class="w-5 h-5 rounded-full shrink-0 border-[3px]" style="border-color: ${hex}; background-color: ${hex}25;"></div>
                                <span class="text-base font-black text-white leading-none shrink-0">${c.gradeStr}</span>
                                ${tagsInline ? `<div class="flex items-center gap-1 overflow-hidden shrink min-w-0">${tagsInline}</div>` : ''}
                            </div>
                            <div class="flex items-center gap-2 shrink-0 ml-1">
                                <span class="text-emerald-400 font-black text-xs leading-none">+${c.points}</span>
                                <button type="button" onclick="openEditRouteModal(${c.id})" class="p-1.5 rounded-lg text-neutral-400 hover:text-white bg-neutral-800/80 hover:bg-neutral-800 active:scale-90 transition-all" title="Edit Route">
                                    ${editIconSvg}
                                </button>
                            </div>
                        </div>

                        <!-- Row 2: All Actions in One Sleek Bar (Stepper + Burn on left, 4 Milestones on right) -->
                        <div class="flex items-center justify-between gap-1.5 pt-1.5 border-t border-neutral-800/60">
                            <!-- Left: Stepper + Burn -->
                            <div class="flex items-center gap-1.5 shrink-0">
                                <div class="flex items-center bg-neutral-950 rounded-xl p-0.5 border border-neutral-800">
                                    <button type="button" onclick="quickAdjustTries(${c.id}, -1)" class="w-6 h-7 text-neutral-400 hover:text-white font-black active:scale-90 text-sm flex items-center justify-center">&minus;</button>
                                    <span class="text-xs font-mono font-black text-white px-1 min-w-[24px] text-center">${c.tries}t</span>
                                    <button type="button" onclick="quickAdjustTries(${c.id}, 1)" class="w-6 h-7 text-neutral-400 hover:text-white font-black active:scale-90 text-sm flex items-center justify-center">+</button>
                                </div>
                                <button type="button" onclick="quickRecordRouteBurn(${c.id})" class="h-8 px-2 rounded-xl bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700/80 font-black text-[10px] uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-all shadow-sm">
                                    <span>⏱️</span><span>Burn</span>
                                </button>
                            </div>

                            <!-- Right: 4 Milestones (25%, 50%, 75%, TOP 🏆) -->
                            <div class="flex items-center gap-1 flex-1 justify-end max-w-[205px]">
                                ${[25, 50, 75, 100].map(pct => {
                                    const isActive = curPct === pct;
                                    const isTop = pct === 100;
                                    const nextPct = isActive ? 0 : pct;
                                    let styleClasses = '';
                                    if (isTop && isActive) {
                                        styleClasses = 'bg-emerald-500 text-black font-black border-emerald-400 shadow-md shadow-emerald-500/20';
                                    } else if (isActive) {
                                        styleClasses = 'bg-emerald-500/25 text-emerald-300 font-black border border-emerald-500/50 shadow-sm';
                                    } else if (isTop) {
                                        styleClasses = 'bg-neutral-950 text-emerald-400/90 hover:text-emerald-300 border border-neutral-800 font-black';
                                    } else {
                                        styleClasses = 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800 font-bold';
                                    }
                                    return `
                                        <button type="button" onclick="quickSetCompletion(${c.id}, ${nextPct})" class="h-8 flex-1 rounded-xl text-[9px] uppercase tracking-wider transition-all flex items-center justify-center active:scale-95 border ${styleClasses}">
                                            ${isTop ? 'TOP 🏆' : `${pct}%`}
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </li>
                `;
            }).join('');

            listEl.innerHTML = workoutItemsHtml + climbsHtml;
        }

        function checkLiveFatigueAlert() {
            if (typeof Planner !== 'undefined') {
                const elapsed = sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
                const res = Planner.evaluateLiveFatigue(sessionClimbs, elapsed);
                const alertBox = document.getElementById('liveFatigueAlert');
                const textEl = document.getElementById('liveFatigueText');
                if (alertBox && textEl) {
                    const isCoachAlreadyWarning = currentCoachRec && (currentCoachRec.stage === 'rule_of_3' || currentCoachRec.stage === 'cooldown' || currentCoachRec.stage === 'strain_pivot');
                    if (res && res.fatigueDetected && (!isCoachAlreadyWarning || res.severity === 'critical')) {
                        textEl.innerText = res.alertMessage;
                        alertBox.classList.remove('hidden');
                    } else {
                        alertBox.classList.add('hidden');
                    }
                }
            }
        }

        function removeClimb(id) {
            const index = (sessionClimbs || []).findIndex(c => c.id === id);
            if (index > -1) {
                sessionScore -= sessionClimbs[index].points;
                sessionClimbs.splice(index, 1);
                renderSessionList();
                saveActiveSession();
                checkLiveFatigueAlert();
                updateCoachRecommendation();
            }
        }

        // Global exports for modal & card interactions
        window.openAddModal = openAddModal;
        window.openEditRouteModal = openEditRouteModal;
        window.openEditWorkoutModal = openEditWorkoutModal;
        window.closeLogModal = closeLogModal;
        window.switchLogModalMode = switchLogModalMode;
        window.adjModalGrade = adjModalGrade;
        window.setModalColorTag = setModalColorTag;
        window.toggleModalStyleTag = toggleModalStyleTag;
        window.adjModalTries = adjModalTries;
        window.setModalCompletion = setModalCompletion;
        window.submitModalClimb = submitModalClimb;
        window.saveModalClimbEdits = saveModalClimbEdits;
        window.deleteModalClimb = deleteModalClimb;
        window.selectModalWorkoutPreset = selectModalWorkoutPreset;
        window.adjModalWorkoutWeight = adjModalWorkoutWeight;
        window.adjModalWorkoutReps = adjModalWorkoutReps;
        window.toggleModalWorkoutSet = toggleModalWorkoutSet;
        window.logWorkoutSetAndRest = logWorkoutSetAndRest;
        window.saveModalWorkoutToSession = saveModalWorkoutToSession;
        window.deleteModalWorkout = deleteModalWorkout;
        window.quickAdjustTries = quickAdjustTries;
        window.quickRecordRouteBurn = quickRecordRouteBurn;
        window.quickSetCompletion = quickSetCompletion;
        window.removeClimb = removeClimb;
        window.cycleCoachRecommendation = cycleCoachRecommendation;
        window.applyCoachRecommendation = applyCoachRecommendation;

        // Legacy no-op stubs
        window.startCoachedSession = () => openAddModal('climb');
        window.advanceCoachedPhase = () => {};
        window.applyCoachTargetGrade = applyCoachRecommendation;
        window.toggleCoachRestTimer = () => typeof startRestTimer === 'function' ? startRestTimer() : null;
        window.forfeitTraining = () => {};
        window.endTraining = () => {};
        window.openTrainingConfig = () => openAddModal('climb');
        window.startTrainingMode = () => openAddModal('climb');
        window.startTrainingClimbTimer = () => {};
        window.restoreTrainingUI = () => {};
        window.dismissCoachAdaptiveBanner = () => {};
        window.checkIntraSessionAdaptation = () => updateCoachRecommendation();

        function endSession() {
            const hasCompletedWorkouts = sessionWorkouts && sessionWorkouts.some(w => (w.exercises || []).some(e => (e.completedSets || 0) > 0));
            if (sessionClimbs.length === 0 && !hasCompletedWorkouts) {
                if (!confirm("You haven't logged any climbs or workouts. End session with 0 points?")) {
                    return;
                }
            }

            const durationSeconds = sessionStartTime ? Math.min(43200, Math.max(0, Math.floor((Date.now() - sessionStartTime) / 1000))) : 0;
            boulderHistory.push({
                date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
                timestamp: Date.now(),
                score: sessionScore,
                duration: durationSeconds,
                climbs: [...sessionClimbs],
                workouts: [...sessionWorkouts]
            });
            localStorage.setItem('boulderHistory', JSON.stringify(boulderHistory));
            localStorage.removeItem('boulderActiveSession');

            if (boulderHistory.length >= 5) unlockAchievement('consistency');
            if (durationSeconds >= 10800) unlockAchievement('marathon');

            // Calculate Summary Stats
            let bestScore = -1;
            let bestName = "-";
            sessionClimbs.forEach(c => {
                if (c.points > bestScore) {
                    bestScore = c.points;
                    bestName = c.gradeStr || "-";
                }
            });
            if (bestScore === -1 && sessionClimbs.length > 0) {
                bestName = sessionClimbs[0].gradeStr || "V?";
            } else if (bestScore === -1 && hasCompletedWorkouts) {
                bestName = sessionWorkouts[0].shortName || sessionWorkouts[0].name || "Workout";
            }

            const durationMinutes = Math.round(durationSeconds / 60);

            // Populate Summary Modal
            document.getElementById('summaryScore').innerText = sessionScore;
            document.getElementById('summaryTime').innerText = durationMinutes + "m";
            document.getElementById('summaryClimbs').innerText = sessionClimbs.length;
            document.getElementById('summaryBest').innerText = bestName;
            document.getElementById('summaryDate').innerText = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

            // Show Summary Modal
            document.getElementById('sessionSummaryOverlay').classList.replace('hidden', 'flex');

            // Confetti!
            if (typeof confetti === 'function') {
                confetti({
                    particleCount: 150,
                    spread: 80,
                    origin: { y: 0.6 },
                    colors: ['#10b981', '#06b6d4', '#fbbf24'],
                    zIndex: 200
                });
            }
        }

        function closeSessionSummary() {
            document.getElementById('sessionSummaryOverlay').classList.replace('flex', 'hidden');

            if (sessionTimerInterval) {
                clearInterval(sessionTimerInterval);
                sessionTimerInterval = null;
            }
            sessionStartTime = null;
            DOM.sessionScoreStr.classList.remove('animate-score-pulse');
            if (DOM.sessionTimerStr) {
                DOM.sessionTimerStr.innerText = "00:00:00";
            }
            
            toggleSessionButtonUI(false);
            if ('vibrate' in navigator) navigator.vibrate(30);

            sessionScore = 0;
            sessionClimbs = [];
            sessionWorkouts = [];
            activeWorkoutPreset = null;
            activeWorkoutExIndex = 0;
            switchLogMode('climb');
            renderSessionList();
            if (typeof renderHistoryList === 'function') renderHistoryList();
            if (typeof updateAnalytics === 'function') updateAnalytics();
            const alertBox = document.getElementById('liveFatigueAlert');
            if (alertBox) alertBox.classList.add('hidden');
            const feedbackContainer = document.getElementById('sessionFeedbackContainer');
            if (feedbackContainer) {
                feedbackContainer.innerHTML = `
                    <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400 text-center mb-2">How Did Today's Plan Feel?</p>
                    <div class="grid grid-cols-3 gap-2">
                        <button onclick="handleSessionFeedback('hard')" class="py-2.5 px-1 bg-neutral-950 border border-neutral-800 hover:border-red-500/50 rounded-xl text-[10px] font-bold text-neutral-300 active:scale-95 transition-all">Exhausted 🥵</button>
                        <button onclick="handleSessionFeedback('perfect')" class="py-2.5 px-1 bg-neutral-950 border border-neutral-800 hover:border-emerald-500/50 rounded-xl text-[10px] font-bold text-neutral-300 active:scale-95 transition-all">Spot On 🎯</button>
                        <button onclick="handleSessionFeedback('easy')" class="py-2.5 px-1 bg-neutral-950 border border-neutral-800 hover:border-blue-500/50 rounded-xl text-[10px] font-bold text-neutral-300 active:scale-95 transition-all">More Gas ⚡</button>
                    </div>
                `;
            }
            renderSessionList();
            updateAnalytics();
            renderHistoryList();
            if (typeof renderPlannerUI === 'function') renderPlannerUI();
            switchTab('history');
            if (typeof triggerMilestoneBackup === 'function') triggerMilestoneBackup();
        }

        function switchTab(tabId, push = true) {
            if (tabId === 'log' || tabId === 'planner') tabId = 'session';
            const pageEl = document.getElementById(`page-${tabId}`);
            if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth', inline: 'start' });
            if (push) {
                history.pushState({ tab: tabId }, '', '#' + tabId);
                if ('vibrate' in navigator) navigator.vibrate(5);
            }
        }

        const tabObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const tabId = entry.target.id.replace('page-', '');
                    
                    ['session', 'history', 'leaderboard'].forEach(id => {
                        const navEl = document.getElementById(`nav-${id}`);
                        if(navEl) navEl.classList.replace('text-emerald-500', 'text-neutral-500');
                    });
                    const activeNav = document.getElementById(`nav-${tabId}`);
                    if(activeNav) activeNav.classList.replace('text-neutral-500', 'text-emerald-500');
                    
                    if (tabId === 'log') {
                        renderTags();
                    }
                    if (tabId === 'planner' && typeof renderPlannerUI === 'function') {
                        renderPlannerUI();
                    }
                    if (tabId === 'leaderboard') {
                        updateLeaderboardUI();
                        loadLeaderboard();
                    }
                }
            });
        }, { threshold: 0.6 });

        window.addEventListener('popstate', (event) => {
            const state = event.state;
            
            // Close all overlays first by default (only if they are not the target destination)
            const settingsOverlay = document.getElementById('settingsOverlay');
            if (settingsOverlay && settingsOverlay.classList.contains('flex')) {
                if (!state || state.overlay !== 'settings') {
                    settingsOverlay.classList.replace('flex', 'hidden'); 
                }
            }
            
            const sessionOverlay = document.getElementById('sessionDetailOverlay');
            if (sessionOverlay && sessionOverlay.classList.contains('flex')) {
                if (!state || state.overlay !== 'sessionDetail') {
                    const sheet = document.getElementById('sessionDetailSheet');
                    sheet.style.transform = 'translateY(100%)';
                    setTimeout(() => sessionOverlay.classList.replace('flex', 'hidden'), 300);
                }
            }

            const editOverlay = document.getElementById('editSessionOverlay');
            if (editOverlay && editOverlay.classList.contains('flex')) {
                if (!state || state.overlay !== 'editSession') {
                    editOverlay.classList.replace('flex', 'hidden');
                }
            }
            
            if (state && state.overlay) {
                if (state.overlay === 'settings') openSettings(false);
                if (state.overlay === 'sessionDetail') openSessionDetail(state.index, false);
                if (state.overlay === 'editSession') openEditSession(state.index, false);
            } else if (state && state.tab) {
                switchTab(state.tab, false);
            } else {
                // If we hit back and there's no state, we might be at the browser's initial entry.
                // To prevent gray screen, we force 'log' view and push it back to the history if possible.
                switchTab('session', false);
                if (!state) history.replaceState({ tab: 'session' }, '', '#session');
            }
        });

        // Initialize first state
        if (!history.state) {
            history.replaceState({ tab: 'session' }, '', '#session');
        } else if (history.state.tab) {
            switchTab(history.state.tab, false);
        }

        setTimeout(() => {
            ['session', 'history', 'leaderboard'].forEach(id => {
                const el = document.getElementById(`page-${id}`);
                if(el) tabObserver.observe(el);
            });
        }, 100);

        // Screen-dark / background recovery listener for session & coach timers
        function syncAppTimersFromWallClock() {
            if (sessionStartTime) updateSessionTimer();
            if (typeof window.getRestTimerRemaining === 'function' && typeof window.isRestTimerRunning === 'function') {
                updateCoachRestTimerDisplay(window.getRestTimerRemaining(), window.isRestTimerRunning());
            }
        }

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                syncAppTimersFromWallClock();
            }
        });
        window.addEventListener('focus', syncAppTimersFromWallClock);

        function bootApp() {
            try {
                // Display version dynamically
                document.querySelectorAll('.app-version-text').forEach(el => el.innerText = APP_VERSION);
                const refreshTextEl = document.getElementById('hardRefreshText');
                if (refreshTextEl) refreshTextEl.innerText = `Hard Refresh (${APP_VERSION})`;

                renderAchievements();
                renderTags();
                renderMaxGradeSelect();
                loadActiveSession();
                updateUI();
                updateSubmitButtonLabel();

                if (typeof updateAnalytics === 'function') updateAnalytics();
                if (typeof renderHistoryList === 'function') renderHistoryList();
                if (typeof renderPlannerUI === 'function') renderPlannerUI();
                if (typeof updateCoachRecommendation === 'function') updateCoachRecommendation();
                if (typeof renderSessionList === 'function') renderSessionList();
                if (typeof updateSessionMetrics === 'function') updateSessionMetrics();
                toggleSessionButtonUI(!!sessionStartTime);

                // Sanity check for achievements
                if (boulderHistory && boulderHistory.length >= 5) unlockAchievement('consistency');
                const score = typeof getTotalScore === 'function' ? getTotalScore() : 0;
                if (score >= 1000) unlockAchievement('centurion');
            } catch (e) {
                console.error("App boot sequence failed:", e);
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bootApp);
        } else {
            bootApp();
        }

