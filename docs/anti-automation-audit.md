# Anti-automação — Fase 0: auditoria e baseline

## Escopo e evidência

Auditoria de 07/10/2026 sobre a `dev`: backend `58a0b17`, frontend
`0023fc60`. O plano DOCX fornecido orienta a sequência; esta entrega cobre
somente a Fase 0. Não cria schema, score, challenge, restrição ou novas
regras de gameplay. Não houve consulta ou alteração do banco de produção.

A consolidação existente fornece `combatActionEngine.resolveAction`,
contratos em `src/contracts` e hooks por domínio no frontend. O core resolve
fórmulas, mas não autentica, trava partidas nem concede recompensas; guards
futuros precisam entrar nos adapters/controllers/services, antes da mutação.
O helper de economia não equivale a uma transação global de recompensas.

**Importante:** lock serializa escritas, mas não prova que solicitações são
retries da mesma intenção. Uma segunda chamada pode consumir o próximo
estado válido, pagar outra compra ou executar outro passo. Diferenciamos
proteção contra saldo/estoque negativo de idempotência do pedido.

## Identidade e transportes

- HTTP: `authMiddleware` valida sessão; `currentCharacterMiddleware` resolve
  o personagem por `req.user.id`. Os entrypoints abaixo usam esse personagem,
  sem confiar em `characterId` do body. Leitura pública é outra política.
- Socket: `/api/users/socket-ticket` autenticado emite JWT com propósito
  `socket` e validade de 30 segundos. `socketAuth.personagemViaTicket`
  verifica propósito e resolve personagem pelo usuário. O ticket não é um
  nonce de ação e pode autenticar mais de uma conexão durante a validade.
- `identificar` alimenta a identidade compartilhada de PvP, party e guildboss.
  World boss tem identificação própria. Guards devem considerar todos os
  sockets do mesmo personagem, não apenas `socket.id`.
- Frontend: `src/app/api/backend/[...path]/route.ts` repassa o body sem
  transformar JSON, mas só encaminha Content-Type e Authorization; um novo
  header de idempotência exigiria atualização explícita. `Retry-After` da
  resposta também não é encaminhado hoje. O código distingue 401 de 403,
  portanto challenge futuro não deve invalidar a sessão.
- `useCombatTransport` centraliza o socket dos domínios de combate. Não há
  actionId/stateVersion genérico nesse transporte. IDs existentes devem
  ser reaproveitados por domínio, evitando um segundo protocolo paralelo.

## Matriz de ações

Os caminhos HTTP abaixo são completos, incluindo o prefixo de `src/app.js`.
TX significa transação PostgreSQL; memória significa proteção por processo.
Lacunas de inspeção ainda sem reprodução concorrente estão explicitadas.

