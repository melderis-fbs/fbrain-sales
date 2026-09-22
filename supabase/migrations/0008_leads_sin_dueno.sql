-- ── Los leads que quedaron sin dueño ───────────────────────────────────────
--
-- Hasta ahora, un closer que cargaba un lead y no se elegía a sí mismo en la
-- lista lo dejaba sin closer asignado. El lead se guardaba bien, pero un closer
-- sólo ve lo que tiene asignado: desaparecía de su lista y su ficha le
-- contestaba «no encontrado». Del otro lado eso se lee como «no puedo crear
-- leads», así que se volvía a intentar, y quedaban duplicados invisibles.
--
-- El alta ya no lo permite. Esto recupera los que quedaron: se los devuelve a
-- quien los cargó, que es un dato que siempre estuvo guardado (`creado_por`).
--
-- Sólo toca leads SIN asignar cargados por alguien que es closer o setter.
-- Un lead que dirección dejó sin asignar a propósito no se toca: dirección ve
-- la operación entera y no perdió nada.

update leads l
   set closer_id = c.id,
       closer_inicial_id = coalesce(l.closer_inicial_id, c.id)
  from usuarios u
  join closers c on c.usuario_id = u.id
 where l.creado_por = u.id
   and u.rol = 'closer'
   and l.closer_id is null
   and l.borrado_en is null;

update leads l
   set setter_id = s.id
  from usuarios u
  join setters s on s.usuario_id = u.id
 where l.creado_por = u.id
   and u.rol = 'setter'
   and l.setter_id is null
   and l.borrado_en is null;
