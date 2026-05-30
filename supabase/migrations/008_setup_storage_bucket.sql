-- Migration: 008_setup_storage_bucket
-- Description: Создание bucket для файлов пользователей и настройка политик доступа
-- Применение: Supabase Dashboard → SQL Editor → выполнить после 007_update_block_ids_v26.sql

-- Создаём bucket если не существует (через SQL это делается вручную в Dashboard)
-- Но настроим политики доступа

-- Включаем RLS для storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Политика: service_role может делать всё
CREATE POLICY IF NOT EXISTS "Service role can do everything"
ON storage.objects
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Политика: публичный доступ на чтение для bucket user-files
CREATE POLICY IF NOT EXISTS "Public read access for user-files"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'user-files');

-- Комментарий
COMMENT ON TABLE storage.objects IS 'Файлы пользователей для анализа (изображения, PDF, DOCX)';

-- ВАЖНО: Bucket 'user-files' нужно создать вручную в Supabase Dashboard:
-- 1. Storage → Create bucket
-- 2. Name: user-files
-- 3. Public: true
-- 4. File size limit: 20971520 (20 MB)
-- 
-- Или запустить скрипт: npm run storage:init
