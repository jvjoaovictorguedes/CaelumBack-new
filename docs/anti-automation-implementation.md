# Anti-automação — implementação após a Fase 0

Esta entrega implementa as camadas das fases seguintes ao [diagnóstico inicial](anti-automation-audit.md). Ela não ativa desafios ou restrições em produção. Os controles de integridade de ações são aplicados independentemente do score; a política adaptativa começa em observação.

## Entrega

- Persistência de risco por personagem, eventos com metadados limitados, challenges e recibos idempotentes de pesca. Sem armazenamento de tokens Turnstile, JWTs, corpos de requisição ou IPs na telemetria.
- Política central em `GameSetting`, prefixo `anti_automation.`, com validação, decay, retenção e flags de rollout. Eventos iguais são coalescidos por minuto; eventos e challenges antigos são removidos por rotina horária.
- Limites por personagem e ação após autenticação, com store substituível. Erros públicos usam códigos estáveis e não expõem score ou sinais internos.
- HTTP e eventos Socket.IO sensíveis recebem proteção. Mutex de turno em PvP/party e início de ranked evita resolução concorrente; inventário de item PvP é relido sob lock transacional.
- PvE exige `encounterId` e `stateVersion` na API. Pesca exige UUID `actionId` e `stateVersion`: retries iguais devolvem o recibo sem nova recompensa; estado antigo ou chave reutilizada com conteúdo diferente é rejeitado. Alquimia revalida a idempotência depois do lock do personagem.
- Periodicidade é um sinal fraco observado após 64 intervalos. Score alto de uma única família não dispara challenge; verificação bem-sucedida reduz o score e concede janela de confiança, sem apagar todo o histórico.
- Turnstile é carregado no navegador apenas quando solicitado. A validação server-side vincula token a hostname, action e UUID do challenge; uso repetido é rejeitado. O frontend não repete automaticamente a ação econômica após verificar.
- Painel administrativo com paginação, histórico, configuração e revisão individual. Permissões `anti_automation.view` e `anti_automation.manage`; alterações exigem motivo e geram auditoria. Não há banimento permanente automático.

## Configuração e rollout

Defaults: `enabled=true`, `shadow_mode=true`, `risk_enabled=true`, `rate_limit_enabled=false`, `challenge_enabled=false`, `restriction_enabled=false`, `turnstile_fail_open=true`. Thresholds: observação 20, challenge 60, restrição 90; decay 5 pontos/hora; confiança 60 minutos; restrição 15 minutos; retenção de eventos/challenges 30 dias.

O teto inicial é 60 ações por personagem/tipo em 10 segundos; em shadow ele apenas observa. A API de challenge também tem teto de 30 chamadas/minuto por conta. Esses limites não substituem os cooldowns próprios do gameplay.

1. Publicar backend e frontend de forma coordenada: clientes antigos sem os novos campos de PvE/pesca receberão `INVALID_ACTION_STATE`.
2. Aplicar a migration `20270206010001-anti-automation-foundation.js` pelo fluxo normal. Ela cria quatro tabelas e concede as novas permissões somente ao papel SuperAdmin existente. Não altera migrations antigas, fórmulas, drops ou recompensas.
3. Observar sinais e revisar falsos positivos antes de ajustar thresholds/limites. Usar a configuração auditada do painel; não ativar enforcement sem calibração.
4. Para Turnstile, configurar no backend `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY` e `TURNSTILE_HOSTNAMES` (hosts exatos, separados por vírgula). Cadastrar o widget para esses hosts e permitir acesso a `challenges.cloudflare.com`; CSP, se configurada fora da aplicação, deve permitir o script/frame. Nunca colocar a chave secreta no frontend.
5. Ativar primeiro limites e depois challenges, retirando `shadow_mode` apenas após revisar a configuração. Restrições temporárias têm flag separada. Challenges são pedidos em pontos de início de atividades; batalhas, pesca ativa e resgate de recompensas não são interrompidos pela fricção adaptativa.

Sem as três variáveis do provedor, o gate de challenge permanece aberto. Indisponibilidade do siteverify concede liberação curta quando `turnstile_fail_open=true`; falha de carregamento do SDK no navegador não passa pelo siteverify e não possui liberação automática. A interface permite fechar a verificação. Não foi validado um widget real com credenciais de produção.

Rollback de política: restaurar shadow e desativar flags de enforcement. Rollback de schema: primeiro retirar o código que usa essas tabelas; depois executar o `down` da migration, que remove os dados de telemetria/recibos/challenges e as permissões novas. Não executar down enquanto a versão nova estiver servindo tráfego.

## Validação local

- Backend: suíte completa com 1.323 testes aprovados, sem falhas ou skips. Depois dos ajustes finais, regressões direcionadas: 46 testes; pesca/alquimia: 36; integração HTTP final: 2. Esses grupos se sobrepõem e não devem ser somados como testes únicos.
- Integração HTTP: dez requisições do mesmo turno PvE produzem uma resolução e nove conflitos; challenge bloqueia antes da mutação, token é validado no servidor e não reutilizado; permissões isolam a revisão administrativa.
- Pesca: dez requisições concorrentes da mesma versão produzem um passo; replay do recibo não modifica inventário/XP. Alquimia: dez retries da mesma chave produzem uma única fabricação.
- Migration aplicada, repetição sem pendências, rollback e reaplicação aprovados no Postgres local de testes. Auditorias de migrations/economia e resolução de imports verificadas.
- Frontend: 17 testes, lint, build de produção e smoke de navegador aprovados. Smoke valida carregamento sob demanda e conclusão de challenge com provedor simulado. Também foi corrigido clamp de volume negativo no fade de música, encontrado pelo smoke mais longo.

Nenhuma consulta ou alteração no banco de produção foi necessária para essa entrega.

## Limites conhecidos

- Stores de limites, mutexes e batalhas em memória continuam locais ao processo. A interface permite store assíncrono compartilhado, mas não foi instalado Redis nem implementada coordenação distribuída; múltiplas instâncias precisam dessa etapa antes de depender desses controles globalmente.
- Turno PvP em memória e débito de item no banco não formam uma única transação entre recursos. O lock reduz concorrência no inventário, mas crash entre commit e resolução ainda exige estratégia de recuperação.
- Idempotência durável foi reforçada em pesca e alquimia; não há chave universal para todas as compras/listagens. Pedidos sequenciais válidos podem representar novas ações.
- Automação que respeita versões, estado e tempos válidos ainda pode agir. Não foi inventado novo tempo mínimo de gameplay. Score é evidência para revisão, não prova de bot.
- Rollout, credenciais reais, calibração e observação em produção permanecem tarefas operacionais; esta entrega não faz deploy nem liga enforcement em produção.
