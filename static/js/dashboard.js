// Профессиональная цветовая палитра для графиков
const chartColors = {
    // Основной цвет — глубокий, но спокойный синий, как цвет моря на глубине.
    // Выглядит профессионально и надежно.
    primary: '#4F7CAC',

    // Более светлый оттенок синего для подсветки активных элементов.
    primaryLight: '#87A4C4',

    // Вторичный цвет.
    // Мягкий бирюзовый, как цвет воды у берега. Создает приятный контраст.
    secondary: '#82C0CC',

    // Цвет успеха.
    // Светлый, почти мятный оттенок морской пены.
    success: '#97D8C4',

    // Цвет опасности.
    // Теплый коралловый оттенок. Он достаточно заметен, чтобы сигнализировать об ошибках, но не агрессивен.
    danger: '#F47C7C',

    // Цвет предупреждения.
    // Теплый песочный, цвет пляжа.
    warning: '#F7D6A0',

    // Информационный цвет.
    // Нейтральный серо-синий, цвет мокрой гальки.
    info: '#A1B0BC',

    // Цвета для текста и фона.
    dark: '#333D47',
    light: '#F6F8FA',

    // Прозрачные версии.
    transparentPrimary: 'rgba(79, 124, 172, 0.25)',
    transparentSuccess: 'rgba(151, 216, 196, 0.2)',
};

// Глобальные переменные
let currentPlayerId = null;
let currentPlayerData = null;
let currentGuildId = null;
let charts = {};
let isGeneralView = false;
let animationEnabled = true;

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

// === ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКE DOM ===
document.addEventListener('DOMContentLoaded', function () {
    const savedTheme = localStorage.getItem('theme') || 'system';
    applyTheme(savedTheme);
    initNavigation();
    checkAuthStatus();
    
    window.addEventListener('resize', () => {
        Object.values(charts).forEach(chart => {
            if (chart && typeof chart.resize === 'function') {
                chart.resize();
            }
        });
    });
});

// Проверка статуса авторизации
function checkAuthStatus() {
    fetch('/api/system/status')
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'online') {
                loadCurrentPlayerData();
            } else {
                window.location.href = '/login.html';
            }
        })
        .catch(() => {
            showError('player-dashboard', 'Ошибка проверки авторизации. Пожалуйста, перезагрузите страницу.');
        });
}

// Загрузка данных текущего игрока
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

// Инициализация навигации
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

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const textElement = item.querySelector('span');
            if (!textElement) return;
            const text = textElement.textContent.trim();
            
            if (text === 'Оценить игрока') {
                if (currentPlayerData && ['mentor', 'founder'].includes(currentPlayerData.status)) {
                    document.getElementById('mentor-modal').style.display = 'flex';
                    document.body.classList.add('modal-open');
                    loadMentorForm();
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
                case 'Гильдия':
                    document.getElementById('guild-content').style.display = 'block';
                    loadGuildData();
                    break;
                case 'Управление':
                    document.getElementById('founder-content').style.display = 'block';
                    loadFounderPanel();
                    break;
                case 'Рекомендации':
                    document.getElementById('recommendations-content').style.display = 'block';
                    loadRecommendations();
                    break;
                case 'Настройки':
                    document.getElementById('settings-content').style.display = 'block';
                    loadSettings();
                    break;
                case 'Выйти':
                    logout();
                    break;
            }
        });
    });
}


// Инициализация дашборда
function initDashboard() {
    initViewToggle();
    initThemeSwitcher();
    initMentorForm();
    initCompareModal();
    initRecommendationsFilter();

    updateSidebarInfo();
    
    document.querySelector('.nav-item').classList.add('active');
    document.querySelector('.view-toggle').style.display = 'flex';

    const mentorBtn = document.querySelector('.mentor-btn');
    if (mentorBtn) {
        mentorBtn.style.display = ['mentor', 'founder'].includes(currentPlayerData?.status) ? 'flex' : 'none';
    }
    const founderBtn = document.querySelector('.founder-btn');
    if (founderBtn) {
        founderBtn.style.display = (currentPlayerData?.status === 'founder') ? 'flex' : 'none';
    }
    
    loadPlayerData().then(loadCharts);
    loadSystemStatus();
}

