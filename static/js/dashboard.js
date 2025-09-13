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
let goalMetrics = {};
let currentDatePeriod = '7';
let cropper = null;
let currentGoalsData = null; // Хранилище для данных о целях

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
        .then(response => {
            if (response.ok) {
                return response.json();
            }
            return Promise.reject(response);
        })
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
                throw new Error(playerData.message || 'Ошибка обработки данных игрока');
            }
        })
        .catch(error => {
            console.error('Ошибка загрузки данных игрока:', error);
            if (error instanceof Response) {
                if (error.status === 404 || error.status === 401) {
                    window.location.href = '/login.html';
                    return; 
                }
            }
            showError('player-dashboard', 'Критическая ошибка загрузки данных. Попробуйте обновить страницу или войти заново.');
        });
}
function initNavigation() {
    document.querySelectorAll('.close-modal, .close-modal-btn').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
            document.body.classList.remove('modal-open');
        });
    });
    document.querySelector('.help-btn')?.addEventListener('click', function() {
        document.getElementById('help-modal').style.display = 'flex';
        document.body.classList.add('modal-open');
    });
    document.querySelector('.refresh-btn')?.addEventListener('click', refreshActiveSection);
    document.querySelector('.member-btn')?.addEventListener('click', requestMentorHelp);
    document.querySelector('.mentor-view-btn')?.addEventListener('click', loadAndShowReviewRequestsModal);
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            const textElement = item.querySelector('span');
            if (!textElement) return;
            const text = textElement.textContent.trim();
             // Закрыть мобильное меню при клике на пункт
            const sidebar = document.querySelector('.sidebar');
            if (sidebar && sidebar.classList.contains('active')) {
                closeMobileMenu();
            }
            if (text === 'Оценить игрока') {
                if (currentPlayerData && ['наставник', 'mentor', 'founder'].includes(currentPlayerData.status)) {
                    document.getElementById('mentor-modal').style.display = 'flex';
                    document.body.classList.add('modal-open');
                    loadMentorForm();
                }
                return;
            }
            if (text === 'Выйти') {
                logout();
                return;
            }
            if (text === 'Запросы на разбор') {
                 if (['mentor', 'founder'].includes(currentPlayerData?.status)) {
                    loadAndShowReviewRequestsModal();
                 }
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
                case 'Мои ученики':
                    document.getElementById('my-students-content').style.display = 'block';
                    loadMyStudents();
                    break;
                case 'Гильдия':
                    document.getElementById('guild-content').style.display = 'block';
                    loadGuildData();
                    break;
                case 'Управление':
                    document.getElementById('management-content').style.display = 'block';
                    loadManagementPanel();
                    break;
                case 'Прогресс':
                    document.getElementById('progress-content').style.display = 'block';
                    loadGoals();
                    break;
                case 'Настройки':
                    document.getElementById('settings-content').style.display = 'block';
                    loadSettings();
                    break;
            }
        });
    });
}
function checkAndShowMyStudentsTab() {
    if (!['наставник', 'mentor', 'founder'].includes(currentPlayerData?.status)) return;
    const myStudentsBtn = document.querySelector('.my-students-btn');
    if (!myStudentsBtn) return;
    fetch('/api/mentors/my-students')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success' && data.students.length > 0) {
                myStudentsBtn.style.display = 'flex';
            } else {
                myStudentsBtn.style.display = 'none';
            }
        });
}
function initDashboard() {
    initViewToggle();
    initDateFilter();
    initThemeSwitcher();
    initMentorForm();
    initCompareModal();
    initAvatarCropper();
    initGoalModal(); 
    updateSidebarInfo();
    const isMentorOrFounder = ['mentor', 'founder'].includes(currentPlayerData?.status);
    document.querySelectorAll('.mentor-btn').forEach(btn => {
        btn.style.display = isMentorOrFounder ? 'flex' : 'none';
    });
    document.querySelector('.nav-item').classList.add('active');
    document.querySelector('.view-toggle').style.display = 'flex';
    const userStatus = currentPlayerData?.status;
    const isPrivileged = ['наставник', 'mentor', 'founder'].includes(userStatus);
    const isTopLevel = ['mentor', 'founder'].includes(userStatus);

    const mentorBtn = document.querySelector('.mentor-btn');
    if (mentorBtn) {
        mentorBtn.style.display = isPrivileged ? 'flex' : 'none';
    }
    const managementBtn = document.querySelector('.management-btn');
    if (managementBtn) {
        managementBtn.style.display = isTopLevel ? 'flex' : 'none';
    }
    const memberBtn = document.querySelector('.member-btn');
    if(memberBtn){
        memberBtn.style.display = (currentPlayerData?.status !== 'pending') ? 'flex' : 'none';
    }
    const mentorViewBtn = document.querySelector('.mentor-view-btn');
    if (mentorViewBtn) {
        mentorViewBtn.style.display = isTopLevel ? 'flex' : 'none';
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
    menuToggleClose?.addEventListener('click', closeMobileMenu);
    overlay?.addEventListener('click', closeMobileMenu);
}
function closeMobileMenu() {
    document.querySelector('.sidebar')?.classList.remove('active');
    document.getElementById('sidebar-overlay')?.classList.remove('active');
};
function initCollapsibleSections() {
    // Используем делегирование событий для всех сворачиваемых секций
    document.querySelector('.main-content').addEventListener('click', function(e) {
        const header = e.target.closest('.section-header');
        // Проверяем, был ли клик внутри заголовка сворачиваемой секции
        if (header && header.parentElement.classList.contains('collapsible')) {
            // Это условие позволяет кликать в любом месте заголовка для сворачивания,
            // но предотвращает срабатывание, если внутри заголовка есть другие интерактивные элементы (кнопки, ссылки).
            const nonToggleButton = e.target.closest('a, button:not(.toggle-collapse-btn), input, select');
            
            if (!nonToggleButton) {
                 header.parentElement.classList.toggle('collapsed');
            }
        }
    });
}
function refreshActiveSection() {
    const activeSection = document.querySelector('.dashboard-section[style*="block"]');
    if (!activeSection) {
        document.getElementById('player-dashboard').style.display = 'block';
        loadPlayerDataAndCharts();
        return;
    };
    switch (activeSection.id) {
        case 'player-dashboard': loadPlayerDataAndCharts(); break;
        case 'general-dashboard': loadGeneralData(); break;
        case 'profile-content': loadProfile(); break;
        case 'guild-content': loadGuildData(); break;
        case 'management-content': loadManagementPanel(); break;
        case 'my-students-content': loadMyStudents(); break;
        case 'progress-content': loadGoals(); break;
        case 'settings-content': loadSettings(); break;
    }
    loadSystemStatus();
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
        'pending': 'Ожидает',
        'наставник': 'Наставник'
    };
    return statuses[status] || status;
}
async function loadPlayerDataAndCharts() {
    if (!currentPlayerId) {
        console.log("loadPlayerDataAndCharts skipped: currentPlayerId is null.");
        return;
    }
    skeletonHandler.show(['avg-score', 'session-count', 'comparison', 'last-update-player', 'goals']);
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
        for (const res of responses) {
            if (!res.ok) {
                throw new Error(`Ошибка сети: ${res.status} ${res.statusText} для ${res.url}`);
            }
        }
        const [stats, comparison, trend, roleScores, contentScores, errorTypes, errorDistribution, errorScore] = await Promise.all(
            responses.map(res => res.json())
        );
        skeletonHandler.hide('avg-score', (stats.avgScore || 0).toFixed(2));
        skeletonHandler.hide('session-count', stats.sessionCount || 0);
        skeletonHandler.hide('last-update-player', stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleDateString() : '-');
        const comparisonValue = ((comparison.playerScore / (comparison.bestPlayerScore || 1)) * 100);
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
    const container = canvas ? canvas.parentElement : document.body; 
    if (!container) return null;
    if (charts[canvasId]) {
        charts[canvasId].destroy();
        delete charts[canvasId];
    }
    let chartHeader = container.querySelector('.chart-header');
    container.innerHTML = ''; 
    if (chartHeader) {
        container.appendChild(chartHeader);
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

// --- GOAL MANAGEMENT (REWRITTEN AND FIXED) ---

let contentCache = null;

/**
 * Loads goal data from the server and initiates rendering.
 * This is the main function for the "Progress" tab.
 */
function loadGoals() {
    const isManager = ['mentor', 'founder', 'наставник'].includes(currentPlayerData?.status);
    const selectionContainer = document.getElementById('player-selection-container');
    const displayContainer = document.getElementById('goals-display-container');

    selectionContainer.style.display = 'none';
    displayContainer.style.display = 'none';
    
    fetch('/api/goals/view')
        .then(response => response.ok ? response.json() : response.json().then(err => Promise.reject(err)))
        .then(result => {
            if (result.status !== 'success') throw new Error(result.message);
            
            currentGoalsData = result.data; 

            if (isManager && currentGoalsData.student_goals) {
                selectionContainer.style.display = 'block';
                renderPlayerSelection(currentGoalsData.student_goals);
            } else {
                displayContainer.style.display = 'block';
                renderPlayerGoals(currentPlayerId, 'Мой прогресс');
            }
        })
        .catch(error => {
            console.error('Ошибка загрузки целей:', error);
            showError('progress-content', `Не удалось загрузить цели: ${error.message || 'Попробуйте обновить страницу.'}`);
        });
}


/**
 * Renders the player selection grid (own goals + students) for mentors.
 * @param {Array} players - Array of student objects.
 */
function renderPlayerSelection(players) {
    const grid = document.getElementById('progress-player-grid');
    grid.innerHTML = '';

    const myGoalsCard = createPlayerCard({
        id: currentPlayerId,
        nickname: 'Мои цели',
        avatar_url: currentPlayerData.avatar_url
    }, currentGoalsData.my_goals);
    grid.appendChild(myGoalsCard);

    if (players && players.length > 0) {
        players.forEach(player => {
            const playerCard = createPlayerCard(player, player.goals);
            grid.appendChild(playerCard);
        });
    }
}

/**
 * Creates an HTML element for a player card on the selection screen.
 * @param {Object} player - Player data object.
 * @param {Array} goals - Array of the player's goals.
 * @returns {HTMLElement} The complete player card HTML element.
 */
function createPlayerCard(player, goals) {
    const card = document.createElement('div');
    card.className = 'player-card-goal';
    card.dataset.playerId = player.id;
    card.dataset.playerName = player.nickname;

    const activeGoals = goals ? goals.filter(g => g.status === 'in_progress') : [];
    const avgProgress = activeGoals.length > 0
        ? activeGoals.reduce((sum, g) => sum + (g.progress || 0), 0) / activeGoals.length
        : 0;

    const avatarContent = player.avatar_url
        ? `<img src="${player.avatar_url}" alt="Аватар" class="player-card-avatar">`
        : `<div class="player-card-avatar-fallback">${player.nickname.charAt(0).toUpperCase()}</div>`;
    
    card.innerHTML = `
        <div class="player-card-header">
            ${avatarContent}
            <div class="player-card-name">
               <h3>${player.nickname}</h3>
                <p>
                    <i class="material-icons">task_alt</i>
                    <span>${activeGoals.length} активных / ${goals ? goals.length : 0} всего</span>
                </p>
            </div>
             <div class="player-card-progress" style="--progress: ${avgProgress.toFixed(0)}">
                <span>${avgProgress.toFixed(0)}%</span>
            </div>
        </div>
    `;

    card.addEventListener('click', () => {
        renderPlayerGoals(player.id, player.nickname);
        document.getElementById('player-selection-container').style.display = 'none';
        document.getElementById('goals-display-container').style.display = 'block';
    });
    return card;
}

/**
 * Renders the list of goals for a selected player.
 * @param {number} playerId - The player's ID.
 * @param {string} playerName - The player's name.
 */
function renderPlayerGoals(playerId, playerName, playerGuild) {
    const isMyGoals = (String(playerId) === String(currentPlayerId));
    let goals;

    if (isMyGoals) {
        goals = currentGoalsData.my_goals || [];
        // <<< ИЗМЕНЕНИЕ: Добавляем гильдию в заголовок
        document.getElementById('goals-header-title').textContent = `Прогресс: ${playerName} (${currentPlayerData.guild})`;
    } else {
        const student = currentGoalsData.student_goals.find(p => p.id == playerId);
        goals = student ? student.goals : [];
        // <<< ИЗМЕНЕНИЕ: Добавляем гильдию в заголовок
        const guildText = playerGuild ? ` (${playerGuild})` : '';
        document.getElementById('goals-header-title').textContent = `Прогресс: ${playerName}${guildText}`;
    }
    
    const activeGrid = document.getElementById('active-goals-grid');
    const completedGrid = document.getElementById('completed-goals-grid');
    const createBtn = document.getElementById('create-goal-btn');
    const backBtn = document.getElementById('back-to-selection-btn');
    const isManager = ['mentor', 'founder', 'наставник'].includes(currentPlayerData?.status);

    activeGrid.innerHTML = '';
    completedGrid.innerHTML = '';
    
    const activeGoals = goals.filter(g => g.status !== 'completed' && (g.progress < 100 || g.metric === null));
    const completedGoals = goals.filter(g => g.status === 'completed' || g.progress >= 100);

    activeGoals.forEach(goal => activeGrid.appendChild(createGoalCard(goal, playerId, playerName)));
    completedGoals.forEach(goal => completedGrid.appendChild(createGoalCard(goal, playerId, playerName)));

    if (activeGoals.length === 0) activeGrid.innerHTML = '<p class="placeholder">Нет активных целей.</p>';
    if (completedGoals.length === 0) completedGrid.innerHTML = '<p class="placeholder">Нет завершенных целей.</p>';
    
    document.getElementById('completed-goals-count').textContent = `(${completedGoals.length})`;
    const completedSection = document.querySelector('.completed-goals-section');
    if (completedGoals.length > 0) {
        completedSection.style.display = 'block';
    } else {
        completedSection.style.display = 'none';
    }


    createBtn.style.display = isManager ? 'flex' : 'none';
    backBtn.style.display = isManager ? 'flex' : 'none';
    
    createBtn.onclick = () => openGoalModal(null, {id: playerId, nickname: playerName});
}

/**
 * Creates an HTML element for a goal card with an improved design.
 * @param {Object} goal - Goal data.
 * @param {number} ownerId - ID of the goal's owner.
 * @param {string} ownerName - Name of the goal's owner.
 * @returns {HTMLElement} The goal card HTML element.
 */
function createGoalCard(goal, ownerId, ownerName) {
    const card = document.createElement('div');
    const progress = goal.progress || 0;
    const isCompleted = progress >= 100;
    
    card.className = 'goal-card';
    if (isCompleted) {
        card.classList.add('status-completed');
    }
    if (goal.metric) {
        card.classList.add('has-metric');
    }

    const canEdit = ['mentor', 'founder', 'наставник'].includes(currentPlayerData?.status);

    let metricDetails = '';
    if (goal.metric) {
        const metricName = goal.metric === 'avg_score' ? 'Ср. балл' : 'Кол-во сессий';
        let contentName = '';
        if (goal.metric_content_id && contentCache) {
            const content = contentCache.find(c => c.id === goal.metric_content_id);
            if (content) contentName = ` по "${content.name}"`;
        }
        let roleName = goal.metric_role ? ` на роли ${goal.metric_role}` : '';
        metricDetails = `
            <div class="goal-meta-item">
                <i class="material-icons">track_changes</i>
                <span>${metricName} > ${goal.metric_target}${contentName}${roleName}</span>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="goal-card-header">
            <h3 class="goal-title">${goal.title}</h3>
            ${canEdit ? `<button class="btn-icon edit-goal-btn" title="Редактировать цель"><i class="material-icons">edit</i></button>` : ''}
        </div>
        <p class="goal-description">${goal.description || 'Нет описания.'}</p>
        
        <div class="goal-progress-container">
            <div class="goal-progress-bar">
                <div class="goal-progress-value" style="width: ${progress}%;"></div>
            </div>
            <span class="goal-progress-percentage">${progress.toFixed(0)}%</span>
        </div>
        
        <div class="goal-meta">
            ${metricDetails}
            <div class="goal-meta-item">
                <i class="material-icons">event</i>
                <span>До: ${goal.due_date ? new Date(goal.due_date).toLocaleDateString() : 'бессрочно'}</span>
            </div>
            <div class="goal-meta-item">
                <i class="material-icons">person</i>
                <span>Выдал: ${goal.created_by_name || 'Система'}</span>
            </div>
        </div>
    `;

    if (canEdit) {
        card.querySelector('.edit-goal-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openGoalModal(goal, { id: ownerId, nickname: ownerName });
        });
    }
    return card;
}


/**
 * Initializes the goal modal (event handlers).
 */
function initGoalModal() {
    const goalForm = document.getElementById('goal-form');
    goalForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveGoal();
    });

    document.getElementById('delete-goal-btn')?.addEventListener('click', () => {
        const goalId = document.getElementById('goal-id').value;
        if (goalId) deleteGoal(goalId);
    });
    
    document.getElementById('back-to-selection-btn')?.addEventListener('click', () => {
        document.getElementById('player-selection-container').style.display = 'block';
        document.getElementById('goals-display-container').style.display = 'none';
    });
    
    document.getElementById('goal-metric-select')?.addEventListener('change', (e) => {
        const container = document.getElementById('metric-conditions-container');
        container.style.display = e.target.value ? 'block' : 'none';
    });
}

