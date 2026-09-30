#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Yahoo!ショッピング 商品検索API から現在価格を取得し、履歴を追記する。

GitHub Actions から毎日1回呼ばれる想定。
  入力 : parts.json（取得対象のパーツ一覧）, 環境変数 YAHOO_APPID
  出力 : data/prices.js  … <script> で直接読めるフィード（file:// でも使える）
         data/prices.json … 同じ中身のJSON
"""

import json
import os
import re
import unicodedata
import statistics
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta

API = 'https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch'
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # リポジトリの直下
PARTS = os.path.join(HERE, 'parts.json')
OUT_JS = os.path.join(ROOT, 'data', 'prices.js')
OUT_JSON = os.path.join(ROOT, 'data', 'prices.json')

HITS = 30           # 1パーツあたり取得する商品数（関連度順で広めに取る）
SLEEP = 3.0         # APIへの間隔（秒）。1.1秒では 429 Too Many Requests になったため広げた
RETRY = 3           # 429 が返ったときの再試行回数
BACKOFF = 20        # 再試行までの待ち時間（秒）。試行ごとに倍にする
# 保持方針。「消さずに残す」ことを優先し、置き場所を2つに分ける。
#   data/prices.json … 日ごとの記録をそのまま残す保管庫（2年ぶん）。アプリは読まない
#   data/prices.js   … アプリが毎回読み込むぶん。直近は日ごと、それ以前は月ごとに集計
# 2年ぶんの日ごとの記録を毎回読ませると 2MB 近くなりスマホで重いため、こう分けている。
KEEP_DAYS   = 730   # 保管庫に残す日数（約2年）
DAILY_DAYS  = 90    # アプリ側に日ごとの点を残す日数
MONTHS_KEEP = 24    # アプリ側に月ごとの点を残す月数（2年）
# 2段階で絞り込む。
#  1) 誌面価格に対する広めの窓 … 明らかな別物だけを落とす。値下がりで切られないよう広くとる
#  2) その日の中央値に対する窓 … 付属品・バルク・法外な出品を落とす。相場が動いても追従する
# 基準価格は「前回記録した中央値」を優先し、無ければ誌面価格を使う。
# こうすると相場が下がっても基準が追従するので、窓を不必要に広げなくて済む。
LO_BOOK = 0.50
HI_BOOK = 2.50
LO_MED  = 0.60
HI_MED  = 2.00
MIN_HITS = 2        # これ未満しか残らない日は中央値が当てにならないので記録しない
NG_WORDS = ('中古', 'ジャンク', '訳あり', '部品取り', '本体のみ', '箱のみ', '空箱',
            'ステッカー', 'キーホルダー', 'Tシャツ')

# 区分ごとの追加除外。
# 例：GPUを検索すると「そのGPUを積んだゲーミングノートPC」が大量に出てくる。
# 型番は一致してしまうので、パソコン本体を示す語で落とす。
NG_BY_CAT = {
    'gpu': ('ノート', 'ゲーミングPC', 'デスクトップ', 'BTO', '一体型', 'ミニPC',
            'インチ', 'WQXGA', 'OLED', 'Legion', 'Raider', 'Windows'),
    'cpu': ('ノート', 'ゲーミングPC', 'デスクトップ', 'BTO', '一体型', 'ミニPC'),
    'mb':  ('ノート', 'ゲーミングPC', 'BTO'),
    # メモリ・SSD・HDDも「それを積んだパソコン本体」が大量に出てくる
    'mem': ('ノート', 'ゲーミングPC', 'デスクトップPC', 'BTO', '一体型', 'ミニPC'),
    'ssd': ('ノート', 'ゲーミングPC', 'デスクトップPC', 'BTO', '一体型', 'ミニPC'),
    'hdd': ('ノート', 'ゲーミングPC', 'デスクトップPC', 'BTO', '一体型', 'ミニPC'),
}
# パソコン本体は「GPUとCPUの両方」が商品名に入りがち。型番同士の同居も手がかりにする
CPU_IN_NAME = re.compile(r'(ultra\s*\d|ryzen\s*\d|core\s*i\d|celeron|pentium)', re.I)


def norm_name(s):
    """全角・大文字・記号の違いを吸収して比較できる形にする"""
    return re.sub(r'[\s\-_・/]', '', unicodedata.normalize('NFKC', s).lower())


def load_dotenv():
    """スクリプトと同じ場所に .env があれば読み込む（手元で試すとき用）。

    GitHub Actions 上では Secrets が環境変数として渡るので .env は不要。
    すでに環境変数がある場合はそちらを優先する。
    """
    path = os.path.join(HERE, '.env')
    if not os.path.exists(path):
        return
    with open(path, encoding='utf-8') as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, val = line.split('=', 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


def jst_today():
    return datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d')


def search(appid, query):
    params = urllib.parse.urlencode({
        'appid': appid,
        'query': query,
        'results': HITS,
        # 並び順は指定しない＝関連度順。
        # 安い順(+price)にすると「その商品の安物の関連品」で20件が埋まり、本体が1件も入らない
    })
    req = urllib.request.Request(
        API + '?' + params,
        headers={'User-Agent': 'pc-price-feed/1.0 (personal study tool)'},
    )
    wait = BACKOFF
    for attempt in range(RETRY + 1):
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                return json.loads(res.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            # 429（アクセスしすぎ）のときだけ、間を置いて数回やり直す
            if e.code == 429 and attempt < RETRY:
                print('    429のため %d 秒待って再試行します（%d/%d）' % (wait, attempt + 1, RETRY))
                time.sleep(wait)
                wait *= 2
                continue
            raise


def extract(data, ref, must=None, ban=None, cat=None, band=None):
    """APIの応答から対象パーツらしい価格だけを取り出し、診断情報も返す。

    戻り値: (価格のリスト, 診断dict)
    """
    hits = (data or {}).get('hits') or []
    diag = {'hits': len(hits), 'name': 0, 'ng': 0, 'book': 0, 'med': 0,
            'ngw': {}, 'sample': [], 'range': None, 'anchor': ref, 'kept_items': []}
    must = [m.lower() for m in (must or [])]
    ban = [b.lower() for b in (ban or [])]

    raw = []
    kept_names = []
    for h in hits:
        name = h.get('name') or ''
        price = h.get('price')
        if price is None and isinstance(h.get('priceLabel'), dict):
            price = h['priceLabel'].get('defaultPrice')
        try:
            price = int(price)
        except (TypeError, ValueError):
            continue
        if price <= 0:
            continue
        # 型番が商品名に入っていない＝別商品。ここが一番効く
        nn = norm_name(name)
        # 'windows11|win11' のように | で別表記を並べられる
        if must and not all(any(alt in nn for alt in m.split('|')) for m in must):
            diag['name'] += 1
            if len(diag['sample']) < 4:
                diag['sample'].append(name[:44])
            continue
        if ban and any(b in nn for b in ban):
            diag['name'] += 1
            continue
        words = NG_WORDS + NG_BY_CAT.get(cat, ())
        hit = next((w for w in words if w in name), None)
        if hit is None and cat == 'gpu' and CPU_IN_NAME.search(name):
            hit = 'CPU名が同居'      # グラボ単体の商品名にCPU名は出てこない
        if hit:
            diag['ng'] += 1
            diag['ngw'][hit] = diag['ngw'].get(hit, 0) + 1
            continue
        raw.append(price)
        kept_names.append((name, price))

    if raw:
        diag['range'] = [min(raw), max(raw)]   # 価格帯で切る前の分布（診断用）

    # 1段階目：基準価格に対する窓。
    # 誌面価格のないパーツ（メモリ・SSD・HDD）は ref が目安でしかないので、
    # parts.json の band で窓を広げられるようにしてある
    lo_k, hi_k = (band or (LO_BOOK, HI_BOOK))
    step1 = [p for p in raw if not ref or (ref * lo_k <= p <= ref * hi_k)]
    diag['book'] = len(raw) - len(step1)
    if not step1:
        return [], diag

    # 2段階目：その日の中央値を基準にした外れ値の除去
    med = statistics.median(step1)
    step2 = [p for p in step1 if med * LO_MED <= p <= med * HI_MED]
    diag['med'] = len(step1) - len(step2)
    # 実際に中央値の計算に使われた商品を記録する（誤検出の特定用・最大6件）
    used = sorted(step2)
    seen = set()
    for nm, pr in kept_names:
        if pr in used and pr not in seen and len(diag['kept_items']) < 6:
            seen.add(pr)
            diag['kept_items'].append('%s円 %s' % ('{:,}'.format(pr), nm[:52]))
    return used, diag


def age_days(d, today):
    """today から何日前か。日付として読めないものは None を返す"""
    try:
        return (datetime.strptime(today, '%Y-%m-%d').date()
                - datetime.strptime(d, '%Y-%m-%d').date()).days
    except ValueError:
        return None


def prune_archive(hist, today):
    """保管庫の期限切れを落とす。ここだけが記録を捨てる場所で、2年より古いものだけが対象"""
    out = []
    for h in hist:
        a = age_days(h.get('d', ''), today)
        if a is not None and a <= KEEP_DAYS:
            out.append(h)
    return out


def monthly(hist):
    """日ごとの記録を月ごとにまとめる。
    mid はその月の中央値、lo はその月の最安、hi はその月の最高、n は記録できた日数。
    日ごとの記録は保管庫に残るので、ここでまとめても情報は失われない"""
    by = {}
    for h in hist:
        m = str(h.get('d', ''))[:7]
        if len(m) == 7:
            by.setdefault(m, []).append(h)
    out = []
    for m in sorted(by):
        rows = by[m]
        mids = [x['mid'] for x in rows if x.get('mid')]
        los = [x['lo'] for x in rows if x.get('lo')]
        if not mids:
            continue
        mid = int(statistics.median(mids))
        lo = min(los) if los else min(mids)
        out.append({'d': m,
                    'mid': mid,
                    'lo': min(lo, mid),   # 最安が中央値を超えることはない
                    'hi': max(max(mids), mid),
                    'n': len(rows)})
    return out


def app_view(hist, today):
    """アプリが読み込むぶんを作る。
    直近 DAILY_DAYS 日は日ごと、それ以前は月ごとにまとめた点にする"""
    recent = []
    for h in hist:
        a = age_days(h.get('d', ''), today)
        # 0（今日ぶん）を偽として扱わないよう、必ず None と比べる
        if a is not None and a <= DAILY_DAYS:
            recent.append(h)
    return recent, monthly(hist)[-MONTHS_KEEP:]


def load_prev():
    if not os.path.exists(OUT_JSON):
        return {}
    try:
        with open(OUT_JSON, encoding='utf-8') as f:
            return (json.load(f) or {}).get('items') or {}
    except Exception as e:                      # 壊れていても新規作成で続行する
        print('前回データを読めませんでした:', e, file=sys.stderr)
        return {}


def main():
    load_dotenv()
    appid = os.environ.get('YAHOO_APPID', '').strip()
    if not appid:
        print('YAHOO_APPID が設定されていません。', file=sys.stderr)
        print('  GitHub Actions  : リポジトリの Secrets に YAHOO_APPID を登録してください', file=sys.stderr)
        print('  手元で試すとき  : このフォルダに .env を作り YAHOO_APPID=... と書いてください', file=sys.stderr)
        return 1

    with open(PARTS, encoding='utf-8') as f:
        parts = json.load(f)

    items = load_prev()
    diag = {}
    today = jst_today()
    ok = ng = 0

    for i, p in enumerate(parts, 1):
        name, query, ref = p['name'], p['query'], int(p.get('ref') or 0)
        # 前回の中央値があればそれを基準にする（相場の変化に追従させるため）
        prev = items.get(name, {}).get('hist') or []
        prev_mid = prev[-1].get('mid') if prev else None
        # 前回値は「誌面価格の0.5〜2.0倍に収まっているとき」だけ基準に使う。
        # そうしないと、一度おかしな値が入ったときに次回以降ずっと引きずられる
        anchor = ref
        if prev_mid and ref and ref * 0.5 <= prev_mid <= ref * 2.0:
            anchor = prev_mid
        try:
            prices, dg = extract(search(appid, query), anchor,
                                 p.get('must'), p.get('not'), p.get('cat'), p.get('band'))
        except Exception as e:
            print('  [%2d/%d] %-28s 取得失敗: %s' % (i, len(parts), name, e), file=sys.stderr)
            diag[name] = {'ok': False, 'why': 'api', 'msg': str(e)[:80]}
            ng += 1
            time.sleep(SLEEP)
            continue

        if len(prices) < MIN_HITS:
            why = ('0hit' if dg['hits'] == 0 else
                   'filtered' if dg['hits'] > 0 else 'few')
            print('  [%2d/%d] %-28s 記録せず（検索%d件 → 型番不一致%d / NG語%d / 価格帯外%d / 外れ値%d → 残り%d）'
                  % (i, len(parts), name, dg['hits'], dg['name'], dg['ng'], dg['book'], dg['med'], len(prices)))
            dg.update({'ok': False, 'why': why, 'kept': len(prices), 'q': query})
            diag[name] = dg
            # 失敗した日の古い記録は残さない。残すと「取れている」ように見えてしまう
            ent = items.get(name)
            if ent:
                ent['hist'] = [h for h in ent.get('hist', []) if h.get('d') != today]
                if not ent['hist']:
                    del items[name]      # 記録が空になった枠は残さない
            ng += 1
            time.sleep(SLEEP)
            continue

        lo = prices[0]
        mid = int(statistics.median(prices))
        dg.update({'ok': True, 'kept': len(prices)})
        diag[name] = dg
        entry = items.setdefault(name, {'cat': p['cat'], 'hist': []})
        entry['cat'] = p['cat']
        entry['hist'] = [h for h in entry.get('hist', []) if h.get('d') != today]
        entry['hist'].append({'d': today, 'lo': lo, 'mid': mid, 'n': len(prices)})
        entry['hist'].sort(key=lambda h: h['d'])
        entry['hist'] = prune_archive(entry['hist'], today)

        print('  [%2d/%d] %-28s 最安 %8s / 中央 %8s / %d件'
              % (i, len(parts), name, '{:,}'.format(lo), '{:,}'.format(mid), len(prices)))
        ok += 1
        time.sleep(SLEEP)

    head = {
        'updated': datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d %H:%M'),
        'source': 'Yahoo!ショッピング（商品検索API）',
        'note': '各日の値は、検索結果から外れ値を除いたうえでの中央値（mid）と最安値（lo）です。'
                '送料・ポイントは含みません。',
    }

    # 保管庫：日ごとの記録をそのまま残す。次回の基準値もここから読む
    archive = dict(head, items=items)

    # アプリ向け：直近は日ごと（hist）、2年ぶんは月ごと（mon）
    app_items = {}
    for name, e in items.items():
        recent, mon = app_view(e['hist'], today)
        app_items[name] = {'cat': e['cat'], 'hist': recent, 'mon': mon}
    feed = dict(head, items=app_items, diag=diag)

    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    # indent=0 で1行1要素にしておく。毎日1点ずつ増えるだけになるので、
    # Git の差分が小さいままで済む（1行にまとめるとファイル全体が毎日書き換わる）
    with open(OUT_JSON, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(archive, f, ensure_ascii=False, indent=0)
        f.write('\n')
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* 自動生成：編集しないでください */\n')
        f.write('window.PRICE_FEED = ')
        json.dump(feed, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')

    days = max((len(e['hist']) for e in items.values()), default=0)
    months = max((len(v['mon']) for v in app_items.values()), default=0)
    print('\n成功 %d 件 / 取得できず %d 件 / 収録パーツ %d 件' % (ok, ng, len(items)))
    print('保管庫 %s（最長 %d 日ぶん・%.0f KB） / アプリ用 %s（日ごと %d 点＋月ごと %d 点・%.0f KB）'
          % (os.path.basename(OUT_JSON), days, os.path.getsize(OUT_JSON) / 1024,
             os.path.basename(OUT_JS),
             max((len(v['hist']) for v in app_items.values()), default=0),
             months, os.path.getsize(OUT_JS) / 1024))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
