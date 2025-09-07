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
    applyTheme(savedTheme);
    initNavigation();
    initMobileMenu();
    checkAuthStatus();
    
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
            closeMobileMenu();
        });
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

    const mentorBtn = document.querySelector('.mentor-btn');
    if (mentorBtn) {
        mentorBtn.style.display = ['mentor', 'founder'].includes(currentPlayerData?.status) ? 'flex' : 'none';
    }
    const founderBtn = document.querySelector('.founder-btn');
    if (founderBtn) {
        founderBtn.style.display = (currentPlayerData?.status === 'founder') ? 'flex' : 'none';
    }
    
    loadPlayerDataAndCharts();
    loadSystemStatus();
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


function refreshActiveSection() {
    const activeSectionId = document.querySelector('.dashboard-section[style*="block"]')?.id;
    if (!activeSectionId) {
        // Default to player dashboard if no section is active
        document.getElementById('player-dashboard').style.display = 'block';
        loadPlayerDataAndCharts();
        return;
    }

    switch (activeSectionId) {
        case 'player-dashboard': loadPlayerDataAndCharts(); break;
        case 'general-dashboard': loadGeneralData(); break;
        case 'profile-content': loadProfile(); break;
        case 'guild-content': loadGuildData(); break;
        case 'founder-content': loadFounderPanel(); break;
        case 'recommendations-content': loadRecommendations(); break;
    }
    loadSystemStatus();
}


function updateAvatarDisplay(player) {
    const nickname = player.nickname || 'P';
    const avatarUrl = player.avatar_url;

    document.querySelectorAll('.sidebar-avatar-img, .profile-avatar-img').forEach(img => {
        const fallback = img.nextElementSibling;
        if (avatarUrl) {
            img.src = avatarUrl + `?t=${new Date().getTime()}`; // Cache bust
            img.style.display = 'block';
            fallback.style.display = 'none';
        } else {
            img.style.display = 'none';
            fallback.style.display = 'flex';
            fallback.textContent = nickname.charAt(0).toUpperCase();
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


async function loadPlayerDataAndCharts() {
    skeletonHandler.show(['avg-score', 'session-count', 'comparison', 'last-update-player']);
    try {
        const [statsRes, comparisonRes, trendRes, roleScoresRes, contentScoresRes, errorTypesRes, errorDistributionRes, errorScoreRes] = await Promise.all([
            fetch(`/api/statistics/player/${currentPlayerId}?period=${currentDatePeriod}`),
            fetch(`/api/statistics/comparison/${currentPlayerId}?period=${currentDatePeriod}`),
            fetch(`/api/statistics/player-trend/${currentPlayerId}?period=${currentDatePeriod}`),
            fetch(`/api/statistics/player-role-scores/${currentPlayerId}?period=${currentDatePeriod}`),
            fetch(`/api/statistics/player-content-scores/${currentPlayerId}?period=${currentDatePeriod}`),
            fetch(`/api/statistics/player-error-types/${currentPlayerId}?period=${currentDatePeriod}`),
            fetch(`/api/statistics/error-distribution/${currentPlayerId}?period=${currentDatePeriod}`),
            fetch(`/api/statistics/error-score-correlation/${currentPlayerId}?period=${currentDatePeriod}`)
        ]);
        
        const [stats, comparison, trend, roleScores, contentScores, errorTypes, errorDistribution, errorScore] = await Promise.all([
            statsRes.json(), comparisonRes.json(), trendRes.json(), roleScoresRes.json(), contentScoresRes.json(), errorTypesRes.json(), errorDistributionRes.json(), errorScoreRes.json()
        ]);

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
        showError('player-dashboard', 'Ошибка загрузки статистики игрока');
    }
}

// --- Chart Creation ---
function prepareChartContainer(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const container = canvas.parentElement;

    // Clear previous content but keep header
    const placeholder = container.querySelector('.placeholder');
    if(placeholder) placeholder.remove();
    if(canvas) canvas.remove();

    const newCanvas = document.createElement('canvas');
    newCanvas.id = canvasId;
    container.appendChild(newCanvas);

    return newCanvas;
}


function showEmptyState(canvasId, message, icon) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const container = canvas.parentElement;
    
    const placeholder = container.querySelector('.placeholder');
    if(placeholder) placeholder.remove();
    if(canvas) canvas.remove();

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
    if (!trendData || trendData.weeks.length === 0) {
        showEmptyState(canvasId, 'Недостаточно данных для построения тренда.', 'trending_up');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    if (charts.scoreTrend) charts.scoreTrend.destroy();
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
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false, min: 0, max: 10 } }, animation: { duration: animationEnabled ? 1000 : 0 } }
    });
}

