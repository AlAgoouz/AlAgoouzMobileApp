"""Advisory name suggestions only: never changes imported rows or item IDs."""
import re
import unicodedata
from rapidfuzz import fuzz, process


def normalized_name(value):
    text = unicodedata.normalize('NFKC', str(value or '')).lower()
    text = re.sub('[أإآ]', 'ا', text).replace('ة', 'ه').replace('ى', 'ي')
    return ''.join(c for c in text if c.isalnum())


def suggest_rows(rows, columns, catalog, aliases, normalize):
    name_column = next((c for c in columns if normalize(c) in aliases['name']), None)
    code_column = next((c for c in columns if normalize(c) in aliases['code']), None)
    if not name_column or not catalog:
        return []
    # Names are prepared once; cap work even if an external catalog grows.
    if len(catalog) > 10000:
        return []
    names = [normalized_name(item.get('name')) for item in catalog]
    exact_codes = {normalize(i.get('code')) for i in catalog}
    exact_codes.update(normalize(i.get('barcode')) for i in catalog if i.get('barcode'))
    exact_names = {normalize(i.get('name')) for i in catalog}
    results, cached = [], {}
    for index, row in enumerate(rows):
        name, code = str(row.get(name_column, '')), normalize(row.get(code_column, '')) if code_column else ''
        if code and code in exact_codes or not code and normalize(name) in exact_names:
            continue
        key = normalized_name(name)
        if len(key) < 3:
            continue
        if key not in cached:
            if len(cached) >= 500:
                continue
            cached[key] = [dict(itemId=catalog[n]['id'], name=catalog[n]['name'], code=catalog[n].get('code',''), score=round(score, 1)) for _, score, n in process.extract(key,names,scorer=fuzz.ratio,score_cutoff=70,limit=3)]
        if cached[key]:
            results.append({'row':index,'candidates':cached[key]})
        if len(results) >= 500:
            break
    return results
