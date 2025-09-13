import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, request, jsonify, send_from_directory, render_template, redirect, session, g, Response
from flask_cors import CORS
import os
import datetime
import io
import csv
import re
import traceback
import logging
import hashlib
from functools import wraps
from collections import defaultdict

# --- CONFIGURATION ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, template_folder='templates', static_folder='static')
app.secret_key = 'your-super-secret-key-that-is-long-and-random'
CORS(app, resources={r"/api/*": {"origins": "*"}})

DB_PATH = 'data/database.db'
AVATAR_UPLOAD_FOLDER = 'static/avatars'
app.config['AVATAR_UPLOAD_FOLDER'] = AVATAR_UPLOAD_FOLDER


# --- DATABASE MANAGEMENT ---
def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = psycopg2.connect(
            host=os.environ.get('DB_HOST'),
            database=os.environ.get('DB_NAME'),
            user=os.environ.get('DB_USER'),
            password=os.environ.get('DB_PASSWORD'),
            port=os.environ.get('DB_PORT'),
            cursor_factory=RealDictCursor
        )
        # <<< ВРЕМЕННО: Закомментирована проверка для первоначальной инициализации >>>
        # with db.cursor() as cursor:
        #     cursor.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'players');")
        #     if not cursor.fetchone()[0]:
        #         init_db()
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

# --- AUTH DECORATORS ---
def management_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'player_id' not in session:
            return jsonify({'status': 'error', 'message': 'Authentication required'}), 401
        player_id = session['player_id']
        db = get_db()
        cursor = db.cursor()
        cursor.execute("SELECT status, guild_id FROM players WHERE id = %s", (player_id,))
        player = cursor.fetchone()
        if not player:
            return jsonify({'status': 'error', 'message': 'Player not found'}), 401
        if player['status'] not in ['founder', 'mentor']:
            return jsonify({'status': 'error', 'message': 'Access denied: Founder or Mentor rights required'}), 403
        g.management_guild_id = player['guild_id']
        return f(*args, **kwargs)
    return decorated_function

def login_required(f):
    """Decorator to ensure the user is logged in."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'player_id' not in session:
            return jsonify({'status': 'error', 'message': 'Authentication required'}), 401
        
        db = get_db()
        cursor = db.cursor()
        cursor.execute("SELECT id, status, guild_id FROM players WHERE id = %s", (session['player_id'],))
        player = cursor.fetchone()

        if not player:
            session.pop('player_id', None) # Clean up invalid session
            return jsonify({'status': 'error', 'message': 'Player not found'}), 401
        
        g.player = player # Attach player info to the global context
        return f(*args, **kwargs)
    return decorated_function

# --- BUG FIX: Renamed and updated decorator to include 'наставник' ---
def goal_privilege_required(f):
    """Decorator to ensure the user can create/delete goals ('mentor', 'founder', 'наставник')."""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        if g.player['status'] not in ['mentor', 'founder', 'наставник']:
            return jsonify({'status': 'error', 'message': 'Access denied: Privileged rights required'}), 403
        return f(*args, **kwargs)
    return decorated_function

def founder_required(f):
    """Decorator to ensure the user is a guild founder."""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        if g.player['status'] != 'founder':
            return jsonify({'status': 'error', 'message': 'Access denied: Founder rights required'}), 403
        
        g.founder_guild_id = g.player['guild_id'] 
        return f(*args, **kwargs)
    return decorated_function

def privilege_required(f):
    """Декоратор, проверяющий, что пользователь - Наставник, Ментор или Основатель."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'player_id' not in session:
            return jsonify({'status': 'error', 'message': 'Authentication required'}), 401
        player_id = session['player_id']
        cursor = get_db().cursor()
        cursor.execute("SELECT status, guild_id FROM players WHERE id = %s", (player_id,))
        player = cursor.fetchone()
        if not player or player['status'] not in ['mentor', 'founder', 'наставник']:
            return jsonify({'status': 'error', 'message': 'Доступ запрещен. Требуются права Наставника, Ментора или Основателя.'}), 403
        
        g.current_player_id = player_id
        g.current_player_status = player['status']
        g.current_player_guild_id = player['guild_id']
        return f(*args, **kwargs)
    return decorated_function


# --- DATABASE INITIALIZATION (PostgreSQL Version) ---
def init_db():
    with app.app_context():
        db = get_db()
        cursor = db.cursor()

        # В PostgreSQL внешние ключи включены по умолчанию, PRAGMA не нужна.
        # cursor.execute('PRAGMA foreign_keys = ON') # УДАЛЯЕМ эту строку

        # Создаем таблицу гильдий
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS guilds (
            id SERIAL PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            code TEXT NOT NULL,
            founder_code TEXT,
            mentor_code TEXT,
            tutor_code TEXT,
            kill_fame INTEGER DEFAULT 0,
            death_fame INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')

        # Создаем таблицу активности (онлайн)
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS online_activity (
            player_id INTEGER PRIMARY KEY,
            last_seen TIMESTAMP NOT NULL,
            FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
        )
        ''')

        # Создаем таблицу игроков
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS players (
            id SERIAL PRIMARY KEY,
            nickname TEXT UNIQUE NOT NULL,
            guild_id INTEGER NOT NULL,
            status TEXT DEFAULT 'active',
            balance INTEGER DEFAULT 0,
            mentor_id INTEGER,
            description TEXT,
            avatar_url TEXT,
            specialization TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
            FOREIGN KEY (mentor_id) REFERENCES players(id) ON DELETE SET NULL
        )
        ''')

        # Проверка и добавление колонки 'specialization', если ее нет
        # В PostgreSQL лучше использовать запрос к information_schema
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'players' AND column_name = 'specialization';
        """)
        if cursor.fetchone() is None:
            logger.info("Adding 'specialization' column to 'players' table.")
            cursor.execute("ALTER TABLE players ADD COLUMN specialization TEXT")

        # Создаем таблицу контента
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS content (
            id SERIAL PRIMARY KEY,
            name TEXT UNIQUE NOT NULL
        )
        ''')

        # Создаем таблицу сессий
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id SERIAL PRIMARY KEY,
            player_id INTEGER NOT NULL,
            content_id INTEGER NOT NULL,
            score REAL NOT NULL,
            role TEXT NOT NULL,
            error_types TEXT,
            work_on TEXT,
            comments TEXT,
            mentor_id INTEGER,
            session_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
            FOREIGN KEY (content_id) REFERENCES content(id),
            FOREIGN KEY (mentor_id) REFERENCES players(id)
        )
        ''')

        # Создаем таблицу рекомендаций
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS recommendations (
            id SERIAL PRIMARY KEY,
            player_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            priority TEXT DEFAULT 'medium',
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
        )
        ''')

        # Создаем таблицу целей (goals)
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS goals (
            id SERIAL PRIMARY KEY,
            player_id INTEGER NOT NULL,
            created_by_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'in_progress',
            due_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            -- Поля для динамического расчета прогресса
            metric TEXT,
            metric_target REAL,
            metric_start_value REAL,
            metric_content_id INTEGER,
            metric_role TEXT,

            FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by_id) REFERENCES players(id) ON DELETE SET NULL,
            FOREIGN KEY (metric_content_id) REFERENCES content(id) ON DELETE SET NULL
        )
        ''')

        # Создаем таблицу запросов помощи
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS help_requests (
            id SERIAL PRIMARY KEY,
            player_id INTEGER NOT NULL,
            guild_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
            FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
        )
        ''')

        # Проверка и добавление колонок в таблицу 'goals', если их нет
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'goals' AND column_name = 'metric';
        """)
        if cursor.fetchone() is None:
            logger.info("Adding dynamic metric columns to 'goals' table.")
            cursor.execute("ALTER TABLE goals ADD COLUMN metric TEXT")
            cursor.execute("ALTER TABLE goals ADD COLUMN metric_target REAL")
            cursor.execute("ALTER TABLE goals ADD COLUMN metric_start_value REAL")
            cursor.execute("ALTER TABLE goals ADD COLUMN metric_content_id INTEGER")
            cursor.execute("ALTER TABLE goals ADD COLUMN metric_role TEXT")

        # Заполняем таблицу гильдий, если она пуста
        cursor.execute("SELECT COUNT(*) FROM guilds")
        if cursor.fetchone()[0] == 0:
            guilds_data = [
                ("Grey Knights", "GK123", "FOUNDERGK_UIO123", "MENTORGK_UIO942", "TUTORGK_UIO051"),
                ("Mure", "MURE456", "FOUNDERMURE_UIO321", "MENTORMURE_UIO249", "TUTORMURE_UIO150")
            ]
            for name, code, founder_code, mentor_code, tutor_code in guilds_data:
                hashed_code = hashlib.sha256(code.encode()).hexdigest()
                hashed_founder_code = hashlib.sha256(founder_code.encode()).hexdigest()
                hashed_mentor_code = hashlib.sha256(mentor_code.encode()).hexdigest()
                hashed_tutor_code = hashlib.sha256(tutor_code.encode()).hexdigest()
                cursor.execute(
                    "INSERT INTO guilds (name, code, founder_code, mentor_code, tutor_code) VALUES (%s, %s, %s, %s, %s)",
                    (name, hashed_code, hashed_founder_code, hashed_mentor_code, hashed_tutor_code)
                )

        # Заполняем таблицу контента, если она пуста
        cursor.execute("SELECT COUNT(*) FROM content")
        if cursor.fetchone()[0] == 0:
            contents = ['Замки', 'Клаймы', 'Открытый мир', 'HG 5v5', 'Авалон', 'Скримы']
            cursor.executemany("INSERT INTO content (name) VALUES (%s)", [(c,) for c in contents])

        # Заполняем таблицу игроков, если она пуста
        cursor.execute("SELECT COUNT(*) FROM players")
        if cursor.fetchone()[0] == 0:
            cursor.execute("SELECT id FROM guilds WHERE name = 'Grey Knights'")
            grey_knights_id_row = cursor.fetchone()
            cursor.execute("SELECT id FROM guilds WHERE name = 'Mure'")
            mure_id_row = cursor.fetchone()

            if grey_knights_id_row and mure_id_row:
                grey_knights_id = grey_knights_id_row[0]
                mure_id = mure_id_row[0]

                players_to_insert = [
                    ("CORPUS", grey_knights_id, "founder", None, "Основатель гильдии Grey Knights", None, 'D-Tank/E-Tank'),
                    ("lympeen", grey_knights_id, "mentor", 1, "Ментор альянса", None, 'Support'),
                    ("VoldeDron", grey_knights_id, "active", 2, "Активный участник", None, None),
                    ("misterhe111", mure_id, "founder", None, "Основатель гильдии Mure", None, 'Healer')
                ]
                cursor.executemany(
                    "INSERT INTO players (nickname, guild_id, status, mentor_id, description, avatar_url, specialization) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    players_to_insert
                )
                logger.info("Successfully inserted initial players.")
            else:
                logger.error("Could not find required guilds 'Grey Knights' or 'Mure' to seed initial players.")

        db.commit()