// Обновление данных в активной секции
function refreshActiveSection() {
    const activeSection = document.querySelector('.dashboard-section[style*="block"]');
    if (!activeSection) return;

    switch (activeSection.id) {
        case 'player-dashboard': loadPlayerData().then(loadCharts); break;
        case 'general-dashboard': loadGeneralStats().then(loadGeneralCharts).then(loadTopPlayersGeneral); break;
        case 'profile-content': loadProfile(); break;
        case 'guild-content': loadGuildData(); break;
        case 'founder-content': loadFounderPanel(); break;
        case 'recommendations-content': loadRecommendations(); break;
    }
    loadSystemStatus();
}


// Обновление информации в сайдбаре
function updateSidebarInfo() {
    const sidebarGuild = document.querySelector('.sidebar-guild');
    const sidebarPlayer = document.querySelector('.sidebar-player');
    const sidebarAvatar = document.querySelector('.sidebar-avatar');

    if (currentPlayerData) {
        if(sidebarGuild) sidebarGuild.textContent = `Гильдия: ${currentPlayerData.guild}`;
        if(sidebarPlayer) sidebarPlayer.textContent = currentPlayerData.nickname;
        if(sidebarAvatar && currentPlayerData.nickname) {
            sidebarAvatar.textContent = currentPlayerData.nickname.charAt(0).toUpperCase();
        }
    }
}

// Загрузка данных игрока
async function loadPlayerData() {
    skeletonHandler.show(['avg-score', 'session-count', 'comparison', 'last-update-player']);
    try {
        const [statsRes, comparisonRes] = await Promise.all([
            fetch(`/api/statistics/player/${currentPlayerId}`),
            fetch(`/api/statistics/comparison/${currentPlayerId}`)
        ]);
        
        if (!statsRes.ok) throw new Error(`Ошибка статистики игрока: ${statsRes.statusText}`);
        if (!comparisonRes.ok) throw new Error(`Ошибка сравнения: ${comparisonRes.statusText}`);
        
        const [stats, comparison] = await Promise.all([statsRes.json(), comparisonRes.json()]);

        skeletonHandler.hide('avg-score', (stats.avgScore || 0).toFixed(2));
        skeletonHandler.hide('session-count', stats.sessionCount || 0);
        skeletonHandler.hide('last-update-player', stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleDateString() : '-');
        
        const comparisonValue = ((comparison.playerScore / (comparison.topAvgScore || 1)) * 100);
        skeletonHandler.hide('comparison', `${comparisonValue > 0 ? comparisonValue.toFixed(1) : '0'}%`);

    } catch (error) {
        console.error('Ошибка в loadPlayerData:', error);
        showError('player-dashboard', 'Ошибка загрузки статистики игрока');
    }
}

async function loadCharts() {
    try {
         const [trendRes, roleScoresRes, contentScoresRes, errorTypesRes, errorDistributionRes, errorScoreRes] = await Promise.all([
            fetch(`/api/statistics/player-trend/${currentPlayerId}`),
            fetch(`/api/statistics/player-role-scores/${currentPlayerId}`),
            fetch(`/api/statistics/player-content-scores/${currentPlayerId}`),
            fetch(`/api/statistics/player-error-types/${currentPlayerId}`),
            fetch(`/api/statistics/error-distribution/${currentPlayerId}`),
            fetch(`/api/statistics/error-score-correlation/${currentPlayerId}`)
        ]);
        const [trend, roleScores, contentScores, errorTypes, errorDistribution, errorScore] = await Promise.all([
            trendRes.json(), roleScoresRes.json(), contentScoresRes.json(), errorTypesRes.json(), errorDistributionRes.json(), errorScoreRes.json()
        ]);

        createTrendChart(trend);
        createRoleScoresChart(roleScores);
        createContentScoresChart(contentScores);
        createErrorTypesChart(errorTypes);
        createErrorDistributionChart(errorDistribution);
        createErrorScoreChart(errorScore);

    } catch (error) {
        showError('player-dashboard', 'Ошибка загрузки графиков');
    }
}

function prepareChartContainer(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const container = canvas.parentElement;
    container.innerHTML = `<h3 class="chart-title">${container.querySelector('.chart-title').innerHTML}</h3><canvas id="${canvasId}"></canvas>`;
    return document.getElementById(canvasId);
}

