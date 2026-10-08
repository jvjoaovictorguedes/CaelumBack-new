# Fase 3 — política de economia

| Operação | Caminho canônico | Responsabilidade do adaptador |
| --- | --- | --- |
| Ouro novo/recompensa | goldService.concederOuro | Validar fonte, transação, lock, persistência e idempotência |
| Gasto | goldService.debitarOuro | Validar saldo/preço e salvar na transação existente |
| Transferência/escrow P2P | marketService/playerShop*Service | Transferir ouro existente sem aumentar dinheiro_total_ganho |
| Stack | inventoryService.addStack/removeStack | Identidade do item, autorização e transação; pilha zero é excluída |
| Equipamento | equipmentInstanceService | Instância individual e transferência/transação |
| XP | experienceService | Reutilizar personagem carregado quando há transação |
| Pacote ouro/XP/itens | rewardPayoutService | Permissão, motivo/auditoria e chave de idempotência da origem |

Gastos de loja NPC, descanso e crafting passaram pelo helper canônico, mantendo a mesma operação matemática, validação, lock e save. Não se usou concederOuro para transferência P2P, nem se alteraram comissão, imposto ou reembolso.

A auditoria registrou 28 ocorrências em `economy-writes.json`: canônicas, transferências autorizadas ou legado para revisão. Legado foi preservado; classificação não significa comprovação de bug. O CRUD de inventário exige revisão conjunta de rotas/autorização antes de qualquer mudança de comportamento.

`npm run audit:economy`, também no CI, rejeita ocorrências novas ou duplicadas fora do baseline aprovado. O baseline usa arquivo + trecho normalizado, tolerando mudança de linha. Novos casos exigem revisão e classificação explícita; não há comando que aprove silenciosamente qualquer escrita.

Limites: guard lexical conservador de atribuições diretas em dinheiro e operações bulk de CharacterInventory/CharacterEquipmentInstance nos controllers/services. SQL dinâmico, updates indiretos de instância e operações fora desses diretórios continuam exigindo revisão humana. Não substitui controle de autorização, transação ou teste de concorrência.

Validação local: 17 testes de descanso/encomendas/concorrência passaram, zero ignorados; guard aprovado. O teste do guard verifica escrita nova, duplicação e alteração de expressão.