# --- LOGGING MIDDLEWARE ---

@app.before_request
def log_request_info():
    """
    При каждом запросе обновляет время последней активности пользователя в базе данных.
    Использует INSERT OR REPLACE для атомарного обновления или вставки записи.
    """
    logger.debug(f"Request: {request.method} {request.path} | Session: {session}")
    if 'player_id' in session:
        try:
            db = get_db()
            cursor = db.cursor()
            # Эта команда обновит запись, если player_id уже существует, или создаст новую.
            cursor.execute(
                """
                INSERT INTO online_activity (player_id, last_seen)
                VALUES (%s, %s)
                ON CONFLICT (player_id)
                DO UPDATE SET last_seen = EXCLUDED.last_seen
                """,
                (session['player_id'], datetime.datetime.now(datetime.UTC))
            )
            db.commit()
        except Exception as e:
            logger.error(f"Failed to update online activity for player {session.get('player_id')}: {e}")

@app.after_request
def log_response_info(response):
    logger.debug(f"Response status: {response.status}")
    return response

# --- AUTHENTICATION ROUTES ---
@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.json
        nickname = data.get('nickname')
        guild_name = data.get('guild')
        password = data.get('password')

        if not all([nickname, guild_name, password]):
            return jsonify({'success': False, 'error': 'Все поля обязательны'}), 400

        db = get_db()
        cursor = db.cursor()
        
        cursor.execute('SELECT * FROM guilds WHERE name = %s', (guild_name,))
        guild = cursor.fetchone()
        if not guild:
            return jsonify({'success': False, 'error': 'Гильдия не найдена'}), 404

        cursor.execute('SELECT * FROM players WHERE nickname = %s', (nickname,))
        player = cursor.fetchone()
        
        hashed_password = hashlib.sha256(password.encode()).hexdigest()

        if player:
            if player['guild_id'] != guild['id']:
                return jsonify({'success': False, 'error': 'Игрок с таким ником существует, но в другой гильдии'}), 409

            status = player['status']
            required_code_hash = None
            
            if status == 'founder':
                required_code_hash = guild['founder_code']
            elif status == 'mentor':
                required_code_hash = guild['mentor_code']
            elif status == 'наставник':
                required_code_hash = guild['tutor_code']
            else: # active, pending
                required_code_hash = guild['code']

            if required_code_hash and hashed_password == required_code_hash:
                pass
            else:
                return jsonify({'success': False, 'error': 'Неверный пароль для вашего профиля'}), 401
        
        else:
            guild_code = guild['code']
            if hashed_password == guild_code:
                cursor.execute(
                    'INSERT INTO players (nickname, guild_id, status) VALUES (%s, %s, %s)',
                    (nickname, guild['id'], 'pending')
                )
                db.commit()
                player_id = cursor.lastrowid
                cursor.execute('SELECT * FROM players WHERE id = %s', (player_id,))
                player = cursor.fetchone()
            else:
                return jsonify({'success': False, 'error': 'Неверный код гильдии для регистрации'}), 401
        
        if not player:
             return jsonify({'success': False, 'error': "Не удалось создать или найти профиль игрока"}), 500

        session['player_id'] = player['id']
        return jsonify({
            'success': True, 'playerId': player['id'], 'playerName': player['nickname'],
            'guild': guild_name, 'status': player['status']
        })

    except Exception as e:
        logger.error(f"Error in login: {e}\n{traceback.format_exc()}")
        return jsonify({'success': False, 'error': "Внутренняя ошибка сервера"}), 500

@app.route('/api/auth/logout', methods=['POST'])
def logout_endpoint():
    session.pop('player_id', None)
    return jsonify({'success': True})

@app.route('/api/players/current/recent-sessions', methods=['GET'])
def get_my_recent_sessions():
    """Endpoint for players to get their own last 5 sessions."""
    if 'player_id' not in session:
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
    
    player_id = session['player_id']
    cursor = get_db().cursor()
    cursor.execute('''
        SELECT s.session_date, s.score, s.role, c.name as content_name
        FROM sessions s
        JOIN content c ON s.content_id = c.id
        WHERE s.player_id = %s
        ORDER BY s.session_date DESC
        LIMIT 5
    ''', (player_id,))
    sessions = cursor.fetchall()
    
    return jsonify({'status': 'success', 'sessions': [dict(row) for row in sessions]})

@app.route('/api/management/player-details/<int:player_id>', methods=['GET'])
@management_required
def get_player_details_for_management(player_id):
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT guild_id FROM players WHERE id = %s", (player_id,))
    target_player_guild = cursor.fetchone()
    
    if not target_player_guild or target_player_guild['guild_id'] != g.management_guild_id:
        return jsonify({'status': 'error', 'message': 'Player not found in your guild'}), 404

    cursor.execute("SELECT id, nickname, status, balance, created_at, mentor_id FROM players WHERE id = %s", (player_id,))
    player_profile = cursor.fetchone()

    cursor.execute('''
        SELECT s.session_date, s.score, s.role, s.comments, c.name as content_name, p_mentor.nickname as mentor_name
        FROM sessions s
        JOIN content c ON s.content_id = c.id
        LEFT JOIN players p_mentor ON s.mentor_id = p_mentor.id
        WHERE s.player_id = %s
        ORDER BY s.session_date DESC
        LIMIT 7
    ''', (player_id,))
    recent_sessions = cursor.fetchall()

    if not player_profile:
        return jsonify({'status': 'error', 'message': 'Player profile not found'}), 404

    return jsonify({
        'status': 'success',
        'profile': dict(player_profile),
        'sessions': [dict(row) for row in recent_sessions]
    })

# --- FOUNDER-SPECIFIC ROUTES ---
@app.route('/api/guilds/pending-players', methods=['GET'])
@founder_required
def get_pending_players():
    cursor = get_db().cursor()
    cursor.execute("SELECT id, nickname, created_at FROM players WHERE guild_id = %s AND status = 'pending' ORDER BY created_at DESC", (g.founder_guild_id,))
    players = cursor.fetchall()
    return jsonify({'status': 'success', 'players': [{'id': p['id'], 'nickname': p['nickname'], 'date': p['created_at']} for p in players]})

@app.route('/api/players/<int:player_id>/approve', methods=['POST'])
@founder_required
def approve_player(player_id):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("UPDATE players SET status = 'active' WHERE id = %s AND guild_id = %s AND status = 'pending'", (player_id, g.founder_guild_id))
    db.commit()
    if cursor.rowcount > 0:
        return jsonify({'status': 'success', 'message': 'Player approved'})
    return jsonify({'status': 'error', 'message': 'Player not found or not pending'}), 404

@app.route('/api/players/<int:player_id>/deny', methods=['POST'])
@founder_required
def deny_player(player_id):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("DELETE FROM players WHERE id = %s AND guild_id = %s AND status = 'pending'", (player_id, g.founder_guild_id))
    db.commit()
    if cursor.rowcount > 0:
        return jsonify({'status': 'success', 'message': 'Player denied and removed'})
    return jsonify({'status': 'error', 'message': 'Player not found or not pending'}), 404

