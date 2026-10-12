# Reconectar em outra empresa

Uma autorização cancelada preserva os produtos e movimentos como histórico. A nova autorização cria uma identidade independente na empresa de destino, sem mover registros antigos, e mantém a identidade quando renovada na mesma empresa. A chave usa titular, ambiente, modo, empresa, tipo e ID externo, com NULLS NOT DISTINCT para Pessoal.

Os webhooks de produtos resolvem apenas consentimentos ativos, não arquivados e válidos. Dois candidatos ativos permanecem ambíguos e falham sem escolher um titular/empresa. Eventos de consentimentos antigos ainda identificam o próprio vínculo cancelado, sem reativá-lo.

Rollback recusa remover a separação quando já há histórico independente. Testes usam consentimentos, contas, cartão e fatura fictícios, incluindo renovação, Pessoal e conservação byte a byte da empresa anterior. Nenhum vínculo real é cancelado automaticamente.
