"""Web routes."""

import csv
import io
import uuid
from pathlib import Path

from flask import (
    Blueprint, abort, current_app, flash, g, jsonify, redirect,
    render_template, request, send_file, url_for,
)

from . import db, imaging, specs, varieties

bp = Blueprint("main", __name__)

ALLOWED_IMAGE = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}


def _num(value, cast=float):
    value = (value or "").strip()
    if not value:
        return None
    try:
        return cast(value)
    except ValueError:
        return None


def _tristate(value):
    """Form values for 'yes' / 'no' / 'not tested'."""
    return {"yes": 1, "no": 0}.get(value)


def _coin_form(form):
    return {
        "country": (form.get("country") or "US").strip() or "US",
        "denomination": (form.get("denomination") or "").strip(),
        "year": _num(form.get("year"), int),
        "mint_mark": (form.get("mint_mark") or "").strip().upper(),
        "weight_g": _num(form.get("weight_g")),
        "diameter_mm": _num(form.get("diameter_mm")),
        "is_magnetic": _tristate(form.get("is_magnetic")),
        "is_proof": 1 if form.get("is_proof") else 0,
        "grade": (form.get("grade") or "").strip(),
        "status": form.get("status") or "unchecked",
        "verdict": form.get("verdict") or "none",
        "findings": (form.get("findings") or "").strip(),
        "notes": (form.get("notes") or "").strip(),
        "acquired": (form.get("acquired") or "").strip(),
        "est_value": _num(form.get("est_value")),
    }


# --- collection ----------------------------------------------------------

@bp.route("/")
def index():
    coins = db.list_coins(
        g.conn,
        denomination=request.args.get("denomination") or None,
        status=request.args.get("status") or None,
        verdict=request.args.get("verdict") or None,
        search=request.args.get("q") or None,
    )

    rows = []
    for coin in coins:
        analysis = specs.analyze(
            coin["denomination"], coin["year"], coin["weight_g"],
            coin["diameter_mm"], coin["is_magnetic"], bool(coin["is_proof"]),
        )
        hits = varieties.for_coin(coin["denomination"], coin["year"], coin["mint_mark"])
        photos = db.get_photos(g.conn, coin["id"])
        rows.append(
            {
                "coin": coin,
                "analysis": analysis,
                "alerts": [f for f in analysis["findings"] if f["level"] == "alert"],
                "variety_count": len(hits),
                "thumb": photos[0]["filename"] if photos else None,
            }
        )

    return render_template(
        "index.html",
        rows=rows,
        stats=db.collection_stats(g.conn),
        denominations=specs.denominations(),
        filters=request.args,
    )


@bp.route("/coin/new", methods=["GET", "POST"])
def new_coin():
    if request.method == "POST":
        data = _coin_form(request.form)
        if not data["denomination"]:
            flash("Denomination is required.", "error")
            return render_template(
                "coin_form.html", coin=data, denominations=specs.denominations()
            )
        coin_id = db.create_coin(g.conn, data)
        for file in request.files.getlist("photos"):
            _save_photo(coin_id, file, request.form.get("photo_side", "obverse"))
        flash("Coin added.", "ok")
        return redirect(url_for("main.coin_detail", coin_id=coin_id))

    return render_template(
        "coin_form.html", coin=None, denominations=specs.denominations()
    )


@bp.route("/coin/<int:coin_id>")
def coin_detail(coin_id):
    coin = db.get_coin(g.conn, coin_id)
    if coin is None:
        abort(404)

    analysis = specs.analyze(
        coin["denomination"], coin["year"], coin["weight_g"],
        coin["diameter_mm"], coin["is_magnetic"], bool(coin["is_proof"]),
    )
    return render_template(
        "coin_detail.html",
        coin=coin,
        analysis=analysis,
        variety_hits=varieties.for_coin(
            coin["denomination"], coin["year"], coin["mint_mark"]
        ),
        variety_status=db.get_variety_checks(g.conn, coin_id),
        zones=varieties.zones(),
        checks=db.get_checks(g.conn, coin_id),
        photos=db.get_photos(g.conn, coin_id),
        lesson=varieties.critical_lesson(),
        denominations=specs.denominations(),
    )


@bp.route("/coin/<int:coin_id>/edit", methods=["POST"])
def edit_coin(coin_id):
    if db.get_coin(g.conn, coin_id) is None:
        abort(404)
    db.update_coin(g.conn, coin_id, _coin_form(request.form))
    flash("Saved.", "ok")
    return redirect(url_for("main.coin_detail", coin_id=coin_id))


@bp.route("/coin/<int:coin_id>/delete", methods=["POST"])
def delete_coin(coin_id):
    for photo in db.get_photos(g.conn, coin_id):
        _remove_photo_files(photo["filename"])
    db.delete_coin(g.conn, coin_id)
    flash("Coin deleted.", "ok")
    return redirect(url_for("main.index"))


# --- checklist -----------------------------------------------------------

@bp.route("/coin/<int:coin_id>/check", methods=["POST"])
def set_check(coin_id):
    payload = request.get_json(silent=True) or request.form
    db.set_check(
        g.conn, coin_id, payload["check_key"], payload["result"],
        payload.get("notes", ""),
    )
    return jsonify(ok=True)


