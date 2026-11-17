-- =============================================================================
-- MoneyMaker · datos de ejemplo (agosto a octubre de 2026, en COP)
-- =============================================================================
-- Se cargan después de esquema.sql. Imitan lo que deja "Explorar con datos de
-- ejemplo": quincenas, arriendo, servicios, gastos diarios, dos alertas bancarias
-- pendientes, metas con su historial de aportes, insignias ganadas y algunas
-- correcciones de categoría.
--
-- La app genera ids UUID; aquí son legibles para revisarlos fácilmente.
-- created_at se calcula desde la fecha y una hora local de Colombia (UTC-5).
-- La tabla auth queda vacía: la contraseña se crea en la app (PBKDF2).
-- =============================================================================

WITH t (id, type, amount, date, hour, merchant, description, category, source, status, dedupe_key) AS (VALUES
    -- Agosto
    ('tx-0801', 'income',  1750000, '2026-08-01', '08:05', 'Empresa',            'Quincena',            'salary',        'sms',          'confirmed', 'fp-3b1e9a0c41d2'),
    ('tx-0802', 'expense', 1200000, '2026-08-05', '09:00', NULL,                 'Arriendo',            'housing',       'manual',       'confirmed', NULL),
    ('tx-0803', 'expense',  185000, '2026-08-08', '18:20', 'EPM',                'Servicios públicos',  'utilities',     'receipt',      'confirmed', NULL),
    ('tx-0804', 'expense',   38900, '2026-08-08', '06:10', 'Netflix',            'Netflix',             'subscriptions', 'notification', 'confirmed', 'fp-7c22d5e810aa'),
    ('tx-0805', 'expense',   16900, '2026-08-08', '06:12', 'Spotify',            'Spotify',             'subscriptions', 'notification', 'confirmed', 'fp-91f04b6e2c37'),
    ('tx-0806', 'expense',   42000, '2026-08-10', '13:15', 'Crepes & Waffles',   'Almuerzo',            'food',          'ai',           'confirmed', NULL),
    ('tx-0807', 'expense',  186000, '2026-08-13', '17:40', 'Éxito',              'Mercado',             'groceries',     'receipt',      'confirmed', NULL),
    ('tx-0808', 'expense',  120000, '2026-08-14', '07:50', 'Terpel',             'Gasolina',            'transport',     'voice',        'confirmed', NULL),
    ('tx-0809', 'income',  1750000, '2026-08-15', '08:02', 'Empresa',            'Quincena',            'salary',        'sms',          'confirmed', 'fp-0d8a6f3b9e15'),
    ('tx-0810', 'income',   650000, '2026-08-20', '11:30', 'Cliente',            'Proyecto diseño',     'freelance',     'manual',       'confirmed', NULL),
    ('tx-0811', 'expense',   48000, '2026-08-22', '20:10', 'Cine Colombia',      'Cine',                'entertainment', 'ai',           'confirmed', NULL),
    ('tx-0812', 'expense',   72000, '2026-08-27', '19:00', 'D1',                 'Mercado',             'groceries',     'manual',       'confirmed', NULL),
    ('tx-0813', 'expense',   22400, '2026-08-29', '23:05', 'Uber',               'Uber',                'transport',     'notification', 'confirmed', 'fp-c4e7a1902b58'),
    ('tx-0814', 'expense',  329000, '2026-08-30', '16:45', 'Adidas',             'Tenis',               'shopping',      'receipt',      'confirmed', NULL),
    -- Septiembre
    ('tx-0901', 'income',  1750000, '2026-09-01', '08:04', 'Empresa',            'Quincena',            'salary',        'sms',          'confirmed', 'fp-5a9d0e7c3f21'),
    ('tx-0902', 'expense', 1200000, '2026-09-05', '09:10', NULL,                 'Arriendo',            'housing',       'manual',       'confirmed', NULL),
    ('tx-0903', 'expense',  179500, '2026-09-08', '18:05', 'EPM',                'Servicios públicos',  'utilities',     'receipt',      'confirmed', NULL),
    ('tx-0904', 'expense',   38900, '2026-09-08', '06:10', 'Netflix',            'Netflix',             'subscriptions', 'notification', 'confirmed', 'fp-e21b8c4d7a06'),
    ('tx-0905', 'expense',   16900, '2026-09-08', '06:11', 'Spotify',            'Spotify',             'subscriptions', 'notification', 'confirmed', 'fp-48f3a9b1d6c2'),
    ('tx-0906', 'expense',    9800, '2026-09-09', '08:30', 'Juan Valdez',        'Café',                'food',          'voice',        'confirmed', NULL),
    ('tx-0907', 'expense',  201000, '2026-09-10', '17:20', 'Éxito',              'Mercado',             'groceries',     'receipt',      'confirmed', NULL),
    ('tx-0908', 'expense',   38500, '2026-09-12', '21:15', 'Rappi',              'Domicilio',           'food',          'sms',          'confirmed', 'fp-b70e2d5f9a43'),
    ('tx-0909', 'expense',   64000, '2026-09-14', '10:40', 'Farmatodo',          'Medicamentos',        'health',        'ai',           'confirmed', NULL),
    ('tx-0910', 'income',  1750000, '2026-09-15', '08:01', 'Empresa',            'Quincena',            'salary',        'sms',          'confirmed', 'fp-19c6f8e0b2d7'),
    ('tx-0911', 'expense',   16500, '2026-09-18', '22:30', 'DiDi',               'Taxi',                'transport',     'ai',           'confirmed', NULL),
    ('tx-0912', 'expense',  250000, '2026-09-20', '12:00', NULL,                 'Curso de inglés',     'education',     'manual',       'confirmed', NULL),
    ('tx-0913', 'expense',   96000, '2026-09-26', '21:40', 'Andrés Carne de Res','Cena',                'food',          'voice',        'confirmed', NULL),
    ('tx-0914', 'expense',   68000, '2026-09-28', '18:50', 'D1',                 'Mercado',             'groceries',     'manual',       'confirmed', NULL),
    -- Octubre (mes en curso)
    ('tx-1001', 'income',  1750000, '2026-10-01', '08:03', 'Empresa',            'Quincena',            'salary',        'sms',          'confirmed', 'fp-6e4a1c9d0f38'),
    ('tx-1002', 'expense', 1200000, '2026-10-05', '09:05', NULL,                 'Arriendo',            'housing',       'manual',       'confirmed', NULL),
    ('tx-1003', 'expense',  191200, '2026-10-08', '18:30', 'EPM',                'Servicios públicos',  'utilities',     'receipt',      'confirmed', NULL),
    ('tx-1004', 'expense',   38900, '2026-10-08', '06:10', 'Netflix',            'Netflix',             'subscriptions', 'notification', 'confirmed', 'fp-a8d27b3e5c90'),
    ('tx-1005', 'expense',   16900, '2026-10-08', '06:12', 'Spotify',            'Spotify',             'subscriptions', 'notification', 'confirmed', 'fp-2f9c0e6b4a71'),
    ('tx-1006', 'expense',   45500, '2026-10-09', '13:20', 'Crepes & Waffles',   'Almuerzo',            'food',          'ai',           'confirmed', NULL),
    ('tx-1007', 'expense',  118000, '2026-10-11', '07:45', 'Terpel',             'Gasolina',            'transport',     'voice',        'confirmed', NULL),
    ('tx-1008', 'expense',  194000, '2026-10-13', '17:10', 'Éxito',              'Mercado',             'groceries',     'receipt',      'confirmed', NULL),
    ('tx-1009', 'income',  1750000, '2026-10-15', '08:02', 'Empresa',            'Quincena',            'salary',        'sms',          'confirmed', 'fp-d03e7f1a8b64'),
    ('tx-1010', 'income',   700000, '2026-10-17', '15:00', 'Cliente',            'Proyecto diseño',     'freelance',     'manual',       'confirmed', NULL),
    ('tx-1011', 'expense',  180000, '2026-10-18', '19:30', NULL,                 'Concierto',           'entertainment', 'ai',           'confirmed', NULL),
    ('tx-1012', 'expense',    7500, '2026-10-20', '16:15', NULL,                 'Empanadas',           'food',          'voice',        'confirmed', NULL),
    ('tx-1013', 'expense',  420000, '2026-10-21', '11:05', 'Avianca',            'Tiquetes a Cartagena','travel',        'ai',           'confirmed', NULL),
    ('tx-1014', 'expense',  300000, '2026-10-22', '09:30', NULL,                 'Paso a ahorros',      'transfer',      'manual',       'confirmed', NULL),
    ('tx-1015', 'expense',   41200, '2026-10-24', '21:00', 'Rappi',              'Domicilio',           'food',          'sms',          'confirmed', 'fp-71b5c8e2d09f'),
    ('tx-1016', 'expense',    3200, '2026-10-25', '07:20', NULL,                 'TransMilenio',        'transport',     'manual',       'confirmed', NULL),
    -- Alertas bancarias pendientes de confirmar
    ('tx-p001', 'expense',   98000, '2026-10-25', '18:40', 'Terpel',             'Terpel',              'transport',     'notification', 'pending',   'fp-4c0a9e3d7b12'),
    ('tx-p002', 'expense',   45900, '2026-10-26', '12:55', 'Rappi',              'Rappi',               'food',          'sms',          'pending',   'fp-e8f6d2a0c5b3')
)
INSERT INTO transactions (id, type, amount, currency, date, merchant, description, category, source, status, dedupe_key, created_at, updated_at)
SELECT id, type, amount, 'COP', date, merchant, description, category, source, status, dedupe_key,
       (CAST(strftime('%s', date || ' ' || hour) AS INTEGER) + 5 * 3600) * 1000,
       (CAST(strftime('%s', date || ' ' || hour) AS INTEGER) + 5 * 3600) * 1000
