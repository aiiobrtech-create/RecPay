/**
 * Adaptadores: validação de assinatura webhook + map para CanonicalEvent.
 * Subpastas: hotmart/, kiwify/, hubla/
 */
export { sendEvolutionMessage, type SendEvolutionMessageInput, type SendEvolutionMessageResult } from "./evolution.js";
export { verifyHotmartWebhook, parseHotmartToCanonical } from "./hotmart.js";
export { verifyKiwifyWebhook, parseKiwifyToCanonical, looksLikeKiwifyPayload } from "./kiwify.js";
export { verifyHublaWebhook, parseHublaToCanonical } from "./hubla.js";
