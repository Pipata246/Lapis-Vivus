# Lapis Vivus — Python Compute Service (Human Design / блок 1A)

HTTP API для детерминированных расчётов на VPS. Vercel вызывает его перед GPTunnel.

## Быстрый тест локально (Windows)

```powershell
cd compute-service
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Заполните COMPUTE_API_SECRET в .env

$env:PYTHONPATH = "."
uvicorn app.main:app --host 127.0.0.1 --port 8080 --reload
```

Проверка:

```powershell
curl http://127.0.0.1:8080/health
```

---

## Деплой на Beget VPS (пошагово)

### 1. Подготовка VPS

1. Купите VPS (рекомендуется: **1 ядро, 2 ГБ RAM, 15 ГБ NVMe**, локация **Латвия** если Vercel в EU).
2. ОС: **Ubuntu 22.04** или **24.04**.
3. Подключитесь по SSH:

```bash
ssh root@ВАШ_IP
```

### 2. Установка зависимостей

```bash
apt update && apt upgrade -y
apt install -y python3 python3-venv python3-pip nginx curl git
```

### 3. Загрузка проекта на сервер

**Вариант A — через git (если репозиторий на GitHub):**

```bash
mkdir -p /opt/lapis-compute
cd /opt/lapis-compute
git clone https://github.com/ВАШ_АККАУНТ/Lapis-Vivus-main.git .
# или только compute-service:
# git sparse-checkout ...
```

**Вариант B — через SFTP / FileZilla:**

Скопируйте папку `compute-service/` целиком в `/opt/lapis-compute/` на сервере.

Структура на сервере:

```
/opt/lapis-compute/
  app/
  scripts/
  deploy/
  requirements.txt
  .env
  venv/
  ephe/
```

### 4. Python-окружение

```bash
cd /opt/lapis-compute
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 5. Эфемериды Swiss Ephemeris

```bash
chmod +x scripts/download_ephe.sh
./scripts/download_ephe.sh /opt/lapis-compute/ephe
```

### 6. Секреты и конфиг

```bash
cp .env.example .env
nano .env
```

Заполните:

```env
COMPUTE_API_SECRET=длинный_случайный_секрет_32_символа
COMPUTE_PORT=8080
SWISSEPH_PATH=/opt/lapis-compute/ephe
```

Сгенерировать секрет:

```bash
openssl rand -hex 32
```

**Этот же секрет** добавьте на Vercel в `COMPUTE_API_SECRET`.

### 7. Проверка вручную

```bash
cd /opt/lapis-compute
source venv/bin/activate
export PYTHONPATH=/opt/lapis-compute
uvicorn app.main:app --host 127.0.0.1 --port 8080
```

В другом терминале:

```bash
curl http://127.0.0.1:8080/health

curl -X POST http://127.0.0.1:8080/v1/compute/human-design \
  -H "Authorization: Bearer ВАШ_СЕКРЕТ" \
  -H "Content-Type: application/json" \
  -d '{"block_id":"1A","birth_date":"25.02.1991","birth_time":"18:10","birth_place":"Пенза"}'
```

Должен вернуться JSON с `type`, `profile`, `centers`, `ch` и т.д.

### 8. Systemd — автозапуск без перебоев

```bash
cp /opt/lapis-compute/deploy/lapis-compute.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable lapis-compute
systemctl start lapis-compute
systemctl status lapis-compute
```

Логи:

```bash
journalctl -u lapis-compute -f
```

Перезапуск после обновления кода:

```bash
systemctl restart lapis-compute
```

### 9. Nginx + HTTPS (доступ с Vercel)

```bash
cp /opt/lapis-compute/deploy/nginx.conf /etc/nginx/sites-available/lapis-compute
ln -sf /etc/nginx/sites-available/lapis-compute /etc/nginx/sites-enabled/
nano /etc/nginx/sites-available/lapis-compute
# Замените calc.yourdomain.ru на ваш поддомен

nginx -t && systemctl reload nginx
```

SSL (Let's Encrypt):

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d calc.yourdomain.ru
```

### 10. Подключение Vercel

В **Vercel → Settings → Environment Variables** добавьте:

| Переменная | Значение |
|------------|----------|
| `COMPUTE_API_URL` | `https://calc.yourdomain.ru` |
| `COMPUTE_API_SECRET` | тот же секрет, что в `.env` на VPS |

Сделайте **Redeploy** проекта на Vercel.

---

## Как это работает в боте

1. Пользователь проходит анкету (дата, время, место).
2. На **блоке 1A** Vercel вызывает `POST /v1/compute/human-design` на VPS.
3. Python считает бодиграф (ваш `hello1.py`).
4. Результат передаётся в GPTunnel в поле `precomputed`.
5. ИИ **только интерпретирует** — не пересчитывает ворота/тип/профиль.

---

## Мониторинг и стабильность

| Задача | Команда |
|--------|---------|
| Статус сервиса | `systemctl status lapis-compute` |
| Логи ошибок | `journalctl -u lapis-compute -n 100 --no-pager` |
| Health-check | `curl https://calc.yourdomain.ru/health` |
| Перезапуск | `systemctl restart lapis-compute` |

**Restart=always** в systemd — сервис поднимется после падения или перезагрузки VPS.

Рекомендуется настроить внешний uptime-monitor (UptimeRobot, бесплатно) на URL `/health` — пинг каждые 5 минут.

---

## Обновление кода на VPS

```bash
cd /opt/lapis-compute
# git pull  OR  загрузите новые файлы через SFTP
source venv/bin/activate
pip install -r requirements.txt
systemctl restart lapis-compute
```

---

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| `Compute-сервис не настроен` на Vercel | Проверьте `COMPUTE_API_URL` и `COMPUTE_API_SECRET`, redeploy |
| 401/403 | Секрет на Vercel ≠ секрет на VPS |
| 422 «город не найден» | Уточните название места рождения в анкете |
| 422 «нужно точное время» | Блок 1A требует HH:MM, не «неизвестно» |
| Таймаут 45 сек | Проверьте firewall VPS (открыт 443), nginx, `systemctl status` |
| Ошибка ephemeris | Запустите `scripts/download_ephe.sh` |
