// Профессиональная цветовая палитра для графиков
const chartColors = {
    primary: '#4F7CAC',
    primaryLight: '#87A4C4',
    secondary: '#82C0CC',
    success: '#97D8C4',
    danger: '#F47C7C',
    warning: '#F7D6A0',
    info: '#A1B0BC',
    dark: '#333D47',
    light: '#F6F8FA',
    transparentPrimary: 'rgba(79, 124, 172, 0.25)',
    transparentSecondary: 'rgba(130, 192, 204, 0.25)',
    transparentSuccess: 'rgba(151, 216, 196, 0.2)',
};

// Глобальные переменные
let currentPlayerId = null;
let currentPlayerData = null;
let currentGuildId = null;
let charts = {};
let isGeneralView = false;
let animationEnabled = true;
let currentDatePeriod = '7';
let cropper = null;

// Утилита для управления скелетной загрузкой
const skeletonHandler = {
    show(elementIds) {
        elementIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<span class="skeleton">&nbsp;</span>';
        });
    },
    hide(elementId, value) {
        const el = document.getElementById(elementId);
        if (el) el.textContent = value;
    }
};

// === ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ DOM ===
document.addEventListener('DOMContentLoaded', function () {
    const savedTheme = localStorage.getItem('theme') || 'system';
    applyTheme(savedTheme, true); // Передаем флаг, что это начальная загрузка
    initNavigation();
    initMobileMenu();
    checkAuthStatus();
    initCollapsibleSections();
    
    window.addEventListener('resize', () => {
        Object.values(charts).forEach(chart => {
            if (chart && typeof chart.resize === 'function') {
                chart.resize();
            }
        });
    });
});

function checkAuthStatus() {
    fetch('/api/system/status')
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'online' && data.user_status !== 'offline') {
                loadCurrentPlayerData();
            } else {
                window.location.href = '/login.html';
            }
        })
        .catch(() => {
            showError('player-dashboard', 'Ошибка проверки авторизации. Пожалуйста, перезагрузите страницу.');
        });
}

function loadCurrentPlayerData() {
    fetch('/api/players/current')
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(playerData => {
            if (playerData.status === 'success') {
                currentPlayerId = playerData.player.id;
                currentPlayerData = playerData.player;
                currentGuildId = playerData.player.guild_id;
                if (!currentGuildId) {
                    showError('player-dashboard', 'ID гильдии не найден');
                }
                initDashboard();
            } else {
                throw new Error(playerData.message || 'Ошибка загрузки данных игрока');
            }
        })
        .catch(error => {
            console.error('Ошибка загрузки данных игрока:', error);
            showError('player-dashboard', 'Ошибка загрузки данных игрока');
        });
}
function initNavigation() {
    document.querySelectorAll('.close-modal, .close-modal-btn').forEach(button => {
        button.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if(modal) modal.style.display = 'none';
        });
    });

    document.querySelector('.help-btn')?.addEventListener('click', () => {
        document.getElementById('help-modal').style.display = 'flex';
    });

    document.querySelector('.refresh-btn')?.addEventListener('click', refreshActiveSection);

    document.querySelector('.member-btn')?.addEventListener('click', () => {
        if (confirm('Вы уверены, что хотите отправить запрос на разбор ваших сессий ментору?')) {
            requestMentorHelp();
        }
    });
    
    document.querySelector('.mentor-view-btn')?.addEventListener('click', loadAndShowReviewRequestsModal);

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const textElement = item.querySelector('span');
            if (!textElement) return;
            const text = textElement.textContent.trim();
            
            if (text === 'Оценить игрока') {
                if (currentPlayerData && ['mentor', 'founder'].includes(currentPlayerData.status)) {
                    document.getElementById('mentor-modal').style.display = 'flex';
                    loadMentorForm();
                }
                return;
            }
             if (text === 'Выйти') {
                logout();
                return;
            }
            
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            document.querySelectorAll('.dashboard-section').forEach(section => section.style.display = 'none');
            
            const viewToggle = document.querySelector('.view-toggle');
            viewToggle.style.display = (text === 'Дашборд') ? 'flex' : 'none';

            switch (text) {
                case 'Дашборд':
                    document.getElementById(isGeneralView ? 'general-dashboard' : 'player-dashboard').style.display = 'block';
                    refreshActiveSection();
                    break;
                case 'Профиль':
                    document.getElementById('profile-content').style.display = 'block';
                    loadProfile();
                    break;
                case 'Гильдия':
                    document.getElementById('guild-content').style.display = 'block';
                    loadGuildData();
                    break;
                case 'Управление':
                    document.getElementById('management-content').style.display = 'block';
                    loadManagementPanel(); // НОВАЯ функция для обработки обеих ролей
                    break;
                case 'Мои ученики':
                    document.getElementById('my-students-content').style.display = 'block';
                    loadMyStudents();
                    break;
                case 'Рекомендации':
                    document.getElementById('recommendations-content').style.display = 'block';
                    loadRecommendations();
                    break;
                case 'Настройки':
                    document.getElementById('settings-content').style.display = 'block';
                    loadSettings();
                    break;
            }
            closeMobileMenu();
        });
    });
}

function checkAndShowMyStudentsTab() {
    if (currentPlayerData?.status !== 'mentor') return; // Выполнять только для менторов

    const myStudentsBtn = document.querySelector('.my-students-btn');
    if (!myStudentsBtn) return;

    fetch('/api/mentors/students')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success' && data.students.length > 0) {
                myStudentsBtn.style.display = 'flex'; // Показываем кнопку, если есть ученики
            } else {
                myStudentsBtn.style.display = 'none'; // Скрываем, если нет
            }
        });
}


function initDashboard() {
    initViewToggle();
    initDateFilter();
    initThemeSwitcher();
    initMentorForm();
    initCompareModal();
    initRecommendationsFilter();
    initAvatarCropper();

    updateSidebarInfo();

    document.querySelector('.nav-item').classList.add('active');
    document.querySelector('.view-toggle').style.display = 'flex';

    const managementBtn = document.querySelector('.management-btn');
    if (managementBtn) {
        managementBtn.style.display = ['mentor', 'founder'].includes(currentPlayerData?.status) ? 'flex' : 'none';
    }
    
    const mentorBtn = document.querySelector('.mentor-btn');
    if (mentorBtn) {
        mentorBtn.style.display = ['mentor', 'founder'].includes(currentPlayerData?.status) ? 'flex' : 'none';
    }

    const memberBtn = document.querySelector('.member-btn');
    if(memberBtn){
        memberBtn.style.display = (currentPlayerData?.status === 'active') ? 'flex' : 'none';
    }

    const mentorViewBtn = document.querySelector('.mentor-view-btn');
    if (mentorViewBtn) {
        mentorViewBtn.style.display = ['mentor', 'founder'].includes(currentPlayerData?.status) ? 'flex' : 'none';
    }

    refreshActiveSection();
    loadSystemStatus();
    loadOnlineMembers();
    loadMentorRequestCount();
    setInterval(loadOnlineMembers, 15000);
    setInterval(loadMentorRequestCount, 30000);
    checkAndShowMyStudentsTab();
}

function loadMentorRequestCount() {
    const badge = document.querySelector('.mentor-view-btn .notification-badge');
    if (!badge || !['mentor', 'founder'].includes(currentPlayerData?.status)) return;

    fetch('/api/mentoring/requests/count')
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'success' && data.count > 0) {
                badge.textContent = data.count;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        })
        .catch(error => {
            console.error('Ошибка загрузки количества запросов:', error);
            badge.style.display = 'none';
        });
}

function initMobileMenu() {
    const menuToggle = document.querySelector('.menu-toggle');
    const menuToggleClose = document.querySelector('.menu-toggle-close');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    menuToggle?.addEventListener('click', () => {
        sidebar.classList.add('active');
        overlay.classList.add('active');
    });
    
    const closeMenu = () => {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    };

    menuToggleClose?.addEventListener('click', closeMenu);
    overlay?.addEventListener('click', closeMenu);
}
const closeMobileMenu = () => {
    document.querySelector('.sidebar')?.classList.remove('active');
    document.getElementById('sidebar-overlay')?.classList.remove('active');
};