/**
 * Asynchronously loads and caches the content list.
 */
async function loadContentForGoals() {
    if (contentCache) {
        return Promise.resolve(contentCache);
    }
    try {
        const response = await fetch('/api/content');
        const data = await response.json();
        if (data.status === 'success') {
            contentCache = data.content;
            return contentCache;
        }
        return [];
    } catch (error) {
        console.error("Failed to load content for goals:", error);
        return [];
    }
}

/**
 * Opens and populates the modal for creating/editing a goal.
 * @param {Object|null} goal - The goal object for editing, or null for creation.
 * @param {Object} player - The player object.
 */
async function openGoalModal(goal = null, player) {
    const modal = document.getElementById('goal-modal');
    const form = document.getElementById('goal-form');
    form.reset();

    const modalTitle = document.getElementById('goal-modal-title');
    const deleteBtn = document.getElementById('delete-goal-btn');
    const metricsGroup = document.getElementById('goal-metrics-group');
    const conditionsContainer = document.getElementById('metric-conditions-container');
    const contentSelect = document.getElementById('goal-metric-content');
    
    contentSelect.innerHTML = '<option value="">Любой контент</option>';
    const contents = await loadContentForGoals();
    contents.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.name;
        contentSelect.appendChild(option);
    });

    document.getElementById('goal-player-id').value = player.id;

    if (goal) { // Editing
        modalTitle.textContent = `Редактировать цель: ${player.nickname}`;
        deleteBtn.style.display = 'inline-flex';
        metricsGroup.style.display = 'none';

        document.getElementById('goal-id').value = goal.id;
        document.getElementById('goal-title').value = goal.title;
        document.getElementById('goal-description').value = goal.description || '';
        document.getElementById('goal-due-date').value = goal.due_date ? goal.due_date.split(' ')[0] : '';
    } else { // Creating
        modalTitle.textContent = `Новая цель для: ${player.nickname}`;
        deleteBtn.style.display = 'none';
        metricsGroup.style.display = 'block';
        conditionsContainer.style.display = 'none';
        document.getElementById('goal-id').value = '';
    }
    
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
}

