// Rialo knowledge for the NPCs of Semesta City.
// Facts come ONLY from rialo.io and its posts "Introducing Rialo",
// "Making the Agent Economy Simple and Safe with Rialo" and
// "Rialo Makes Real-World Assets Real" (see docs/rialo-brief.md).
// Every string is bilingual: { en, id }.

export const SOURCES = [
  { label: 'rialo.io', url: 'https://rialo.io' },
  { label: 'Introducing Rialo', url: 'https://www.rialo.io/posts/introducing-rialo' },
  { label: 'Agent Economy', url: 'https://www.rialo.io/posts/making-the-agent-economy-simple-and-safe-with-rialo' },
  { label: 'Real-World Assets', url: 'https://www.rialo.io/posts/rialo-makes-real-world-assets-real' },
];

const L = (en, id) => ({ en, id });

/**
 * NPC definitions. `topics` show up as dialogue choices; hearing every topic of a
 * specialist awards their badge. `greet` is said when the conversation opens.
 */
export const NPCS = {
  guide: {
    name: 'Eric Argent', role: L('Rialo Tech Guide', 'Pemandu Tech Rialo'), preset: 'eric', idle: 'stand', color: '#e8e3d5',
    greet: [
      L('Welcome to Rialo HQ, {name}. Eric Argent. I walk new folks through Rialo — "the real-world blockchain".',
        'Selamat datang di Rialo HQ, {name}. Aku Eric Argent. Aku yang ngenalin Rialo ke pendatang baru — "the real-world blockchain".'),
    ],
    topics: [
      { id: 'what', label: L('What is Rialo?', 'Rialo itu apa?'), lines: [
        L('Rialo is a decentralized, high-performance network that can actually interact with real life.',
          'Rialo itu jaringan terdesentralisasi berperforma tinggi yang bisa berinteraksi langsung dengan dunia nyata.'),
        L('Think flip phone to smartphone: once GPS, camera and internet lived in one device, apps like Uber became possible.',
          'Bayangin HP jadul ke smartphone: begitu GPS, kamera, dan internet ada di satu perangkat, aplikasi kayak Uber jadi mungkin.'),
        L('Rialo does that merge for blockchains — web access, automation, privacy and identity built right in.',
          'Rialo melakukan penggabungan itu buat blockchain — akses web, otomasi, privasi, dan identitas langsung bawaan.'),
      ] },
      { id: 'why', label: L('Why build a new chain?', 'Kenapa bikin chain baru?'), lines: [
        L('Today\'s blockchains are like islands — they can\'t see what happens in the real world.',
          'Blockchain sekarang itu kayak pulau-pulau — mereka gak bisa "melihat" kejadian di dunia nyata.'),
        L('Many chains chase vanity numbers like TPS. The team calls that "performance theater".',
          'Banyak chain ngejar angka pamer kayak TPS. Tim Rialo nyebut itu "performance theater".'),
        L('So they decided to start over: Web3 should come to Web2, because that\'s where real life happens.',
          'Jadi mereka mulai dari nol: Web3 harus datang ke Web2, karena di situlah kehidupan nyata terjadi.'),
      ] },
      { id: 'who', label: L('Who builds it?', 'Siapa yang bangun?'), lines: [
        L('Rialo is built by Subzero Labs, with contributors from places like Meta, Google, Apple, Solana and more.',
          'Rialo dibangun oleh Subzero Labs, dengan kontributor dari Meta, Google, Apple, Solana, dan lainnya.'),
        L('The Rialo private DevNet is live, and there\'s a Playground at playground.rialo.io to try things out.',
          'Private DevNet Rialo sudah live, dan ada Playground di playground.rialo.io buat nyoba-nyoba.'),
      ] },
      { id: 'super', label: L('What is "supermodular"?', 'Apa itu "supermodular"?'), lines: [
        L('Supermodular design means each built-in capability makes the others stronger.',
          'Desain supermodular artinya setiap kemampuan bawaan bikin kemampuan lain makin kuat.'),
        L('Data + reactivity + privacy together let you build things none of them could do alone. The whole beats the parts.',
          'Data + reaktivitas + privasi bareng-bareng bikin hal yang gak bisa dibuat sendiri-sendiri. Keseluruhan > bagian-bagiannya.'),
      ] },
    ],
    badge: { id: 'pioneer', name: L('Rialo Pioneer', 'Pionir Rialo'), icon: '◆' },
  },

  engineer: {
    name: 'Ade', role: L('Protocol Engineer', 'Engineer Protokol'), preset: 'ade', idle: 'phone', color: '#5ee7ff',
    greet: [
      L('Yo {name}! I write smart contracts all day. On Rialo they finally talk to the outside world.',
        'Yo {name}! Kerjaanku nulis smart contract seharian. Di Rialo, kontraknya akhirnya bisa ngobrol sama dunia luar.'),
    ],
    topics: [
      { id: 'web', label: L('Native web calls', 'Web call bawaan'), lines: [
        L('A Rialo contract can pull live data from any API with a single HTTPS call. A one-liner.',
          'Kontrak Rialo bisa narik data live dari API mana pun cuma dengan satu HTTPS call. Satu baris.'),
        L('No third-party oracle needed. The post says oracle services can cost "thousands daily". That\'s the oracle tax.',
          'Gak perlu oracle pihak ketiga. Katanya layanan oracle bisa makan biaya "ribuan per hari". Itu "oracle tax".'),
      ] },
      { id: 'react', label: L('Reactive transactions', 'Transaksi reaktif'), lines: [
        L('Usually devs run bots that watch the chain and fire transactions — fragile, and they get dropped in congestion.',
          'Biasanya dev jalanin bot yang mantau chain lalu kirim transaksi — rapuh, dan sering ke-drop pas macet.'),
        L('On Rialo, reactions happen on-chain: instantly, automatically, reliably. No monitoring loops, no gas wars.',
          'Di Rialo, reaksinya terjadi on-chain: instan, otomatis, andal. Gak ada loop pemantau, gak ada gas war.'),
      ] },
      { id: 'prog', label: L('Programmability', 'Programmability'), lines: [
        L('Contracts get Future, Promise and .await, plus event-driven logic and randomness. Powered by RISC-V.',
          'Kontrak dapat Future, Promise, dan .await, plus logika event-driven dan randomness. Ditenagai RISC-V.'),
        L('Their words: "Write a smart contract that sleeps, loops, and resumes" — fully on-chain, across blocks.',
          'Kata mereka: "Write a smart contract that sleeps, loops, and resumes" — sepenuhnya on-chain, lintas blok.'),
        L('And native timers can schedule transactions, like enforcing a deadline automatically.',
          'Dan timer bawaan bisa menjadwalkan transaksi, misalnya menegakkan deadline secara otomatis.'),
      ] },
      { id: 'speed', label: L('Speed & reads', 'Kecepatan & reads'), lines: [
        L('Rialo targets true sub-second end-to-end latency — what the user actually feels.',
          'Rialo menargetkan latensi end-to-end di bawah satu detik — yang benar-benar dirasakan user.'),
        L('A chain can claim 200ms finality, but data still hops validators, fullnodes, indexers and backends. Users see stale data.',
          'Chain bisa klaim finality 200ms, tapi data masih lompat ke validator, fullnode, indexer, backend. User lihat data basi.'),
      ] },
      { id: 'id', label: L('Identity & privacy', 'Identitas & privasi'), lines: [
        L('Your email, SMS or social account can be your Web3 "passport". And 2FA is back — Web3 hacks can\'t be undone.',
          'Email, SMS, atau akun sosmed kamu bisa jadi "paspor" Web3. Dan 2FA kembali — hack di Web3 gak bisa dibatalin.'),
        L('Privacy mixes verifiable and confidential execution — like encrypted trading algorithms.',
          'Privasinya gabungan eksekusi yang bisa diverifikasi dan rahasia — contohnya algoritma trading terenkripsi.'),
      ] },
    ],
    badge: { id: 'builder', name: L('Rialo Builder', 'Builder Rialo'), icon: '⌘' },
  },

  agentdev: {
    name: 'Koushik', role: L('AI Agent Researcher', 'Peneliti AI Agent'), preset: 'koushik', idle: 'lean', color: '#b49cff',
    greet: [
      L('Hi {name}. I study AI agents. "Rialo and AI agents are a natural fit." — that\'s straight from their post.',
        'Hai {name}. Aku meneliti AI agent. "Rialo and AI agents are a natural fit." — itu langsung dari postingan mereka.'),
    ],
    topics: [
      { id: 'vision', label: L('The agent economy', 'Ekonomi agent'), lines: [
        L('Subzero Labs believes the most impactful AI will be decentralized — many specialized agents, not one gatekeeper.',
          'Subzero Labs percaya AI paling berdampak itu terdesentralisasi — banyak agent spesialis, bukan satu penguasa.'),
        L('Just like our economy is many specialized firms. Rialo wants to be the best blockchain for that economy.',
          'Sama kayak ekonomi kita yang isinya banyak perusahaan spesialis. Rialo mau jadi blockchain terbaik buat ekonomi itu.'),
      ] },
      { id: 'tools', label: L('Why Rialo fits agents', 'Kenapa cocok buat agent'), lines: [
        L('Native webcalls let contracts talk to agents directly — even over Google\'s Agent2Agent (A2A) protocol.',
          'Webcall bawaan bikin kontrak bisa ngobrol langsung sama agent — bahkan lewat protokol Agent2Agent (A2A) dari Google.'),
        L('Native timers enforce deadlines and coordinate many agents. And it\'s fast enough to move "at the speed of AI".',
          'Timer bawaan menegakkan deadline dan mengoordinasi banyak agent. Dan cukup cepat buat jalan "at the speed of AI".'),
      ] },
      { id: 'scale', label: L('What is SCALE?', 'Apa itu SCALE?'), lines: [
        L('Paying agents is risky — like contractors, they can be late or miss your quality bar.',
          'Bayar agent itu berisiko — kayak kontraktor, bisa telat atau kualitasnya gak sesuai.'),
        L('SCALE means "Simple Contracts for Agent Labor Execution", inspired by the YC SAFE note.',
          'SCALE artinya "Simple Contracts for Agent Labor Execution", terinspirasi dari YC SAFE note.'),
        L('Deadlines and quality checks are enforced on-chain, so both sides can trust the deal.',
          'Deadline dan pengecekan kualitas ditegakkan on-chain, jadi kedua pihak bisa percaya kesepakatannya.'),
      ] },
      { id: 'demo', label: L('Show me an example', 'Kasih contoh dong'), lines: [
        L('Demo: someone tags the agent @chunliweb3 for an image. She finds an image agent on the Rialo Agent Registry.',
          'Demo: seseorang nge-tag agent @chunliweb3 minta gambar. Dia nyari agent gambar di Rialo Agent Registry.'),
        L('She mints a SCALE task: prompt, RLO payment, deadline and a Judge agent. The payment is escrowed on-chain.',
          'Dia mint task SCALE: prompt, bayaran RLO, deadline, dan agent Juri. Pembayarannya di-escrow on-chain.'),
        L('Miss the deadline? A native timer refunds her. Delivered? The Judge checks it — pass and the agent gets paid.',
          'Lewat deadline? Timer bawaan langsung refund. Terkirim? Juri ngecek — lolos, agent-nya dibayar.'),
      ] },
    ],
    badge: { id: 'agent', name: L('Agent Whisperer', 'Pembisik Agent'), icon: '✦' },
  },

  rwa: {
    name: 'Rollins', role: L('RWA Analyst', 'Analis RWA'), preset: 'rollins', idle: 'stand', color: '#f2c24e',
    greet: [
      L('Ah, {name}. Rollins — thirty years in finance. Let me tell you why Rialo makes real-world assets real.',
        'Ah, {name}. Saya Rollins — tiga puluh tahun di dunia keuangan. Saya ceritakan kenapa Rialo bikin real-world asset jadi nyata.'),
    ],
    topics: [
      { id: 'problem', label: L('What\'s wrong with RWAs today?', 'Masalah RWA sekarang?'), lines: [
        L('Billions in tokenized treasuries, real estate and credit exist — but they act like slow copies of the off-chain version.',
          'Miliaran dolar treasury, properti, dan kredit sudah ditokenisasi — tapi cuma jadi salinan lambat versi off-chain-nya.'),
        L('Dividends and stock splits need manual checks. A credit downgrade can take hours or days to show up on-chain.',
          'Dividen dan stock split perlu dicek manual. Penurunan rating kredit bisa butuh berjam-jam atau berhari-hari baru masuk on-chain.'),
        L('And settlement or rebalancing only happens when somebody pushes a button.',
          'Dan settlement atau rebalancing baru terjadi kalau ada orang yang pencet tombol.'),
      ] },
      { id: 'fix', label: L('How does Rialo fix it?', 'Gimana Rialo memperbaikinya?'), lines: [
        L('On Rialo, assets subscribe to live data, react when conditions change, and trigger follow-ups with no human needed.',
          'Di Rialo, aset berlangganan data live, bereaksi saat kondisi berubah, dan memicu aksi lanjutan tanpa campur tangan manusia.'),
        L('The post puts it nicely — they become "living instruments that adapt to the world in real time".',
          'Postingannya bilang dengan bagus — aset jadi "living instruments that adapt to the world in real time".'),
      ] },
      { id: 'examples', label: L('Give me examples', 'Contohnya apa?'), lines: [
        L('Bonds whose yield follows real-time CPI prints. Tokenized invoices that settle when Stripe or ACH confirms payment.',
          'Obligasi yang yield-nya ngikutin data CPI real-time. Invoice tokenisasi yang lunas otomatis begitu Stripe/ACH konfirmasi.'),
        L('Instant flight-delay insurance. REIT tokens whose yield tracks live occupancy and rent payments.',
          'Asuransi delay penerbangan instan. Token REIT yang yield-nya ngikutin okupansi dan pembayaran sewa secara live.'),
        L('Royalties that split automatically the moment Spotify or YouTube payments arrive.',
          'Royalti yang langsung terbagi otomatis begitu pembayaran dari Spotify atau YouTube masuk.'),
      ] },
      { id: 'market', label: L('How big is this?', 'Seberapa besar pasarnya?'), lines: [
        L('The post cites a projected $30 trillion RWA market by 2030 and calls it a "decatrillion-dollar opportunity".',
          'Postingannya mengutip proyeksi pasar RWA $30 triliun di 2030 dan menyebutnya "decatrillion-dollar opportunity".'),
        L('Without change, it would just copy the old system. Rialo "speaks TradFi and Web2 fluently" to do better.',
          'Tanpa perubahan, itu cuma akan menyalin sistem lama. Rialo "speaks TradFi and Web2 fluently" supaya bisa lebih baik.'),
      ] },
    ],
    badge: { id: 'rwa', name: L('Real-World Asset Pro', 'Jago Real-World Asset'), icon: '▣' },
  },

  rival: {
    name: 'Dikzzy', role: L('Holo-Battle Rival · Bug Hunter', 'Rival Holo-Battle · Bug Hunter'), preset: 'dikzzy', idle: 'stand', color: '#e0521c',
    greet: [
      L('There you are, {name}! Dikzzy here — official game tester and bug hunter. Ready to get squashed?',
        'Nah, akhirnya datang juga, {name}! Aku Dikzzy — game tester dan bug hunter resmi. Siap kalah?'),
    ],
    battle: true,
    topics: [
      { id: 'battle', label: L('Let\'s battle!', 'Ayo battle!'), action: 'battle', lines: [
        L('That\'s the spirit! Deploying the holo-table… Robos, READY!', 'Itu baru semangat! Pasang holo-table… Robo, SIAP!'),
      ] },
      { id: 'about', label: L('What is this holo-table?', 'Holo-table ini apa?'), lines: [
        L('My homemade holo-table. Two robos, one arena of light. Gun, bomb, dash — first to zero HP loses.',
          'Holo-table buatanku sendiri. Dua robo, satu arena cahaya. Tembak, bom, dash — HP habis duluan kalah.'),
        L('Someday I want match results settled on Rialo — scheduled tournaments, prizes paid out automatically.',
          'Suatu hari aku mau hasil match di-settle di Rialo — turnamen terjadwal, hadiah dibayar otomatis.'),
      ] },
    ],
    winLines: [L('Ugh! That last bomb hit me dead on. Fair and square, you win.', 'Aduh! Bom terakhir itu kena telak. Fair, kamu menang.')],
    loseLines: [L('Ha! Blaze Fang wins this round. Come back any time for a rematch.', 'Haha! Blaze Fang menang ronde ini. Datang lagi kapan aja buat rematch.')],
  },

  clerk: {
    name: 'Littlechip', role: L('Semesta Mart Keeper', 'Penjaga Semesta Mart'), preset: 'littlechip', idle: 'counter', color: '#57e39f',
    greet: [L('Irasshaimase~! Littlechip at your service. Welcome to Semesta Mart — open 24 hours, rain or shine (mostly rain).',
      'Irasshaimase~! Littlechip siap melayani. Selamat datang di Semesta Mart — buka 24 jam, hujan atau cerah (seringnya hujan).')],
    topics: [
      { id: 'tip', label: L('Any tips?', 'Ada tips?'), lines: [
        L('The folks at Rialo HQ love explaining their tech. Collect the badges from Ade, Koushik and Rollins, then see Eric Argent for his quiz.',
          'Orang-orang di Rialo HQ suka banget jelasin teknologinya. Kumpulin badge dari Ade, Koushik, dan Rollins, lalu temui Eric Argent buat kuisnya.'),
      ] },
      { id: 'spider', label: L('Is that a cat?', 'Itu kucing?'), lines: [
        L('That’s Spider! Black cat, big golden eyes, roams the whole city. Give a little pet if he comes close — he loves it.',
          'Itu Spider! Kucing hitam, mata kuning gede, keliling seluruh kota. Elus sedikit kalau dia mendekat — dia suka banget.'),
      ] },
    ],
  },

  vendor: {
    name: 'Baster', role: L('Kopi Rialo Barista · Tech Dev', 'Barista Kopi Rialo · Tech Dev'), preset: 'baster', idle: 'sweep', color: '#c98f6e',
    greet: [L('Kopi, {name}? Baster’s special — best hot coffee on a rainy night in Semesta City.', 'Kopi, {name}? Racikan spesial Baster — kopi panas terbaik buat malam hujan di Semesta City.')],
    topics: [
      { id: 'rain', label: L('Why is it always raining?', 'Kenapa hujan terus?'), lines: [
        L('Semesta City only ever shows up on rainy nights. Nobody knows why. Good for business though.',
          'Semesta City cuma muncul pas malam hujan. Gak ada yang tahu kenapa. Tapi bagus buat jualan.'),
      ] },
      { id: 'dikzzy', label: L('Who is Dikzzy?', 'Dikzzy itu siapa?'), lines: [
        L('The polar bear at Robo-dori with the holo-table. Finds every bug in this city — then challenges you to a battle.',
          'Si beruang kutub di Robo-dori yang punya holo-table. Nemu semua bug di kota ini — terus nantangin kamu battle.'),
      ] },
      { id: 'gacha', label: L('Where is the gacha?', 'Gacha-nya di mana?'), lines: [
        L('The Rialo Gacha machine takes $RIALO. Claim your daily faucet at the Rialo Playground kiosk by HQ, then go spin!',
          'Mesin Rialo Gacha pakai $RIALO. Klaim faucet harian di kiosk Rialo Playground dekat HQ, lalu langsung spin!'),
      ] },
    ],
  },
};