function initCollapsibleSections() {
    document.querySelectorAll('.collapsible .section-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;

            const section = header.closest('.collapsible');
            if (section) {
                section.classList.toggle('collapsed');
                const icon = section.querySelector('.toggle-collapse-btn i');
                if (icon) {
                    icon.textContent = section.classList.contains('collapsed') ? 'expand_more' : 'expand_less';
                }
            }
        });
    });
}

function refreshActiveSection() {
    const activeSection = document.querySelector('.dashboard-section[style*="block"]');
    if (!activeSection) {
        // Если активной секции нет, по умолчанию показываем дашборд игрока
        document.getElementById('player-dashboard').style.display = 'block';
        loadPlayerDataAndCharts();
        return;
    }
    
    const activeSectionId = activeSection.id;

    switch (activeSectionId) {
        case 'player-dashboard': loadPlayerDataAndCharts(); break;
        case 'general-dashboard': loadGeneralData(); break;
        case 'profile-content': loadProfile(); break;
        case 'guild-content': loadGuildData(); break;
        case 'founder-content': loadFounderPanel(); break; 
        case 'recommendations-content': loadRecommendations(); break;
    }
    loadSystemStatus();
    loadOnlineMembers();
}

function updateAvatarDisplay(player) {
    const nickname = player.nickname || 'P';
    const avatarUrl = player.avatar_url;

    document.querySelectorAll('.sidebar-avatar-img, .profile-avatar-img').forEach(img => {
        const fallback = img.nextElementSibling;
        if (avatarUrl) {
            img.src = avatarUrl + `?t=${new Date().getTime()}`;
            img.style.display = 'block';
            if(fallback) fallback.style.display = 'none';
        } else {
            img.style.display = 'none';
            if(fallback) {
                fallback.style.display = 'flex';
                fallback.textContent = nickname.charAt(0).toUpperCase();
            }
        }
    });
}

function updateSidebarInfo() {
    if (currentPlayerData) {
        document.querySelector('.sidebar-guild').textContent = `Гильдия: ${currentPlayerData.guild}`;
        document.querySelector('.sidebar-player').textContent = currentPlayerData.nickname;
        updateAvatarDisplay(currentPlayerData);
    }
}