/**
 * Sends form data to the server to save a goal.
 */
function saveGoal() {
    const goalId = document.getElementById('goal-id').value;
    const isEditing = !!goalId;
    
    const data = {
        title: document.getElementById('goal-title').value,
        description: document.getElementById('goal-description').value,
        dueDate: document.getElementById('goal-due-date').value,
        playerId: document.getElementById('goal-player-id').value,
    };
    
    let url, method;

    if (isEditing) {
        url = `/api/goals/${goalId}`;
        method = 'PUT';
    } else {
        url = '/api/goals';
        method = 'POST';
        data.metric = document.getElementById('goal-metric-select').value;
        if (data.metric) {
            data.targetValue = document.getElementById('goal-metric-target').value;
            data.contentId = document.getElementById('goal-metric-content').value;
            data.role = document.getElementById('goal-metric-role').value;

            if (!data.targetValue) {
                showError('goal-modal', 'Укажите целевое значение для метрики.');
                return;
            }
        }
    }
    
    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        if (result.status === 'success') {
            document.getElementById('goal-modal').style.display = 'none';
            document.body.classList.remove('modal-open');
            showSuccess('progress-content', `Цель успешно ${isEditing ? 'обновлена' : 'создана'}.`);
            loadGoals();
        } else {
            showError('goal-modal', result.message || 'Произошла ошибка.');
        }
    })
    .catch(() => showError('goal-modal', 'Сетевая ошибка. Не удалось сохранить цель.'));
}

