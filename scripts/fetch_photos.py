# Link-R World — 真实照片抓取管线（Wave 18）
#
# 数据源：Wikimedia Commons（自由许可图库）。
#   检索：api.wikimedia.org/core/v1/commons/search/page（限流友好）
#   下载：commons.wikimedia.org/wiki/Special:FilePath/<File>?width=N（重定向到 thumb CDN）
#   压缩：Pillow 统一转 JPEG（景点 640px / 城市大图 1280px，q=74）
# 每条记录带「标题必须命中关键词」，保证图与地点对应，宁缺毋滥；
# 失败不阻塞构建 —— 前端对缺失照片有 SVG 插画兜底。
#
# 运行：python scripts/fetch_photos.py [--force]
# 产物：public/photos/**.jpg + src/data/photos.ts（映射）

import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTO_ROOT = os.path.join(ROOT, 'public', 'photos')
TS_OUT = os.path.join(ROOT, 'src', 'data', 'photos.ts')
UA = 'LinkRWorld-photo-fetch/1.0 (local build script; contact: davychen)'
BLOCK = ['map', 'logo', 'flag', 'coat of arms', 'seal', 'diagram', 'plan of', 'stamp', 'metro', 'subway']
EXT_OK = ('.jpg', '.jpeg', '.png')


def e(key, q, must, w=640):
    return {'key': key, 'q': q, 'must': must, 'w': w}


# ── 城市大图（hero，1280px） ─────────────────────────────────
HEROES = [
    e('shanghai', 'The Bund Shanghai skyline', ['bund'], 1280),
    e('beijing', 'Meridian Gate Forbidden City', ['meridian gate', 'forbidden city'], 1280),
    e('suzhou', "Humble Administrator's Garden pavilion", ['humble administrator'], 1280),
    e('hangzhou', 'West Lake Hangzhou', ['west lake'], 1280),
    e('wuxi', 'Yuantouzhu Taihu Wuxi', ['yuantouzhu', 'taihu'], 1280),
    e('puer', 'tea plantation Yunnan', ['tea plantation', 'tea garden'], 1280),
    e('xishuangbanna', 'Xishuangbanna', ['xishuangbanna'], 1280),
    e('dali', 'Erhai Lake Dali', ['erhai', 'dali'], 1280),
    e('tengchong', 'Heshun Tengchong', ['heshun', 'tengchong'], 1280),
    e('lijiang', 'Lijiang Old Town', ['lijiang'], 1280),
    e('xian', "Xi'an City wall", ['city wall'], 1280),
    e('quanzhou', 'Kaiyuan Temple Quanzhou pagoda', ['kaiyuan', 'pagoda quanzhou'], 1280),
    e('chengdu', 'Anshun Bridge Chengdu night', ['anshun', 'chengdu'], 1280),
]