function createTrendChart(trendData) {
    const ctx = prepareChartContainer('score-trend-chart');
    if (!ctx) return;
    if (charts.scoreTrend) charts.scoreTrend.destroy();
    if (!trendData || trendData.weeks.length === 0) {
        ctx.parentElement.innerHTML += '<p class="placeholder">Нет данных для графика</p>';
        return;
    }
    charts.scoreTrend = new Chart(ctx, {
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
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: false, min: 0, max: 10 } },
            animation: animationEnabled ? { duration: 1000 } : { duration: 0 }
        }
    });
}
function createRoleScoresChart(roleData) {
    const ctx = prepareChartContainer('role-scores-chart');
    if (!ctx) return;
    if (charts.roleScores) charts.roleScores.destroy();
    if (!roleData || roleData.roles.length === 0) {
        ctx.parentElement.innerHTML += '<p class="placeholder">Нет данных для графика</p>';
        return;
    }
    charts.roleScores = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: roleData.roles,
            datasets: [{
                label: 'Средний балл',
                data: roleData.scores,
                backgroundColor: chartColors.primary
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: false, min: 0, max: 10 } },
            animation: animationEnabled ? { duration: 1000 } : { duration: 0 }
        }
    });
}

function createContentScoresChart(contentData) {
    const ctx = prepareChartContainer('content-scores-chart');
    if (!ctx) return;
    if (charts.contentScores) charts.contentScores.destroy();
    if (!contentData || contentData.contents.length === 0) {
        ctx.parentElement.innerHTML += '<p class="placeholder">Нет данных для графика</p>';
        return;
    }
    const isDarkMode = document.documentElement.hasAttribute('data-theme');
    charts.contentScores = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: contentData.contents,
            datasets: [{
                label: 'Средний балл',
                data: contentData.scores,
                backgroundColor: chartColors.transparentPrimary,
                borderColor: chartColors.primary,
                borderWidth: 2,
                pointBackgroundColor: chartColors.primary,
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: chartColors.primary
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                r: {
                    min: 0, max: 10,
                    pointLabels: {
                        font: { size: 12, weight: 'bold' },
                        color: isDarkMode ? '#E2E8F0' : '#1A202C', 
                        backdropColor: 'transparent', backdropPadding: 0
                    },
                    grid: { color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
                    angleLines: { color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
                    ticks: { display: false }
                }
            },
            animation: animationEnabled ? { duration: 1000 } : { duration: 0 }
        }
    });
}
function createErrorTypesChart(errorData) {
    const ctx = prepareChartContainer('error-types-chart');
    if (!ctx) return;
    if (charts.errorTypes) charts.errorTypes.destroy();
    if (!errorData || errorData.errors.length === 0) {
        ctx.parentElement.innerHTML += '<p class="placeholder">Нет данных для графика</p>';
        return;
    }
    charts.errorTypes = new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels: errorData.errors,
            datasets: [{
                data: errorData.counts,
                backgroundColor: [
                    'rgba(255, 118, 117, 0.7)', 'rgba(255, 234, 167, 0.7)', 'rgba(116, 185, 255, 0.7)', 
                    'rgba(0, 206, 201, 0.7)', 'rgba(85, 239, 196, 0.7)'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right' } },
            scales: { r: { ticks: { display: false }, grid: { circular: true } } },
            animation: { duration: animationEnabled ? 1000 : 0 }
        }
    });
}

function createErrorDistributionChart(distributionData) {
    const ctx = prepareChartContainer('error-distribution-chart');
    if (!ctx) return;
    if (charts.errorDistribution) charts.errorDistribution.destroy();
    if (!distributionData || distributionData.contents.length === 0) {
        ctx.parentElement.innerHTML += '<p class="placeholder">Нет данных для графика</p>';
        return;
    }
    charts.errorDistribution = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: distributionData.contents,
            datasets: [{
                label: 'Количество ошибок',
                data: distributionData.counts,
                backgroundColor: chartColors.secondary
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } },
            animation: animationEnabled ? { duration: 1000 } : { duration: 0 }
        }
    });
}
function createErrorScoreChart(correlationData) {
    const ctx = prepareChartContainer('error-score-chart');
    if (!ctx) return;
    if (charts.errorScore) charts.errorScore.destroy();
    if (!correlationData || correlationData.points.length < 2) {
        ctx.parentElement.innerHTML += '<p class="placeholder">Недостаточно данных для графика</p>';
        return;
    }
    const sortedPoints = correlationData.points.sort((a, b) => a.errors - b.errors);
    charts.errorScore = new Chart(ctx, {
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
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { title: { display: true, text: 'Балл' }, min: 0, max: 10 },
                x: { title: { display: true, text: 'Количество ошибок за сессию' } }
            },
            animation: animationEnabled ? { duration: 1000 } : { duration: 0 }
        }
    });
}