/**
 * Sends a request to delete a goal.
 * @param {number} goalId - The goal's ID.
 */
function deleteGoal(goalId) {
    if (!confirm('Вы уверены, что хотите удалить эту цель? Это действие необратимо.')) {
        return;
    }
    
    fetch(`/api/goals/${goalId}`, { method: 'DELETE' })
    .then(response => response.json())
    .then(result => {
        if (result.status === 'success') {
            document.getElementById('goal-modal').style.display = 'none';
            document.body.classList.remove('modal-open');
            showSuccess('progress-content', 'Цель успешно удалена.');
            loadGoals();
        } else {
            showError('goal-modal', result.message || 'Не удалось удалить цель.');
        }
    })
    .catch(() => showError('goal-modal', 'Сетевая ошибка. Не удалось удалить цель.'));
}

// --- END GOAL MANAGEMENT ---

function loadProfile() {
    skeletonHandler.show(['profile-nickname', 'profile-guild', 'profile-status', 'profile-balance', 'reg-date', 'mentor-name']);
    fetch(`/api/players/current`).then(r => r.json()).then(data => {
        if (data.status === 'success') {
            const player = data.player;
            document.querySelector('.profile-nickname').textContent = player.nickname || '-';
            document.querySelector('.profile-guild').textContent = `Гильдия: ${player.guild || '-'}`;
            document.querySelector('.profile-status').textContent = formatPlayerStatus(player.status) || '-';
            document.querySelector('.profile-balance').textContent = `Баланс: ${player.balance || 0}`;
            document.querySelector('#mentor-name').textContent = player.mentor_name || 'Не назначен';
            document.querySelector('#reg-date').textContent = new Date(player.created_at).toLocaleDateString();
            document.getElementById('profile-description').value = player.description || '';
            const specBlock = document.getElementById('specialization-block');
            const isMentorFigure = ['mentor', 'founder', 'наставник'].includes(player.status);
            specBlock.style.display = isMentorFigure ? 'block' : 'none';
            if (isMentorFigure) document.getElementById('specialization-select').value = player.specialization || '';
            updateAvatarDisplay(player);
        }
    }).catch(() => showError('profile-content', 'Ошибка загрузки профиля'));
    document.querySelector('.export-btn')?.addEventListener('click', () => { window.location.href = `/api/players/${currentPlayerId}/export`; });
    document.getElementById('save-profile-btn')?.addEventListener('click', saveProfile);
}
function saveProfile() {
    const description = document.getElementById('profile-description').value;
    const specSelect = document.getElementById('specialization-select');
    const specialization = specSelect.closest('#specialization-block').style.display === 'block' ? specSelect.value : currentPlayerData.specialization;
    fetch('/api/players/current/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, specialization })
    }).then(r => r.ok ? r.json() : Promise.reject(r.json())).then(data => {
        if (data.status === 'success') {
            showSuccess('profile-content', 'Профиль обновлен!');
            currentPlayerData.description = description;
            currentPlayerData.specialization = specialization;
        } else throw new Error(data.message);
    }).catch(errPromise => errPromise.then(err => showError('profile-content', err.message || 'Не удалось сохранить.')));
}