# ── 景点（key = placeId） ───────────────────────────────────
SIGHTS = [
    # 上海
    e('sh-yu', 'Yu Garden Shanghai', ['yu garden']),
    e('sh-bund', 'Bund Shanghai night', ['bund']),
    e('sh-wukang', 'Wukang Mansion Shanghai', ['wukang', 'normandie']),
    e('sh-xintiandi', 'Xintiandi Shanghai', ['xintiandi']),
    e('sh-columbia', 'Columbia Country Club Shanghai', ['columbia']),
    e('sh-duoyun', 'Shanghai Tower', ['shanghai tower']),
    e('sh-huazheng', 'Suzhou Creek Shanghai', ['suzhou creek']),
    e('sh-1933', '1933 Old Millfun Shanghai', ['1933', 'millfun']),
    e('sh-psa', 'Power Station of Art Shanghai', ['power station of art']),
    e('sh-long', 'Long Museum West Bund', ['long museum']),
    e('sh-sinan', 'Sinan Mansions Shanghai', ['sinan']),
    # 北京
    e('bj-gugong', 'Forbidden City Hall of Supreme Harmony', ['forbidden city', 'supreme harmony']),
    e('bj-jingshan', 'Jingshan Park Beijing', ['jingshan']),
    e('bj-beihai', 'Beihai Park Beijing', ['beihai park']),
    e('bj-798', '798 Art Zone Beijing', ['798']),
    e('bj-shichahai', 'Shichahai Beijing', ['shichahai']),
    e('bj-guobo', 'National Museum of China building', ['national museum of china']),
    e('bj-zhonglou', 'Beijing Drum Tower', ['drum tower', 'bell tower']),
    e('bj-liulichang', 'Liulichang Beijing', ['liulichang']),
    e('bj-pageone', 'Qianmen Beijing street', ['qianmen']),
    e('bj-yandai', 'Yandai Xiejie Beijing', ['yandai', 'shichahai']),
    # 苏州
    e('sz-pingjiang', 'Pingjiang Road Suzhou', ['pingjiang']),
    e('sz-zhuozheng', "Humble Administrator's Garden", ['humble administrator']),
    e('sz-subo', 'Suzhou Museum', ['suzhou museum']),
    e('sz-shizilin', 'Lion Grove Garden', ['lion grove']),
    e('sz-shantang', 'Shantang Street Suzhou', ['shantang']),
    e('sz-huqiu', 'Tiger Hill Suzhou', ['tiger hill']),
    e('sz-wangshi', 'Master of the Nets Garden', ['master of the nets']),
    e('sz-yipu', 'Garden of Cultivation Suzhou', ['garden of cultivation', 'yipu']),
    e('sz-ouyuan', "Couple's Retreat Garden Suzhou", ['couple']),
    e('sz-shuangta', 'Twin Pagodas Suzhou', ['twin pagoda', 'twin towers']),
    # 杭州
    e('hz-duanqiao', 'Broken Bridge West Lake Hangzhou', ['broken bridge', 'bai causeway']),
    e('hz-sudi', 'Su Causeway West Lake', ['su causeway', 'west lake']),
    e('hz-lingyin', 'Lingyin Temple Hangzhou', ['lingyin']),
    e('hz-longjing', 'Longjing tea', ['longjing', 'long jing']),
    e('hz-qiaoxi', 'Gongchen Bridge Hangzhou', ['gongchen']),
    e('hz-qinghefang', 'Hefang Street Hangzhou', ['hefang', 'qinghefang']),
    e('hz-nanshan', 'West Lake Hangzhou causeway', ['west lake']),
    # 无锡
    e('wx-huishan', 'Huishan Ancient Town Wuxi', ['huishan']),
    e('wx-jichang', 'Jichang Garden Wuxi', ['jichang']),
    e('wx-qingmingqiao', 'Qingming Bridge Wuxi', ['qingming bridge', 'wuxi canal']),
    e('wx-yuantouzhu', 'Yuantouzhu', ['yuantouzhu', 'turtle head']),
    e('wx-donglin', 'Donglin Academy Wuxi', ['donglin']),
    e('wx-nanchansi', 'Nanchan Temple Wuxi', ['nanchan temple']),
    # 普洱
    e('pe-nakeli', 'Tea Horse Road Yunnan', ['tea horse']),
    e('pe-bolan-yuan', 'Pu’er tea plantation', ['tea plantation', 'tea garden']),
    # 西双版纳
    e('xs-zhiwuyuan', 'Xishuangbanna Tropical Botanical Garden', ['tropical botanical', 'menglun']),
    e('xs-yexianggu', 'Elephas maximus', ['elephas', 'elephant']),
    e('xs-manting', 'Manting Park Jinghong', ['manting']),
    e('xs-jiangbian', 'Lancang River Jinghong', ['lancang', 'mekong']),
    e('xs-dajinta', 'Pagoda Jinghong Xishuangbanna', ['jinghong', 'pagoda']),
    e('xs-gaozhuang', 'Jinghong', ['jinghong']),
    # 西安
    e('xa-zhonggulou', "Xi'an Bell Tower", ['bell tower']),
    e('xa-shanlibo', 'Shaanxi History Museum', ['shaanxi history']),
    e('xa-shuyuanmen', "Xi'an city wall South Gate", ['city wall', 'south gate']),
    e('xa-shunchengxiang', "Xi'an city wall", ['city wall']),
    # 泉州
    e('qz-kaiyuansi', 'Kaiyuan Temple Quanzhou', ['kaiyuan']),
    e('qz-xijie', 'Quanzhou West Street', ['west street', 'xi jie']),
    e('qz-zhonglou', 'Quanzhou Clock Tower', ['clock tower']),
    e('qz-qingjingsi', 'Qingjing Mosque Quanzhou', ['qingjing']),
    e('qz-luoyangqiao', 'Luoyang Bridge Quanzhou', ['luoyang bridge']),
    e('qz-qingyuanshan', 'Qingyuan Mountain Quanzhou', ['qingyuan']),
    e('qz-fuwenmiao', 'Confucius Temple Quanzhou', ['confucius temple', 'wen miao']),
    e('qz-tianhougong', 'Tianhou Palace Quanzhou', ['tianhou', 'mazu']),
    e('qz-xunpu', 'Xunpu Quanzhou oyster', ['xunpu', 'oyster']),
    e('qz-zhongshanlu', 'Quanzhou street houses', ['quanzhou']),
    e('qz-chengtiansi', 'Chengtian Temple Quanzhou', ['chengtian']),
    # 大理
    e('dl-gucheng', 'Dali Old Town', ['dali old town', 'dali ancient', 'dali']),
    e('dl-santa', 'Three Pagodas Chongsheng Temple Dali', ['three pagoda', 'chongsheng']),
    e('dl-erhai', 'Erhai Lake', ['erhai']),
    e('dl-longkan', 'Erhai Lake shore', ['erhai']),
    e('dl-xizhou', 'Xizhou Town Yunnan', ['xizhou', 'dali']),
    e('dl-yanjia', 'Bai people courtyard house', ['bai', 'courtyard', 'yunnan']),
    e('dl-zhoucheng', 'Tie-dye Yunnan Bai', ['tie-dye', 'tie dye', 'batik']),
    e('dl-shuanglang', 'Shuanglang Dali', ['shuanglang', 'erhai']),
    e('dl-cangshan', 'Cangshan Dali', ['cangshan', 'cang shan']),
    e('dl-jizhaoan', 'Cangshan Dali mountain', ['cangshan', 'cang shan']),
    e('dl-haishe', 'Erhai Yunnan lake', ['erhai']),
    e('dl-hudiequan', 'Butterfly Spring Dali', ['butterfly spring', 'hudie']),
    e('dl-wuwei', 'Temple Dali Yunnan', ['dali', 'temple', 'yunnan']),
    # 腾冲
    e('tc-heshun', 'Heshun Tengchong', ['heshun']),
    e('tc-heshun-library', 'Tengchong library', ['tengchong', 'library', 'heshun']),
    e('tc-rehai', 'Rehai Tengchong hot spring', ['rehai', 'tengchong']),
    e('tc-huoshan', 'Tengchong volcano', ['volcano', 'tengchong']),
    e('tc-beihai', 'Beihai wetland Tengchong', ['beihai', 'wetland']),
    e('tc-yinxingcun', 'Ginkgo biloba village China', ['ginkgo']),
    e('tc-guoshang', 'Tengchong memorial', ['tengchong', 'memorial', 'cemetery']),
    e('tc-qiluo', 'Tengchong Yunnan', ['tengchong']),
    e('tc-wenmiao', 'Confucian temple Yunnan', ['confucian temple', 'confucius temple']),
    e('tc-simola', 'Wa people Yunnan', ['wa ', 'yunnan', 'rice terrace']),
    e('tc-laifengshan', 'Camellia flower', ['camellia']),
    e('tc-yunfengshan', 'Taoist temple mountain Yunnan', ['taoist', 'temple', 'yunnan']),
    e('tc-dieshuihe', 'Waterfall Yunnan', ['waterfall', 'yunnan']),
    # 丽江
    e('lj-gucheng', 'Lijiang Old Town', ['lijiang']),
    e('lj-mufu', 'Mu Mansion Lijiang', ['mu ', 'mansion', 'lijiang']),
    e('lj-wanggulou', 'Lion Hill Lijiang', ['lion hill', 'lijiang']),
    e('lj-heilongtan', 'Black Dragon Pool Lijiang', ['black dragon pool']),
    e('lj-sifangjie', 'Lijiang old town street', ['lijiang']),
    e('lj-shuhe', 'Shuhe Old Town Lijiang', ['shuhe']),
    e('lj-baisha', 'Baisha Lijiang', ['baisha']),
    e('lj-yulongxueshan', 'Jade Dragon Snow Mountain', ['jade dragon', 'yulong']),
    e('lj-wenhai', 'Yunnan meadow lake', ['yunnan', 'meadow', 'lake']),
    # 成都
    e('cd-xiongmao', 'Giant panda Chengdu', ['panda']),
    e('cd-kuanzhai', 'Kuanzhai Alley Chengdu', ['kuanzhai', 'wide and narrow']),
    e('cd-taikoo', 'Taikoo Li Chengdu', ['taikoo']),
    e('cd-wuhou', 'Wuhou Shrine Chengdu', ['wuhou']),
    e('cd-jinli', 'Jinli Street Chengdu', ['jinli']),
    e('cd-dufu', 'Du Fu Thatched Cottage', ['du fu']),
]