function loadProfile() {
    skeletonHandler.show(['profile-nickname', 'profile-guild', 'profile-status', 'profile-balance', 'reg-date', 'mentor-name', 'description']);
    fetch(`/api/players/current`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const player = data.player;
                document.querySelector('.profile-nickname').textContent = player.nickname || '-';
                document.querySelector('.profile-guild').textContent = `Гильдия: ${player.guild || '-'}`;
                document.querySelector('.profile-status').textContent = `Статус: ${player.status || '-'}`;
                document.querySelector('.profile-balance').textContent = `Баланс: ${player.balance || 0}`;
                document.querySelector('#reg-date').textContent = player.created_at ? new Date(player.created_at).toLocaleDateString() : '-';
                document.querySelector('#mentor-name').textContent = player.mentor || 'Не назначен';
                document.querySelector('#description').textContent = player.description || 'Нет описания';
            }
        })
        .catch(error => {
            showError('profile-content', 'Ошибка загрузки профиля');
        });
    const exportBtn = document.querySelector('.export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            window.location.href = `/api/players/${currentPlayerId}/export`;
        });
    }
}

function loadGuildData() {
    if (!currentGuildId) return;

    fetch(`/api/guilds/${currentGuildId}`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const guild = data.guild;
                document.querySelector('.guild-members').textContent = `Участников: ${guild.members || 0}`;
                document.querySelector('.guild-kill-fame').textContent = `Kill Fame: ${guild.kill_fame || 0}`;
                document.querySelector('.guild-death-fame').textContent = `Death Fame: ${guild.death_fame || 0}`;
            }
        });
    
    fetch(`/api/guilds/${currentGuildId}/top-players?limit=0`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const container = document.getElementById('all-players-list');
                renderPlayerTable(container, data.players, currentPlayerId);

                const rankMessageEl = document.getElementById('guild-player-rank');
                if (rankMessageEl) {
                    const playerIndex = data.players.findIndex(p => p.id === currentPlayerId);
                    if (playerIndex !== -1) {
                        rankMessageEl.textContent = `Ваш ранг в гильдии: #${playerIndex + 1}`;
                        rankMessageEl.style.display = 'block';
                    } else {
                        rankMessageEl.style.display = 'none';
                    }
                }
            }
        });
}

// +++ НАЧАЛО: ИСПРАВЛЕНИЕ ОШИБКИ - ДОБАВЛЕНИЕ НОВЫХ ФУНКЦИЙ +++

/**
 * Загружает панель основателя гильдии, включая список заявок.
 */
function loadFounderPanel() {
    const container = document.getElementById('pending-players-list');
    if (!container) return;
    container.innerHTML = '<p>Загрузка заявок...</p>';

    fetch('/api/guilds/pending-players')
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'success') {
                renderPendingPlayers(data.players);
            } else {
                throw new Error(data.message || 'Не удалось загрузить заявки');
            }
        })
        .catch(() => {
            container.innerHTML = '<p class="error-message">Ошибка загрузки заявок на вступление.</p>';
        });
}

/**
 * Отрисовывает список игроков, ожидающих одобрения.
 * @param {Array} players - Массив объектов игроков.
 */
function renderPendingPlayers(players) {
    const container = document.getElementById('pending-players-list');
    if (!container) return;

    if (players.length === 0) {
        container.innerHTML = '<p class="placeholder" style="position: static; height: auto;">Нет новых заявок на вступление.</p>';
        return;
    }

    container.innerHTML = `
        <table class="players-table">
            <thead>
                <tr>
                    <th>Игрок</th>
                    <th>Дата заявки</th>
                    <th>Действия</th>
                </tr>
            </thead>
            <tbody>
                ${players.map(player => `
                    <tr>
                        <td data-label="Игрок">${player.nickname}</td>
                        <td data-label="Дата заявки">${new Date(player.date).toLocaleDateString()}</td>
                        <td data-label="Действия">
                            <button class="btn btn-primary approve-btn" data-id="${player.id}">Одобрить</button>
                            <button class="btn btn-secondary deny-btn" data-id="${player.id}">Отклонить</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    // Добавляем обработчики событий для новых кнопок
    container.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', (e) => approvePlayer(e.target.dataset.id));
    });
    container.querySelectorAll('.deny-btn').forEach(btn => {
        btn.addEventListener('click', (e) => denyPlayer(e.target.dataset.id));
    });
}