@app.route('/api/players/<int:player_id>/promote', methods=['POST'])
@founder_required
def promote_player_to_tutor(player_id):
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT status FROM players WHERE id = %s AND guild_id = %s", (player_id, g.founder_guild_id))
    player = cursor.fetchone()

    if not player:
        return jsonify({'status': 'error', 'message': 'Игрок не найден в вашей гильдии.'}), 404
    
    if player['status'] != 'active':
        return jsonify({'status': 'error', 'message': 'Только активных игроков можно повысить.'}), 400

    cursor.execute("UPDATE players SET status = 'наставник' WHERE id = %s", (player_id,))
    db.commit()

    if cursor.rowcount > 0:
        return jsonify({'status': 'success', 'message': 'Игрок успешно повышен до наставника.'})
    
    return jsonify({'status': 'error', 'message': 'Не удалось повысить игрока.'}), 500

@app.route('/api/mentors/students/<int:student_id>/remove', methods=['POST'])
@privilege_required
def remove_student_assignment(student_id):
    db = get_db()
    cursor = db.cursor()

    if g.current_player_status in ['mentor', 'наставник']:
        cursor.execute("UPDATE players SET mentor_id = NULL WHERE id = %s AND mentor_id = %s", (student_id, g.current_player_id))
    elif g.current_player_status == 'founder':
        cursor.execute("UPDATE players SET mentor_id = NULL WHERE id = %s AND guild_id = %s", (student_id, g.current_player_guild_id))
    else:
        return jsonify({'status': 'error', 'message': 'Доступ запрещен.'}), 403

    db.commit()

    if cursor.rowcount > 0:
        return jsonify({'status': 'success', 'message': 'Ученик откреплен.'})
    
    return jsonify({'status': 'error', 'message': 'Ученик не найден или не является вашим учеником.'}), 404

# --- НОВЫЕ МАРШРУТЫ ДЛЯ УПРАВЛЕНИЯ ИГРОКАМИ ---
@app.route('/api/guilds/manageable-players', methods=['GET'])
@management_required
def get_manageable_players():
    """Возвращает всех игроков (кроме текущего) для управления."""
    cursor = get_db().cursor()
    # <<< ИСПРАВЛЕНИЕ: Заменено JOIN на LEFT JOIN для стабильности
    cursor.execute("""
        SELECT p.id, p.nickname, p.status, p.created_at, g.name as guild_name
        FROM players p
        LEFT JOIN guilds g ON p.guild_id = g.id
        WHERE p.status != 'pending' AND p.id != %s
        ORDER BY p.nickname ASC
    """, (session['player_id'],))
    players = cursor.fetchall()
    return jsonify({'status': 'success', 'players': [dict(p) for p in players]})


@app.route('/api/players/<int:player_id>', methods=['DELETE'])
@founder_required
def delete_player(player_id):
    """Удаляет игрока из системы. Только для основателя."""
    db = get_db()
    cursor = db.cursor()
    
    cursor.execute("SELECT guild_id, status FROM players WHERE id = %s", (player_id,))
    player_to_delete = cursor.fetchone()

    if not player_to_delete:
        return jsonify({'status': 'error', 'message': 'Player not found'}), 404
    
    if player_to_delete['guild_id'] != g.founder_guild_id:
        return jsonify({'status': 'error', 'message': 'You can only delete players from your own guild'}), 403

    if player_to_delete['status'] == 'founder':
        return jsonify({'status': 'error', 'message': 'Founder cannot be deleted'}), 403

    cursor.execute("DELETE FROM players WHERE id = %s", (player_id,))
    db.commit()
    
    if cursor.rowcount > 0:
        return jsonify({'status': 'success', 'message': 'Player successfully deleted'})
    
    return jsonify({'status': 'error', 'message': 'Failed to delete player'}), 500


# --- HTML & STATIC FILE SERVING ---
@app.route('/')
def index():
    if 'player_id' not in session:
        return redirect('/login.html')
    
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT status FROM players WHERE id = %s", (session['player_id'],))
    player = cursor.fetchone()

    if player and player['status'] == 'pending':
        return redirect('/pending.html')
        
    return redirect('/dashboard.html')

@app.route('/<path:filename>')
def serve_page(filename):
    if filename == 'login.html':
        if 'player_id' in session:
            return redirect('/') 
        return render_template('login.html')

    if 'player_id' not in session:
        return redirect('/login.html')

    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT status FROM players WHERE id = %s", (session['player_id'],))
    player = cursor.fetchone()
    player_status = player['status'] if player else None

    if player_status == 'pending':
        if filename != 'pending.html':
            return redirect('/pending.html')
    elif player_status in ['active', 'mentor', 'founder', 'наставник']:
        if filename == 'pending.html':
            return redirect('/dashboard.html')
            
    if filename in ['dashboard.html', 'pending.html']:
        return render_template(filename)
        
    return send_from_directory(app.static_folder, filename)

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

# --- UTILITY FUNCTIONS ---
def get_date_filter(period_str):
    """Returns an SQL condition for date filtering."""
    if period_str == '7':
        return " AND session_date >= DATETIME('now', '-7 days')"
    elif period_str == '30':
        return " AND session_date >= DATETIME('now', '-30 days')"
    else: # 'all' or any other value
        return ""

ERROR_CATEGORIES = {
    'Позиционка': ['позиционк', 'позиция', 'далеко', 'положение', 'стоит не там', 'дистанция', 'кайт'],
    'Тайминг': ['тайминг', 'долго', 'не успеваешь', 'вовремя', 'поздно', 'реакция', 'быстрее', 'медленно'],
    'Механики': ['механик', 'кнопки', 'прожимаешь', 'ротация', 'умения', 'скиллы', 'кд', 'кулдаун', 'способност'],
    'Коммуникация': ['информаци', 'инфа', 'говоришь', 'колл', 'связь', 'микрофон', 'молчишь', 'координ']
}

def categorize_error_text(text):
    if not text:
        return []
    text_lower = text.lower()
    found_categories = set()
    for category, keywords in ERROR_CATEGORIES.items():
        for keyword in keywords:
            if keyword in text_lower:
                found_categories.add(category)
    if not found_categories:
        return ['Другое']
    return list(found_categories)

# +++ GOALS API ROUTES +++

def _calculate_dynamic_progress(goal_dict):
    """Рассчитывает прогресс цели на основе данных из сессий."""
    db = get_db()
    cursor = db.cursor()

    metric = goal_dict.get('metric')
    if not metric:
        return 0 # Если цель без метрики (простая задача), прогресс 0

    player_id = goal_dict['player_id']
    content_id = goal_dict.get('metric_content_id')
    role = goal_dict.get('metric_role')
    start_date = goal_dict['created_at']
    due_date = goal_dict['due_date']
    
    # Собираем базовый запрос и условия
    query_parts = ["FROM sessions WHERE player_id = %s AND session_date >= %s"]
    params = [player_id, start_date]

    if due_date:
        query_parts.append("AND session_date <= %s")
        params.append(due_date)
    if content_id:
        query_parts.append("AND content_id = %s")
        params.append(content_id)
    if role:
        query_parts.append("AND role = %s")
        params.append(role)

    full_query_suffix = " ".join(query_parts)

    # Вычисляем текущее значение метрики
    current_value = 0
    if metric == 'avg_score':
        cursor.execute(f"SELECT AVG(score) {full_query_suffix}", params)
        result = cursor.fetchone()
        current_value = result[0] if result and result[0] is not None else 0
    elif metric == 'session_count':
        cursor.execute(f"SELECT COUNT(id) {full_query_suffix}", params)
        result = cursor.fetchone()
        current_value = result[0] if result and result[0] is not None else 0
    
    # Рассчитываем прогресс в процентах
    start_value = goal_dict.get('metric_start_value') or 0
    target_value = goal_dict.get('metric_target') or 0

    if target_value <= start_value:
        # Если цель - удержать или улучшить значение, которое уже выше цели
        return 100 if current_value >= target_value else 0

    # Основная формула расчета прогресса
    progress = ((current_value - start_value) / (target_value - start_value)) * 100
    
    # Ограничиваем значение прогресса от 0 до 100
    return max(0, min(100, round(progress)))

# <<< ПРОВЕРКА: Убедитесь, что эта функция полностью заменена
@app.route('/api/mentors/my-students', methods=['GET'])
def get_my_students():
    if 'player_id' not in session:
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401

    cursor = get_db().cursor()
    query = """
        SELECT
            p.id,
            p.nickname,
            p.status,
            p.description,
            p.avatar_url,
            g.name as guild_name,
            (SELECT AVG(s.score) FROM sessions s WHERE s.player_id = p.id) as avg_score,
            (SELECT COUNT(s.id) FROM sessions s WHERE s.player_id = p.id) as session_count
        FROM players p
        LEFT JOIN guilds g ON p.guild_id = g.id
        WHERE p.mentor_id = %s
    """
    cursor.execute(query, (session['player_id'],))
    students = [dict(s) for s in cursor.fetchall()]
    return jsonify({'status': 'success', 'students': students})

