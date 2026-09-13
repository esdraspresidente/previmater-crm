/* Teste de CSP. Se esta faixa verde aparecer dentro da Autentica, a plataforma
 * permite carregar script externo e o caminho do favorito e viavel.
 * Nao le, nao envia e nao altera nada na conta. */
(function () {
  var d = document.createElement('div');
  d.textContent = 'PASSOU: script externo carregou dentro da Autentica';
  d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;' +
    'background:#16a34a;color:#fff;font:600 16px system-ui;padding:14px;text-align:center';
  d.onclick = function () { d.remove(); };
  document.body.appendChild(d);
})();
