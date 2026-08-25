// PreviMater CRM — service worker
//
// POR QUE ESTE ARQUIVO FOI REESCRITO EM 25/08/2026
//
// O que estava aqui era o service worker do FULLFIN, copiado de repo
// errado. Ele pre-cacheava '/fullfin/index.html', '/fullfin/' e
// '/fullfin/manifest.json' — caminhos que EXISTEM, porque os dois apps
// moram no mesmo dominio (esdraspresidente.github.io). Entao ele
// instalava sem erro e assumia o escopo do CRM, servindo o CRM por um
// cache que nao era dele. Trazia junto um handler de share-target que
// redireciona para '/fullfin/', codigo morto aqui.
//
// O estrago apareceu em 25/08: o celular ficou horas mostrando um
// index.html velho depois de um deploy, e o chat desenhava a bolha de
// midia do jeito antigo enquanto o desktop ja mostrava o novo.
//
// A REGRA PRINCIPAL: O index.html NUNCA E SERVIDO DE CACHE QUANDO HA
// REDE. Ele tem 400 KB, concentra o app inteiro e muda varias vezes por
// dia, de conversas diferentes. Uma copia velha nao e so tela
// desatualizada: e alguem operando com regra de negocio antiga sem
// desconfiar. O fetch dele vai com cache:'no-store' para pular ate o
// cache HTTP do navegador, que e o que enganou o celular hoje — o
// GitHub Pages responde com max-age e o telefone honrou.
//
// O cache offline fica so para o que nao muda: manifesto e icones. Se
// o telefone estiver sem rede, o index.html cacheado da ultima visita
// ainda e servido — melhor um app velho que nenhum app —, mas com rede
// a versao nova ganha sempre.
//
// Mudar o numero de CACHE apaga o anterior no activate. E o jeito de
// forcar todo mundo a largar cache ruim: e por isso que este comeca em
// v2, para matar o 'fullfin-v3.71' que ficou nos aparelhos.

const CACHE = 'previmater-crm-v2';

// So o que e estavel. index.html de proposito fora daqui.
const ASSETS = [
  './manifest.json',
  './icon192.png',
  './icon512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // allSettled e nao addAll: se um icone faltar, o SW ainda instala.
      // Com addAll, um 404 derruba a instalacao inteira e o app fica sem
      // service worker nenhum sem avisar.
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Supabase passa direto: dado de cliente nao entra em cache do
  // navegador, e link assinado de storage expira em minutos.
  if (url.includes('supabase.co')) return;
  if (e.request.method !== 'GET') return;

  const ehDocumento = e.request.mode === 'navigate' ||
                      url.endsWith('/') ||
                      url.includes('index.html') ||
                      url.includes('trafego.html');

  if (ehDocumento) {
    e.respondWith(
      fetch(new Request(url, { cache: 'no-store' }))
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        // Só cai no cache quando a rede falhou de verdade.
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Resto (icone, manifesto): cache primeiro, que é o que não muda.
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