# <<< ПРОВЕРКА: Убедитесь, что эта функция полностью заменена
@app.route('/api/goals/view', methods=['GET'])
@login_required
def get_goals_view():
    try:
        db = get_db()
        cursor = db.cursor()
        current_player = g.player

        # 1. Всегда получаем цели текущего пользователя
        cursor.execute("""
            SELECT g.*, p_creator.nickname as created_by_name 
            FROM goals g 
            LEFT JOIN players p_creator ON g.created_by_id = p_creator.id 
            WHERE g.player_id = %s 
            ORDER BY g.status ASC, g.due_date DESC, g.created_at DESC
        """, (current_player['id'],))
        
        my_goals_raw = cursor.fetchall()
        my_goals = []
        for goal_row in my_goals_raw:
            goal_dict = dict(goal_row)
            goal_dict['progress'] = _calculate_dynamic_progress(goal_dict)
            my_goals.append(goal_dict)

        response_data = {'my_goals': my_goals, 'student_goals': []}

        # 2. Если пользователь менеджер, получаем цели его учеников
        if current_player['status'] in ['mentor', 'founder', 'наставник']:
            managed_players = []
            if current_player['status'] in ['mentor', 'founder']:
                cursor.execute("""
                    SELECT p.id, p.nickname, p.status, p.avatar_url, g.name as guild_name 
                    FROM players p
                    LEFT JOIN guilds g ON p.guild_id = g.id
                    WHERE p.id != %s AND p.status != 'pending'
                """, (current_player['id'],))
                managed_players = cursor.fetchall()
            elif current_player['status'] == 'наставник':
                cursor.execute("""
                    SELECT p.id, p.nickname, p.status, p.avatar_url, g.name as guild_name 
                    FROM players p
                    LEFT JOIN guilds g ON p.guild_id = g.id
                    WHERE p.mentor_id = %s
                """, (current_player['id'],))
                managed_players = cursor.fetchall()
            
            student_goals_data = []
            managed_player_ids = [p['id'] for p in managed_players]
            if managed_player_ids:
                placeholders = ','.join('%s' * len(managed_player_ids))
                goals_query = f"""
                    SELECT g.*, p_creator.nickname as created_by_name 
                    FROM goals g 
                    LEFT JOIN players p_creator ON g.created_by_id = p_creator.id 
                    WHERE g.player_id IN ({placeholders})
                    ORDER BY g.player_id, g.status ASC, g.due_date DESC
                """
                cursor.execute(goals_query, managed_player_ids)
                all_student_goals_raw = cursor.fetchall()
                
                goals_by_player = defaultdict(list)
                for goal_row in all_student_goals_raw:
                    goal_dict = dict(goal_row)
                    goal_dict['progress'] = _calculate_dynamic_progress(goal_dict)
                    goals_by_player[goal_dict['player_id']].append(goal_dict)

                for player in managed_players:
                    player_data = dict(player)
                    player_data['goals'] = goals_by_player.get(player['id'], [])
                    student_goals_data.append(player_data)
            
            response_data['student_goals'] = student_goals_data

        return jsonify({'status': 'success', 'data': response_data})

    except Exception as e:
        logger.error(f"Error in /api/goals/view: {e}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'message': "Internal server error"}), 500


@app.route('/api/goals', methods=['POST'])
@goal_privilege_required
def create_goal():
    data = request.json
    player_id = data.get('playerId')
    title = data.get('title')
    description = data.get('description')
    due_date_str = data.get('dueDate')
    metric = data.get('metric')
    metric_target = data.get('targetValue')
    metric_content_id = data.get('contentId')
    metric_role = data.get('role')

    if not all([player_id, title]):
        return jsonify({'status': 'error', 'message': 'Player ID and title are required'}), 400

    db = get_db()
    cursor = db.cursor()
    
    # --- Логика для расчета стартового значения метрики ---
    start_value = 0
    if metric:
        query_parts = ["FROM sessions WHERE player_id = %s"]
        params = [player_id]
        if metric_content_id:
            query_parts.append("AND content_id = %s")
            params.append(metric_content_id)
        if metric_role:
            query_parts.append("AND role = %s")
            params.append(metric_role)
        
        query_suffix = " ".join(query_parts)
        if metric == 'avg_score':
            cursor.execute(f"SELECT AVG(score) {query_suffix}", params)
            result = cursor.fetchone()
            start_value = result[0] if result and result[0] is not None else 0
        elif metric == 'session_count':
            cursor.execute(f"SELECT COUNT(id) {query_suffix}", params)
            result = cursor.fetchone()
            start_value = result[0] if result and result[0] is not None else 0

    due_date = None
    if due_date_str:
        try:
            due_date = datetime.datetime.strptime(due_date_str, '%Y-%m-%d').strftime('%Y-%m-%d %H:%M:%S')
        except ValueError:
            return jsonify({'status': 'error', 'message': 'Invalid date format. Use YYYY-MM-DD.'}), 400

    cursor.execute(
        """INSERT INTO goals 
            (player_id, created_by_id, title, description, due_date, metric, metric_target, metric_start_value, metric_content_id, metric_role) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (player_id, g.player['id'], title, description, due_date, metric, metric_target, start_value, metric_content_id, metric_role)
    )
    db.commit()
    return jsonify({'status': 'success', 'message': 'Goal created successfully'})

@app.route('/api/goals/<int:goal_id>', methods=['PUT'])
@goal_privilege_required # Только менеджеры могут редактировать цели
def update_goal(goal_id):
    data = request.json
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT * FROM goals WHERE id = %s", (goal_id,))
    goal = cursor.fetchone()
    if not goal:
        return jsonify({'status': 'error', 'message': 'Goal not found'}), 404
    
    # Обновляем только текстовые поля и дату, так как метрики не должны меняться
    title = data.get('title', goal['title'])
    description = data.get('description', goal['description'])
    due_date_str = data.get('dueDate', goal['due_date'])
    
    due_date = goal['due_date']
    if due_date_str:
        try: 
            due_date = datetime.datetime.strptime(due_date_str, '%Y-%m-%d').strftime('%Y-%m-%d %H:%M:%S')
        except (ValueError, TypeError): 
            pass

    cursor.execute(
        "UPDATE goals SET title = %s, description = %s, due_date = %s WHERE id = %s",
        (title, description, due_date, goal_id)
    )
    db.commit()
    return jsonify({'status': 'success', 'message': 'Goal updated successfully'})

@app.route('/api/goals/<int:goal_id>', methods=['DELETE'])
@goal_privilege_required
def delete_goal(goal_id):
    db = get_db()
    cursor = db.cursor()
    
    cursor.execute("SELECT player_id FROM goals WHERE id = %s", (goal_id,))
    goal = cursor.fetchone()
    if not goal:
        return jsonify({'status': 'error', 'message': 'Goal not found'}), 404

    cursor.execute("SELECT guild_id, mentor_id FROM players WHERE id = %s", (goal['player_id'],))
    target_player = cursor.fetchone()

    is_allowed = False
    if g.player['status'] in ['mentor', 'founder']:
        if target_player and target_player['guild_id'] == g.player['guild_id']:
            is_allowed = True
    elif g.player['status'] == 'наставник':
        if target_player and target_player['mentor_id'] == g.player['id']:
            is_allowed = True

    if not is_allowed:
        return jsonify({'status': 'error', 'message': 'You do not have permission to delete this goal'}), 403

    cursor.execute("DELETE FROM goals WHERE id = %s", (goal_id,))
    db.commit()
    
    if cursor.rowcount > 0:
        return jsonify({'status': 'success', 'message': 'Goal deleted'})
    return jsonify({'status': 'error', 'message': 'Goal could not be deleted'}), 404


# --- GENERAL API ROUTES ---
@app.route('/api/system/status', methods=['GET'])
def system_status():
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT MAX(session_date) as last_update FROM sessions')
    last_update = cursor.fetchone()['last_update'] or 'N/A'
    cursor.execute('SELECT COUNT(*) as total_players FROM players')
    total_players = cursor.fetchone()['total_players']
    cursor.execute("SELECT COUNT(*) as total_mentors FROM players WHERE status IN ('mentor', 'founder', 'наставник')")
    total_mentors = cursor.fetchone()['total_mentors']
    
    user_status = 'offline'
    if 'player_id' in session:
        cursor.execute("SELECT status FROM players WHERE id = %s", (session['player_id'],))
        player = cursor.fetchone()
        user_status = player['status'] if player else 'offline'

    return jsonify({
        'status': 'online', 
        'user_status': user_status,
        'version': '1.5.1', # Version bump
        'last_update': last_update, 'total_players': total_players, 'total_mentors': total_mentors
    })

# Что заменить: app.py -> функция @app.route('/api/system/online-members', methods=['GET'])

@app.route('/api/system/online-members', methods=['GET'])
def get_online_members():
    """
    Получает список онлайн-игроков из базы данных.
    1. Удаляет устаревшие записи (игроков, которых не было более 15 минут).
    2. Выбирает активных игроков и присоединяет их данные (имя, гильдия, аватар).
    3. Рассчитывает продолжительность их текущей сессии.
    """
    db = get_db()
    cursor = db.cursor()
    timeout_seconds = 15 * 60  # 15 минут

    try:
        # 1. Удаляем старые сессии, чтобы не запрашивать их каждый раз
        cursor.execute("DELETE FROM online_activity WHERE (strftime('%s', 'now') - strftime('%s', last_seen)) > %s", (timeout_seconds,))
        db.commit()

        # 2. Получаем всех активных игроков с их данными
        query = """
            SELECT 
                p.id, 
                p.nickname, 
                p.status, 
                p.avatar_url, 
                g.name as guild_name,
                oa.last_seen
            FROM online_activity oa
            JOIN players p ON oa.player_id = p.id
            LEFT JOIN guilds g ON p.guild_id = g.id
        """
        cursor.execute(query)
        
        online_members_list = []
        current_time = datetime.datetime.now(datetime.UTC)
        
        for player_row in cursor.fetchall():
            player = dict(player_row)
            last_seen_dt = datetime.datetime.fromisoformat(player['last_seen'])
            
            # 3. Рассчитываем продолжительность сессии в секундах
            duration_seconds = (current_time - last_seen_dt).total_seconds()

            online_members_list.append({
                'player_id': player['id'],
                'player_name': player['nickname'],
                'guild_name': player['guild_name'] or 'N/A',
                'status': player['status'],
                'avatar_url': player['avatar_url'],
                'duration_seconds': int(duration_seconds)
            })

        # Сортируем по продолжительности сессии
        online_members_list.sort(key=lambda x: x['duration_seconds'], reverse=True)
        
        return jsonify({'status': 'success', 'online_members': online_members_list})

    except Exception as e:
        logger.error(f"Error in get_online_members: {e}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'message': "Internal server error"}), 500


@app.route('/api/guilds', methods=['GET'])
def get_guilds():
    cursor = get_db().cursor()
    cursor.execute('SELECT id, name FROM guilds')
    return jsonify({'status': 'success', 'guilds': [dict(g) for g in cursor.fetchall()]})

@app.route('/api/guilds/<int:guild_id>', methods=['GET'])
def get_guild(guild_id):
    cursor = get_db().cursor()
    cursor.execute("SELECT g.*, (SELECT COUNT(*) FROM players WHERE guild_id = g.id) as members FROM guilds g WHERE g.id = %s", (guild_id,))
    guild = cursor.fetchone()
    if not guild:
        return jsonify({'status': 'error', 'message': 'Guild not found'}), 404
    return jsonify({'status': 'success', 'guild': dict(guild)})

@app.route('/api/guilds/<int:guild_id>/top-players', methods=['GET'])
def get_top_players(guild_id):
    min_sessions = request.args.get('min_sessions', 0, type=int)
    limit = request.args.get('limit', 10, type=int)
    cursor = get_db().cursor()
    
    # <<< ИЗМЕНЕНИЕ: Запрос теперь выбирает игроков из двух конкретных гильдий (альянса)
    query = '''
        SELECT p.id, p.nickname, p.avatar_url, AVG(s.score) as avg_score, COUNT(s.id) as session_count,
               (SELECT role FROM sessions WHERE player_id = p.id GROUP BY role ORDER BY COUNT(*) DESC LIMIT 1) as main_role
        FROM players p 
        LEFT JOIN sessions s ON p.id = s.player_id
        JOIN guilds g ON p.guild_id = g.id
        WHERE g.name IN ('Grey Knights', 'Mure')
        GROUP BY p.id HAVING session_count >= %s
    '''
    # guild_id больше не используется в параметрах запроса, но оставлен в URL для совместимости
    cursor.execute(query, (min_sessions,))
    players = [dict(row) for row in cursor.fetchall()]
    
    if players:
        valid_scores = [p['avg_score'] for p in players if p['avg_score'] is not None]
        valid_counts = [p['session_count'] for p in players]

        max_score_val = max(valid_scores) if valid_scores else 0
        max_count_val = max(valid_counts) if valid_counts else 0

        max_score = max_score_val if max_score_val > 0 else 1
        max_count = max_count_val if max_count_val > 0 else 1

        for p in players:
            p['rank'] = (0.7 * (p.get('avg_score') or 0) / max_score) + (0.3 * p['session_count'] / max_count)

        players.sort(key=lambda p: p['rank'], reverse=True)

    players_to_return = players if limit == 0 else players[:limit]
    return jsonify({'status': 'success', 'players': players_to_return})

@app.route('/api/players', methods=['GET'])
@login_required
def get_players():
    db = get_db()
    cursor = db.cursor()

    user_status = g.player['status']
    user_guild_id = g.player['guild_id']
    user_id = g.player['id']
        
    query_base = """
        SELECT
            p.id,
            p.nickname,
            p.avatar_url,
            p.status,
            m.nickname as mentor_name,
            COALESCE((SELECT COUNT(*) FROM goals WHERE player_id = p.id AND status = 'in_progress'), 0) as open_goals_count,
            COALESCE((SELECT COUNT(*) FROM goals WHERE player_id = p.id AND status = 'completed'), 0) as completed_goals_count
        FROM players p
        LEFT JOIN players m ON p.mentor_id = m.id
    """
    params = ()
    if user_status in ['mentor', 'founder']:
        query_where = "WHERE p.guild_id = %s AND p.status != 'pending'"
        params = (user_guild_id,)
    elif user_status == 'наставник':
        query_where = "WHERE p.mentor_id = %s"
        params = (user_id,)
    else: 
        query_where = "WHERE p.id = %s"
        params = (user_id,)
        
    query_order = "ORDER BY p.mentor_id IS NULL ASC, p.nickname ASC"
    final_query = f"{query_base} {query_where} {query_order}"
    
    cursor.execute(final_query, params)
    players = [dict(p) for p in cursor.fetchall()]
    return jsonify({'status': 'success', 'players': players})

@app.route('/api/players/current', methods=['GET'])
def get_current_player():
    if 'player_id' not in session:
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401

    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT p.*, g.name as guild_name, m.nickname as mentor_name
        FROM players p
        JOIN guilds g ON p.guild_id = g.id
        LEFT JOIN players m ON p.mentor_id = m.id
        WHERE p.id = %s
    """, (session['player_id'],))
    player = cursor.fetchone()

    if not player:
        session.pop('player_id', None)
        return jsonify({'status': 'error', 'message': 'Player not found'}), 404

    return jsonify({'status': 'success', 'player': {
        'id': player['id'],
        'nickname': player['nickname'],
        'status': player['status'],
        'balance': player['balance'],
        'guild': player['guild_name'],
        'guild_id': player['guild_id'],
        'created_at': player['created_at'],
        'mentor_name': player['mentor_name'],
        'description': player['description'],
        'avatar_url': player['avatar_url'],
        'specialization': player['specialization']
    }})


@app.route('/api/players/current/avatar', methods=['POST'])
def upload_avatar():
    if 'player_id' not in session:
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
    
    if 'avatar' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file part'}), 400
        
    file = request.files['avatar']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'No selected file'}), 400
        
    if file:
        filename = f"player_{session['player_id']}.png"
        filepath = os.path.join(app.config['AVATAR_UPLOAD_FOLDER'], filename)
        
        for ext in ['.png', '.jpg', '.jpeg', '.gif']:
            old_path = os.path.join(app.config['AVATAR_UPLOAD_FOLDER'], f"player_{session['player_id']}{ext}")
            if os.path.exists(old_path) and old_path != filepath:
                os.remove(old_path)
        
        file.save(filepath)
        avatar_url = f"/{filepath.replace(os.path.sep, '/')}"
        db = get_db()
        cursor = db.cursor()
        cursor.execute("UPDATE players SET avatar_url = %s WHERE id = %s", (avatar_url, session['player_id']))
        db.commit()
        return jsonify({'status': 'success', 'avatar_url': avatar_url})

    return jsonify({'status': 'error', 'message': 'File upload failed'}), 500

