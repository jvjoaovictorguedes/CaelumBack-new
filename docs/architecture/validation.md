# Validação da Fase 0

Estado atual: **baseline estabilizado e gate completo verde**. O histórico abaixo preserva os resultados anteriores à estabilização.

## Ambiente utilizado

Node 24, PostgreSQL 16 local, banco `caelum_test` migrado e dependências já instaladas. Produção não foi consultada nem alterada. O CI existente usa Node 22 e PostgreSQL 16; não houve execução remota de CI neste ambiente nem alteração no workflow.

Não há mudança em código de produção, schema, dependencies, nomes de endpoints, eventos ou payloads. A nova suíte executa os adaptadores existentes e captura resultados atuais, incluindo a diferença de Silêncio entre PvE e duelo.

## Comandos e resultados

Os comandos abaixo foram executados usando variáveis locais de teste. Credenciais e valores de conexão não pertencem à documentação do repositório. Configurar `TEST_DATABASE_URL` para um banco **descartável de testes**, nunca produção; os helpers existentes o usam como `DATABASE_URL`.

| Comando | Resultado |
| --- | --- |
| `NODE_ENV=test npm test` antes das alterações, com `TEST_DATABASE_URL` local | 1.293 testes: 1.288 passaram, 5 falharam, nenhum skip. |
| `NODE_ENV=test npm test` depois da entrega | 1.302 testes: 1.293 passaram, 9 falharam, nenhum skip. Os 9 testes novos passaram também dentro desta execução completa. |
| `NODE_ENV=test node --test test/combatArchitectureCharacterization.test.js` | 9 passaram, 0 falhas, nenhum skip. |
| `NODE_ENV=test node --test --test-concurrency=1 test/adminAdventureExcluir.test.js test/aventuraExpansao.test.js test/guildMural.test.js test/playerShopCommission.test.js` | 28 testes: 24 passaram, 4 falharam, nenhum skip. Quatro falhas persistentes reproduzidas fora da suíte completa. |
| `npm run check:requires` | Passou, zero problemas de casing/resolução. |
| `NODE_ENV=production npm run build` no frontend | Passou, incluindo validação de tipos. Warnings já existentes de lint/renderização dinâmica não impediram o build. |

Os resultados iniciais pertencem à referência anterior à edição. As falhas variáveis da execução final ocorreram em testes existentes; não houve alteração de seus arquivos ou do código de produção. A execução completa continua reprovada: os resultados não devem ser apresentados como suíte verde.

## Falhas anteriores diagnosticadas

| Arquivo / caso | Evidência | Interpretação e próximo ajuste separado |
| --- | --- | --- |
| `adminAdventureExcluir.test.js`: monstro com histórico | Fixture grava `id_personagem: 1`, inexistente neste banco; falha FK antes de chamar o serviço de exclusão. Reproduzida isoladamente. | Teste depende de seed implícito. Criar personagem próprio e limpar fixture, sem mudar a política de exclusão do jogo. |
| `aventuraExpansao.test.js`: todos os drops são Espólio | Varre todos os registros de loot do banco e encontra `Acessorio1`, diferente de `Espolio`. Reproduzida isoladamente no mesmo banco. | Verificar isolamento dos fixtures e escopo do catálogo legado: outros testes administrativos criam drops de itens genéricos e deixam registros. Essa asserção global não prova regressão de combate. Não afirmar que o catálogo de produção está incorreto. |
| `playerShopCommission.test.js`: entrega de stack | Espera que inventário esgotado exista com quantidade zero; `inventoryService.removeStack` exclui a linha quando chega a zero. A consulta retorna null; as verificações anteriores de conclusão e crédito passaram. | Alinhar o teste ao contrato atual de inventário esgotado e continuar verificando transferência e recursos. Não mudar o comportamento canônico de removeStack para satisfazer a asserção. |
| `playerShopCommission.test.js`: entrega de equipamento | Fixture `WeaponProperties` omite `bonus_atributo`, obrigatório no model; falha de validação antes da entrega. Reproduzida isoladamente. | Completar a fixture antes de diagnosticar o serviço de transferência. |
| `guildMural.test.js`: mensagem vazia | `SequelizeUniqueConstraintError` no nome gerado da guilda. O helper corta o sufixo em 24 caracteres, perdendo a parte que diferencia fixtures próximas. O teste passou na execução isolada. | Instabilidade de fixture por colisão de nome; tornar o identificador estável/único. Não é evidência de falha da validação de mensagem vazia. |

