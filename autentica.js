/*
 * autentica.js — o favorito que envia os contratos na Autentica Online.
 *
 * COMO RODA: o Esdras entra na Autentica com o login dele (reCAPTCHA v3 no
 * login, nenhum caminho nosso loga sozinho) e clica no favorito. O favorito
 * carrega este arquivo do GitHub Pages e ele roda DENTRO da pagina, usando o
 * cookie de sessao que ja esta ali. Nenhuma senha da Autentica passa por aqui.
 *
 * ESTE ARQUIVO E PUBLICO e nao tem segredo nenhum dentro. O que autoriza a
 * conversa com o banco e a senha de 8 horas que o botao "Senha do robo" gera
 * no CRM e o Esdras cola na hora. Sem ela a function responde 401 para todos.
 *
 * DUPLICACAO CONSCIENTE: os tres POSTs tambem existem em
 * previmater-ops/robo-autentica/autentica.js, que foi escrito para servir
 * favorito e maquina dedicada sem reescrita. A maquina virou plano B; QUEM
 * RODA E ESTE ARQUIVO. Mexeu na regra de envio aqui, mexa la ou apague la.
 *
 * O favorito e uma linha so:
 *   javascript:(function(){var s=document.createElement('script');
 *   s.src='https://esdraspresidente.github.io/previmater-crm/autentica.js?'+Date.now();
 *   document.body.appendChild(s);})()
 * O `?'+Date.now()` existe para o navegador nao servir a versao velha do
 * cache — sem ele, corrigir um defeito aqui nao chegaria ao celular.
 */
