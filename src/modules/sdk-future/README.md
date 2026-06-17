/**
 * Phase 5 — Backlog técnico / SDK futuro.
 *
 * Aquí van las interfaces para cuando Affine libere un SDK oficial que permita
 * manipular bloques desde el backend.
 *
 * Ver docs/api-map.md para contexto sobre por qué la creación de páginas
 * requiere Socket.IO + Yjs en vez de GraphQL.
 */

export {};

/**
 * Placeholder: cuando @affine/server o un SDK equivalente esté disponible,
 * implementar aquí un AffineBlockService que:
 *
 * - Crea un doc vacío via Socket.IO (space:push-doc-update con Yjs update mínimo)
 * - Abre/edita contenido via Socket.IO (space:push-doc-update con actualizaciones Yjs)
 * - Lee contenido parseado desde el binario Yjs (usando @blocksuite/backend o similar)
 *
 * Hasta entonces, POST /api/v1/pages/create devuelve 501 Not Implemented.
 */
