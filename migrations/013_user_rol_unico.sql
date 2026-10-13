-- migrations/013_user_rol_unico.sql
--
-- Bug CP-10: la pantalla de edición de usuario no recibía el id de cada
-- user_rol, así que en cada guardado volvía a insertar todos los roles
-- tildados. Quedaron filas repetidas (mismo usuario, mismo rol).
--
-- · Borra los repetidos y conserva el de menor id.
-- · Índice único para que no vuelva a pasar.
--
-- Idempotente.

BEGIN;

DELETE FROM user_rol ur
 USING user_rol dup
 WHERE ur.id_user = dup.id_user
   AND ur.id_rol = dup.id_rol
   AND ur.cliente_id = dup.cliente_id
   AND ur.id > dup.id;

CREATE UNIQUE INDEX IF NOT EXISTS user_rol_user_rol_cliente_uq
  ON user_rol (id_user, id_rol, cliente_id);

COMMIT;