FROM t;


-- Las metas empiezan en 0: su ahorro es la suma del historial de aportes (lo calculan los triggers).
INSERT INTO goals (id, name, emoji, target, deadline, created_at) VALUES
    ('goal-01', 'Fondo de emergencia', '🛟',  6000000, NULL,         1785592800000),  -- 2026-08-01 09:00
    ('goal-02', 'Viaje a Cartagena',   '🏖️', 2500000, '2026-12-15', 1787324400000),  -- 2026-08-21 10:00
    ('goal-03', 'Portátil nuevo',      '💻',  3800000, NULL,         1789401600000);  -- 2026-09-14 11:00

-- Historial: fondo 2.350.000, viaje 1.900.000 y portátil 800.000.
WITH c (id, goal_id, kind, amount, date, hour) AS (VALUES
    ('ap-0101', 'goal-01', 'initial',      1500000, '2026-08-01', '09:00'),
    ('ap-0102', 'goal-01', 'contribution',  250000, '2026-08-16', '10:30'),
    ('ap-0103', 'goal-01', 'contribution',  250000, '2026-09-02', '10:30'),
    ('ap-0104', 'goal-01', 'adjustment',    -50000, '2026-09-20', '19:15'),  -- corrección a mano
    ('ap-0105', 'goal-01', 'contribution',  400000, '2026-10-02', '10:30'),
    ('ap-0201', 'goal-02', 'initial',      1000000, '2026-08-21', '10:00'),
    ('ap-0202', 'goal-02', 'contribution',  500000, '2026-09-16', '12:00'),
    ('ap-0203', 'goal-02', 'contribution',  400000, '2026-10-16', '12:00'),
    ('ap-0301', 'goal-03', 'initial',       300000, '2026-09-14', '11:00'),
    ('ap-0302', 'goal-03', 'contribution',  250000, '2026-10-01', '09:45'),
    ('ap-0303', 'goal-03', 'contribution',  250000, '2026-10-15', '09:45')
)
INSERT INTO goal_contributions (id, goal_id, kind, amount, created_at)
SELECT id, goal_id, kind, amount, (CAST(strftime('%s', date || ' ' || hour) AS INTEGER) + 5 * 3600) * 1000
FROM c;