@app.route('/api/players/current/profile', methods=['POST'])
def update_current_player_profile():
    if 'player_id' not in session:
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
    
    data = request.json
    description = data.get('description')
    specialization = data.get('specialization')
    player_id = session['player_id']
    
    db = get_db()
    cursor = db.cursor()
    cursor.execute("UPDATE players SET description = %s, specialization = %s WHERE id = %s", 
                   (description, specialization, player_id))
    db.commit()
    
    if cursor.rowcount > 0:
        return jsonify({'status': 'success', 'message': 'Профиль успешно обновлен.'})
    
    return jsonify({'status': 'error', 'message': 'Не удалось обновить профиль.'}), 500


@app.route('/api/players/<int:player_id>/export', methods=['GET'])
def export_player_data(player_id):
    cursor = get_db().cursor()
    cursor.execute('SELECT s.*, c.name as content_name FROM sessions s JOIN content c ON s.content_id = c.id WHERE s.player_id = %s', (player_id,))
    sessions = cursor.fetchall()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Date', 'Content', 'Role', 'Score', 'Error Types', 'Work On', 'Comments'])
    for s in sessions:
        writer.writerow([s['id'], s['session_date'], s['content_name'], s['role'], s['score'], s['error_types'], s['work_on'], s['comments']])
    output.seek(0)
    return Response(output.getvalue(), mimetype='text/csv', headers={"Content-disposition": f"attachment; filename=player_{player_id}_data.csv"})