function loadMyStudents() {
    const container = document.getElementById('my-students-list');
    container.innerHTML = '<p>Загрузка учеников...</p>';
    fetch('/api/mentors/my-students')
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'success') {
                renderMyStudents(data.students);
            } else {
                throw new Error(data.message || 'Не удалось загрузить список учеников');
            }
        })
        .catch(() => {
            container.innerHTML = '<p class="error-message">Ошибка загрузки учеников.</p>';
        });
}

// <<< ПРОВЕРКА: Убедитесь, что эта функция полностью заменена
function renderMyStudents(students) {
    const container = document.getElementById('my-students-list');
    container.innerHTML = '';
    if (students.length === 0) {
        container.innerHTML = '<p class="placeholder" style="position: static; height: auto;">У вас пока нет учеников.</p>';
        return;
    }
    students.forEach(student => {
        const card = document.createElement('div');
        card.className = 'student-card'; 
        
        const avatarContent = student.avatar_url
            ? `<img src="${student.avatar_url}?t=${new Date().getTime()}" alt="Аватар" class="student-avatar-img">`
            : `<div class="student-avatar-fallback">${student.nickname.charAt(0).toUpperCase()}</div>`;
        
        const guildInfo = student.guild_name ? `<p class="student-guild">${student.guild_name}</p>` : '';

        card.innerHTML = `
            <div class="student-card-header">
                <div class="student-avatar">
                    ${avatarContent}
                </div>
                <div class="student-info">
                    <h3 class="student-name">${student.nickname}</h3>
                    <p class="student-status">Ученик</p>
                    ${guildInfo}
                </div>
            </div>
            <div class="student-meta">
                <div class="student-meta-item">
                    <div class="label">Средний балл</div>
                    <div class="value">${(student.avg_score || 0).toFixed(2)}</div>
                </div>
                <div class="student-meta-item">
                    <div class="label">Сессий</div>
                    <div class="value">${student.session_count || 0}</div>
                </div>
            </div>
            <div class="student-card-actions">
                <button class="btn btn-primary sessions-btn" data-id="${student.id}" data-name="${student.nickname}">Сессии</button>
                <button class="btn btn-secondary remove-student-btn" data-id="${student.id}" data-name="${student.nickname}">Открепить</button>
            </div>
        `;
        container.appendChild(card);
    });
    container.querySelectorAll('.sessions-btn').forEach(btn => { 
        btn.addEventListener('click', (e) => {
            const { id, name } = e.currentTarget.dataset;
            showRecentSessionsModal(id, name);
        });
     });
    container.querySelectorAll('.remove-student-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const { id, name } = e.currentTarget.dataset;
            if (confirm(`Вы уверены, что хотите открепить ученика ${name}?`)) {
                removeStudent(id);
            }
        });
    });
}


