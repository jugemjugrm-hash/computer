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
DAILY_DAYS = 60     # 直近この日数は毎日の点を残す
MAX_POINTS = 250    # 1パーツあたりの保持点数の上限
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


def extract(data, ref, must=None, ban=None):
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
        hit = next((w for w in NG_WORDS if w in name), None)
        if hit:
            diag['ng'] += 1
            diag['ngw'][hit] = diag['ngw'].get(hit, 0) + 1
            continue
        raw.append(price)
        kept_names.append((name, price))

    if raw:
        diag['range'] = [min(raw), max(raw)]   # 価格帯で切る前の分布（診断用）

    # 1段階目：基準価格に対する窓
    step1 = [p for p in raw if not ref or (ref * LO_BOOK <= p <= ref * HI_BOOK)]
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


def thin(hist, today):
    """直近は毎日、それより古い分は週1点に間引く（フィードを軽く保つため）"""
    t = datetime.strptime(today, '%Y-%m-%d').date()
    keep, seen_weeks = [], set()
    for h in hist:
        try:
            d = datetime.strptime(h['d'], '%Y-%m-%d').date()
        except ValueError:
            continue
        if (t - d).days <= DAILY_DAYS:
            keep.append(h)
        else:
            wk = d.isocalendar()[:2]
            if wk not in seen_weeks:
                seen_weeks.add(wk)
                keep.append(h)
    return keep[-MAX_POINTS:]


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
                                 p.get('must'), p.get('not'))
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
        entry['hist'] = thin(entry['hist'], today)

        print('  [%2d/%d] %-28s 最安 %8s / 中央 %8s / %d件'
              % (i, len(parts), name, '{:,}'.format(lo), '{:,}'.format(mid), len(prices)))
        ok += 1
        time.sleep(SLEEP)

    feed = {
        'updated': datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d %H:%M'),
        'source': 'Yahoo!ショッピング（商品検索API）',
        'note': '各日の値は、検索結果から外れ値を除いたうえでの中央値（mid）と最安値（lo）です。'
                '送料・ポイントは含みません。',
        'items': items,
        'diag': diag,
    }

    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    with open(OUT_JSON, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(feed, f, ensure_ascii=False, indent=1)
        f.write('\n')
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* 自動生成：編集しないでください */\n')
        f.write('window.PRICE_FEED = ')
        json.dump(feed, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')

    print('\n成功 %d 件 / 取得できず %d 件 / 収録パーツ %d 件' % (ok, ng, len(items)))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
