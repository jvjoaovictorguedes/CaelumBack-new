# Regra permanente: testar como jogador, não como máquina

Antes de dar um bug como corrigido ou subir qualquer mudança, **sempre
testar o jogo como um ser humano olharia e jogaria o jogo — nunca só
como máquina** (lint/testes unitários passando não é suficiente).

Isso significa, na prática, antes de reportar algo como resolvido:

- Reproduzir a causa raiz real do bug num teste (ex.: simular o ticket
  expirado/rede lenta que o jogador realmente teve, não só o caminho
  feliz) — nunca concluir que "o código parece certo" é prova de que o
  bug sumiu.
- Quando o bug é de fluxo em tempo real (socket que não identifica,
  ação que trava), validar contra o módulo real de produção (mesmo
  padrão `criarIoFake`/`criarSocketFake` de
  `test/templeBossSocket.test.js` e `test/pvpLiveSocketIdentify.test.js`),
  nunca reimplementar a lógica no teste.
- Quando o frontend depende do comportamento daqui (ex.: ack de
  `TRANSPORT.IDENTIFY`), confirmar o fluxo ponta a ponta no outro repo
  (CaelumFront-new tem `test/smoke/` com um browser real) antes de
  declarar o bug resolvido — um ajuste só no backend sem o cliente se
  recuperar de verdade não conta como corrigido.
- `npm test` continua obrigatório, mas é o mínimo, não o critério final
  de "está pronto".

Contexto: esta regra existe porque um fix de bug real (Boss da Guilda e
Ranqueado travados em "conectando aos servidores") foi reportado como
corrigido com base só em testes automatizados passando, e na prática
não resolveu nada — a causa raiz (ticket de identificação expirando sem
o servidor nunca responder o ack, deixando o cliente esperando pra
sempre) só apareceu investigando o fluxo de verdade. Motivo direto do
jogador: "não é meio óbvio você testar como um ser humano antes de
subir? Fazer estilo máquina não dá certo."