function createRoleScoresChart(roleData) {
    const canvasId = 'role-scores-chart';
    if (!roleData || roleData.roles.length === 0) {
        showEmptyState(canvasId, 'Нет оценок по ролям за этот период.', 'bar_chart');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    if (charts.roleScores) charts.roleScores.destroy();
    charts.roleScores = new Chart(ctx, {
        type: 'bar',
        data: { labels: roleData.roles, datasets: [{ label: 'Средний балл', data: roleData.scores, backgroundColor: chartColors.primary }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false, min: 0, max: 10 } }, animation: { duration: animationEnabled ? 1000 : 0 } }
    });
}

function createContentScoresChart(contentData) {
    const canvasId = 'content-scores-chart';
    if (!contentData || contentData.contents.length === 0) {
        showEmptyState(canvasId, 'Нет оценок по типам контента.', 'radar');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    const isDarkMode = document.documentElement.hasAttribute('data-theme');
    if (charts.contentScores) charts.contentScores.destroy();
    charts.contentScores = new Chart(ctx, {
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
    if (!errorData || errorData.errors.length === 0) {
        showEmptyState(canvasId, 'Поздравляем, ошибок не найдено!', 'thumb_up');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    if (charts.errorTypes) charts.errorTypes.destroy();
    charts.errorTypes = new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels: errorData.errors,
            datasets: [{
                data: errorData.counts,
                backgroundColor: Object.values(chartColors).slice(0, 5).map(c => c + 'B3') // Add alpha
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } }, scales: { r: { ticks: { display: false } } }, animation: { duration: animationEnabled ? 1000 : 0 } }
    });
}

function createErrorDistributionChart(distributionData) {
    const canvasId = 'error-distribution-chart';
    if (!distributionData || distributionData.contents.length === 0) {
        showEmptyState(canvasId, 'Нет данных о распределении ошибок.', 'pie_chart');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    if (charts.errorDistribution) charts.errorDistribution.destroy();
    charts.errorDistribution = new Chart(ctx, {
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
    if (!correlationData || correlationData.points.length < 2) {
        showEmptyState(canvasId, 'Недостаточно данных для корреляции.', 'scatter_plot');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    const sortedPoints = correlationData.points.sort((a, b) => a.errors - b.errors);
    if (charts.errorScore) charts.errorScore.destroy();
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
                document.querySelector('.profile-status').textContent = `Статус: ${player.status || '-'}`;
                document.querySelector('.profile-balance').textContent = `Баланс: ${player.balance || 0}`;
                document.querySelector('#reg-date').textContent = player.created_at ? new Date(player.created_at).toLocaleDateString() : '-';
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

// --- Avatar Cropper Logic ---
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
                    aspectRatio: 1,
                    viewMode: 1,
                    dragMode: 'move',
                    background: false,
                    autoCropArea: 0.8,
                });
            };
            reader.readAsDataURL(files[0]);
        }
        fileInput.value = ''; // Reset input
    });

    document.getElementById('save-crop-btn').addEventListener('click', () => {
        if (!cropper) return;
        cropper.getCroppedCanvas({
            width: 256,
            height: 256,
            imageSmoothingQuality: 'high',
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


function loadFounderPanel() {
    const container = document.getElementById('pending-players-list');
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
        .catch(() => container.innerHTML = '<p class="error-message">Ошибка загрузки заявок на вступление.</p>');
}

function renderPendingPlayers(players) {
    const container = document.getElementById('pending-players-list');
    if (players.length === 0) {
        container.innerHTML = '<p class="placeholder" style="position: static; height: auto; padding: 2rem 0;">Нет новых заявок на вступление.</p>';
        return;
    }
    container.innerHTML = `
        <table class="players-table">
            <thead><tr><th>Игрок</th><th>Дата заявки</th><th>Действия</th></tr></thead>
            <tbody>
                ${players.map(player => `
                    <tr>
                        <td data-label="Игрок">${player.nickname}</td>
                        <td data-label="Дата заявки">${new Date(player.date).toLocaleDateString()}</td>
                        <td data-label="Действия">
                            <button class="btn btn-primary approve-btn" data-id="${player.id}">Одобрить</button>
                            <button class="btn btn-secondary deny-btn" data-id="${player.id}">Отклонить</button>
                        </td>
                    </tr>`).join('')}
            </tbody>
        </table>`;

    container.querySelectorAll('.approve-btn').forEach(btn => btn.addEventListener('click', (e) => approvePlayer(e.target.dataset.id)));
    container.querySelectorAll('.deny-btn').forEach(btn => btn.addEventListener('click', (e) => denyPlayer(e.target.dataset.id)));
}

function approvePlayer(playerId) {
    fetch(`/api/players/${playerId}/approve`, { method: 'POST' })
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'success') {
                showSuccess('founder-content', 'Игрок успешно одобрен.');
                loadFounderPanel();
            } else { throw new Error(data.message); }
        })
        .catch(() => showError('founder-content', 'Не удалось одобрить игрока.'));
}

function denyPlayer(playerId) {
    fetch(`/api/players/${playerId}/deny`, { method: 'POST' })
        .then(response => response.ok ? response.json() : Promise.reject(response))
        .then(data => {
            if (data.status === 'success') {
                showSuccess('founder-content', 'Заявка игрока отклонена.');
                loadFounderPanel();
            } else { throw new Error(data.message); }
        })
        .catch(() => showError('founder-content', 'Не удалось отклонить заявку.'));
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
    if (!currentGuildId) {
        showError('general-dashboard', 'ID гильдии не определен');
        return;
    }
    skeletonHandler.show(['guild-avg-score', 'active-players', 'total-sessions']);
    try {
        const [guildStatsRes, totalSessionsRes, bestPlayerRes, roleDistRes, errorTypesRes, topErrorsRes, guildRankingRes, topPlayersRes] = await Promise.all([
            fetch(`/api/statistics/guild/${currentGuildId}`),
            fetch(`/api/statistics/total-sessions?guild_id=${currentGuildId}`),
            fetch(`/api/statistics/best-player-week?guild_id=${currentGuildId}`),
            fetch('/api/statistics/guild-role-distribution'),
            fetch('/api/statistics/guild-error-types'),
            fetch('/api/statistics/top-errors'),
            fetch('/api/statistics/guild-ranking'),
            fetch(`/api/guilds/${currentGuildId}/top-players?min_sessions=5`)
        ]);

        const [guildStats, totalSessions, bestPlayer, roleDist, errorTypes, topErrors, guildRanking, topPlayers] = await Promise.all([
            guildStatsRes.json(), totalSessionsRes.json(), bestPlayerRes.json(), roleDistRes.json(), errorTypesRes.json(), topErrorsRes.json(), guildRankingRes.json(), topPlayersRes.json()
        ]);
        
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
        showError('general-dashboard', 'Ошибка загрузки общей статистики');
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
    container.innerHTML = `
        <div class="spotlight-header">
            <i class="material-icons">emoji_events</i>
            <h4>Игрок недели</h4>
        </div>
        <div class="spotlight-body">
            <div class="spotlight-avatar">${player.nickname.charAt(0).toUpperCase()}</div>
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
    if (!data || data.roles.length === 0) {
        showEmptyState(canvasId, 'Нет данных о ролях в гильдии.');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    if (charts.guildRoleDist) charts.guildRoleDist.destroy();
    charts.guildRoleDist = new Chart(ctx, {
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
    if (!data || data.errors.length === 0) {
        showEmptyState(canvasId, 'В гильдии не зафиксировано ошибок.');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    if (charts.guildErrorTypes) charts.guildErrorTypes.destroy();
    charts.guildErrorTypes = new Chart(ctx, {
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
    if (!data || data.errors.length === 0) {
        showEmptyState(canvasId, 'Ошибок не найдено.', 'thumb_up');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    if (charts.topErrors) charts.topErrors.destroy();
    charts.topErrors = new Chart(ctx, {
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
    if (!data || data.guilds.length === 0) {
        showEmptyState(canvasId, 'Нет данных для рейтинга гильдий.');
        return;
    }
    const ctx = prepareChartContainer(canvasId);
    if (charts.guildRanking) charts.guildRanking.destroy();
    charts.guildRanking = new Chart(ctx, {
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
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
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
    document.getElementById('mentor-form')?.addEventListener('submit', e => {
        e.preventDefault();
        saveMentorSession();
    });
    document.querySelector('.star-rating')?.querySelectorAll('i').forEach(star => {
        star.addEventListener('click', () => {
            const rating = star.dataset.value;
            document.getElementById('score').value = rating;
            star.parentElement.querySelectorAll('i').forEach((s, i) => {
                s.classList.toggle('active', i < rating);
                s.textContent = i < rating ? 'star' : 'star_border';
            });
        });
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
        document.body.classList.remove('modal-open');
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
            <div class="chart-container"><canvas id="compare-trend-chart"></canvas></div>
            <div class="chart-container"><canvas id="compare-roles-chart"></canvas></div>
            <div class="chart-container"><canvas id="compare-errors-chart"></canvas></div>
        `;
        
        createCompareTrendChart(data, p1_id, p2_id);
        createCompareRolesChart(data, p1_id, p2_id);
        createCompareErrorsChart(data, p1_id, p2_id);
    } catch {
        showError('compare-modal', 'Не удалось сравнить игроков.');
    }
}

function createCompareTrendChart(data, p1_id, p2_id) {
    const p1_data = data[p1_id].trend, p2_data = data[p2_id].trend;
    const p1_name = document.querySelector(`#compare-player1-select option[value='${p1_id}']`).textContent;
    const p2_name = document.querySelector(`#compare-player2-select option[value='${p2_id}']`).textContent;
    
    const allWeeks = [...new Set([...p1_data.weeks, ...p2_data.weeks])].sort();
    const p1_scores = allWeeks.map(week => p1_data.scores[p1_data.weeks.indexOf(week)] || null);
    const p2_scores = allWeeks.map(week => p2_data.scores[p2_data.weeks.indexOf(week)] || null);

    const ctx = prepareChartContainer('compare-trend-chart');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: allWeeks,
            datasets: [
                { label: p1_name, data: p1_scores, borderColor: chartColors.primary, backgroundColor: chartColors.transparentPrimary, tension: 0.3 },
                { label: p2_name, data: p2_scores, borderColor: chartColors.secondary, backgroundColor: chartColors.transparentSecondary, tension: 0.3 }
            ]
        },
        options: { responsive: true, scales: {y: {min: 0, max: 10}}, plugins: { title: { display: true, text: 'Сравнение тренда оценок' }}}
    });
}

