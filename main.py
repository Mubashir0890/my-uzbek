import asyncio
import hashlib
import hmac
import json
import os
import sqlite3
import time
from urllib.parse import parse_qsl

from aiohttp import web
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart, Command
from aiogram.types import (CallbackQuery, InlineKeyboardButton,
                           InlineKeyboardMarkup, Message, WebAppInfo)

TOKEN = os.environ["BOT_TOKEN"]
ADMIN_ID = int(os.environ["ADMIN_ID"])
WEBAPP_URL = os.environ["WEBAPP_URL"].rstrip("/")
CARD = os.getenv("CARD_NUMBER", "0000 0000 0000 0000")
OWNER = os.getenv("CARD_OWNER", "")
PRICE = int(os.getenv("PRICE", "10000"))
DAYS = int(os.getenv("DAYS", "30"))  # obuna muddati (kun)
DB_PATH = os.getenv("DB_PATH", "/data/bot.db")
BASE = os.path.dirname(os.path.abspath(__file__))

try:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
except OSError:
    DB_PATH = os.path.join(BASE, "bot.db")


def db(sql, args=(), fetch=False):
    c = sqlite3.connect(DB_PATH)
    try:
        cur = c.execute(sql, args)
        c.commit()
        return cur.fetchall() if fetch else None
    finally:
        c.close()


def init_db():
    db("CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, status TEXT, created INTEGER)")
    db("CREATE TABLE IF NOT EXISTS receipts(uid INTEGER, file_uid TEXT, created INTEGER)")
    # eski bazalar uchun: expires ustunini qo'shish
    cols = [r[1] for r in db("PRAGMA table_info(users)", (), True)]
    if "expires" not in cols:
        db("ALTER TABLE users ADD COLUMN expires INTEGER DEFAULT 0")
        # avval to'laganlarga bir davr beramiz
        db("UPDATE users SET expires=? WHERE status='paid'", (int(time.time()) + DAYS * 86400,))


def is_paid(uid):
    if uid == ADMIN_ID:
        return True
    rows = db("SELECT status, expires FROM users WHERE id=?", (uid,), True)
    return bool(rows) and rows[0][0] == "paid" and (rows[0][1] or 0) > time.time()


def expires_at(uid):
    rows = db("SELECT expires FROM users WHERE id=?", (uid,), True)
    return (rows[0][0] or 0) if rows else 0


def fmt_date(ts):
    return time.strftime("%d.%m.%Y", time.localtime(ts))


def grant(uid):
    """To'lovni tasdiqlash: muddatni DAYS kunga uzaytiradi."""
    base = max(expires_at(uid), int(time.time()))
    new = base + DAYS * 86400
    db("INSERT INTO users(id,name,status,created,expires) VALUES(?,?,?,?,?) "
       "ON CONFLICT(id) DO UPDATE SET status='paid', expires=excluded.expires",
       (uid, "", "paid", int(time.time()), new))
    return new


def set_status(uid, name, status):
    db("INSERT INTO users(id,name,status,created,expires) VALUES(?,?,?,?,0) "
       "ON CONFLICT(id) DO UPDATE SET status=excluded.status",
       (uid, name, status, int(time.time())))