(function () {
  'use strict';

  const BASE = 'https://app.autenticaonline.com.br';
  const FUNC = 'https://ggyngtqknonwnohbzkyj.supabase.co/functions/v1/fila-autentica';

  /* Valores conferidos no HTML da tela deles. Numero, nao texto: se trocarem o
   * rotulo o codigo continua certo; se trocarem o numero, quebra alto. */
  const METODO_SMS = '2';           // 1 = e-mail, 2 = SMS
  const OPCIONAL_MANUSCRITA = '5';  // 3 doc oficial, 4 selfie, 5 manuscrita, 6 certificado
  const TIPO_CONTRATANTE = '22';    // 36 = OUTORGANTE, 22 = CONTRATANTE

  /* Nao comeca lote com a senha perto de vencer. Senha que morre ENTRE os
   * POSTs da Autentica e a gravacao do link deixa a cliente com contrato
   * recebido e o CRM sem link — nao vira duplicata (o guarda do
   * documento_hash pega), vira conferencia na mao. Trocar a senha antes
   * custa dez segundos; descobrir no meio custa a tarde. */
  const MARGEM_MIN = 15;

  if (window.__autenticaRodando) { alert('O robô já está rodando nesta aba.'); return; }
  if (!location.href.startsWith(BASE)) {
    alert('Abra a Autentica (app.autenticaonline.com.br) e clique de novo.');
    return;
  }
  window.__autenticaRodando = true;

  // ==========================================================
  // Painel
  // ==========================================================
  const painel = document.createElement('div');
  painel.style.cssText = 'position:fixed;top:12px;right:12px;width:340px;max-height:86vh;' +
    'overflow:auto;background:#0f1b1b;color:#e8f0f0;font:13px/1.45 system-ui,sans-serif;' +
    'border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.45);z-index:2147483647;padding:14px;';
  document.body.appendChild(painel);

  const linhas = [];
  function pintar(html) { painel.innerHTML = html; }
  function log(txt, cor) {
    linhas.push(`<div style="padding:3px 0;color:${cor || '#e8f0f0'}">${txt}</div>`);
    pintar(cabecalho() + linhas.join(''));
    painel.scrollTop = painel.scrollHeight;
  }
  function cabecalho() {
    return '<div style="display:flex;justify-content:space-between;align-items:center;' +
      'margin-bottom:10px"><b>Robô da Autentica</b>' +
      '<span id="aut-x" style="cursor:pointer;opacity:.6;padding:0 4px">✕</span></div>';
  }
  function fechar() { painel.remove(); window.__autenticaRodando = false; }
  painel.addEventListener('click', (e) => { if (e.target.id === 'aut-x') fechar(); });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ==========================================================
  // Conversa com a nossa function
  // ==========================================================
  let SENHA = '';
  async function chamar(acao, corpo) {
    const r = await fetch(FUNC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ acao, codigo: SENHA }, corpo || {})),
    });
    let j;
    try { j = await r.json(); } catch (e) { throw new Error('resposta ilegível do servidor'); }
    if (r.status === 401) throw new Error('SENHA_INVALIDA');
    if (!j.ok) throw new Error(j.motivo || ('HTTP ' + r.status));
    return j;
  }

  // ==========================================================
  // Os tres POSTs da Autentica
  // ==========================================================
  /* jQuery serializa objeto aninhado como arquivos[0][hash]. O /Envio/Salvar
   * espera exatamente isso, entao reproduzimos o formato dele em vez de mandar
   * JSON, que ele nao le. */
  function planificar(obj, prefixo, saida) {
    saida = saida || new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) {
      const chave = prefixo ? `${prefixo}[${k}]` : k;
      if (v === null || v === undefined) continue;
      if (typeof v === 'object' && !Array.isArray(v)) planificar(v, chave, saida);
      else if (Array.isArray(v)) v.forEach((item, i) => {
        if (typeof item === 'object') planificar(item, `${chave}[${i}]`, saida);
        else saida.append(`${chave}[${i}]`, String(item));
      });
      else saida.append(chave, String(v));
    }
    return saida;
  }

  /* A resposta deles as vezes vem como string JSON dentro da resposta (o
   * proprio JS da plataforma faz JSON.parse(res.response)). Aceitamos as duas
   * formas em vez de assumir uma. */
  async function lerJson(resposta, etapa) {
    const texto = await resposta.text();
    if (!resposta.ok) throw new Error(`${etapa}: HTTP ${resposta.status}`);
    /* Sessao morta devolve o HTML da tela de login com status 200, nao 401.
     * Sem esta checagem o erro apareceria como "JSON invalido" e mandaria a
     * gente procurar no lugar errado. */
    if (/^\s*</.test(texto)) throw new Error(`SESSAO_MORTA (${etapa})`);
    try {
      const j = JSON.parse(texto);
      return (typeof j === 'string') ? JSON.parse(j) : j;
    } catch (e) { throw new Error(`${etapa}: resposta ilegível`); }
  }

  /* A pasta raiz tem um hash por conta. Esta no HTML da tela de Novo envio, e
   * a gente le na hora em vez de gravar no codigo: hash gravado e hash que um
   * dia deixa de valer sem ninguem perceber. Lido UMA vez por lote. */
  async function buscarHashPasta() {
    const r = await fetch(`${BASE}/Envio/Novo`, { credentials: 'include' });
    const html = await r.text();
    const m = html.match(/hashPastaRaiz\s*=\s*"([^"]+)"/);
    if (!m) throw new Error('SESSAO_MORTA (não achou hashPastaRaiz)');
    return m[1];
  }

  async function subirArquivo(blob, nome) {
    const fd = new FormData();
    fd.append('action', 'save');
    /* "files[]" COM colchetes. Sem eles o servidor le o campo como texto e
     * devolve name="c" (a primeira letra do arquivo) com status false —
     * aceita a requisicao e recusa o arquivo sem dizer por que. Conferido na
     * varredura de 13/09: files[] e files[0] passam, todo o resto volta []. */
    fd.append('files[]', blob, nome);
    const up = await lerJson(await fetch(`${BASE}/Upload/SalvarTemporario`,
      { method: 'POST', body: fd, credentials: 'include' }), 'upload');
    const doc = Array.isArray(up) ? up[0] : up;
    if (!doc || !doc.status || !doc.hash) throw new Error('upload recusado');
    return doc;
  }

  async function cadastrarSignataria(cli) {
    const sig = await lerJson(await fetch(`${BASE}/signatario/SalvarSignatario`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      /* dataNascimento e email vao vazios: conferido com o Esdras em 17/09,
       * a Autentica nao exige nenhum dos dois. O CRM tambem nao tem os dois
       * campos, entao mandar vazio e dizer a verdade. */
      body: planificar({
        hash: '', nome: cli.nome, cpf: cli.cpf, dataNascimento: '',
        email: '', celular: cli.celular,
        metodoValidacao: METODO_SMS,
        autenticacoesOpcionais: [OPCIONAL_MANUSCRITA],
      }).toString(),
    }), 'signatário');
    if (!sig.status || !sig.hash) throw new Error('signatária recusada');
    return sig;
  }

  async function enviar(doc, sig, nomeArquivo, pasta) {
    const env = await lerJson(await fetch(`${BASE}/Envio/Salvar`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: planificar({
        arquivos: [{ hash: doc.hash, name: nomeArquivo, folder: pasta }],
        signatarios: [{ hash: sig.hash, _idTipoSignatario: TIPO_CONTRATANTE }],
        limitarAssinaturas: false, dataLimite: '', horaLimite: '12:00:00',
        mensagemPersonalizada: '', adicionarCertificado: true,
      }).toString(),
    }), 'envio');
    if (!env.status) throw new Error(env.mensagem || 'envio recusado');

    /* O HASH DO LINK NAO E O DO CADASTRO. O que volta na etapa 2 e outro; o
     * que monta o link vem daqui. Usar o errado gera link quebrado que
     * ninguem percebe ate a cliente reclamar. */
    const assinante = env.documentos && env.documentos[0] &&
      env.documentos[0].signatarios && env.documentos[0].signatarios[0];
    if (!assinante || !assinante.hash) throw new Error('envio sem signatária na resposta');
    return {
      link: `${BASE}/Assinatura/Assinar/${assinante.hash}`,
      signatarioHash: assinante.hash,
    };
  }

  // ==========================================================
  // Fluxo
  // ==========================================================
  function minutosAte(iso) {
    if (!iso) return -1;
    return Math.floor((new Date(iso).getTime() - Date.now()) / 60000);
  }

  async function comecar() {
    SENHA = (prompt('Cole a senha do robô (botão no quadro Comercial do CRM):') || '').trim();
    if (!SENHA) { fechar(); return; }

    log('Buscando a fila…', '#9fd');
    let fila;
    try {
      fila = await chamar('pegar');
    } catch (e) {
      if (String(e.message) === 'SENHA_INVALIDA') {
        log('Senha inválida ou vencida. Gere outra no CRM e clique de novo.', '#ff9a8a');
      } else {
        log('Não consegui buscar a fila: ' + esc(e.message), '#ff9a8a');
      }
      return;
    }

    /* A margem e conferida ANTES de qualquer POST. Com os cartoes ja
     * travados pelo `pegar`, desistir aqui apenas os devolve a fila quando a
     * trava vencer — nenhum envelope foi criado. */
    const min = minutosAte(fila.validade);
    if (min <= MARGEM_MIN) {
      log(`A senha vence em ${min} min. Gere outra no CRM antes de rodar — ` +
        'senha que vence no meio do lote deixa contrato enviado sem link no cartão.', '#ffcf7a');
      return;
    }

    const itens = fila.itens || [];
    if (fila.orfaos) log(`⚠ ${fila.orfaos} cartão(ões) fora da fila: o documento já subiu ` +
      'e o link não foi gravado. Confira na lista de Envios antes de tentar de novo.', '#ffcf7a');
    if (fila.recusados) log(`⚠ ${fila.recusados} recusado(s) por telefone ou CPF fora do ` +
      'formato. O motivo está no cartão.', '#ffcf7a');
    if (fila.bloqueados) log(`⚠ ${fila.bloqueados} travado(s) por erro repetido. ` +
      'Zere as tentativas no CRM para liberar.', '#ffcf7a');

    if (!itens.length) { log('Nenhum contrato esperando.', '#9fd'); return; }

    /* CONFERENCIA ANTES DE DISPARAR, e nao e enfeite: os termos de uso da
     * Autentica poem em quem envia a responsabilidade de verificar a
     * identidade de cada signataria. Enquanto era na mao, essa conferencia
     * era a leitura do documento; automatizado, ela vira esta tela. */
    const lista = itens.map((c, i) =>
      `<div style="padding:6px 0;border-top:1px solid #24393a">
         <div><b>${i + 1}. ${esc(c.nome)}</b></div>
         <div style="opacity:.75">${esc(c.cpf)} · ${esc(c.celular)}</div>
       </div>`).join('');
    pintar(cabecalho() +
      `<div style="margin-bottom:6px">${itens.length} contrato(s) para enviar. ` +
      `Senha vale mais ${min} min.</div>${lista}` +
      '<div style="margin-top:10px;font-size:12px;opacity:.75">Confira nome e CPF antes. ' +
      'O SMS vai para o celular acima.</div>' +
      '<button id="aut-go" style="width:100%;margin-top:10px;padding:10px;border:0;' +
      'border-radius:8px;background:#1f8a7a;color:#fff;font:600 14px system-ui;cursor:pointer">' +
      `Enviar ${itens.length} contrato(s)</button>`);

    painel.querySelector('#aut-go').onclick = () => { linhas.length = 0; rodar(itens); };
  }

  async function rodar(itens) {
    log(`Enviando ${itens.length}…`, '#9fd');
    let pasta;
    try {
      pasta = await buscarHashPasta();
    } catch (e) {
      log('Sessão caiu. Recarregue a Autentica, faça login e clique de novo.', '#ff9a8a');
      return;
    }

    let ok = 0, falhas = 0;
    for (const c of itens) {
      log(`— ${esc(c.nome)}`, '#cfe');
      let doc = null;
      try {
        // 1) o .docx vem do bucket privado por URL assinada de 30 min
        const resp = await fetch(c.arquivoUrl);
        if (!resp.ok) throw new Error('não consegui baixar o contrato (URL vencida?)');
        const blob = await resp.blob();

        // 2) sobe na Autentica
        doc = await subirArquivo(blob, c.arquivoNome);

        /* 3) AVISA O BANCO ANTES DE CONTINUAR. Daqui em diante existe um
         * arquivo na conta da Autentica; se a aba morrer agora, o cartao NAO
         * pode voltar a fila e ser enviado de novo — a Autentica aceita
         * duplicata calada. Gravar o hash aqui e o que transforma "caiu no
         * meio" em cartao parado e visivel. */
        await chamar('progresso', { id: c.id, documentoHash: doc.hash });

        const sig = await cadastrarSignataria(c);
        const env = await enviar(doc, sig, c.arquivoNome, pasta);

        await chamar('gravar', {
          id: c.id, link: env.link,
          documentoHash: doc.hash, signatarioHash: env.signatarioHash,
        });
        ok++;
        log('   ✓ enviado e link gravado', '#7fe3b0');
      } catch (e) {
        falhas++;
        const motivo = String(e.message || e);
        /* So devolve o cartao a fila quando NADA subiu. Se o documento ja
         * estava na Autentica, o `erro` limparia a trava e o cartao voltaria
         * — o guarda do hash no `pegar` e quem o segura, e ele depende do
         * `progresso` ter gravado. Por isso aqui a gente so avisa. */
        if (!doc) { try { await chamar('erro', { id: c.id, erro: motivo }); } catch (e2) {} }
        log('   ✗ ' + esc(motivo) +
          (doc ? ' — documento JÁ subiu, confira na lista de Envios' : ''), '#ff9a8a');
        if (motivo.indexOf('SESSAO_MORTA') === 0 || motivo === 'SENHA_INVALIDA') {
          log('Parando o lote aqui: o resto falharia igual.', '#ffcf7a');
          break;
        }
      }
    }
    log(`Fim: ${ok} enviado(s), ${falhas} com problema.`, ok && !falhas ? '#7fe3b0' : '#ffcf7a');
  }

  comecar().catch((e) => log('Erro inesperado: ' + esc(e.message), '#ff9a8a'));
})();
