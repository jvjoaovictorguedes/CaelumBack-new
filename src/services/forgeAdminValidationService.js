// Painel Administrativo da Forja — validação de Blueprint (§4/§5/§6/§12).
// Nunca decide nada sozinho: só confere ingredientes/resultados contra a
// infraestrutura JÁ existente (ForgeBarItem/ExpeditionResourceItem via
// forgeMaterialsService, Item/WeaponProperties/ArmorProperties/
// FishingRodProperties) — a mesma resolução usada pelo gameplay real.
const { ORDEM_QUALIDADE } = require("../config/forgeConfig");
const { resolverIdItemDoInsumo } = require("./forgeMaterialsService");
const Item = require("../models/Item");

const CATEGORIAS_BLUEPRINT_VALIDAS = ["Arma", "Armadura", "Capacete", "Escudo", "Acessorio1", "Acessorio2", "Ferramenta"];
const TIPOS_INSUMO_VALIDOS = ["Barra", "RecursoExpedicao"];

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function validarCategoria(categoria) {
  if (!CATEGORIAS_BLUEPRINT_VALIDAS.includes(categoria)) {
    throw erro(`categoria_equipamento precisa ser uma de: ${CATEGORIAS_BLUEPRINT_VALIDAS.join(", ")}.`);
  }
}

function validarTier(tier) {
  if (!Number.isInteger(tier) || tier < 1 || tier > 5) {
    throw erro("tier_equipamento precisa ser um inteiro entre 1 e 5.");
  }
}