function loadOnlineMembers() {
    fetch('/api/system/online-members')
        .then(response => response.json())
        .then(data => {
            const onlineMembersList = document.querySelector('.online-members-list');
            onlineMembersList.innerHTML = '';
            const totalOnlineCountSpan = document.querySelector('.total-online-count');
            const onlineIndicator = document.querySelector('.online-members-section .online-indicator');

            if (data.status === 'success' && data.online_members.length > 0) {
                totalOnlineCountSpan.textContent = `Всего онлайн: ${data.online_members.length}`;
                onlineIndicator.classList.add('active');
                data.online_members.forEach(member => {
                    const memberCard = document.createElement('div');
                    memberCard.classList.add('online-member-card');
                    memberCard.setAttribute('data-player-id', member.player_id);

                    const durationFormatted = formatDuration(member.duration_seconds);
                    const avatarContent = member.avatar_url 
                        ? `<img src="${member.avatar_url}?t=${new Date().getTime()}" alt="${member.player_name}">`
                        : `<div class="sidebar-avatar-fallback" style="width: 48px; height: 48px; font-size: 24px;">${member.player_name.charAt(0).toUpperCase()}</div>`;

                    memberCard.innerHTML = `
                        ${avatarContent}
                        <div class="online-member-info">
                            <h3>${member.player_name}</h3>
                            <p>Гильдия: ${member.guild_name}</p>
                            <p>Статус: ${formatPlayerStatus(member.status)}</p>
                        </div>
                        <div class="online-member-duration">
                           <i class="material-icons">schedule</i>
                           <span>${durationFormatted}</span>
                        </div>
                    `;
                    onlineMembersList.appendChild(memberCard);
                });
            } else {
                totalOnlineCountSpan.textContent = 'Всего онлайн: 0';
                onlineIndicator.classList.remove('active');
                onlineMembersList.innerHTML = '<p style="text-align: center; color: var(--text-muted); grid-column: 1 / -1;">В данный момент никто не в игре.</p>';
            }
        })
        .catch(error => {
            console.error('Ошибка загрузки онлайн-участников:', error);
            const onlineMembersList = document.querySelector('.online-members-list');
            onlineMembersList.innerHTML = '<p style="text-align: center; color: var(--danger); grid-column: 1 / -1;">Ошибка при загрузке данных.</p>';
        });
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatPlayerStatus(status) {
    const statuses = {
        'founder': 'Основатель',
        'mentor': 'Ментор',
        'active': 'Игрок',
        'inactive': 'Неактивный',
        'pending': 'Ожидает'
    };
    return statuses[status] || status;
}

async function loadPlayerDataAndCharts() {
    // ГЛАВНОЕ ИСПРАВЛЕНИЕ: Защита от запуска без ID игрока
    if (!currentPlayerId) {
        console.log("loadPlayerDataAndCharts skipped: currentPlayerId is null.");
        return;
    }

    skeletonHandler.show(['avg-score', 'session-count', 'comparison', 'last-update-player']);
    loadMyRecentSessions();
    try {
        const endpoints = [
            `/api/statistics/player/${currentPlayerId}?period=${currentDatePeriod}`,
            `/api/statistics/comparison/${currentPlayerId}?period=${currentDatePeriod}`,
            `/api/statistics/player-trend/${currentPlayerId}?period=${currentDatePeriod}`,
            `/api/statistics/player-role-scores/${currentPlayerId}?period=${currentDatePeriod}`,
            `/api/statistics/player-content-scores/${currentPlayerId}?period=${currentDatePeriod}`,
            `/api/statistics/player-error-types/${currentPlayerId}?period=${currentDatePeriod}`,
            `/api/statistics/error-distribution/${currentPlayerId}?period=${currentDatePeriod}`,
            `/api/statistics/error-score-correlation/${currentPlayerId}?period=${currentDatePeriod}`
        ];

        const responses = await Promise.all(endpoints.map(url => fetch(url)));

        // Улучшенная обработка ошибок: проверяем все ответы перед парсингом JSON
        for (const res of responses) {
            if (!res.ok) {
                // Если хоть один запрос неудачен, прерываем выполнение и показываем ошибку
                throw new Error(`Ошибка сети: ${res.status} ${res.statusText} для ${res.url}`);
            }
        }
        
        const [stats, comparison, trend, roleScores, contentScores, errorTypes, errorDistribution, errorScore] = await Promise.all(
            responses.map(res => res.json())
        );

        skeletonHandler.hide('avg-score', (stats.avgScore || 0).toFixed(2));
        skeletonHandler.hide('session-count', stats.sessionCount || 0);
        skeletonHandler.hide('last-update-player', stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleDateString() : '-');
        
        const comparisonValue = ((comparison.playerScore / (comparison.topAvgScore || 1)) * 100);
        skeletonHandler.hide('comparison', `${comparisonValue > 0 ? comparisonValue.toFixed(1) : '0'}%`);
        
        createTrendChart(trend);
        createRoleScoresChart(roleScores);
        createContentScoresChart(contentScores);
        createErrorTypesChart(errorTypes);
        createErrorDistributionChart(errorDistribution);
        createErrorScoreChart(errorScore);

    } catch (error) {
        console.error('Ошибка в loadPlayerDataAndCharts:', error);
        showError('player-dashboard', 'Ошибка загрузки статистики игрока. Попробуйте обновить страницу.');
    }
}

// --- Chart Creation ---
function prepareChartContainer(canvasId) {
    const canvas = document.getElementById(canvasId);
    const container = canvas ? canvas.parentElement : document.body; // Fallback
    if (!container) return null;

    if (charts[canvasId]) {
        charts[canvasId].destroy();
        delete charts[canvasId];
    }
    
    // Очищаем только содержимое контейнера, оставляя сам контейнер и его заголовок
    let chartHeader = container.querySelector('.chart-header');
    container.innerHTML = ''; // Удаляем старый canvas и placeholder
    if (chartHeader) {
        container.appendChild(chartHeader); // Возвращаем заголовок
    }

    const newCanvas = document.createElement('canvas');
    newCanvas.id = canvasId;
    container.appendChild(newCanvas);

    return newCanvas.getContext('2d');
}

function showEmptyState(canvasId, message, icon) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const container = canvas.parentElement;
    
    if (charts[canvasId]) {
        charts[canvasId].destroy();
        delete charts[canvasId];
    }
    
    let chartHeader = container.querySelector('.chart-header');
    container.innerHTML = '';
    if (chartHeader) {
        container.appendChild(chartHeader);
    }
    
    const emptyStateHTML = `
        <div class="placeholder">
            <i class="material-icons">${icon || 'analytics'}</i>
            <p>${message || 'Нет данных для отображения.'}</p>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', emptyStateHTML);
}

function createTrendChart(trendData) {
    const canvasId = 'score-trend-chart';
    if (!trendData || !trendData.weeks || trendData.weeks.length === 0) {
        showEmptyState(canvasId, 'Недостаточно данных для построения тренда.', 'trending_up');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendData.weeks,
            datasets: [{
                label: 'Средний балл',
                data: trendData.scores,
                borderColor: chartColors.primary,
                backgroundColor: chartColors.transparentPrimary,
                tension: 0.4,
                fill: true
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false, min: 0, max: 10 } }, animation: { duration: animationEnabled ? 1000 : 0 } }
    });
}

function createRoleScoresChart(roleData) {
    const canvasId = 'role-scores-chart';
    if (!roleData || !roleData.roles || roleData.roles.length === 0) {
        showEmptyState(canvasId, 'Нет оценок по ролям за этот период.', 'bar_chart');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: { labels: roleData.roles, datasets: [{ label: 'Средний балл', data: roleData.scores, backgroundColor: chartColors.primary }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false, min: 0, max: 10 } }, animation: { duration: animationEnabled ? 1000 : 0 } }
    });
}

function createContentScoresChart(contentData) {
    const canvasId = 'content-scores-chart';
    if (!contentData || !contentData.contents || contentData.contents.length === 0) {
        showEmptyState(canvasId, 'Нет оценок по типам контента.', 'radar');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    const isDarkMode = document.documentElement.hasAttribute('data-theme');
    charts[canvasId] = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: contentData.contents,
            datasets: [{
                label: 'Средний балл',
                data: contentData.scores,
                backgroundColor: chartColors.transparentPrimary,
                borderColor: chartColors.primary,
                pointBackgroundColor: chartColors.primary
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                r: {
                    min: 0, max: 10,
                    pointLabels: { color: isDarkMode ? '#E2E8F0' : '#1A202C' },
                    grid: { color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
                    angleLines: { color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
                    ticks: { display: false }
                }
            },
            animation: { duration: animationEnabled ? 1000 : 0 }
        }
    });
}

function createErrorTypesChart(errorData) {
    const canvasId = 'error-types-chart';
    if (!errorData || !errorData.errors || errorData.errors.length === 0) {
        showEmptyState(canvasId, 'Поздравляем, ошибок не найдено!', 'thumb_up');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    charts[canvasId] = new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels: errorData.errors,
            datasets: [{
                data: errorData.counts,
                backgroundColor: Object.values(chartColors).slice(0, 5).map(c => c + 'B3')
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } }, scales: { r: { ticks: { display: false } } }, animation: { duration: animationEnabled ? 1000 : 0 } }
    });
}

function createErrorDistributionChart(distributionData) {
    const canvasId = 'error-distribution-chart';
    if (!distributionData || !distributionData.contents || distributionData.contents.length === 0) {
        showEmptyState(canvasId, 'Нет данных о распределении ошибок.', 'pie_chart');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: distributionData.contents,
            datasets: [{ label: 'Количество ошибок', data: distributionData.counts, backgroundColor: chartColors.secondary }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, animation: { duration: animationEnabled ? 1000 : 0 } }
    });
}

function createErrorScoreChart(correlationData) {
    const canvasId = 'error-score-chart';
    if (!correlationData || !correlationData.points || correlationData.points.length < 2) {
        showEmptyState(canvasId, 'Недостаточно данных для корреляции.', 'scatter_plot');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    const sortedPoints = correlationData.points.sort((a, b) => a.errors - b.errors);
    charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedPoints.map(p => `${p.errors} ош.`),
            datasets: [{
                label: 'Средний балл',
                data: sortedPoints.map(p => p.score),
                borderColor: chartColors.primary,
                backgroundColor: chartColors.transparentPrimary,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { title: { display: true, text: 'Балл' }, min: 0, max: 10 }, x: { title: { display: true, text: 'Количество ошибок за сессию' } } },
            animation: { duration: animationEnabled ? 1000 : 0 }
        }
    });
}

// --- Content Loading for other sections ---
function loadProfile() {
    skeletonHandler.show(['profile-nickname', 'profile-guild', 'profile-status', 'profile-balance', 'reg-date', 'mentor-name', 'description']);
    fetch(`/api/players/current`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const player = data.player;
                document.querySelector('.profile-nickname').textContent = player.nickname || '-';
                document.querySelector('.profile-guild').textContent = `Гильдия: ${player.guild || '-'}`;
                document.querySelector('.profile-status').textContent = `Статус: ${formatPlayerStatus(player.status) || '-'}`;
                document.querySelector('.profile-balance').textContent = `Баланс: ${player.balance || 0}`;
                document.querySelector('#mentor-name').textContent = player.mentor || 'Не назначен';
                document.querySelector('#description').textContent = player.description || 'Нет описания';
                updateAvatarDisplay(player);
            }
        })
        .catch(error => showError('profile-content', 'Ошибка загрузки профиля'));
    
    document.querySelector('.export-btn')?.addEventListener('click', () => {
        window.location.href = `/api/players/${currentPlayerId}/export`;
    });
}

function requestMentorHelp() {
    fetch('/api/mentoring/request-help', { method: 'POST' })
        .then(res => res.ok ? res.json() : Promise.reject(res.json()))
        .then(data => {
            if (data.status === 'success') {
                showSuccess('player-dashboard', data.message || 'Запрос успешно отправлен!');
            } 
        })
        .catch(errPromise => {
             errPromise.then(err => {
                showError('player-dashboard', err.message || 'Не удалось отправить запрос.');
            });
        });
}

function loadAndShowReviewRequestsModal() {
    const modal = document.getElementById('review-requests-modal');
    modal.style.display = 'flex';
    
    const container = document.getElementById('review-requests-list-modal');
    container.innerHTML = '<p>Загрузка запросов...</p>';

    fetch('/api/mentoring/requests')
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'success') {
                renderReviewRequests(data.requests);
            } else {
                throw new Error(data.message || 'Не удалось загрузить запросы');
            }
        })
        .catch(() => container.innerHTML = '<p class="error-message">Ошибка загрузки запросов о помощи.</p>');
}

function renderReviewRequests(requests) {
    const container = document.getElementById('review-requests-list-modal');
    if (requests.length === 0) {
        container.innerHTML = '<p class="placeholder" style="position: static; height: auto; padding: 2rem 0;">Нет активных запросов от игроков.</p>';
        return;
    }
    container.innerHTML = `
        <table class="players-table">
            <thead><tr><th>Игрок</th><th>Дата запроса</th><th>Действия</th></tr></thead>
            <tbody>
                ${requests.map(req => `
                    <tr>
                        <td data-label="Игрок">${req.nickname}</td>
                        <td data-label="Дата запроса">${new Date(req.created_at).toLocaleString()}</td>
                        <td data-label="Действия">
                            <button class="btn btn-primary review-btn" data-id="${req.id}">Отметить как разобранный</button>
                        </td>
                    </tr>`).join('')}
            </tbody>
        </table>`;

    container.querySelectorAll('.review-btn').forEach(btn => {
        btn.addEventListener('click', (e) => markRequestAsReviewed(e.target.dataset.id));
    });
}

function markRequestAsReviewed(requestId) {
    fetch(`/api/mentoring/requests/${requestId}/review`, { method: 'POST' })
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'success') {
                showSuccess('review-requests-modal', 'Запрос отмечен.');
                loadAndShowReviewRequestsModal();
                loadMentorRequestCount();
            } else { throw new Error(data.message); }
        })
        .catch(() => showError('review-requests-modal', 'Не удалось обновить статус запроса.'));
}

function initAvatarCropper() {
    const modal = document.getElementById('avatar-cropper-modal');
    const image = document.getElementById('avatar-cropper-image');
    const fileInput = document.getElementById('avatar-upload-input');
    
    document.querySelectorAll('.avatar-changer').forEach(el => {
        el.addEventListener('click', () => fileInput.click());
    });

    fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            const reader = new FileReader();
            reader.onload = () => {
                image.src = reader.result;
                modal.style.display = 'flex';
                if (cropper) {
                    cropper.destroy();
                }
                cropper = new Cropper(image, {
                    aspectRatio: 1, viewMode: 1, dragMode: 'move',
                    background: false, autoCropArea: 0.8,
                });
            };
            reader.readAsDataURL(files[0]);
        }
        fileInput.value = '';
    });

    document.getElementById('save-crop-btn').addEventListener('click', () => {
        if (!cropper) return;
        cropper.getCroppedCanvas({
            width: 256, height: 256, imageSmoothingQuality: 'high',
        }).toBlob((blob) => {
            const formData = new FormData();
            formData.append('avatar', blob, 'avatar.png');

            fetch('/api/players/current/avatar', { method: 'POST', body: formData })
            .then(res => res.ok ? res.json() : Promise.reject(res))
            .then(data => {
                if(data.status === 'success') {
                    currentPlayerData.avatar_url = data.avatar_url;
                    updateAvatarDisplay(currentPlayerData);
                    modal.style.display = 'none';
                    showSuccess('profile-content', 'Аватар обновлен!');
                } else { throw new Error(data.message); }
            })
            .catch(() => showError('avatar-cropper-modal', 'Ошибка загрузки аватара.'));
        });
    });
    
    document.getElementById('cancel-crop-btn').addEventListener('click', () => {
        modal.style.display = 'none';
        if (cropper) cropper.destroy();
    });
}

function loadMyRecentSessions() {
    const container = document.getElementById('recent-sessions-list');
    if (!container) return;

    fetch('/api/players/current/recent-sessions')
        .then(response => response.ok ? response.json() : Promise.reject('Failed to load'))
        .then(data => {
            if (data.status === 'success') {
                renderRecentSessions(container, data.sessions);
            } else {
                container.innerHTML = '<p class="error-message">Не удалось загрузить сессии.</p>';
            }
        })
        .catch(() => {
            container.innerHTML = '<p class="error-message">Ошибка загрузки сессий.</p>';
        });
}

function renderRecentSessions(container, sessions) {
    if (!sessions || sessions.length === 0) {
        container.innerHTML = '<p class="placeholder" style="position: static; height: auto;">У вас еще нет зарегистрированных сессий.</p>';
        return;
    }

    container.innerHTML = `
        <table class="players-table">
            <thead>
                <tr>
                    <th>Дата</th>
                    <th>Контент</th>
                    <th>Роль</th>
                    <th>Оценка</th>
                </tr>
            </thead>
            <tbody>
                ${sessions.map(s => `
                    <tr>
                        <td data-label="Дата">${new Date(s.session_date).toLocaleDateString()}</td>
                        <td data-label="Контент">${s.content_name}</td>
                        <td data-label="Роль">${s.role}</td>
                        <td data-label="Оценка">${s.score.toFixed(1)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function loadGuildData() {
    if (!currentGuildId) return;

    try {
        const [guildInfoRes, allPlayersRes, roleRatingsRes] = await Promise.all([
            fetch(`/api/guilds/${currentGuildId}`),
            fetch(`/api/guilds/${currentGuildId}/top-players?limit=0`),
            fetch(`/api/guilds/${currentGuildId}/role-ratings`)
        ]);

        const guildInfo = await guildInfoRes.json();
        const allPlayers = await allPlayersRes.json();
        const roleRatings = await roleRatingsRes.json();
        
        if (guildInfo.status === 'success') {
            const guild = guildInfo.guild;
            document.querySelector('.guild-members').textContent = `Участников: ${guild.members || 0}`;
            document.querySelector('.guild-kill-fame').textContent = `Kill Fame: ${guild.kill_fame || 0}`;
            document.querySelector('.guild-death-fame').textContent = `Death Fame: ${guild.death_fame || 0}`;
        }
        
        if (allPlayers.status === 'success') {
            renderPlayerTable(document.getElementById('all-players-list'), allPlayers.players, currentPlayerId);
            const rankMessageEl = document.getElementById('guild-player-rank');
            const playerIndex = allPlayers.players.findIndex(p => p.id === currentPlayerId);
            if (playerIndex !== -1) {
                rankMessageEl.textContent = `Ваш ранг в гильдии: #${playerIndex + 1} из ${allPlayers.players.length}`;
                rankMessageEl.style.display = 'block';
            } else {
                rankMessageEl.style.display = 'none';
            }
        }
        
        if(roleRatings.status === 'success') {
            renderRoleRatings(roleRatings.ratings);
        }

    } catch(error) {
        showError('guild-content', 'Ошибка загрузки данных гильдии');
    }
}

