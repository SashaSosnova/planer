# Planer

Личный трекер похудения: вес, обмеры, шаги и питание из текстового ввода.

## Стек

- React + Vite + TypeScript
- Capacitor (Android)
- Firebase Auth (anonymous → email/password) + Firestore
- DeepSeek `deepseek-v4-flash` для разбора еды и рецептов

## Логика еды

1. **Мои продукты** — ваш справочник с КБЖУ на 100 г.
2. Текст вроде `хлеб 20 гр, форель слабосоленая 10 гр` сопоставляется с библиотекой.
3. Неизвестные/кафе-блюда оцениваются приблизительно (DeepSeek или локальный fallback).
4. Перед сохранением можно поправить граммы и добавить оценку в справочник.

Данные в Firestore: `planer/{uid}/…` (еда, вес, шаги, обмеры, дневник, цикл) и `planer/{uid}/meta/settings` (профиль, цель, вкусы).

По умолчанию — анонимный uid на устройстве. В **Профиле → Аккаунт** можно создать email/пароль (данные остаются на том же uid) или войти в существующий аккаунт на другом телефоне.

В Firebase Console включите **Authentication → Email/Password**.

Без Firebase приложение работает в **локальном режиме** (localStorage + локальный парсер).

## Быстрый старт

```bash
npm install
cp .env.example .env   # заполнить Firebase
npm run dev
```

### DeepSeek (разбор еды и рецептов)

В `.env`:

```
VITE_DEEPSEEK_API_KEY=sk-...
```

Модель: `deepseek-v4-flash`. Перезапустите `npm run dev` после изменения `.env`.

### Cloud Function (опционально)

```bash
cd functions && npm install && cd ..
firebase login
firebase deploy --only functions,firestore:rules
```

В клиенте регион Functions по умолчанию — `europe-west1`.

### Android

```bash
npm run build
npx cap add android   # один раз
npm run cap:sync
```

APK в CI — по желанию, как в соседнем проекте Sheduler.
