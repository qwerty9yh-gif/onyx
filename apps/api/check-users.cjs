const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user
  .findMany({ select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true } })
  .then((u) => {
    console.log(JSON.stringify(u, null, 2));
    return p.$disconnect();
  })
  .catch((e) => {
    console.error('ERR', e.message);
    return p.$disconnect();
  });