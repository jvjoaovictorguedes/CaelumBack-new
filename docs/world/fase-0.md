# Mundo explorável — Fase 0

A arquitetura de mundo começa em `src/world/`, separada dos orquestradores de combate e do socket PvP. Esta entrega contém **acesso e manifesto de leitura**; não registra handlers Socket.IO, timers/ticks, deslocamento, conjuração ou recompensas. Os modos atuais não usam a flag e continuam funcionando.

## API e autoridade

- `GET /api/world/exploration/acesso`: autenticação + personagem atual identificado pelo JWT; responde `{data:{habilitado,fase:0}}` e `Cache-Control: no-store`.
- `GET /api/world/exploration/manifesto`: mesmas checagens + flag relida do banco; 403 `WORLD_NOT_ENABLED` quando desabilitada. Entrega escala, mapas allowlisted, polígonos/pontos/conexões atuais e posição terrestre. Não aceita ID de personagem em query/body.
- `GET/PATCH /api/admin/world/exploration/:id/acesso`: sessão + isAdmin + `world.manage`; PATCH exige `habilitado` booleano, personagem existente e ID válido. Lock do personagem serializa a primeira criação de estado; atualização e auditoria são gravadas na mesma transação.

A revogação bloqueia imediatamente novas consultas. O Front reconfirma a flag em no máximo 15 segundos para fechar previews já abertos. Não existe movimento/recompensa local autorizado. Ao implementar salas na Fase 2, a revogação deverá também expulsar a sessão de mundo.

## Migration

`20270213010002-world-exploration-foundation.js` é nova e registrada no manifesto de migrations com dependências do mapa e do painel administrativo. Nenhuma migration histórica foi alterada.

Cria `character_world_state`, FK do personagem com cascade, flag false por padrão, mapa capital, posição inicial tile (200,90) e versão de posição. CHECK rejeita coordenadas fora da grade. Não faz backfill de flags true. Cria `world.manage` e concede apenas à role SuperAdmin. O rollback exclui essa tabela e a permissão; isso perde flags/posições experimentais e deve ser considerado antes de um rollback com dados reais.

`CharacterNavigationState` é especificamente marítimo e foi preservado. Não misturar a posição de mundo com porto/zona de pesca, sessões de aventura ou atividades do personagem.

## Escala/contratos compartilhados

A fonte de `@caelum/world-contracts@0.1.0` está em `packages/world-contracts`. O backend instala o pacote local; o Front instala um tarball da mesma fonte com lockfile. O módulo concentra escala (400x180, 32 px), conversões e enum de eventos. Tipos de intenção/snapshot ficam no pacote; `src/contracts/world.js` tem typedefs JSDoc, e o Front reexporta em `src/types/contracts/world.ts`.

```sh
node scripts/export-world-contracts.js /caminho/CaelumFront-new
# No Front, instalar/revisar o tarball gerado e o lockfile.
```

A versão 0.1.0 está em preparação neste PR. Depois de publicar, incrementar a versão para alterações; não substituir uma release já instalada. Contracts de socket estão reservados, sem handlers ativos. A futura identidade virá do ticket autenticado, nunca de IDs, dano ou velocidade do payload.

## Geografia e limites

O manifesto consulta `world_territories`, `world_map_nodes` e `world_map_connections` atuais, sem copiar regras de Aventura/Expedição. O seed histórico declara os polígonos/pontos provisórios. Por isso `geografia_validada` é false, `operacoes_disponiveis` é vazio e `modo` é preview cartográfico. Posição inválida é apresentada na Capital sem escrita corretiva numa leitura.

Os cinco JSON Tiled no Front são shells globais baseados em chunks da arte oficial, sem navegação ou geração procedural. Não representam cinco regiões jogáveis prontas. A proporção original da arte difere de 400x180; o Front reescala arte e minimapa pela mesma transformação percentual. Conferir os marcos antes da Fase 1. Correções de pontos/polígonos devem entrar em migration nova, nunca no histórico.

## Verificação/deploy para teste

1. Aplicar migrations **num banco descartável local** para validação. `npm test` escreve dados; nunca apontar testes para produção.
2. Executar `npm run audit:migrations`, `npm run audit:economy`, `npm run check:requires` e `npm test` com o banco de teste.
3. Publicar Back e Front coordenados somente após revisão. O backend antigo deixa o Front novo com o mundo oculto/indisponível; não concede acesso por fallback.
4. Admin → Mundo explorável, informar o ID e habilitar somente o personagem de teste. Abrir `/dashboard/mundo`. Retirar acesso depois da conferência.

Testes novos cobrem escala/chunks, sessão, ownership, permissão, flag, auditoria, manifesto, rejeição de tentativas de escrita não implementadas, constraint e preservação de personagem/navegação marítima. Os handlers de movimento, anti-speed-hack, cooldown/alcance e combate pertencem às fases seguintes; estes testes não comprovam um servidor realtime já implementado.

Antes da Fase 4, aprovar o valor de um turno em segundos para o adaptador do motor existente e cadastrá-lo em GameSetting. Não foi criado um padrão arbitrário nesta entrega.
