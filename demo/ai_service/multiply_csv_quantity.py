import csv
from pathlib import Path

p = Path(__file__).with_name('conditional_relationship_stats.csv')
if not p.exists():
    raise SystemExit('CSV file not found: ' + str(p))

rows = []
with p.open('r', encoding='utf-8', newline='') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    for r in reader:
        q = r.get('quantity')
        try:
            qn = int(float(q))
        except Exception:
            qn = 0
        r['quantity'] = str(qn * 4)
        rows.append(r)

with p.open('w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print('Updated', p)
