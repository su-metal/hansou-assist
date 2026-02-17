
const { Lunar } = require('lunar-javascript');

const start = new Date('2026-02-18');
for (let i = 0; i < 15; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const lunar = Lunar.fromDate(d);
    console.log(`${d.toISOString().split('T')[0]}: ${lunar.getLiuYao()}`);
}
