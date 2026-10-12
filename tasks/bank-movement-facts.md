# Preservar movimentos recebidos

Um refresh parcial da mesma transação podia substituir data/valor/moeda conhecidos por NULL. Sem data, o registro físico continuava armazenado, mas o relatório por período deixava de mostrá-lo. A reprodução cobre transações e detalhes de fatura nos dois sentidos.

A atualização preserva fatos conhecidos quando falta informação na nova resposta, mantém pares monetários sem combinar moedas/valores de respostas diferentes, e conserva nome e classificação quando o provedor não os envia. Uma correção completa e mais recente, inclusive valor zero explícito, continua aceita. Categoria manual, IDs, titular, empresa e modo são preservados.

Migração altera apenas a definição privada do importador, com guarda da definição anterior e limites de tempo. Não altera ou exclui dados existentes. Proprietário, permissões, RLS e seleção por empresa ficam iguais. Rollback restaura somente a definição anterior; registros recebidos permanecem.

Runner PostgreSQL fictício confirmou RED antes e GREEN depois, incluindo atualização esparsa, correção completa, versão antiga, categoria manual e acesso negado entre empresas/titulares/modos. A proteção previne novas perdas por payload parcial; recuperar um fato antigo que já não consta no banco exige um retorno válido do provedor. Não fabricar datas, valores ou compras com base em memória.