function renderRoleRatings(ratings) {
    const container = document.getElementById('role-ratings-content');
    container.innerHTML = '';
    
    let content = '';
    for (const [role, players] of Object.entries(ratings)) {
        if(players.length > 0) {
            content += `
                <div class="role-rating-list">
                    <h4>${role}</h4>
                    <ul>
                        ${players.map(p => `<li><span>${p.nickname}</span><span class="rating-score">${p.avg_score.toFixed(2)}</span></li>`).join('')}
                    </ul>
                </div>
            `;
        }
    }

    if(content === '') {
        container.innerHTML = '<p class="placeholder" style="position: static; height: auto;">Нет данных для построения рейтингов. Нужно больше сессий с оценками.</p>';
    } else {
        container.innerHTML = content;
    }
}

// УДАЛИТЕ старые функции loadFounderPanel, renderPendingPlayers, approvePlayer, denyPlayer.
// ДОБАВЬТЕ следующие новые функции.

/**
 * Главный обработчик для раздела "Управление".
 * Отображает правильный вид в зависимости от роли текущего пользователя (основатель или ментор).
 */
function loadManagementPanel() {
    const container = document.getElementById('management-content');
    if (!container) return;
    container.innerHTML = ''; // Очищаем предыдущее содержимое

    if (currentPlayerData.status === 'founder') {
        // Если пользователь основатель, отображаем вид управления заявками.
        container.innerHTML = `
            <header class="dashboard-header">
                <div class="header-left"><h1 id="founder-title">Управление заявками <span class="stat-badge" id="pending-count"></span></h1></div>
            </header>
            <div class="players-list-container">
                <h2>Заявки на вступление в гильдию</h2>
                <div id="pending-players-list"></div>
            </div>`;
        loadPendingPlayersList(); // Эта функция теперь будет обрабатывать получение и отображение для основателей.
    } else if (currentPlayerData.status === 'mentor') {
        // Если пользователь ментор, отображаем вид анализа игроков.
        container.innerHTML = `
            <header class="dashboard-header">
                <div class="header-left"><h1>Анализ игроков</h1></div>
            </header>
            <div class="form-group" style="padding: 0 16px;">
                <label>Выберите игрока для просмотра</label>
                <select id="mentor-player-select" class="form-control">
                    <option value="" disabled selected>Выберите игрока...</option>
                </select>
            </div>
            <div id="mentor-player-details-view" style="margin-top: 16px;">
                <p class="placeholder" style="position: static; height: auto;">Выберите игрока из списка выше, чтобы увидеть его профиль и последние сессии.</p>
            </div>`;
        populatePlayerSelectForMentor();
    }
}