function removeStudent(studentId) {
    fetch(`/api/mentors/students/${studentId}/remove`, { method: 'POST' })
        .then(res => res.ok ? res.json() : Promise.reject(res.json()))
        .then(data => {
            if (data.status === 'success') {
                showSuccess('my-students-content', data.message || 'Ученик успешно откреплен.');
                loadMyStudents(); 
                checkAndShowMyStudentsTab(); 
            } else {
                throw new Error(data.message);
            }
        })
        .catch(errPromise => {
            errPromise.then(err => {
                showError('my-students-content', err.message || 'Не удалось открепить ученика.');
            });
        });
}
function showRecentSessionsModal(playerId, playerName) {
    const modal = document.getElementById('sessions-modal');
    const title = document.getElementById('sessions-modal-title');
    const body = document.getElementById('sessions-modal-body');
    title.textContent = `Последние сессии: ${playerName}`;
    body.innerHTML = '<p>Загрузка...</p>';
    modal.style.display = 'flex';
    fetch(`/api/players/${playerId}/sessions`)
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'success' && data.sessions.length > 0) {
                body.innerHTML = `
                    <table class="players-table">
                        <thead>
                            <tr><th>Дата</th><th>Контент</th><th>Роль</th><th>Балл</th><th>Ошибки</th></tr>
                        </thead>
                        <tbody>
                            ${data.sessions.map(s => `
                                <tr>
                                    <td data-label="Дата">${new Date(s.session_date).toLocaleString()}</td>
                                    <td data-label="Контент">${s.content_name}</td>
                                    <td data-label="Роль">${s.role}</td>
                                    <td data-label="Балл">${s.score}</td>
                                    <td data-label="Ошибки">${s.error_types || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            } else {
                 body.innerHTML = '<p class="placeholder" style="position: static; height: auto;">Нет данных о сессиях.</p>';
            }
        })
        .catch(() => {
            body.innerHTML = '<p class="error-message">Не удалось загрузить сессии.</p>';
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
                rankMessageEl.textContent = `Ваш ранг в альянсе: #${playerIndex + 1} из ${allPlayers.players.length}`;
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

function loadManagementPanel() {
    const pendingContainer = document.getElementById('pending-players-container');
    pendingContainer.style.display = 'none';
    loadManageablePlayers();
    if (currentPlayerData.status === 'founder') {
        pendingContainer.style.display = 'block';
        loadPendingPlayersList();
    }
    const assignBtn = document.getElementById('show-assign-mentor-modal-btn');
    if (assignBtn) {
        assignBtn.style.display = 'flex';
        assignBtn.replaceWith(assignBtn.cloneNode(true));
        document.getElementById('show-assign-mentor-modal-btn').addEventListener('click', loadAndShowAssignmentModal);
    }
}
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
                    countEl.style.display = data.players.length > 0 ? 'inline-flex' : 'none'; 
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
                container.querySelectorAll('.approve-btn').forEach(btn => btn.addEventListener('click', e => handlePlayerAction(e.target.dataset.id, 'approve')));
                container.querySelectorAll('.deny-btn').forEach(btn => btn.addEventListener('click', e => handlePlayerAction(e.target.dataset.id, 'deny')));
            } else {
                throw new Error(data.message);
            }
        })
        .catch(() => container.innerHTML = '<p class="error-message">Ошибка загрузки заявок.</p>');
}
function handlePlayerAction(playerId, action) {
    fetch(`/api/players/${playerId}/${action}`, { method: 'POST' })
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'success') {
                showSuccess('management-content', `Игрок успешно ${action === 'approve' ? 'одобрен' : 'отклонен'}.`);
                loadPendingPlayersList(); 
                if(action === 'approve') loadManageablePlayers(); 
            } else { throw new Error(data.message); }
        })
        .catch(() => showError('management-content', `Не удалось ${action === 'approve' ? 'одобрить' : 'отклонить'} игрока.`));
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

    const tableBody = container.querySelector('tbody');
    if (!tableBody) { // Если таблицы нет, возможно, был пустой ответ, создадим её
        container.innerHTML = `
            <table class="players-table">
                <thead>
                    <tr>
                        <th>Игрок</th>
                        <th>Статус</th>
                        <th>Гильдия</th>
                        <th>Дата регистрации</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                </tbody>
            </table>
        `;
    }
    
    // <<< ИСПРАВЛЕНИЕ: Логика для пустого списка теперь не ломает структуру
    if (players.length === 0) {
        const table = container.querySelector('table');
        if (table) table.style.display = 'none'; // Скрываем таблицу
        
        let placeholder = container.querySelector('.placeholder');
        if (!placeholder) {
            placeholder = document.createElement('p');
            placeholder.className = 'placeholder';
            placeholder.style.position = 'static';
            placeholder.style.height = 'auto';
            container.appendChild(placeholder);
        }
        placeholder.textContent = 'Нет игроков для управления.';
        
        return;
    } else {
        const table = container.querySelector('table');
        if (table) table.style.display = '';
        const placeholder = container.querySelector('.placeholder');
        if (placeholder) placeholder.remove();
    }


    const isFounder = currentPlayerData.status === 'founder';
    
    const finalTableBody = container.querySelector('tbody');
    
    finalTableBody.innerHTML = players.map(player => `
        <tr>
            <td data-label="Игрок">${player.nickname}</td>
            <td data-label="Статус">${formatPlayerStatus(player.status)}</td>
            <td data-label="Гильдия">${player.guild_name || 'N/A'}</td>
            <td data-label="Дата регистрации">${new Date(player.created_at).toLocaleDateString()}</td>
            <td data-label="Действия">
                ${isFounder ? 
                    (player.status === 'active' ? `<button class="btn btn-primary promote-btn" data-id="${player.id}" data-name="${player.nickname}">В наставники</button>` : '') +
                    `<button class="btn btn-secondary delete-btn" data-id="${player.id}" data-name="${player.nickname}">Удалить</button>`
                    : 'Нет прав'
                }
            </td>
        </tr>
    `).join('');

    if (isFounder) {
        finalTableBody.querySelectorAll('.promote-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const { id, name } = e.target.dataset;
                if (confirm(`Вы уверены, что хотите повысить игрока "${name}" до Наставника?`)) {
                    promotePlayer(id);
                }
            });
        });
        finalTableBody.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const { id, name } = e.target.dataset;
                deletePlayer(id, name);
            });
        });
    }
}

