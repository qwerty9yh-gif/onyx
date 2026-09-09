const API = 'http://localhost:3001/api';
async function main() {
  const UID = process.argv[1];
  const body = JSON.stringify({ userId: UID, password: 'Onyx@2026' });
  console.log('sending body:', body);
  const res = await fetch(API + '/auth/card-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  console.log('HTTP', res.status);
  console.log(await res.text());
}
main();