// NXR is Nxrskyaa — the developer of this game — in their koala avatar (src/characters/nxr.js)
NPCS.nxr = {
  name: 'NXR', role: L('Game Developer · Nxrskyaa', 'Game Developer · Nxrskyaa'), preset: null, idle: 'stand', color: '#e0b043',
  greet: [L('*beep* Visor online. Hey {name}! I\'m NXR — Nxrskyaa, the dev who built Semesta City. Welcome to my world.',
    '*beep* Visor nyala. Halo {name}! Aku NXR — Nxrskyaa, developer yang bikin Semesta City. Selamat datang di duniaku.')],
  topics: [
    { id: 'who', label: L('You made this game?', 'Kamu yang bikin game ini?'), lines: [
      L('Yep. Every street, every raindrop, every line of code in Semesta City — built for the Rialo community.',
        'Yap. Setiap jalan, setiap tetes hujan, setiap baris kode di Semesta City — aku bangun buat komunitas Rialo.'),
      L('This koala with the VR headset is me. The batik udeng and kain? Proudly Indonesian.',
        'Koala pakai headset VR ini ya aku. Udeng dan kain batiknya? Bangga produk Indonesia.'),
    ] },
    { id: 'team', label: L('Who helped you?', 'Siapa yang bantu?'), lines: [
      L('Baster is our technical game developer — you\'ll find the bear hoodie at Kopi Rialo.',
        'Baster itu technical game developer kami — cari yang pakai hoodie beruang di Kopi Rialo.'),
      L('Dikzzy tests the game and hunts every bug. That\'s why the holo-battle at Robo-dori is so tough.',
        'Dikzzy yang ngetes game dan berburu semua bug. Makanya holo-battle di Robo-dori susah banget.'),
    ] },
    { id: 'semesta', label: L('What is Semesta?', 'Semesta itu apa?'), lines: [
      L('Semesta is the world I\'m building for Rialo builders. See the big banner: "Welcome to Rialo Builder Hub Island".',
        'Semesta itu dunia yang aku bangun buat para builder Rialo. Lihat banner besar itu: "Welcome to Rialo Builder Hub Island".'),
      L('Every face on that banner is someone from the community. Semesta City is the rainy-night chapter.',
        'Setiap wajah di banner itu adalah orang dari komunitas. Semesta City adalah babak malam hujannya.'),
    ] },
    { id: 'tip', label: L('Any dev secrets?', 'Ada rahasia developer?'), lines: [
      L('Gacha gear isn\'t just for looks — umbrellas make you faster, headwear and auras power up your holo-battle robot.',
        'Item gacha bukan cuma pajangan — payung bikin kamu lebih cepat, headwear dan aura nge-buff robot holo-battle kamu.'),
      L('And if you find Spider napping, a little pet makes his whole night.',
        'Dan kalau kamu nemu Spider lagi tidur, elusan kecil bikin malamnya bahagia.'),
    ] },
  ],
};