/**
 * Отправляет запрос на одобрение игрока.
 * @param {number} playerId - ID игрока.
 */
function approvePlayer(playerId) {
    fetch(`/api/players/${playerId}/approve`, { method: 'POST' })
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'success') {
                showSuccess('founder-content', 'Игрок успешно одобрен.');
                loadFounderPanel(); // Обновляем список
            } else {
                throw new Error(data.message);
            }
        })
        .catch(() => showError('founder-content', 'Не удалось одобрить игрока.'));
}

/**
 * Отправляет запрос на отклонение заявки игрока.
 * @param {number} playerId - ID игрока.
 */
function denyPlayer(playerId) {
    fetch(`/api/players/${playerId}/deny`, { method: 'POST' })
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'success') {
                showSuccess('founder-content', 'Заявка игрока отклонена.');
                loadFounderPanel(); // Обновляем список
            } else {
                throw new Error(data.message);
            }
        })
        .catch(() => showError('founder-content', 'Не удалось отклонить заявку.'));
}

// +++ КОНЕЦ: ИСПРАВЛЕНИЕ ОШИБКИ +++


function loadRecommendations() {
    fetch(`/api/recommendations/player/${currentPlayerId}`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const grid = document.querySelector('.recommendations-grid');
                grid.innerHTML = '';
                if (data.recommendations.length === 0) {
                    grid.innerHTML = '<p class="placeholder" style="position: static; height: auto;">Нет рекомендаций</p>';
                    return;
                }
                data.recommendations.forEach(rec => {
                    const card = document.createElement('div');
                    card.className = `recommendation-card ${rec.status}`;
                    card.innerHTML = `
                        <div class="recommendation-header">
                            <h3 class="recommendation-title">${rec.title}</h3>
                            <span class="recommendation-status">${rec.status}</span>
                        </div>
                        <p class="recommendation-description">${rec.description}</p>
                        <div class="recommendation-meta">
                            <span>Приоритет: ${rec.priority}</span>
                            <span>${new Date(rec.created_at).toLocaleDateString()}</span>
                        </div>
                    `;
                    grid.appendChild(card);
                });
            }
        });
}

function initRecommendationsFilter() {
    const filterContainer = document.querySelector('.filter-controls');
    filterContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-pill')) {
            filterContainer.querySelectorAll('.filter-pill').forEach(f => f.classList.remove('active'));
            e.target.classList.add('active');
        }
    });
}


function initViewToggle() {
    const toggleContainer = document.querySelector('.view-toggle');
    const options = toggleContainer.querySelectorAll('.toggle-option');
    const indicator = toggleContainer.querySelector('.toggle-indicator');

    options.forEach((option, index) => {
        option.addEventListener('click', () => {
            options.forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            
            indicator.style.transform = `translateX(${index * 100}%)`;
            
            isGeneralView = option.textContent.trim() === 'Общая статистика';
            document.getElementById('player-dashboard').style.display = isGeneralView ? 'none' : 'block';
            document.getElementById('general-dashboard').style.display = isGeneralView ? 'block' : 'none';
            
            if (isGeneralView) {
                loadGeneralStats().then(loadGeneralCharts).then(loadTopPlayersGeneral);
            } else {
                loadPlayerData().then(loadCharts);
            }
        });
    });
}

async function loadGeneralStats() {
    if (!currentGuildId) {
        showError('general-dashboard', 'ID гильдии не определен');
        return;
    }
    skeletonHandler.show(['guild-avg-score', 'active-players', 'total-sessions', 'best-player-week']);
    try {
        const [guildStatsRes, totalSessionsRes, bestPlayerRes] = await Promise.all([
            fetch(`/api/statistics/guild/${currentGuildId}`),
            fetch(`/api/statistics/total-sessions?guild_id=${currentGuildId}`),
            fetch(`/api/statistics/best-player-week?guild_id=${currentGuildId}`),
        ]);
        if (![guildStatsRes, totalSessionsRes, bestPlayerRes].every(res => res.ok)) {
            throw new Error('Ошибка загрузки одной из статистик');
        }
        const [guildStats, totalSessions, bestPlayer] = await Promise.all([
            guildStatsRes.json(),
            totalSessionsRes.json(),
            bestPlayerRes.json(),
        ]);
        
        skeletonHandler.hide('guild-avg-score', (guildStats.avgScore || 0).toFixed(2));
        skeletonHandler.hide('active-players', guildStats.activePlayers || 0);
        skeletonHandler.hide('total-sessions', `${totalSessions.guild_sessions || 0} / ${totalSessions.total || 0}`);
        skeletonHandler.hide('best-player-week', (bestPlayer.player && bestPlayer.player.nickname) ? bestPlayer.player.nickname : '-');

    } catch (error) {
        showError('general-dashboard', 'Ошибка загрузки общей статистики');
    }
}