/**
 * Получает и отображает список ожидающих игроков для основателей.
 */
function loadPendingPlayersList() {
    const container = document.getElementById('pending-players-list');
    if (!container) return;
    container.innerHTML = '<p>Загрузка заявок...</p>';

    fetch('/api/guilds/pending-players')
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'success') {
                const countEl = document.getElementById('pending-count');
                if (countEl) {
                    countEl.textContent = data.players.length;
                    countEl.style.display = data.players.length > 0 ? 'inline-flex' : 'none'; // Показываем только если есть заявки
                }

                if (data.players.length === 0) {
                    container.innerHTML = '<p class="placeholder" style="position: static; height: auto;">Нет новых заявок на вступление.</p>';
                    return;
                }
                const table = document.createElement('table');
                table.className = 'players-table';
                table.innerHTML = `
                    <thead><tr><th>Игрок</th><th>Дата заявки</th><th>Действия</th></tr></thead>
                    <tbody>
                        ${data.players.map(p => `
                            <tr>
                                <td data-label="Игрок">${p.nickname}</td>
                                <td data-label="Дата">${new Date(p.date).toLocaleDateString()}</td>
                                <td data-label="Действия">
                                    <button class="btn btn-primary approve-btn" data-id="${p.id}">Одобрить</button>
                                    <button class="btn btn-secondary deny-btn" data-id="${p.id}">Отклонить</button>
                                </td>
                            </tr>`).join('')}
                    </tbody>`;
                container.innerHTML = '';
                container.appendChild(table);

                // Добавляем обработчики событий для одобрения/отклонения
                container.querySelectorAll('.approve-btn').forEach(btn => btn.addEventListener('click', e => handlePlayerAction(e.target.dataset.id, 'approve')));
                container.querySelectorAll('.deny-btn').forEach(btn => btn.addEventListener('click', e => handlePlayerAction(e.target.dataset.id, 'deny')));
            } else {
                throw new Error(data.message);
            }
        })
        .catch(() => container.innerHTML = '<p class="error-message">Ошибка загрузки заявок.</p>');
}

/**
 * Обрабатывает действие основателя (одобрить/отклонить) над игроком.
 * @param {string} playerId - ID игрока.
 * @param {string} action - Действие для выполнения ('approve' или 'deny').
 */
function handlePlayerAction(playerId, action) {
    fetch(`/api/players/${playerId}/${action}`, { method: 'POST' })
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'success') {
                showSuccess('management-content', `Игрок успешно ${action === 'approve' ? 'одобрен' : 'отклонен'}.`);
                loadPendingPlayersList(); // Обновляем список
            } else { throw new Error(data.message); }
        })
        .catch(() => showError('management-content', `Не удалось ${action === 'approve' ? 'одобрить' : 'отклонить'} игрока.`));
}

/**
 * Заполняет выпадающий список выбора игрока для вида ментора.
 */
function populatePlayerSelectForMentor() {
    const select = document.getElementById('mentor-player-select');
    if (!select) return;

    fetch('/api/players')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // Исключаем самого ментора из списка
                const otherPlayers = data.players.filter(p => p.id !== currentPlayerId);
                otherPlayers.forEach(player => {
                    const option = document.createElement('option');
                    option.value = player.id;
                    option.textContent = player.nickname;
                    select.appendChild(option);
                });

                select.addEventListener('change', (e) => {
                    const selectedPlayerId = e.target.value;
                    if (selectedPlayerId) {
                        loadPlayerDetailsForMentor(selectedPlayerId);
                    }
                });
            }
        });
}

/**
 * Получает и отображает детали конкретного игрока для ментора.
 * @param {string} playerId - ID игрока для отображения.
 */
function loadPlayerDetailsForMentor(playerId) {
    const container = document.getElementById('mentor-player-details-view');
    if (!container) return;
    container.innerHTML = '<p>Загрузка данных игрока...</p>';

    fetch(`/api/management/player-details/${playerId}`)
        .then(response => response.ok ? response.json() : Promise.reject('Failed to load details'))
        .then(data => {
            if (data.status === 'success') {
                const { profile, sessions } = data;

                // Логика для кнопки "Взять в ученики"
                let mentorButtonHtml = '';
                // ИСПОЛЬЗУЕМ 'profile.mentor_id', которое теперь приходит с бэкенда
                if (!profile.mentor_id) { 
                    mentorButtonHtml = `<button id="assign-student-btn" class="btn btn-primary" data-student-id="${profile.id}">Взять в ученики</button>`;
                } else if (profile.mentor_id === currentPlayerData.id) {
                    mentorButtonHtml = `<span class="stat-badge">Это ваш ученик</span>`;
                } else {
                    mentorButtonHtml = `<span class="stat-badge">Ментор уже назначен</span>`;
                }

                // ИСПРАВЛЕНИЕ: Полностью переписан HTML для корректного отображения данных
                container.innerHTML = `
                    <div class="profile-section">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <h2><i class="material-icons">person</i> Профиль игрока: ${profile.nickname}</h2>
                            ${mentorButtonHtml} 
                        </div>
                        <div class="profile-info-grid">
                            <div class="info-item">
                                <label>Статус</label>
                                <span>${formatPlayerStatus(profile.status)}</span>
                            </div>
                            <div class="info-item">
                                <label>Баланс</label>
                                <span>${profile.balance}</span>
                            </div>
                            <div class="info-item">
                                <label>Дата регистрации</label>
                                <span>${new Date(profile.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                    <div class="profile-section">
                        <h2><i class="material-icons">history</i> Последние сессии игрока</h2>
                        <div id="mentor-recent-sessions"></div>
                    </div>
                `;

                // Обработчик для новой кнопки
                const assignBtn = document.getElementById('assign-student-btn');
                if (assignBtn) {
                    assignBtn.addEventListener('click', (e) => {
                        assignStudentToMentor(e.target.dataset.studentId);
                    });
                }
                
                // Теперь эта функция найдёт контейнер 'mentor-recent-sessions'
                renderRecentSessionsForMentor(document.getElementById('mentor-recent-sessions'), sessions);
            } else {
                container.innerHTML = `<p class="error-message">${data.message || 'Не удалось загрузить данные.'}</p>`;
            }
        })
        .catch(() => {
            container.innerHTML = '<p class="error-message">Ошибка при загрузке данных игрока.</p>';
        });
}

/**
 * Отображает список сессий для вида ментора (включает больше деталей).
 * @param {HTMLElement} container - Элемент для отображения таблицы.
 * @param {Array} sessions - Массив объектов сессий.
 */
function renderRecentSessionsForMentor(container, sessions) {
    if (!sessions || sessions.length === 0) {
        container.innerHTML = '<p class="placeholder" style="position: static; height: auto;">У игрока нет зарегистрированных сессий.</p>';
        return;
    }

    container.innerHTML = `
        <table class="players-table">
            <thead>
                <tr>
                    <th>Дата</th>
                    <th>Контент</th>
                    <th>Роль</th>
                    <th>Оценка</th>
                    <th>Ментор</th>
                    <th>Комментарий</th>
                </tr>
            </thead>
            <tbody>
                ${sessions.map(s => `
                    <tr>
                        <td data-label="Дата">${new Date(s.session_date).toLocaleDateString()}</td>
                        <td data-label="Контент">${s.content_name}</td>
                        <td data-label="Роль">${s.role}</td>
                        <td data-label="Оценка">${s.score.toFixed(1)}</td>
                        <td data-label="Ментор">${s.mentor_name || '-'}</td>
                        <td data-label="Комментарий">${s.comments || '-'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function loadManageablePlayers() {
    const container = document.getElementById('manage-players-list');
    if (!container) return;
    container.innerHTML = '<p>Загрузка состава...</p>';

    fetch('/api/guilds/manageable-players')
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'success') {
                renderManageablePlayers(data.players);
            } else {
                throw new Error(data.message || 'Не удалось загрузить состав гильдии');
            }
        })
        .catch(() => {
            container.innerHTML = '<p class="error-message">Ошибка загрузки состава гильдии.</p>';
        });
}

