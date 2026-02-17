
const rokuyoLib = require('rokuyo');

const today = new Date();
console.log(`Today:`, rokuyoLib.getByDate(today.getFullYear(), today.getMonth() + 1, today.getDate()));

console.log(`2030-12-31:`, rokuyoLib.getByDate(2030, 12, 31));
