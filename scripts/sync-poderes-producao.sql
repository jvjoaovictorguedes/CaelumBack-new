-- scripts/sync-poderes-producao.sql
--
-- Garante que os poderes de classe/raça estão todos cadastrados e
-- vinculados nas tabelas certas (Powers + class_abilities +
-- RaceAbilities). Seguro de rodar quantas vezes quiser: cada bloco só
-- insere o que ainda não existe (não duplica, não sobrescreve nada
-- que você já tenha configurado na mão).
--
-- Como rodar: cole isso inteiro no console de SQL do seu banco de
-- produção (Railway -> aba do Postgres -> "Query", ou psql/qualquer
-- cliente conectado na DATABASE_URL de produção) e execute.

-- 0) Sincroniza a sequence de auto-incremento de Powers antes de
-- inserir. Se algum Power já foi inserido com id fixo na mão em algum
-- momento (é o caso do nosso seeder local, e pode ter acontecido em
-- produção também), a sequence pode estar atrasada e o INSERT abaixo
-- falharia com "duplicate key" mesmo sem duplicata nenhuma de verdade.
SELECT setval(pg_get_serial_sequence('"Powers"', 'id'), COALESCE((SELECT MAX(id) FROM "Powers"), 1));

-- 1) Garante que o poder "Bola de Fogo" existe
INSERT INTO "Powers" (nome, descricao, tipo_poder, custo_mana, dano_base, cura_base, escala_atributo, valor_escala, "createdAt", "updatedAt")
SELECT 'Bola de Fogo', 'Uma explosao de energia arcana lancada contra o inimigo.', 'Ativo', 10, 6, 0, 'Inteligencia', 1.2, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Powers" WHERE nome = 'Bola de Fogo');

-- 2) Guerreiro aprende Golpe Poderoso (garante que existe, caso falte)
INSERT INTO class_abilities (id_classe, id_poder, nivel_aprendizagem)
SELECT c.id, p.id, 1
FROM "Classes" c, "Powers" p
WHERE c.nome ILIKE '%guerreiro%' AND p.nome = 'Golpe Poderoso'
  AND NOT EXISTS (
    SELECT 1 FROM class_abilities ca WHERE ca.id_classe = c.id AND ca.id_poder = p.id
  );

-- 3) Mago aprende Cura Arcana (garante que existe, caso falte)
INSERT INTO class_abilities (id_classe, id_poder, nivel_aprendizagem)
SELECT c.id, p.id, 1
FROM "Classes" c, "Powers" p
WHERE c.nome ILIKE '%mago%' AND p.nome = 'Cura Arcana'
  AND NOT EXISTS (
    SELECT 1 FROM class_abilities ca WHERE ca.id_classe = c.id AND ca.id_poder = p.id
  );

-- 4) Mago aprende Bola de Fogo (o ajuste novo dessa sessão)
INSERT INTO class_abilities (id_classe, id_poder, nivel_aprendizagem)
SELECT c.id, p.id, 1
FROM "Classes" c, "Powers" p
WHERE c.nome ILIKE '%mago%' AND p.nome = 'Bola de Fogo'
  AND NOT EXISTS (
    SELECT 1 FROM class_abilities ca WHERE ca.id_classe = c.id AND ca.id_poder = p.id
  );

-- 5) Raça Celestial aprende Julgamento Divino — a tabela RaceAbilities
-- teve o nome incerto no passado (tem migration própria pra achar ela
-- dinamicamente), então esse bloco procura a tabela pela coluna
-- "nivel_aprendizado" em vez de assumir o nome "RaceAbilities" direto.
DO $$
DECLARE
  tabela text;
BEGIN
  SELECT table_name INTO tabela
  FROM information_schema.columns
  WHERE column_name = 'nivel_aprendizado' AND table_schema = current_schema()
  LIMIT 1;

  IF tabela IS NULL THEN
    RAISE NOTICE 'Não encontrei a tabela de habilidades de raça (procurei pela coluna nivel_aprendizado) — pule esse passo ou me avise pra eu ajustar o script.';
  ELSE
    EXECUTE format(
      'INSERT INTO %I (id_raca, id_power, nivel_aprendizado, "createdAt", "updatedAt")
       SELECT r.id, p.id, 1, NOW(), NOW()
       FROM "Races" r, "Powers" p
       WHERE r.nome_masculino ILIKE %L AND p.nome = %L
         AND NOT EXISTS (SELECT 1 FROM %I ra WHERE ra.id_raca = r.id AND ra.id_power = p.id)',
      tabela, '%celestial%', 'Julgamento Divino', tabela
    );
  END IF;
END $$;

-- 6) Confere o resultado
SELECT c.nome AS classe, p.nome AS poder, ca.nivel_aprendizagem AS nivel
FROM class_abilities ca
JOIN "Classes" c ON c.id = ca.id_classe
JOIN "Powers" p ON p.id = ca.id_poder
ORDER BY c.nome, ca.nivel_aprendizagem;
