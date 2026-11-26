// Rotterdam VII-bot voor Discord: /stats, /versie en /tip.
// Draait gratis op Cloudflare Workers. Discord stuurt elk slash-commando naar deze URL.
// Nodig: omgevingsvariabele PUBLIC_KEY (de "Public Key" van de Discord-app Rotterdam VII).

const REPO = 'liamdej0ng/rotterdam7';
const SITE = 'https://rotterdamvii.nl/';
const UPDATE_JSON = 'https://liamdej0ng.github.io/rotterdam7/update.json';
const ICOON = 'https://liamdej0ng.github.io/rotterdam7/discord-icon.png';
const ROOD = 0xC8102E;

const TIPS = [
  'Druk op **Spatie** tijdens het rijden voor de handrem: zo drift je door bochten, vooral op gladde sneeuwwegen.',
  'Houd **Ctrl** ingedrukt op een scooter of motor voor een wheelie.',
  'Ga naar huis 🏠 en ga **slapen** om je spel op te slaan.',
  'Met **P** pak je je telefoon: bestel een taxi, bel personages of koop een huis op Funda010.',
  'Energiedrank op? Je **conditie** komt vanzelf terug als je even wandelt in plaats van rent.',
  'Druk op **V** voor eerste persoon, ook in de auto: dan zie je je dashboard en stuur.',
  'Met **C** wissel je tussen **Barry** en **Bella** Boem.',
  'Zet je auto op naam in de **garage naast je huis**, dan raak je hem nooit meer kwijt.',
  'In de auto wissel je van radiozender met **Q**, en met **O** zet je de radio uit.',
  'Bij sneeuw bevriest het meer: je kunt erop lopen en zelfs schaatsen... of slippen met je auto.',
  'Villa\'s in **Strandwijk** kosten meer dan een miljoen, maar je krijgt er een zwembad, sportschool en bioscoop bij.',
  'Op de kaart (**M**) zie je missies als gekleurde letters. Na het starten volg je de gele route.',
  'Wordt de politie lastig? Hoe meer ★ je hebt, hoe harder ze je zoeken. Verstop je even of rij snel weg.',
  'Zet je graphics op **Max** voor de mooiste screenshots, en deel ze in #📸・screenshots!',
  'Missie **Havenfrequentie**: help Nova Nul en Rico Radar het mysterieuze signaal in de haven te vinden.',
];

// ---------- handtekening controleren (verplicht voor Discord) ----------
const hex = h => new Uint8Array(h.match(/.{2}/g).map(b => parseInt(b, 16)));
async function echtVanDiscord(req, body, publicKey) {
  const sig = req.headers.get('X-Signature-Ed25519'), ts = req.headers.get('X-Signature-Timestamp');
  if (!sig || !ts || !publicKey) return false;
  try {
    const key = await crypto.subtle.importKey('raw', hex(publicKey), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, hex(sig), new TextEncoder().encode(ts + body));
  } catch (e) { return false; }
}

const json = o => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });
const antwoord = embed => json({ type: 4, data: { embeds: [{ color: ROOD, thumbnail: { url: ICOON }, footer: { text: 'Made by Liam & Tim' }, ...embed }] } });
const nl = n => n.toLocaleString('nl-NL');

// ---------- commando's ----------
async function stats() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, { headers: { 'User-Agent': 'Rotterdam7-Bot', Accept: 'application/vnd.github+json' } });
  const rel = r.ok ? await r.json() : [];
  let totaal = 0, laatst = 0;
  rel.forEach((x, i) => (x.assets || []).filter(a => a.name.endsWith('.exe')).forEach(a => { totaal += a.download_count; if (i === 0) laatst += a.download_count; }));
  return antwoord({
    title: '📊 Rotterdam VII in cijfers',
    fields: [
      { name: '⬇️ Downloads totaal', value: nl(totaal), inline: true },
      { name: '🆕 Nieuwste app', value: `${rel[0] ? rel[0].tag_name : '-'} (${nl(laatst)}×)`, inline: true },
      { name: '📦 App-versies', value: nl(rel.length), inline: true },
    ],
    description: `Nog niet gedownload? [rotterdamvii.nl](${SITE})`,
  });
}

async function versie() {
  const r = await fetch(UPDATE_JSON + '?t=' + Date.now());
  const u = r.ok ? await r.json() : {};
  const punten = (u.notes || '').split(/\.\s+/).filter(Boolean).map(p => '• ' + p.replace(/\.$/, '')).join('\n');
  return antwoord({
    title: `🎮 Nieuwste versie: ${u.version || '?'}`,
    url: SITE,
    description: (punten || 'Geen notities.').slice(0, 3500) + '\n\n🔄 Sluit de app en open hem opnieuw, dan krijg je deze versie vanzelf.',
    fields: [{ name: '🖥️ App', value: u.app || '-', inline: true }],
  });
}

function tip() {
  return antwoord({ title: '💡 Tip', description: TIPS[Math.floor(Math.random() * TIPS.length)] });
}

export default {
  async fetch(req, env) {
    if (req.method !== 'POST') return new Response('Rotterdam VII-bot draait ✅');
    const body = await req.text();
    if (!(await echtVanDiscord(req, body, env.PUBLIC_KEY))) return new Response('Ongeldige handtekening', { status: 401 });
    const i = JSON.parse(body);
    if (i.type === 1) return json({ type: 1 }); // PING van Discord
    if (i.type === 2) {
      try {
        if (i.data.name === 'stats') return await stats();
        if (i.data.name === 'versie') return await versie();
        if (i.data.name === 'tip') return tip();
      } catch (e) {
        return json({ type: 4, data: { content: 'Oeps, er ging iets mis. Probeer het zo nog eens.', flags: 64 } });
      }
    }
    return json({ type: 4, data: { content: 'Onbekend commando.', flags: 64 } });
  },
};
