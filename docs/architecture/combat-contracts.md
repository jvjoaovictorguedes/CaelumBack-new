# Contratos HTTP e Socket.IO — fotografia da Fase 0

Versão documental: baseline 0 (`38e7eff` backend / `3bd709db` frontend). Os protocolos atuais **não possuem uma versão comum no wire**. Este registro não adiciona campos `version` nem altera envelopes. É um catálogo dos fluxos principais, não uma especificação exaustiva de todos os endpoints administrativos.

## Identidade e transporte

HTTP do frontend usa o BFF same-origin em `src/app/api/backend/[...path]/route.ts` para manter o JWT httpOnly fora do JavaScript. O backend monta rotas sob `/api` em `src/app.js`; o frontend usa `axiosInstance` e omite esse prefixo nas chamadas.

O provider compartilhado está em `CaelumFront-new/src/contexts/PvpSocketContext.tsx`. Ao conectar, obtém ticket em `GET /api/users/socket-ticket`, emite `identificar {ticket}` e espera o ack antes do resync. A identificação determina o personagem; o cliente não escolhe um `characterId` arbitrário para agir. World Boss usa seu fluxo de identificação/ticket em `worldBossSocket.js` e seu cliente em `src/lib/api/worldBoss.ts`.

A lista `pvp:listar-online` devolve `{online: string[]}` excluindo o próprio personagem. Não transformar a quantidade desse ack em total global online. O ranking HTTP tem `data.totalOnline` obtido da presença do processo.

## HTTP

| Modo | Requisição | Resposta principal / observações |
| --- | --- | --- |
| PvE solo | `GET /api/combat/enemy/:characterId` | Contexto autenticado; cria/resgata encontro. Fonte: `combatRoutes.js` / `combatController.gerarInimigoParaPersonagem`. |
| PvE solo | `POST /api/combat/action`, `{action:{type:"attack"\|"power"\|"item"\|"pass", powerId?, itemId?}}` | Sucesso `{status:"success",data:{done,victory,log,character,enemy,...}}`. Campos de dano direto, DoT e crítico separados; campos de recompensa variam na finalização. Erros usam `{message}`. |
| Casual assíncrono | `POST /api/pvp/challenge` | `pvpController.challenge` simula e persiste o duelo; contrato distinto do desafio ao vivo. Corpo usa `id_desafiado`; o desafiante vem de `req.personagemAtual.id`, nunca do corpo. |
| Ranked | `POST /api/pvp/ranked/match/start` | HTTP 201, **sem envelope data**: `{duelId,rankedMatchId,temporada,desafiante,defensor,limiteDiario,consumiveisHabilitados:false}`. Oponente é escolhido no servidor e controlado por IA. |
| Ranked | `POST /api/pvp/ranked/queue/join`, `/leave` | Legado mantido, HTTP 410. Não documentar como fila operacional. |
| Ranked | `GET /api/pvp/ranked/status`, `/season`, `/leaderboard` | Status/limite diário, temporada e classificação. Fontes: `rankedController` e tipos `src/lib/api/pvp.ts`. |
| World Boss | `GET /api/world-boss/status`, `/ranking`, `/history`, `/ranking/me` | Consultas do evento/participação; a consulta `me` exige personagem atual. Fontes: `worldBossRoutes.js` e `src/lib/api/worldBoss.ts`. |
| World Boss | `POST /api/world-boss/join`, `/leave` | `{status:"success",data:resultado}`. Sessão do personagem atual. |
| World Boss | `POST /api/world-boss/action`, `{tipo,idPoder?}` | `{status:"success",data:resultado}`; erros `{status:"error",message}`. Nomes diferem do payload do socket. |
| Party / Guild Boss | Combate ao vivo via Socket.IO | Não inventar endpoint HTTP de ação equivalente: usar os eventos abaixo. Outros endpoints de guilda/grupo permanecem fora deste inventário mínimo. |