@bp.route("/coin/<int:coin_id>/variety", methods=["POST"])
def set_variety(coin_id):
    payload = request.get_json(silent=True) or request.form
    db.set_variety_check(
        g.conn, coin_id, payload["variety_id"], payload["status"],
        payload.get("notes", ""),
    )
    return jsonify(ok=True)


# --- photos --------------------------------------------------------------

def _save_photo(coin_id, file, side="obverse", caption=""):
    if not file or not file.filename:
        return None
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_IMAGE:
        return None

    name = f"{uuid.uuid4().hex}{ext}"
    dest = current_app.config["PHOTO_DIR"] / name
    file.save(dest)
    try:
        imaging.make_thumbnail(dest, current_app.config["THUMB_DIR"] / f"{name}.jpg")
    except Exception:
        # A thumbnail failure should never lose the original capture.
        pass
    return db.add_photo(g.conn, coin_id, name, side, caption)


def _remove_photo_files(name):
    cfg = current_app.config
    (cfg["PHOTO_DIR"] / name).unlink(missing_ok=True)
    (cfg["THUMB_DIR"] / f"{name}.jpg").unlink(missing_ok=True)
    for cached in cfg["CACHE_DIR"].glob(f"{Path(name).stem}__*.png"):
        cached.unlink(missing_ok=True)


@bp.route("/coin/<int:coin_id>/photo", methods=["POST"])
def upload_photo(coin_id):
    if db.get_coin(g.conn, coin_id) is None:
        abort(404)
    saved = 0
    for file in request.files.getlist("photos"):
        if _save_photo(
            coin_id, file, request.form.get("side", "obverse"),
            request.form.get("caption", ""),
        ):
            saved += 1
    flash(f"Added {saved} photo(s)." if saved else "No valid images found.",
          "ok" if saved else "error")
    return redirect(url_for("main.coin_detail", coin_id=coin_id))


@bp.route("/photo/<int:photo_id>/delete", methods=["POST"])
def delete_photo(photo_id):
    photo = db.get_photo(g.conn, photo_id)
    if photo is None:
        abort(404)
    _remove_photo_files(photo["filename"])
    db.delete_photo(g.conn, photo_id)
    return redirect(url_for("main.coin_detail", coin_id=photo["coin_id"]))


@bp.route("/media/<name>")
def media(name):
    path = current_app.config["PHOTO_DIR"] / Path(name).name
    if not path.exists():
        abort(404)
    return send_file(path)


@bp.route("/thumb/<name>")
def thumb(name):
    path = current_app.config["THUMB_DIR"] / f"{Path(name).name}.jpg"
    if not path.exists():
        return media(name)
    return send_file(path)


@bp.route("/filtered/<int:photo_id>/<filter_name>")
def filtered(photo_id, filter_name):
    if filter_name not in imaging.FILTERS:
        abort(404)
    photo = db.get_photo(g.conn, photo_id)
    if photo is None:
        abort(404)
    src = current_app.config["PHOTO_DIR"] / photo["filename"]
    if not src.exists():
        abort(404)
    return send_file(imaging.render(src, filter_name, current_app.config["CACHE_DIR"]))


@bp.route("/coin/<int:coin_id>/scope")
def scope(coin_id):
    """Side-by-side image workbench with the enhancement filters."""
    coin = db.get_coin(g.conn, coin_id)
    if coin is None:
        abort(404)
    return render_template(
        "scope.html",
        coin=coin,
        photos=db.get_photos(g.conn, coin_id),
        all_photos=g.conn.execute(
            """SELECT p.*, c.year, c.mint_mark, c.denomination
               FROM photos p JOIN coins c ON c.id = p.coin_id
               WHERE c.denomination = ? ORDER BY c.year, p.id""",
            (coin["denomination"],),
        ).fetchall(),
        filters=imaging.FILTERS,
        lesson=varieties.critical_lesson(),
    )


# --- reference -----------------------------------------------------------

@bp.route("/reference")
def reference():
    query = request.args.get("q", "")
    return render_template(
        "reference.html",
        results=varieties.search(query) if query else varieties.all_varieties(),
        query=query,
        zones=varieties.zones(),
        lesson=varieties.critical_lesson(),
        damage=varieties.damage_not_error(),
        series=specs.all_series(),
    )


@bp.route("/export.csv")
def export_csv():
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "country", "denomination", "year", "mint_mark", "weight_g",
        "diameter_mm", "magnetic", "proof", "grade", "status", "verdict",
        "findings", "notes", "acquired", "est_value", "photos",
    ])
    for coin in db.list_coins(g.conn):
        writer.writerow([
            coin["id"], coin["country"], coin["denomination"], coin["year"],
            coin["mint_mark"], coin["weight_g"], coin["diameter_mm"],
            {1: "yes", 0: "no"}.get(coin["is_magnetic"], ""),
            "yes" if coin["is_proof"] else "no",
            coin["grade"], coin["status"], coin["verdict"], coin["findings"],
            coin["notes"], coin["acquired"], coin["est_value"],
            len(db.get_photos(g.conn, coin["id"])),
        ])
    return send_file(
        io.BytesIO(buf.getvalue().encode("utf-8")),
        mimetype="text/csv",
        as_attachment=True,
        download_name="coin_collection.csv",
    )
