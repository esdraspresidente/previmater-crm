/* Etapa 1b: descobrir o nome do campo do upload.
 * O servidor aceitou "files" mas leu o nome do arquivo como texto ("c" =
 * primeira letra), entao ele viu o campo e nao o tratou como arquivo.
 * Aqui varremos as variantes de uma vez em vez de chutar uma por conversa. */
(function () {
  var antigo = document.getElementById('pm-teste'); if (antigo) antigo.remove();

  var p = document.createElement('div');
  p.id = 'pm-teste';
  p.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;overflow:auto;padding:16px;font:14px system-ui;color:#111';
  p.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center">' +
    '<b style="font-size:17px">Upload — varredura</b><button id="pm-x" style="font-size:20px;border:0;background:#eee;border-radius:6px;padding:4px 12px">X</button></div>' +
    '<input type="file" id="pm-arq" accept=".docx,.doc,.pdf" style="margin:10px 0;display:block">' +
    '<button id="pm-go" style="background:#2563eb;color:#fff;border:0;border-radius:6px;padding:10px 16px;font-size:15px">Varrer</button>' +
    '<div id="pm-out" style="background:#111;color:#0f0;font:12px ui-monospace;padding:10px;border-radius:6px;white-space:pre-wrap;word-break:break-all;margin-top:12px;min-height:60px">pronto</div>';
  document.body.appendChild(p);
  var out = p.querySelector('#pm-out');
  p.querySelector('#pm-x').onclick = function () { p.remove(); };

  var VARIANTES = ['files', 'files[]', 'files[0]', 'file', 'file[]', 'file[0]',
                   'arquivo', 'arquivos', 'arquivos[]', 'upload', 'documento', 'Files'];

  p.querySelector('#pm-go').onclick = function () {
    var f = p.querySelector('#pm-arq').files[0];
    if (!f) return out.textContent = 'escolhe um arquivo primeiro';
    out.textContent = 'varrendo ' + VARIANTES.length + ' variantes...\n\n';

    // sequencial de proposito: paralelo aqui vira dez arquivos temporarios
    // ao mesmo tempo na conta deles, e resposta embaralhada
    var i = 0;
    (function proxima() {
      if (i >= VARIANTES.length) { out.textContent += '\n== fim =='; return; }
      var campo = VARIANTES[i++];
      var fd = new FormData();
      fd.append('action', 'save');
      fd.append(campo, f, f.name);
      fetch('/Upload/SalvarTemporario', { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function (r) { return r.text(); })
        .then(function (t) {
          var resumo;
          try {
            var j = JSON.parse(t); j = (typeof j === 'string') ? JSON.parse(j) : j;
            var e = Array.isArray(j) ? j[0] : j;
            resumo = e ? ('status=' + e.status + ' name=' + JSON.stringify(e.name) +
                          ' ext=' + JSON.stringify(e.extensao) + ' pag=' + e.countPage) : 'vazio []';
            if (e && e.status) resumo = '>>> ACERTOU <<< ' + resumo + '\n    hash=' + e.hash;
          } catch (err) { resumo = t.slice(0, 120).replace(/\s+/g, ' '); }
          out.textContent += campo + ' -> ' + resumo + '\n';
        })
        .catch(function (e) { out.textContent += campo + ' -> ERRO ' + e.message + '\n'; })
        .then(proxima);
    })();
  };
})();
