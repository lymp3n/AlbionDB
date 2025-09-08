/**
 * auth.js — Модуль аутентификации
 */

function attemptLogin(event) {
    if (event) {
        event.preventDefault();
    }

    const nicknameInput = document.getElementById('nickname');
    const guildSelect = document.getElementById('guild');
    const passwordInput = document.getElementById('password');

    const nickname = nicknameInput.value.trim();
    const guild = guildSelect.value;
    const password = passwordInput.value.trim();

    if (!nickname || !guild || !password) {
        showError('Заполните все поля: Никнейм, Гильдия и Пароль.');
        return;
    }

    // Валидация никнейма
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


    const submitButton = document.querySelector('button[type="submit"]');
    let originalText = '';
    if (submitButton) {
        originalText = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="loader"></span> Вход...';
    }

    // ИЗМЕНЕНО: Отправляем только базовые данные. Сервер сам разберется.
    const requestData = {
        nickname,
        guild,
        password, 
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

function showError(message) {
    const errorElement = document.getElementById('login-error');
    if (!errorElement) return;
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    const parent = errorElement.parentElement;
    parent.style.animation = 'none';
    setTimeout(() => { parent.style.animation = 'shake 0.5s'; }, 10);
    setTimeout(() => { if (errorElement.style.display === 'block') { errorElement.style.display = 'none'; } }, 5000);
}

function resetButton(button, text) {
    if (button) {
        button.disabled = false;
        button.innerHTML = text;
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const savedTheme = localStorage.getItem('theme') || 'system';
    applyTheme(savedTheme);

    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', attemptLogin);
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

function setupPasswordToggle() {
    const toggleBtn = document.querySelector('.password-toggle');
    if (!toggleBtn) return;
    const passwordInput = document.getElementById('password');
    if (!passwordInput) return;

    toggleBtn.addEventListener('click', function () {
        const icon = this.querySelector('.material-icons');
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.textContent = 'visibility_off';
        } else {
            passwordInput.type = 'password';
            icon.textContent = 'visibility';
        }
    });
}

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
