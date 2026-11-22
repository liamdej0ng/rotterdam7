// Kopieert het spel, de plaatjes en three.js naar app/ voordat je bouwt.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), app = path.join(__dirname, 'app');
for (const f of ['game.html', 'poster.jpg', 'favicon.png']) fs.copyFileSync(path.join(root, f), path.join(app, f));
fs.copyFileSync(require.resolve('three/build/three.min.js'), path.join(app, 'three.min.js'));
console.log('klaar: game.html, poster.jpg, favicon.png en three.min.js staan in app/');
