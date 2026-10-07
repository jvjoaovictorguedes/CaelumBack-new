# Fase 1 — contratos de combate

Eventos públicos foram centralizados em `src/contracts/socketEvents.js` e no espelho TypeScript do frontend. Os nomes permanecem iguais, incluindo comandos antigos. Constantes são agrupadas por domínio; não existe uma nova conexão por domínio.

Os serializers de início/resync PvP, início/rating ranqueado, turno/fim casual e estado de grupo ficam em `src/contracts/*Payloads.js`. Não escolhem vencedor, calculam recompensa, gravam matches ou leem o banco. A API pública de `pvpLiveSocket` mantém os aliases usados pelos chamadores antigos. Slots são enviados explicitamente; ordem do grupo, recursos atuais, ausência de consumíveis ranked e rating do defensor IA foram preservados.

No frontend, interfaces foram movidas para `src/types/contracts/{pvp,ranked,party,tournament,guildboss}.ts`; `PvpSocketContext` reexporta os tipos para consumidores existentes. World Boss mantém seu contrato próprio nesta etapa.

Validação local: 32 testes de contrato/caracterização/fluxo ranked/grupo passaram, zero ignorados. `tsc --noEmit` passou no frontend. O build completo e a suíte global voltam a ser gates ao fim das fases seguintes. CI remoto não foi executado.
