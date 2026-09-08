        const APP_VERSION = 'v2.0.0';

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
            if (!DOM.sessionBtn) return;
            if (isActive) {
                DOM.sessionBtn.innerText = "FINISH";
                DOM.sessionBtn.classList.replace('bg-emerald-500/20', 'bg-red-500/20');
                DOM.sessionBtn.classList.replace('text-emerald-400', 'text-red-400');
                DOM.sessionBtn.classList.replace('border-emerald-500/30', 'border-red-500/30');
            } else {
                DOM.sessionBtn.innerText = "START";
                DOM.sessionBtn.classList.replace('bg-red-500/20', 'bg-emerald-500/20');
                DOM.sessionBtn.classList.replace('text-red-400', 'text-emerald-400');
                DOM.sessionBtn.classList.replace('border-red-500/30', 'border-emerald-500/30');
            }
        }

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

        let boulderHistory = JSON.parse(localStorage.getItem('boulderHistory')) || [];
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
        
        // Coach Guided Workout state variables
        let trainingActive = false;
        let coachPhaseIndex = 0;
        let coachPlan = null;
        let coachRestTimerInterval = null;
        let coachRestRemaining = 0;
        let coachRestTargetSec = 120;
        // Legacy stubs for safe backwards compatibility
        let trainingState = 'climb';
        let trainingCurrentGradeIndex = 0;
        let trainingStartGradeIndex = 0;
        let trainingFocus = 'best';
        let trainingTimerEndEpoch = 0;
        let trainingRung = 1;
        let trainingConfigGradeIndex = 0;
        let trainingFocusTags = [];
        let trainingTimerInterval = null;
        
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

        let boulderActiveSession = JSON.parse(localStorage.getItem('boulderActiveSession'));
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

        let achievementsUnlocked = JSON.parse(localStorage.getItem('boulderAchievements')) || [];

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
                    if (data.maxGradeIndex !== undefined) localStorage.setItem('boulderMaxGradeIndex', data.maxGradeIndex);
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
                    activeWorkoutExIndex,
                    // Coach workout state persistence
                    trainingActive,
                    coachPhaseIndex,
                    coachPlan,
                    // Backward-compatible fields
                    trainingState,
                    trainingCurrentGradeIndex,
                    trainingStartGradeIndex,
                    trainingFocus,
                    trainingTimerEndEpoch,
                    trainingRung,
                    trainingConfigGradeIndex,
                    trainingFocusTags
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

                    // Restore training / coach state if any
                    if (active.trainingActive) {
                        trainingActive = true;
                        coachPhaseIndex = active.coachPhaseIndex || 0;
                        coachPlan = active.coachPlan || (typeof Planner !== 'undefined' ? Planner.getTodayPlan() : null);
                        trainingState = active.trainingState || 'climb';
                        trainingCurrentGradeIndex = active.trainingCurrentGradeIndex || 0;
                        restoreTrainingUI();
                    }

                    if (activeLogMode === 'workout') {
                        switchLogMode('workout');
                    } else if (activeWorkoutPreset) {
                        renderWorkoutHUD();
                    }

                    renderSessionList();
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

        elGrade.innerText = fontGrades[currentGradeIndex];
        updateUI();
        updateSubmitButtonLabel();

        // -- LOGIC: INPUT --
        function adjGrade(dir) {
            if ('vibrate' in navigator) navigator.vibrate(15);
            currentGradeIndex = Math.max(0, Math.min(fontGrades.length - 1, currentGradeIndex + dir));
            elGrade.innerText = fontGrades[currentGradeIndex];
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

            // Automatically trigger coach rest timer when resting between burns
            if (trainingActive) {
                const isRunning = typeof window.isRestTimerRunning === 'function'
                    ? window.isRestTimerRunning()
                    : (coachRestTimerInterval !== null);
                if (!isRunning) {
                    toggleCoachRestTimer();
                }
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

        function initWorkoutPreset(preset) {
            if (!preset) return;
            // Check if already in sessionWorkouts
            let existing = sessionWorkouts.find(w => w.id === preset.id);
            if (existing) {
                activeWorkoutPreset = existing;
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
                    exercises: (preset.exercises || []).map(ex => ({
                        id: ex.id,
                        name: ex.name,
                        sets: typeof ex.sets === 'number' ? ex.sets : 3,
                        reps: ex.reps || '10 reps',
                        restSeconds: ex.restSeconds || 60,
                        desc: ex.desc || '',
                        trackWeight: !!ex.trackWeight,
                        isHang: !!ex.isHang || !!(preset.hangConfig && preset.hangConfig.isHang),
                        hangSeconds: ex.hangSeconds !== undefined ? ex.hangSeconds : (preset.hangConfig ? preset.hangConfig.hangSeconds : 10),
                        repRestSeconds: ex.repRestSeconds !== undefined ? ex.repRestSeconds : (preset.hangConfig ? preset.hangConfig.repRestSeconds : 0),
                        repsPerSet: ex.repsPerSet !== undefined ? ex.repsPerSet : (preset.hangConfig ? preset.hangConfig.repsPerSet : 1),
                        prepSeconds: ex.prepSeconds !== undefined ? ex.prepSeconds : (preset.hangConfig ? preset.hangConfig.prepSeconds : 5),
                        defaultWeight: ex.defaultWeight !== undefined ? ex.defaultWeight : (ex.trackWeight ? 60 : 0),
                        defaultReps: ex.defaultReps !== undefined ? ex.defaultReps : 6,
                        activeWeight: ex.defaultWeight !== undefined ? ex.defaultWeight : (ex.trackWeight ? 60 : 0),
                        activeReps: ex.defaultReps !== undefined ? ex.defaultReps : 6,
                        completedSets: ex.completedSets || 0,
                        setsData: ex.setsData ? [...ex.setsData] : []
                    }))
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
            const isRepeaters = activeWorkoutPreset.id === 'repeaters_7_3';

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

            const overlay = document.getElementById('hangTimerOverlay');
            if (overlay) {
                overlay.classList.remove('hidden');
                overlay.classList.add('flex');
            }

            if (typeof window.requestScreenWakeLock === 'function') {
                window.requestScreenWakeLock();
            }

            const prepSecs = typeof currentEx.prepSeconds === 'number' ? currentEx.prepSeconds : 5;
            hangTotalReps = currentEx.repsPerSet || 1;
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

            const hangSecs = currentEx.hangSeconds || 10;
            const repRestSecs = currentEx.repRestSeconds || 3;

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

            const setRestSecs = currentEx.restSeconds || 180;

            if (typeof window.playIntervalBeep === 'function') window.playIntervalBeep('set_complete');
            if (typeof window.playHangVibration === 'function') window.playHangVibration('set_complete');

            // Mark set completed
            currentEx.completedSets = (currentEx.completedSets || 0) + 1;
            const activeW = typeof currentEx.activeWeight === 'number' ? currentEx.activeWeight : (currentEx.defaultWeight || 0);
            currentEx.setsData = currentEx.setsData || [];
            currentEx.setsData[currentEx.completedSets - 1] = {
                set: currentEx.completedSets,
                weight: currentEx.trackWeight ? activeW : 0,
                reps: currentEx.repsPerSet || 1,
                hangSeconds: currentEx.hangSeconds || 10,
                completed: true
            };

            saveActiveSession();
            recomputeSessionScore();
            renderSessionList();

            // Stop hang timer & hide overlay
            stopHangTimer(false);

            // Auto-transition into set rest countdown
            if (typeof window.startRestTimer === 'function') {
                window.startRestTimer(setRestSecs, true);
            }

            // If more hangs/sets exist in preset, advance to next
            if (activeWorkoutExIndex < activeWorkoutPreset.exercises.length - 1) {
                activeWorkoutExIndex++;
            }
            renderWorkoutHUD();
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
            const isHangWorkout = !!currentEx.isHang || (activeWorkoutPreset && activeWorkoutPreset.category === 'hangboard');
            if (hangController) {
                if (isHangWorkout) {
                    hangController.classList.remove('hidden');
                    hangController.classList.add('flex');
                    if (setsPrompt) setsPrompt.innerText = 'Or tap set to mark manually:';

                    const isRepeaters = activeWorkoutPreset.id === 'repeaters_7_3';
                    const startBtnLabel = document.getElementById('btnStartHangLabel');
                    const helperPrompt = document.getElementById('hangHelperPrompt');
                    const protocolBadge = document.getElementById('hangPresetProtocolBadge');
                    const durationRow = document.getElementById('hangDurationChipsRow');

                    const hangSecs = currentEx.hangSeconds || 10;

                    if (isRepeaters) {
                        if (startBtnLabel) startBtnLabel.innerText = `START SET ${activeWorkoutExIndex + 1} (6 × 7:3)`;
                        if (helperPrompt) helperPrompt.innerText = '5s Prep → 6 × (7s Hang / 3s Shake) → Auto 2.5m Rest';
                        if (protocolBadge) protocolBadge.innerText = '7s/3s × 6';
                        if (durationRow) durationRow.classList.add('hidden');
                    } else {
                        if (startBtnLabel) startBtnLabel.innerText = `START HANG ${activeWorkoutExIndex + 1} (${hangSecs}s)`;
                        if (helperPrompt) helperPrompt.innerText = `5s Prep Chime → ${hangSecs}s Hang → Release Buzzer`;
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
            return sessionScore;
        }
        window.recomputeSessionScore = recomputeSessionScore;
        window.getSessionWorkouts = () => sessionWorkouts;
        window.getActiveLogMode = () => activeLogMode;

        const tryPtsMap   = [1, 2, 3, 5, 8, 12, 18, 25];
        const topBonusMap = [3, 5, 8, 12, 22, 35, 55, 80];
        const flashBonusMap = [2, 3, 5, 8, 15, 25, 40, 60];

        function calculatePoints(delta, flashed, topped, attempts) {
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
            return Math.min(attempts, 8) * tryPts;
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
                    selectMax.value = maxGradeIndex;
                    localStorage.setItem('boulderMaxGradeIndex', maxGradeIndex);
                    
                    // Cool animation for new max grade
                    if (typeof confetti === 'function') {
                        confetti({ particleCount: 300, spread: 160, origin: { y: 0.5 }, startVelocity: 45, colors: ['#ff0000', '#00ff00', '#3b82f6', '#fbbf24', '#10b981'] });
                    }
                    const displayGradeEl = document.getElementById('displayGrade');
                    displayGradeEl.classList.add('scale-150', 'text-amber-400', 'drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]');
                    setTimeout(() => {
                        displayGradeEl.classList.remove('scale-150', 'text-amber-400', 'drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]');
                    }, 1200);
                } else if (delta === 0) {
                    if (typeof confetti === 'function') {
                        confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 }, colors: ['#10b981'] });
                    }
                }
            }

            sessionScore += points;

            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

            const currentPhase = (trainingActive && coachPlan && coachPlan.phases)
                ? coachPlan.phases[coachPhaseIndex]
                : null;

            sessionClimbs.unshift({
                id: climbIdCounter++,
                gradeStr: fontGrades[currentGradeIndex],
                statusText, color, tries, points,
                time: timeStr,
                tags: [...selectedTags],
                ...(currentPhase && { phaseName: currentPhase.title || currentPhase.name })
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
            btnSubmit.innerText = `+${points} ADDED`;
            btnSubmit.classList.add('bg-emerald-400', 'text-black', 'border-emerald-400');

            setTimeout(() => {
                btnSubmit.classList.remove('bg-emerald-400', 'text-black', 'border-emerald-400');
                updateSubmitButtonLabel();
            }, 800);

            selectedTags = [];
            tries = 1;
            burnsRecorded = 0;
            if (elTries) elTries.innerText = 1;
            isTop = false;
            isFlash = false;
            flashManuallyDisabled = false;
            updateUI();
            renderTags();

            // Training Mode: check if this climb completes a rung
            if (trainingActive && trainingState === 'climb'
                && currentGradeIndex === trainingCurrentGradeIndex
                && (isTop || isFlash)) {
                handleTrainingRungComplete();
            }
        }

        // -- LOGIC: RENDER & DELETE SESSION CLIMBS --
        function renderSessionList() {
            const listEl = document.getElementById('sessionList');
            recomputeSessionScore();
            document.getElementById('sessionScoreDisplay').innerText = sessionScore;

            let workoutItemsHtml = '';
            if (sessionWorkouts && sessionWorkouts.length > 0) {
                sessionWorkouts.forEach(w => {
                    const completedSetsCount = (w.exercises || []).reduce((acc, ex) => acc + (ex.completedSets || 0), 0);
                    const totalSetsCount = (w.exercises || []).reduce((acc, ex) => acc + (ex.sets || 0), 0);
                    if (completedSetsCount > 0) {
                        workoutItemsHtml += `
                            <li class="flex justify-between items-center p-2.5 bg-neutral-850/80 rounded-xl border border-cyan-500/30">
                                <div class="flex items-center gap-3">
                                    <span class="text-xl">${w.icon || '💪'}</span>
                                    <div class="flex flex-col">
                                        <span class="text-xs font-black text-white leading-tight">${w.shortName || w.name}</span>
                                        <span class="text-[10px] text-cyan-400 font-bold">${completedSetsCount}/${totalSetsCount} Sets Completed</span>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-emerald-400 font-bold text-sm">+${completedSetsCount * 10} pts</span>
                                </div>
                            </li>
                        `;
                    }
                });
            }

            if (sessionClimbs.length === 0 && !workoutItemsHtml) {
                listEl.innerHTML = '<li class="text-neutral-500 text-center mt-10 text-sm">No climbs or workouts logged yet.</li>';
                return;
            }

            const climbsHtml = sessionClimbs.map(c => `
                <li class="flex justify-between items-center p-2.5 bg-neutral-800/50 rounded-xl border border-neutral-700/30">
                    <div class="flex items-center gap-3">
                        <div class="flex flex-col items-center justify-center w-8">
                            <span class="text-lg font-black leading-tight">${c.gradeStr}</span>
                            ${c.time ? `<span class="text-[8px] text-neutral-500 -mt-1 tracking-tighter">${c.time}</span>` : ''}
                        </div>
                        <div class="flex flex-col">
                            <span class="${c.color} text-[11px] font-bold uppercase tracking-wider">${c.statusText}</span>
                            <span class="text-neutral-500 text-[9px]">${c.tries} Attempt${c.tries > 1 ? 's' : ''}</span>
                            ${c.tags && c.tags.length > 0 ? `<div class="flex gap-1 mt-1 flex-wrap">${c.tags.map(t => `<span class="bg-neutral-800 text-neutral-400 border border-neutral-700 text-[8px] uppercase px-1.5 py-0.5 rounded">${t}</span>`).join('')}</div>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-emerald-400 font-bold text-sm">+${c.points} pts</span>
                        <button onclick="removeClimb(${c.id})" class="text-red-500/40 hover:text-red-500 active:scale-90 transition p-2 -mr-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </button>
                    </div>
                </li>
            `).join('');

            listEl.innerHTML = workoutItemsHtml + climbsHtml;
        }

        function checkLiveFatigueAlert() {
            if (typeof Planner !== 'undefined') {
                const elapsed = sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
                const res = Planner.evaluateLiveFatigue(sessionClimbs, elapsed);
                const alertBox = document.getElementById('liveFatigueAlert');
                const textEl = document.getElementById('liveFatigueText');
                if (alertBox && textEl) {
                    if (res.fatigueDetected) {
                        textEl.innerText = res.alertMessage;
                        alertBox.classList.remove('hidden');
                    } else {
                        alertBox.classList.add('hidden');
                    }
                }
            }
        }

        function removeClimb(id) {
            const index = sessionClimbs.findIndex(c => c.id === id);
            if (index > -1) {
                sessionScore -= sessionClimbs[index].points;
                sessionClimbs.splice(index, 1);
                renderSessionList();
                saveActiveSession();
                checkLiveFatigueAlert();
                checkIntraSessionAdaptation();
            }
        }

        // =============================================
        // COACH-GUIDED RECOMMENDATIONS IMPLEMENTATION
        // =============================================

        let dismissedCoachAdaptationIds = new Set();

        function checkIntraSessionAdaptation() {
            if (!trainingActive || !coachPlan || !coachPlan.phases || !coachPlan.phases[coachPhaseIndex]) {
                hideCoachAdaptiveBanner();
                return;
            }

            if (typeof Planner === 'undefined' || typeof Planner.evaluateIntraSessionAdaptation !== 'function') {
                hideCoachAdaptiveBanner();
                return;
            }

            const inProgress = {
                gradeStr: fontGrades[currentGradeIndex],
                tries: tries || 1,
                status: (isTop || isFlash) ? 'topped' : 'in_progress'
            };
            const adaptation = Planner.evaluateIntraSessionAdaptation(sessionClimbs, coachPhaseIndex, coachPlan, inProgress);
            const banner = document.getElementById('coachAdaptiveBanner');
            if (!banner) return;

            if (!adaptation || dismissedCoachAdaptationIds.has(adaptation.id)) {
                banner.classList.add('hidden');
                return;
            }

            // Populate banner
            const iconEl = document.getElementById('coachAdaptiveIcon');
            const titleEl = document.getElementById('coachAdaptiveTitle');
            const msgEl = document.getElementById('coachAdaptiveMessage');
            const actionsEl = document.getElementById('coachAdaptiveActions');

            if (titleEl) titleEl.innerText = adaptation.title;
            if (msgEl) msgEl.innerText = adaptation.message;
            if (iconEl) {
                iconEl.innerText = adaptation.badgeColor === 'emerald' ? '🔥' : '⚠️';
            }

            // Color theme
            if (adaptation.badgeColor === 'emerald') {
                banner.className = 'bg-emerald-950/80 border border-emerald-500/50 rounded-xl p-2.5 shadow-md flex flex-col gap-1.5 transition-all';
                if (titleEl) titleEl.className = 'text-[11px] font-black text-emerald-400 truncate';
            } else {
                banner.className = 'bg-amber-950/80 border border-amber-500/50 rounded-xl p-2.5 shadow-md flex flex-col gap-1.5 transition-all';
                if (titleEl) titleEl.className = 'text-[11px] font-black text-amber-400 truncate';
            }

            if (actionsEl && adaptation.actions) {
                actionsEl.innerHTML = adaptation.actions.map(act => `
                    <button onclick="handleCoachAdaptiveAction('${act.action}', '${adaptation.id}', ${act.newGradeIdx !== undefined ? act.newGradeIdx : 'null'}, ${act.restSeconds || 0})"
                        class="flex-1 py-1.5 px-2 rounded-lg ${
                            act.primary 
                            ? (adaptation.badgeColor === 'emerald' ? 'bg-emerald-500 text-black font-black' : 'bg-amber-500 text-black font-black')
                            : 'bg-neutral-800 text-neutral-300 font-bold border border-neutral-700'
                        } text-[10px] uppercase tracking-wider active:scale-95 transition-all truncate shadow-sm">
                        ${act.label}
                    </button>
                `).join('');
            }

            banner.classList.remove('hidden');
        }

        function hideCoachAdaptiveBanner() {
            const banner = document.getElementById('coachAdaptiveBanner');
            if (banner) banner.classList.add('hidden');
        }

        function dismissCoachAdaptiveBanner() {
            if (typeof Planner !== 'undefined' && Planner.evaluateIntraSessionAdaptation) {
                const inProgress = {
                    gradeStr: fontGrades[currentGradeIndex],
                    tries: tries || 1,
                    status: (isTop || isFlash) ? 'topped' : 'in_progress'
                };
                const adaptation = Planner.evaluateIntraSessionAdaptation(sessionClimbs, coachPhaseIndex, coachPlan, inProgress);
                if (adaptation) dismissedCoachAdaptationIds.add(adaptation.id);
            }
            hideCoachAdaptiveBanner();
        }

        function handleCoachAdaptiveAction(action, adaptationId, newGradeIdx, restSeconds) {
            if (adaptationId) dismissedCoachAdaptationIds.add(adaptationId);
            hideCoachAdaptiveBanner();

            if (action === 'bump_grade' || action === 'drop_grade') {
                if (newGradeIdx !== null && newGradeIdx !== undefined && newGradeIdx >= 0 && newGradeIdx < fontGrades.length) {
                    if ('vibrate' in navigator) navigator.vibrate([40, 40, 40]);
                    if (action === 'bump_grade' && typeof confetti === 'function') {
                        confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 }, colors: ['#10b981', '#f59e0b'] });
                    }
                    if (coachPlan && coachPlan.phases && coachPlan.phases[coachPhaseIndex]) {
                        coachPlan.phases[coachPhaseIndex].targetGradeIdx = newGradeIdx;
                        coachPlan.phases[coachPhaseIndex].targetGradeStr = fontGrades[newGradeIdx];
                    }
                    currentGradeIndex = newGradeIdx;
                    const elGrade = document.getElementById('displayGrade');
                    if (elGrade) elGrade.innerText = fontGrades[currentGradeIndex];

                    updateTrainingHUD();
                    updateTrainingSessionBanner();
                    saveActiveSession();
                }
            } else if (action === 'advance_phase') {
                advanceCoachedPhase();
            } else if (action === 'add_rest') {
                if ('vibrate' in navigator) navigator.vibrate(20);
                if (typeof window.adjRestTimer === 'function') {
                    window.adjRestTimer(restSeconds || 60);
                    const overlay = document.getElementById('restOverlay');
                    if (overlay && overlay.classList.contains('hidden')) {
                        overlay.classList.replace('hidden', 'flex');
                    }
                } else {
                    coachRestRemaining = (coachRestRemaining || 0) + (restSeconds || 60);
                    updateCoachRestTimerDisplay();
                    if (!coachRestTimerInterval) toggleCoachRestTimer();
                }
            }
        }

        window.handleCoachAdaptiveAction = handleCoachAdaptiveAction;
        window.dismissCoachAdaptiveBanner = dismissCoachAdaptiveBanner;

        function startCoachedSession(phaseIdx = 0) {
            if ('vibrate' in navigator) navigator.vibrate([30, 50, 30]);

            if (!sessionStartTime) {
                startSession();
            }

            if (typeof Planner !== 'undefined') {
                coachPlan = Planner.getTodayPlan();
            }

            if (!coachPlan || !coachPlan.phases || coachPlan.phases.length === 0) {
                const warmupIdx = Math.max(0, maxGradeIndex - 6);
                const midIdx = Math.max(0, maxGradeIndex - 4);
                const coolIdx = Math.max(0, maxGradeIndex - 8);
                coachPlan = {
                    title: "🧗 Daily Climbing Session",
                    phases: [
                        { name: "Warmup (20m)", title: "Warmup", desc: `Build gradually from ${fontGrades[warmupIdx]} to ${fontGrades[midIdx]}.`, durationMinutes: 20, restSeconds: 60, targetGradeIdx: warmupIdx, targetGradeStr: fontGrades[warmupIdx], targetTags: ['slab', 'sloper'] },
                        { name: "Main Phase (45m)", title: "Main Phase", desc: `Work target problems at ${fontGrades[maxGradeIndex]}.`, durationMinutes: 45, restSeconds: 150, targetGradeIdx: maxGradeIndex, targetGradeStr: fontGrades[maxGradeIndex], targetTags: ['powerful', 'crimp'] },
                        { name: "Cool Down (10m)", title: "Cool Down", desc: `2 easy movement slabs at ${fontGrades[coolIdx]} or below.`, durationMinutes: 10, restSeconds: 60, targetGradeIdx: coolIdx, targetGradeStr: fontGrades[coolIdx], targetTags: ['slab'] }
                    ]
                };
            }

            trainingActive = true;
            trainingState = 'coach';
            coachPhaseIndex = Math.max(0, Math.min(coachPlan.phases.length - 1, phaseIdx));

            // Setup current phase settings
            setupCoachPhase(coachPhaseIndex);

            // Close legacy overlay if open
            const overlay = document.getElementById('trainingConfigOverlay');
            if (overlay) overlay.classList.replace('flex', 'hidden');

            updateTrainingHUD();
            updateTrainingSessionBanner();
            switchTab('log');
            saveActiveSession();
        }

        function setupCoachPhase(index) {
            if (!coachPlan || !coachPlan.phases || !coachPlan.phases[index]) return;
            const phase = coachPlan.phases[index];

            hideCoachAdaptiveBanner();

            // Auto-switch mode based on phase type
            if (phase.type === 'workout' && Array.isArray(phase.exercises) && phase.exercises.length > 0) {
                const workoutObj = {
                    id: 'coach_phase_' + index,
                    name: phase.title || 'Workout Circuit',
                    shortName: phase.title || 'Workout',
                    category: 'prehab',
                    icon: '💪',
                    badge: 'Coach',
                    durationMinutes: phase.durationMinutes || 15,
                    desc: phase.desc || 'Complete the targeted exercise sets recommended by your coach.',
                    exercises: phase.exercises.map(ex => ({
                        id: ex.id,
                        name: ex.name,
                        sets: typeof ex.sets === 'number' ? ex.sets : 3,
                        reps: ex.reps || '10 reps',
                        restSeconds: ex.restSeconds || 60,
                        desc: ex.desc || '',
                        completedSets: ex.completedSets || 0
                    }))
                };
                initWorkoutPreset(workoutObj);
                switchLogMode('workout');
            } else {
                switchLogMode('climb');
            }

            // Set current logger grade to phase target grade if valid
            if (phase.targetGradeIdx !== null && phase.targetGradeIdx !== undefined) {
                currentGradeIndex = phase.targetGradeIdx;
                const elGrade = document.getElementById('displayGrade');
                if (elGrade) elGrade.innerText = fontGrades[currentGradeIndex];
            }

            // Pre-select phase tags if available
            if (phase.targetTags && phase.targetTags.length > 0) {
                selectedTags = [...phase.targetTags];
                renderTags();
            }

            // Configure built-in rest timer for this phase
            const phaseRest = phase.restSeconds || 120;
            coachRestRemaining = phaseRest;
            if (typeof window.setDefaultRestSeconds === 'function') {
                window.setDefaultRestSeconds(phaseRest);
            }
            if (typeof window.cancelRestTimer === 'function' && typeof window.isRestTimerRunning === 'function' && window.isRestTimerRunning()) {
                window.cancelRestTimer();
            }
            if (coachRestTimerInterval) {
                clearInterval(coachRestTimerInterval);
                coachRestTimerInterval = null;
            }

            updateCoachRestTimerDisplay(phaseRest, false, phaseRest);
            checkIntraSessionAdaptation();
        }

        function applyCoachTargetGrade() {
            if (!trainingActive || !coachPlan || !coachPlan.phases || !coachPlan.phases[coachPhaseIndex]) return;
            const phase = coachPlan.phases[coachPhaseIndex];
            if (phase.targetGradeIdx !== null && phase.targetGradeIdx !== undefined) {
                if ('vibrate' in navigator) navigator.vibrate(20);
                currentGradeIndex = phase.targetGradeIdx;
                const elGrade = document.getElementById('displayGrade');
                if (elGrade) elGrade.innerText = fontGrades[currentGradeIndex];
            }
        }

        function advanceCoachedPhase() {
            if (!trainingActive || !coachPlan || !coachPlan.phases) return;

            if (typeof window.cancelRestTimer === 'function') {
                window.cancelRestTimer();
            }
            if (coachRestTimerInterval) {
                clearInterval(coachRestTimerInterval);
                coachRestTimerInterval = null;
            }

            if (coachPhaseIndex < coachPlan.phases.length - 1) {
                if ('vibrate' in navigator) navigator.vibrate([40, 60, 40]);
                if (typeof confetti === 'function') {
                    confetti({
                        particleCount: 50,
                        spread: 50,
                        origin: { y: 0.6 },
                        colors: ['#10b981', '#3b82f6', '#fbbf24']
                    });
                }
                coachPhaseIndex++;
                setupCoachPhase(coachPhaseIndex);
                updateTrainingHUD();
                updateTrainingSessionBanner();
                saveActiveSession();
            } else {
                // Completed final phase
                if ('vibrate' in navigator) navigator.vibrate([100, 50, 100, 50, 200]);
                if (typeof confetti === 'function') {
                    confetti({
                        particleCount: 120,
                        spread: 80,
                        origin: { y: 0.5 },
                        colors: ['#10b981', '#f59e0b', '#3b82f6', '#ec4899']
                    });
                }
                trainingState = 'complete';
                updateTrainingHUD();
                updateTrainingSessionBanner();
                saveActiveSession();
            }
        }

        function toggleCoachRestTimer() {
            if ('vibrate' in navigator) navigator.vibrate(20);

            const isRunning = typeof window.isRestTimerRunning === 'function'
                ? window.isRestTimerRunning()
                : (coachRestTimerInterval !== null);

            if (isRunning) {
                // If the timer is already running, tapping toggles the fullscreen rest overlay
                const overlay = document.getElementById('restOverlay');
                if (overlay) {
                    if (overlay.classList.contains('hidden')) {
                        overlay.classList.replace('hidden', 'flex');
                    } else {
                        overlay.classList.replace('flex', 'hidden');
                    }
                }
                return;
            }

            // Start rest timer using the app's built-in wall-clock timer
            const phase = coachPlan?.phases?.[coachPhaseIndex];
            const targetSecs = phase?.restSeconds || (typeof window.getDefaultRestSeconds === 'function' ? window.getDefaultRestSeconds() : 120);

            if (typeof window.startRestTimer === 'function') {
                window.startRestTimer(targetSecs, true);
            } else {
                // Fallback
                coachRestRemaining = targetSecs;
                coachRestTimerInterval = setInterval(() => {
                    coachRestRemaining--;
                    updateCoachRestTimerDisplay();
                    if (coachRestRemaining <= 0) {
                        clearInterval(coachRestTimerInterval);
                        coachRestTimerInterval = null;
                        updateCoachRestTimerDisplay();
                    }
                }, 1000);
                updateCoachRestTimerDisplay();
            }
        }

        function updateCoachRestTimerDisplay(rem, running, defaultSecs) {
            const label = document.getElementById('coachRestTimerLabel');
            const icon = document.getElementById('coachRestTimerIcon');
            const btn = document.getElementById('coachRestTimerBtn');
            if (!label) return;

            const isRunning = typeof running === 'boolean'
                ? running
                : (typeof window.isRestTimerRunning === 'function' ? window.isRestTimerRunning() : (coachRestTimerInterval !== null));

            const phase = coachPlan?.phases?.[coachPhaseIndex];
            const phaseRest = phase?.restSeconds || defaultSecs || (typeof window.getDefaultRestSeconds === 'function' ? window.getDefaultRestSeconds() : 120);

            const secs = isRunning
                ? (typeof rem === 'number' ? rem : (typeof window.getRestTimerRemaining === 'function' ? window.getRestTimerRemaining() : coachRestRemaining))
                : phaseRest;

            const m = Math.floor(Math.max(0, secs) / 60);
            const s = (Math.max(0, secs) % 60).toString().padStart(2, '0');

            if (isRunning) {
                label.innerText = `${m}:${s}`;
                if (btn) {
                    btn.classList.add('bg-emerald-600/30', 'border-emerald-500/50', 'text-emerald-400');
                    btn.classList.remove('bg-neutral-800', 'text-white');
                }
                if (icon) icon.innerText = "⏳";
            } else {
                label.innerText = `Rest ${m}:${s}`;
                if (btn) {
                    btn.classList.remove('bg-emerald-600/30', 'border-emerald-500/50', 'text-emerald-400');
                    btn.classList.add('bg-neutral-800', 'text-white');
                }
                if (icon) icon.innerText = "⏱️";
            }
        }

        // Global callback connection for chart.js rest timer
        window.onRestTimerTick = (rem, running, defaultSecs) => {
            coachRestRemaining = rem;
            updateCoachRestTimerDisplay(rem, running, defaultSecs);
        };

        function forfeitTraining() {
            if (confirm("End today's guided coach workout? You can continue free logging!")) {
                endTraining();
            }
        }

        function endTraining() {
            if ('vibrate' in navigator) navigator.vibrate(30);

            if (typeof window.cancelRestTimer === 'function') {
                window.cancelRestTimer();
            }
            if (coachRestTimerInterval) {
                clearInterval(coachRestTimerInterval);
                coachRestTimerInterval = null;
            }
            if (trainingTimerInterval) {
                clearInterval(trainingTimerInterval);
                trainingTimerInterval = null;
            }

            trainingActive = false;
            trainingState = 'climb';

            hideCoachAdaptiveBanner();
            dismissedCoachAdaptationIds.clear();

            updateTrainingHUD();
            updateTrainingSessionBanner();
            updateUI();
            saveActiveSession();
        }

        function updateTrainingHUD() {
            const hud = document.getElementById('trainingHUD');
            if (!hud) return;

            const activePanel = document.getElementById('coachHUDActive');
            const completePanel = document.getElementById('coachHUDComplete');

            if (!trainingActive) {
                hud.classList.add('hidden');
                return;
            }

            hud.classList.remove('hidden');

            if (trainingState === 'complete') {
                if (activePanel) activePanel.classList.add('hidden');
                if (completePanel) completePanel.classList.remove('hidden');
                return;
            }

            if (activePanel) activePanel.classList.remove('hidden');
            if (completePanel) completePanel.classList.add('hidden');

            if (!coachPlan || !coachPlan.phases || !coachPlan.phases[coachPhaseIndex]) {
                if (typeof Planner !== 'undefined') coachPlan = Planner.getTodayPlan();
            }
            const phase = coachPlan?.phases?.[coachPhaseIndex] || {
                title: "Warmup Pyramid",
                desc: "Build gradually.",
                targetGradeStr: "6A",
                targetTags: ["slab"]
            };

            // 1. Phase Indicator
            const ind = document.getElementById('coachPhaseIndicator');
            if (ind && coachPlan && coachPlan.phases) {
                ind.innerText = `${coachPhaseIndex + 1} of ${coachPlan.phases.length}`;
            }

            // 2. Dots
            const dotsEl = document.getElementById('coachPhaseDots');
            if (dotsEl && coachPlan && coachPlan.phases) {
                dotsEl.innerHTML = coachPlan.phases.map((_, i) => `
                    <div class="flex-1 h-1.5 rounded-full transition-all duration-300 ${
                        i < coachPhaseIndex ? 'bg-emerald-500' :
                        i === coachPhaseIndex ? 'bg-emerald-400 ring-2 ring-emerald-400/40 shadow-sm' : 'bg-neutral-800'
                    }"></div>
                `).join('');
            }

            // 3. Phase Title & Details
            const titleEl = document.getElementById('coachPhaseTitle');
            const durEl = document.getElementById('coachPhaseDuration');
            const descEl = document.getElementById('coachPhaseDesc');
            if (titleEl) titleEl.innerText = phase.title || phase.name;
            if (durEl) durEl.innerText = phase.durationMinutes ? `${phase.durationMinutes}m` : '';
            if (descEl) descEl.innerText = phase.desc || '';

            // 4. Target Grade
            const targetBtn = document.getElementById('coachTargetGradeBtn');
            const targetGrade = document.getElementById('coachTargetGrade');
            if (phase.targetGradeStr) {
                if (targetBtn) targetBtn.classList.remove('hidden');
                if (targetGrade) targetGrade.innerText = phase.targetGradeStr;
            } else {
                if (targetBtn) targetBtn.classList.add('hidden');
            }

            // 5. Focus Tags
            const focusTags = document.getElementById('coachFocusTags');
            if (focusTags) {
                if (phase.targetTags && phase.targetTags.length > 0) {
                    focusTags.innerHTML = phase.targetTags.map(t => `
                        <button onclick="toggleTag('${t}')" class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md border transition-all ${
                            selectedTags.includes(t)
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white'
                        }">${t}</button>
                    `).join('');
                } else {
                    focusTags.innerHTML = `<span class="text-[9px] text-neutral-600">All movement styles</span>`;
                }
            }

            // 6. Next Phase Button Label
            const nextLabel = document.getElementById('coachNextPhaseBtnLabel');
            if (nextLabel && coachPlan && coachPlan.phases) {
                if (coachPhaseIndex >= coachPlan.phases.length - 1) {
                    nextLabel.innerText = "Finish Workout";
                } else {
                    nextLabel.innerText = "Next Phase";
                }
            }
        }

        function updateTrainingSessionBanner() {
            const banner = document.getElementById('trainingSessionBanner');
            const card = document.getElementById('trainingLaunchCard');
            if (!banner || !card) return;

            if (trainingActive) {
                banner.classList.remove('hidden');
                card.classList.add('hidden');

                const phase = coachPlan?.phases?.[coachPhaseIndex];
                const phaseNameEl = document.getElementById('trainingBannerPhaseName');
                const gradeBanner = document.getElementById('trainingBannerGrade');

                if (phaseNameEl) phaseNameEl.innerText = phase ? (phase.title || phase.name) : 'Guided Phase';
                if (gradeBanner) gradeBanner.innerText = phase?.targetGradeStr || fontGrades[currentGradeIndex];
            } else {
                banner.classList.add('hidden');
                card.classList.remove('hidden');
            }
        }

        function restoreTrainingUI() {
            updateTrainingHUD();
            updateTrainingSessionBanner();
        }

        // Backward compatibility mappings
        function openTrainingConfig() { startCoachedSession(); }
        function closeTrainingConfig() {}
        function adjTrainingStartGrade() {}
        function setTrainingFocus() {}
        function startTrainingMode() { startCoachedSession(); }
        function startTrainingClimbTimer() {}
        function handleTrainingTimeout() {}
        function handleTrainingRungComplete() { advanceCoachedPhase(); }

        // Expose functions globally to be called from index.html onclick handlers
        window.startCoachedSession = startCoachedSession;
        window.advanceCoachedPhase = advanceCoachedPhase;
        window.applyCoachTargetGrade = applyCoachTargetGrade;
        window.toggleCoachRestTimer = toggleCoachRestTimer;
        window.forfeitTraining = forfeitTraining;
        window.endTraining = endTraining;
        window.openTrainingConfig = startCoachedSession;
        window.startTrainingMode = startCoachedSession;
        window.startTrainingClimbTimer = startTrainingClimbTimer;
        window.restoreTrainingUI = restoreTrainingUI;

        function endSession() {
            const hasCompletedWorkouts = sessionWorkouts && sessionWorkouts.some(w => (w.exercises || []).some(e => (e.completedSets || 0) > 0));
            if (sessionClimbs.length === 0 && !hasCompletedWorkouts) {
                if (!confirm("You haven't logged any climbs or workouts. End session with 0 points?")) {
                    return;
                }
            }

            if (trainingActive) {
                if (coachRestTimerInterval) {
                    clearInterval(coachRestTimerInterval);
                    coachRestTimerInterval = null;
                }
                if (trainingTimerInterval) clearInterval(trainingTimerInterval);
                trainingActive = false;
                trainingState = 'climb';
                coachPhaseIndex = 0;
                const hud = document.getElementById('trainingHUD');
                if (hud) hud.classList.add('hidden');
                const banner = document.getElementById('trainingSessionBanner');
                if (banner) banner.classList.add('hidden');
                const card = document.getElementById('trainingLaunchCard');
                if (card) card.classList.remove('hidden');
            }

            const durationSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);
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
                DOM.sessionTimerStr.classList.add('hidden');
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
            const pageEl = document.getElementById(`page-${tabId}`);
            if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth', inline: 'start' });
            if (tabId === 'planner' && typeof renderPlannerUI === 'function') {
                renderPlannerUI();
            }
            if (push) {
                history.pushState({ tab: tabId }, '', '#' + tabId);
                if ('vibrate' in navigator) navigator.vibrate(5);
            }
        }

        const tabObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const tabId = entry.target.id.replace('page-', '');
                    
                    ['log', 'session', 'planner', 'history', 'leaderboard'].forEach(id => {
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
                switchTab('log', false);
                if (!state) history.replaceState({ tab: 'log' }, '', '#log');
            }
        });

        // Initialize first state
        if (!history.state) {
            history.replaceState({ tab: 'log' }, '', '#log');
        } else if (history.state.tab) {
            switchTab(history.state.tab, false);
        }

        setTimeout(() => {
            ['log', 'session', 'planner', 'history', 'leaderboard'].forEach(id => {
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

