-- Remove fluxos WhatsApp de pós-venda (payment_approved), fora do escopo de recuperação de venda.
-- Apaga também message_templates que ficarem só com esse vínculo (sem outro recovery_flow nem message_variants).

WITH removed_flows AS (
  DELETE FROM recovery_flows
  WHERE channel = 'whatsapp'
    AND trigger_event_type = 'payment_approved'
  RETURNING message_template_id
),
orphan_candidates AS (
  SELECT DISTINCT message_template_id AS id FROM removed_flows
)
DELETE FROM message_templates mt
USING orphan_candidates o
WHERE mt.id = o.id
  AND NOT EXISTS (SELECT 1 FROM recovery_flows rf WHERE rf.message_template_id = mt.id)
  AND NOT EXISTS (SELECT 1 FROM message_variants mv WHERE mv.template_id = mt.id);