function renderManageablePlayers(players) {
    const container = document.getElementById('manage-players-list');
    if (!container) return;

    if (players.length === 0) {
        container.innerHTML = '<p class="placeholder" style="position: static; height: auto;">В гильдии пока нет других участников.</p>';
        return;
    }

    container.innerHTML = `
        <table class="players-table">
            <thead>
                <tr><th>Игрок</th><th>Статус</th><th>Дата регистрации</th><th>Действия</th></tr>
            </thead>
            <tbody>
                ${players.map(player => `
                    <tr>
                        <td data-label="Игрок">${player.nickname}</td>
                        <td data-label="Статус">${formatPlayerStatus(player.status)}</td>
                        <td data-label="Дата регистрации">${new Date(player.created_at).toLocaleDateString()}</td>
                        <td data-label="Действия">
                            <button class="btn btn-secondary delete-btn" data-id="${player.id}" data-name="${player.nickname}">Удалить</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const playerId = e.target.dataset.id;
            const playerName = e.target.dataset.name;
            deletePlayer(playerId, playerName);
        });
    });
}

function deletePlayer(playerId, playerName) {
    if (!confirm(`Вы уверены, что хотите НАВСЕГДА удалить игрока "${playerName}" из системы? Все его данные будут стерты.`)) {
        return;
    }

    fetch(`/api/players/${playerId}`, { method: 'DELETE' })
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'success') {
                showSuccess('founder-content', `Игрок ${playerName} успешно удален.`);
                loadManageablePlayers();
            } else {
                throw new Error(data.message);
            }
        })
        .catch(() => showError('founder-content', `Не удалось удалить игрока ${playerName}.`));
}

function loadRecommendations() {
    fetch(`/api/recommendations/player/${currentPlayerId}`)
        .then(response => response.json())
        .then(data => {
            const grid = document.querySelector('.recommendations-grid');
            if (data.status === 'success' && data.recommendations.length > 0) {
                grid.innerHTML = data.recommendations.map(rec => `
                    <div class="recommendation-card ${rec.status}">
                        <div class="recommendation-header">
                            <h3 class="recommendation-title">${rec.title}</h3>
                            <span class="recommendation-status">${rec.status}</span>
                        </div>
                        <p class="recommendation-description">${rec.description}</p>
                        <div class="recommendation-meta">
                            <span>Приоритет: ${rec.priority}</span>
                            <span>${new Date(rec.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>`).join('');
            } else {
                 grid.innerHTML = '<div class="placeholder" style="position: static; height: auto; grid-column: 1 / -1;"><i class="material-icons">lightbulb</i><p>Для вас пока нет рекомендаций.</p></div>';
            }
        });
}

function initRecommendationsFilter() {
    const filterContainer = document.querySelector('.filter-controls');
    filterContainer?.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-pill')) {
            filterContainer.querySelectorAll('.filter-pill').forEach(f => f.classList.remove('active'));
            e.target.classList.add('active');
        }
    });
}

function initViewToggle() {
    const toggleContainer = document.querySelector('.view-toggle');
    toggleContainer?.querySelectorAll('.toggle-option').forEach((option, index) => {
        option.addEventListener('click', () => {
            toggleContainer.querySelector('.toggle-option.active').classList.remove('active');
            option.classList.add('active');
            toggleContainer.querySelector('.toggle-indicator').style.transform = `translateX(${index * 100}%)`;
            
            isGeneralView = option.textContent.trim() === 'Общая статистика';
            document.getElementById('player-dashboard').style.display = isGeneralView ? 'none' : 'block';
            document.getElementById('general-dashboard').style.display = isGeneralView ? 'block' : 'none';
            
            if (isGeneralView) {
                loadGeneralData();
            } else {
                loadPlayerDataAndCharts();
            }
        });
    });
}

function initDateFilter() {
    const filterContainer = document.querySelector('.date-filter-controls');
    filterContainer?.addEventListener('click', e => {
        if(e.target.tagName === 'BUTTON') {
            filterContainer.querySelector('.active').classList.remove('active');
            e.target.classList.add('active');
            currentDatePeriod = e.target.dataset.period;
            refreshActiveSection();
        }
    });
}

async function loadGeneralData() {
    // ИСПРАВЛЕНИЕ: Защита от запуска без ID гильдии
    if (!currentGuildId) {
        console.log("loadGeneralData skipped: currentGuildId is null.");
        return;
    }
    skeletonHandler.show(['guild-avg-score', 'active-players', 'total-sessions']);
    try {
        const endpoints = [
            `/api/statistics/guild/${currentGuildId}`,
            `/api/statistics/total-sessions?guild_id=${currentGuildId}`,
            `/api/statistics/best-player-week?guild_id=${currentGuildId}`,
            '/api/statistics/guild-role-distribution',
            '/api/statistics/guild-error-types',
            '/api/statistics/top-errors',
            '/api/statistics/guild-ranking',
            `/api/guilds/${currentGuildId}/top-players?min_sessions=5`
        ];
        
        const responses = await Promise.all(endpoints.map(url => fetch(url)));
        
        for (const res of responses) {
            if (!res.ok) {
                throw new Error(`Ошибка сети: ${res.status} ${res.statusText} для ${res.url}`);
            }
        }

        const [guildStats, totalSessions, bestPlayer, roleDist, errorTypes, topErrors, guildRanking, topPlayers] = await Promise.all(
            responses.map(res => res.json())
        );
        
        skeletonHandler.hide('guild-avg-score', (guildStats.avgScore || 0).toFixed(2));
        skeletonHandler.hide('active-players', guildStats.activePlayers || 0);
        skeletonHandler.hide('total-sessions', `${totalSessions.guild_sessions || 0} / ${totalSessions.total || 0}`);
        renderSpotlightPlayer(bestPlayer.player);

        createGuildRoleDistributionChart(roleDist);
        createGuildErrorTypesChart(errorTypes);
        createTopErrorsChart(topErrors);
        createGuildRankingChart(guildRanking);

        renderPlayerTable(document.getElementById('top-players-list'), topPlayers.players.slice(0, 10), currentPlayerId);

    } catch (error) {
        console.error("Ошибка в loadGeneralData:", error);
        showError('general-dashboard', 'Ошибка загрузки общей статистики.');
    }
}

function renderSpotlightPlayer(player) {
    const container = document.getElementById('spotlight-player-card');
    if (!player) {
        container.innerHTML = `
            <div class="spotlight-header">
                <i class="material-icons">emoji_events</i>
                <h4>Игрок недели</h4>
            </div>
            <div class="placeholder" style="position: static; padding: 1rem 0;">
                <p>Нет игрока, соответствующего критериям (мин. 3 сессии за неделю).</p>
            </div>
        `;
        return;
    }

    const nickname = player.nickname || 'P';
    const avatarUrl = player.avatar_url;

    const avatarContent = avatarUrl
        ? `<img src="${avatarUrl}?t=${new Date().getTime()}" class="spotlight-avatar-img">`
        : `<div class="spotlight-avatar-fallback">${nickname.charAt(0).toUpperCase()}</div>`;

    container.innerHTML = `
        <div class="spotlight-header">
            <i class="material-icons">emoji_events</i>
            <h4>Игрок недели</h4>
        </div>
        <div class="spotlight-body">
            <div class="spotlight-avatar-wrapper">
                ${avatarContent}
            </div>
            <div class="spotlight-info">
                <p class="spotlight-name">${player.nickname}</p>
                <div class="spotlight-stats">
                    <span><i class="material-icons">star</i> ${(player.avg_score || 0).toFixed(2)}</span>
                    <span><i class="material-icons">shield</i> ${player.main_role || '-'}</span>
                    <span><i class="material-icons">map</i> ${player.best_content || '-'}</span>
                </div>
            </div>
        </div>
    `;
}