| Ação / entrypoint | Estado e mutação | Proteção existente | Lacuna / próximo teste |
| --- | --- | --- | --- |
| PvE: **GET** `/api/combat/enemy/:characterId` | Cria/persiste encontro em `Character.encontro_pve`; pode sincronizar recursos | `combatController.gerarInimigoParaPersonagem`, TX + lock Character + validação de encontro/sessão | GET tem efeitos; auditar retries/prefetch e concorrência de criação de encontro. Não tratar como leitura inocente |
| PvE: POST `/api/combat/action` | Executa turno, consome mana/item, status e reward de vitória | `executarTurno`, TX + lock Character; inimigo vem do banco; regras/cooldowns do servidor | Não há ID/versão de intenção; requests serializados podem executar turnos seguintes. Testar burst, retry após timeout e vitória concorrente |
| Aventura: POST `/api/adventure/zones/:zoneId/enter`, `/leave` | Muda sessão de caça e zona | Auth/personagem + regras em adventureController/session service | Verificar exclusão entre mudança de área e encontro ativo; teste simultâneo leave/action pendente |
| PvP assíncrono: POST `/api/pvp/challenge` | Simula duelo e aplica ouro/XP/status | Set `personagensProcessandoDesafio` cobre ambos os atores no processo; cooldown/antifarm; resultado em TX + locks | Set desaparece no restart e não coordena réplicas; sem replay ID persistido. Testar duas instâncias/mesma intenção |
| PvP live: `pvp:desafiar`, `pvp:responder-desafio` | Cria desafio/duelo em Maps | Ticket, ownership do desafio, cooldown/antifarm/torneio | Criação tem awaits antes do registro definitivo; concorrência entre sockets precisa teste |
| PvP/ranked/torneio: `pvp:acao` (`attack`, `power`, `item`, `pass`) | Consome turno e item; resolve status, HP/mana | Valida ator/turno/poder/mana; `processandoAcao` protege consultas do item | **Gap de inspeção:** attack/power/pass chamam `executarTurno` async sem adquirir trava; ele consulta modificadores antes de trocar turno. Item libera trava antes da resolução e debita inventário fora de TX. Reproduzir dois sockets e timer/item concorrentes |
| Ranked: POST `/api/pvp/ranked/match/start` | Escolhe oponente, consome tentativa diária e cria match | `rankedLiveSocket.iniciarPartidaAssincrona`, valida socket/duelo/torneio; serviço de limite diário; match persistido | Checagem `duelPorPersonagem` ocorre antes de awaits; testar dois starts concorrentes e compensação de tentativa |
| Ranked: finalização/órfãs | Rating, logs, progresso e término de match | `rankedLiveSocket`: TX, atualização condicional de status do match e locks; varredura de órfãs | Já há testes de fluxo/órfãs. Guard de turno deve manter resultado e antifarm, sem criar segundo sistema de rating |
| Torneio: POST `/api/pvp/tournaments/:id/join`, `/leave`; `torneio:entrar-sala`, `torneio:pronto` | Inscrição/ready check/placar; duelo usa PvP live | `tournamentService` + regras de série/participação; identidade de socket | Testar ready/start duplicados e disputa com ranked; herda lacuna de resolução do PvP live |
| Party: `party:criar`, `convidar`, `responder-convite`, `pronto`, `sair`, `expulsar`, `iniciar` | Lobby e criação de batalha em Maps | Identidade compartilhada; host/membro/convite/estado/zona validados | Testar dois starts e invite/leave concorrentes; estado por processo |
| Party: `party:acao`, `party:entrar-batalha` | Turno aliado, item, monstro, resync; rewards por membro | Checagem de ator, estado e turno; trava parcial de item; fim persiste rewards em TX | **Gap de inspeção:** `executarTurnoAliado` aguarda modificadores sem trava global adquirida para attack/power/pass. Persistência de vários membros não é uma TX única da partida. Testar burst, timer e retomada de reward |
| Boss guilda: POST `/api/guilds/:id/boss/liberar`, `/atacar` | Tentativa, cooldown e recursos da guilda/personagem | `guildBossController` chama service em TX; autorização e regras de guilda | Validar replay e disputas entre entrada socket e endpoint HTTP |
| Boss guilda live: `guildboss:entrar`, `sair`, `acao` | Batalha, ordem, rodada e HP do boss | `executarTurnoAliado` seta `processandoAcao` antes de awaits e libera no fim; valida ator/fase | Melhor trava local que PvP/party, mas Maps não coordenam réplicas/restart. Testar timer, duas entradas/criação e rewards duplicados |
| World boss: POST `/api/world-boss/join`, `/leave`, `/action`; `worldboss:entrar-combate`, `estado`, `acao` | Sessão, action_seq, dano/progresso e evento | `worldBossCombatService`: TX + locks sessão/evento/Character; cooldown pessoal server-side em GameSetting | Socket `client_action_id` reaproveita só última resposta em Map, após sucesso; HTTP não tem essa dedupe. Testar replay antigo, concorrente e após restart; não alterar cooldown para anti-bot |
| Pesca: PUT `/api/fishing/loadout/rod`; POST `/sessions/start` | Seleção da vara e sessão | `fishingService.iniciarSessao`: TX + lock Character, ownership/equipamento/zona e sessão ativa | Testar dois starts e troca de loadout durante sessão; respeitar navegação |
| Pesca: POST `/api/fishing/sessions/:id/cast`, `/hook`, `/abandon` | CASTING → WAITING_BITE → FIGHTING ou terminal; consumo de isca | TX + lock sessão com ownership; horário/janela de mordida/expiração no servidor; terminal não refinaliza | Baseline precisa cast/hook concorrentes e versão por passo apenas se necessário. Não substituir nomes reais de fase por REELING do documento |
| Pesca: POST `/api/fishing/sessions/:id/reel` | Cada chamada incrementa `sequence`, física e eventual captura | Lock sessão, fase FIGHTING; item/catch record/XP/discovery finalizados na mesma TX; terminal idempotente | **Reproduzido:** 10 reels concorrentes executam 10 passos. Não há validação server-side de cadência, versão ou ID por passo; UI não fornece segurança. Retry terminal concorrente não duplica reward |
| Navegação/pesca: POST `/api/fishing/navigation/vessels/:id/acquire`, `/navigation/travel`, `/tournament/:id/inscrever` | Aquisição, acesso a zona e inscrição | Auth/personagem + serviços de navegação e torneio | Cobertura de navegação/torneio existe; incluir ownership, retry de aquisição e exclusão com pesca ativa na fase 5 |
| Expedição: POST `/api/expeditions/regions/:regionId/collect` | Coleta **imediata**, recurso/XP/progresso ou emboscada; próximo cooldown global | `expeditionService.coletar`: TX + lock Character e profissão, cooldown nas três profissões | **Reproduzido:** 10 chamadas simultâneas, 1 aceita e 9 retornam 429. Não existe start/readyAt/claim separado neste domínio. Sem replay ID: retry tardio após cooldown vira nova coleta |
| Forja v2: POST `/api/crafting/start`, `/collect` | Fila única/personagem; `iniciado_em`, `pronto_em`; materiais/ouro/output | TX + locks fila/Character/inventário; collect valida relógio e destrói fila após crédito | Start trava fila ausente antes de Character; PK evita segunda fila, mas requer teste de rollback. Claim simultâneo e early claim precisam teste explícito |
| Forja v3: POST `/api/crafting/smelt`, `/craft`, `/refine`, `/forge-collect` | Fila por slot; resultado sorteado no início, entrega após `pronto_em` | Services forge* usam TX e locks Character/progresso/fila/instância; collect destrói entrada na mesma TX | Não há replay ID genérico; retries após claim não retornam resultado anterior. Testar 10 claims por slot e corrida com start |
| Forja v3: POST `/instances/:id/equip`, `/recipe-book/:itemId/learn`, `/tools/:instanceId/equip`, `/tools/:slot/unequip` sob `/api/crafting` | Ownership, equipamento, receita e ferramenta | Serviços existentes e autenticação | Retain regras de aprendizado/equipamento; testar corrida com venda/refinamento sem reinventar inventário |
| Alquimia: POST `/api/alchemy/recipes/:id/brew`, `/learn` | Ouro/materiais/output/XP e desbloqueio | `alchemyService.prepararLote`: TX + locks Character/progresso/ingredientes; chave opcional e PK personagem+key | Leitura de chave antes do lock Character; concorrência da mesma key ainda precisa teste. Replay não vincula explicitamente key ao hash completo do pedido; não adicionar segunda chave |
| Mercado: POST `/api/market/listings`, `/:id/buy`; PATCH/DELETE `/:id` | Reserva estoque/instância, preço, compra, ouro P2P ou cancelamento | `marketService`: TX + lock listing e personagens ordenados; ownership/quantidade/status | Compra repetida pode comprar lote adicional enquanto houver estoque; sem ID de intenção. Testar concorrência de compra parcial e cancelamento |
| Player shops: PUT `/api/player-shops/mine`, POST `/mine/listings`, demandas e encomendas | Perfil/listing; reserva/entrega/cancelamento/pagamento | Market service + demand/commission services transacionais; testes de concorrência existentes | Perfil/listing e novos pedidos têm semânticas diferentes de delivery terminal. Não prometer idempotência de toda rota |
| NPC: POST `/api/shop/purchase` | Debita ouro e adiciona stack/instância | `shopController`: TX + lock Character; valida quantidade/preço/estoque | Sem replay ID: dois pedidos válidos podem comprar duas vezes. Testar retry e concorrência de saldo limite |
| Guilda aventureiros: claims/contracts/spoils sob `/api/adventure-guild` | Progresso, rewards, entrega e venda | Serviços existentes; spoil sell exige idempotencyKey, tabela única e valida payload; TX | Claims/contratos possuem coberturas próprias; instrumentar por ação e reutilizar chaves. Não tratar toda request como consumível único |