# ── 食物/饮品（品类真实图） ─────────────────────────────────
FOODS = [
    e('shengjian', 'Shengjian mantou pan-fried bun', ['shengjian', 'sheng jian', 'pan-fried']),
    e('xiaolong', 'Xiaolongbao', ['xiaolongbao', 'soup dumpling']),
    e('kaoya', 'Peking duck', ['peking duck']),
    e('paomo', 'Yangrou paomo', ['paomo']),
    e('roujiamo', 'Roujiamo', ['roujiamo', 'rou jia', 'chinese hamburger']),
    e('noodle', 'Chinese noodle soup bowl', ['noodle']),
    e('wonton', 'Wonton', ['wonton']),
    e('pastry', 'Dessert sweets plate', ['dessert']),
    e('mooncake', 'Mooncake', ['mooncake']),
    e('zongzi', 'Zongzi rice dumpling', ['zongzi']),
    e('coffee', 'Latte art coffee cup', ['latte art']),
    e('coffee-estate', 'Coffee plantation beans', ['coffee plantation', 'coffee beans']),
    e('tea', 'Teapot', ['teapot']),
    e('nightmarket', 'Night market', ['night market']),
    e('hotpot', 'Sichuan hot pot', ['hot pot', 'hotpot']),
    e('skewer', 'Grilled meat skewers street food', ['skewer']),
    e('grilledfish', 'Grilled fish dish', ['grilled fish']),
    e('milktea', 'Bubble milk tea', ['bubble tea', 'milk tea']),
    e('juice', 'Orange juice glass', ['orange juice']),
    e('cocktail', 'Cocktail drink bar', ['cocktail']),
    e('craftbeer', 'Craft beer glasses', ['craft beer']),
    e('fruit', 'Fruit market stall', ['fruit market', 'fruit stall']),
    e('dish', 'Chinese food dishes table', ['dishes', 'chinese food', 'chinese cuisine']),
    e('doufen', 'Xidoufen Yunnan pea porridge', ['xi doufen', 'pea porridge', 'er kuai']),
]