async function loadGeneralCharts() {
    try {
        const [roleDistRes, errorTypesRes, topErrorsRes, guildRankingRes] = await Promise.all([
            fetch('/api/statistics/guild-role-distribution'),
            fetch('/api/statistics/guild-error-types'),
            fetch('/api/statistics/top-errors'),
            fetch('/api/statistics/guild-ranking')
        ]);
        const [roleDist, errorTypes, topErrors, guildRanking] = await Promise.all([
            roleDistRes.json(), errorTypesRes.json(), topErrorsRes.json(), guildRankingRes.json()
        ]);

        createGuildRoleDistributionChart(roleDist);
        createGuildErrorTypesChart(errorTypes);
        createTopErrorsChart(topErrors);
        createGuildRankingChart(guildRanking);
    } catch (error) {
        showError('general-dashboard', 'Ошибка загрузки графиков');
    }
}

function createGuildRoleDistributionChart(data) {
    const ctx = prepareChartContainer('guild-role-distribution');
    if (!ctx) return;
    if (charts.guildRoleDist) charts.guildRoleDist.destroy();
    if (!data || data.roles.length === 0) {
        ctx.parentElement.innerHTML += '<p class="placeholder">Нет данных для графика</p>';
        return;
    }
    charts.guildRoleDist = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.roles,
            datasets: [{
                data: data.counts,
                backgroundColor: [chartColors.primary, chartColors.secondary, chartColors.success, chartColors.warning, chartColors.info, chartColors.transparentPrimary]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right' } },
            animation: { duration: animationEnabled ? 1000 : 0 }
        }
    });
}
function createGuildErrorTypesChart(data) {
    const ctx = prepareChartContainer('guild-error-types');
    if (!ctx) return;
    if (charts.guildErrorTypes) charts.guildErrorTypes.destroy();
    if (!data || data.errors.length === 0) {
        ctx.parentElement.innerHTML += '<p class="placeholder">Нет данных для графика</p>';
        return;
    }
    charts.guildErrorTypes = new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels: data.errors,
            datasets: [{
                data: data.counts,
                backgroundColor: [
                    chartColors.primary, chartColors.warning, chartColors.info, 
                    chartColors.success, chartColors.secondary
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right' } },
            scales: { r: { ticks: { display: false }, grid: { circular: true } } },
            animation: { duration: animationEnabled ? 1000 : 0 }
        }
    });
}

function createTopErrorsChart(data) {
    const ctx = prepareChartContainer('top-errors-chart');
    if (!ctx) return;
    if (charts.topErrors) charts.topErrors.destroy();
    if (!data || data.errors.length === 0) {
        ctx.parentElement.innerHTML += '<p class="placeholder">Нет данных для графика</p>';
        return;
    }
    charts.topErrors = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.errors.slice(0, 3),
            datasets: [{ label: 'Частота', data: data.counts.slice(0, 3), backgroundColor: chartColors.warning }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            animation: { duration: animationEnabled ? 1000 : 0 } 
        }
    });
}

function createGuildRankingChart(data) {
    const ctx = prepareChartContainer('guild-ranking-chart');
    if (!ctx) return;
    if (charts.guildRanking) charts.guildRanking.destroy();
    if (!data || data.guilds.length === 0) {
        ctx.parentElement.innerHTML += '<p class="placeholder">Нет данных для графика</p>';
        return;
    }
    charts.guildRanking = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.guilds,
            datasets: [{ label: 'Ранг', data: data.scores, backgroundColor: chartColors.primary }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            animation: { duration: animationEnabled ? 1000 : 0 } 
        }
    });
}

function loadTopPlayersGeneral() {
    if (!currentGuildId) return;
    fetch(`/api/guilds/${currentGuildId}/top-players?min_sessions=8`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const container = document.getElementById('top-players-list');
                const top10 = data.players.slice(0, 10);
                renderPlayerTable(container, top10, currentPlayerId);
            }
        });
}