### Grupos de rotas de player shops

Sob `/api/player-shops`: POST `/mine/demands`, `/demands/:idDemanda/cancel`,
`/demands/:idDemanda/deliver`, `/:characterId/commissions`,
`/commissions/:idEncomenda/counter-offer`, `/accept`, `/decline`, `/deliver`,
`/cancel`. Paths de destino não substituem o ator autenticado. Ver
`playerShopRoutes.js`, `playerShopDemandService.js` e
`playerShopCommissionService.js` para as respectivas máquinas de estado.

## Rate limit atual: inventário completo de criarLimitador

Cada instância de middleware tem seu próprio Map, sem store compartilhado
ou varredura de buckets antigos. Política é janela fixa. Contagem some
quando o middleware/processo é recriado. No instante exato de resetAt a
janela ainda bloqueia (`>` e não `>=`). Isso é caracterização, não mudança
proposta de gameplay. Resposta 429 contém somente `message`, sem `code`,
`retryAfterMs` ou header Retry-After.

| Local / ação | Chave | Política atual |
| --- | --- | --- |
| userRoutes: register | email normalizado (fallback IP) + IP | 6/h por email; 30/h IP |
| userRoutes: login | email normalizado (fallback IP) + IP | 8/15 min email; 40/15 min IP |
| userRoutes: google-login | IP, compartilha middleware de login | 40/15 min IP |
| userRoutes: forgot-password | email normalizado (fallback IP) + IP | 5/h email; 20/h IP |
| userRoutes: reset-password | token (fallback IP) + IP | 5/h token; 20/h IP |
| userRoutes: change-password | `conta:req.user.id`, após auth | 5/15 min |
| userRoutes: referral-check | IP | 60/10 min |
| raceRoutes: sortear-raro | `raca-rara:req.user.id` | 30/h |
| classRoutes: sortear-raro | `classe-rara:req.user.id` | 30/h |
| messageRoutes: envio | `msg-rajada:req.user.id` e `msg-minuto:req.user.id` | 5/5 s e 30/min |