# ---------- Telegram initData tekshiruvi ----------
def verify_init(init):
    try:
        d = dict(parse_qsl(init, keep_blank_values=True))
        h = d.pop("hash")
        check = "\n".join(f"{k}={v}" for k, v in sorted(d.items()))
        key = hmac.new(b"WebAppData", TOKEN.encode(), hashlib.sha256).digest()
        calc = hmac.new(key, check.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(calc, h):
            return None
        if time.time() - int(d.get("auth_date", "0")) > 86400:
            return None
        return json.loads(d["user"])["id"]
    except Exception:
        return None


# ---------- Veb qism ----------
async def index(_):
    return web.FileResponse(os.path.join(BASE, "index.html"))


async def status(r):
    uid = verify_init(r.headers.get("X-Init-Data", ""))
    return web.json_response({"ok": uid is not None, "paid": bool(uid) and is_paid(uid),
                              "card": CARD, "owner": OWNER, "price": PRICE,
                              "expires": expires_at(uid) if uid else 0})


async def engine(r):
    uid = verify_init(r.headers.get("X-Init-Data", ""))
    if not uid or not is_paid(uid):
        raise web.HTTPForbidden()
    return web.FileResponse(os.path.join(BASE, "engine.js"),
                            headers={"Cache-Control": "no-store"})


async def health(_):
    return web.Response(text="ok")


# ---------- Bot ----------
bot = Bot(TOKEN)
dp = Dispatcher()


def open_kb():
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🧮 Ilovani ochish", web_app=WebAppInfo(url=WEBAPP_URL))]])


def pay_text():
    price = f"{PRICE:,}".replace(",", " ")
    return (f"Ilovadan {DAYS} kun foydalanish uchun {price} so'm to'lang.\n\n"
            f"💳 Karta: {CARD}\n👤 {OWNER}\n\n"
            "To'lagach, chek rasmini shu yerga yuboring. "
            "Tasdiqlangach ilova havolasi keladi.")


@dp.message(CommandStart())
async def start(m: Message):
    u = m.from_user
    db("INSERT OR IGNORE INTO users(id,name,status,created,expires) VALUES(?,?,?,?,0)",
       (u.id, u.full_name, "new", int(time.time())))
    if is_paid(u.id):
        await m.answer(f"Xush kelibsiz! Obuna {fmt_date(expires_at(u.id))} gacha.\nUzaytirish uchun /pay 👇", reply_markup=open_kb())
    else:
        await m.answer(pay_text())


@dp.message(Command("pay"))
async def pay(m: Message):
    await m.answer(pay_text())


@dp.message(F.photo | F.document)
async def receipt(m: Message):
    u = m.from_user
    active = is_paid(u.id)
    fid = m.photo[-1].file_unique_id if m.photo else m.document.file_unique_id
    dup = db("SELECT uid FROM receipts WHERE file_uid=?", (fid,), True)
    db("INSERT INTO receipts VALUES(?,?,?)", (u.id, fid, int(time.time())))
    if not active:
        set_status(u.id, u.full_name, "pending")
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Tasdiqlash", callback_data=f"ok:{u.id}"),
        InlineKeyboardButton(text="❌ Rad etish", callback_data=f"no:{u.id}")]])
    note = f"🧾 Yangi chek\n👤 {u.full_name} (id {u.id})"
    if active:
        note += f"\n🔄 Uzaytirish (hozirgi obuna {fmt_date(expires_at(u.id))} gacha)"
    if dup:
        note += "\n⚠️ Bu chek avval ham yuborilgan!"
    await m.copy_to(ADMIN_ID, caption=note, reply_markup=kb)
    await m.answer("Chek qabul qilindi ✅ Tasdiqlanishini kuting, odatda bir necha daqiqa.")


@dp.callback_query(F.data.regexp(r"^(ok|no):\d+$"))
async def decide(cb: CallbackQuery):
    if cb.from_user.id != ADMIN_ID:
        await cb.answer("Ruxsat yo'q", show_alert=True)
        return
    act, uid = cb.data.split(":")
    uid = int(uid)
    try:
        if act == "ok":
            until = grant(uid)
            await bot.send_message(uid, f"To'lov tasdiqlandi! 🎉 Obuna {fmt_date(until)} gacha faol 👇",
                                   reply_markup=open_kb())
            mark = "✅ Tasdiqlandi"
        else:
            if not is_paid(uid):
                set_status(uid, "", "rejected")
            await bot.send_message(uid, "Chek tasdiqlanmadi. Iltimos, to'lov chekini aniq rasmda qayta yuboring.")
            mark = "❌ Rad etildi"
    except Exception:
        mark = "⚠️ Foydalanuvchiga xabar yetmadi"
    await cb.message.edit_caption(caption=(cb.message.caption or "") + f"\n\n{mark}", reply_markup=None)
    await cb.answer(mark)


@dp.message(Command("stats"))
async def stats(m: Message):
    if m.from_user.id != ADMIN_ID:
        return
    rows = dict(db("SELECT status, COUNT(*) FROM users GROUP BY status", (), True))
    active = db("SELECT COUNT(*) FROM users WHERE status='paid' AND expires>?", (int(time.time()),), True)[0][0]
    rows["paid"] = active
    await m.answer(f"Faol obuna: {rows.get('paid', 0)}\nKutilmoqda: {rows.get('pending', 0)}\n"
                   f"Rad etilgan: {rows.get('rejected', 0)}\nJami: {sum(rows.values())}")


async def main():
    init_db()
    app = web.Application()
    app.add_routes([web.get("/", index), web.get("/api/status", status),
                    web.get("/engine.js", engine), web.get("/health", health)])
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", int(os.getenv("PORT", "10000"))).start()
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
