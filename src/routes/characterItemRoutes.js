// ADICIONAR em src/routes/characterInventoryRoutes.js, antes de "module.exports = router;"
// IMPORTANTE: coloque esta linha ANTES de router.route("/:id") — do contrário o
// Express vai tentar casar "/use" com o parâmetro :id e nunca vai chegar aqui.

router.route("/use").post(characterInventoryController.useItem);