function createGuildRoleDistributionChart(data) {
    const canvasId = 'guild-role-distribution';
    if (!data || !data.roles || data.roles.length === 0) {
        showEmptyState(canvasId, 'Нет данных о ролях в гильдии.');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    charts[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.roles,
            datasets: [{ data: data.counts, backgroundColor: Object.values(chartColors).slice(0, 6) }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } }, animation: { duration: animationEnabled ? 1000 : 0 } }
    });
}

function createGuildErrorTypesChart(data) {
    const canvasId = 'guild-error-types';
    if (!data || !data.errors || data.errors.length === 0) {
        showEmptyState(canvasId, 'В гильдии не зафиксировано ошибок.');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    charts[canvasId] = new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels: data.errors,
            datasets: [{ data: data.counts, backgroundColor: Object.values(chartColors).slice(0, 5).map(c => c + 'B3') }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } }, scales: { r: { ticks: { display: false } } }, animation: { duration: animationEnabled ? 1000 : 0 } }
    });
}

function createTopErrorsChart(data) {
    const canvasId = 'top-errors-chart';
    if (!data || !data.errors || data.errors.length === 0) {
        showEmptyState(canvasId, 'Ошибок не найдено.', 'thumb_up');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.errors.slice(0, 3),
            datasets: [{ label: 'Частота', data: data.counts.slice(0, 3), backgroundColor: chartColors.warning }]
        },
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: animationEnabled ? 1000 : 0 } }
    });
}

function createGuildRankingChart(data) {
    const canvasId = 'guild-ranking-chart';
    if (!data || !data.guilds || data.guilds.length === 0) {
        showEmptyState(canvasId, 'Нет данных для рейтинга гильдий.');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.guilds,
            datasets: [{ label: 'Ранг', data: data.scores, backgroundColor: chartColors.primary }]
        },
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: animationEnabled ? 1000 : 0 } }
    });
}

function renderPlayerTable(container, players, highlightPlayerId) {
    if (players.length === 0) {
        container.innerHTML = '<p class="placeholder" style="position: static; height: auto;">Нет игроков для отображения</p>';
        return;
    }
    container.innerHTML = `
        <table class="players-table">
            <thead><tr><th>Ранг</th><th>Игрок</th><th>Ср. балл</th><th>Сессии</th><th>Роль</th></tr></thead>
            <tbody>
                ${players.map((player, index) => `
                    <tr class="${player.id === highlightPlayerId ? 'current-player' : ''}">
                        <td data-label="Ранг"><span class="player-rank">#${index + 1}</span></td>
                        <td data-label="Игрок">${player.nickname || '-'}</td>
                        <td data-label="Ср. балл">${(player.avg_score || 0).toFixed(2)}</td>
                        <td data-label="Сессии">${player.session_count || 0}</td>
                        <td data-label="Роль">${player.main_role || '-'}</td>
                    </tr>`).join('')}
            </tbody>
        </table>`;
}

function loadSettings() {
    document.getElementById('theme-selector').value = localStorage.getItem('theme') || 'system';
    document.getElementById('animations-toggle').checked = localStorage.getItem('animations') !== 'false';
    document.getElementById('notifications-toggle').checked = localStorage.getItem('notifications') === 'true';
    document.getElementById('publish-toggle').checked = localStorage.getItem('publish') === 'true';
    
    document.querySelector('.save-settings')?.addEventListener('click', saveSettings);
}

function saveSettings() {
    const theme = document.getElementById('theme-selector').value;
    localStorage.setItem('theme', theme);
    const animations = document.getElementById('animations-toggle').checked;
    localStorage.setItem('animations', animations);
    animationEnabled = animations;
    localStorage.setItem('notifications', document.getElementById('notifications-toggle').checked);
    localStorage.setItem('publish', document.getElementById('publish-toggle').checked);
    
    applyTheme(theme);
    showSuccess('settings-content', 'Настройки сохранены');
}

function applyTheme(theme, isInitialLoad = false) {
    document.documentElement.removeAttribute('data-theme');
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    // На начальной загрузке не нужно обновлять секцию, это произойдет после получения ID
    if (!isInitialLoad) {
        refreshActiveSection();
    }
}

function loadSystemStatus() {
    fetch('/api/system/status').then(res => res.json()).then(data => {
        document.getElementById('db-status').textContent = `DB: ${data.status === 'online' ? 'Online' : 'Offline'}`;
        document.getElementById('api-status').textContent = `API: ${data.status === 'online' ? 'Online' : 'Offline'}`;
        document.getElementById('last-update').textContent = `Обновлено: ${data.last_update ? new Date(data.last_update).toLocaleDateString() : '-'}`;
        document.getElementById('total-players').textContent = `Игроков: ${data.total_players || 0}`;
        document.getElementById('total-mentors').textContent = `Менторов: ${data.total_mentors || 0}`;
    }).catch(error => console.error('Ошибка проверки статуса системы'));
}

function initThemeSwitcher() {
    const themeSelector = document.getElementById('theme-selector');
    themeSelector?.addEventListener('change', function() {
        applyTheme(this.value);
        localStorage.setItem('theme', this.value);
    });
}

function initMentorForm() {
    const starRating = document.querySelector('.star-rating');
    if (!starRating) return;

    starRating.addEventListener('click', e => {
        if (e.target.tagName === 'I') {
            const rating = e.target.dataset.value;
            document.getElementById('score').value = rating;
            starRating.querySelectorAll('i').forEach((s, i) => {
                s.classList.toggle('active', i < rating);
                s.textContent = i < rating ? 'star' : 'star_border';
            });
        }
    });

    document.getElementById('mentor-form')?.addEventListener('submit', e => {
        e.preventDefault();
        saveMentorSession();
    });
}