PvE normal: `character` contém `vida_atual`, `mana_atual`, `vida_apos_sua_acao`, `mana_apos_sua_acao`, `nivel`, `experiencia`, `pontos_distribuir`. `data` inclui `statusEffects`, `combatBuffs`, `escudo`, `cooldowns.player`, `criticoJogador`, `criticoInimigo`, `danoCausadoNoInimigo`, `danoRecebidoContraAtaque`, `danoStatusJogador`, `danoStatusInimigo` e arrays `statusTickEvents*`. O estado final de vida é autoritativo; não inferir vida final somando números de animação.

## Socket.IO — comandos principais (cliente → servidor)

| Domínio | Eventos e payloads |
| --- | --- |
| Casual | `pvp:desafiar {idDesafiado}`, `pvp:responder-desafio {aceitar}`, `pvp:acao {tipo,idPoder?,idItem?}` |
| Ranked | Começa pelo HTTP acima e joga usando `pvp:acao`; o duelo tem finalização específica de rating. Eventos de fila antigos são depreciados. |
| Party | `party:criar`, `party:convidar {idConvidado}`, `party:responder-convite {aceitar}`, `party:pronto {pronto}`, `party:iniciar {idZona}`, `party:acao {tipo,idPoder?,idItem?}`, `party:entrar-batalha` (resync), `party:sair`, `party:expulsar {idAlvo}` |
| Guild Boss | `guildboss:entrar` (entra ou ressincroniza), `guildboss:acao {tipo,idPoder?}`, `guildboss:sair`; não aceita consumível. |
| World Boss | `worldboss:entrar` / `sair` (sala global), `worldboss:identificar {ticket}`, `worldboss:entrar-combate {ticket}`, `worldboss:estado` com ack, `worldboss:acao {client_action_id?,tipo,id_poder?}` com ack. |

`tipo` é o discriminante da ação (`attack`, `power`, `item`, `pass` são os valores atuais). Não unificar `powerId`/`idPoder`/`id_poder` nesta fase. Idempotência de World Boss armazena a última resposta por personagem no processo para `client_action_id`; não equivale a garantia durável após restart ou entre réplicas.

## Socket.IO — resultados (servidor → cliente)

