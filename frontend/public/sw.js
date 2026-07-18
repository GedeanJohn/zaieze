// Service worker mínimo: só existe pra satisfazer o critério de "instalável" dos navegadores
// (Chrome/Android exige um SW registrado com handler de fetch pra oferecer o prompt de instalação).
// Sem cache proposital — sempre busca da rede, pra nunca servir versão desatualizada do app.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
