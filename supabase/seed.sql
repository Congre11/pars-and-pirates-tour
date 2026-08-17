-- ===========================================================================
-- Pars & Pirates Tour — seed data
-- ===========================================================================
-- GENERATED FILE — do not edit by hand.
-- Regenerate with: npm run seed:sql
-- Source of truth: src/lib/seed/tour.ts and src/lib/seed/courses.ts
--
-- Run this AFTER every file in supabase/migrations/, in numbered order.
-- Safe to re-run: it updates the seeded rows in place and never touches
-- the scores table, so you will not lose live scoring by re-seeding.
-- ===========================================================================
begin;
-- Captain references are set after players exist.
set constraints all deferred;
insert into tours (id, name, year, start_date, end_date, location, status, trophy_name, settings) values
  ('215244a1-d717-445b-8ddf-4dbd03d820a3', 'Pars & Pirates Tour', 2026, '2026-08-28', '2026-09-04', 'Belek, Turkey', 'upcoming', 'The Pars & Pirates Trophy', '{"pointsPerWin":1,"pointsPerHalf":0.5,"handicapMode":"difference","handicapsEnabled":true,"lockCompletedHoles":true,"allowances":{"team_scramble":{"weights":[0.2,0.15,0.1,0.05],"rounding":"nearest"},"better_ball":{"weights":[0.9],"rounding":"nearest"},"singles":{"weights":[1],"rounding":"nearest"},"two_man_scramble":{"weights":[0.35,0.15],"rounding":"nearest"},"foursomes":{"weights":[0.5,0.5],"rounding":"nearest"}}}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  year = excluded.year,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  location = excluded.location,
  status = excluded.status,
  trophy_name = excluded.trophy_name,
  settings = excluded.settings
;

insert into teams (id, tour_id, name, short_name, colour, accent, crest, captain_player_id, sort_order) values
  ('3ff5ec82-b3c2-4850-84cb-a7d690c56258', '215244a1-d717-445b-8ddf-4dbd03d820a3', 'The Pars', 'PARS', '#0f7a4d', '#3ddc84', '⛳', '6e3b7aa8-c4f8-44de-8f8f-886476c1e346', 0),
  ('d9b745b4-6f08-49f6-81a3-8ec0f3c866fe', '215244a1-d717-445b-8ddf-4dbd03d820a3', 'Pin High Pirates', 'PIRATES', '#8b1f2f', '#e8574a', '🏴‍☠️', '1a28dd06-c593-4144-812b-a8225ca4191c', 1)
on conflict (id) do update set
  tour_id = excluded.tour_id,
  name = excluded.name,
  short_name = excluded.short_name,
  colour = excluded.colour,
  accent = excluded.accent,
  crest = excluded.crest,
  captain_player_id = excluded.captain_player_id,
  sort_order = excluded.sort_order
;

insert into players (id, tour_id, team_id, name, nickname, initials, is_captain, hna_id, handicap_index, handicap_source, handicap_updated_at, photo_url, sort_order) values
  ('6e3b7aa8-c4f8-44de-8f8f-886476c1e346', '215244a1-d717-445b-8ddf-4dbd03d820a3', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', 'Jason Dunbar', 'Skipper', 'JD', true, null, 11.3, 'manual', '2026-08-17T00:00:00.000Z', null, 0),
  ('3de9536e-bd46-406c-8dec-ce12a2436a44', '215244a1-d717-445b-8ddf-4dbd03d820a3', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', 'Alan Hector', null, 'AH', false, null, 22, 'manual', '2026-08-17T00:00:00.000Z', null, 1),
  ('a9d58c17-2d27-443d-818b-44e3dbd367a5', '215244a1-d717-445b-8ddf-4dbd03d820a3', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', 'Andrew Rushmere', null, 'AR', false, null, 4, 'manual', '2026-08-17T00:00:00.000Z', null, 2),
  ('9339dbe8-cae3-4cee-8e39-cedca5102a86', '215244a1-d717-445b-8ddf-4dbd03d820a3', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', 'Ryan Dahl', null, 'RD', false, null, 8.8, 'manual', '2026-08-17T00:00:00.000Z', null, 3),
  ('1a28dd06-c593-4144-812b-a8225ca4191c', '215244a1-d717-445b-8ddf-4dbd03d820a3', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', 'Jordy West', 'Cap’n', 'JW', true, null, 9.6, 'manual', '2026-08-17T00:00:00.000Z', null, 4),
  ('a5145540-14c1-45b6-8a5f-37941b13fb2e', '215244a1-d717-445b-8ddf-4dbd03d820a3', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', 'Connor Grealy', null, 'CG', false, null, 9.3, 'manual', '2026-08-17T00:00:00.000Z', null, 5),
  ('d0d7d186-4ba3-421c-8dee-da02904fb2b4', '215244a1-d717-445b-8ddf-4dbd03d820a3', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', 'Nick Georgoulakis', null, 'NG', false, null, 15.9, 'manual', '2026-08-17T00:00:00.000Z', null, 6),
  ('2afb1850-1eb2-487a-82dd-a0e4bcd08fb2', '215244a1-d717-445b-8ddf-4dbd03d820a3', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', 'Dan Kramer', null, 'DK', false, null, 15, 'manual', '2026-08-17T00:00:00.000Z', null, 7)
on conflict (id) do update set
  tour_id = excluded.tour_id,
  team_id = excluded.team_id,
  name = excluded.name,
  nickname = excluded.nickname,
  initials = excluded.initials,
  is_captain = excluded.is_captain,
  hna_id = excluded.hna_id,
  handicap_index = excluded.handicap_index,
  handicap_source = excluded.handicap_source,
  handicap_updated_at = excluded.handicap_updated_at,
  photo_url = excluded.photo_url,
  sort_order = excluded.sort_order
;

insert into courses (id, tour_id, name, location, source_url, notes, data_verified, verified_at, verified_by, source_notes) values
  ('b494460c-9465-4986-8c5f-04d89a469d5e', '215244a1-d717-445b-8ddf-4dbd03d820a3', 'Faldo Course', 'Cornelia Golf Club, Belek, Turkey', null, 'Day 1 — 4-man Team Scramble. Tee times 11:00.', false, null, null, null),
  ('b53cfe96-8326-4678-8796-7aa2ac0112c0', '215244a1-d717-445b-8ddf-4dbd03d820a3', 'Carya Golf Course', 'Carya Golf Club, Belek, Turkey', null, 'Day 2 — Better Ball Match Play. Twilight tee time 18:27, floodlit finish.', false, null, null, null),
  ('e17d413e-7ca8-4498-8928-c142e15860f0', '215244a1-d717-445b-8ddf-4dbd03d820a3', 'PGA Sultan', 'Antalya Golf Club, Belek, Turkey', null, 'Day 3 — one course, three six-hole matches: H1-6 Singles, H7-12 Two-man Scramble, H13-18 Alternate Shot.', false, null, null, null),
  ('265c5394-11e7-47d2-8ebd-ac38dc39670a', '215244a1-d717-445b-8ddf-4dbd03d820a3', 'Montgomerie Maxx Royal', 'Montgomerie Maxx Royal, Belek, Turkey', null, 'Day 4 — Singles Match Play. Four concurrent matches. Trophy presented after the round.', false, null, null, null)
on conflict (id) do update set
  tour_id = excluded.tour_id,
  name = excluded.name,
  location = excluded.location,
  source_url = excluded.source_url,
  notes = excluded.notes,
  data_verified = excluded.data_verified,
  verified_at = excluded.verified_at,
  verified_by = excluded.verified_by,
  source_notes = excluded.source_notes
;

insert into tees (id, course_id, name, colour, course_rating, slope_rating, par, yardage, distance_unit) values
  ('44db96c6-e087-43ac-8e02-b372f14543d4', 'b494460c-9465-4986-8c5f-04d89a469d5e', 'White', '#e8e8e8', 72.4, 137, 71, 6825, 'yards'),
  ('8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f', 'b494460c-9465-4986-8c5f-04d89a469d5e', 'Yellow', '#f2c53d', 70.8, 131, 71, 6338, 'yards'),
  ('29f2593c-1b4a-4b22-855f-c1908913156a', 'b494460c-9465-4986-8c5f-04d89a469d5e', 'Red', '#d9414a', 68.2, 124, 71, 5530, 'yards'),
  ('e432b9d4-d0b2-4722-8b88-6800a54f5cda', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 'White', '#e8e8e8', 73.1, 139, 72, 7081, 'yards'),
  ('9f42c02f-b37a-414d-8d6a-d4430318e655', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 'Yellow', '#f2c53d', 71.3, 132, 72, 6565, 'yards'),
  ('74ca1b6a-373a-4da0-8ece-57ee238761d8', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 'Red', '#d9414a', 69, 125, 72, 5702, 'yards'),
  ('ca93d61e-5fd9-4134-8fe6-8c82f603afbc', 'e17d413e-7ca8-4498-8928-c142e15860f0', 'White', '#e8e8e8', 73.6, 141, 71, 7075, 'yards'),
  ('5e59aef1-ffb5-430f-85a2-f92d2e2b2c87', 'e17d413e-7ca8-4498-8928-c142e15860f0', 'Yellow', '#f2c53d', 71.6, 133, 71, 6622, 'yards'),
  ('eda2b8b4-9d58-44ca-8d0f-1c009785b512', 'e17d413e-7ca8-4498-8928-c142e15860f0', 'Red', '#d9414a', 69.4, 126, 71, 5710, 'yards'),
  ('62c36476-68f9-4a48-871e-6e1a65cbd890', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 'White', '#e8e8e8', 73, 138, 72, 7044, 'yards'),
  ('6da36679-2241-4d5b-88fe-e7952820ff33', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 'Yellow', '#f2c53d', 71.1, 130, 72, 6512, 'yards'),
  ('cf378c0c-2473-45d6-8ddf-fc182142009e', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 'Red', '#d9414a', 68.8, 123, 72, 5668, 'yards')
on conflict (id) do update set
  course_id = excluded.course_id,
  name = excluded.name,
  colour = excluded.colour,
  course_rating = excluded.course_rating,
  slope_rating = excluded.slope_rating,
  par = excluded.par,
  yardage = excluded.yardage,
  distance_unit = excluded.distance_unit
;

insert into holes (id, course_id, hole_no, par, stroke_index, yardages) values
  ('abd2d882-bd56-491c-8fa7-d9be84d93784', 'b494460c-9465-4986-8c5f-04d89a469d5e', 1, 4, 7, '{"44db96c6-e087-43ac-8e02-b372f14543d4":401,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":372,"29f2593c-1b4a-4b22-855f-c1908913156a":325}'::jsonb),
  ('aad2d6ef-c056-4dd5-8ea7-d82b87d93c3d', 'b494460c-9465-4986-8c5f-04d89a469d5e', 2, 4, 5, '{"44db96c6-e087-43ac-8e02-b372f14543d4":428,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":398,"29f2593c-1b4a-4b22-855f-c1908913156a":348}'::jsonb),
  ('a9d2d55c-bf56-4c42-8da7-d69886d93aaa', 'b494460c-9465-4986-8c5f-04d89a469d5e', 3, 3, 15, '{"44db96c6-e087-43ac-8e02-b372f14543d4":178,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":162,"29f2593c-1b4a-4b22-855f-c1908913156a":138}'::jsonb),
  ('a8d2d3c9-ba56-4463-84a7-e19d81d932cb', 'b494460c-9465-4986-8c5f-04d89a469d5e', 4, 5, 11, '{"44db96c6-e087-43ac-8e02-b372f14543d4":534,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":498,"29f2593c-1b4a-4b22-855f-c1908913156a":432}'::jsonb),
  ('a7d2d236-b956-42d0-83a7-e00a80d93138', 'b494460c-9465-4986-8c5f-04d89a469d5e', 5, 4, 1, '{"44db96c6-e087-43ac-8e02-b372f14543d4":452,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":418,"29f2593c-1b4a-4b22-855f-c1908913156a":366}'::jsonb),
  ('a6d2d0a3-bc56-4789-82a7-de7783d935f1', 'b494460c-9465-4986-8c5f-04d89a469d5e', 6, 4, 9, '{"44db96c6-e087-43ac-8e02-b372f14543d4":410,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":381,"29f2593c-1b4a-4b22-855f-c1908913156a":334}'::jsonb),
  ('a5d2cf10-bb56-45f6-81a7-dce482d9345e', 'b494460c-9465-4986-8c5f-04d89a469d5e', 7, 3, 17, '{"44db96c6-e087-43ac-8e02-b372f14543d4":165,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":150,"29f2593c-1b4a-4b22-855f-c1908913156a":128}'::jsonb),
  ('b4d2e6ad-c656-4747-88a7-ceb97dd92c7f', 'b494460c-9465-4986-8c5f-04d89a469d5e', 8, 5, 13, '{"44db96c6-e087-43ac-8e02-b372f14543d4":512,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":478,"29f2593c-1b4a-4b22-855f-c1908913156a":418}'::jsonb),
  ('b3d2e51a-c556-45b4-87a7-cd267cd92aec', 'b494460c-9465-4986-8c5f-04d89a469d5e', 9, 4, 3, '{"44db96c6-e087-43ac-8e02-b372f14543d4":421,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":392,"29f2593c-1b4a-4b22-855f-c1908913156a":342}'::jsonb),
  ('2eeb2036-3b07-4044-833b-7a8ad5f2b05c', 'b494460c-9465-4986-8c5f-04d89a469d5e', 10, 4, 8, '{"44db96c6-e087-43ac-8e02-b372f14543d4":396,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":366,"29f2593c-1b4a-4b22-855f-c1908913156a":320}'::jsonb),
  ('2feb21c9-3c07-41d7-843b-7c1dd6f2b1ef', 'b494460c-9465-4986-8c5f-04d89a469d5e', 11, 3, 16, '{"44db96c6-e087-43ac-8e02-b372f14543d4":190,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":172,"29f2593c-1b4a-4b22-855f-c1908913156a":148}'::jsonb),
  ('2ceb1d10-3d07-436a-813b-7764d7f2b382', 'b494460c-9465-4986-8c5f-04d89a469d5e', 12, 4, 4, '{"44db96c6-e087-43ac-8e02-b372f14543d4":447,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":414,"29f2593c-1b4a-4b22-855f-c1908913156a":362}'::jsonb),
  ('2deb1ea3-3e07-44fd-823b-78f7d8f2b515', 'b494460c-9465-4986-8c5f-04d89a469d5e', 13, 5, 12, '{"44db96c6-e087-43ac-8e02-b372f14543d4":528,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":492,"29f2593c-1b4a-4b22-855f-c1908913156a":430}'::jsonb),
  ('32eb2682-3707-49f8-8f3b-743ed1f2aa10', 'b494460c-9465-4986-8c5f-04d89a469d5e', 14, 4, 2, '{"44db96c6-e087-43ac-8e02-b372f14543d4":460,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":428,"29f2593c-1b4a-4b22-855f-c1908913156a":374}'::jsonb),
  ('33eb2815-3807-4b8b-803b-75d1d2f2aba3', 'b494460c-9465-4986-8c5f-04d89a469d5e', 15, 4, 10, '{"44db96c6-e087-43ac-8e02-b372f14543d4":385,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":356,"29f2593c-1b4a-4b22-855f-c1908913156a":312}'::jsonb),
  ('30eb235c-3907-4d1e-8d3b-7118d3f2ad36', 'b494460c-9465-4986-8c5f-04d89a469d5e', 16, 3, 18, '{"44db96c6-e087-43ac-8e02-b372f14543d4":158,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":143,"29f2593c-1b4a-4b22-855f-c1908913156a":122}'::jsonb),
  ('31eb24ef-3a07-4eb1-8e3b-72abd4f2aec9', 'b494460c-9465-4986-8c5f-04d89a469d5e', 17, 4, 6, '{"44db96c6-e087-43ac-8e02-b372f14543d4":416,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":386,"29f2593c-1b4a-4b22-855f-c1908913156a":338}'::jsonb),
  ('36eb2cce-3307-43ac-8b3b-6df2ddf2bcf4', 'b494460c-9465-4986-8c5f-04d89a469d5e', 18, 4, 14, '{"44db96c6-e087-43ac-8e02-b372f14543d4":344,"8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f":332,"29f2593c-1b4a-4b22-855f-c1908913156a":293}'::jsonb),
  ('8632990c-0d9d-401e-8c29-af88cb849716', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 1, 4, 9, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":412,"9f42c02f-b37a-414d-8d6a-d4430318e655":382,"74ca1b6a-373a-4da0-8ece-57ee238761d8":332}'::jsonb),
  ('89329dc5-0c9d-4e8b-8f29-b441ca849583', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 2, 5, 13, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":545,"9f42c02f-b37a-414d-8d6a-d4430318e655":508,"74ca1b6a-373a-4da0-8ece-57ee238761d8":442}'::jsonb),
  ('88329c32-0b9d-4cf8-8e29-b2aec98493f0', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 3, 4, 3, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":448,"9f42c02f-b37a-414d-8d6a-d4430318e655":415,"74ca1b6a-373a-4da0-8ece-57ee238761d8":362}'::jsonb),
  ('83329453-129d-47fd-8129-b767d0849ef5', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 4, 3, 17, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":186,"9f42c02f-b37a-414d-8d6a-d4430318e655":168,"74ca1b6a-373a-4da0-8ece-57ee238761d8":142}'::jsonb),
  ('823292c0-119d-466a-8029-b5d4cf849d62', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 5, 4, 1, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":462,"9f42c02f-b37a-414d-8d6a-d4430318e655":428,"74ca1b6a-373a-4da0-8ece-57ee238761d8":372}'::jsonb),
  ('85329779-109d-44d7-8329-ba8dce849bcf', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 6, 4, 7, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":405,"9f42c02f-b37a-414d-8d6a-d4430318e655":376,"74ca1b6a-373a-4da0-8ece-57ee238761d8":328}'::jsonb),
  ('843295e6-0f9d-4344-8229-b8facd849a3c', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 7, 5, 11, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":528,"9f42c02f-b37a-414d-8d6a-d4430318e655":492,"74ca1b6a-373a-4da0-8ece-57ee238761d8":430}'::jsonb),
  ('8f32a737-069d-4519-8529-a483d484a541', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 8, 3, 15, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":172,"9f42c02f-b37a-414d-8d6a-d4430318e655":158,"74ca1b6a-373a-4da0-8ece-57ee238761d8":134}'::jsonb),
  ('8e32a5a4-059d-4386-8429-a2f0d384a3ae', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 9, 4, 5, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":425,"9f42c02f-b37a-414d-8d6a-d4430318e655":396,"74ca1b6a-373a-4da0-8ece-57ee238761d8":345}'::jsonb),
  ('7da73974-9d6e-486a-8d9f-9ea887b9f0d2', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 10, 4, 6, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":398,"9f42c02f-b37a-414d-8d6a-d4430318e655":368,"74ca1b6a-373a-4da0-8ece-57ee238761d8":320}'::jsonb),
  ('7ea73b07-9e6e-49fd-8e9f-a03b88b9f265', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 11, 4, 2, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":455,"9f42c02f-b37a-414d-8d6a-d4430318e655":421,"74ca1b6a-373a-4da0-8ece-57ee238761d8":366}'::jsonb),
  ('7fa73c9a-9b6e-4544-8f9f-a1ce85b9edac', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 12, 3, 18, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":165,"9f42c02f-b37a-414d-8d6a-d4430318e655":152,"74ca1b6a-373a-4da0-8ece-57ee238761d8":130}'::jsonb),
  ('80a73e2d-9c6e-46d7-809f-a36186b9ef3f', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 13, 5, 14, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":540,"9f42c02f-b37a-414d-8d6a-d4430318e655":502,"74ca1b6a-373a-4da0-8ece-57ee238761d8":438}'::jsonb),
  ('79a73328-996e-421e-819f-a4f483b9ea86', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 14, 4, 4, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":447,"9f42c02f-b37a-414d-8d6a-d4430318e655":414,"74ca1b6a-373a-4da0-8ece-57ee238761d8":360}'::jsonb),
  ('7aa734bb-9a6e-43b1-829f-a68784b9ec19', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 15, 4, 10, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":388,"9f42c02f-b37a-414d-8d6a-d4430318e655":359,"74ca1b6a-373a-4da0-8ece-57ee238761d8":312}'::jsonb),
  ('7ba7364e-976e-4ef8-839f-a81a81b9e760', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 16, 3, 16, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":178,"9f42c02f-b37a-414d-8d6a-d4430318e655":162,"74ca1b6a-373a-4da0-8ece-57ee238761d8":138}'::jsonb),
  ('7ca737e1-986e-408b-849f-a9ad82b9e8f3', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 17, 4, 8, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":420,"9f42c02f-b37a-414d-8d6a-d4430318e655":389,"74ca1b6a-373a-4da0-8ece-57ee238761d8":338}'::jsonb),
  ('75a72cdc-956e-4bd2-859f-92108fb9fd6a', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', 18, 5, 12, '{"e432b9d4-d0b2-4722-8b88-6800a54f5cda":507,"9f42c02f-b37a-414d-8d6a-d4430318e655":475,"74ca1b6a-373a-4da0-8ece-57ee238761d8":413}'::jsonb),
  ('19da6942-11ae-4f14-825c-cbe66da1b29c', 'e17d413e-7ca8-4498-8928-c142e15860f0', 1, 4, 5, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":432,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":398,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":346}'::jsonb),
  ('18da67af-14ae-43cd-815c-ca5370a1b755', 'e17d413e-7ca8-4498-8928-c142e15860f0', 2, 4, 11, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":405,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":374,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":326}'::jsonb),
  ('17da661c-13ae-423a-805c-c8c06fa1b5c2', 'e17d413e-7ca8-4498-8928-c142e15860f0', 3, 5, 15, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":552,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":512,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":448}'::jsonb),
  ('16da6489-0eae-4a5b-875c-d3c56aa1ade3', 'e17d413e-7ca8-4498-8928-c142e15860f0', 4, 3, 17, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":192,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":174,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":148}'::jsonb),
  ('15da62f6-0dae-48c8-865c-d23269a1ac50', 'e17d413e-7ca8-4498-8928-c142e15860f0', 5, 4, 1, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":471,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":436,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":380}'::jsonb),
  ('14da6163-10ae-4d81-855c-d09f6ca1b109', 'e17d413e-7ca8-4498-8928-c142e15860f0', 6, 4, 9, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":418,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":386,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":336}'::jsonb),
  ('13da5fd0-0fae-4bee-845c-cf0c6ba1af76', 'e17d413e-7ca8-4498-8928-c142e15860f0', 7, 4, 7, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":428,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":396,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":344}'::jsonb),
  ('22da776d-0aae-440f-8b5c-da1176a1c0c7', 'e17d413e-7ca8-4498-8928-c142e15860f0', 8, 3, 13, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":176,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":160,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":138}'::jsonb),
  ('21da75da-09ae-427c-8a5c-d87e75a1bf34', 'e17d413e-7ca8-4498-8928-c142e15860f0', 9, 5, 3, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":538,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":498,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":434}'::jsonb),
  ('24d3fe76-f966-45ac-8e14-e1e2418c44c4', 'e17d413e-7ca8-4498-8928-c142e15860f0', 10, 4, 2, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":462,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":428,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":372}'::jsonb),
  ('25d40009-fa66-473f-8f14-e375428c4657', 'e17d413e-7ca8-4498-8928-c142e15860f0', 11, 4, 10, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":411,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":380,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":331}'::jsonb),
  ('22d3fb50-fb66-48d2-8c14-debc438c47ea', 'e17d413e-7ca8-4498-8928-c142e15860f0', 12, 3, 16, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":168,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":154,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":132}'::jsonb),
  ('23d3fce3-fc66-4a65-8d14-e04f448c497d', 'e17d413e-7ca8-4498-8928-c142e15860f0', 13, 4, 8, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":440,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":406,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":354}'::jsonb),
  ('28d404c2-f566-4f60-8a14-db963d8c3e78', 'e17d413e-7ca8-4498-8928-c142e15860f0', 14, 5, 12, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":545,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":505,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":440}'::jsonb),
  ('29d40655-f666-40f3-8b14-dd293e8c400b', 'e17d413e-7ca8-4498-8928-c142e15860f0', 15, 4, 6, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":452,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":418,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":364}'::jsonb),
  ('26d4019c-f766-4286-8814-d8703f8c419e', 'e17d413e-7ca8-4498-8928-c142e15860f0', 16, 3, 18, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":182,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":166,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":142}'::jsonb),
  ('27d4032f-f866-4419-8914-da03408c4331', 'e17d413e-7ca8-4498-8928-c142e15860f0', 17, 4, 4, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":468,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":432,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":376}'::jsonb),
  ('2cd40b0e-0166-4244-8614-ee7a398c382c', 'e17d413e-7ca8-4498-8928-c142e15860f0', 18, 4, 14, '{"ca93d61e-5fd9-4134-8fe6-8c82f603afbc":335,"5e59aef1-ffb5-430f-85a2-f92d2e2b2c87":399,"eda2b8b4-9d58-44ca-8d0f-1c009785b512":299}'::jsonb),
  ('4226421e-f3ac-42ac-8339-6af26b60bdb4', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 1, 4, 7, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":408,"6da36679-2241-4d5b-88fe-e7952820ff33":376,"cf378c0c-2473-45d6-8ddf-fc182142009e":328}'::jsonb),
  ('4126408b-f6ac-4765-8239-695f6e60c26d', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 2, 3, 17, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":182,"6da36679-2241-4d5b-88fe-e7952820ff33":165,"cf378c0c-2473-45d6-8ddf-fc182142009e":140}'::jsonb),
  ('40263ef8-f5ac-45d2-8139-67cc6d60c0da', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 3, 5, 13, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":536,"6da36679-2241-4d5b-88fe-e7952820ff33":496,"cf378c0c-2473-45d6-8ddf-fc182142009e":432}'::jsonb),
  ('472649fd-f0ac-4df3-8039-66396860b8fb', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 4, 4, 3, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":445,"6da36679-2241-4d5b-88fe-e7952820ff33":412,"cf378c0c-2473-45d6-8ddf-fc182142009e":358}'::jsonb),
  ('4626486a-efac-4c60-8f39-64a66760b768', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 5, 4, 9, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":396,"6da36679-2241-4d5b-88fe-e7952820ff33":366,"cf378c0c-2473-45d6-8ddf-fc182142009e":320}'::jsonb),
  ('452646d7-f2ac-4119-8e39-63136a60bc21', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 6, 3, 15, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":168,"6da36679-2241-4d5b-88fe-e7952820ff33":152,"cf378c0c-2473-45d6-8ddf-fc182142009e":130}'::jsonb),
  ('44264544-f1ac-4f86-8d39-61806960ba8e', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 7, 4, 1, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":462,"6da36679-2241-4d5b-88fe-e7952820ff33":428,"cf378c0c-2473-45d6-8ddf-fc182142009e":372}'::jsonb),
  ('3b263719-fcac-40d7-8c39-791d6460b2af', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 8, 5, 11, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":522,"6da36679-2241-4d5b-88fe-e7952820ff33":484,"cf378c0c-2473-45d6-8ddf-fc182142009e":422}'::jsonb),
  ('3a263586-fbac-4f44-8b39-778a6360b11c', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 9, 4, 5, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":421,"6da36679-2241-4d5b-88fe-e7952820ff33":389,"cf378c0c-2473-45d6-8ddf-fc182142009e":338}'::jsonb),
  ('503a2e6a-34c3-4b94-8563-0f668d4a56cc', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 10, 4, 4, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":432,"6da36679-2241-4d5b-88fe-e7952820ff33":398,"cf378c0c-2473-45d6-8ddf-fc182142009e":346}'::jsonb),
  ('513a2ffd-35c3-4d27-8663-10f98e4a585f', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 11, 4, 8, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":402,"6da36679-2241-4d5b-88fe-e7952820ff33":372,"cf378c0c-2473-45d6-8ddf-fc182142009e":324}'::jsonb),
  ('4e3a2b44-36c3-4eba-8363-0c408f4a59f2', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 12, 3, 18, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":158,"6da36679-2241-4d5b-88fe-e7952820ff33":145,"cf378c0c-2473-45d6-8ddf-fc182142009e":124}'::jsonb),
  ('4f3a2cd7-37c4-404d-8463-0dd3904a5b85', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 13, 5, 14, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":548,"6da36679-2241-4d5b-88fe-e7952820ff33":506,"cf378c0c-2473-45d6-8ddf-fc182142009e":440}'::jsonb),
  ('4c3a281e-30c3-4548-8963-15b2894a5080', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 14, 4, 2, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":458,"6da36679-2241-4d5b-88fe-e7952820ff33":424,"cf378c0c-2473-45d6-8ddf-fc182142009e":368}'::jsonb),
  ('4d3a29b1-31c3-46db-8a63-17458a4a5213', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 15, 3, 16, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":176,"6da36679-2241-4d5b-88fe-e7952820ff33":162,"cf378c0c-2473-45d6-8ddf-fc182142009e":138}'::jsonb),
  ('4a3a24f8-32c3-486e-8763-128c8b4a53a6', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 16, 4, 10, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":388,"6da36679-2241-4d5b-88fe-e7952820ff33":358,"cf378c0c-2473-45d6-8ddf-fc182142009e":312}'::jsonb),
  ('4b3a268b-33c3-4a01-8863-141f8c4a5539', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 17, 4, 6, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":425,"6da36679-2241-4d5b-88fe-e7952820ff33":393,"cf378c0c-2473-45d6-8ddf-fc182142009e":342}'::jsonb),
  ('483a21d2-2cc3-4efc-8d63-1bfe954a6364', '265c5394-11e7-47d2-8ebd-ac38dc39670a', 18, 5, 12, '{"62c36476-68f9-4a48-871e-6e1a65cbd890":517,"6da36679-2241-4d5b-88fe-e7952820ff33":486,"cf378c0c-2473-45d6-8ddf-fc182142009e":434}'::jsonb)
on conflict (id) do update set
  course_id = excluded.course_id,
  hole_no = excluded.hole_no,
  par = excluded.par,
  stroke_index = excluded.stroke_index,
  yardages = excluded.yardages
;

insert into rounds (id, tour_id, day_no, name, date, course_id, tee_id, format_label, tee_time, status, notes, sort_order) values
  ('8296c225-7362-4e9f-80a3-53118e5c9757', '215244a1-d717-445b-8ddf-4dbd03d820a3', 1, 'Day 1 — Scramble', '2026-08-29', 'b494460c-9465-4986-8c5f-04d89a469d5e', '8e3c7d29-97ef-4b57-80b1-a2bd3371fe2f', '4-Man Team Scramble', '11:00', 'upcoming', 'Breakfast 08:00–09:30. Springboks v New Zealand at 17:00 — Springbok jerseys are a must. Day 2 teams announced after the rugby.', 0),
  ('7f96bd6c-7462-4032-8da3-4e588f5c98ea', '215244a1-d717-445b-8ddf-4dbd03d820a3', 2, 'Day 2 — Better Ball', '2026-08-30', 'b53cfe96-8326-4678-8796-7aa2ac0112c0', '9f42c02f-b37a-414d-8d6a-d4430318e655', 'Better Ball Match Play', '18:27', 'upcoming', 'Sleep in. Free day. First fines meeting after the round. Out to town — LARGE.', 1),
  ('8096beff-7562-41c5-8ea3-4feb905c9a7d', '215244a1-d717-445b-8ddf-4dbd03d820a3', 3, 'Day 3 — Triple Threat', '2026-09-01', 'e17d413e-7ca8-4498-8928-c142e15860f0', '5e59aef1-ffb5-430f-85a2-f92d2e2b2c87', 'H1–6 Singles · H7–12 Scramble · H13–18 Alt. Shot', '12:00', 'upcoming', 'Breakfast 09:00–11:00. 19:00 captains announce the Day 4 singles line-up. Free evening.', 2),
  ('7d96ba46-6e62-46c0-83a3-57ca895c8f78', '215244a1-d717-445b-8ddf-4dbd03d820a3', 4, 'Day 4 — Singles', '2026-09-02', '265c5394-11e7-47d2-8ebd-ac38dc39670a', '6da36679-2241-4d5b-88fe-e7952820ff33', 'Singles Match Play', '10:30', 'upcoming', 'Breakfast 07:00–09:00. Trophy presentation, closing ceremony and final fines after the round. Out in town.', 3)
on conflict (id) do update set
  tour_id = excluded.tour_id,
  day_no = excluded.day_no,
  name = excluded.name,
  date = excluded.date,
  course_id = excluded.course_id,
  tee_id = excluded.tee_id,
  format_label = excluded.format_label,
  tee_time = excluded.tee_time,
  status = excluded.status,
  notes = excluded.notes,
  sort_order = excluded.sort_order
;

insert into matches (id, round_id, name, format, start_hole, end_hole, points_value, allowance_override, status, sort_order) values
  ('4a1699dc-9017-483e-8503-19a0f5721536', '8296c225-7362-4e9f-80a3-53118e5c9757', 'The Scramble', 'team_scramble', 1, 18, 2, null, 'upcoming', 0),
  ('f6fcf54f-e606-4055-881d-6413c194152d', '7f96bd6c-7462-4032-8da3-4e588f5c98ea', 'Match 1', 'better_ball', 1, 18, 1, null, 'upcoming', 0),
  ('f7fcf6e2-e306-4b9c-891d-65a6be941074', '7f96bd6c-7462-4032-8da3-4e588f5c98ea', 'Match 2', 'better_ball', 1, 18, 1, null, 'upcoming', 1),
  ('c72bcb14-7807-47a6-82d3-b7d0988425ce', '8096beff-7562-41c5-8ea3-4feb905c9a7d', 'Singles 1', 'singles', 1, 6, 0.25, null, 'upcoming', 0),
  ('ca2bcfcd-7707-4613-85d3-bc899784243b', '8096beff-7562-41c5-8ea3-4feb905c9a7d', 'Singles 2', 'singles', 1, 6, 0.25, null, 'upcoming', 1),
  ('c92bce3a-7607-4480-84d3-baf6968422a8', '8096beff-7562-41c5-8ea3-4feb905c9a7d', 'Singles 3', 'singles', 1, 6, 0.25, null, 'upcoming', 2),
  ('c42bc65b-7d07-4f85-87d3-bfaf9d842dad', '8096beff-7562-41c5-8ea3-4feb905c9a7d', 'Singles 4', 'singles', 1, 6, 0.25, null, 'upcoming', 3),
  ('3b6ce621-ffe7-4c53-8f89-5d958b79382b', '8096beff-7562-41c5-8ea3-4feb905c9a7d', 'Scramble 1', 'two_man_scramble', 7, 12, 0.5, null, 'upcoming', 4),
  ('386ce168-00e7-4de6-8c89-58dc8c7939be', '8096beff-7562-41c5-8ea3-4feb905c9a7d', 'Scramble 2', 'two_man_scramble', 7, 12, 0.5, null, 'upcoming', 5),
  ('caf7f5fd-8c37-4557-86b3-83a10cb2a79f', '8096beff-7562-41c5-8ea3-4feb905c9a7d', 'Alternate Shot 1', 'foursomes', 13, 18, 0.5, null, 'upcoming', 6),
  ('c7f7f144-8d37-46ea-83b3-7ee80db2a932', '8096beff-7562-41c5-8ea3-4feb905c9a7d', 'Alternate Shot 2', 'foursomes', 13, 18, 0.5, null, 'upcoming', 7),
  ('6fdc0641-c737-4a2b-8917-c3bd478b7d03', '7d96ba46-6e62-46c0-83a3-57ca895c8f78', 'Match 1', 'singles', 1, 18, 1, null, 'upcoming', 0),
  ('6cdc0188-c837-4bbe-8617-bf04488b7e96', '7d96ba46-6e62-46c0-83a3-57ca895c8f78', 'Match 2', 'singles', 1, 18, 1, null, 'upcoming', 1),
  ('6ddc031b-c937-4d51-8717-c097498b8029', '7d96ba46-6e62-46c0-83a3-57ca895c8f78', 'Match 3', 'singles', 1, 18, 1, null, 'upcoming', 2),
  ('72dc0afa-ca37-4ee4-8417-bbde4a8b81bc', '7d96ba46-6e62-46c0-83a3-57ca895c8f78', 'Match 4', 'singles', 1, 18, 1, null, 'upcoming', 3)
on conflict (id) do update set
  round_id = excluded.round_id,
  name = excluded.name,
  format = excluded.format,
  start_hole = excluded.start_hole,
  end_hole = excluded.end_hole,
  points_value = excluded.points_value,
  allowance_override = excluded.allowance_override,
  status = excluded.status,
  sort_order = excluded.sort_order
;

insert into match_sides (id, match_id, team_id, player_ids, handicap_override, sort_order) values
  ('bf98bd2e-618f-48b0-8acc-7fca9746d8f8', '4a1699dc-9017-483e-8503-19a0f5721536', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', array['6e3b7aa8-c4f8-44de-8f8f-886476c1e346', '3de9536e-bd46-406c-8dec-ce12a2436a44', 'a9d58c17-2d27-443d-818b-44e3dbd367a5', '9339dbe8-cae3-4cee-8e39-cedca5102a86']::uuid[], null, 0),
  ('c098bec1-628f-4a43-8bcc-815d9846da8b', '4a1699dc-9017-483e-8503-19a0f5721536', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', array['1a28dd06-c593-4144-812b-a8225ca4191c', 'a5145540-14c1-45b6-8a5f-37941b13fb2e', 'd0d7d186-4ba3-421c-8dee-da02904fb2b4', '2afb1850-1eb2-487a-82dd-a0e4bcd08fb2']::uuid[], null, 1),
  ('965ac735-9b2f-46d3-8f85-807129c0bb5b', 'f6fcf54f-e606-4055-881d-6413c194152d', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', array['6e3b7aa8-c4f8-44de-8f8f-886476c1e346', '3de9536e-bd46-406c-8dec-ce12a2436a44']::uuid[], null, 0),
  ('955ac5a2-9a2f-4540-8e85-7ede28c0b9c8', 'f6fcf54f-e606-4055-881d-6413c194152d', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', array['1a28dd06-c593-4144-812b-a8225ca4191c', 'a5145540-14c1-45b6-8a5f-37941b13fb2e']::uuid[], null, 1),
  ('f4caeb90-de53-4d82-8e1c-b43cece4c88a', 'f7fcf6e2-e306-4b9c-891d-65a6be941074', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', array['a9d58c17-2d27-443d-818b-44e3dbd367a5', '9339dbe8-cae3-4cee-8e39-cedca5102a86']::uuid[], null, 0),
  ('f5caed23-df53-4f15-8f1c-b5cfede4ca1d', 'f7fcf6e2-e306-4b9c-891d-65a6be941074', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', array['d0d7d186-4ba3-421c-8dee-da02904fb2b4', '2afb1850-1eb2-487a-82dd-a0e4bcd08fb2']::uuid[], null, 1),
  ('69c1e626-dedd-40c0-8ee8-91dafa0e1078', 'c72bcb14-7807-47a6-82d3-b7d0988425ce', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', array['6e3b7aa8-c4f8-44de-8f8f-886476c1e346']::uuid[], null, 0),
  ('6ac1e7b9-dfdd-4253-8fe8-936dfb0e120b', 'c72bcb14-7807-47a6-82d3-b7d0988425ce', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', array['1a28dd06-c593-4144-812b-a8225ca4191c']::uuid[], null, 1),
  ('c69e0b57-006e-45e5-8a86-86ab9b9dec1d', 'ca2bcfcd-7707-4613-85d3-bc899784243b', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', array['3de9536e-bd46-406c-8dec-ce12a2436a44']::uuid[], null, 0),
  ('c59e09c4-ff6e-4452-8986-85189a9dea8a', 'ca2bcfcd-7707-4613-85d3-bc899784243b', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', array['a5145540-14c1-45b6-8a5f-37941b13fb2e']::uuid[], null, 1),
  ('cffcede8-19e0-495e-840d-422c151106b6', 'c92bce3a-7607-4480-84d3-baf6968422a8', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', array['a9d58c17-2d27-443d-818b-44e3dbd367a5']::uuid[], null, 0),
  ('d0fcef7b-1ae0-4af1-850d-43bf16110849', 'c92bce3a-7607-4480-84d3-baf6968422a8', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', array['d0d7d186-4ba3-421c-8dee-da02904fb2b4']::uuid[], null, 1),
  ('b6197091-9a0c-4eb3-80e8-9ddd353bd4eb', 'c42bc65b-7d07-4f85-87d3-bfaf9d842dad', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', array['9339dbe8-cae3-4cee-8e39-cedca5102a86']::uuid[], null, 0),
  ('b5196efe-990c-4d20-8fe8-9c4a343bd358', 'c42bc65b-7d07-4f85-87d3-bfaf9d842dad', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', array['2afb1850-1eb2-487a-82dd-a0e4bcd08fb2']::uuid[], null, 1),
  ('ef215c2b-b02a-46dd-88d1-90076c6e13c5', '3b6ce621-ffe7-4c53-8f89-5d958b79382b', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', array['6e3b7aa8-c4f8-44de-8f8f-886476c1e346', '3de9536e-bd46-406c-8dec-ce12a2436a44']::uuid[], null, 0),
  ('ee215a98-af2a-454a-87d1-8e746b6e1232', '3b6ce621-ffe7-4c53-8f89-5d958b79382b', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', array['1a28dd06-c593-4144-812b-a8225ca4191c', 'a5145540-14c1-45b6-8a5f-37941b13fb2e']::uuid[], null, 1),
  ('3383675a-0e9a-4b38-8bf5-6ad6cc1b6ca0', '386ce168-00e7-4de6-8c89-58dc8c7939be', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', array['a9d58c17-2d27-443d-818b-44e3dbd367a5', '9339dbe8-cae3-4cee-8e39-cedca5102a86']::uuid[], null, 0),
  ('348368ed-0f9a-4ccb-8cf5-6c69cd1b6e33', '386ce168-00e7-4de6-8c89-58dc8c7939be', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', array['d0d7d186-4ba3-421c-8dee-da02904fb2b4', '2afb1850-1eb2-487a-82dd-a0e4bcd08fb2']::uuid[], null, 1),
  ('3db55967-955c-4521-88bd-5fb3201dc259', 'caf7f5fd-8c37-4557-86b3-83a10cb2a79f', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', array['6e3b7aa8-c4f8-44de-8f8f-886476c1e346', '3de9536e-bd46-406c-8dec-ce12a2436a44']::uuid[], null, 0),
  ('3cb557d4-945c-438e-87bd-5e201f1dc0c6', 'caf7f5fd-8c37-4557-86b3-83a10cb2a79f', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', array['1a28dd06-c593-4144-812b-a8225ca4191c', 'a5145540-14c1-45b6-8a5f-37941b13fb2e']::uuid[], null, 1),
  ('60d9fdb6-f3f3-48ec-8be1-6ce29ff25d04', 'c7f7f144-8d37-46ea-83b3-7ee80db2a932', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', array['a9d58c17-2d27-443d-818b-44e3dbd367a5', '9339dbe8-cae3-4cee-8e39-cedca5102a86']::uuid[], null, 0),
  ('61d9ff49-f4f3-4a7f-8ce1-6e75a0f25e97', 'c7f7f144-8d37-46ea-83b3-7ee80db2a932', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', array['d0d7d186-4ba3-421c-8dee-da02904fb2b4', '2afb1850-1eb2-487a-82dd-a0e4bcd08fb2']::uuid[], null, 1),
  ('ee835f4b-8c23-4edd-8367-43ff3de5bb05', '6fdc0641-c737-4a2b-8917-c3bd478b7d03', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', array['6e3b7aa8-c4f8-44de-8f8f-886476c1e346']::uuid[], null, 0),
  ('ed835db8-8b23-4d4a-8267-426c3ce5b972', '6fdc0641-c737-4a2b-8917-c3bd478b7d03', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', array['1a28dd06-c593-4144-812b-a8225ca4191c']::uuid[], null, 1),
  ('b1a76c7a-ea93-4338-868b-512e9d9313e0', '6cdc0188-c837-4bbe-8617-bf04488b7e96', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', array['3de9536e-bd46-406c-8dec-ce12a2436a44']::uuid[], null, 0),
  ('b2a76e0d-eb93-44cb-878b-52c19e931573', '6cdc0188-c837-4bbe-8617-bf04488b7e96', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', array['a5145540-14c1-45b6-8a5f-37941b13fb2e']::uuid[], null, 1),
  ('9834e901-e271-4527-8d18-cdb59434314f', '6ddc031b-c937-4d51-8717-c097498b8029', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', array['a9d58c17-2d27-443d-818b-44e3dbd367a5']::uuid[], null, 0),
  ('9734e76e-e171-4394-8c18-cc2293342fbc', '6ddc031b-c937-4d51-8717-c097498b8029', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', array['d0d7d186-4ba3-421c-8dee-da02904fb2b4']::uuid[], null, 1),
  ('3354d158-6a23-42da-803c-dae41be5af02', '72dc0afa-ca37-4ee4-8417-bbde4a8b81bc', '3ff5ec82-b3c2-4850-84cb-a7d690c56258', array['9339dbe8-cae3-4cee-8e39-cedca5102a86']::uuid[], null, 0),
  ('3454d2eb-6b23-446d-813c-dc771ce5b095', '72dc0afa-ca37-4ee4-8417-bbde4a8b81bc', 'd9b745b4-6f08-49f6-81a3-8ec0f3c866fe', array['2afb1850-1eb2-487a-82dd-a0e4bcd08fb2']::uuid[], null, 1)
on conflict (id) do update set
  match_id = excluded.match_id,
  team_id = excluded.team_id,
  player_ids = excluded.player_ids,
  handicap_override = excluded.handicap_override,
  sort_order = excluded.sort_order
;

insert into itinerary_items (id, tour_id, date, start_time, end_time, title, location, details, category, round_id, sort_order) values
  ('4a60f900-5b8b-4c7e-80d6-393423968de6', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-28', '08:15', null, 'Flight from Gatwick', 'London Gatwick (LGW)', 'Be at the airport in good time. Boarding passes on phones.', 'travel', null, 0),
  ('434ac980-3208-48ba-89a9-75fc1650e7f2', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-28', '14:35', null, 'Land in Turkey — transfer to hotel', 'Antalya (AYT)', 'Land 14:35, then transfer to the hotel. Check-in opens 14:00.', 'travel', null, 1),
  ('5d5ad1bd-3362-4c5f-8c29-70e124a5bc47', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-28', '15:30', null, 'Drop bags and lunch', 'Hotel', 'Drop stuff in rooms, then lunch.', 'meal', null, 2),
  ('486fb2f0-9158-45ca-895e-e9ec04ac43f2', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-28', '17:00', null, 'Driving range / practice', 'Practice facility', 'Loosen up after the flight. Shake off the travel.', 'golf', null, 3),
  ('1a76c400-39c9-4f1e-8354-603ca6af2c16', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-28', '20:00', null, 'Opening ceremony & first dinner', 'Hotel', 'At the hotel due to late arrivals. Team reveal, captains’ speeches. Staying at the hotel tonight.', 'ceremony', null, 4),
  ('9aa58ec6-b445-400c-89bb-8ce2b8b5fdd4', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-29', '08:00', '09:30', 'Breakfast', 'Hotel', null, 'meal', null, 5),
  ('345dc9b3-2189-4739-82eb-ce8f3b93db71', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-29', '11:00', null, 'GOLF DAY 1 — Faldo Course', 'Cornelia Golf Club, Belek', '4-Man Team Scramble. Tee off 11:00.', 'golf', '8296c225-7362-4e9f-80a3-53118e5c9757', 6),
  ('64e54974-f435-4d6e-898b-6848245a16d6', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-29', '17:00', null, 'Springboks v New Zealand', 'Hotel bar', 'Springbok jerseys are a must. Non-negotiable.', 'sport', null, 7),
  ('7a67dba4-6744-45a2-82c9-db20cda7565a', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-29', '19:30', null, 'Day 2 teams announced', 'Hotel', 'Captains announce the Better Ball pairings after the rugby.', 'ceremony', null, 8),
  ('f0e4c8ed-c8cc-47f3-8876-a7692f0a425b', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-30', null, null, 'Sleep in — free morning', null, 'No alarms. Free day until the late tee time.', 'rest', null, 9),
  ('b40428b2-8846-4f0c-834d-1606714cc674', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-30', '18:27', null, 'GOLF DAY 2 — Carya Golf Course', 'Carya Golf Club, Belek', 'Better Ball Match Play. Tee off 18:27.', 'golf', '7f96bd6c-7462-4032-8da3-4e588f5c98ea', 10),
  ('6a4ec12b-5723-4455-8578-c8c75d5a70dd', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-30', '22:00', null, 'First fines meeting', 'Clubhouse', 'Bring your evidence. No mercy.', 'social', null, 11),
  ('f0f8ab31-7e57-4517-82b6-003d7819e72f', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-30', '23:00', null, 'Out to town — LARGE', 'Belek', 'Self-explanatory.', 'social', null, 12),
  ('0b8aafaf-0b0b-4e65-83e1-941b4e7bd4cd', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-31', null, null, 'Rest / free day', null, 'Recovery. Pool, beach, spa, whatever is required.', 'rest', null, 13),
  ('72957c6e-e096-4fc8-8aad-c39a2d1c3da0', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-31', '16:00', '18:00', 'Padel', 'Padel courts', 'Two hours booked.', 'sport', null, 14),
  ('14961037-54d6-45a5-8d9b-85cb654edc7d', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-31', '19:00', null, 'Captain tee announcement', 'Hotel', 'Captains reveal the Day 3 line-ups.', 'ceremony', null, 15),
  ('7c30c6e0-3277-45a6-8cf0-6a348280365e', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-08-31', '20:30', null, 'Nice late lunch / dinner', 'TBC', 'Somewhere decent.', 'meal', null, 16),
  ('543d36b9-da04-497b-8f4e-ebc5fb8b8e33', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-09-01', '09:00', '11:00', 'Breakfast', 'Hotel', null, 'meal', null, 17),
  ('61481aa6-ec9e-4498-8319-8262d74b0070', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-09-01', '12:00', null, 'GOLF DAY 3 — PGA Sultan', 'Antalya Golf Club, Belek', 'H1–6 Singles • H7–12 Two-man Scramble • H13–18 Alternate Shot. Tee off 12:00.', 'golf', '8096beff-7562-41c5-8ea3-4feb905c9a7d', 18),
  ('d4a3e1bb-ac32-4601-82b4-b0cfeceb0669', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-09-01', '19:00', null, 'Captains announce Day 4 singles', 'Hotel', 'The big one. Singles order revealed.', 'ceremony', null, 19),
  ('9813bbca-1b04-433c-82b5-ca3ee49ef4c4', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-09-01', '20:00', null, 'Free evening', null, 'Rest up before the final day.', 'rest', null, 20),
  ('6a117cf0-62b2-49a6-81c9-6bbc2809f0be', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-09-02', '07:00', '09:00', 'Breakfast', 'Hotel', null, 'meal', null, 21),
  ('ec184adf-73ae-4d35-82ba-2edb8fc25e3d', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-09-02', '10:30', null, 'GOLF DAY 4 — Montgomerie', 'Montgomerie Maxx Royal, Belek', 'Singles Match Play. Four matches. Tee off 10:30.', 'golf', '7d96ba46-6e62-46c0-83a3-57ca895c8f78', 22),
  ('780b1783-82ca-4c01-80b8-c48fdfc650b9', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-09-02', '17:00', null, 'Trophy presentation', 'Clubhouse', 'Awarding of the trophy.', 'ceremony', null, 23),
  ('1cef4fc9-0cf4-4dab-86c4-4025f16e7393', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-09-02', '19:00', null, 'Closing ceremony & final fines', 'Hotel', 'Last chance to settle up.', 'ceremony', null, 24),
  ('60dd3804-cb38-48da-88cf-11e8a69dc192', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-09-02', '21:30', null, 'Out in town', 'Belek', 'Winners buy. Losers buy more.', 'social', null, 25),
  ('c20bef09-8dd1-4497-8ca5-3fedcebfcbaf', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-09-03', null, null, 'Free day / detox', null, 'Damage assessment.', 'rest', null, 26),
  ('a18a7028-10d1-4bea-8acc-93a46dcfc032', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-09-03', '15:00', null, 'Beach late lunch or dinner', 'Beach', 'Whole group.', 'meal', null, 27),
  ('1bbb6cdc-f964-46aa-8ad5-4d40fed49792', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-09-03', '20:00', null, 'Free evening', null, null, 'rest', null, 28),
  ('16e11023-f13c-4051-8c25-26cf1350ec89', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-09-04', '10:00', null, 'Check out', 'Hotel', 'Bags down by 10:00.', 'travel', null, 29),
  ('2f3b8efa-1077-4f9c-84ac-dcce2f960874', '215244a1-d717-445b-8ddf-4dbd03d820a3', '2026-09-04', '11:00', null, 'Beach day or head to Antalya', 'Belek / Antalya', 'Kill time until the flight.', 'travel', null, 30)
on conflict (id) do update set
  tour_id = excluded.tour_id,
  date = excluded.date,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  title = excluded.title,
  location = excluded.location,
  details = excluded.details,
  category = excluded.category,
  round_id = excluded.round_id,
  sort_order = excluded.sort_order
;

commit;
-- Sanity check — should report 2 teams, 8 players, 4 courses, 72 holes,
-- 4 rounds and 15 matches (worth 11 points in total).
select 'teams' as entity, count(*) from teams
union all select 'players', count(*) from players
union all select 'courses', count(*) from courses
union all select 'holes', count(*) from holes
union all select 'rounds', count(*) from rounds
union all select 'matches', count(*) from matches
union all select 'itinerary', count(*) from itinerary_items;