@app.route('/api/players/<int:player_id>/sessions', methods=['GET'])
def get_player_sessions(player_id):
    cursor = get_db().cursor()
    query = """
        SELECT s.session_date, s.score, s.role, s.error_types, c.name as content_name
        FROM sessions s
        JOIN content c ON s.content_id = c.id
        WHERE s.player_id = %s
        ORDER BY s.session_date DESC
        LIMIT 5
    """
    cursor.execute(query, (player_id,))
    sessions = [dict(s) for s in cursor.fetchall()]
    return jsonify({'status': 'success', 'sessions': sessions})


@app.route('/api/guilds/<int:guild_id>/role-ratings', methods=['GET'])
def get_role_ratings(guild_id):
    db = get_db()
    cursor = db.cursor()
    roles = ['D-Tank', 'E-Tank', 'Healer', 'Support', 'DPS', 'Battlemount']
    ratings = {}
    
    for role in roles:
        query = """
            SELECT p.nickname, AVG(s.score) as avg_score, COUNT(s.id) as session_count
            FROM sessions s
            JOIN players p ON s.player_id = p.id
            WHERE p.guild_id = %s AND s.role = %s
            GROUP BY s.player_id
            HAVING session_count >= 3
            ORDER BY avg_score DESC
            LIMIT 5
        """
        cursor.execute(query, (guild_id, role))
        players = cursor.fetchall()
        ratings[role] = [{'nickname': p['nickname'], 'avg_score': round(p['avg_score'], 2)} for p in players]
        
    return jsonify({'status': 'success', 'ratings': ratings})

@app.route('/api/content', methods=['GET'])
def get_content():
    cursor = get_db().cursor()
    cursor.execute('SELECT id, name FROM content')
    return jsonify({'status': 'success', 'content': [dict(c) for c in cursor.fetchall()]})