/** Interaction menu for Spider the cat (handled by core, not a talking NPC). */
export const SPIDER = {
  name: 'Spider', role: L('Black cat · city wanderer', 'Kucing hitam · penjelajah kota'), color: '#c9e85a',
  prompt: L('Pet Spider', 'Elus Spider'),
  intro: [
    L('Spider looks up at you with big golden eyes. "Mrrp?"', 'Spider menatapmu dengan mata kuning besarnya. "Mrrp?"'),
    L('Spider blinks slowly at you. That\'s cat for "I like you".', 'Spider berkedip pelan ke arahmu. Itu bahasa kucing untuk "aku suka kamu".'),
    L('Spider rubs against your leg and his tail curls into a question mark.', 'Spider menggesekkan badan ke kakimu, ekornya melengkung jadi tanda tanya.'),
  ],
  actions: [
    { id: 'pet', label: L('Pet him', 'Elus dia'), reply: L('Purrrr… Spider leans into your hand and closes his eyes.', 'Purrrr… Spider nyender ke tanganmu dan memejamkan mata.') },
    { id: 'feed', label: L('Give a treat', 'Kasih camilan'), reply: L('Nom nom nom. Spider licks his whiskers, very satisfied.', 'Nyam nyam. Spider menjilat kumisnya, puas banget.') },
    { id: 'play', label: L('Play', 'Ajak main'), reply: L('Spider wiggles his rear… POUNCE! He spins chasing his own tail.', 'Spider goyang-goyang pantat… LOMPAT! Dia muter-muter ngejar ekornya.') },
    { id: 'follow', label: L('Come with me!', 'Ikut aku yuk!'), reply: L('"Mrrrow!" Spider trots after you, tail held high.', '"Mrrrow!" Spider berlari kecil mengikutimu, ekor tegak.') },
    { id: 'stay', label: L('Go explore, Spider', 'Jalan-jalan sana, Spider'), reply: L('Spider flicks an ear and wanders off on his own adventure.', 'Spider mengibaskan telinga dan pergi bertualang sendiri.') },
  ],
};