| Domínio | Eventos | Campos centrais e fonte |
| --- | --- | --- |
| Casual | `pvp:duelo-iniciado` | `duelId,arena,torneio,a,b,vidaMaxA/B,manaMaxA/B,vidaA/B,manaA/B,poderesA/B,consumiveisA/B,turnoDe,prazoSegundos`. Fonte: `pvpLiveSocket.montarPayloadDuelo`. Mesmo serializer para início/resync. |
| Casual/Ranked | `pvp:turno-resultado` | `duelId,atacante,nomeAcao,dano,cura,manaCurada,esquivou,critico,bloqueado,logStatus,statusA/B,combatBuffsA/B,vidaA/B,manaA/B,turnoDe`; `prazoSegundos` varia conforme finalização. Fonte: `pvpLiveSocket.executarTurno`. |
| Casual/Ranked | `pvp:duelo-fim` | `duelId,vencedorChave,vencedor,perdedor,motivo`; casual inclui recompensa/nivelAposVitoria, Ranked inclui `ranked:true` e finalização de rating separada. Não tratar shapes como idênticos. |
| Ranked | `ranked:match:found`, `ranked:match:start` | Start acrescenta `ranked:true,assincrono:true,rankedMatchId,temporada,ratingA/B,tierA/B,b.controladoPorIA:true`, consumíveis vazios e resync quando aplicável. Fonte: `rankedLiveSocket.montarPayloadInicio`. |
| Ranked | `ranked:rating:update` | `duelId,ratingAntes,ratingDepois,delta,tierAntes,tierDepois,defensorControladoPorIA:true,ratingDefensorInalterado`. Rating do defensor IA não é debitado como duelo humano simétrico. |
| Ranked | `ranked:oponente-desconectado`, `ranked:oponente-reconectado` | Avisos de reconexão específicos do modo; tipos atuais no provider. |
| Party | `party:grupo-atualizado`, `party:grupo-desfeito`, `party:convite-recebido` | Estado/convites do grupo são diferentes do estado de batalha. |
| Party | `party:batalha-iniciada`, `party:batalha-estado` | `battleId,zona,inimigo,membros,ordem,turnoDe,rodada,prazoSegundos,penalidadeDiferencaNivel`. Fonte única existente: `partySocket.montarPayloadBatalha`. |
| Party | `party:turno-resultado`, `party:proximo-turno` | Resultado distingue `origem:"aliado"\|"monstro"`, ator/alvo, vida/mana, status/buffs. Próximo turno contém `battleId,turnoDe,prazoSegundos,rodada`. Campos variam conforme origem. |
| Party | `party:batalha-fim` | `battleId,vitoria,motivo,recompensas,drops,penalidadeDiferencaNivel`. Recompensas/drops são mapeados por membro. |
| Guild Boss | `guildboss:batalha-iniciada`, `guildboss:estado` | `battleId,nomeChefe,vidaAtual,vidaTotal,membros,ordem,turnoDe,fase,rodada,prazoSegundos`. Fonte: `guildBossSocket.montarEstadoBatalha`. |
| Guild Boss | `guildboss:membro-entrou`, `guildboss:turno-resultado`, `guildboss:proximo-turno`, `guildboss:cast-start` | Resultado distingue aliado/chefe; cooldowns do aliado usam mapa `power:<id>`. Payloads não são intercambiáveis com Party. |
| Guild Boss | `guildboss:batalha-fim` | Resultado/recompensas do boss da guilda; tipo atual `BatalhaBossGuildaFimPayload` no provider. |
| World Boss | Ack de `worldboss:acao` | Sucesso `{accepted:true,server_action_seq,dano,esquivou,cura,manaCurada,golpeFinal,proezasConquistadas,lutador,cooldowns,boss}`; erro `{accepted:false,erro}`. Não é o envelope HTTP nem evento `pvp:turno-resultado`. |
| World Boss | `worldboss:status`, `worldboss:desperta`, `worldboss:hp-atualizado`, `worldboss:boss-acao`, `worldboss:fase`, `worldboss:cast-start`, `worldboss:participante-derrotado`, `worldboss:derrotado`, `worldboss:ranking-update`, `worldboss:ranking-final` | Lifecycle global em `worldBossSocket`, `worldBossScheduler`, `worldBossCombatService` e `worldBossRuntimeService`. Estado individual e HP global têm sequências próprias. |

Erros de casual/Party/Guild Boss usam respectivamente `pvp:erro`, `party:erro`, `guildboss:erro` com `{mensagem}`. Ack de World Boss usa `erro`, não `mensagem`. Preservar os discriminantes e envelopes ao extrair contratos.

## Shapes compartilhados e compatibilidade

- Poder público casual/Party: `id,combat_slot,nome,imagem_url,custo_mana,dano_base,cura_base,nivel_habilidade,escala_atributo,valor_escala`. Slots são posições explícitas; não ordenar a barra pelo índice da resposta. O custo é efetivo por nível da habilidade.
- Status público do duelo: `key,remainingTurns,stacks`. Status interno carrega outros campos, que não devem ser expostos automaticamente.
- Buff público do duelo: `atributo,valor,remainingTurns`.
- Cooldown: chave `power:<id>` e valor de turnos restantes; não tratar `Power.cooldown` como segundos.
- `turnoDe` pode ser `null` em fim de batalha; alguns campos adicionais são opcionais no TypeScript para compatibilidade.
- HTTP, começo de batalha, ação e término têm shapes distintos. Não criar um envelope único implicitamente.

## Tipos e próximos candidatos à extração

Hoje os tipos de casual, Ranked, Party, torneio e Guild Boss permanecem em `PvpSocketContext.tsx`; World Boss tem tipos próprios em `src/lib/api/worldBoss.ts`. A Fase 0 não os move. Na Fase 1, constantes e serializers deverão ser extraídos preservando estes nomes e confrontando exemplos serializados com os tipos frontend.

Limite de cobertura atual: o teste novo compara o payload serializado real de início/resync casual e oito cenários de ações. Os demais contratos acima foram inventariados por leitura dos adaptadores e consumidores; ainda não possuem todos snapshots completos nem testes de transporte Socket.IO nesta entrega.
