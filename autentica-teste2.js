/* Painel de teste dos tres POSTs da Autentica.
 * Roda dentro da pagina deles (mesma origem), usando a sessao ja aberta.
 * Cada botao e uma etapa, pra que uma falha diga ONDE falhou.
 * Deliberadamente separado do modulo de producao: aqui a gente descobre os
 * nomes de campo; depois eu levo a correcao pro modulo. */
(function () {
  var antigo = document.getElementById('pm-teste');
  if (antigo) antigo.remove();

  var est = {}; // guarda hashes entre as etapas

  var p = document.createElement('div');
  p.id = 'pm-teste';
  p.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;' +
    'overflow:auto;padding:16px;font:14px system-ui;color:#111';
  p.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
    '<b style="font-size:17px">Teste Autentica</b><button id="pm-x" style="font-size:20px;border:0;background:#eee;border-radius:6px;padding:4px 12px">X</button></div>' +
    '<p style="color:#666;margin:8px 0">Um botao de cada vez. Me manda o texto da caixa preta.</p>' +
    '<hr><b>1. Upload</b><br><input type="file" id="pm-arq" accept=".docx,.doc,.pdf" style="margin:8px 0">' +
    '<br><button class="pm-b" id="pm-1">Testar upload</button>' +
    '<hr><b>2. Signatario</b><br>' +
    '<input id="pm-nome" placeholder="Seu nome" style="width:100%;padding:8px;margin:4px 0">' +
    '<input id="pm-cel" placeholder="Seu celular (41999999999)" style="width:100%;padding:8px;margin:4px 0">' +
    '<button class="pm-b" id="pm-2">Cadastrar signatario</button>' +
    '<hr><b>3. Criar envio</b> <span style="color:#b91c1c">— dispara SMS pro numero acima</span><br>' +
    '<button class="pm-b" id="pm-3">Criar envio</button>' +
    '<hr><div id="pm-out" style="background:#111;color:#0f0;font:12px ui-monospace;padding:10px;' +
    'border-radius:6px;white-space:pre-wrap;word-break:break-all;min-height:80px">pronto</div>';
  document.body.appendChild(p);
  p.querySelectorAll('.pm-b').forEach(function (b) {
    b.style.cssText = 'background:#2563eb;color:#fff;border:0;border-radius:6px;padding:10px 16px;font-size:15px';
  });

  var out = p.querySelector('#pm-out');
  function log(t) { out.textContent = t; }
  p.querySelector('#pm-x').onclick = function () { p.remove(); };

  function post(url, body, extra) {
    return fetch(url, Object.assign({ method: 'POST', body: body, credentials: 'same-origin' }, extra || {}))
      .then(function (r) {
        return r.text().then(function (t) {
          if (/^\s*</.test(t)) throw new Error('SESSAO MORTA (veio HTML) HTTP ' + r.status);
          return 'HTTP ' + r.status + '\n' + t.slice(0, 1200);
        });
      });
  }

  // 1) upload. O nome do campo e a unica suposicao que sobrou do meu lado:
  // tento "files" e, se falhar, "file", pra sair daqui com a resposta certa.
  p.querySelector('#pm-1').onclick = function () {
    var f = p.querySelector('#pm-arq').files[0];
    if (!f) return log('escolhe um arquivo primeiro');
    log('subindo ' + f.name + ' ...');
    var tentar = function (campo) {
      var fd = new FormData();
      fd.append(campo, f, f.name);
      fd.append('action', 'save');
      return post('/Upload/SalvarTemporario', fd).then(function (t) {
        return 'campo "' + campo + '"\n' + t;
      });
    };
    tentar('files').then(function (a) {
      return tentar('file').then(function (b) { log(a + '\n\n---\n\n' + b); });
    }).catch(function (e) { log('ERRO: ' + e.message); });
  };

  // 2) signatario: metodo 2 = SMS, opcional 5 = assinatura manuscrita
  p.querySelector('#pm-2').onclick = function () {
    var d = new URLSearchParams();
    d.append('hash', ''); d.append('nome', p.querySelector('#pm-nome').value);
    d.append('cpf', ''); d.append('dataNascimento', ''); d.append('email', '');
    d.append('celular', p.querySelector('#pm-cel').value);
    d.append('metodoValidacao', '2');
    d.append('autenticacoesOpcionais[]', '5');
    if (!d.get('nome') || !d.get('celular')) return log('preenche nome e celular');
    log('cadastrando ...');
    post('/signatario/SalvarSignatario', d.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } })
      .then(function (t) {
        try { est.sig = JSON.parse(t.split('\n').slice(1).join('\n')).hash; } catch (e) { }
        log(t + (est.sig ? '\n\n>> hash guardado' : ''));
      }).catch(function (e) { log('ERRO: ' + e.message); });
  };

  // 3) envio final. Precisa do hash do arquivo (etapa 1) e da pasta raiz.
  p.querySelector('#pm-3').onclick = function () {
    if (!est.sig) return log('faz a etapa 2 primeiro');
    if (!est.doc) return log('cole abaixo o hash do arquivo da etapa 1:\n' +
      (est.doc = prompt('hash do arquivo (etapa 1)') || '') ? 'ok, clica de novo' : 'cancelado');
    log('criando envio ...');
    fetch('/Envio/Novo', { credentials: 'same-origin' }).then(function (r) { return r.text(); })
      .then(function (h) {
        var m = h.match(/hashPastaRaiz\s*=\s*"([^"]+)"/);
        if (!m) throw new Error('nao achou hashPastaRaiz');
        var d = new URLSearchParams();
        d.append('arquivos[0][hash]', est.doc);
        d.append('arquivos[0][name]', est.nome || 'teste.docx');
        d.append('arquivos[0][folder]', m[1]);
        d.append('signatarios[0][hash]', est.sig);
        d.append('signatarios[0][_idTipoSignatario]', '22');
        d.append('limitarAssinaturas', 'false'); d.append('dataLimite', '');
        d.append('horaLimite', '12:00:00'); d.append('mensagemPersonalizada', '');
        d.append('adicionarCertificado', 'true');
        return post('/Envio/Salvar', d.toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } });
      }).then(log).catch(function (e) { log('ERRO: ' + e.message); });
  };
})();
