        // -- LOGIC: CHART & ANALYTICS --
        let ctx = null;
        function getChartContext() {
            if (!ctx) {
                const canvas = document.getElementById('progressionChart');
                if (canvas) ctx = canvas.getContext('2d');
            }
            if (typeof Chart !== 'undefined' && Chart.defaults) {
                Chart.defaults.color = '#737373';
                Chart.defaults.font.family = 'system-ui, -apple-system, sans-serif';
            }
            return ctx;
        }

        let chart = null;
        let currentChartType = 'line';
        let activeTrendMetric = 'score';
        let activeTrendSecondary = 'avg_grade';

        function getMetricConfig(metric, filteredHistory) {
            const configs = {
                score: {
                    labelText: 'Score',
                    color: '#10b981',
                    bgColor: 'rgba(16, 185, 129, 0.07)',
                    yAxisID: 'y',
                    data: filteredHistory.map(s => s.score || 0)
                },
                sends: {
                    labelText: 'Sends',
                    color: '#10b981',
                    bgColor: 'rgba(16, 185, 129, 0.07)',
                    yAxisID: 'y',
                    data: filteredHistory.map(s => (s.climbs || []).filter(c => c.statusText === 'Top' || c.statusText === 'Flash').length)
                },
                avg_grade: {
                    labelText: 'Avg Grade',
                    color: '#a855f7',
                    bgColor: 'rgba(168, 85, 247, 0.07)',
                    yAxisID: 'y1',
                    data: filteredHistory.map(s => {
                        let sSum = 0, sCount = 0;
                        (s.climbs || []).forEach(c => {
                            if (c.statusText === 'Top' || c.statusText === 'Flash') {
                                sSum += fontGrades.indexOf(c.gradeStr);
                                sCount++;
                            }
                        });
                        return sCount > 0 ? (sSum / sCount) : 0;
                    })
                },
                flash_pct: {
                    labelText: 'Flash %',
                    color: '#f59e0b',
                    bgColor: 'rgba(245, 158, 11, 0.07)',
                    yAxisID: 'y',
                    data: filteredHistory.map(s => {
                        const total = (s.climbs || []).length;
                        const flashes = (s.climbs || []).filter(c => c.statusText === 'Flash').length;
                        return total > 0 ? Math.round((flashes / total) * 100) : 0;
                    })
                },
                projects: {
                    labelText: 'Proj Tries',
                    color: '#f97316',
                    bgColor: 'rgba(249, 115, 22, 0.07)',
                    yAxisID: 'y',
                    data: filteredHistory.map(s => (s.climbs || []).filter(c => c.statusText === 'Project').reduce((sum, c) => sum + (c.tries || 0), 0))
                },
                duration: {
                    labelText: 'Duration',
                    color: '#3b82f6',
                    bgColor: 'rgba(59, 130, 246, 0.07)',
                    yAxisID: 'y',
                    data: filteredHistory.map(s => Math.round((s.duration || 0) / 60))
                }
            };
            return configs[metric] || null;
        }

        function toggleChartDropdown(type) {
            if (window.event) window.event.stopPropagation();
            if (type === 'secondary') {
                document.getElementById('secondarySelDropdown').classList.toggle('hidden');
            }
        }

        function selectChartMetric(type, metric) {
            if (type === 'secondary') {
                activeTrendSecondary = metric;
                if (activeTrendSecondary === activeTrendMetric && activeTrendSecondary !== 'none') {
                    activeTrendMetric = activeTrendSecondary === 'avg_grade' ? 'score' : 'avg_grade';
                }
            }
            
            const drop = document.getElementById('secondarySelDropdown');
            if (drop) drop.classList.add('hidden');
            
            updateSelectorButtonsUI();
            updateAnalytics();
        }

        function updateSelectorButtonsUI() {

            const sBtn = document.getElementById('secondarySelBtn');
            const sText = document.getElementById('secondarySelText');
            if (sBtn && sText) {
                const names = {
                    score: 'Score', sends: 'Sends', avg_grade: 'Avg Grade',
                    flash_pct: 'Flash %', projects: 'Proj Tries', duration: 'Duration',
                    none: 'None'
                };
                sText.innerText = names[activeTrendSecondary] || 'Avg Grade';
                
                sBtn.classList.remove(
                    'border-emerald-500/40', 'text-emerald-400/80',
                    'border-purple-500/40', 'text-purple-400/80',
                    'border-amber-500/40', 'text-amber-400/80',
                    'border-orange-500/40', 'text-orange-400/80',
                    'border-blue-500/40', 'text-blue-400/80',
                    'border-neutral-800', 'text-neutral-500', 'text-neutral-400'
                );
                
                if (activeTrendSecondary === 'none') {
                    sBtn.classList.add('border-neutral-800', 'text-neutral-500');
                } else {
                    const classes = {
                        score: ['border-emerald-500/40', 'text-emerald-400/80'],
                        sends: ['border-emerald-500/40', 'text-emerald-400/80'],
                        avg_grade: ['border-purple-500/40', 'text-purple-400/80'],
                        flash_pct: ['border-amber-500/40', 'text-amber-400/80'],
                        projects: ['border-orange-500/40', 'text-orange-400/80'],
                        duration: ['border-blue-500/40', 'text-blue-400/80']
                    };
                    const activeClasses = classes[activeTrendSecondary] || ['border-neutral-800', 'text-neutral-400'];
                    activeClasses.forEach(cls => sBtn.classList.add(cls));
                }
            }
        }

        // Global dismiss for chart selectors
        document.addEventListener('click', (e) => {
            const sWrap = document.getElementById('secondarySelectorWrapper');
            if (sWrap && !sWrap.contains(e.target)) {
                const drop = document.getElementById('secondarySelDropdown');
                if (drop) drop.classList.add('hidden');
            }
        });

        function setChartType(type) {
            currentChartType = type;
            const a = "text-[9px] font-black px-2.5 py-1 rounded transition-colors bg-emerald-500 text-black uppercase tracking-widest";
            const i = "text-[9px] font-black px-2.5 py-1 rounded transition-colors text-neutral-500 hover:text-white uppercase tracking-widest";
            document.getElementById('chartBtnLine').className = type === 'line' ? a : i;
            document.getElementById('chartBtnRadar').className = type === 'radar' ? a : i;
            document.getElementById('chartBtnBar').className = type === 'bar' ? a : i;
            
            const selectorsEl = document.getElementById('chartSelectorsContainer');
            if (selectorsEl) {
                if (type === 'line') {
                    selectorsEl.classList.remove('hidden');
                    updateSelectorButtonsUI();
                } else {
                    selectorsEl.classList.add('hidden');
                }
            }
            
            updateAnalytics();
        }

        function setActiveTrendMetric(metric) {
            if (currentChartType !== 'line') return;
            activeTrendMetric = metric;
            updateAnalytics();
        }

        function updateCardHighlights() {
            const metric = activeTrendMetric;
            const styles = {
                score: { border: 'border-emerald-500/60', shadow: 'shadow-[0_0_12px_rgba(16,185,129,0.15)]' },
                sends: { border: 'border-emerald-500/60', shadow: 'shadow-[0_0_12px_rgba(16,185,129,0.15)]' },
                flash_pct: { border: 'border-amber-500/60', shadow: 'shadow-[0_0_12px_rgba(245,158,11,0.15)]' },
                projects: { border: 'border-orange-500/60', shadow: 'shadow-[0_0_12px_rgba(249,115,22,0.15)]' },
                duration: { border: 'border-blue-500/60', shadow: 'shadow-[0_0_12px_rgba(59,130,246,0.15)]' },
                avg_grade: { border: 'border-purple-500/60', shadow: 'shadow-[0_0_12px_rgba(168,85,247,0.15)]' }
            };

            const cards = document.querySelectorAll('[data-metric]');
            const isLineChart = currentChartType === 'line';

            cards.forEach(card => {
                const cardMetric = card.getAttribute('data-metric');
                Object.values(styles).forEach(s => {
                    card.classList.remove(s.border);
                    s.shadow.split(' ').forEach(cls => card.classList.remove(cls));
                });
                card.classList.add('border-neutral-800');

                if (isLineChart) {
                    card.classList.add('cursor-pointer', 'hover:bg-neutral-800/80', 'active:scale-[0.98]');
                    if (cardMetric === metric) {
                        card.classList.remove('border-neutral-800');
                        card.classList.add(styles[metric].border);
                        styles[metric].shadow.split(' ').forEach(cls => card.classList.add(cls));
                    }
                } else {
                    card.classList.remove('cursor-pointer', 'hover:bg-neutral-800/80', 'active:scale-[0.98]');
                }
            });
        }

        var historyViewMode = window.historyViewMode || 'ALL';

        function setHistoryMode(mode) {
            window.historyViewMode = mode;
            historyViewMode = mode;
            const a = 'text-[10px] font-black px-3 py-1.5 rounded-lg transition-colors z-10 bg-emerald-500 text-black';
            const i = 'text-[10px] font-black px-3 py-1.5 rounded-lg transition-colors z-10 text-neutral-500 hover:text-white';
            document.getElementById('historyBtnAll').className = mode === 'ALL' ? a : i;
            document.getElementById('historyBtnWeek').className = mode === 'WEEK' ? a : i;
            document.getElementById('historyBtnMonth').className = mode === 'MONTH' ? a : i;
            updateAnalytics();
            renderHistoryList();
        }

        function getStartOfWeek() {
            const now = new Date();
            const day = now.getDay(); // 0=Sun, 1=Mon...
            const diff = (day === 0 ? -6 : 1) - day; // Monday-based
            const monday = new Date(now);
            monday.setDate(now.getDate() + diff);
            monday.setHours(0, 0, 0, 0);
            return monday.getTime();
        }

        function updateAnalytics() {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            const startOfWeek = getStartOfWeek();
            
            const filteredHistory = historyViewMode === 'ALL'
                ? boulderHistory
                : historyViewMode === 'WEEK'
                    ? boulderHistory.filter(s => (s.timestamp || 0) >= startOfWeek)
                    : boulderHistory.filter(s => (s.timestamp || 0) >= startOfMonth);

            const stats = getHistoryStats(filteredHistory);

            const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
            const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };

            setTxt('statTotalPoints', stats.totalPoints);
            setTxt('statTotalSends', stats.totalSends);
            setTxt('historyPeriodSummary', `${filteredHistory.length} sessions completed`);
            setTxt('statProjectTries', stats.totalProjTries);
            setTxt('statFlashRate', stats.flashRate + '%');
            setTxt('statAvgTime', stats.avgDur || '-');
            
            const gIdx = Math.floor(stats.avgGradeScore);
            const gRem = (stats.avgGradeScore - gIdx).toFixed(1);
            const preciseG = stats.totalSuccessfulClimbs > 0 ? `${fontGrades[gIdx]}<span class="text-[10px] text-neutral-500 ml-1">+${gRem}</span>` : '-';
            setHtml('statAvgGrade', preciseG);

            // Personal Records (filtered by current view mode)
            const pr = getPersonalRecords(filteredHistory);
            setTxt('prBestScore', pr.bestScore || '-');
            setTxt('prHighestGrade', pr.highestGrade);
            setTxt('prMostSends', pr.mostSends);
            setTxt('prLongestSession', pr.longestSession);
            setTxt('prHighestLadder', pr.highestLadder);

            // Streak (always computed from all history)
            const streak = getStreakData();
            setTxt('statCurrentStreak', streak.current);
            setTxt('statLongestStreak', streak.longest);

            // Calendar Heatmap
            if (typeof renderCalendarHeatmap === 'function') renderCalendarHeatmap();

            // Period comparison deltas
            if (typeof updateComparisonDeltas === 'function') updateComparisonDeltas();

            // Chart data rendering
            if (chart && chart.config.type !== currentChartType) {
                chart.destroy();
                chart = null;
            }

            if (typeof Chart === 'undefined') return;
            const ctx = getChartContext();
            if (!ctx) return;
            
            if (currentChartType === 'line') {
                const labels = filteredHistory.map(() => '');
                
                const primaryConfig = getMetricConfig(activeTrendMetric, filteredHistory);
                const secondaryConfig = activeTrendSecondary !== 'none' ? getMetricConfig(activeTrendSecondary, filteredHistory) : null;

                const datasets = [
                    { 
                        label: primaryConfig.labelText, 
                        data: primaryConfig.data, 
                        borderColor: primaryConfig.color, 
                        backgroundColor: primaryConfig.bgColor, 
                        borderWidth: 2, 
                        fill: true, 
                        tension: 0.4, 
                        yAxisID: 'y', 
                        pointRadius: 0, 
                        hitRadius: 0, 
                        hoverRadius: 0 
                    }
                ];

                if (secondaryConfig) {
                    const secBorderColor = secondaryConfig.color + 'bb';
                    datasets.push({ 
                        label: secondaryConfig.labelText, 
                        data: secondaryConfig.data, 
                        borderColor: secBorderColor, 
                        backgroundColor: 'transparent', 
                        borderDash: [4, 4], 
                        borderWidth: 1.5, 
                        tension: 0.3, 
                        yAxisID: 'y1', 
                        pointRadius: 0, 
                        hitRadius: 0, 
                        hoverRadius: 0 
                    });
                }

                updateSelectorButtonsUI();

                const hasY1 = secondaryConfig !== null;

                if (chart) {
                    chart.data.labels = labels;
                    chart.data.datasets = datasets;
                    chart.options.scales.y.beginAtZero = activeTrendMetric !== 'avg_grade';
                    chart.options.scales.y1.display = hasY1;
                    chart.options.scales.y1.beginAtZero = activeTrendSecondary !== 'avg_grade';
                    chart.update('none');
                } else {
                    chart = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: datasets
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false },
                                tooltip: { enabled: false },
                            },
                            interaction: { mode: 'index', intersect: false },
                            events: ['mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchend', 'touchmove'],
                            scales: {
                                y: { 
                                    beginAtZero: activeTrendMetric !== 'avg_grade', 
                                    position: 'left', 
                                    grid: { color: '#1a1a1a' }, 
                                    border: { display: false }, 
                                    ticks: { 
                                        font: { size: 9 },
                                        callback: function (val) {
                                            if (activeTrendMetric === 'avg_grade') {
                                                return fontGrades[Math.round(val)] || '';
                                            }
                                            return val;
                                        }
                                    } 
                                },
                                y1: { 
                                    display: hasY1,
                                    position: 'right', 
                                    grid: { display: false }, 
                                    border: { display: false }, 
                                    beginAtZero: activeTrendSecondary !== 'avg_grade',
                                    ticks: { 
                                        font: { size: 9 }, 
                                        callback: function (val) {
                                            if (activeTrendSecondary === 'avg_grade') {
                                                return fontGrades[Math.round(val)] || '';
                                            }
                                            return val;
                                        } 
                                    } 
                                },
                                x: { grid: { display: false }, border: { display: false }, ticks: { display: false } }
                            }
                        }
                    });
                }
            } else if (currentChartType === 'radar') {
                const tagCounts = { 'crimp': 0, 'sloper': 0, 'pinch': 0, 'slab': 0, 'dyno': 0, 'board': 0, 'technical': 0, 'powerful': 0 };
                let totalClimbs = 0;
                filteredHistory.forEach(s => {
                    (s.climbs || []).forEach(c => {
                        totalClimbs++;
                        if (c.tags) c.tags.forEach(t => { if (tagCounts[t] !== undefined) tagCounts[t]++; });
                    });
                });
                const maxTagCount = Math.max(...Object.values(tagCounts), 1);
                const tagPct = Object.values(tagCounts).map(v => Math.round((v / maxTagCount) * 100));
                
                if (chart) {
                    chart.data.labels = Object.keys(tagCounts).map(k => k.toUpperCase());
                    chart.data.datasets[0].data = tagPct;
                    chart.update('none');
                } else {
                    chart = new Chart(ctx, {
                        type: 'radar',
                        data: {
                            labels: Object.keys(tagCounts).map(k => k.toUpperCase()),
                            datasets: [{
                                label: 'Style %',
                                data: tagPct,
                                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                borderColor: '#10b981',
                                pointBackgroundColor: '#10b981',
                                pointRadius: 4,
                                pointHoverRadius: 6,
                                borderWidth: 1.5
                            }]
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    enabled: true,
                                    callbacks: { label: ctx => ctx.parsed.r + '%' }
                                }
                            },
                            scales: {
                                r: {
                                    beginAtZero: true,
                                    max: 100,
                                    ticks: { display: false, stepSize: 25 },
                                    grid: { color: '#262626' },
                                    angleLines: { color: '#262626' },
                                    pointLabels: { font: { size: 9, weight: 'bold' }, color: '#737373' }
                                }
                            }
                        }
                    });
                }
            } else if (currentChartType === 'bar') {
                const gradeCounts = {};
                filteredHistory.forEach(s => {
                    (s.climbs || []).forEach(c => {
                        if ((c.statusText === 'Top' || c.statusText === 'Flash') && c.gradeStr && c.gradeStr !== '🍺') {
                            gradeCounts[c.gradeStr] = (gradeCounts[c.gradeStr] || 0) + 1;
                        }
                    });
                });
                const sortedKeys = Object.keys(gradeCounts).sort((a,b) => fontGrades.indexOf(a) - fontGrades.indexOf(b));
                const dataValues = sortedKeys.map(k => gradeCounts[k]);
                
                if (chart) {
                    chart.data.labels = sortedKeys;
                    chart.data.datasets[0].data = dataValues;
                    chart.update('none');
                } else {
                    chart = new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: sortedKeys,
                            datasets: [{
                                label: 'Tops',
                                data: dataValues,
                                backgroundColor: '#3b82f6',
                                borderRadius: 4
                            }]
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { display: false }, tooltip: { enabled: false } },
                            scales: {
                                y: { beginAtZero: true, grid: { color: '#1a1a1a' }, border: { display: false }, ticks: { font: { size: 9 } } },
                                x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 9 }, color: '#737373' } }
                            }
                        }
                    });
                }
            }
            updateCardHighlights();
        }

        // -- HISTORY SEGMENTED NAVIGATION & FILTERING --
        let historySubTab = localStorage.getItem('sendlog_history_subtab') || 'sessions';
        let historyTypeFilter = 'all'; // 'all' | 'climbs' | 'workouts'

        function switchHistorySubTab(tab) {
            historySubTab = tab;
            try {
                localStorage.setItem('sendlog_history_subtab', tab);
            } catch (e) { }

            const sessBtn = document.getElementById('historySubTabSessions');
            const analBtn = document.getElementById('historySubTabAnalytics');
            const sessView = document.getElementById('historyViewSessions');
            const analView = document.getElementById('historyViewAnalytics');

            if ('vibrate' in navigator) navigator.vibrate(10);

            if (tab === 'sessions') {
                if (sessView) sessView.classList.remove('hidden');
                if (analView) analView.classList.add('hidden');
                if (sessBtn) {
                    sessBtn.className = "flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 bg-emerald-500 text-black shadow-md";
                }
                if (analBtn) {
                    analBtn.className = "flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 text-neutral-400 hover:text-white";
                }
                renderHistoryList();
            } else {
                if (sessView) sessView.classList.add('hidden');
                if (analView) analView.classList.remove('hidden');
                if (analBtn) {
                    analBtn.className = "flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 bg-emerald-500 text-black shadow-md";
                }
                if (sessBtn) {
                    sessBtn.className = "flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 text-neutral-400 hover:text-white";
                }
                updateAnalytics();
                if (typeof renderCalendarHeatmap === 'function') renderCalendarHeatmap();
                if (chart) {
                    requestAnimationFrame(() => {
                        chart.resize();
                    });
                }
            }
        }

        function filterHistoryType(type) {
            historyTypeFilter = (type || 'all').toLowerCase();
            if ('vibrate' in navigator) navigator.vibrate(10);

            ['all', 'climbs', 'workouts'].forEach(t => {
                const btn1 = document.getElementById(`hfType${t.charAt(0).toUpperCase() + t.slice(1)}`);
                const btn2 = document.getElementById(`filterBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
                [btn1, btn2].forEach(btn => {
                    if (btn) {
                        if (t === historyTypeFilter) {
                            btn.className = "px-3 py-1 rounded-lg text-xs font-black uppercase transition-all bg-emerald-500 text-black shadow-sm";
                        } else {
                            btn.className = "px-3 py-1 rounded-lg text-xs font-black uppercase transition-all text-neutral-400 hover:text-white";
                        }
                    }
                });
            });

            renderHistoryList();
        }

        window.switchHistorySubTab = switchHistorySubTab;
        window.filterHistoryType = filterHistoryType;

        function renderHistoryList() {
            const listEl = document.getElementById('historyList');
            if (!listEl) return;
            let filteredHistory = [...boulderHistory];

            // Filter by Period
            const now = new Date();
            const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1))).setHours(0, 0, 0, 0);
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

            if (historyViewMode === 'WEEK') {
                filteredHistory = filteredHistory.filter(s => (s.timestamp || 0) >= startOfWeek);
            } else if (historyViewMode === 'MONTH') {
                filteredHistory = filteredHistory.filter(s => (s.timestamp || 0) >= startOfMonth);
            }

            // Compute period summary numbers
            let periodSends = 0;
            let periodDuration = 0;
            let bestGradeIdx = -1;
            let periodWorkouts = 0;

            filteredHistory.forEach(s => {
                periodDuration += (s.duration || 0);
                (s.climbs || []).forEach(c => {
                    if (c.statusText === 'Top' || c.statusText === 'Flash' || c.isTop || c.isFlash) {
                        periodSends++;
                        const gIdx = fontGrades.indexOf(c.gradeStr);
                        if (gIdx > bestGradeIdx) bestGradeIdx = gIdx;
                    }
                });
                periodWorkouts += (s.workouts || []).length;
            });

            const bestGradeStr = bestGradeIdx >= 0 ? fontGrades[bestGradeIdx] : '-';
            const heroSummary = document.getElementById('historyPeriodSummary');
            const heroTitle = document.getElementById('historyHeroTitle');
            const heroSubtitle = document.getElementById('historyHeroSubtitle');

            if (heroSummary) heroSummary.innerText = `${filteredHistory.length} session${filteredHistory.length !== 1 ? 's' : ''} completed`;
            if (heroTitle) {
                const parts = [`${filteredHistory.length} Sessions`, `${periodSends} Sends`];
                if (periodWorkouts > 0) parts.push(`${periodWorkouts} Workouts`);
                heroTitle.innerText = parts.join(' · ');
            }
            if (heroSubtitle) {
                const durStr = formatDuration(periodDuration) || '0m';
                heroSubtitle.innerText = `Max Send: ${bestGradeStr} · Total Active: ${durStr}`;
            }

            // Apply type filter
            if (historyTypeFilter === 'climbs') {
                filteredHistory = filteredHistory.filter(s => (s.climbs || []).length > 0);
            } else if (historyTypeFilter === 'workouts') {
                filteredHistory = filteredHistory.filter(s => (s.workouts || []).length > 0);
            }

            if (filteredHistory.length === 0) {
                listEl.innerHTML = `
                <div class="flex flex-col items-center justify-center py-16 opacity-40">
                    <div class="text-5xl mb-3">🏆</div>
                    <p class="text-sm font-black uppercase tracking-widest text-white">No sessions found</p>
                    <p class="text-[10px] text-neutral-400 mt-1">Start logging climbs or workouts to see them here</p>
                </div>`;
                return;
            }

            listEl.innerHTML = filteredHistory.slice().reverse().map((s) => {
                const actualIndex = boulderHistory.indexOf(s);
                const { sends, flashes, avgGrade } = getSessionStats(s);

                // Robust Date Logic using timestamp
                const sDate = s.timestamp ? new Date(s.timestamp) : new Date();
                const checkToday = new Date();
                const checkYesterday = new Date(); checkYesterday.setDate(checkYesterday.getDate() - 1);
                
                const isToday = sDate.toDateString() === checkToday.toDateString();
                const isYesterday = sDate.toDateString() === checkYesterday.toDateString();
                
                let relLabel = "";
                if (isToday) relLabel = "TODAY";
                else if (isYesterday) relLabel = "YEST";
                else relLabel = sDate.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();

                const dayNum = sDate.getDate();

                const climbCount = s.climbs ? s.climbs.length : 0;
                const workoutList = s.workouts || [];
                const workoutCount = workoutList.length;
                const isWorkoutOnly = climbCount === 0 && workoutCount > 0;
                const isHybrid = climbCount > 0 && workoutCount > 0;

                const primaryGrade = sends > 0 ? avgGrade : (climbCount > 0 ? (s.climbs[0].gradeStr || '-') : (workoutCount > 0 ? (workoutList[0].shortName || workoutList[0].name) : '-'));

                let peakLadder = 0;
                if (s.climbs) {
                    s.climbs.forEach(c => {
                        const m = (c.tags || []).find(t => t.startsWith('ladder-'));
                        if (m) {
                            const r = parseInt(m.split('-')[1]);
                            if (r > peakLadder) peakLadder = r;
                        }
                    });
                }
                const peakLadderBadge = peakLadder > 0 
                    ? `<span class="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">🪜 Rung ${peakLadder}</span>` 
                    : '';

                const workoutBadges = workoutList.map(w => `
                    <span class="text-[9px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">${w.icon || '💪'} ${w.badge || w.category || 'Workout'}</span>
                `).join(' ');

                const gradeColors = ['#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444'];
                let miniBarHtml = '';
                if (climbCount > 0) {
                    const gradeSegments = {};
                    s.climbs.forEach(c => {
                        if (c.gradeStr && c.gradeStr !== '🍺') {
                            gradeSegments[c.gradeStr] = (gradeSegments[c.gradeStr] || 0) + 1;
                        }
                    });
                    const sortedGrades = Object.keys(gradeSegments).sort((a,b) => fontGrades.indexOf(a) - fontGrades.indexOf(b));
                    miniBarHtml = sortedGrades.map((g, i) => {
                        const pct = Math.round((gradeSegments[g] / climbCount) * 100);
                        const col = gradeColors[i % gradeColors.length];
                        return `<div style="width: ${pct}%; background-color: ${col};" class="h-full" title="${g}: ${gradeSegments[g]}"></div>`;
                    }).join('');
                }

                return `
                <li onclick="openSessionDetail(${actualIndex})" 
                    class="bg-neutral-900 border ${isWorkoutOnly ? 'border-cyan-500/25' : isHybrid ? 'border-emerald-500/25' : 'border-neutral-800'} rounded-[2rem] p-4 flex flex-col justify-between active:scale-[0.98] transition cursor-pointer shadow-sm hover:border-neutral-700">
                    <div class="flex items-center justify-between">
                        <!-- Date & Key Info -->
                        <div class="flex items-center gap-3">
                            <div class="flex flex-col items-center justify-center w-11 h-11 bg-neutral-950 rounded-2xl border border-neutral-800 shrink-0">
                                <span class="text-[9px] font-black ${isToday ? 'text-emerald-400' : isYesterday ? 'text-amber-400' : 'text-neutral-500'} tracking-wider">${relLabel}</span>
                                <span class="text-sm font-black text-white leading-none mt-0.5">${dayNum}</span>
                            </div>
                            <div>
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <h4 class="text-sm font-black text-white truncate">${primaryGrade}</h4>
                                    ${isWorkoutOnly ? '<span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 uppercase">Workout</span>' : ''}
                                    ${isHybrid ? '<span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">Hybrid</span>' : ''}
                                </div>
                                <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                                    ${climbCount > 0 ? `
                                        <span class="text-[10px] font-bold text-neutral-400">${climbCount} Climb${climbCount > 1 ? 's' : ''}</span>
                                        ${sends > 0 ? `<span class="text-neutral-700 text-[8px]">●</span><span class="text-[10px] font-bold text-emerald-400">✓ ${sends}</span>` : ''}
                                        ${flashes > 0 ? `<span class="text-neutral-700 text-[8px]">●</span><span class="text-[10px] font-bold text-amber-400">⚡ ${flashes}</span>` : ''}
                                    ` : `
                                        <span class="text-[10px] font-bold text-cyan-400">💪 ${workoutCount} Workout${workoutCount > 1 ? 's' : ''} Completed</span>
                                    `}
                                    ${peakLadderBadge ? ` <span class="text-neutral-700 text-[8px]">●</span> ${peakLadderBadge}` : ''}
                                    ${workoutBadges}
                                </div>
                            </div>
                        </div>
                        <!-- Score & Duration -->
                        <div class="text-right shrink-0 ml-2">
                            <div class="text-base font-black text-white leading-none">${(s.score || 0).toLocaleString()}<span class="text-[8px] text-neutral-500 ml-1 uppercase">pts</span></div>
                            <div class="text-[10px] font-bold text-neutral-400 italic mt-1">${formatDuration(s.duration) || '--'}</div>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-3 mt-4">
                        <div class="flex-1 h-1.5 bg-neutral-950 rounded-full overflow-hidden flex shadow-inner border border-neutral-800/40">
                            ${miniBarHtml || (workoutCount > 0 ? '<div class="w-full h-full bg-cyan-500/40"></div>' : '<div class="w-full h-full bg-neutral-950 opacity-20"></div>')}
                        </div>
                        <button onclick="event.stopPropagation(); deleteSession(${actualIndex})" class="p-1 text-neutral-500/40 hover:text-red-500 active:scale-90 transition-all">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                </li>
                `;
            }).join('');
        }

        // -- SESSION DETAIL MODAL --
        let currentSessionDetailIndex = null;
        function openSessionDetail(historyIndex, push = true) {
            let s;
            if (typeof historyIndex === 'object' && historyIndex !== null) {
                s = historyIndex;
                historyIndex = boulderHistory.indexOf(s);
            } else {
                s = boulderHistory[historyIndex];
            }
            if (!s) return;
            currentSessionDetailIndex = historyIndex;
            if ('vibrate' in navigator) navigator.vibrate(10);
            
            if (push && historyIndex >= 0) history.pushState({ overlay: 'sessionDetail', index: historyIndex }, '', '#session-' + historyIndex);

            const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

            // Populate header
            setTxt('sdDate', s.date || '');
            const durationTxt = s.duration ? ` (${formatDuration(s.duration)})` : '';
            setTxt('sdScore', (s.score || 0).toLocaleString() + ' pts' + durationTxt);

            const climbs = s.climbs || [];
            const stats = getSessionStats(s);
            const projects = climbs.length - stats.sends;

            setTxt('sdClimbCount', climbs.length);
            setTxt('sdSends', stats.sends);
            setTxt('sdFlashes', stats.flashes);
            setTxt('sdProjects', projects);

            // Off-wall Workouts Section
            const workouts = s.workouts || [];
            const workoutsCont = document.getElementById('sdWorkoutsContainer');
            const workoutList = document.getElementById('sdWorkoutList');
            if (workoutsCont && workoutList) {
                if (workouts.length > 0) {
                    workoutsCont.classList.remove('hidden');
                    workoutList.innerHTML = workouts.map(w => `
                        <li class="p-3 bg-cyan-500/10 border border-cyan-500/25 rounded-2xl space-y-2">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <span class="text-lg">${w.icon || '💪'}</span>
                                    <div>
                                        <h5 class="text-xs font-black text-white">${w.name}</h5>
                                        <p class="text-[9px] text-neutral-400">${w.durationMinutes ? `${w.durationMinutes}m · ` : ''}${w.exercises ? `${w.exercises.length} Exercises` : ''}</p>
                                    </div>
                                </div>
                                <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">${w.badge || w.category || 'Workout'}</span>
                            </div>
                            ${w.exercises && w.exercises.length > 0 ? `
                                <div class="space-y-1 pt-1 border-t border-cyan-500/15">
                                    ${w.exercises.map(ex => `
                                        <div class="flex items-center justify-between text-[10px] bg-neutral-900/70 px-2.5 py-1.5 rounded-lg border border-neutral-800">
                                            <span class="text-neutral-200 font-bold">${ex.name}</span>
                                            <span class="text-emerald-400 font-black flex items-center gap-1">✓ ${ex.completedSets !== undefined ? ex.completedSets : (ex.setsCompleted !== undefined ? ex.setsCompleted : (ex.sets || 3))} Sets</span>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </li>
                    `).join('');
                } else {
                    workoutsCont.classList.add('hidden');
                }
            }

            // Grade distribution bar
            const gradeBar = document.getElementById('sdGradeBar');
            const gradeLabels = document.getElementById('sdGradeLabels');
            const gradeCounts = {};
            climbs.forEach(c => {
                if (c.gradeStr && c.gradeStr !== '🍺') {
                    gradeCounts[c.gradeStr] = (gradeCounts[c.gradeStr] || 0) + 1;
                }
            });
            const gradeKeys = Object.keys(gradeCounts).sort((a, b) => fontGrades.indexOf(a) - fontGrades.indexOf(b));
            const total = gradeKeys.reduce((s, k) => s + gradeCounts[k], 0);
            const barColors = ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#ef4444', '#06b6d4', '#84cc16'];

            const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };

            if (gradeKeys.length > 0) {
                const barHtml = gradeKeys.map((g, i) => {
                    const pct = (gradeCounts[g] / Math.max(1, total)) * 100;
                    const col = barColors[i % barColors.length];
                    return `<div style="width:${pct}%;background:${col};opacity:0.85" title="${g}: ${gradeCounts[g]}"></div>`;
                }).join('');
                setHtml('sdGradeBar', barHtml);

                const labelsHtml = gradeKeys.map((g, i) => {
                    const pct = (gradeCounts[g] / Math.max(1, total)) * 100;
                    const col = barColors[i % barColors.length];
                    return `<div style="width:${pct}%;overflow:hidden;color:${col}" class="text-[8px] font-black truncate">
                        <span style="color:${col}">${g}×${gradeCounts[g]}</span>
                    </div>`;
                }).join('');
                setHtml('sdGradeLabels', labelsHtml);
            } else {
                setHtml('sdGradeBar', '<div class="w-full h-full bg-neutral-800 rounded-lg"></div>');
                setHtml('sdGradeLabels', '');
            }

            // Climb list
            const climbListHtml = climbs.length === 0 
                ? '<li class="text-neutral-500 text-sm text-center py-4">No climbs recorded in this session.</li>'
                : climbs.map(c => {
                    const statusColor = c.statusText === 'Flash' ? 'text-amber-400' : c.statusText === 'Top' ? 'text-blue-400' : 'text-neutral-400';
                    const bgColor = c.statusText === 'Flash' ? 'bg-amber-500/10 border-amber-500/20' : c.statusText === 'Top' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-neutral-800/30 border-neutral-700/30';
                    return `
                    <li class="flex justify-between items-center p-2.5 ${bgColor} rounded-xl border">
                        <div class="flex items-center gap-3">
                            <span class="text-lg font-black w-10 text-center leading-tight">${c.gradeStr}</span>
                            <div class="flex flex-col">
                                <span class="${statusColor} text-[11px] font-bold uppercase tracking-wider">${c.statusText}</span>
                                <span class="text-neutral-500 text-[9px]">${c.tries} Attempt${c.tries > 1 ? 's' : ''}</span>
                                ${c.tags && c.tags.length > 0 ? `<div class="flex gap-1 mt-1 flex-wrap">${c.tags.map(t => `<span class="bg-neutral-800 text-neutral-400 border border-neutral-700 text-[8px] uppercase px-1.5 py-0.5 rounded">${t}</span>`).join('')}</div>` : ''}
                            </div>
                        </div>
                        <span class="text-emerald-400 font-bold text-sm">+${c.points} pts</span>
                    </li>`;
                }).join('');
            setHtml('sdClimbList', climbListHtml);

            // Show overlay with animation
            const overlay = document.getElementById('sessionDetailOverlay');
            const sheet = document.getElementById('sessionDetailSheet');
            if (overlay) overlay.classList.replace('hidden', 'flex');
            if (sheet) {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        sheet.style.transform = 'translateY(0)';
                    });
                });
            }
        }

        function closeSessionDetail(event, pop = true) {
            if (event && event.target !== document.getElementById('sessionDetailOverlay')) return;
            const overlay = document.getElementById('sessionDetailOverlay');
            const sheet = document.getElementById('sessionDetailSheet');
            if (sheet) sheet.style.transform = 'translateY(100%)';
            if (overlay) setTimeout(() => overlay.classList.replace('flex', 'hidden'), 300);
            if (pop) history.back();
        }


        function deleteSession(index) {
            if (confirm("Are you sure you want to delete this session? This cannot be undone.")) {
                boulderHistory.splice(index, 1);
                localStorage.setItem('boulderHistory', JSON.stringify(boulderHistory));
                updateAnalytics();
                renderHistoryList();
                if (typeof triggerMilestoneBackup === 'function') triggerMilestoneBackup();
            }
        }

        // -- SESSION EDITOR LOGIC --
        let tempEditSession = null;
        let tempEditSessionIndex = null;

        function openEditSession(index, push = true) {
            tempEditSessionIndex = index;
            const s = boulderHistory[index];
            if (!s) return;
            if ('vibrate' in navigator) navigator.vibrate(10);
            
            // Deep copy session climbs so edits aren't saved immediately
            tempEditSession = {
                ...s,
                climbs: s.climbs ? s.climbs.map(c => ({ ...c })) : []
            };

            // Prefill Date & Time using local timezone
            const d = tempEditSession.timestamp ? new Date(tempEditSession.timestamp) : new Date();
            const tzOffset = d.getTimezoneOffset() * 60000;
            const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
            document.getElementById('editSessionDateTime').value = localISOTime;

            // Prefill Duration
            const durSeconds = tempEditSession.duration || 0;
            const durHours = Math.floor(durSeconds / 3600);
            const durMinutes = Math.floor((durSeconds % 3600) / 60);
            document.getElementById('editSessionHours').value = durHours;
            document.getElementById('editSessionMinutes').value = durMinutes;

            // Render climbs and score
            renderEditSessionClimbs();

            // Show edit overlay
            document.getElementById('editSessionOverlay').classList.replace('hidden', 'flex');
            if (push) history.pushState({ overlay: 'editSession', index: index }, '', '#edit-session');
        }

        function renderEditSessionClimbs() {
            const listEl = document.getElementById('editSessionClimbList');
            const scoreEl = document.getElementById('editSessionScoreDisplay');
            if (!listEl || !tempEditSession) return;

            // Calculate current total score of remaining climbs
            const currentScore = tempEditSession.climbs.reduce((sum, c) => sum + (c.points || 0), 0);
            tempEditSession.score = currentScore;
            scoreEl.innerText = `${currentScore.toLocaleString()} pts`;

            if (tempEditSession.climbs.length === 0) {
                listEl.innerHTML = '<li class="text-neutral-500 text-sm text-center py-4">No climbs left.</li>';
                return;
            }

            listEl.innerHTML = tempEditSession.climbs.map((c, idx) => {
                const statusColor = c.statusText === 'Flash' ? 'text-amber-400' : c.statusText === 'Top' ? 'text-blue-400' : 'text-neutral-400';
                const bgColor = c.statusText === 'Flash' ? 'bg-amber-500/10 border-amber-500/20' : c.statusText === 'Top' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-neutral-800/30 border-neutral-700/30';
                return `
                <li class="flex justify-between items-center p-2.5 ${bgColor} rounded-xl border border-neutral-800">
                    <div class="flex items-center gap-3">
                        <span class="text-base font-black w-8 text-center leading-tight">${c.gradeStr}</span>
                        <div class="flex flex-col">
                            <span class="${statusColor} text-[10px] font-bold uppercase tracking-wider">${c.statusText}</span>
                            <span class="text-neutral-500 text-[8px]">${c.tries} Attempt${c.tries > 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-emerald-400 font-bold text-xs">+${c.points} pts</span>
                        <button onclick="removeTempClimb(${idx})" class="text-red-500/40 hover:text-red-500 active:scale-90 transition p-1">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>
                </li>`;
            }).join('');
        }

        function removeTempClimb(idx) {
            if (tempEditSession) {
                tempEditSession.climbs.splice(idx, 1);
                renderEditSessionClimbs();
                if ('vibrate' in navigator) navigator.vibrate(10);
            }
        }

        function saveEditedSession() {
            if (!tempEditSession || tempEditSessionIndex === null) return;

            // 1. Parse Date & Time
            const dateVal = document.getElementById('editSessionDateTime').value;
            if (!dateVal) {
                alert("Please select a valid date and time.");
                return;
            }
            const newDate = new Date(dateVal);
            tempEditSession.timestamp = newDate.getTime();
            tempEditSession.date = newDate.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

            // 2. Parse Duration
            const hoursVal = parseInt(document.getElementById('editSessionHours').value) || 0;
            const minsVal = parseInt(document.getElementById('editSessionMinutes').value) || 0;
            tempEditSession.duration = (hoursVal * 3600) + (minsVal * 60);

            // 3. Save to boulderHistory
            boulderHistory[tempEditSessionIndex] = tempEditSession;
            localStorage.setItem('boulderHistory', JSON.stringify(boulderHistory));

            // 4. Update UI
            updateAnalytics();
            renderHistoryList();
            if (typeof triggerMilestoneBackup === 'function') triggerMilestoneBackup();

            // 5. Go back to return from #edit-session state to #session-idx state.
            // The popstate listener will automatically trigger openSessionDetail with the updated data
            // and close the edit overlay smoothly.
            history.back();
            
            if ('vibrate' in navigator) navigator.vibrate([10, 50, 10]);
        }

        function closeEditSession(event, pop = true) {
            document.getElementById('editSessionOverlay').classList.replace('flex', 'hidden');
            tempEditSession = null;
            tempEditSessionIndex = null;
            if (pop) history.back();
        }

        // -- LOGIC: LEADERBOARD & MODES --
        let lbMode = 'ALL';

        function setLbMode(mode) {
            lbMode = mode;
            const a = "text-[10px] font-black px-3 py-1.5 rounded-lg transition-colors z-10 bg-emerald-500 text-black";
            const i = "text-[10px] font-black px-3 py-1.5 rounded-lg transition-colors z-10 text-neutral-500 hover:text-white";
            document.getElementById('lbBtnAll').className = mode === 'ALL' ? a : i;
            document.getElementById('lbBtnWeek').className = mode === 'WEEK' ? a : i;
            document.getElementById('lbBtnMonth').className = mode === 'MONTH' ? a : i;
            loadLeaderboard();
        }

        function getTotalScore() {
            return (boulderHistory || []).reduce((sum, s) => sum + (s.score || 0), 0);
        }

        function getMonthlyScore() {
            const now = new Date();
            return boulderHistory.filter(h => {
                const hDate = h.timestamp ? new Date(h.timestamp) : new Date();
                return hDate.getFullYear() === now.getFullYear() && hDate.getMonth() === now.getMonth();
            }).reduce((sum, h) => sum + h.score, 0);
        }

        function getWeeklyScore() {
            const startOfWeek = getStartOfWeek();
            return boulderHistory.filter(h => (h.timestamp || 0) >= startOfWeek).reduce((sum, h) => sum + h.score, 0);
        }

        function getISOWeekStr() {
            const now = new Date();
            const tmp = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
            tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
            const year = tmp.getUTCFullYear();
            const week = Math.ceil((((tmp - Date.UTC(year, 0, 1)) / 86400000) + 1) / 7);
            return year + "-W" + String(week).padStart(2, '0');
        }

        function updateLeaderboardUI() {
            document.getElementById('playerNameInput').value = playerName;
            const score = lbMode === 'MONTH' ? getMonthlyScore() : lbMode === 'WEEK' ? getWeeklyScore() : getTotalScore();
            document.getElementById('syncTotalScore').innerText = score;
        }

        function savePlayerName() {
            const val = document.getElementById('playerNameInput').value.trim();
            if (val) {
                playerName = val;
                localStorage.setItem('boulderPlayerName', playerName);
                syncScoreToLeaderboard(); // auto-sync when name is saved
            }
        }

        async function syncScoreToLeaderboard() {
            if (!playerName) {
                alert("Please enter a player name first!");
                document.getElementById('playerNameInput').focus();
                return;
            }
            const btn = document.getElementById('btnSync');
            btn.innerText = "Syncing...";

            const totalScore = getTotalScore();
            const monthlyScore = getMonthlyScore();
            const weeklyScore = getWeeklyScore();

            try {
                const safeName = playerName.replace(/ /g, '-');
                const nameAll = encodeURIComponent(safeName + '_ALL');

                const now = new Date();
                const monthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0');
                const nameMonth = encodeURIComponent(safeName + '_M_' + monthStr);
                const weekStr = getISOWeekStr();
                const nameWeek = encodeURIComponent(safeName + '_W_' + weekStr);

                const glob = getHistoryStats(boulderHistory);
                const statsText = encodeURIComponent(`${glob.avgGrade}|${glob.avgSends}|${glob.flashRate}`);

                await Promise.all([
                    fetchDreamlo(`/lb/${DREAMLO_PRIVATE_KEY}/add/${nameAll}/${totalScore}/0/${statsText}?t=${Date.now()}`),
                    fetchDreamlo(`/lb/${DREAMLO_PRIVATE_KEY}/add/${nameMonth}/${monthlyScore}/0/${statsText}?t=${Date.now()}`),
                    fetchDreamlo(`/lb/${DREAMLO_PRIVATE_KEY}/add/${nameWeek}/${weeklyScore}/0/${statsText}?t=${Date.now()}`)
                ]);

                btn.innerText = "Synced!";
                btn.classList.add("text-emerald-400");
                setTimeout(() => { btn.innerText = "Sync Score"; btn.classList.remove("text-emerald-400"); }, 2000);

                loadLeaderboard();
            } catch (e) {
                alert("Failed to sync: " + e.message);
                btn.innerText = "Sync Failed";
            }
        }

        async function fetchDreamlo(path) {
            const rawUrl = `http://dreamlo.com${path}`;
            const enc = encodeURIComponent(rawUrl);

            // Resilient candidates in order of preference:
            // 1. If not on https: (i.e. file: or localhost), direct Dreamlo is fastest and has native CORS headers
            // 2. High-speed Cloudflare Worker CORS proxy
            // 3. Secondary proxy fallback
            const endpoints = [];
            if (window.location.protocol !== 'https:') {
                endpoints.push(rawUrl);
            }
            endpoints.push(`https://cors-get-proxy.sirjosh.workers.dev/?url=${enc}`);
            endpoints.push(`https://proxy.cors.sh/${rawUrl}`);
            if (window.location.protocol === 'https:') {
                endpoints.push(rawUrl);
            }

            let lastErr = null;
            for (const ep of endpoints) {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 6000);
                    const res = await fetch(ep, { signal: controller.signal });
                    clearTimeout(timer);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const text = await res.text();
                    try {
                        return JSON.parse(text);
                    } catch (e) {
                        return text;
                    }
                } catch (err) {
                    lastErr = err;
                    console.warn(`[SendLog] Leaderboard fetch failed via ${ep}:`, err.message);
                }
            }
            throw lastErr || new Error("Leaderboard service temporarily unreachable.");
        }

        async function loadLeaderboard() {
            const listEl = document.getElementById('leaderboardList');
            document.getElementById('syncTotalScore').innerText = lbMode === 'MONTH' ? getMonthlyScore() : lbMode === 'WEEK' ? getWeeklyScore() : getTotalScore();
            listEl.innerHTML = `
                <div class="flex justify-center items-center py-10">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                </div>`;

            try {
                const json = await fetchDreamlo(`/lb/${DREAMLO_PUBLIC_KEY}/json?t=${Date.now()}`);

                let data = [];
                const lb = json?.dreamlo?.leaderboard;
                if (lb && lb.entry) {
                    data = Array.isArray(lb.entry) ? lb.entry : [lb.entry];
                }

                // Identify the suffix to filter on based on the selected mode
                const now = new Date();
                const monthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0');
                const weekStr = getISOWeekStr();
                const suffix = lbMode === 'ALL' ? '_ALL' : lbMode === 'WEEK' ? '_W_' + weekStr : '_M_' + monthStr;

                // Map the data into our native format and filter implicitly
                data = data
                    .map(p => { p.decodedName = decodeURIComponent(p.name); return p; })
                    .filter(p => p.decodedName.endsWith(suffix))
                    .map(p => ({
                        rawDecodedName: p.decodedName,
                        name: p.decodedName.replace(suffix, '').replace(/-/g, ' '),
                        score: parseInt(p.score) || 0,
                        text: p.text
                    }));

                // Sort descending just in case
                data.sort((a, b) => b.score - a.score);

                // Update Sticky Footer Initial State
                const sticky = document.getElementById('leaderboardSticky');
                let userRank = -1;
                let userScore = 0;

                // Handle empty state gracefully
                if (data.length === 0) {
                    listEl.innerHTML = `<div class="text-center text-neutral-500 text-sm py-5 mt-5">No scores yet in this category.<br>Sync yours!</div>`;
                    if (sticky) sticky.classList.add('translate-y-full');
                    return;
                }

                listEl.innerHTML = data.map((p, i) => {
                    const isMe = p.name.toLowerCase() === (playerName || '').toLowerCase();
                    if (isMe) {
                        userRank = i + 1;
                        userScore = p.score;
                    }
                    const rankClass = i === 0 ? "text-amber-400 font-black text-xl"
                        : i === 1 ? "text-neutral-300 font-bold text-lg"
                            : i === 2 ? "text-amber-600 font-bold text-lg"
                                : "text-neutral-500";
                    const bgClass = isMe ? "bg-emerald-900/40 border border-emerald-500/30" : "hover:bg-neutral-800/30 border border-transparent";
                    
                    const [avgG, sPerS, fPct] = (p.text && p.text !== '0') ? p.text.split('|') : ['-', '0', '0'];

                    const deleteBtnHtml = isAdmin ? `
                        <button onclick="deleteRecord('${p.rawDecodedName.replace(/'/g, "\\'")}')" class="ml-3 text-red-500 hover:text-red-400 bg-red-500/10 rounded-lg transition active:scale-95 p-2 shrink-0" title="Delete Score">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    ` : "";

                    return `
                        <li class="flex items-center p-3 rounded-xl transition-colors ${bgClass} relative group">
                            <div class="w-8 text-center shrink-0 ${rankClass}">#${i + 1}</div>
                            <div class="ml-3 flex-1 overflow-hidden">
                                <span class="font-bold text-sm ${isMe ? 'text-emerald-400' : 'text-neutral-200'} truncate block w-full">${p.name}</span>
                                ${p.text && p.text !== '0' ? `
                                    <div class="flex gap-1.5 mt-0.5 opacity-60 flex-wrap">
                                        <span class="text-[8px] font-bold text-blue-400">Avg: ${avgG || '-'}</span>
                                        <span class="text-neutral-700 text-[8px]">/</span>
                                        <span class="text-[8px] font-bold text-emerald-400">${sPerS || '0'} S/S</span>
                                        <span class="text-neutral-700 text-[8px]">/</span>
                                        <span class="text-[8px] font-bold text-amber-500">${fPct || '0'}% Fl</span>
                                    </div>
                                ` : ''}
                            </div>
                            <div class="ml-2 shrink-0">
                                <span class="font-black ${isMe ? 'text-emerald-300' : 'text-white'}">${p.score.toLocaleString()}</span> <span class="text-[10px] text-neutral-500 uppercase tracking-widest">pts</span>
                            </div>
                            ${deleteBtnHtml}
                        </li>
                    `;
                }).join('');

                if (sticky) {
                    if (userRank > -1) {
                        document.getElementById('stickyRank').innerText = `#${userRank}`;
                        document.getElementById('stickyName').innerText = playerName;
                        document.getElementById('stickyScore').innerText = userScore.toLocaleString();
                        sticky.classList.remove('translate-y-full');
                    } else {
                        sticky.classList.add('translate-y-full');
                    }
                }
            } catch (e) {
                listEl.innerHTML = `<div class="text-center text-red-400 text-sm py-5">Error loading leaderboard.<br>Check your connection.</div>`;
            }
        }

        let isAdmin = false;

        function toggleAdminMode() {
            if (isAdmin) {
                isAdmin = false;
                alert("Admin Mode Disabled");
                loadLeaderboard();
                return;
            }
            const pw = prompt("Enter Admin Password:");
            if (pw === "ADMIN") {
                isAdmin = true;
                alert("Admin Mode Enabled");
                loadLeaderboard();
            } else if (pw !== null) {
                alert("Incorrect Password.");
            }
        }

        async function deleteRecord(rawDecodedName) {
            if (!isAdmin) return;
            if (!confirm("Are you sure you want to permanently delete this score from the global leaderboard?")) return;
            try {
                await fetchDreamlo(`/lb/${DREAMLO_PRIVATE_KEY}/delete/${encodeURIComponent(rawDecodedName)}`);
                loadLeaderboard();
            } catch (e) {
                alert("Failed to delete record: " + e.message);
            }
        }

        // -- LOGIC: AUDIO CHIME --
        let audioCtx = null;
        function initAudio() {
            try {
                if (!audioCtx) {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    if (AudioContext) {
                        audioCtx = new AudioContext();
                        const osc = audioCtx.createOscillator();
                        const gain = audioCtx.createGain();
                        gain.gain.value = 0;
                        osc.connect(gain);
                        gain.connect(audioCtx.destination);
                        osc.start();
                        osc.stop(audioCtx.currentTime + 0.1);
                    }
                }
            } catch (e) { }
        }

        // Pre-initialize audio engine on first interaction to remove latency
        function primeAudio() {
            if (typeof initAudio === 'function') initAudio();
            const silent = new Audio();
            silent.muted = true;
            silent.play().catch(() => {});
        }
        document.body.addEventListener('touchstart', primeAudio, { once: true });
        document.body.addEventListener('mousedown', primeAudio, { once: true });

        function playDing() {
            if (!audioCtx) return;
            try {
                [1046.50, 1318.51].forEach((freq, i) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = freq;

                    const startTime = audioCtx.currentTime + (i * 0.15);
                    gain.gain.setValueAtTime(0, startTime);
                    gain.gain.linearRampToValueAtTime(0.5, startTime + 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 2);

                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start(startTime);
                    osc.stop(startTime + 2);
                });
            } catch (e) { }
        }

        function playIntervalBeep(type = 'work') {
            if (!audioCtx) initAudio();
            if (!audioCtx) return;
            try {
                if (audioCtx.state === 'suspended') audioCtx.resume();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                const t = audioCtx.currentTime;
                if (type === 'prep') {
                    // countdown tick (short high tap)
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(880, t);
                    gain.gain.setValueAtTime(0.3, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                    osc.start(t);
                    osc.stop(t + 0.08);
                } else if (type === 'work') {
                    // work start tone (bright higher tone)
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(1760, t);
                    gain.gain.setValueAtTime(0.45, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                    osc.start(t);
                    osc.stop(t + 0.25);
                } else if (type === 'rest') {
                    // rest tone (calm lower tone)
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(523.25, t);
                    gain.gain.setValueAtTime(0.35, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                    osc.start(t);
                    osc.stop(t + 0.15);
                }
            } catch (e) { }
        }
        window.playIntervalBeep = playIntervalBeep;

        // -- LOGIC: REST TIMER --
        let restTimerInterval = null;
        let defaultRestSeconds = 120;
        let restTimeRemaining = 0;
        let restTimerTargetEpoch = 0;
        let screenWakeLock = null;

        async function requestScreenWakeLock() {
            try {
                if ('wakeLock' in navigator && !screenWakeLock) {
                    screenWakeLock = await navigator.wakeLock.request('screen');
                    screenWakeLock.addEventListener('release', () => {
                        screenWakeLock = null;
                    });
                }
            } catch (e) {}
        }

        function releaseScreenWakeLock() {
            if (screenWakeLock) {
                screenWakeLock.release().catch(() => {});
                screenWakeLock = null;
            }
        }

        function formatTimerDisplay(secs) {
            const m = Math.floor(secs / 60);
            const s = secs % 60;
            return `${m}:${s.toString().padStart(2, '0')}`;
        }

        function adjRestTimer(delta) {
            if (restTimerInterval) {
                restTimerTargetEpoch += (delta * 1000);
                restTimeRemaining = Math.max(5, Math.ceil((restTimerTargetEpoch - Date.now()) / 1000));
            } else {
                defaultRestSeconds = Math.max(30, Math.min(900, defaultRestSeconds + delta));
            }
            updateRestTimerDisplay();
            if (typeof window.onRestTimerTick === 'function') {
                window.onRestTimerTick(restTimerInterval ? restTimeRemaining : defaultRestSeconds, restTimerInterval !== null, defaultRestSeconds);
            }
            
            // Secondary effects offloaded
            if ('vibrate' in navigator) navigator.vibrate(10);
            setTimeout(initAudio, 0); 
        }

        function updateRestTimerDisplay() {
            if (!DOM.timerText) return;
            const display = DOM.timerText;
            const pulse = DOM.timerPulse;
            const container = DOM.timerCard;
            const secs = restTimerInterval ? restTimeRemaining : defaultRestSeconds;
            
            const mins = Math.floor(secs / 60);
            const secondRemainder = secs % 60;
            const timeStr = `${mins}:${secondRemainder.toString().padStart(2, '0')}`;
            if (DOM.overlayTime) DOM.overlayTime.innerText = timeStr;

            if (display) {
                display.innerText = timeStr;
                
                if (restTimerInterval) {
                    display.classList.replace('text-neutral-400', 'text-emerald-400');
                    if (pulse) pulse.className = "w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse";
                    if (container) container.classList.add('border-emerald-500/50', 'shadow-emerald-500/10');
                } else {
                    display.classList.replace('text-emerald-400', 'text-neutral-400');
                    if (pulse) pulse.className = "w-1.5 h-1.5 rounded-full bg-neutral-700 shadow-[0_0_8px_rgba(16,185,129,0)] transition-all";
                    if (container) container.classList.remove('border-emerald-500/50', 'shadow-emerald-500/10');
                }
            }
        }

        function startRestTimer(customSeconds, showOverlay = true) {
            if (typeof customSeconds === 'number' && customSeconds > 0) {
                defaultRestSeconds = customSeconds;
            }

            if (showOverlay && DOM.overlayMain) {
                DOM.overlayMain.classList.replace('hidden', 'flex');
                if (DOM.overlayFinished) DOM.overlayFinished.classList.replace('flex', 'hidden');
            }

            if (restTimerInterval) {
                clearInterval(restTimerInterval);
                restTimerInterval = null;
            }

            restTimeRemaining = defaultRestSeconds;
            restTimerTargetEpoch = Date.now() + (defaultRestSeconds * 1000);

            requestScreenWakeLock();

            if ('vibrate' in navigator) navigator.vibrate(20);
            setTimeout(initAudio, 0);

            const handleTick = () => {
                restTimeRemaining = Math.max(0, Math.ceil((restTimerTargetEpoch - Date.now()) / 1000));
                if (restTimeRemaining <= 0) {
                    clearInterval(restTimerInterval);
                    restTimerInterval = null;
                    releaseScreenWakeLock();
                    
                    if (DOM.timerPulse) DOM.timerPulse.className = "w-1.5 h-1.5 rounded-full bg-emerald-500";
                    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
                    playDing();
                    
                    if (DOM.overlayMain && !DOM.overlayMain.classList.contains('hidden') && DOM.overlayFinished) {
                        DOM.overlayFinished.classList.replace('hidden', 'flex');
                    }
                }
                updateRestTimerDisplay();
                if (typeof window.onRestTimerTick === 'function') {
                    window.onRestTimerTick(restTimeRemaining, restTimerInterval !== null, defaultRestSeconds);
                }
            };

            restTimerInterval = setInterval(handleTick, 1000);
            handleTick();
        }

        function cancelRestTimer() {
            if (restTimerInterval) {
                clearInterval(restTimerInterval);
                restTimerInterval = null;
            }
            releaseScreenWakeLock();
            if (DOM.overlayMain) DOM.overlayMain.classList.replace('flex', 'hidden');
            updateRestTimerDisplay();
            if (typeof window.onRestTimerTick === 'function') {
                window.onRestTimerTick(defaultRestSeconds, false, defaultRestSeconds);
            }
        }

        // Screen-dark / background recovery listener
        function syncRestTimerFromWallClock() {
            if (restTimerInterval) {
                restTimeRemaining = Math.max(0, Math.ceil((restTimerTargetEpoch - Date.now()) / 1000));
                if (restTimeRemaining <= 0) {
                    clearInterval(restTimerInterval);
                    restTimerInterval = null;
                    releaseScreenWakeLock();
                    if (DOM.timerPulse) DOM.timerPulse.className = "w-1.5 h-1.5 rounded-full bg-emerald-500";
                    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
                    playDing();
                    if (DOM.overlayMain && !DOM.overlayMain.classList.contains('hidden') && DOM.overlayFinished) {
                        DOM.overlayFinished.classList.replace('hidden', 'flex');
                    }
                }
                updateRestTimerDisplay();
                if (typeof window.onRestTimerTick === 'function') {
                    window.onRestTimerTick(restTimeRemaining, restTimerInterval !== null, defaultRestSeconds);
                }
            }
        }

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                syncRestTimerFromWallClock();
                if (restTimerInterval) requestScreenWakeLock();
            }
        });
        window.addEventListener('focus', syncRestTimerFromWallClock);

        // Expose functions globally for app.js and index.html
        window.startRestTimer = startRestTimer;
        window.cancelRestTimer = cancelRestTimer;
        window.adjRestTimer = adjRestTimer;
        window.isRestTimerRunning = () => restTimerInterval !== null;
        window.getRestTimerRemaining = () => restTimerInterval ? restTimeRemaining : defaultRestSeconds;
        window.getDefaultRestSeconds = () => defaultRestSeconds;
        window.setDefaultRestSeconds = (secs) => { if (secs > 0) defaultRestSeconds = secs; updateRestTimerDisplay(); };



        // -- PWA SERVICE WORKER --
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').then(reg => {
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // New version available, notify user or auto-reload
                                console.log('New content available; please refresh.');
                            }
                        });
                    });
                }).catch(console.error);
            });
            
            // Reload when the new service worker takes control
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) {
                    refreshing = true;
                    window.location.reload();
                }
            });
        }

        async function forceHardRefresh() {
            try {
                if (typeof GDrive !== 'undefined' && GDrive.showLoadingOverlay) {
                    GDrive.showLoadingOverlay("Force Refreshing App...");
                }
            } catch (e) {}

            // Unregister all service workers
            if ('serviceWorker' in navigator) {
                try {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for (let registration of registrations) {
                        await registration.unregister();
                    }
                } catch (e) {
                    console.error("Failed to unregister service worker:", e);
                }
            }
            // Clear all caches
            if ('caches' in window) {
                try {
                    const keys = await caches.keys();
                    for (let key of keys) {
                        await caches.delete(key);
                    }
                } catch (e) {
                    console.error("Failed to delete caches:", e);
                }
            }
            // Clear session storage and force reload from server
            try {
                sessionStorage.clear();
            } catch(e) {}
            window.location.reload(true);
        }

        // ==========================================