async function loadMentorForm() {
    const playerSelect = document.getElementById('player-select');
    const contentSelect = document.getElementById('content-select');
    try {
        const [playersRes, contentRes] = await Promise.all([ fetch('/api/players'), fetch('/api/content') ]);
        const playersData = await playersRes.json();
        const contentData = await contentRes.json();
        
        playerSelect.innerHTML = '<option value="" disabled selected>Выберите игрока</option>';
        playersData.players.forEach(p => {
            if (p.id !== currentPlayerId) playerSelect.innerHTML += `<option value="${p.id}">${p.nickname}</option>`;
        });
        
        contentSelect.innerHTML = '<option value="" disabled selected>Выберите контент</option>';
        contentData.content.forEach(c => contentSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`);

    } catch(err) {
        showError('mentor-modal', 'Ошибка загрузки данных для формы');
    }
}

function saveMentorSession() {
    const form = document.getElementById('mentor-form');
    const sessionData = {
        playerId: form.querySelector('#player-select').value,
        contentId: form.querySelector('#content-select').value,
        score: form.querySelector('#score').value,
        role: form.querySelector('#role-select').value,
        errorTypes: form.querySelector('#error-types').value,
        workOn: form.querySelector('#work-on').value,
        comments: form.querySelector('#comments').value,
        mentorId: currentPlayerId,
        sessionDate: new Date().toISOString()
    };
    if (!sessionData.playerId || !sessionData.contentId || !sessionData.role || parseInt(sessionData.score) < 1) {
        showError('mentor-modal', 'Пожалуйста, заполните все обязательные поля (Игрок, Контент, Роль, Оценка).');
        return;
    }

    fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sessionData) })
    .then(response => response.ok ? response.json() : Promise.reject(response))
    .then(() => {
        document.getElementById('mentor-modal').style.display = 'none';
        showSuccess('player-dashboard', 'Сессия успешно добавлена');
        form.reset();
        form.querySelectorAll('.star-rating i').forEach(s => { s.classList.remove('active'); s.textContent = 'star_border'; });
        refreshActiveSection();
    })
    .catch(() => showError('mentor-modal', 'Ошибка сохранения сессии.'));
}

function initCompareModal() {
    document.getElementById('compare-btn')?.addEventListener('click', () => {
        document.getElementById('compare-modal').style.display = 'flex';
        loadComparePlayers();
    });

    const selects = ['compare-player1-select', 'compare-player2-select'];
    selects.forEach(id => document.getElementById(id)?.addEventListener('change', runComparison));
}

async function loadComparePlayers() {
    const select1 = document.getElementById('compare-player1-select');
    const select2 = document.getElementById('compare-player2-select');
    try {
        const response = await fetch('/api/players');
        const data = await response.json();
        let options = '<option value="" disabled selected>Выберите игрока</option>';
        data.players.forEach(p => options += `<option value="${p.id}">${p.nickname}</option>`);
        select1.innerHTML = options;
        select2.innerHTML = options;
        select1.value = currentPlayerId;
    } catch {
        showError('compare-modal', 'Ошибка загрузки игроков для сравнения');
    }
}

async function runComparison() {
    const p1_id = document.getElementById('compare-player1-select').value;
    const p2_id = document.getElementById('compare-player2-select').value;
    const resultsContainer = document.getElementById('compare-results');
    
    if (!p1_id || !p2_id || p1_id === p2_id) {
        resultsContainer.innerHTML = '';
        return;
    }

    resultsContainer.innerHTML = '<p>Загрузка данных для сравнения...</p>';
    try {
        const res = await fetch(`/api/statistics/full-comparison?p1=${p1_id}&p2=${p2_id}`);
        if (!res.ok) throw new Error('Ошибка сети или сервера');
        const data = await res.json();
        
        resultsContainer.innerHTML = `
            <div class="chart-container"><div class="chart-header"><h3 class="chart-title">Сравнение тренда оценок</h3></div><canvas id="compare-trend-chart"></canvas></div>
            <div class="chart-container"><div class="chart-header"><h3 class="chart-title">Сравнение по ролям</h3></div><canvas id="compare-roles-chart"></canvas></div>
            <div class="chart-container"><div class="chart-header"><h3 class="chart-title">Сравнение по ошибкам</h3></div><canvas id="compare-errors-chart"></canvas></div>
        `;
        
        createCompareTrendChart(data, p1_id, p2_id);
        createCompareRolesChart(data, p1_id, p2_id);
        createCompareErrorsChart(data, p1_id, p2_id);
    } catch {
        showError('compare-modal', 'Не удалось сравнить игроков.');
    }
}

function createCompareTrendChart(data, p1_id, p2_id) {
    const canvasId = 'compare-trend-chart';
    const p1_data = data[p1_id].trend, p2_data = data[p2_id].trend;
    const p1_name = document.querySelector(`#compare-player1-select option[value='${p1_id}']`).textContent;
    const p2_name = document.querySelector(`#compare-player2-select option[value='${p2_id}']`).textContent;
    
    const allWeeks = [...new Set([...p1_data.weeks, ...p2_data.weeks])].sort();
    const p1_scores = allWeeks.map(week => p1_data.scores[p1_data.weeks.indexOf(week)] || null);
    const p2_scores = allWeeks.map(week => p2_data.scores[p2_data.weeks.indexOf(week)] || null);

    const ctx = prepareChartContainer(canvasId);
    charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: allWeeks,
            datasets: [
                { label: p1_name, data: p1_scores, borderColor: chartColors.primary, backgroundColor: chartColors.transparentPrimary, tension: 0.3 },
                { label: p2_name, data: p2_scores, borderColor: chartColors.secondary, backgroundColor: chartColors.transparentSecondary, tension: 0.3 }
            ]
        },
        options: { responsive: true, scales: {y: {min: 0, max: 10}}}
    });
}

function createCompareRolesChart(data, p1_id, p2_id) {
    const canvasId = 'compare-roles-chart';
    const p1_data = data[p1_id].roles, p2_data = data[p2_id].roles;
    const p1_name = document.querySelector(`#compare-player1-select option[value='${p1_id}']`).textContent;
    const p2_name = document.querySelector(`#compare-player2-select option[value='${p2_id}']`).textContent;

    const allRoles = [...new Set([...p1_data.roles, ...p2_data.roles])];
    const p1_scores = allRoles.map(role => p1_data.scores[p1_data.roles.indexOf(role)] || 0);
    const p2_scores = allRoles.map(role => p2_data.scores[p2_data.roles.indexOf(role)] || 0);

    const ctx = prepareChartContainer(canvasId);
    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: allRoles,
            datasets: [
                { label: p1_name, data: p1_scores, backgroundColor: chartColors.primary },
                { label: p2_name, data: p2_scores, backgroundColor: chartColors.secondary }
            ]
        },
        options: { responsive: true, scales: {y: {min: 0, max: 10}}}
    });
}

function createCompareErrorsChart(data, p1_id, p2_id) {
    const canvasId = 'compare-errors-chart';
    const p1_data = data[p1_id].errors, p2_data = data[p2_id].errors;
    const p1_name = document.querySelector(`#compare-player1-select option[value='${p1_id}']`).textContent;
    const p2_name = document.querySelector(`#compare-player2-select option[value='${p2_id}']`).textContent;

    const allErrors = [...new Set([...Object.keys(p1_data), ...Object.keys(p2_data)])];
    const p1_counts = allErrors.map(err => p1_data[err] || 0);
    const p2_counts = allErrors.map(err => p2_data[err] || 0);

    const ctx = prepareChartContainer(canvasId);
    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: allErrors,
            datasets: [
                { label: p1_name, data: p1_counts, backgroundColor: chartColors.primary },
                { label: p2_name, data: p2_counts, backgroundColor: chartColors.secondary }
            ]
        },
        options: { responsive: true }
    });
}

function logout() {
    fetch('/api/auth/logout', { method: 'POST' }).finally(() => window.location.href = '/login.html');
}

function showError(containerId, message) {
    const container = document.getElementById(containerId) || document.body;
    let messageContainer = container;
    if (container.classList.contains('modal')) {
        messageContainer = container.querySelector('.modal-content') || container;
    }
    const existingError = messageContainer.querySelector('.error-message');
    if (existingError) {
        existingError.textContent = message; // Обновляем текст существующего сообщения
        return;
    }
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    messageContainer.insertBefore(errorElement, messageContainer.firstChild);
    setTimeout(() => { errorElement.remove(); }, 5000);
}

function showSuccess(containerId, message) {
    const container = document.getElementById(containerId) || document.body;
    let messageContainer = container;
    if (container.classList.contains('modal')) {
        messageContainer = container.querySelector('.modal-content') || container;
    }
    if (messageContainer.querySelector('.success-message')) return;
    const successElement = document.createElement('div');
    successElement.className = 'success-message';
    successElement.textContent = message;
    messageContainer.insertBefore(successElement, messageContainer.firstChild);
    setTimeout(() => { successElement.remove(); }, 3000);
}

function loadMyStudents() {
    const container = document.getElementById('my-students-list-container');
    container.innerHTML = '<p>Загрузка учеников...</p>';

    fetch('/api/mentors/students')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success' && data.students.length > 0) {
                renderPlayerTable(container, data.students, null); // Используем существующую функцию рендера таблицы
            } else {
                container.innerHTML = '<p class="placeholder" style="position: static; height: auto;">У вас нет назначенных учеников.</p>';
            }
        });
}

/**
 * Отправляет запрос на назначение ученика.
 * @param {string} studentId - ID игрока, которого нужно назначить.
 */
function assignStudentToMentor(studentId) {
    fetch(`/api/mentors/students/${studentId}`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                showSuccess('management-content', 'Игрок назначен вашим учеником!');
                loadPlayerDetailsForMentor(studentId); // Обновляем информацию об игроке
                checkAndShowMyStudentsTab(); // Обновляем видимость вкладки "Мои ученики"
            } else {
                showError('management-content', 'Не удалось назначить ученика.');
            }
        });
}