function createCompareRolesChart(data, p1_id, p2_id) {
    const p1_data = data[p1_id].roles, p2_data = data[p2_id].roles;
    const p1_name = document.querySelector(`#compare-player1-select option[value='${p1_id}']`).textContent;
    const p2_name = document.querySelector(`#compare-player2-select option[value='${p2_id}']`).textContent;

    const allRoles = [...new Set([...p1_data.roles, ...p2_data.roles])];
    const p1_scores = allRoles.map(role => p1_data.scores[p1_data.roles.indexOf(role)] || 0);
    const p2_scores = allRoles.map(role => p2_data.scores[p2_data.roles.indexOf(role)] || 0);

    const ctx = prepareChartContainer('compare-roles-chart');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: allRoles,
            datasets: [
                { label: p1_name, data: p1_scores, backgroundColor: chartColors.primary },
                { label: p2_name, data: p2_scores, backgroundColor: chartColors.secondary }
            ]
        },
        options: { responsive: true, scales: {y: {min: 0, max: 10}}, plugins: { title: { display: true, text: 'Сравнение по ролям' }}}
    });
}

function createCompareErrorsChart(data, p1_id, p2_id) {
    const p1_data = data[p1_id].errors, p2_data = data[p2_id].errors;
    const p1_name = document.querySelector(`#compare-player1-select option[value='${p1_id}']`).textContent;
    const p2_name = document.querySelector(`#compare-player2-select option[value='${p2_id}']`).textContent;

    const allErrors = [...new Set([...Object.keys(p1_data), ...Object.keys(p2_data)])];
    const p1_counts = allErrors.map(err => p1_data[err] || 0);
    const p2_counts = allErrors.map(err => p2_data[err] || 0);

    const ctx = prepareChartContainer('compare-errors-chart');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: allErrors,
            datasets: [
                { label: p1_name, data: p1_counts, backgroundColor: chartColors.primary },
                { label: p2_name, data: p2_counts, backgroundColor: chartColors.secondary }
            ]
        },
        options: { responsive: true, plugins: { title: { display: true, text: 'Сравнение по категориям ошибок' }}}
    });
}

function logout() {
    fetch('/api/auth/logout', { method: 'POST' }).finally(() => window.location.href = '/login.html');
}

function showError(containerId, message) {
    const container = document.getElementById(containerId) || document.body;
    // Prevent multiple error messages
    if (container.querySelector('.error-message')) return;
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    container.insertBefore(errorElement, container.firstChild);
    setTimeout(() => { errorElement.remove(); }, 5000);
}

function showSuccess(containerId, message) {
    const container = document.getElementById(containerId) || document.body;
    if (container.querySelector('.success-message')) return;
    const successElement = document.createElement('div');
    successElement.className = 'success-message';
    successElement.textContent = message;
    container.insertBefore(successElement, container.firstChild);
    setTimeout(() => { successElement.remove(); }, 3000);
}