function validarCamposBasicos(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.nome !== undefined) {
    if (!dados.nome || typeof dados.nome !== "string") erros.push("nome é obrigatório.");
  }
  if (!parcial || dados.categoria_equipamento !== undefined) {
    if (!CATEGORIAS_BLUEPRINT_VALIDAS.includes(dados.categoria_equipamento)) {
      erros.push(`categoria_equipamento precisa ser uma de: ${CATEGORIAS_BLUEPRINT_VALIDAS.join(", ")}.`);
    }
  }
  if (!parcial || dados.tier_equipamento !== undefined) {
    if (!Number.isInteger(dados.tier_equipamento) || dados.tier_equipamento < 1 || dados.tier_equipamento > 5) {
      erros.push("tier_equipamento precisa ser um inteiro entre 1 e 5.");
    }
  }
  if (!parcial || dados.multiplicador_tempo !== undefined) {
    if (typeof dados.multiplicador_tempo !== "number" || dados.multiplicador_tempo <= 0) {
      erros.push("multiplicador_tempo precisa ser um número positivo.");
    }
  }
  if (!parcial || dados.nivel_forja_minimo !== undefined) {
    if (!Number.isInteger(dados.nivel_forja_minimo) || dados.nivel_forja_minimo < 1 || dados.nivel_forja_minimo > 10) {
      erros.push("nivel_forja_minimo precisa ser um inteiro entre 1 e 10 (NIVEL_MAXIMO da Forja).");
    }
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

function validarIngredientesPayload(ingredientes) {
  if (!Array.isArray(ingredientes) || ingredientes.length === 0) {
    throw erro("Informe ao menos um ingrediente lógico.");
  }
  for (const ingrediente of ingredientes) {
    if (!TIPOS_INSUMO_VALIDOS.includes(ingrediente.tipo_insumo)) {
      throw erro(`tipo_insumo precisa ser um de: ${TIPOS_INSUMO_VALIDOS.join(", ")}.`);
    }
    if (!Number.isInteger(ingrediente.id_recurso)) {
      throw erro("id_recurso precisa ser um inteiro (ExpeditionResource.id).");
    }
    if (!Number.isInteger(ingrediente.quantidade_base) || ingrediente.quantidade_base < 1) {
      throw erro("quantidade_base precisa ser um inteiro >= 1.");
    }
  }
}

// Resolve a matriz Ingrediente x Qualidade (§4.3) — pra CADA ingrediente
// lógico, mostra o Item real que o backend resolveria em cada uma das 6
// qualidades, usando a MESMA infraestrutura do gameplay
// (forgeMaterialsService.resolverIdItemDoInsumo).
async function resolverMatrizIngredientes(ingredientes, transaction) {
  const matriz = [];
  for (const ingrediente of ingredientes) {
    const porQualidade = {};
    for (const qualidade of ORDEM_QUALIDADE) {
      const idItem = await resolverIdItemDoInsumo(
        { tipo_insumo: ingrediente.tipo_insumo, id_recurso: ingrediente.id_recurso, qualidade },
        transaction,
      );
      let item = null;
      if (idItem) {
        item = await Item.findByPk(idItem, { attributes: ["id", "nome", "imagem_url", "raridade"], transaction });
      }
      porQualidade[qualidade] = idItem ? { id_item: idItem, nome: item?.nome ?? null, imagem_url: item?.imagem_url ?? null, status: "OK" } : { id_item: null, status: "Ausente" };
    }
    matriz.push({ tipo_insumo: ingrediente.tipo_insumo, id_recurso: ingrediente.id_recurso, quantidade_base: ingrediente.quantidade_base, resolucao: porQualidade });
  }
  return matriz;
}

function todosIngredientesResolviveis(matriz) {
  return matriz.every((linha) => ORDEM_QUALIDADE.every((qualidade) => linha.resolucao[qualidade].status === "OK"));
}

// Compatibilidade Item <-> categoria_equipamento (§5): Arma precisa
// WeaponProperties; Armadura/Capacete/Escudo/Acessorio1/Acessorio2
// precisa ArmorProperties; Ferramenta precisa FishingRodProperties e
// NUNCA WeaponProperties.
function categoriaCompativelComItem(categoria, item) {
  if (categoria === "Arma") return Boolean(item.weaponProperties);
  if (categoria === "Ferramenta") return Boolean(item.fishingRodProperties) && !item.weaponProperties;
  return Boolean(item.armorProperties);
}

// Valida os 6 resultados (§5) e devolve { completo, alertas } —
// alertas classificados em ERRO (bloqueia ativação)/AVISO/INFORMACAO
// (§12). `resultadosPorQualidade` é um Map<qualidade, Item completo
// (com weaponProperties/armorProperties/fishingRodProperties)>.
function validarResultados(categoria, tier, resultadosPorQualidade) {
  const alertas = [];
  for (const qualidade of ORDEM_QUALIDADE) {
    const item = resultadosPorQualidade.get(qualidade);
    if (!item) {
      alertas.push({ nivel: "ERRO", qualidade, mensagem: `Sem resultado configurado pra qualidade ${qualidade}.` });
      continue;
    }
    if (item.raridade !== qualidade) {
      alertas.push({ nivel: "ERRO", qualidade, mensagem: `Item "${item.nome}" tem raridade ${item.raridade}, esperado ${qualidade}.` });
    }
    if (tier != null && item.tier_equipamento !== tier) {
      alertas.push({ nivel: "ERRO", qualidade, mensagem: `Item "${item.nome}" tem Tier ${item.tier_equipamento ?? "—"}, esperado Tier ${tier} (o mesmo do blueprint).` });
    }
    if (!categoriaCompativelComItem(categoria, item)) {
      const propriedadeEsperada = categoria === "Arma" ? "WeaponProperties" : categoria === "Ferramenta" ? "FishingRodProperties" : "ArmorProperties";
      alertas.push({ nivel: "ERRO", qualidade, mensagem: `Item "${item.nome}" não tem ${propriedadeEsperada} válidas pra categoria ${categoria}.` });
    }
    // Arbitragem econômica (§12, AVISO) — GAP preenchido: custo estimado
    // não é calculado aqui (dependeria de resolver os ingredientes em
    // Gold, fora do escopo desta função síncrona); fica só o alerta de
    // tempo/XP desproporcional, cobertos no service que monta o preview.
  }
  const completo = resultadosPorQualidade.size === ORDEM_QUALIDADE.length && !alertas.some((a) => a.nivel === "ERRO");
  return { completo, alertas };
}

// Decide se um blueprint pode ser ATIVADO (§4.2/§6/§21.6) — precisa de
// ingredientes resolvíveis nas 6 qualidades E 6/6 resultados válidos.
function podeAtivar({ matrizIngredientes, resultadosValidacao }) {
  const erros = [];
  if (!todosIngredientesResolviveis(matrizIngredientes)) {
    erros.push("Há ingrediente sem Item resolvido em alguma qualidade (ver matriz de ingredientes).");
  }
  if (!resultadosValidacao.completo) {
    erros.push("Resultados incompletos ou incompatíveis (precisa de 6/6 válidos).");
  }
  return { podeAtivar: erros.length === 0, motivos: erros };
}

module.exports = {
  CATEGORIAS_BLUEPRINT_VALIDAS,
  TIPOS_INSUMO_VALIDOS,
  validarCategoria,
  validarTier,
  validarCamposBasicos,
  validarIngredientesPayload,
  resolverMatrizIngredientes,
  todosIngredientesResolviveis,
  validarResultados,
  podeAtivar,
};