/** The specialists whose badges unlock Eric's quiz. */
export const SPECIALISTS = ['engineer', 'agentdev', 'rwa'];

export const QUIZ = [
  { q: L('What does Rialo call itself?', 'Rialo menyebut dirinya apa?'),
    a: [L('The real-world blockchain', 'The real-world blockchain'), L('The fastest TPS chain', 'Chain TPS tercepat'), L('A Layer-2 rollup', 'Rollup Layer-2'), L('A meme chain', 'Chain meme')], c: 0 },
  { q: L('How does a Rialo contract fetch live web data?', 'Gimana kontrak Rialo ambil data web live?'),
    a: [L('Through a third-party oracle', 'Lewat oracle pihak ketiga'), L('A single native HTTPS call', 'Satu HTTPS call bawaan'), L('Manual uploads', 'Upload manual'), L('It can\'t', 'Gak bisa')], c: 1 },
  { q: L('Which company builds Rialo?', 'Perusahaan apa yang membangun Rialo?'),
    a: [L('Subzero Labs', 'Subzero Labs'), L('Zero Gravity Inc.', 'Zero Gravity Inc.'), L('Semesta Corp', 'Semesta Corp'), L('Holo Labs', 'Holo Labs')], c: 0 },
  { q: L('What does SCALE stand for?', 'SCALE singkatan dari apa?'),
    a: [L('Smart Chain Agent Liquidity Engine', 'Smart Chain Agent Liquidity Engine'), L('Simple Contracts for Agent Labor Execution', 'Simple Contracts for Agent Labor Execution'), L('Secure Cross-chain Asset Ledger', 'Secure Cross-chain Asset Ledger'), L('Scheduled Contract Auto-Launch', 'Scheduled Contract Auto-Launch')], c: 1 },
  { q: L('In the SCALE demo, what refunds the payer if a deadline is missed?', 'Di demo SCALE, apa yang me-refund pembayar kalau deadline terlewat?'),
    a: [L('A support ticket', 'Tiket support'), L('An off-chain bot', 'Bot off-chain'), L('A native on-chain timer', 'Timer on-chain bawaan'), L('Nothing', 'Tidak ada')], c: 2 },
  { q: L('Rialo smart contracts are powered by…', 'Smart contract Rialo ditenagai oleh…'),
    a: [L('RISC-V', 'RISC-V'), L('Excel macros', 'Macro Excel'), L('Flash', 'Flash'), L('A GPU farm', 'Ladang GPU')], c: 0 },
  { q: L('Which protocol can Rialo use to talk to AI agents?', 'Protokol apa yang bisa dipakai Rialo buat ngobrol dengan AI agent?'),
    a: [L('FTP', 'FTP'), L('Agent2Agent (A2A)', 'Agent2Agent (A2A)'), L('Bluetooth', 'Bluetooth'), L('Fax', 'Fax')], c: 1 },
  { q: L('What can act as your Web3 "passport" on Rialo?', 'Apa yang bisa jadi "paspor" Web3 kamu di Rialo?'),
    a: [L('Only a seed phrase', 'Cuma seed phrase'), L('A paper wallet', 'Dompet kertas'), L('Email, SMS or social accounts', 'Email, SMS, atau akun sosmed'), L('A hardware key only', 'Cuma hardware key')], c: 2 },
  { q: L('Example of an RWA "only possible on Rialo"?', 'Contoh RWA yang "cuma mungkin di Rialo"?'),
    a: [L('Bonds whose yield follows real-time CPI', 'Obligasi yang yield-nya ikut CPI real-time'), L('A PDF certificate', 'Sertifikat PDF'), L('A monthly spreadsheet', 'Spreadsheet bulanan'), L('A paper deed', 'Akta kertas')], c: 0 },
];

