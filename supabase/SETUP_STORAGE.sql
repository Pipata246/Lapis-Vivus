-- ============================================
-- БЫСТРАЯ НАСТРОЙКА STORAGE ДЛЯ ФАЙЛОВ
-- ============================================
-- Скопируй и выполни в Supabase Dashboard → SQL Editor
-- После создания bucket 'user-files' в Storage

-- 1. Включаем Row Level Security для storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 2. Политика: service_role может делать всё (для бэкенда)
DROP POLICY IF EXISTS "Service role full access" ON storage.objects;
CREATE POLICY "Service role full access"
ON storage.objects
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. Политика: публичный доступ на чтение для bucket user-files
DROP POLICY IF EXISTS "Public read user-files" ON storage.objects;
CREATE POLICY "Public read user-files"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'user-files');

-- 4. Проверка: должно вернуть 2 политики
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'objects'
  AND schemaname = 'storage'
ORDER BY policyname;

-- ============================================
-- ГОТОВО! Теперь:
-- 1. Bucket 'user-files' создан (Public: ✅)
-- 2. Политики настроены
-- 3. Можно деплоить бота
-- ============================================
