const fs = require('fs');
const path = require('path');
const dir = 'c:/Users/user/Downloads/SYSTEM/new-project/apps/api/src/routes';
const files = fs.readdirSync(dir);
for (const f of files) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  console.log('===== ' + f + ' =====');
  const lines = s.split(/\r?\n/);
  lines.forEach((l, i) => {
    const t = l.trim();
    if (/prisma\.\w+\.(findMany|findUnique|findFirst|create|update|upsert|groupBy|aggregate|count)/.test(t)) {
      console.log((i+1) + ': ' + t.slice(0, 500));
    }
  });
  console.log('');
}