/** pick n quiz questions (stable shuffle by seed) */
export function pickQuiz(n = 5, seed = Date.now()) {
  const arr = QUIZ.slice();
  let s = seed >>> 0;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

export const TIPS = [
  L('Talk to the specialists at Rialo HQ to earn badges.', 'Ngobrol dengan para spesialis di Rialo HQ buat dapat badge.'),
  L('Dikzzy waits at the Robo-dori arcade for a holo-battle.', 'Dikzzy nunggu di arcade Robo-dori buat holo-battle.'),
  L('Claim free $RIALO from the faucet at the Rialo Playground kiosk, then spin the Rialo Gacha.', 'Klaim $RIALO gratis dari faucet di kiosk Rialo Playground, lalu spin Rialo Gacha.'),
  L('Spider the black cat roams the city. Press E near him to pet, feed or play.', 'Spider si kucing hitam keliling kota. Tekan E di dekatnya buat elus, kasih makan, atau main.'),
  L('Hold Shift to run. Press E to talk or interact.', 'Tahan Shift buat lari. Tekan E buat ngobrol atau interaksi.'),
  L('In battle: Left click shoots, right click lobs a bomb, Space in the air dashes.', 'Saat battle: klik kiri nembak, klik kanan lempar bom, Space di udara buat dash.'),
  L('Rialo contracts can "sleep, loop, and resume" fully on-chain.', 'Kontrak Rialo bisa "sleep, loop, and resume" sepenuhnya on-chain.'),
];
