/**
 * auth.js — Модуль аутентификации
 * Отдельная логика для входа пользователя
 * Совместим с login.html (id: nickname, guild, code)
 */

function attemptLogin(event) {
    if (event) {
        event.preventDefault();
    }

    const nicknameInput = document.getElementById('nickname');
    const guildSelect = document.getElementById('guild');
    const codeInput = document.getElementById('code');
    const isFounderCheckbox = document.getElementById('is-founder-checkbox');
    const founderCodeInput = document.getElementById('founder-code');

    const nickname = nicknameInput.value.trim();
    const guild = guildSelect.value;
    const code = codeInput.value.trim();

    const founderCode = isFounderCheckbox.checked ? founderCodeInput.value.trim() : null;

    if (!nickname || !guild || !code) {
        showError('Заполните все обязательные поля');
        return;
    }

    if (isFounderCheckbox.checked && !founderCode) {
        showError('Введите секретный код основателя');
        founderCodeInput.focus();
        return;
    }

    if (!nicknameInput || !guildSelect || !codeInput) {
        showError('Критическая ошибка: элементы формы недоступны');
        return;
    }

    if (!nickname) {
        showError('Никнейм не может быть пустым');
        nicknameInput.focus();
        return;
    }

    if (nickname.length < 3 || nickname.length > 20) {
        showError('Никнейм должен содержать от 3 до 20 символов');
        nicknameInput.focus();
        return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(nickname)) {
        showError('Никнейм может содержать только буквы, цифры и подчеркивание');
        nicknameInput.focus();
        return;
    }

    if (!guild) {
        showError('Пожалуйста, выберите гильдию');
        guildSelect.focus();
        return;
    }

    if (!code) {
        showError('Код гильдии не может быть пустым');
        codeInput.focus();
        return;
    }

    if (code.length < 3) {
        showError('Код гильдии должен содержать не менее 3 символов');
        codeInput.focus();
        return;
    }

    const submitButton = document.querySelector('button[type="submit"]');
    let originalText = '';
    if (submitButton) {
        originalText = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="loader"></span> Вход...';
    }

    const requestData = {
        nickname,
        guild,
        code,
        founderCode 
    };


    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.error || `Ошибка сервера: ${response.status}`); });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // ИСПРАВЛЕНИЕ: Проверяем статус и решаем, куда перенаправить
            if (data.status === 'pending') {
                window.location.href = '/pending.html';
            } else {
                window.location.href = '/dashboard.html';
            }
        } else {
            showError(data.error || 'Ошибка входа');
            resetButton(submitButton, originalText);
        }
    })
    .catch(error => {
        showError(error.message || 'Ошибка соединения с сервером');
        resetButton(submitButton, originalText);
    });
}

/**
 * Показывает сообщение об ошибке
 * @param {string} message - Текст ошибки
 */
function showError(message) {
    const errorElement = document.getElementById('login-error');
    if (!errorElement) return;

    errorElement.textContent = message;
    errorElement.style.display = 'block';

    const parent = errorElement.parentElement;
    parent.style.animation = 'none';
    setTimeout(() => {
        parent.style.animation = 'shake 0.5s';
    }, 10);

    setTimeout(() => {
        if (errorElement.style.display === 'block') {
            errorElement.style.display = 'none';
        }
    }, 5000);
}

/**
 * Сбрасывает состояние кнопки после ошибки
 * @param {HTMLElement} button - Кнопка
 * @param {string} text - Исходный текст
 */
function resetButton(button, text) {
    if (button) {
        button.disabled = false;
        button.innerHTML = text;
    }
}

// === ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ DOM ===
document.addEventListener('DOMContentLoaded', function () {
    const savedTheme = localStorage.getItem('theme') || 'system';
    applyTheme(savedTheme);

    const form = document.getElementById('login-form');
    if (!form) {
        return;
    }

    form.addEventListener('submit', attemptLogin);

    const isFounderCheckbox = document.getElementById('is-founder-checkbox');
    const founderCodeGroup = document.getElementById('founder-code-group');
    if(isFounderCheckbox && founderCodeGroup) {
        isFounderCheckbox.addEventListener('change', () => {
            founderCodeGroup.style.display = isFounderCheckbox.checked ? 'block' : 'none';
        });
    }
    
    form.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            attemptLogin();
        }
    });

    const nicknameInput = document.getElementById('nickname');
    if (nicknameInput) {
        setTimeout(() => nicknameInput.focus(), 300);
    }

    setTimeout(() => {
        document.querySelector('.login-container').style.opacity = '1';
    }, 100);

    setupPasswordToggle();

    fetch('/api/guilds')
        .then(response => response.json())
        .then(data => {
            const guildSelect = document.getElementById('guild');
            guildSelect.innerHTML = '<option value="" disabled selected>Выберите гильдию</option>';
            data.guilds.forEach(guild => {
                const option = document.createElement('option');
                option.value = guild.name;
                option.textContent = guild.name;
                guildSelect.appendChild(option);
            });
        })
        .catch(() => showError('Ошибка загрузки гильдий'));
});

/**
 * Настраивает кнопку показа/скрытия пароля
 */
function setupPasswordToggle() {
    const toggleBtn = document.querySelector('.password-toggle');
    if (!toggleBtn) return;
    
    const codeInput = document.getElementById('code');
    if (!codeInput) return;

    toggleBtn.addEventListener('click', function () {
        const icon = this.querySelector('.material-icons');
        if (codeInput.type === 'password') {
            codeInput.type = 'text';
            icon.textContent = 'visibility_off';
        } else {
            codeInput.type = 'password';
            icon.textContent = 'visibility';
        }
    });
}


// Применение темы
function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
        document.documentElement.removeAttribute('data-theme');
    } else if (theme === 'system') {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (systemPrefersDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }
}