`messagesSocket`, `globalChatSocket` e `guildSocket` usam contadores próprios
em memória para mensagens; não usam criarLimitador nem protegem o throughput
de ações de combate. O limite de expedição e world boss é cooldown de
**gameplay**, não bucket de rate limit. Nenhuma política nova foi aplicada.
O limiter de reset por token existente não deve ser copiado para nova
telemetria: JWT/token/provider não podem virar metadata persistido.

## Prioridades comprovadas e hipóteses

1. **Pesca — demonstrado por teste real:** calls de reel aceleram os passos.
   Trava e finalização atômica protegem a recompensa da mesma captura, mas
   não reduzem o throughput útil de automação. Definir cadência com base
   no fluxo real do cliente, sem modificar física ou probabilidades.
2. **PvP/party — inspeção:** janela assíncrona entre checagem de turno e
   troca efetiva. Adquirir guard antes de qualquer await, abrangendo ação,
   timer, dois sockets e fechamento. Antes da implementação, reproduzir
   com catálogo atrasado e item concorrente. O comentário que diz que
   attack/power são síncronos no PvP não corresponde ao código atual.
3. **Ranked start/lobbies — inspeção:** checagens locais antes de awaits.
   Testar exclusão por personagem e não gastar duas tentativas/criar duas
   partidas para a mesma intenção. Limite diário não substitui esse guard.
4. **Replay econômico — inspeção:** distinguir requests novos de retry
   legitimamente repetido. Alquimia/espolios já têm suas chaves; compras e
   claims ainda precisam contrato próprio, sem invalidar dupla compra
   intencional ou introduzir um cooldown de segurança arbitrário.
5. **Escala horizontal:** Maps de batalha, locks JS, dedupe e rate buckets
   não coordenam processos. PostgreSQL continua protegendo seus estados
   transacionais, mas isso não converte batalhas locais em distribuídas.
6. **Proteção adaptativa:** não há schema/risk/challenge comum. Começar
   com shadow mode na fase 1; sinais isolados não provam automação.

## Cobertura e verificações desta entrega

- `test/antiAutomationRateLimitBaseline.test.js`: quatro testes novos sobre
  chave por conta/NAT, default por IP e formato atual de 429, limite de
  janela e perda da contagem ao recriar middleware.
- `test/expeditionCooldownGlobal.test.js`: um teste novo de dez coletas
  concorrentes. Um commit útil, nove rejeições 429 e XP igual ao resultado
  único. RNG mockado apenas no teste, cooldown longo apenas na fixture.
- `test/fishing.test.js`: um teste novo reproduz dez reels concorrentes
  consumindo dez passos; estende captura existente com dez retries
  terminais concorrentes e verifica item, catch record e XP sem duplicação.
- Suíte pesca + expedição: **22 passaram, 0 falhas, 0 skips** no PostgreSQL
  local descartável. Rate limiter: **4 passaram, 0 falhas, 0 skips**.
- Regressão complementar de contratos, core, cooldown, ranked, party,
  mercado, alquimia e concorrência das lojas: **81 passaram, 0 falhas,
  0 skips**. Auditorias de migrations e economia passaram sem mudanças
  de gameplay ou migrations históricas.

Os testes de lacunas registram o comportamento atual, não o tornam uma
regra desejada. Quando um guard mudar esse comportamento de propósito,
substituir a caracterização por um teste do contrato novo e compatibilidade
com retry legítimo. Nenhum resultado acima estabelece que a proteção
anti-bot global já esteja implementada.

## Continuidade

Fase 0 encerrada com auditoria e testes de baseline. Fase 1 ainda não
implementada: modelos/novas migrations, configuração, telemetria/risk com
lazy decay em shadow mode e APIs administrativas de leitura. Turnstile fica
na fase específica; nenhum segredo/sitekey é necessário para esta auditoria.
