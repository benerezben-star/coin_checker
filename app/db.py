"""SQLite storage for the coin collection."""

import sqlite3
from datetime import datetime
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS coins (
    id            INTEGER PRIMARY KEY,
    country       TEXT    NOT NULL DEFAULT 'US',
    denomination  TEXT    NOT NULL,
    year          INTEGER,
    mint_mark     TEXT    NOT NULL DEFAULT '',
    weight_g      REAL,
    diameter_mm   REAL,
    is_magnetic   INTEGER,
    is_proof      INTEGER NOT NULL DEFAULT 0,
    grade         TEXT    NOT NULL DEFAULT '',
    status        TEXT    NOT NULL DEFAULT 'unchecked',
    verdict       TEXT    NOT NULL DEFAULT 'none',
    findings      TEXT    NOT NULL DEFAULT '',
    notes         TEXT    NOT NULL DEFAULT '',
    acquired      TEXT    NOT NULL DEFAULT '',
    est_value     REAL,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
    id         INTEGER PRIMARY KEY,
    coin_id    INTEGER NOT NULL REFERENCES coins(id) ON DELETE CASCADE,
    filename   TEXT    NOT NULL,
    side       TEXT    NOT NULL DEFAULT 'obverse',
    caption    TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS checks (
    id         INTEGER PRIMARY KEY,
    coin_id    INTEGER NOT NULL REFERENCES coins(id) ON DELETE CASCADE,
    check_key  TEXT    NOT NULL,
    result     TEXT    NOT NULL,
    notes      TEXT    NOT NULL DEFAULT '',
    updated_at TEXT    NOT NULL,
    UNIQUE(coin_id, check_key)
);

CREATE TABLE IF NOT EXISTS variety_checks (
    id         INTEGER PRIMARY KEY,
    coin_id    INTEGER NOT NULL REFERENCES coins(id) ON DELETE CASCADE,
    variety_id TEXT    NOT NULL,
    status     TEXT    NOT NULL DEFAULT 'unchecked',
    notes      TEXT    NOT NULL DEFAULT '',
    updated_at TEXT    NOT NULL,
    UNIQUE(coin_id, variety_id)
);

CREATE INDEX IF NOT EXISTS idx_photos_coin  ON photos(coin_id);
CREATE INDEX IF NOT EXISTS idx_checks_coin  ON checks(coin_id);
CREATE INDEX IF NOT EXISTS idx_vchecks_coin ON variety_checks(coin_id);
CREATE INDEX IF NOT EXISTS idx_coins_lookup ON coins(denomination, year, mint_mark);
"""


def now():
    return datetime.now().isoformat(timespec="seconds")


def connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path):
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = connect(db_path)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


# --- coins ---------------------------------------------------------------

COIN_FIELDS = (
    "country denomination year mint_mark weight_g diameter_mm is_magnetic "
    "is_proof grade status verdict findings notes acquired est_value"
).split()


def create_coin(conn, data):
    values = [data.get(f) for f in COIN_FIELDS]
    cols = ", ".join(COIN_FIELDS) + ", created_at, updated_at"
    marks = ", ".join("?" * (len(COIN_FIELDS) + 2))
    stamp = now()
    cur = conn.execute(
        f"INSERT INTO coins ({cols}) VALUES ({marks})", values + [stamp, stamp]
    )
    conn.commit()
    return cur.lastrowid


def update_coin(conn, coin_id, data):
    fields = [f for f in COIN_FIELDS if f in data]
    if not fields:
        return
    assignments = ", ".join(f"{f} = ?" for f in fields)
    values = [data[f] for f in fields]
    conn.execute(
        f"UPDATE coins SET {assignments}, updated_at = ? WHERE id = ?",
        values + [now(), coin_id],
    )
    conn.commit()


def get_coin(conn, coin_id):
    return conn.execute("SELECT * FROM coins WHERE id = ?", (coin_id,)).fetchone()


def delete_coin(conn, coin_id):
    conn.execute("DELETE FROM coins WHERE id = ?", (coin_id,))
    conn.commit()


def list_coins(conn, denomination=None, status=None, verdict=None, search=None):
    sql = "SELECT * FROM coins WHERE 1=1"
    params = []
    if denomination:
        sql += " AND denomination = ?"
        params.append(denomination)
    if status:
        sql += " AND status = ?"
        params.append(status)
    if verdict:
        sql += " AND verdict = ?"
        params.append(verdict)
    if search:
        sql += " AND (notes LIKE ? OR findings LIKE ? OR CAST(year AS TEXT) LIKE ?)"
        like = f"%{search}%"
        params += [like, like, like]
    sql += " ORDER BY updated_at DESC"
    return conn.execute(sql, params).fetchall()


def collection_stats(conn):
    row = conn.execute(
        """SELECT COUNT(*) AS total,
                  SUM(status = 'unchecked')        AS unchecked,
                  SUM(verdict = 'suspect')         AS suspects,
                  SUM(verdict = 'confirmed_error') AS confirmed,
                  COALESCE(SUM(est_value), 0)      AS value
           FROM coins"""
    ).fetchone()
    return dict(row)


# --- photos --------------------------------------------------------------

def add_photo(conn, coin_id, filename, side="obverse", caption=""):
    cur = conn.execute(
        "INSERT INTO photos (coin_id, filename, side, caption, created_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (coin_id, filename, side, caption, now()),
    )
    conn.commit()
    return cur.lastrowid


def get_photos(conn, coin_id):
    return conn.execute(
        "SELECT * FROM photos WHERE coin_id = ? ORDER BY id", (coin_id,)
    ).fetchall()


def get_photo(conn, photo_id):
    return conn.execute("SELECT * FROM photos WHERE id = ?", (photo_id,)).fetchone()


def delete_photo(conn, photo_id):
    conn.execute("DELETE FROM photos WHERE id = ?", (photo_id,))
    conn.commit()


# --- checklist -----------------------------------------------------------

def set_check(conn, coin_id, check_key, result, notes=""):
    conn.execute(
        """INSERT INTO checks (coin_id, check_key, result, notes, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(coin_id, check_key)
           DO UPDATE SET result = excluded.result,
                         notes = excluded.notes,
                         updated_at = excluded.updated_at""",
        (coin_id, check_key, result, notes, now()),
    )
    conn.commit()


def get_checks(conn, coin_id):
    rows = conn.execute("SELECT * FROM checks WHERE coin_id = ?", (coin_id,)).fetchall()
    return {r["check_key"]: dict(r) for r in rows}


def set_variety_check(conn, coin_id, variety_id, status, notes=""):
    conn.execute(
        """INSERT INTO variety_checks (coin_id, variety_id, status, notes, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(coin_id, variety_id)
           DO UPDATE SET status = excluded.status,
                         notes = excluded.notes,
                         updated_at = excluded.updated_at""",
        (coin_id, variety_id, status, notes, now()),
    )
    conn.commit()


def get_variety_checks(conn, coin_id):
    rows = conn.execute(
        "SELECT * FROM variety_checks WHERE coin_id = ?", (coin_id,)
    ).fetchall()
    return {r["variety_id"]: dict(r) for r in rows}
