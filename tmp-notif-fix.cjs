const fs = require('fs');
const f = 'apps/web/src/pages/notifications/NotificationsPage.tsx';
let s = fs.readFileSync(f, 'utf8');
const old = "navigate(`/products/${product.id}/edit`)";
const nw = "navigate('/incoming')";
let count = 0;
while (s.includes(old)) { s = s.replace(old, nw); count++; }
fs.writeFileSync(f, s);
console.log('replaced', count, 'occurrences');