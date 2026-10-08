# Ameaça Mundial: consequências e reconstrução V1

Implementação baseada em `consequencias_ameaca_mundial_reconstrucao_caelum_v1.docx`. O documento é uma especificação de produto; o usuário autorizou a melhoria, não operações em produção. Nenhuma conexão/alteração de produção ou publicação em main faz parte desta entrega.

## Operação e conteúdo

- Admin → Crises Mundiais & Reconstrução: perfis, etapas sequenciais, metas globais, fontes ITEM/EXPEDITION_RESOURCE, pesos por qualidade, penalidades por contexto, zonas, mobilização e faixas de prêmios. Botão “Usar proposta: madeira, ferro e ervas” carrega um rascunho de três etapas a partir dos IDs reais do catálogo. Metas e prêmios são uma proposta editável, não balanceamento validado. Zonas devastadas devem ser selecionadas explicitamente.
- Admin → Ameaça Mundial → editor → Consequência: prazo de combate em minutos e perfil vinculado. Sem prazo, o comportamento anterior permanece. Prazo sem perfil resulta em FAILED sem reconstrução.
- `worldcrisis.enabled` começa false e só habilita snapshots de consequência de ciclos futuros. Botão de ativação no Admin exige motivo/auditoria. Crises já iniciadas continuam até conclusão ou cancelamento explícito. Ligar durante um Boss já snapshotado não altera esse ciclo.
- Snapshot de crise e duração é congelado na criação do ciclo do Boss; deadline é persistido quando desperta. Ativar/desativar/editar catálogo depois não altera o snapshot ativo.
- Primeiro uso: cadastrar/revisar perfil, ativá-lo, vincular prazo/perfil a um Boss e ativar consequências futuras. Testar em dev antes de promover para main. Se já houver ciclo em COOLDOWN/DORMANT com snapshot antigo, cancelar esse ciclo pelo Admin e aguardar o scheduler gerar outro antes do teste; não reescrever o snapshot. Não atribuir destruição automaticamente a todos os Bosses.

## Contratos e arquitetura

World Boss só detecta expiração e chama `worldBossFailureService`/`worldCrisisService.trigger`. Inventário, progresso, ranking, anúncios, acesso e recompensas ficam no domínio World Crisis, em serviços separados.

Estrutura de conteúdo é um agregado JSONB **validado**, com arrays limitados e registry fechado, em `world_crisis_configs`; o endpoint de estrutura salva o agregado numa transação. Isso substitui as várias tabelas de subconfiguração sugeridas no documento sem duplicar parâmetros em eventos. Runtime/ledger/grants/anúncios têm tabelas relacionais próprias. Não há código/expressões executáveis administráveis.

Migration `20270206010005-world-crisis-reconstruction.js` expande status FAILED, configura prazo e cria nove tabelas de crise. Índices asseguram uma única crise ACTIVE, uma crise por Boss, idempotência de contribuição e grant, progresso único por requisito e cursor/anúncios únicos. Históricos DEFEATED/CANCELLED não são reescritos; eventos antigos sem deadline continuam compatíveis.

Deadline valida `now >= combat_expires_at` após lock do evento tanto nas ações de jogador quanto no tick do Boss. Ordem de lock no combate: evento antes de sessão, igual ao scheduler. Falha fecha sessões e persiste métricas, mantém participação elegível, sem TOP_DAMAGE/FINAL_BLOW. Recovery roda nos ticks de ciclo; expirados são verificados também no tick de 1s. Crise ativa pausa agendamento/ativação do próximo Boss. Conclusão/cancelamento começa cooldown a partir da restauração.

Doação recebe `event_id`, `stage_key`, `requirement_key`, `item_id`, `quantity`, `request_id`; os dois primeiros são precondições, nunca autoridade de progresso. Evento/progresso são travados; fonte e valores vêm do snapshot. `inventoryService.removeStack`, ledger, vínculo de ranking, progresso e transição são uma transação. Retry devolve a resposta original inclusive após conclusão, e recusa reutilizar request_id com payload diferente. Consome apenas quantidade útil; overshoot de item de peso alto capa progresso e pontos proporcionalmente. Não transfere excesso à etapa seguinte.

