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

HITS = 20           # 1パーツあたり取得する商品数
SLEEP = 1.1         # APIへの間隔（秒）。Yahoo!の制限が「1クエリ/秒」なので少し余裕をもたせる
DAILY_DAYS = 60     # 直近この日数は毎日の点を残す
MAX_POINTS = 250    # 1パーツあたりの保持点数の上限
# 2段階で絞り込む。
#  1) 誌面価格に対する広めの窓 … 明らかな別物だけを落とす。値下がりで切られないよう広くとる
#  2) その日の中央値に対する窓 … 付属品・バルク・法外な出品を落とす。相場が動いても追従する
LO_BOOK = 0.25
HI_BOOK = 3.00
LO_MED  = 0.60
HI_MED  = 2.00
MIN_HITS = 3        # これ未満しか残らない日は中央値が当てにならないので記録しない
NG_WORDS = ('中古', 'ジャンク', '訳あり', '部品取り', '本体のみ', '箱のみ', '空箱',
            'ステッカー', 'キーホルダー', 'Tシャツ')


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
        'sort': '+price',
    })
    req = urllib.request.Request(
        API + '?' + params,
        headers={'User-Agent': 'pc-price-feed/1.0 (personal study tool)'},
    )
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode('utf-8'))


def extract(data, ref):
    """APIの応答から対象パーツらしい価格だけを取り出し、診断情報も返す。

    戻り値: (価格のリスト, 診断dict)
    """
    hits = (data or {}).get('hits') or []
    diag = {'hits': len(hits), 'ng': 0, 'book': 0, 'med': 0}

    raw = []
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
        if any(w in name for w in NG_WORDS):
            diag['ng'] += 1
            continue
        raw.append(price)

    # 1段階目：誌面価格に対する広めの窓
    step1 = [p for p in raw if not ref or (ref * LO_BOOK <= p <= ref * HI_BOOK)]
    diag['book'] = len(raw) - len(step1)
    if not step1:
        return [], diag

    # 2段階目：その日の中央値を基準にした外れ値の除去
    med = statistics.median(step1)
    step2 = [p for p in step1 if med * LO_MED <= p <= med * HI_MED]
    diag['med'] = len(step1) - len(step2)
    return sorted(step2), diag


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
        try:
            prices, dg = extract(search(appid, query), ref)
        except Exception as e:
            print('  [%2d/%d] %-28s 取得失敗: %s' % (i, len(parts), name, e), file=sys.stderr)
            diag[name] = {'ok': False, 'why': 'api', 'msg': str(e)[:80]}
            ng += 1
            time.sleep(SLEEP)
            continue

        if len(prices) < MIN_HITS:
            why = ('0hit' if dg['hits'] == 0 else
                   'filtered' if dg['hits'] > 0 else 'few')
            print('  [%2d/%d] %-28s 記録せず（検索%d件 → NG語%d / 誌面外%d / 外れ値%d → 残り%d）'
                  % (i, len(parts), name, dg['hits'], dg['ng'], dg['book'], dg['med'], len(prices)))
            dg.update({'ok': False, 'why': why, 'kept': len(prices), 'q': query})
            diag[name] = dg
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