-- Insignias ganadas: siguen desbloqueadas aunque el progreso baje después.
WITH u (badge_id, date, hour) AS (VALUES
    ('first-step',     '2026-08-01', '08:05'),
    ('autopilot',      '2026-08-08', '06:10'),
    ('green-month',    '2026-09-01', '08:04'),
    ('receipt-hunter', '2026-09-10', '17:20'),
    ('ai-scribe',      '2026-10-11', '07:45')
)
INSERT INTO badge_unlocks (badge_id, unlocked_at)
SELECT badge_id, (CAST(strftime('%s', date || ' ' || hour) AS INTEGER) + 5 * 3600) * 1000
FROM u;


-- reduceEffects y shareFeedback no se guardan: v_settings muestra su valor por defecto.
INSERT INTO settings (key, value) VALUES
    ('currency',                 'COP'),
    ('budget',                   '5500000'),
    ('onboarded',                'true'),
    ('secureScreen',             'true'),
    ('lockDelay',                '60000'),
    ('automation.sms',           'true'),
    ('automation.notifications', 'true');


INSERT INTO category_feedback
    (id, created_at, day, transaction_id, capture, model, merchant, description, suggested_category, final_category, confidence, shared)
VALUES
    -- Corrección de un movimiento que luego se borró: transaction_id queda en NULL.
    ('fb-01', 1787080800000, '2026-08-18', NULL,      'voice', 'learned', 'Fruver',    'Fruta y verdura',      'food',     'groceries',     NULL, 1),
    ('fb-02', 1789400700000, '2026-09-14', 'tx-0909', 'ai',    'claude',  'Farmatodo', 'Medicamentos',         'shopping', 'health',        0.62, 1),
    ('fb-03', 1792370100000, '2026-10-18', 'tx-1011', 'ai',    'rules',   NULL,        'Concierto',            'other',    'entertainment', 0.40, 0),
    ('fb-04', 1792599000000, '2026-10-21', 'tx-1013', 'ai',    'rules',   'Avianca',   'Tiquetes a Cartagena', 'transport','travel',        0.55, 0);