Ranking individual e de guildas é calculado do ledger, sem cache de pontuação mutável. Guilda fixada na primeira contribuição como membro; doações anteriores sem guilda não são creditadas retroativamente. Snapshot de tamanho/nome é capturado no início; guildas posteriores recebem multiplicador 1x. Score/participantes/denominador/multiplicador são públicos. Rankings finais são persistidos e imutáveis após concluir/cancelar. O ledger substitui o rebuild de caches sugerido: não há summary de pontos que precise ser reconstruído.

Grants snapshotados Pending → Granted usam locks e a mesma transação do payout econômico; queda/erro mantém grant Pending para recovery. Gold/XP/Item reutilizam `rewardPayoutService`, itens instanciáveis seguem o serviço existente. XP/tesouro da guilda usa a guilda travada e o serviço de progressão. Faixas GUILD_RANK pagam membros com vínculo fixado e mínimo pessoal, além do prêmio institucional configurado. Recompensas da reconstrução nunca sofrem penalidade.

## Efeitos, restrições e experiência

Penalidade após bônus normais, antes do payout final. Contextos seguros: ADVENTURE_SOLO (inclui o fallback de emboscada/combate solo atual), ADVENTURE_PARTY e HUNT (farm de alvo de caçada). Prêmio fixo de conclusão de caçada/missão, PvP, mercado, tesouro e reconstrução não são penalizados. Drop de item não é alterado; penalidades V1 são exclusivamente XP e Gold. Consulta pequena ao evento ativo em cada payout evita cache obsoleto após transição.

Zonas continuam `AdventureZone.ativa=true`; restrição é temporal. Gates no início de sessão/encontro solo, início de Party e aceite de caçada; sessão solo existente é revalidada ao gerar encontro. Combate já iniciado pode terminar. Bestiário continua consultável. Zonas reabrem conforme conclusão da etapa configurada.

`/dashboard/quests/reconstruction`: etapa, penalidades, zonas, barras, fontes/pesos, somente itens possuídos na seleção, preview de quantidade útil, envio idempotente, retorno accepted/nonconsumed, ranking individual/guilda e prêmios. O painel é da Guilda dos Aventureiros, independente de pertencer a guilda de jogadores.

Conexão Socket.IO existente do Boss transporta eventos de crise, sem conexão adicional. Emissões depois do commit; refresh/catch-up consulta anúncio persistido. Broadcast agregado limitado a 3s; progress pode ser emitido por transação de doação. Popup global usa dialog nativo, confirma cursor no servidor e agrupa eventos offline. Resultado FAILED fecha arena e oferece reconstrução; countdown usa deadline/remaining_ms do servidor, bloqueia botões ao expirar e aguarda estado autoritativo.

Admin e telas reutilizam estilos de World Boss (CARD/INPUT/BTN/font-imFeel), com retorno ao Admin. Conteúdo exige worldcrisis.manage; vínculo exige worldboss.manage; live ops exigem events.manage. Todas as mutações administrativas exigem motivo de 5–500 caracteres e auditam antes/depois na mesma transação. Operações de conclusão/cancelamento exigem confirmação e escolha explícita de prêmios. Override emergencial de penalidade expira na próxima etapa.

## Limites e rollback

Não há crises simultâneas, restrições de Expedição/Pesca, dano permanente, moedas novas, prêmios de habilidades, nem reset de ranking. Histórico/métricas iniciais mostram totais de participantes, materiais, progresso/pontos, entregas e estado de grants; não são um sistema externo de observabilidade nem métricas de preço/percentis/retention. Progress broadcast por entrega pode ser otimizado em batch se tráfego justificar.

Desativação operacional: desabilitar consequências para ciclos futuros; cancelar/ajustar explicitamente a crise atual para remover penalidades imediatamente. **Down destrutivo não é oferecido**: preserva contribuições, inventário consumido, grants e histórico FAILED. Não remover tabelas nem reverter código antigo incapaz de ler FAILED. Correções devem usar migration forward e live ops auditadas. Backup antes de deploy é recomendado.

## Verificação

Regressão direcionada: 132 testes aprovados de crise e World Boss (deadline, concorrência, inventário/retry, etapas, vínculo/ranking, catch-up/grants e combate existente). HTTP adicional valida permissões, motivo, catálogo inválido sem alteração parcial, registry, auditoria e preview de perfil desativado. Suíte completa: 1.353 testes aprovados, sem falhas/skips. Última regressão em banco CI novo: 117 testes aprovados. Banco criado do zero e repetição das migrations aprovados. Frontend: 17 testes, typecheck, lint/build e smoke Next/Chromium (aviso global, ack, doação única e edição administrativa) aprovados.
