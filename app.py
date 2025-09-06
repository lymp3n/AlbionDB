import sqlite3
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

# --- CONFIGURATION ---
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__, template_folder='templates', static_folder='static')
app.secret_key = 'your-super-secret-key-that-is-long-and-random'
CORS(app, resources={r"/api/*": {"origins": "*"}})

DB_PATH = 'data/database.db'

# --- DATABASE MANAGEMENT ---
def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

# --- AUTH DECORATORS ---
def founder_required(f):
    """Decorator to ensure the user is a guild founder."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'player_id' not in session:
            return jsonify({'status': 'error', 'message': 'Authentication required'}), 401

        player_id = session['player_id']
        db = get_db()
        cursor = db.cursor()
        cursor.execute("SELECT status, guild_id FROM players WHERE id = ?", (player_id,))
        player = cursor.fetchone()

        if not player:
            return jsonify({'status': 'error', 'message': 'Player not found'}), 401
        
        if player['status'] != 'founder':
            return jsonify({'status': 'error', 'message': 'Access denied: Founder rights required'}), 403

        g.founder_guild_id = player['guild_id']
        return f(*args, **kwargs)
    return decorated_function

# --- DATABASE INITIALIZATION ---
def init_db():
    with app.app_context():
        db = get_db()
        cursor = db.cursor()
        cursor.execute('PRAGMA foreign_keys = ON')
        
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS guilds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            code TEXT NOT NULL,
            founder_code TEXT,
            kill_fame INTEGER DEFAULT 0,
            death_fame INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nickname TEXT UNIQUE NOT NULL,
            guild_id INTEGER NOT NULL,
            status TEXT DEFAULT 'active',
            balance INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
        )
        ''')
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS content (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)
        ''')
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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

        cursor.execute('CREATE INDEX IF NOT EXISTS idx_sessions_player ON sessions(player_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_players_guild ON players(guild_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(session_date)')

        # Создание гильдий, если их нет
        if cursor.execute("SELECT COUNT(*) FROM guilds").fetchone()[0] == 0:
            guilds_data = [
                ("Grey Knights", "GK123", "SECRET_GK_123"),
                ("Mure", "MURE456", "SECRET_MURE_456")
            ]
            for name, code, founder_code in guilds_data:
                hashed_code = hashlib.sha256(code.encode()).hexdigest()
                hashed_founder_code = hashlib.sha256(founder_code.encode()).hexdigest()
                cursor.execute("INSERT INTO guilds (name, code, founder_code) VALUES (?, ?, ?)", (name, hashed_code, hashed_founder_code))

        # Создание типов контента, если их нет
        if cursor.execute("SELECT COUNT(*) FROM content").fetchone()[0] == 0:
            contents = ['Замки', 'Клаймы', 'Открытый мир', 'HG 5v5', 'Авалон', 'Скримы']
            cursor.executemany("INSERT INTO content (name) VALUES (?)", [(c,) for c in contents])

        # +++ НАЧАЛО: ИЗМЕНЕННЫЙ БЛОК СОЗДАНИЯ ИГРОКОВ +++
        # Создание только указанных игроков, если таблица пуста
        if cursor.execute("SELECT COUNT(*) FROM players").fetchone()[0] == 0:
            # Получаем ID гильдий
            cursor.execute("SELECT id FROM guilds WHERE name = 'Grey Knights'")
            grey_knights_id_row = cursor.fetchone()
            
            cursor.execute("SELECT id FROM guilds WHERE name = 'Mure'")
            mure_id_row = cursor.fetchone()

            # Проверяем, что гильдии существуют
            if grey_knights_id_row and mure_id_row:
                grey_knights_id = grey_knights_id_row[0]
                mure_id = mure_id_row[0]

                # Список игроков для добавления
                # Статус 'member' соответствует статусу 'active' в вашей системе
                players_to_insert = [
                    ("CORPUS", grey_knights_id, "founder"),
                    ("lympeen", grey_knights_id, "mentor"),
                    ("VoldeDron", grey_knights_id, "active"),
                    ("misterhe111", mure_id, "founder")
                ]
                
                # Добавляем игроков в базу данных
                cursor.executemany("INSERT INTO players (nickname, guild_id, status) VALUES (?, ?, ?)", players_to_insert)
                logger.info("Successfully inserted initial players.")
            else:
                logger.error("Could not find required guilds 'Grey Knights' or 'Mure' to seed initial players.")
        # +++ КОНЕЦ: ИЗМЕНЕННЫЙ БЛОК +++

        db.commit()


# --- LOGGING MIDDLEWARE ---
@app.before_request
def log_request_info():
    logger.debug(f"Request: {request.method} {request.path} | Session: {session}")

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
        code = data.get('code')
        founder_code = data.get('founderCode')

        if not all([nickname, guild_name, code]):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400

        db = get_db()
        cursor = db.cursor()
        hashed_code = hashlib.sha256(code.encode()).hexdigest()
        cursor.execute('SELECT * FROM guilds WHERE name = ? AND code = ?', (guild_name, hashed_code))
        guild = cursor.fetchone()
        
        if not guild:
            return jsonify({'success': False, 'error': 'Invalid guild code or guild not found'}), 401

        cursor.execute('SELECT * FROM players WHERE nickname = ?', (nickname,))
        player = cursor.fetchone()

        if player:
            if player['guild_id'] != guild['id']:
                return jsonify({'success': False, 'error': 'This nickname is already taken in another guild'}), 409
        else:
            final_status = 'pending'
            if founder_code:
                if not guild['founder_code']:
                    return jsonify({'success': False, 'error': 'No founder code is set for this guild'}), 403
                
                hashed_founder_code = hashlib.sha256(founder_code.encode()).hexdigest()
                if hashed_founder_code != guild['founder_code']:
                    return jsonify({'success': False, 'error': 'Invalid secret founder code'}), 403
                
                cursor.execute("SELECT 1 FROM players WHERE guild_id = ? AND status = 'founder'", (guild['id'],))
                if cursor.fetchone():
                    return jsonify({'success': False, 'error': 'A founder for this guild already exists'}), 409
                
                final_status = 'founder'
            
            cursor.execute('INSERT INTO players (nickname, guild_id, status) VALUES (?, ?, ?)', (nickname, guild['id'], final_status))
            db.commit()
            player_id = cursor.lastrowid
            cursor.execute('SELECT * FROM players WHERE id = ?', (player_id,))
            player = cursor.fetchone()

        session['player_id'] = player['id']
        return jsonify({
            'success': True, 'playerId': player['id'], 'playerName': player['nickname'],
            'guild': guild_name, 'status': player['status']
        })

    except Exception as e:
        logger.error(f"Error in login: {e}\n{traceback.format_exc()}")
        return jsonify({'success': False, 'error': "Internal server error"}), 500

@app.route('/api/auth/logout', methods=['POST'])
def logout_endpoint():
    session.pop('player_id', None)
    return jsonify({'success': True})

# --- FOUNDER-SPECIFIC ROUTES ---
@app.route('/api/guilds/pending-players', methods=['GET'])
@founder_required
def get_pending_players():
    cursor = get_db().cursor()
    cursor.execute("SELECT id, nickname, created_at FROM players WHERE guild_id = ? AND status = 'pending' ORDER BY created_at DESC", (g.founder_guild_id,))
    players = cursor.fetchall()
    return jsonify({'status': 'success', 'players': [{'id': p['id'], 'nickname': p['nickname'], 'date': p['created_at']} for p in players]})

@app.route('/api/players/<int:player_id>/approve', methods=['POST'])
@founder_required
def approve_player(player_id):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("UPDATE players SET status = 'active' WHERE id = ? AND guild_id = ? AND status = 'pending'", (player_id, g.founder_guild_id))
    db.commit()
    if cursor.rowcount > 0:
        return jsonify({'status': 'success', 'message': 'Player approved'})
    return jsonify({'status': 'error', 'message': 'Player not found or not pending'}), 404

@app.route('/api/players/<int:player_id>/deny', methods=['POST'])
@founder_required
def deny_player(player_id):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("DELETE FROM players WHERE id = ? AND guild_id = ? AND status = 'pending'", (player_id, g.founder_guild_id))
    db.commit()
    if cursor.rowcount > 0:
        return jsonify({'status': 'success', 'message': 'Player denied and removed'})
    return jsonify({'status': 'error', 'message': 'Player not found or not pending'}), 404

# --- HTML & STATIC FILE SERVING ---
@app.route('/')
def index():
    if 'player_id' not in session:
        return redirect('/login.html')
    
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT status FROM players WHERE id = ?", (session['player_id'],))
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
    cursor.execute("SELECT status FROM players WHERE id = ?", (session['player_id'],))
    player = cursor.fetchone()
    player_status = player['status'] if player else None

    if player_status == 'pending':
        if filename != 'pending.html':
            return redirect('/pending.html')
    elif player_status in ['active', 'mentor', 'founder']:
        if filename == 'pending.html':
            return redirect('/dashboard.html')
            
    if filename in ['dashboard.html', 'pending.html']:
        return render_template(filename)
        
    return send_from_directory(app.static_folder, filename)


@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

# --- GENERAL API ROUTES ---
@app.route('/api/system/status', methods=['GET'])
def system_status():
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT MAX(session_date) as last_update FROM sessions')
    last_update = cursor.fetchone()['last_update'] or 'N/A'
    cursor.execute('SELECT COUNT(*) as total_players FROM players')
    total_players = cursor.fetchone()['total_players']
    cursor.execute("SELECT COUNT(*) as total_mentors FROM players WHERE status IN ('mentor', 'founder')")
    total_mentors = cursor.fetchone()['total_mentors']
    
    user_status = 'offline'
    if 'player_id' in session:
        cursor.execute("SELECT status FROM players WHERE id = ?", (session['player_id'],))
        player = cursor.fetchone()
        user_status = player['status'] if player else 'offline'

    return jsonify({
        'status': 'online', 
        'user_status': user_status,
        'version': '1.2.0',
        'last_update': last_update, 'total_players': total_players, 'total_mentors': total_mentors
    })


@app.route('/api/guilds', methods=['GET'])
def get_guilds():
    cursor = get_db().cursor()
    cursor.execute('SELECT id, name FROM guilds')
    return jsonify({'status': 'success', 'guilds': [dict(g) for g in cursor.fetchall()]})

@app.route('/api/guilds/<int:guild_id>', methods=['GET'])
def get_guild(guild_id):
    cursor = get_db().cursor()
    cursor.execute("SELECT g.*, (SELECT COUNT(*) FROM players WHERE guild_id = g.id) as members FROM guilds g WHERE g.id = ?", (guild_id,))
    guild = cursor.fetchone()
    if not guild:
        return jsonify({'status': 'error', 'message': 'Guild not found'}), 404
    return jsonify({'status': 'success', 'guild': dict(guild)})

@app.route('/api/guilds/<int:guild_id>/top-players', methods=['GET'])
def get_top_players(guild_id):
    min_sessions = request.args.get('min_sessions', 0, type=int)
    limit = request.args.get('limit', 10, type=int)
    cursor = get_db().cursor()
    query = '''
        SELECT p.id, p.nickname, AVG(s.score) as avg_score, COUNT(s.id) as session_count,
               (SELECT role FROM sessions WHERE player_id = p.id GROUP BY role ORDER BY COUNT(*) DESC LIMIT 1) as main_role
        FROM players p LEFT JOIN sessions s ON p.id = s.player_id
        WHERE p.guild_id = ?
        GROUP BY p.id HAVING session_count >= ?
    '''
    cursor.execute(query, (guild_id, min_sessions))
    players = [dict(row) for row in cursor.fetchall()]
    
    if players:
        valid_scores = [p['avg_score'] for p in players if p['avg_score'] is not None]
        valid_counts = [p['session_count'] for p in players]
        max_score = max(valid_scores) if valid_scores else 1
        max_count = max(valid_counts) if valid_counts else 1
        for p in players:
            p['rank'] = (0.7 * (p.get('avg_score') or 0) / max_score) + (0.3 * p['session_count'] / max_count)
        players.sort(key=lambda p: p['rank'], reverse=True)

    players_to_return = players if limit == 0 else players[:limit]
    return jsonify({'status': 'success', 'players': players_to_return})

@app.route('/api/players', methods=['GET'])
def get_players():
    cursor = get_db().cursor()
    cursor.execute('SELECT p.id, p.nickname, g.name as guild_name FROM players p JOIN guilds g ON p.guild_id = g.id')
    return jsonify({'status': 'success', 'players': [dict(p) for p in cursor.fetchall()]})
    
@app.route('/api/players/current', methods=['GET'])
def get_current_player():
    if 'player_id' not in session:
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
    cursor = get_db().cursor()
    cursor.execute("SELECT p.*, g.name as guild_name FROM players p JOIN guilds g ON p.guild_id = g.id WHERE p.id = ?", (session['player_id'],))
    player = cursor.fetchone()
    if not player:
        return jsonify({'status': 'error', 'message': 'Player not found'}), 404
    return jsonify({'status': 'success', 'player': {
        'id': player['id'], 'nickname': player['nickname'], 'status': player['status'],
        'balance': player['balance'], 'guild': player['guild_name'], 'guild_id': player['guild_id'],
        'created_at': player['created_at']
    }})

@app.route('/api/players/<int:player_id>/export', methods=['GET'])
def export_player_data(player_id):
    cursor = get_db().cursor()
    cursor.execute('SELECT s.*, c.name as content_name FROM sessions s JOIN content c ON s.content_id = c.id WHERE s.player_id = ?', (player_id,))
    sessions = cursor.fetchall()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Date', 'Content', 'Role', 'Score', 'Error Types', 'Work On', 'Comments'])
    for s in sessions:
        writer.writerow([s['id'], s['session_date'], s['content_name'], s['role'], s['score'], s['error_types'], s['work_on'], s['comments']])
    output.seek(0)
    return Response(output.getvalue(), mimetype='text/csv', headers={"Content-disposition": f"attachment; filename=player_{player_id}_data.csv"})

@app.route('/api/content', methods=['GET'])
def get_content():
    cursor = get_db().cursor()
    cursor.execute('SELECT id, name FROM content')
    return jsonify({'status': 'success', 'content': [dict(c) for c in cursor.fetchall()]})

@app.route('/api/sessions', methods=['POST'])
def save_session():
    data = request.json
    required = ['playerId', 'contentId', 'score', 'role']
    if not all(field in data for field in required):
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    db = get_db()
    cursor = db.cursor()
    cursor.execute('''
        INSERT INTO sessions (player_id, content_id, score, role, error_types, work_on, comments, mentor_id, session_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['playerId'], data['contentId'], data['score'], data['role'],
        data.get('errorTypes'), data.get('workOn'), data.get('comments'),
        data.get('mentorId'), data.get('sessionDate', datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    ))
    db.commit()
    return jsonify({'status': 'success'})

# --- STATISTICS API ROUTES ---

@app.route('/api/statistics/player/<int:player_id>', methods=['GET'])
def get_player_stats(player_id):
    cursor = get_db().cursor()
    cursor.execute("SELECT AVG(score) as avg_score, COUNT(*) as session_count, MAX(session_date) as last_update FROM sessions WHERE player_id = ? AND session_date >= DATETIME('now', '-7 days')", (player_id,))
    stats = cursor.fetchone()
    return jsonify({'status': 'success', 'avgScore': stats['avg_score'] or 0, 'sessionCount': stats['session_count'], 'lastUpdate': stats['last_update']})

@app.route('/api/statistics/comparison/<int:player_id>', methods=['GET'])
def get_comparison_with_average(player_id):
    try:
        cursor = get_db().cursor()
        cursor.execute("SELECT AVG(score) as avg_score FROM sessions WHERE player_id = ?", (player_id,))
        player_score_row = cursor.fetchone()
        player_score = (player_score_row['avg_score'] or 0) if player_score_row else 0
        
        cursor.execute("""
            SELECT AVG(avg_score) as top_avg_score FROM (
                SELECT AVG(s.score) as avg_score FROM players p JOIN sessions s ON p.id = s.player_id 
                WHERE p.guild_id = (SELECT guild_id FROM players WHERE id = ?) GROUP BY p.id ORDER BY avg_score DESC LIMIT 10
            )""", (player_id,))
        
        top_row = cursor.fetchone()
        top_avg_score = (top_row['top_avg_score'] or 0) if top_row else 0

        return jsonify({'status': 'success', 'playerScore': round(player_score, 2), 'topAvgScore': round(top_avg_score, 2)})
    except Exception as e:
        logger.error(f"Error in get_comparison_with_average: {e}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'message': "Internal server error"}), 500
        
def _get_player_comparison_stats(player_id):
    """Вспомогательная функция для получения статистики для сравнения."""
    cursor = get_db().cursor()
    
    cursor.execute("SELECT AVG(score) as avg_score, COUNT(id) as session_count FROM sessions WHERE player_id = ?", (player_id,))
    stats = cursor.fetchone()
    
    cursor.execute("SELECT error_types FROM sessions WHERE player_id = ? AND error_types IS NOT NULL AND error_types != ''", (player_id,))
    total_errors = 0
    for row in cursor.fetchall():
        total_errors += len([e for e in row['error_types'].split(',') if e.strip()])
        
    return {
        'score': stats['avg_score'] or 0,
        'sessions': stats['session_count'] or 0,
        'errors': total_errors
    }

@app.route('/api/statistics/compare/<int:player1_id>/<int:player2_id>', methods=['GET'])
def compare_two_players(player1_id, player2_id):
    try:
        stats1 = _get_player_comparison_stats(player1_id)
        stats2 = _get_player_comparison_stats(player2_id)

        def safe_percent_diff(v1, v2, lower_is_better=False):
            if v2 == 0:
                return 100 if v1 > 0 else 0
            
            if lower_is_better:
                return ((v2 - v1) / v2) * 100
            else:
                return ((v1 - v2) / v2) * 100

        return jsonify({
            'status': 'success',
            'percent_scores': safe_percent_diff(stats1['score'], stats2['score']),
            'percent_errors': safe_percent_diff(stats1['errors'], stats2['errors'], lower_is_better=True),
            'percent_sessions': safe_percent_diff(stats1['sessions'], stats2['sessions'])
        })
    except Exception as e:
        logger.error(f"Error in compare_two_players: {e}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'message': "Internal server error"}), 500

@app.route('/api/statistics/player-trend/<int:player_id>', methods=['GET'])
def get_player_trend(player_id):
    cursor = get_db().cursor()
    cursor.execute("SELECT strftime('%Y-%W', session_date) as week, AVG(score) as avg_score FROM sessions WHERE player_id = ? AND session_date >= DATETIME('now', '-28 days') GROUP BY week ORDER BY week", (player_id,))
    rows = cursor.fetchall()
    return jsonify({'status': 'success', 'weeks': [r['week'] for r in rows], 'scores': [round(r['avg_score'] or 0, 2) for r in rows]})

@app.route('/api/statistics/player-role-scores/<int:player_id>', methods=['GET'])
def get_player_role_scores(player_id):
    cursor = get_db().cursor()
    cursor.execute("SELECT role, AVG(score) as avg_score FROM sessions WHERE player_id = ? GROUP BY role ORDER BY avg_score DESC", (player_id,))
    rows = cursor.fetchall()
    return jsonify({'status': 'success', 'roles': [r['role'] for r in rows], 'scores': [round(r['avg_score'] or 0, 2) for r in rows]})

@app.route('/api/statistics/player-content-scores/<int:player_id>', methods=['GET'])
def get_player_content_scores(player_id):
    cursor = get_db().cursor()
    cursor.execute("SELECT c.name as content, AVG(s.score) as avg_score FROM sessions s JOIN content c ON s.content_id = c.id WHERE s.player_id = ? GROUP BY c.id ORDER BY avg_score DESC", (player_id,))
    rows = cursor.fetchall()
    return jsonify({'status': 'success', 'contents': [r['content'] for r in rows], 'scores': [round(r['avg_score'] or 0, 2) for r in rows]})

@app.route('/api/statistics/player-error-types/<int:player_id>', methods=['GET'])
def get_player_error_types(player_id):
    cursor = get_db().cursor()
    cursor.execute("SELECT error_types FROM sessions WHERE player_id = ? AND error_types IS NOT NULL AND error_types != ''", (player_id,))
    error_counts = {}
    for row in cursor.fetchall():
        for error in row['error_types'].split(','):
            error = error.strip()
            if error: error_counts[error] = error_counts.get(error, 0) + 1
    return jsonify({'status': 'success', 'errors': list(error_counts.keys()), 'counts': list(error_counts.values())})

@app.route('/api/statistics/error-distribution/<int:player_id>', methods=['GET'])
def get_error_distribution(player_id):
    cursor = get_db().cursor()
    cursor.execute("""
        SELECT c.name as content, COUNT(s.id) as count
        FROM sessions s
        JOIN content c ON s.content_id = c.id
        WHERE s.player_id = ? AND s.error_types IS NOT NULL AND s.error_types != ''
        GROUP BY c.name
    """, (player_id,))
    rows = cursor.fetchall()
    return jsonify({'status': 'success', 'contents': [r['content'] for r in rows], 'counts': [r['count'] for r in rows]})

@app.route('/api/statistics/error-score-correlation/<int:player_id>', methods=['GET'])
def get_error_score_correlation(player_id):
    cursor = get_db().cursor()
    cursor.execute("SELECT score, error_types FROM sessions WHERE player_id = ? AND error_types IS NOT NULL", (player_id,))
    points = []
    for row in cursor.fetchall():
        error_count = len(row['error_types'].split(',')) if row['error_types'].strip() else 0
        points.append({'errors': error_count, 'score': row['score']})
    return jsonify({'status': 'success', 'points': points})

@app.route('/api/recommendations/player/<int:player_id>', methods=['GET'])
def get_player_recommendations(player_id):
    cursor = get_db().cursor()
    cursor.execute("SELECT * FROM recommendations WHERE player_id = ?", (player_id,))
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
    cursor.execute("SELECT error_types FROM sessions WHERE error_types IS NOT NULL AND error_types != ''")
    error_counts = {}
    for row in cursor.fetchall():
        for error in row['error_types'].split(','):
            error = error.strip()
            if error: error_counts[error] = error_counts.get(error, 0) + 1
    return jsonify({'status': 'success', 'errors': list(error_counts.keys()), 'counts': list(error_counts.values())})

@app.route('/api/statistics/top-errors', methods=['GET'])
def get_top_errors():
    cursor = get_db().cursor()
    cursor.execute("SELECT error_types FROM sessions WHERE error_types IS NOT NULL AND error_types != ''")
    error_counts = {}
    for row in cursor.fetchall():
        for error in row['error_types'].split(','):
            error = error.strip()
            if error: error_counts[error] = error_counts.get(error, 0) + 1
    sorted_errors = sorted(error_counts.items(), key=lambda item: item[1], reverse=True)
    return jsonify({'status': 'success', 'errors': [e[0] for e in sorted_errors], 'counts': [e[1] for e in sorted_errors]})

@app.route('/api/statistics/guild/<int:guild_id>', methods=['GET'])
def get_guild_stats(guild_id):
    cursor = get_db().cursor()
    cursor.execute("SELECT COUNT(DISTINCT p.id) as active_players, COUNT(s.id) as session_count, AVG(s.score) as avg_score FROM players p LEFT JOIN sessions s ON p.id = s.player_id WHERE p.guild_id = ? AND s.session_date >= DATETIME('now', '-30 days')", (guild_id,))
    stats = cursor.fetchone()
    return jsonify({'status': 'success', 'activePlayers': stats['active_players'] or 0, 'sessionCount': stats['session_count'] or 0, 'avgScore': stats['avg_score'] or 0})

@app.route('/api/statistics/guild-ranking', methods=['GET'])
def get_guild_ranking():
    cursor = get_db().cursor()
    cursor.execute("SELECT g.name as guild, AVG(s.score) as avg_score FROM guilds g LEFT JOIN players p ON g.id = p.guild_id LEFT JOIN sessions s ON p.id = s.player_id GROUP BY g.id ORDER BY avg_score DESC")
    rows = cursor.fetchall()
    return jsonify({'status': 'success', 'guilds': [r['guild'] for r in rows], 'scores': [round(r['avg_score'] or 0, 2) for r in rows]})

@app.route('/api/statistics/best-player-week', methods=['GET'])
def get_best_player_week():
    guild_id = request.args.get('guild_id')
    if not guild_id: return jsonify({'status': 'error', 'message': 'guild_id required'}), 400
    cursor = get_db().cursor()
    cursor.execute("SELECT p.nickname, AVG(s.score) as avg_score FROM sessions s JOIN players p ON s.player_id = p.id WHERE s.session_date >= DATETIME('now', '-7 days') AND p.guild_id = ? GROUP BY p.id ORDER BY avg_score DESC LIMIT 1", (guild_id,))
    player = cursor.fetchone()
    return jsonify({'status': 'success', 'player': {'nickname': player['nickname'] if player else '-'}})

@app.route('/api/statistics/total-sessions', methods=['GET'])
def get_total_sessions():
    guild_id = request.args.get('guild_id')
    cursor = get_db().cursor()
    
    guild_sessions = 0
    if guild_id:
        cursor.execute("SELECT COUNT(s.id) FROM sessions s JOIN players p ON s.player_id = p.id WHERE p.guild_id = ?", (guild_id,))
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

if __name__ == '__main__':
    os.makedirs('data', exist_ok=True)
    with app.app_context():
        init_db()
    app.run(port=3000, debug=True)