# ── Wave 20 · 配图去重：补齐此前未命中的景点实景图 ──────────────
SIGHTS += [
    e('sh-anfu', 'Anfu Road Shanghai', ['anfu road', 'wukang road']),
    e('sh-yuyuanlu', 'Yuyuan Road Shanghai', ['yuyuan road']),
    e('sh-banceng', 'Bookstore interior China', ['zhongshuge', 'bookstore interior']),
    e('sh-julu', 'Julu Road Shanghai', ['julu road']),
    e('bj-yangmeizhu', 'Yangmeizhu Xiejie Beijing', ['yangmeizhu', 'dashilan']),
    e('bj-mofan', 'Hutong bookshop Beijing', ['bookshop beijing', 'hutong bookstore']),
    e('bj-zhengyang', 'Zhengyangmen Beijing', ['zhengyangmen']),
    e('sz-pingtan', 'Pingtan storytelling Suzhou', ['pingtan', 'suzhou pingtan']),
    e('hz-tianmuli', 'Tianmuli Hangzhou', ['tianmuli', 'ode house']),
    e('hz-chabowuguan', 'National Tea Museum Hangzhou', ['china national tea museum', 'tea museum hangzhou']),
    e('wx-dierquan', 'Huishan Spring Wuxi', ['huishan spring', 'tianxia dier quan']),
    e('wx-bowuyuan', 'Wuxi Museum', ['wuxi museum']),
    e('pe-meizihu', 'Meizihu lake Puer', ['meizihu', 'puer lake']),
    e('pe-chamagucheng', 'Chamagucheng Puer night', ['chamagucheng', 'chama ancient road']),
    e('pe-bowuguan', 'Puer museum', ['puer museum']),
    e('pe-laoshan', 'Simao old town street', ['simao', 'puer street']),
    e('xs-xingguang', 'Xishuangbanna night market', ['gaozhuang xishuangbanna', 'jinghong night market']),
    e('xs-zongfosi', 'Buddhist temple Jinghong', ['zongfosi', 'jinghong temple', 'watong']),
    e('xa-beilin', 'Beilin Museum Xi an', ['beilin museum', 'stele forest xi an']),
    e('xa-xiangzimiao', 'Xiangzimiao Xi an', ['xiangzimiao', 'temple xi an']),
    e('xa-defuxiang', 'Defuxiang Xi an', ['defuxiang', 'xi an street']),
    e('xa-chengqiang', 'Xi an city wall south gate', ['yongningmen', 'xi an city wall']),
    e('xa-laocaichang', 'Xi an creative market', ['laocaichang', 'xi an market']),
    e('qz-zhongshanlu', 'Zhongshan Road Qilou Quanzhou', ['qilou quanzhou', 'zhongshan road']),
    e('qz-guanyuemiao', 'Guandi temple Quanzhou', ['guandi temple', 'quanzhou temple']),
    e('qz-fuwenmiao', 'Confucius temple Quanzhou', ['quanzhou confucian temple', 'wenmiao quanzhou']),
    e('qz-xunpu', 'Xunpu village Quanzhou', ['xunpu', 'oyster shell house']),
    e('cd-renmin', 'Renmin Park Chengdu', ['renmin park chengdu', 'heming teahouse']),
    e('cd-wangping', 'Mengzhuiwan Chengdu', ['mengzhuiwan', 'chengdu riverside']),
    e('cd-dongjiao', 'Dongjiao Memory Chengdu', ['dongjiao memory', 'chengdu industrial']),
    e('dl-yanjia', 'Yanjiadayuan museum Xizhou', ['yan jiadayuan', 'xizhou bai architecture']),
    e('tc-heshun-library', 'Heshun library Tengchong', ['heshun library', 'heshun town']),
    e('tc-yinxingcun', 'Ginkgo village Tengchong', ['ginkgo village', 'ginkgo china']),
    e('tc-yunfengshan', 'Yunfeng mountain Tengchong', ['yunfeng mountain', 'tengchong mountain']),
    e('lj-wanggulou', 'Wangu Tower Lijiang', ['wangu tower', 'lion hill lijiang']),
    e('lj-zhongyi', 'Zhongyi market Lijiang', ['lijiang market', 'zhongyi market']),
]


