# Дневник привычек - Telegram Mini App

Telegram Mini App для формирования привычек с поддержкой "Плана Б".

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Локальный запуск

```bash
npm run dev
```

Приложение откроется на `http://localhost:3000`

### 3. Сборка для продакшена

```bash
npm run build
```

Готовые файлы будут в папке `dist/`

## Развёртывание на Vercel

### Шаг 1: Подготовка

1. Создайте аккаунт на [Vercel](https://vercel.com)
2. Установите Vercel CLI:
   ```bash
   npm install -g vercel
   ```

### Шаг 2: Деплой

```bash
# Войдите в аккаунт
vercel login

# Задеплойте проект
vercel

# Для продакшн-деплоя
vercel --prod
```

### Шаг 3: Обновите URL в @BotFather

1. Откройте Telegram, найдите @BotFather
2. Отправьте `/myapps`
3. Выберите ваше приложение
4. Выберите "Edit Web App URL"
5. Вставьте URL от Vercel (например, `https://your-app.vercel.app`)

## Структура проекта

```
дневник привычек/
├── src/
│   ├── styles/          # CSS-модули
│   │   ├── tokens.css   # Дизайн-токены
│   │   ├── base.css     # Базовые стили
│   │   ├── layout.css   # Layout
│   │   └── components.css # Компоненты
│   ├── types.ts         # TypeScript типы
│   ├── constants.ts     # Константы
│   ├── utils.ts         # Утилиты
│   ├── date.ts          # Работа с датами
│   ├── telegram.ts      # Telegram WebApp SDK
│   ├── storage.ts       # LocalStorage + State
│   └── main.ts          # Главный файл
├── index.html           # HTML-шаблон
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Текущие возможности

- ✅ Добавление привычек
- ✅ Отметка выполнения (Норма / План Б / Пропуск)
- ✅ Сохранение в localStorage
- ✅ Интеграция с Telegram WebApp
- ✅ Адаптивная вёрстка
- ✅ Темная тема

## В разработке

- 🚧 Страницы "Ритуалы", "Анализ", "Мастерство"
- 🚧 Свайп-жесты для чек-инов
- 🚧 Расчет стриков
- 🚧 Статистика и аналитика
- 🚧 Синхронизация через бэкенд

## Технологии

- **Frontend**: TypeScript, Vite, нативный CSS
- **Хранение**: localStorage + Telegram CloudStorage
- **Деплой**: Vercel (бесплатно, работает из РФ)

## Лицензия

Частный проект