@app.route('/api/sessions', methods=['POST'])
@privilege_required 
def save_session():
    data = request.json
    required = ['playerId', 'contentId', 'score', 'role']
    if not all(field in data for field in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
    player_id_to_log = data.get('playerId')

    db = get_db()
    cursor = db.cursor()
    cursor.execute('''
        INSERT INTO sessions (player_id, content_id, score, role, error_types, work_on, comments, mentor_id, session_date)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    ''', (
        player_id_to_log, data['contentId'], data['score'], data['role'],
        data.get('errorTypes'), data.get('workOn'), data.get('comments'),
        session.get('player_id'), 
        data.get('sessionDate', datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    ))
    db.commit()

    return jsonify({'status': 'success', 'message': 'Session saved.'})

# --- STATISTICS API ROUTES ---

@app.route('/api/statistics/player/<int:player_id>', methods=['GET'])
def get_player_stats(player_id):
    period = request.args.get('period', '7')
    date_filter = get_date_filter(period)
    
    query = f"SELECT AVG(score) as avg_score, COUNT(*) as session_count, MAX(session_date) as last_update FROM sessions WHERE player_id = %s {date_filter}"
    
    cursor = get_db().cursor()
    cursor.execute(query, (player_id,))
    stats = cursor.fetchone()
    return jsonify({'status': 'success', 'avgScore': stats['avg_score'] or 0, 'sessionCount': stats['session_count'], 'lastUpdate': stats['last_update']})

@app.route('/api/statistics/comparison/<int:player_id>', methods=['GET'])
def get_comparison_with_average(player_id):
    try:
        cursor = get_db().cursor()
        period = request.args.get('period', 'all')
        date_filter = get_date_filter(period)

        cursor.execute(f"SELECT AVG(score) as avg_score FROM sessions WHERE player_id = %s {date_filter}", (player_id,))
        player_score_row = cursor.fetchone()
        player_score = (player_score_row['avg_score'] or 0) if player_score_row else 0
        
        query = f"""
            SELECT MAX(avg_score) as best_player_score FROM (
                SELECT AVG(s.score) as avg_score 
                FROM players p 
                JOIN sessions s ON p.id = s.player_id 
                WHERE p.guild_id = (SELECT guild_id FROM players WHERE id = %s) {date_filter.replace("AND", "AND s.")}
                GROUP BY p.id
            )"""
        cursor.execute(query, (player_id,))
        top_row = cursor.fetchone()
        best_player_score = (top_row['best_player_score'] or 0) if top_row else 0

        return jsonify({'status': 'success', 'playerScore': round(player_score, 2), 'bestPlayerScore': round(best_player_score, 2)})
    except Exception as e:
        logger.error(f"Error in get_comparison_with_average: {e}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'message': "Internal server error"}), 500

def _get_player_comparison_stats(player_id):
    cursor = get_db().cursor()
    cursor.execute("SELECT AVG(score) as avg_score, COUNT(id) as session_count FROM sessions WHERE player_id = %s", (player_id,))
    stats = cursor.fetchone()
    
    cursor.execute("SELECT error_types, work_on FROM sessions WHERE player_id = %s", (player_id,))
    error_counts = defaultdict(int)
    for row in cursor.fetchall():
        full_text = f"{row['error_types'] or ''} {row['work_on'] or ''}"
        categories = categorize_error_text(full_text)
        for category in categories:
            error_counts[category] += 1
            
    return {
        'score': stats['avg_score'] or 0,
        'sessions': stats['session_count'] or 0,
        'errors': dict(error_counts)
    }

@app.route('/api/statistics/full-comparison', methods=['GET'])
def full_compare_two_players():
    player1_id = request.args.get('p1', type=int)
    player2_id = request.args.get('p2', type=int)

    if not player1_id or not player2_id:
        return jsonify({'status': 'error', 'message': 'Two player IDs are required'}), 400

    p1_trend = get_player_trend(player1_id, as_json=False)
    p2_trend = get_player_trend(player2_id, as_json=False)
    
    p1_roles = get_player_role_scores(player1_id, as_json=False)
    p2_roles = get_player_role_scores(player2_id, as_json=False)
    
    p1_errors = _get_player_comparison_stats(player1_id)['errors']
    p2_errors = _get_player_comparison_stats(player2_id)['errors']

    return jsonify({
        'status': 'success',
        str(player1_id): {
            'trend': p1_trend,
            'roles': p1_roles,
            'errors': p1_errors
        },
        str(player2_id): {
            'trend': p2_trend,
            'roles': p2_roles,
            'errors': p2_errors
        }
    })

@app.route('/api/statistics/player-trend/<int:player_id>', methods=['GET'])
def get_player_trend(player_id, as_json=True):
    period = request.args.get('period', '30' if as_json else 'all')
    date_filter = get_date_filter(period)
    
    query = f"SELECT strftime('%Y-%W', session_date) as week, AVG(score) as avg_score FROM sessions WHERE player_id = %s {date_filter} GROUP BY week ORDER BY week"
    
    cursor = get_db().cursor()
    cursor.execute(query, (player_id,))
    rows = cursor.fetchall()
    
    data = {'weeks': [r['week'] for r in rows], 'scores': [round(r['avg_score'] or 0, 2) for r in rows]}
    return jsonify({'status': 'success', **data}) if as_json else data

@app.route('/api/statistics/player-role-scores/<int:player_id>', methods=['GET'])
def get_player_role_scores(player_id, as_json=True):
    period = request.args.get('period', 'all')
    date_filter = get_date_filter(period)
    
    query = f"SELECT role, AVG(score) as avg_score FROM sessions WHERE player_id = %s {date_filter} GROUP BY role ORDER BY avg_score DESC"
    
    cursor = get_db().cursor()
    cursor.execute(query, (player_id,))
    rows = cursor.fetchall()
    
    data = {'roles': [r['role'] for r in rows], 'scores': [round(r['avg_score'] or 0, 2) for r in rows]}
    return jsonify({'status': 'success', **data}) if as_json else data


@app.route('/api/statistics/player-content-scores/<int:player_id>', methods=['GET'])
def get_player_content_scores(player_id):
    period = request.args.get('period', 'all')
    date_filter = get_date_filter(period)
    
    query = f"""
        SELECT c.name as content, AVG(s.score) as avg_score 
        FROM sessions s JOIN content c ON s.content_id = c.id 
        WHERE s.player_id = %s {date_filter.replace("AND", "AND s.")} 
        GROUP BY c.id ORDER BY avg_score DESC
    """
    
    cursor = get_db().cursor()
    cursor.execute(query, (player_id,))
    rows = cursor.fetchall()
    return jsonify({'status': 'success', 'contents': [r['content'] for r in rows], 'scores': [round(r['avg_score'] or 0, 2) for r in rows]})

@app.route('/api/statistics/player-error-types/<int:player_id>', methods=['GET'])
def get_player_error_types(player_id):
    period = request.args.get('period', 'all')
    date_filter = get_date_filter(period)
    
    query = f"SELECT error_types, work_on FROM sessions WHERE player_id = %s AND (error_types IS NOT NULL AND error_types != '' OR work_on IS NOT NULL AND work_on != '') {date_filter}"
    
    cursor = get_db().cursor()
    cursor.execute(query, (player_id,))
    
    error_counts = defaultdict(int)
    for row in cursor.fetchall():
        full_text = f"{row['error_types'] or ''}, {row['work_on'] or ''}"
        categories = categorize_error_text(full_text)
        for category in categories:
            error_counts[category] += 1
            
    return jsonify({'status': 'success', 'errors': list(error_counts.keys()), 'counts': list(error_counts.values())})


@app.route('/api/statistics/error-distribution/<int:player_id>', methods=['GET'])
def get_error_distribution(player_id):
    period = request.args.get('period', 'all')
    date_filter = get_date_filter(period)
    
    query = f"""
        SELECT c.name as content, COUNT(s.id) as count
        FROM sessions s
        JOIN content c ON s.content_id = c.id
        WHERE s.player_id = %s AND (s.error_types IS NOT NULL AND s.error_types != '' OR s.work_on IS NOT NULL AND s.work_on != '') {date_filter.replace("AND", "AND s.")}
        GROUP BY c.name
    """
    cursor = get_db().cursor()
    cursor.execute(query, (player_id,))
    rows = cursor.fetchall()
    return jsonify({'status': 'success', 'contents': [r['content'] for r in rows], 'counts': [r['count'] for r in rows]})

@app.route('/api/statistics/error-score-correlation/<int:player_id>', methods=['GET'])
def get_error_score_correlation(player_id):
    period = request.args.get('period', 'all')
    date_filter = get_date_filter(period)
    
    query = f"SELECT score, error_types, work_on FROM sessions WHERE player_id = %s {date_filter}"
    
    cursor = get_db().cursor()
    cursor.execute(query, (player_id,))
    points = []
    for row in cursor.fetchall():
        error_count = 0
        if row['error_types']:
            error_count += len([e for e in row['error_types'].split(',') if e.strip()])
        if row['work_on']:
            error_count += len([e for e in row['work_on'].split(',') if e.strip()])
        points.append({'errors': error_count, 'score': row['score']})
    return jsonify({'status': 'success', 'points': points})

@app.route('/api/recommendations/player/<int:player_id>', methods=['GET'])
def get_player_recommendations(player_id):
    cursor = get_db().cursor()
    cursor.execute("SELECT * FROM recommendations WHERE player_id = %s", (player_id,))
    recs = cursor.fetchall()
    return jsonify({'status': 'success', 'recommendations': [dict(r) for r in recs]})

@app.route('/api/statistics/guild-role-distribution', methods=['GET'])
def get_guild_role_distribution():
    cursor = get_db().cursor()
    cursor.execute("SELECT role, COUNT(*) as count FROM sessions GROUP BY role")
    rows = cursor.fetchall()
    return jsonify({'status': 'success', 'roles': [r['role'] for r in rows], 'counts': [r['count'] for r in rows]})

@app.route('/api/statistics/guild-error-types', methods=['GET'])
def get_guild_error_types():
    cursor = get_db().cursor()
    cursor.execute("SELECT error_types, work_on FROM sessions WHERE (error_types IS NOT NULL AND error_types != '') OR (work_on IS NOT NULL AND work_on != '')")
    error_counts = defaultdict(int)
    for row in cursor.fetchall():
        full_text = f"{row['error_types'] or ''}, {row['work_on'] or ''}"
        categories = categorize_error_text(full_text)
        for category in categories:
            error_counts[category] += 1
            
    return jsonify({'status': 'success', 'errors': list(error_counts.keys()), 'counts': list(error_counts.values())})

@app.route('/api/statistics/top-errors', methods=['GET'])
def get_top_errors():
    cursor = get_db().cursor()
    cursor.execute("SELECT error_types, work_on FROM sessions WHERE (error_types IS NOT NULL AND error_types != '') OR (work_on IS NOT NULL AND work_on != '')")
    error_counts = defaultdict(int)
    for row in cursor.fetchall():
        full_text = f"{row['error_types'] or ''}, {row['work_on'] or ''}"
        categories = categorize_error_text(full_text)
        for category in categories:
            error_counts[category] += 1

    sorted_errors = sorted(error_counts.items(), key=lambda item: item[1], reverse=True)
    return jsonify({'status': 'success', 'errors': [e[0] for e in sorted_errors], 'counts': [e[1] for e in sorted_errors]})

@app.route('/api/statistics/guild/<int:guild_id>', methods=['GET'])
def get_guild_stats(guild_id):
    cursor = get_db().cursor()
    cursor.execute("SELECT COUNT(DISTINCT p.id) as active_players, COUNT(s.id) as session_count, AVG(s.score) as avg_score FROM players p LEFT JOIN sessions s ON p.id = s.player_id WHERE p.guild_id = %s AND s.session_date >= DATETIME('now', '-30 days')", (guild_id,))
    stats = cursor.fetchone()
    return jsonify({'status': 'success', 'activePlayers': stats['active_players'] or 0, 'sessionCount': stats['session_count'] or 0, 'avgScore': stats['avg_score'] or 0})

@app.route('/api/statistics/guild-ranking', methods=['GET'])
def get_guild_ranking():
    cursor = get_db().cursor()
    cursor.execute("SELECT g.name as guild, AVG(s.score) as avg_score FROM guilds g LEFT JOIN players p ON g.id = p.guild_id LEFT JOIN sessions s ON p.id = s.player_id WHERE s.id IS NOT NULL GROUP BY g.id ORDER BY avg_score DESC")
    rows = cursor.fetchall()
    return jsonify({'status': 'success', 'guilds': [r['guild'] for r in rows], 'scores': [round(r['avg_score'] or 0, 2) for r in rows]})

@app.route('/api/statistics/best-player-week', methods=['GET'])
def get_best_player_week():
    guild_id = request.args.get('guild_id', type=int)
    if not guild_id: return jsonify({'status': 'error', 'message': 'guild_id required'}), 400
    
    cursor = get_db().cursor()
    query = """
        WITH PlayerWeekStats AS (
            SELECT
                p.id,
                p.nickname,
                p.avatar_url,
                AVG(s.score) as avg_score,
                (SELECT role FROM sessions WHERE player_id = p.id AND session_date >= DATETIME('now', '-7 days') GROUP BY role ORDER BY COUNT(*) DESC LIMIT 1) as main_role,
                (SELECT c.name FROM sessions s_c JOIN content c ON s_c.content_id = c.id WHERE s_c.player_id = p.id AND s_c.session_date >= DATETIME('now', '-7 days') GROUP BY c.id ORDER BY AVG(s_c.score) DESC LIMIT 1) as best_content
            FROM sessions s
            JOIN players p ON s.player_id = p.id
            WHERE s.session_date >= DATETIME('now', '-7 days') AND p.guild_id = %s
            GROUP BY p.id
            HAVING COUNT(s.id) >= 3
        )
        SELECT * FROM PlayerWeekStats ORDER BY avg_score DESC LIMIT 1
    """
    cursor.execute(query, (guild_id,))
    player = cursor.fetchone()
    
    if player:
        return jsonify({'status': 'success', 'player': dict(player)})
    return jsonify({'status': 'success', 'player': None})

@app.route('/api/mentoring/requests/count', methods=['GET'])
@privilege_required
def get_help_requests_count():
    guild_id = g.current_player_guild_id
    cursor = get_db().cursor()
    cursor.execute("SELECT COUNT(*) FROM help_requests WHERE guild_id = %s AND status = 'pending'", (guild_id,))
    count = cursor.fetchone()[0]
    return jsonify({'status': 'success', 'count': count})

@app.route('/api/statistics/total-sessions', methods=['GET'])
def get_total_sessions():
    guild_id = request.args.get('guild_id')
    cursor = get_db().cursor()
    
    guild_sessions = 0
    if guild_id:
        cursor.execute("SELECT COUNT(s.id) FROM sessions s JOIN players p ON s.player_id = p.id WHERE p.guild_id = %s", (guild_id,))
        result = cursor.fetchone()
        if result:
            guild_sessions = result[0]
            
    cursor.execute("SELECT COUNT(id) FROM sessions")
    total_sessions = cursor.fetchone()[0]
    
    return jsonify({'status': 'success', 'guild_sessions': guild_sessions, 'total': total_sessions})

@app.errorhandler(404)
def not_found_error(error):
    return jsonify({'status': 'error', 'message': 'Resource not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}\n{traceback.format_exc()}")
    return jsonify({'status': 'error', 'message': 'Internal server error'}), 500


@app.route('/api/mentors/students/<int:student_id>', methods=['POST'])
@management_required
def assign_student(student_id):
    mentor_id = session['player_id']
    db = get_db()
    cursor = db.cursor()
    cursor.execute("UPDATE players SET mentor_id = %s WHERE id = %s AND guild_id = %s", 
                   (mentor_id, student_id, g.management_guild_id))
    db.commit()
    if cursor.rowcount > 0:
        return jsonify({'status': 'success', 'message': 'Ученик назначен'})
    return jsonify({'status': 'error', 'message': 'Не удалось назначить ученика. Возможно, он из другой гильдии.'}), 404


@app.route('/api/mentoring/request-help', methods=['POST'])
def request_mentor_help():
    if 'player_id' not in session:
        return jsonify({'status': 'error', 'message': 'Authentication required'}), 401
    
    player_id = session['player_id']
    db = get_db()
    cursor = db.cursor()
    
    cursor.execute("SELECT guild_id FROM players WHERE id = %s", (player_id,))
    player = cursor.fetchone()
    if not player:
        return jsonify({'status': 'error', 'message': 'Player not found'}), 404
    guild_id = player['guild_id']

    cursor.execute("SELECT id FROM help_requests WHERE player_id = %s AND status = 'pending'", (player_id,))
    existing_request = cursor.fetchone()
    if existing_request:
        return jsonify({'status': 'error', 'message': 'У вас уже есть активный запрос о помощи.'}), 409
        
    cursor.execute("INSERT INTO help_requests (player_id, guild_id) VALUES (%s, %s)", (player_id, guild_id))
    db.commit()
    
    return jsonify({'status': 'success', 'message': 'Запрос о помощи отправлен менторам.'})

@app.route('/api/mentoring/requests', methods=['GET'])
@privilege_required
def get_help_requests():
    guild_id = g.current_player_guild_id
    cursor = get_db().cursor()
    
    query = """
        SELECT hr.id, p.nickname, hr.created_at
        FROM help_requests hr
        JOIN players p ON hr.player_id = p.id
        WHERE hr.guild_id = %s AND hr.status = 'pending'
        ORDER BY hr.created_at ASC
    """
    cursor.execute(query, (guild_id,))
    requests = cursor.fetchall()
    
    return jsonify({'status': 'success', 'requests': [dict(req) for req in requests]})

@app.route('/api/mentoring/requests/<int:request_id>/review', methods=['POST'])
@privilege_required
def mark_request_as_reviewed(request_id):
    guild_id = g.current_player_guild_id
    db = get_db()
    cursor = db.cursor()

    cursor.execute("UPDATE help_requests SET status = 'reviewed' WHERE id = %s AND guild_id = %s", (request_id, guild_id))
    db.commit()
    
    if cursor.rowcount > 0:
        return jsonify({'status': 'success', 'message': 'Запрос отмечен как рассмотренный'})
    return jsonify({'status': 'error', 'message': 'Запрос не найден или у вас нет прав на его изменение'}), 404

@app.route('/api/mentors', methods=['GET'])
def get_mentors():
    db = get_db()
    cursor = db.cursor()
    
    cursor.execute("SELECT id, nickname FROM players WHERE status IN ('mentor', 'founder')")
    mentors_raw = cursor.fetchall()
    mentors = {m['id']: {'id': m['id'], 'nickname': m['nickname'], 'mentees': []} for m in mentors_raw}
    
    cursor.execute("SELECT mentor_id, nickname FROM players WHERE mentor_id IS NOT NULL")
    mentees = cursor.fetchall()
    
    for mentee in mentees:
        if mentee['mentor_id'] in mentors:
            mentors[mentee['mentor_id']]['mentees'].append(mentee['nickname'])
            
    return jsonify({'status': 'success', 'mentors': list(mentors.values())})

@app.route('/api/management/assign-mentor', methods=['POST'])
@privilege_required
def assign_mentor_to_player():
    data = request.json
    student_id = data.get('studentId')
    mentor_id = data.get('mentorId')
    
    if not student_id or not mentor_id:
        return jsonify({'status': 'error', 'message': 'studentId and mentorId are required'}), 400

    db = get_db()
    cursor = db.cursor()
    cursor.execute("UPDATE players SET mentor_id = %s WHERE id = %s AND guild_id = %s", 
                   (mentor_id, student_id, g.current_player_guild_id))
    db.commit()
    
    if cursor.rowcount > 0:
        return jsonify({'status': 'success', 'message': 'Наставник успешно назначен.'})
    
    return jsonify({'status': 'error', 'message': 'Не удалось назначить наставника. Проверьте данные.'}), 404


@app.route('/api/mentors/my-mentees', methods=['GET'])
def get_my_mentees():
    if 'player_id' not in session:
        return jsonify({'status': 'error', 'message': 'Authentication required'}), 401
    mentor_id = session['player_id']
    cursor = get_db().cursor()
    cursor.execute("SELECT id, nickname, status FROM players WHERE mentor_id = %s", (mentor_id,))
    mentees = cursor.fetchall()
    return jsonify({'status': 'success', 'mentees': [dict(m) for m in mentees]})

@app.route('/api/management/assignment-info', methods=['GET'])
@privilege_required
def get_assignment_info():
    db = get_db()
    cursor = db.cursor()
    
    # <<< ИЗМЕНЕНИЕ: Убран фильтр по guild_id
    cursor.execute("""
        SELECT id, nickname 
        FROM players 
        WHERE status = 'active' AND mentor_id IS NULL
    """)
    unassigned_players = [dict(p) for p in cursor.fetchall()]
    
    # <<< ИЗМЕНЕНИЕ: Убран фильтр по guild_id
    cursor.execute("""
        SELECT 
            p.id, 
            p.nickname, 
            p.avatar_url,
            p.specialization,
            (SELECT COUNT(*) FROM players WHERE mentor_id = p.id) as student_count
        FROM players p
        WHERE p.status IN ('mentor', 'founder', 'наставник')
    """)
    mentors = [dict(m) for m in cursor.fetchall()]

    return jsonify({
        'status': 'success',
        'unassignedPlayers': unassigned_players,
        'mentors': mentors
    })

@app.route('/api/statistics/global-top-players', methods=['GET'])
def get_global_top_players():
    min_sessions = request.args.get('min_sessions', 0, type=int)
    limit = request.args.get('limit', 10, type=int)
    cursor = get_db().cursor()
    query = '''
        SELECT p.id, p.nickname, p.avatar_url, AVG(s.score) as avg_score, COUNT(s.id) as session_count,
               (SELECT role FROM sessions WHERE player_id = p.id GROUP BY role ORDER BY COUNT(*) DESC LIMIT 1) as main_role
        FROM players p 
        LEFT JOIN sessions s ON p.id = s.player_id
        GROUP BY p.id HAVING session_count >= %s
    '''
    cursor.execute(query, (min_sessions,))
    players = [dict(row) for row in cursor.fetchall()]
    
    if players:
        valid_scores = [p['avg_score'] for p in players if p['avg_score'] is not None]
        valid_counts = [p['session_count'] for p in players]

        max_score_val = max(valid_scores) if valid_scores else 0
        max_count_val = max(valid_counts) if valid_counts else 0

        max_score = max_score_val if max_score_val > 0 else 1
        max_count = max_count_val if max_count_val > 0 else 1

        for p in players:
            p['rank'] = (0.7 * (p.get('avg_score') or 0) / max_score) + (0.3 * p['session_count'] / max_count)

        players.sort(key=lambda p: p['rank'], reverse=True)

    players_to_return = players if limit == 0 else players[:limit]
    return jsonify({'status': 'success', 'players': players_to_return})


@app.route('/api/guilds/comparable-players', methods=['GET'])
def get_comparable_players():
    if 'player_id' not in session:
        return jsonify({'status': 'error', 'message': 'Authentication required'}), 401
    
    player_id = session['player_id']
    cursor = get_db().cursor()

    cursor.execute("SELECT guild_id FROM players WHERE id = %s", (player_id,))
    player_guild = cursor.fetchone()
    if not player_guild:
        return jsonify({'status': 'error', 'message': 'Player not found'}), 404

    cursor.execute("SELECT id, nickname FROM players WHERE guild_id = %s ORDER BY nickname ASC", (player_guild['guild_id'],))
    players = cursor.fetchall()
    return jsonify({'status': 'success', 'players': [dict(p) for p in players]})


@app.route('/init-db', methods=['GET'])
def manual_init_db():
    try:
        with app.app_context():
            init_db()
        return jsonify({'status': 'success', 'message': 'Database initialized successfully.'})
    except Exception as e:
        logger.error(f"Manual DB init failed: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    os.makedirs('data', exist_ok=True)
    os.makedirs(AVATAR_UPLOAD_FOLDER, exist_ok=True)
    with app.app_context():
        init_db()
    app.run(port=3000, debug=True)