def http_json(url, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as ex:
            last = ex
            if ex.code in (429, 503):
                time.sleep(4 * (i + 1))
                continue
            raise
    raise last


def search_files(q, must):
    """返回候选 File: 标题列表（按相关度），宁缺毋滥。"""
    api = 'https://api.wikimedia.org/core/v1/commons/search/page?limit=10&q=' + urllib.parse.quote(q)
    data = http_json(api)
    hits = []
    for pg in data.get('pages', []):
        title = (pg.get('title') or '').replace('File:', '')
        low = title.lower()
        if not low.endswith(EXT_OK):
            continue
        if any(b in low for b in BLOCK):
            continue
        if any(m in low for m in must):
            hits.append(title)
    return hits


def optimize(raw_path, out_path, width):
    from PIL import Image
    im = Image.open(raw_path)
    im = im.convert('RGB')
    if im.width > width:
        h = round(im.height * width / im.width)
        im = im.resize((width, h), Image.LANCZOS)
    im.save(out_path, 'JPEG', quality=74, optimize=True, progressive=True)


def download_raw(title, raw_dir):
    raw = os.path.join(raw_dir, urllib.parse.quote(title, safe='') + '.bin')
    url = ('https://commons.wikimedia.org/wiki/Special:FilePath/'
           + urllib.parse.quote(title) + '?width=1280')
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r, open(raw, 'wb') as f:
        f.write(r.read())
    return raw


def fetch_one(entry, out_path, raw_dir):
    if os.path.exists(out_path) and os.path.getsize(out_path) > 4000:
        return 'cache'
    for attempt in range(3):
        try:
            candidates = search_files(entry['q'], entry['must'])
            if not candidates:
                return None
        except urllib.error.HTTPError:
            time.sleep(3)
            continue
        last_err = None
        for title in candidates[:4]:
            try:
                raw = download_raw(title, raw_dir)
            except urllib.error.HTTPError as ex:
                last_err = ex
                time.sleep(0.8)
                continue
            optimize(raw, out_path, entry['w'])
            os.remove(raw)
            return title
        if last_err and getattr(last_err, 'code', 0) == 429:
            time.sleep(5)
            continue
        return None
    return None


def city_dir_of(key):
    city = 'xishuangbanna' if key.startswith('xs') else key.split('-')[0]
    return os.path.join(PHOTO_ROOT, city)


def run():
    force = '--force' in sys.argv
    os.makedirs(PHOTO_ROOT, exist_ok=True)
    raw_dir = os.path.join(PHOTO_ROOT, '_raw')
    os.makedirs(raw_dir, exist_ok=True)
    jobs = (
        [(h, PHOTO_ROOT, f"photos/{h['key']}.jpg") for h in HEROES]
        + [(s, city_dir_of(s['key']), f"photos/{s['key'].split('-')[0] if not s['key'].startswith('xs') else 'xishuangbanna'}/{s['key']}.jpg") for s in SIGHTS]
        + [(f, os.path.join(PHOTO_ROOT, 'food'), f"photos/food/{f['key']}.jpg") for f in FOODS]
    )
    ok, misses = {}, []
    for entry, out_dir, web_path in jobs:
        key = entry['key']
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, key + '.jpg')
        if force and os.path.exists(out_path):
            os.remove(out_path)
        try:
            r = fetch_one(entry, out_path, raw_dir)
        except Exception as ex:  # noqa: BLE001
            r = None
            print(f"x {key} — {type(ex).__name__}: {ex}", flush=True)
            time.sleep(1.5)
            continue
        if r:
            ok[key] = web_path
            sz = os.path.getsize(out_path) // 1024
            print(f"+ {key} ({'cache' if r == 'cache' else sz}) {r if isinstance(r, str) and r != 'cache' else ''}", flush=True)
        else:
            misses.append(key)
            print(f"- {key} — 无命中（{entry['q']}）", flush=True)
        time.sleep(0.35)

    def block(entries, table):
        rows = [f"  '{k}': '{table[k]}'," for k in [x['key'] for x in entries] if k in table]
        return '\n'.join(rows) or '  // 暂无'

    ts = f"""// Link-R World — 真实照片映射（由 scripts/fetch_photos.py 生成，勿手改）
// 数据源：Wikimedia Commons（自由许可图库）。缺失条目由前端插画兜底。

export const CITY_HERO: Record<string, string> = {{
{block(HEROES, ok)}
}};

export const PLACE_PHOTO: Record<string, string> = {{
{block(SIGHTS, ok)}
}};

export const FOOD_PHOTO: Record<string, string> = {{
{block(FOODS, ok)}
}};
"""
    with io.open(TS_OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(ts)
    print(f"\n完成：成功 {len(ok)}/{len(jobs)} → src/data/photos.ts")
    if misses:
        print('未命中：' + ', '.join(misses))


if __name__ == '__main__':
    run()
