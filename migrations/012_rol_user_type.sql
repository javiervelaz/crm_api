-- migrations/012_rol_user_type.sql
--
-- El tipo de usuario se deriva de los roles (bug CP-05 de la etapa 3).
--
-- Antes el admin elegía "tipo de usuario" en el alta y después, aparte, los
-- roles. Las dos cosas se pisaban y el tipo podía contradecir al rol: un
-- usuario con rol profesor y tipo Empleado quedaba como staff, sin las
-- restricciones de usuario externo (middleware/cuentaGuards.js).
--
-- · rol.user_type_id: cada rol sabe qué tipo de usuario representa. Los roles
--   que crea el alta salen de user_type, así que se completa por descripción.
--   Los roles creados a mano quedan en NULL y cuentan como staff (EMP).
-- · user.user_type_id pasa a ser un dato derivado: lo recalcula la API cada
--   vez que cambian los roles del usuario (model/users/tipo.js). Acá se
--   recalcula una vez para los usuarios que ya tienen roles.
--   Prioridad: ADMIN > EMP (y roles sin tipo) > PROV > CLI > PROF > TUT > ALU.
--   Un dueño que además da clases (admin + profesor) sigue siendo staff.
-- · Los usuarios sin roles (clientes de pedidos, tipo CLI) no se tocan.
--
-- Idempotente.

BEGIN;

ALTER TABLE rol ADD COLUMN IF NOT EXISTS user_type_id INTEGER REFERENCES user_type(id);
CREATE INDEX IF NOT EXISTS rol_cliente_user_type_idx ON rol (cliente_id, user_type_id);

UPDATE rol r
   SET user_type_id = ut.id
  FROM user_type ut
 WHERE r.user_type_id IS NULL
   AND lower(trim(r.descripcion)) = lower(ut.descripcion);

WITH derivado AS (
  SELECT DISTINCT ON (ur.id_user)
         ur.id_user,
         ut.id AS user_type_id
    FROM user_rol ur
    JOIN rol r        ON r.id = ur.id_rol AND r.cliente_id = ur.cliente_id
    JOIN user_type ut ON ut.id = COALESCE(r.user_type_id, (SELECT id FROM user_type WHERE codigo = 'EMP' ORDER BY id LIMIT 1))
   ORDER BY ur.id_user,
            CASE ut.codigo
              WHEN 'ADMIN' THEN 1 WHEN 'EMP' THEN 2 WHEN 'PROV' THEN 3 WHEN 'CLI' THEN 4
              WHEN 'PROF' THEN 5 WHEN 'TUT' THEN 6 WHEN 'ALU' THEN 7 ELSE 2
            END
)
UPDATE "user" u
   SET user_type_id = d.user_type_id,
       updated_at = CURRENT_TIMESTAMP
  FROM derivado d
 WHERE u.id = d.id_user
   AND u.user_type_id IS DISTINCT FROM d.user_type_id;

COMMIT;