Estas correções não foram misturadas com a documentação/novos testes de caracterização. Nenhum teste foi desabilitado, assertion removida ou erro convertido em sucesso. Uma execução isolada verde do mural não apaga a falha observada na suíte completa.

## Falhas variáveis adicionais na execução final

| Teste existente | Evidência / reprodução |
| --- | --- |
| `combatBalance.test.js`: vitória por DoT | Retornou victory false na execução completa; passou na reprodução isolada. Cenário não fixa todas as rolagens. A causa precisa ser estabilizada no teste antes de usar como gate de refatoração. |
| `duelEngineMonsterStatusEffects.test.js`: status no hit do monstro | A asserção exige dano positivo, mas o ataque pode ser esquivado; passou isoladamente. Chance de status de 100% não garante acerto do ataque. |
| `guildMural.test.js`: marcação de leitura | Outra colisão de nome de guilda na montagem da fixture, mesma geração truncada descrita acima; passou isoladamente. |
| `rankingServiceAdmins.test.js`: posição de nível | Posição mudou em uma unidade entre consultas na suíte completa; passou isoladamente. A suíte compartilha banco enquanto outras fixtures criam personagens, inclusive a nova caracterização; é necessário isolamento da base ou execução apropriada, não alterar a fórmula de ranking. |
| `uniqueFeatConteudoInicial.test.js`: Sobrevivente com 1 HP | Inimigo esquivou do ataque e matou o personagem de 1 HP, tanto na execução final quanto na amostra isolada. O teste passou na execução completa anterior e não fixa RNG; a asserção presume vitória garantida apesar da esquiva real. Não interpretar a derrota válida como regressão da regra de proeza. |

Reprodução adicional, sem executar a nova caracterização: `combatBalance`, `duelEngineMonsterStatusEffects`, `guildMural` e `rankingAdminExclusion` passaram em conjunto com concorrência de arquivos 1 (21 testes). `rankingServiceAdmins` e `uniqueFeatConteudoInicial` executaram 9 testes (8 passaram; o caso de Sobrevivente falhou pelo ataque esquivado). Não foram feitos retries até passar nem removidas as asserções.

## Riscos restantes

- CI remoto não foi executado; `npm test` local completo ainda falha. A Fase 0 ainda não atende o critério de baseline totalmente verde.
- Inventário de contratos dos seis modos é baseado nos produtores/consumidores atuais; apenas o serializer de início/resync casual recebe um snapshot completo novo nesta entrega.
- Há caracterização de ações em dois caminhos, sem simular integralmente timers, salas, reconexão, rewards e lifecycle dos seis modos.
- Os helpers históricos deixam parte do catálogo/fixtures no banco. A nova suíte limpa os personagens/usuários/poderes/itens que usa, mas não redesenha o isolamento global do runner.
- Comentários de World Boss estão defasados em relação ao código executável; não usar esses comentários como especificação para a futura extração.
- Preparação para multi-instância, Redis, economia canônica e decomposição de Context não foi implementada; pertence às fases seguintes.

Próximo passo recomendado: estabilizar as fixtures e asserções do baseline em uma alteração específica, obter `npm test` verde e então revisar a Fase 1. Nenhuma fase seguinte foi executada automaticamente.

## Estabilização autorizada para as fases seguintes

Em 2026-10-07, `npm test` executou 1.302 testes: 1.302 passaram, zero falhas, zero ignorados (381 segundos). Foram corrigidas fixtures incompletas, limpeza de WeaponProperties, nomes de guilda truncados, escopo do catálogo e rolagens presumidas nas fixtures. O runner serializa arquivos porque os testes de integração compartilham banco; testes de concorrência continuam executando operações simultâneas dentro dos próprios cenários. Nenhuma regra de gameplay foi alterada. A Fase 1 pode usar este baseline.
