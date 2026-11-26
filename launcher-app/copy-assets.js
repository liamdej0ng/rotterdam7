// Kopieert het spel, de plaatjes, personages, achtergrondvideo en three.js naar app/ voordat je bouwt.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), app = path.join(__dirname, 'app');
for (const f of ['game.html', 'poster.jpg', 'favicon.png', 'chars.js', 'discord-icon.png', 'updates.json']) fs.copyFileSync(path.join(root, f), path.join(app, f));
fs.copyFileSync(require.resolve('three/build/three.min.js'), path.join(app, 'three.min.js'));
const md = path.join(app, 'media'); fs.mkdirSync(path.join(md, 'characters'), { recursive: true });
for (const f of ['hero.mp4', 'barry.jpg', 'bella.jpg', 'aerial.jpg', 'nacht.jpg']) fs.copyFileSync(path.join(root, 'media', f), path.join(md, f));
for (const f of fs.readdirSync(path.join(root, 'media', 'characters'))) fs.copyFileSync(path.join(root, 'media', 'characters', f), path.join(md, 'characters', f));
console.log('klaar: spel, plaatjes, personages, video en three.min.js staan in app/');