function promotePlayer(playerId) {
    fetch(`/api/players/${playerId}/promote`, { method: 'POST' })
        .then(response => response.ok ? response.json() : Promise.reject(response.json()))
        .then(data => {
            if (data.status === 'success') {
                showSuccess('management-content', data.message || `Игрок успешно повышен.`);
                loadManageablePlayers(); 
            } else {
                throw new Error(data.message);
            }
        })
        .catch(errPromise => {
             errPromise.then(err => {
                showError('management-content', err.message || 'Не удалось повысить игрока.');
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
                showSuccess('management-content', `Игрок ${playerName} успешно удален.`);
                loadManageablePlayers();
            } else {
                throw new Error(data.message);
            }
        })
        .catch(() => showError('management-content', `Не удалось удалить игрока ${playerName}.`));
}
function loadAndShowAssignmentModal() {
    const modal = document.getElementById('assign-mentor-modal');
    modal.style.display = 'flex';
    const studentSelect = document.getElementById('assign-student-select');
    const mentorList = document.getElementById('assign-mentor-list');
    studentSelect.innerHTML = '<option>Загрузка игроков...</option>';
    mentorList.innerHTML = '<p>Загрузка наставников...</p>';
    fetch('/api/management/assignment-info')
        .then(res => res.ok ? res.json() : Promise.reject(res))
        .then(data => {
            if (data.status === 'success') {
                studentSelect.innerHTML = '<option value="" disabled selected>Выберите ученика из списка</option>';
                if (data.unassignedPlayers.length > 0) {
                    data.unassignedPlayers.forEach(p => {
                        const option = document.createElement('option');
                        option.value = p.id;
                        option.textContent = p.nickname;
                        studentSelect.appendChild(option);
                    });
                } else {
                    studentSelect.innerHTML = '<option value="" disabled>Нет игроков без наставника</option>';
                }
                mentorList.innerHTML = '';
                if (data.mentors.length > 0) {
                    data.mentors.forEach(m => {
                        const card = document.createElement('div');
                        card.className = 'online-member-card mentor-assign-card';
                        card.dataset.mentorId = m.id;
                        const avatar = m.avatar_url 
                            ? `<img src="${m.avatar_url}?t=${new Date().getTime()}" alt="${m.nickname}">`
                            : `<div class="sidebar-avatar-fallback" style="width: 64px; height: 64px; font-size: 32px; flex-shrink: 0;">${m.nickname.charAt(0).toUpperCase()}</div>`;
                        card.innerHTML = `
                            ${avatar}
                            <div class="online-member-info" style="text-align: left;">
                                <h3>${m.nickname}</h3>
                                <div class="mentor-card-details" style="justify-content: flex-start; margin-top: 8px;">
                                    <span class="mentor-card-spec">
                                        <i class="material-icons">star</i>
                                        ${m.specialization || 'Не указана'}
                                    </span>
                                    <span class="mentor-card-students">
                                        <i class="material-icons">school</i>
                                        ${m.student_count} учеников
                                    </span>
                                </div>
                            </div>
                        `;
                        mentorList.appendChild(card);
                    });
                    mentorList.querySelectorAll('.mentor-assign-card').forEach(card => {
                        card.addEventListener('click', () => {
                            mentorList.querySelector('.selected')?.classList.remove('selected');
                            card.classList.add('selected');
                        });
                    });
                } else {
                    mentorList.innerHTML = '<p class="placeholder" style="grid-column: 1 / -1;">В гильдии нет доступных наставников.</p>';
                }
            } else {
                throw new Error(data.message);
            }
        })
        .catch(err => {
            console.error(err);
            showError('assign-mentor-modal', 'Ошибка загрузки данных для назначения.');
        });
    document.getElementById('confirm-assignment-btn').onclick = assignMentor;
}
function assignMentor() {
    const studentId = document.getElementById('assign-student-select').value;
    const selectedMentorCard = document.querySelector('#assign-mentor-list .mentor-assign-card.selected');
    if (!studentId) {
        showError('assign-mentor-modal', 'Пожалуйста, выберите ученика из списка.');
        return;
    }
    if (!selectedMentorCard) {
        showError('assign-mentor-modal', 'Пожалуйста, кликните по карточке, чтобы выбрать наставника.');
        return;
    }
    const mentorId = selectedMentorCard.dataset.mentorId;
    fetch('/api/management/assign-mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, mentorId })
    })
    .then(res => res.ok ? res.json() : Promise.reject(res.json()))
    .then(data => {
        if (data.status === 'success') {
            document.getElementById('assign-mentor-modal').style.display = 'none';
            showSuccess('management-content', data.message);
        } else {
            throw new Error(data.message);
        }
    })
    .catch(errPromise => {
        errPromise.then(err => showError('assign-mentor-modal', err.message || 'Произошла непредвиденная ошибка.'));
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
            '/api/statistics/global-top-players?min_sessions=5&limit=10'
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
    if (playerSelect) {
        playerSelect.innerHTML = '<option value="" disabled selected>Загрузка игроков...</option>';
        fetch('/api/players') 
            .then(response => response.ok ? response.json() : Promise.reject(response))
            .then(data => {
                if (data.status === 'success') {
                    playerSelect.innerHTML = '<option value="" disabled selected>Выберите игрока</option>';
                    if (data.players.length === 0) {
                        playerSelect.innerHTML = '<option value="" disabled>Нет игроков для оценки</option>';
                        return;
                    }
                    data.players.forEach(player => {
                        if (player.id !== currentPlayerId) {
                            const option = document.createElement('option');
                            option.value = player.id;
                            option.textContent = player.nickname;
                            playerSelect.appendChild(option);
                        }
                    });
                }
            })
            .catch(() => playerSelect.innerHTML = '<option value="" disabled>Ошибка загрузки игроков</option>');
    }
    const contentSelect = document.getElementById('content-select');
    if (contentSelect) {
        contentSelect.innerHTML = '<option value="" disabled selected>Загрузка контента...</option>';
        fetch('/api/content')
            .then(response => response.ok ? response.json() : Promise.reject(response))
            .then(data => {
                if (data.status === 'success') {
                    contentSelect.innerHTML = '<option value="" disabled selected>Выберите контент</option>';
                    data.content.forEach(content => {
                        const option = document.createElement('option');
                        option.value = content.id;
                        option.textContent = content.name;
                        contentSelect.appendChild(option);
                    });
                }
            })
            .catch(() => contentSelect.innerHTML = '<option value="" disabled>Ошибка загрузки контента</option>');
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
    .then(data => {
        document.getElementById('mentor-modal').style.display = 'none';
        document.body.classList.remove('modal-open');
        showSuccess('player-dashboard', 'Сессия успешно добавлена');
        form.reset();
        document.querySelectorAll('.star-rating i').forEach(s => {
            s.classList.remove('active');
            s.textContent = 'star_border';
        });
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
        const response = await fetch('/api/guilds/comparable-players');
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.message);
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
    let targetContainer = container;
    if (container.classList.contains('modal')) {
        targetContainer = container.querySelector('.modal-content') || container;
    }
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    const existingError = targetContainer.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    targetContainer.insertBefore(errorElement, targetContainer.firstChild);
    setTimeout(() => {
        if (errorElement) {
            errorElement.style.opacity = '0';
            setTimeout(() => {
                errorElement.remove();
            }, 500);
        }
    }, 5000);
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
function assignStudentToMentor(studentId) {
    fetch(`/api/mentors/students/${studentId}`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                showSuccess('management-content', 'Игрок назначен вашим учеником!');
                loadPlayerDetailsForMentor(studentId); 
                checkAndShowMyStudentsTab();
            } else {
                showError('management-content', data.message || 'Не удалось назначить ученика.');
            }
        })
        .catch(() => showError('management-content', 'Произошла ошибка при назначении ученика.'));
}
