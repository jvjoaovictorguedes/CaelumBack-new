# Imunidade elemental explícita — revisão sem deploy

## Regra e limites

Somente entrada individual `affinity_profile_id` com multiplicador explicitamente zero, para uma afinidade `ELEMENTAL`, gera imunidade. `monsterProfile` conserva os mapas `inherited` e `overrides`; o individual sobrescreve o da família, sem multiplicação. Um zero apenas na família, em equipamento ou numa afinidade física continua sujeito ao clamp positivo. O elemento do ataque básico nunca é tratado como elemento inato. Não se atribuiu imunidade automaticamente a nenhuma criatura/família.

`defensiveMultiplier` retorna zero antes de percentuais temporários e clamp. `resolveDamage` mantém o piso de 1 em multiplicadores positivos; só a imunidade explícita produz zero num componente de dano. Componentes híbridos continuam independentes. Defesa, crítico, bônus situacionais e modificadores finais não desfazem a imunidade. Dano verdadeiro conserva seus bônus e demais regras existentes e ignora afinidade. PvP/Ranqueada/Torneios continuam sem tipagem, mesmo que o alvo carregue um perfil imune.

Payload existente: `totalDamage=0`, `components[].finalDamage=0`, `affinityMultiplier=0`, `effectivenessLabel="IMUNE"`. Descrição: `Fogo: IMUNE — 0 de dano (0.00x)`. Telemetria contabiliza IMUNE e zero. `DamageBreakdown`/`ResistanceList` no Front renderizam números zero e rótulos genéricos; não exigem alteração de contrato nem publicação do Front.

## Acerto, status e cura

Imunidade total não é esquiva: o gasto de mana/cooldown e efeitos próprios de conjuração permanecem. Não consome HP ou escudo, não transforma dano em cura, não produz lifesteal, ON_HIT, ON_POWER_HIT, ON_CRIT nem cura acoplada a uma habilidade ofensiva totalmente imune. Cura pura, buffs SELF, efeitos ON_CAST e DoTs já presentes conservam as regras anteriores.

Status associados ao golpe (incluindo Burn/Freeze/efeitos de arma) dependem de algum componente causar dano positivo **antes do escudo**, conforme os adapters existentes; um escudo que absorve esse dano não cria imunidade. Ataque híbrido com qualquer componente não imune continua liberando esses efeitos; não existe associação de status por componente no contrato atual. Portanto Corte+Fogo pode aplicar Burn se Corte causar dano: essa é a regra explícita desta versão, não uma imunidade a status. Skills de controle sem dano conservam compatibilidade atual. Nenhum status anterior é removido só porque o próximo golpe foi imune.

Cobertos os consumidores: controller de Aventura solo, motor de ação comum (Party/bosses/duelos), skills de monstro solo/Party e habilidades do boss mundial. Templo e Puzzle usam o mesmo resolver/motor; não recebem configuração de imunidade nova.

## V9 e migração manual separada

**Não foi consultado nem alterado o banco de produção nesta entrega. A presença da V9 em produção permanece não confirmada.** Os testes usam fixtures declaradas em Postgres local; IDs 27/36 nas fixtures não comprovam dados reais.

O arquivo `scripts/manual-migrations/v9-elemental-immunity.js` fica fora de `src/migrations`. `npm start`/`db:migrate` não o executam. Não se adicionou migration automática, patch note ou atualização de poderes/níveis/aprendizados.

Antes de qualquer aplicação, após aprovação explícita de deploy/dados:

1. Configurar `IMMUNITY_DATABASE_URL` no ambiente seguro do operador; nunca gravar a URL no repositório.
2. Rodar `node scripts/manual-migrations/v9-elemental-immunity.js inspect /caminho/snapshot-v9.json`. Executa SELECT em transação READ ONLY/REPEATABLE READ, verifica nomes/IDs 27 e 36, duas chaves de perfil distintas, entradas FIRE=.05, ICE=1.50, WATER=1.50, WIND=.50, duplicatas e uso exclusivo. Rejeita perfil compartilhado com família, outra criatura ou outro catálogo contendo referência de perfil. Salva snapshot em arquivo novo com permissões 0600.
3. Revisar o snapshot (especialmente IDs/chaves reais). Se V9 ausente/divergente, **parar**: não criar perfis nem aplicar backfill por suposição. Preparar outra migração adequada aos dados reais.
4. Com código novo aprovado/implantado e snapshot aprovado, executar `node scripts/manual-migrations/v9-elemental-immunity.js up /caminho/snapshot-v9.json`.
5. Verificar o resultado e testar os dois monstros com Fogo, Água, Gelo, Vento e híbrido. Reiniciar processo/aguardar expiração do cache de catálogo (5s).

`up` bloqueia catálogos envolvidos, compara o snapshot atual integral, grava backup transacional antes/depois e muda **somente multiplier das duas entradas FIRE** de .05 para zero. Não altera timestamps, demais entradas, famílias ou habilidades. Reexecução é idempotente apenas se o estado pós-aplicação e o snapshot aprovado coincidirem. A tabela auxiliar `manual_v9_elemental_immunity_backup` não contém credenciais.

Rollback: `node scripts/manual-migrations/v9-elemental-immunity.js down`. Exige que a configuração atual coincida integralmente com o snapshot pós-aplicação; restaura apenas as duas entradas FIRE para .05, verifica o estado anterior e remove a tabela de backup. Divergência aborta a transação, sem sobrescrever alterações posteriores. Restaurar dados antes de reverter o código. Sem backup, down é no-op.

## Verificação e pendências

Banco local descartável: `caelum_immunity_test`, migrations executadas com o runner existente e reexecução sem pendências. Isso não aprova a auditoria de metadados.

A auditoria de migrations já falha na base: metadados ausentes para `20270215010000-event-puzzle-fase18-replayable.js` e `20270216010000-event-puzzle-fase19-oficina-rpm-ajustavel-draft.js`. Nenhuma migration histórica foi modificada para ocultar a pendência.

Bateria de regressão de combate/tipagem: 104 checks, 103 passaram, 1 falhou, zero skips. A falha de catálogo em `test/combatTyping.test.js:88` (16 armas com override diferente do tipo legado) foi reproduzida com o `combatTypingService` original de main no banco recém-migrado. Não se alterou esse teste nem as armas para fazê-lo passar. A suíte completa do backend não foi executada.

Os checks específicos cobrem imunidade, híbridos, buffs, crítico, bônus de família, HP/escudo, cura/roubo de vida, Burn/ON_HIT, skills de monstro, turno solo persistido, boss mundial, payload HTTP, validação administrativa e migração up/down/reexecução/divergência. Ver `test/combatTypingImmunity.test.js`, `test/immunityMigration.test.js` e `test/combatTypingHttp.test.js`.

Bateria final após as correções: 53/53 passaram, zero skips, incluindo os 12 checks específicos/HTTP/migração e regressões de Boss Mundial, Templo e Puzzle. `npm run check:requires` passou. A falha conhecida da bateria ampla e as duas pendências de metadados permanecem abertas; não declarar CI inteira aprovada.
