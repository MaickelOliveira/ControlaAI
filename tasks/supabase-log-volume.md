# Consumo de logs do Supabase

Pedido em 11/10/2026: cuidar do consumo de Log Ingestion.

O painel da organização mostrava 0,63 GB / 1 GB. A origem total ainda não foi atribuída; logs do console no EasyPanel são diferentes dos eventos ingeridos pelo Supabase.

- A fila do Open Finance fazia 30 consultas de escopo/minuto em ociosidade (um tick a cada 2s alternando PF/PJ).
- Verificar cada modo ocioso a cada 30s reduz a quatro consultas/minuto; processamento ativo continua curto, cancelamentos e agenda mantêm suas verificações.
- Falhas repetidas usam espera progressiva de 30s até 5min por modo e mensagens locais limitadas. O outro modo e cancelamentos continuam.
- Não reduzir registros de segurança nem alterar configuração de logs do banco. Não prometer redução proporcional do total ingerido: o volume inclui outros serviços e tráfego.

Teste do comportamento antigo reproduziu 30 consultas em 59s; o novo mantém quatro. Validar testes, build e implantação antes de marcar concluído.