function renderPlayerTable(container, players, highlightPlayerId) {
    container.innerHTML = '';
    if (players.length === 0) {
        container.innerHTML = '<p class="placeholder" style="position: static; height: auto;">Нет игроков для отображения</p>';
        return;
    }
    const table = document.createElement('table');
    table.className = 'players-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Ранг</th>
                <th>Игрок</th>
                <th>Ср. балл</th>
                <th>Сессии</th>
                <th>Роль</th>
            </tr>
        </thead>
        <tbody>
            ${players.map((player, index) => `
                <tr class="${player.id === highlightPlayerId ? 'current-player' : ''}">
                    <td data-label="Ранг"><span class="player-rank">#${index + 1}</span></td>
                    <td data-label="Игрок">${player.nickname || '-'}</td>
                    <td data-label="Ср. балл">${(player.avg_score || 0).toFixed(2)}</td>
                    <td data-label="Сессии">${player.session_count || 0}</td>
                    <td data-label="Роль">${player.main_role || '-'}</td>
                </tr>
            `).join('')}
        </tbody>
    `;
    container.appendChild(table);
}


function loadSettings() {
    const savedTheme = localStorage.getItem('theme') || 'system';
    document.getElementById('theme-selector').value = savedTheme;
    const savedAnimations = localStorage.getItem('animations') !== 'false';
    document.getElementById('animations-toggle').checked = savedAnimations;
    const savedNotifications = localStorage.getItem('notifications') === 'true';
    document.getElementById('notifications-toggle').checked = savedNotifications;
    const savedPublish = localStorage.getItem('publish') === 'true';
    document.getElementById('publish-toggle').checked = savedPublish;
    
    document.querySelector('.save-settings')?.addEventListener('click', saveSettings);
}

function saveSettings() {
    const theme = document.getElementById('theme-selector').value;
    localStorage.setItem('theme', theme);
    const animations = document.getElementById('animations-toggle').checked;
    localStorage.setItem('animations', animations);
    animationEnabled = animations;
    const notifications = document.getElementById('notifications-toggle').checked;
    localStorage.setItem('notifications', notifications);
    const publish = document.getElementById('publish-toggle').checked;
    localStorage.setItem('publish', publish);
    
    applyTheme(theme);
    
    Object.values(charts).forEach(chart => {
        if (chart) {
            chart.options.animation.duration = animationEnabled ? 1000 : 0;
            chart.update();
        }
    });
    showSuccess('settings-content', 'Настройки сохранены');
}
function applyTheme(theme) {
    document.documentElement.removeAttribute('data-theme');
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else if (theme === 'system') {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }
}
function loadSystemStatus() {
    fetch('/api/system/status')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'online') {
                document.getElementById('db-status').textContent = 'DB: Online';
                document.getElementById('api-status').textContent = 'API: Online';
            } else {
                document.getElementById('db-status').textContent = 'DB: Offline';
                document.getElementById('api-status').textContent = 'API: Offline';
            }
            document.getElementById('last-update').textContent = `Обновлено: ${data.last_update ? new Date(data.last_update).toLocaleDateString() : '-'}`;
            document.getElementById('total-players').textContent = `Игроков: ${data.total_players || 0}`;
            document.getElementById('total-mentors').textContent = `Менторов: ${data.total_mentors || 0}`;
        })
        .catch(error => console.error('Ошибка проверки статуса системы'));
}
function initThemeSwitcher() {
    const themeSelector = document.getElementById('theme-selector');
    if (themeSelector) {
        themeSelector.addEventListener('change', function() {
            applyTheme(this.value);
            localStorage.setItem('theme', this.value);
        });
    }
}
function initMentorForm() {
    const mentorForm = document.getElementById('mentor-form');
    if (mentorForm) {
        mentorForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveMentorSession();
        });
    }
    const starRating = document.querySelector('.star-rating');
    if (starRating) {
        const stars = starRating.querySelectorAll('i');
        const scoreInput = document.getElementById('score');
        stars.forEach(star => {
            star.addEventListener('click', () => {
                const rating = star.dataset.value;
                scoreInput.value = rating;
                stars.forEach((s, i) => {
                    s.classList.toggle('active', i < rating);
                    s.textContent = i < rating ? 'star' : 'star_border';
                });
            });
        });
    }
}
function loadMentorForm() {
    const playerSelect = document.getElementById('player-select');
    if (playerSelect) {
        playerSelect.innerHTML = '<option value="" disabled selected>Загрузка игроков...</option>';
        fetch('/api/players')
            .then(response => response.ok ? response.json() : Promise.reject(response))
            .then(data => {
                if (data.status === 'success') {
                    playerSelect.innerHTML = '<option value="" disabled selected>Выберите игрока</option>';
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
    const playerSelect = document.getElementById('player-select');
    const contentSelect = document.getElementById('content-select');
    const roleSelect = document.getElementById('role-select');
    const scoreInput = document.getElementById('score');
    const errorTypesInput = document.getElementById('error-types');
    const workOnInput = document.getElementById('work-on');
    const commentsInput = document.getElementById('comments');
    
    if (!playerSelect.value || !contentSelect.value || !roleSelect.value) {
        showError('mentor-modal', 'Пожалуйста, заполните все обязательные поля (Игрок, Контент, Роль).');
        return;
    }
    if (parseInt(scoreInput.value, 10) < 1) {
         showError('mentor-modal', 'Пожалуйста, поставьте оценку (от 1 до 10).');
        return;
    }

    const sessionData = {
        playerId: playerSelect.value,
        contentId: contentSelect.value,
        score: scoreInput.value,
        role: roleSelect.value,
        errorTypes: errorTypesInput.value,
        workOn: workOnInput.value,
        comments: commentsInput.value,
        mentorId: currentPlayerId,
        sessionDate: new Date().toISOString()
    };

    fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
    })
    .then(response => {
        if (!response.ok) return response.json().then(err => { throw new Error(err.message || 'Ошибка сервера'); });
        return response.json();
    })
    .then(data => {
        document.getElementById('mentor-modal').style.display = 'none';
        document.body.classList.remove('modal-open');
        showSuccess('player-dashboard', 'Сессия успешно добавлена');
        form.reset();
        document.querySelectorAll('.star-rating i').forEach(s => {
            s.classList.remove('active');
            s.textContent = 'star_border';
        });
        loadPlayerData().then(loadCharts);
    })
    .catch(error => {
        showError('mentor-modal', 'Ошибка сохранения сессии: ' + error.message);
    });
}
function initCompareModal() {
    const compareBtn = document.getElementById('compare-btn');
    if (compareBtn) {
        compareBtn.addEventListener('click', () => {
            document.getElementById('compare-modal').style.display = 'flex';
            document.body.classList.add('modal-open');
            loadComparePlayers();
        });
    }
    const select = document.getElementById('compare-player-select');
    if (select) {
        select.addEventListener('change', () => {
            const otherId = select.value;
            if (otherId) {
                fetch(`/api/statistics/compare/${currentPlayerId}/${otherId}`)
                    .then(response => response.json())
                    .then(data => {
                        const results = document.getElementById('compare-results');
                        results.innerHTML = `
                            <p>Баллы: Вы лучше на ${(data.percent_scores || 0).toFixed(1)}%</p>
                            <p>Ошибки: Вы лучше на ${(data.percent_errors || 0).toFixed(1)}%</p>
                            <p>Сессии: Вы лучше на ${(data.percent_sessions || 0).toFixed(1)}%</p>
                        `;
                    })
                    .catch(() => showError('compare-modal', 'Ошибка сравнения'));
            }
        });
    }
}
function loadComparePlayers() {
    const select = document.getElementById('compare-player-select');
    fetch('/api/players')
        .then(response => response.json())
        .then(data => {
            select.innerHTML = '<option value="" disabled selected>Выберите игрока</option>';
            data.players.forEach(player => {
                if (player.id !== currentPlayerId) {
                    const option = document.createElement('option');
                    option.value = player.id;
                    option.textContent = player.nickname;
                    select.appendChild(option);
                }
            });
        })
        .catch(() => showError('compare-modal', 'Ошибка загрузки игроков'));
}
function logout() {
    sessionStorage.clear();
    fetch('/api/auth/logout', { method: 'POST' })
        .finally(() => {
            window.location.href = '/login.html';
        });
}
function showError(containerId, message) {
    const container = document.getElementById(containerId) || document.body;
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;

    const existingError = container.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    container.insertBefore(errorElement, container.firstChild);
    
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
    const successElement = document.createElement('div');
    successElement.className = 'success-message';
    successElement.textContent = message;

    const existingSuccess = container.querySelector('.success-message');
    if (existingSuccess) {
        existingSuccess.remove();
    }

    container.insertBefore(successElement, container.firstChild);

    setTimeout(() => {
        if (successElement) {
            successElement.style.opacity = '0';
            setTimeout(() => {
                successElement.remove();
            }, 500);
        }
    }, 3000);
}