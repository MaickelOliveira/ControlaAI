# Delivery expense category

Delivery is separate from Alimentação. Recognizable food-order apps and explicit food orders for delivery use Delivery; food without delivery evidence stays Alimentação. Examples include pizza, esfiha, sushi and marmita. Medicines/clothing delivery, rides and generic payment intermediaries do not become food delivery. Banking fees retain their own category even when a food app appears in the description.

The common description rule applies to new WhatsApp registrations and automatic bank categories on read. Owner-selected bank categories and explicitly requested WhatsApp categories take precedence. Invoice import recognizes Delivery and preserves bank-charge priority. The category is available in platform forms, filters, charts and recurrence forms. Existing manual records are not rewritten: they do not reliably record whether the old category was inferred or explicitly chosen.

AI queries distinguish “quanto gastei com delivery?” (the category) from “quanto gastei com iFood?” (the merchant). The provider receives a real customer's message first under the existing rollout, and normalization preserves resolved dates, bank/source filters and merchant requests. Tests reproduce missing/wrong provider filters and generic-help misclassification with a fictitious classifier.

When a qualified category question names another establishment and the classifier loses that filter, the assistant asks for clarification instead of returning all Delivery spending. Automatic invoice suggestions contradicted by non-food descriptions do not become food Delivery.

Brand references used for the aliases include [aiqfome](https://aiqfome.com/), [99Food](https://99app.com/99food/), [Keeta](https://www.keeta-global.com/BR/pt-BR), and [Delivery Much documentation](https://developer.deliverymuch.com.br/specs/orientacoes.pdf). These names are examples, not an exhaustive catalog; explicit food-delivery wording covers other establishments. An ambiguous merchant name alone cannot prove what was purchased or whether it was delivered.

Validation uses fictitious bank, invoice and classifier data. Tests cover aliases, food and non-food delivery, explicit choices, income, edits, card refunds, exclusions, duplicate IDs, signed totals, groups, translations and AI query filters. New category and query regressions failed before their production changes; invoice regressions also reproduced banking charges incorrectly treated as food.

Final validation: 1,813 application tests passed (15 skipped), production build and TypeScript passed, lint had no errors and two existing warnings. Independent review approved after resolving the qualified-query and invoice safeguards.
